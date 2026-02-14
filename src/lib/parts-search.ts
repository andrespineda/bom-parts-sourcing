/**
 * Parts Search Library
 * Server-side integration for DigiKey, JLCPCB, and Mouser APIs
 */

// Types
export interface PartSearchResult {
  supplier: string;
  partNumber: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  description: string;
  value: string;
  footprint: string;
  stock: number;
  price: number;
  currency: string;
  url: string;
  datasheet: string;
  lcscPart?: string;
  image?: string;
  package?: string;
  specifications?: Record<string, string>;
}

export interface SearchParams {
  value?: string;
  footprint?: string;
  componentType?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  limit?: number;
}

// DigiKey API Client
class DigiKeyClient {
  private clientId: string;
  private clientSecret: string;
  private sandbox: boolean;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private apiBase: string;

  constructor() {
    this.clientId = process.env.DIGIKEY_CLIENT_ID || '';
    this.clientSecret = process.env.DIGIKEY_CLIENT_SECRET || '';
    // Check if using sandbox (set DIGIKEY_SANDBOX=true for sandbox mode)
    this.sandbox = process.env.DIGIKEY_SANDBOX === 'true';
    this.apiBase = this.sandbox ? 'https://sandbox-api.digikey.com' : 'https://api.digikey.com';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new Error('DigiKey API credentials not configured');
    }

    console.log('[DigiKey] Getting new access token (sandbox:', this.sandbox, ')');

    const response = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[DigiKey] Auth failed:', error);
      throw new Error(`DigiKey auth failed: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry with 5 minute buffer
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    console.log('[DigiKey] Token obtained successfully');
    return this.accessToken!;
  }

  async search(params: SearchParams): Promise<PartSearchResult[]> {
    if (!this.isConfigured()) {
      console.log('DigiKey not configured, skipping');
      return [];
    }

    try {
      const token = await this.getAccessToken();
      
      // Build search keyword
      let keyword = params.value || '';
      if (params.footprint) {
        keyword += ` ${params.footprint}`;
      }
      if (params.componentType) {
        keyword = `${params.componentType} ${keyword}`;
      }
      if (params.manufacturerPartNumber) {
        keyword = params.manufacturerPartNumber;
      }

      keyword = keyword.trim();
      if (!keyword) {
        return [];
      }

      console.log('[DigiKey] Searching for:', keyword);
      console.log('[DigiKey] Client ID:', this.clientId ? `${this.clientId.substring(0, 8)}...` : 'NOT SET');

      const url = `${this.apiBase}/Products/v3/Search/Keyword?Keyword=${encodeURIComponent(keyword)}&limit=${params.limit || 10}`;
      console.log('[DigiKey] URL:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Digikey-Client-Id': this.clientId,
          'Content-Type': 'application/json',
        },
      });

      console.log('[DigiKey] Response status:', response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error('DigiKey search error:', error);
        return [];
      }

      const data = await response.json();
      const products = data.Products || [];
      console.log('[DigiKey] Found', products.length, 'products');

      return products.map((product: any) => this.parseProduct(product, params));
    } catch (error) {
      console.error('DigiKey search error:', error);
      return [];
    }
  }

  private parseProduct(product: any, params: SearchParams): PartSearchResult {
    const pricing = product.StandardPricing || [];
    const unitPrice = pricing.length > 0 ? pricing[0].UnitPrice : 0;

    return {
      supplier: 'Digi-Key',
      partNumber: product.DigiKeyPartNumber || '',
      manufacturer: product.Manufacturer?.Name || '',
      manufacturerPartNumber: product.ManufacturerPartNumber || '',
      description: product.DetailedDescription || product.ProductDescription || '',
      value: params.value || '',
      footprint: params.footprint || '',
      stock: product.QuantityAvailable || 0,
      price: unitPrice,
      currency: 'USD',
      url: product.ProductUrl || `https://www.digikey.com/product-detail/en/${product.DigiKeyPartNumber}`,
      datasheet: product.PrimaryDatasheet || '',
      package: product.Parameters?.find((p: any) => p.Parameter === 'Package / Case')?.Value || '',
      image: product.PrimaryPhoto || '',
      specifications: this.extractSpecifications(product.Parameters),
    };
  }

  private extractSpecifications(parameters: any[]): Record<string, string> {
    const specs: Record<string, string> = {};
    if (parameters && Array.isArray(parameters)) {
      for (const param of parameters) {
        if (param.Parameter && param.Value) {
          specs[param.Parameter] = param.Value;
        }
      }
    }
    return specs;
  }
}

