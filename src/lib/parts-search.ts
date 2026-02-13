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
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private apiBase = 'https://api.digikey.com';

  constructor() {
    this.clientId = process.env.DIGIKEY_CLIENT_ID || '';
    this.clientSecret = process.env.DIGIKEY_CLIENT_SECRET || '';
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
      throw new Error(`DigiKey auth failed: ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry with 5 minute buffer
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

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

      const response = await fetch(
        `${this.apiBase}/Products/v3/Search/Keyword?Keyword=${encodeURIComponent(keyword)}&limit=${params.limit || 10}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Digikey-Client-Id': this.clientId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('DigiKey search error:', error);
        return [];
      }

      const data = await response.json();
      const products = data.Products || [];

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

      const queryParams = new URLSearchParams({
        search: searchTerm,
        limit: String(params.limit || 20),
        full: 'true',
      });

      // Add package/footprint filter if provided
      if (params.footprint) {
        // Normalize footprint (e.g., "0402 (1005 Metric)" -> "0402")
        const normalizedFootprint = this.normalizeFootprint(params.footprint);
        if (normalizedFootprint) {
          queryParams.set('package', normalizedFootprint);
        }
      }

      const response = await fetch(
        `${this.jlcSearchBase}/components/list.json?${queryParams.toString()}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('JLCSearch API error:', response.status, error);
        return [];
      }

      const data = await response.json();
      const components = data.components || [];

      // Filter and sort results
      const results = components
        .map((comp: any) => this.parseComponent(comp, params))
        .filter((r: PartSearchResult) => r.partNumber || r.lcscPart);

      // Sort by stock (descending) then price (ascending)
      results.sort((a: PartSearchResult, b: PartSearchResult) => {
        if (b.stock !== a.stock) return b.stock - a.stock;
        return a.price - b.price;
      });

      return results.slice(0, params.limit || 10);
    } catch (error) {
      console.error('JLCPCB search error:', error);
      return [];
    }
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

    // Extract price
    let price = 0;
    const priceValue = comp.price || comp.unit_price;
    if (priceValue) {
      const parsed = parseFloat(String(priceValue).replace(/,/g, ''));
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }

    // Extract manufacturer
    const manufacturer = comp.mfr || comp.manufacturer || comp.Manufacturer || '';

    // Extract description
    const description = comp.description || comp.Description || '';

    // Extract package/footprint
    const pkg = comp.package || comp.Package || comp.footprint || '';

    return {
      supplier: 'JLCPCB',
      partNumber: comp.mfrPartNo || comp.manufacturer_part_number || '',
      manufacturer,
      manufacturerPartNumber: comp.mfrPartNo || comp.manufacturer_part_number || '',
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

      const response = await fetch(
        `${this.apiBase}/product/search?apiKey=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            SearchByKeywordRequest: {
              keyword,
              records: params.limit || 10,
              searchOptions: '',
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Mouser search error:', error);
        return [];
      }

      const data = await response.json();
      const parts = data.SearchResults?.Parts || [];

      return parts.map((part: any) => this.parsePart(part, params));
    } catch (error) {
      console.error('Mouser search error:', error);
      return [];
    }
  }

  private parsePart(part: any, params: SearchParams): PartSearchResult {
    // Extract stock
    let stock = 0;
    const availability = part.Availability || '';
    const stockMatch = availability.match(/(\d+)/);
    if (stockMatch) {
      stock = parseInt(stockMatch[1]);
    }

    // Extract price
    let price = 0;
    const priceBreaks = part.PriceBreaks || [];
    if (priceBreaks.length > 0) {
      price = parseFloat(priceBreaks[0].Price?.replace(/,/g, '') || '0');
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
