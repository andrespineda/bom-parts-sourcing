import { NextRequest, NextResponse } from 'next/server';
import { 
  searchAllSuppliers, 
  getConfigurationStatus, 
  jlcpcbClient, 
  digiKeyClient, 
  mouserClient,
  type SearchParams 
} from '@/lib/parts-search';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const params: SearchParams = {
    value: searchParams.get('value') || undefined,
    footprint: searchParams.get('footprint') || undefined,
    componentType: searchParams.get('componentType') || undefined,
    manufacturer: searchParams.get('manufacturer') || undefined,
    manufacturerPartNumber: searchParams.get('manufacturerPartNumber') || undefined,
    limit: parseInt(searchParams.get('limit') || '10'),
  };

  // Get which suppliers to search
  const suppliers = searchParams.get('suppliers')?.split(',').map(s => s.trim().toLowerCase()) || ['jlcpcb', 'digikey', 'mouser'];

  const results: Record<string, any[]> = {};

  try {
    // Run searches in parallel for selected suppliers
    const searchPromises: Promise<void>[] = [];

    if (suppliers.includes('jlcpcb')) {
      searchPromises.push(
        jlcpcbClient.search(params).then(r => { if (r.length > 0) results['JLCPCB'] = r; })
      );
    }

    if (suppliers.includes('digikey')) {
      searchPromises.push(
        digiKeyClient.search(params).then(r => { if (r.length > 0) results['Digi-Key'] = r; })
      );
    }

    if (suppliers.includes('mouser')) {
      searchPromises.push(
        mouserClient.search(params).then(r => { if (r.length > 0) results['Mouser'] = r; })
      );
    }

    await Promise.all(searchPromises);

    return NextResponse.json({
      success: true,
      query: params,
      results,
      configured: getConfigurationStatus(),
    });
  } catch (error) {
    console.error('Parts search error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        configured: getConfigurationStatus(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const params: SearchParams = {
      value: body.value,
      footprint: body.footprint,
      componentType: body.componentType,
      manufacturer: body.manufacturer,
      manufacturerPartNumber: body.manufacturerPartNumber,
      limit: body.limit || 10,
    };

    // Get which suppliers to search
    const suppliers = body.suppliers || ['jlcpcb', 'digikey', 'mouser'];

    const results: Record<string, any[]> = {};

    // Run searches in parallel for selected suppliers
    const searchPromises: Promise<void>[] = [];

    if (suppliers.includes('jlcpcb') || suppliers.includes('JLCPCB')) {
      searchPromises.push(
        jlcpcbClient.search(params).then(r => { if (r.length > 0) results['JLCPCB'] = r; })
      );
    }

    if (suppliers.includes('digikey') || suppliers.includes('Digi-Key')) {
      searchPromises.push(
        digiKeyClient.search(params).then(r => { if (r.length > 0) results['Digi-Key'] = r; })
      );
    }

    if (suppliers.includes('mouser') || suppliers.includes('Mouser')) {
      searchPromises.push(
        mouserClient.search(params).then(r => { if (r.length > 0) results['Mouser'] = r; })
      );
    }

    await Promise.all(searchPromises);

    return NextResponse.json({
      success: true,
      query: params,
      results,
      configured: getConfigurationStatus(),
    });
  } catch (error) {
    console.error('Parts search error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        configured: getConfigurationStatus(),
      },
      { status: 500 }
    );
  }
}