// JLCPCB / JLCSearch API Client
class JLCPCBClient {
  private jlcSearchBase = 'https://jlcsearch.tscircuit.com';

  // Map component types to JLCSearch category endpoints
  private categoryEndpoints: Record<string, string> = {
    'resistor': 'resistors',
    'capacitor': 'capacitors',
    'inductor': 'inductors',
    'led': 'leds',
    'diode': 'diodes',
    'transistor': 'bjt_transistors',
    'mosfet': 'mosfets',
    'ic': 'microcontrollers',
    'microcontroller': 'microcontrollers',
    'voltage regulator': 'voltage_regulators',
    'ldo': 'ldos',
    'switch': 'switches',
    'relay': 'relays',
    'fuse': 'fuses',
    'connector': 'headers',
    'header': 'headers',
    'oled': 'oled_display',
    'lcd': 'lcd_display',
    'adc': 'adcs',
    'dac': 'dacs',
    'wifi': 'wifi_modules',
    'fpga': 'fpgas',
    'arm': 'arm_processors',
    'risc-v': 'risc_v_processors',
  };

  async search(params: SearchParams): Promise<PartSearchResult[]> {
    try {
      // Build search query
      let searchTerm = params.value || '';
      if (params.manufacturerPartNumber) {
        searchTerm = params.manufacturerPartNumber;
      }
      if (params.manufacturer && !params.manufacturerPartNumber) {
        searchTerm = `${params.manufacturer} ${searchTerm}`;
      }

      searchTerm = searchTerm.trim();
      if (!searchTerm) {
        return [];
      }

      console.log('[JLCPCB] Searching for:', searchTerm);
      console.log('[JLCPCB] Component type:', params.componentType);

      // Determine which category endpoint to use
      const componentType = (params.componentType || '').toLowerCase();
      const category = this.categoryEndpoints[componentType] || 'components';

      // Try category-specific endpoint first
      let results = await this.searchCategory(category, searchTerm, params);
      
      // If no results and using components fallback, try resistors/capacitors
      if (results.length === 0 && category === 'components') {
        // Try to infer category from search term
        if (this.looksLikeResistor(searchTerm)) {
          console.log('[JLCPCB] Trying resistors endpoint');
          results = await this.searchCategory('resistors', searchTerm, params);
        } else if (this.looksLikeCapacitor(searchTerm)) {
          console.log('[JLCPCB] Trying capacitors endpoint');
          results = await this.searchCategory('capacitors', searchTerm, params);
        }
      }

      console.log('[JLCPCB] Found', results.length, 'components');
      return results.slice(0, params.limit || 10);
    } catch (error) {
      console.error('JLCPCB search error:', error);
      return [];
    }
  }

  private looksLikeResistor(term: string): boolean {
    // Match patterns like 100K, 10K, 1K, 100R, 10R, 4.7K, etc.
    return /^[0-9.]+[KRkrR]/.test(term) || /ohm|resistor/i.test(term);
  }

  private looksLikeCapacitor(term: string): boolean {
    // Match patterns like 1uF, 100nF, 10pF, etc.
    return /^[0-9.]+[pnµu]F/i.test(term) || /capacitor|farad/i.test(term);
  }

  private async searchCategory(category: string, searchTerm: string, params: SearchParams): Promise<PartSearchResult[]> {
    const queryParams = new URLSearchParams({
      search: searchTerm,
      limit: String(params.limit || 20),
    });

    // Add package/footprint filter if provided
    if (params.footprint) {
      const normalizedFootprint = this.normalizeFootprint(params.footprint);
      if (normalizedFootprint) {
        queryParams.set('package', normalizedFootprint);
      }
    }

    const url = `${this.jlcSearchBase}/${category}/list.json?${queryParams.toString()}`;
    console.log('[JLCPCB] URL:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log('[JLCPCB] Response status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('JLCSearch API error:', response.status, error);
      return [];
    }

    const data = await response.json();
    
    // Handle different response formats
    let components = data.components || data[category] || data.resistors || data.capacitors || data.items || [];
    
    if (!Array.isArray(components)) {
      console.log('[JLCPCB] Unexpected response format:', Object.keys(data));
      return [];
    }

    // Filter and sort results
    const results = components
      .map((comp: any) => this.parseComponent(comp, params))
      .filter((r: PartSearchResult) => r.partNumber || r.lcscPart);

    // Sort by stock (descending) then price (ascending)
    results.sort((a: PartSearchResult, b: PartSearchResult) => {
      if (b.stock !== a.stock) return b.stock - a.stock;
      return a.price - b.price;
    });

    return results;
  }

  private normalizeFootprint(footprint: string): string {
    // Extract metric codes like 0402, 0603, 0805, etc.
    const metricMatch = footprint.match(/\b(\d{4})\b/);
    if (metricMatch) {
      return metricMatch[1];
    }

    // Common footprint mappings
    const footprintMap: Record<string, string> = {
      '0402': '0402',
      '0603': '0603',
      '0805': '0805',
      '1206': '1206',
      '1210': '1210',
      '2010': '2010',
      '2512': '2512',
    };

    for (const [key, value] of Object.entries(footprintMap)) {
      if (footprint.toLowerCase().includes(key)) {
        return value;
      }
    }

    return footprint;
  }

  private parseComponent(comp: any, params: SearchParams): PartSearchResult {
    // Extract LCSC part number
    let lcscPart = '';
    if (comp.lcsc) {
      lcscPart = String(comp.lcsc).startsWith('C') ? String(comp.lcsc) : `C${comp.lcsc}`;
    } else if (comp.lcscCode) {
      lcscPart = comp.lcscCode;
    } else if (comp.lcsc_id) {
      lcscPart = `C${comp.lcsc_id}`;
    }

    // Extract stock
    let stock = 0;
    const stockValue = comp.stock || comp.stockQty || comp.quantity;
    if (stockValue) {
      const parsed = parseInt(String(stockValue).replace(/,/g, ''));
      if (!isNaN(parsed)) {
        stock = parsed;
      }
    }

    // Extract price - handle both 'price' and 'price1' formats
    let price = 0;
    const priceValue = comp.price || comp.price1 || comp.unit_price;
    if (priceValue) {
      const parsed = parseFloat(String(priceValue).replace(/,/g, ''));
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }

    // Extract manufacturer part number - handle different field names
    const mfrPartNo = comp.mfr || comp.mfrPartNo || comp.manufacturer_part_number || '';
    
    // Extract manufacturer
    const manufacturer = comp.manufacturer || comp.Manufacturer || '';

    // Extract description - build from available fields if not present
    let description = comp.description || comp.Description || '';
    if (!description) {
      // For resistors, build description from resistance and package
      if (comp.resistance !== undefined) {
        const resistance = comp.resistance;
        const tolerance = comp.tolerance_fraction ? `±${(comp.tolerance_fraction * 100).toFixed(1)}%` : '';
        description = `${resistance}Ω ${tolerance}`.trim();
      }
    }

    // Extract package/footprint
    const pkg = comp.package || comp.Package || comp.footprint || '';

    return {
      supplier: 'JLCPCB',
      partNumber: mfrPartNo,
      manufacturer,
      manufacturerPartNumber: mfrPartNo,
      description,
      value: params.value || '',
      footprint: pkg || params.footprint || '',
      stock,
      price,
      currency: 'USD',
      url: lcscPart ? `https://jlcpcb.com/partdetail/${lcscPart}` : 'https://jlcpcb.com/',
      datasheet: comp.datasheet || '',
      lcscPart,
      package: pkg,
      image: comp.image || '',
    };
  }
}

// Mouser API Client
class MouserClient {
  private apiKey: string;
  private apiBase = 'https://api.mouser.com/api/v1';

  constructor() {
    this.apiKey = process.env.MOUSER_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async search(params: SearchParams): Promise<PartSearchResult[]> {
    if (!this.isConfigured()) {
      console.log('Mouser not configured, skipping');
      return [];
    }

    try {
      // Build search keyword
      let keyword = params.value || '';
      if (params.footprint) {
        keyword += ` ${params.footprint}`;
      }
      if (params.componentType) {
        keyword = `${params.componentType} ${keyword}`;
      }
      if (params.manufacturerPartNumber) {
        keyword = params.manufacturerPartNumber;
      }

      keyword = keyword.trim();
      if (!keyword) {
        return [];
      }

      console.log('[Mouser] Searching for:', keyword);
      console.log('[Mouser] API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');

      // Mouser API uses /search/keyword endpoint (not /product/search)
      const response = await fetch(
        `${this.apiBase}/search/keyword?apiKey=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            SearchByKeywordRequest: {
              keyword: keyword,
              records: params.limit || 10,
              startingRecord: 0,
              searchOptions: '',
              searchWithYourSignUpLanguage: '',
            },
          }),
        }
      );

      console.log('[Mouser] Response status:', response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error('Mouser search error:', response.status, error);
        return [];
      }

      const data = await response.json();
      console.log('[Mouser] Response data:', JSON.stringify(data, null, 2).substring(0, 500));
      
      const parts = data.SearchResults?.Parts || [];
      console.log('[Mouser] Found', parts.length, 'parts');

      return parts.map((part: any) => this.parsePart(part, params));
    } catch (error) {
      console.error('Mouser search error:', error);
      return [];
    }
  }

  private parsePart(part: any, params: SearchParams): PartSearchResult {
    // Extract stock - try AvailabilityInStock first, then parse Availability string
    let stock = 0;
    if (part.AvailabilityInStock) {
      stock = parseInt(part.AvailabilityInStock) || 0;
    } else {
      const availability = part.Availability || '';
      const stockMatch = availability.match(/(\d+)/);
      if (stockMatch) {
        stock = parseInt(stockMatch[1]);
      }
    }

    // Extract price - handle "$2.05" format
    let price = 0;
    const priceBreaks = part.PriceBreaks || [];
    if (priceBreaks.length > 0) {
      const priceStr = priceBreaks[0].Price || '0';
      // Remove $ and commas, then parse
      const cleanPrice = priceStr.replace(/[$,]/g, '');
      price = parseFloat(cleanPrice) || 0;
    }

    return {
      supplier: 'Mouser',
      partNumber: part.MouserPartNumber || '',
      manufacturer: part.Manufacturer || '',
      manufacturerPartNumber: part.ManufacturerPartNumber || '',
      description: part.Description || '',
      value: params.value || '',
      footprint: params.footprint || '',
      stock,
      price,
      currency: 'USD',
      url: part.ProductDetailUrl || '',
      datasheet: part.DataSheetUrl || '',
      image: part.ImagePath || '',
    };
  }
}

// Export singleton instances
export const digiKeyClient = new DigiKeyClient();
export const jlcpcbClient = new JLCPCBClient();
export const mouserClient = new MouserClient();

// Combined search function
export async function searchAllSuppliers(params: SearchParams): Promise<Record<string, PartSearchResult[]>> {
  const results: Record<string, PartSearchResult[]> = {};

  // Run searches in parallel
  const [jlcpcbResults, digikeyResults, mouserResults] = await Promise.all([
    jlcpcbClient.search(params),
    digiKeyClient.search(params),
    mouserClient.search(params),
  ]);

  if (jlcpcbResults.length > 0) {
    results['JLCPCB'] = jlcpcbResults;
  }

  if (digikeyResults.length > 0) {
    results['Digi-Key'] = digikeyResults;
  }

  if (mouserResults.length > 0) {
    results['Mouser'] = mouserResults;
  }

  return results;
}

// Get configuration status
export function getConfigurationStatus(): Record<string, boolean> {
  return {
    jlcpcb: true, // JLCSearch is free, no config needed
    digikey: digiKeyClient.isConfigured(),
    mouser: mouserClient.isConfigured(),
  };
}
