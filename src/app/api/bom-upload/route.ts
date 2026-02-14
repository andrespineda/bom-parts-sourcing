/**
 * BOM Upload API Endpoint
 * Handles CSV upload, part searching, and sourcing
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllSuppliers, PartSearchResult, getConfigurationStatus } from '@/lib/parts-search';

// BOM row interface
interface BOMRow {
  Reference: string;
  Value: string;
  Datasheet: string;
  Description: string;
  Manufacturer_Name: string;
  'LCSC Part #': string;
  'JLCPCB Part #': string;
  Manufacturer_Part_Number: string;
  Footprint: string;
  Qty: string;
  DNP: string;
  'Exclude from Board': string;
  'CASE CODE (METRIC)': string;
  '#': string;
  'Exclude from BOM': string;
  [key: string]: string; // Allow additional columns
}

// Sourcing result for a single BOM line
interface SourcingResult {
  originalRow: BOMRow;
  matchedPart: PartSearchResult | null;
  searchResults: {
    JLCPCB: PartSearchResult[];
    'Digi-Key': PartSearchResult[];
    Mouser: PartSearchResult[];
  };
  status: 'matched' | 'not_found' | 'skipped' | 'already_sourced';
  notes: string;
}

// Parse CSV string to array of objects
function parseCSV(csvText: string): BOMRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows: BOMRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: BOMRow = {} as BOMRow;
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

// Parse a single CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// Extract footprint from Footprint field or CASE CODE
function extractFootprint(row: BOMRow): string {
  // First try the Footprint field
  if (row.Footprint) {
    // Extract metric code from footprint like "apollo4_SE:SMT_0201_0603Metric"
    const metricMatch = row.Footprint.match(/(\d{4})Metric/i);
    if (metricMatch) return metricMatch[1];

    // Extract common patterns
    const sizeMatch = row.Footprint.match(/\b(\d{4})\b/);
    if (sizeMatch) return sizeMatch[1];
  }

  // Fall back to CASE CODE
  if (row['CASE CODE (METRIC)']) {
    return row['CASE CODE (METRIC)'];
  }

  return '';
}

// Determine component type from value
function inferComponentType(value: string, reference: string): string {
  const ref = reference.toUpperCase();
  const val = value.toUpperCase();

  // From reference designator
  if (ref.startsWith('C')) return 'capacitor';
  if (ref.startsWith('R')) return 'resistor';
  if (ref.startsWith('L')) return 'inductor';
  if (ref.startsWith('LED')) return 'led';
  if (ref.startsWith('D')) return 'diode';
  if (ref.startsWith('U')) return 'ic';
  if (ref.startsWith('Y') || ref.startsWith('X')) return 'crystal';
  if (ref.startsWith('S')) return 'switch';
  if (ref.startsWith('J')) return 'connector';
  if (ref.startsWith('MIC')) return 'microphone';

  // From value pattern
  if (/^[0-9.]+[PNµUF]/i.test(val) || /FARAD/i.test(val)) return 'capacitor';
  if (/^[0-9.]+[KMR]/i.test(val) || /OHM/i.test(val)) return 'resistor';
  if (/^[0-9.]+[NH]/i.test(val) && /H$/i.test(val)) return 'inductor';

  return '';
}

// Calculate quantity from reference
function calculateQty(row: BOMRow): number {
  if (row.Qty && parseInt(row.Qty) > 0) {
    return parseInt(row.Qty);
  }

  // Count from reference (C1,C2,C3 = 3)
  if (row.Reference) {
    const refs = row.Reference.split(',');
    return refs.filter(r => r.trim()).length;
  }

  return 1;
}

// Priority scoring for JLCPCB parts
function scoreJLCPCBPart(part: PartSearchResult): number {
  let score = 0;

  // In stock is critical (1000 points)
  if (part.stock > 0) score += 1000;

  // Higher stock is better (up to 100 points)
  score += Math.min(part.stock / 100000, 100);

  // Lower price is better (up to 50 points)
  if (part.price > 0) {
    score += Math.max(0, 50 - part.price * 10);
  }

  // Has LCSC part number (50 points)
  if (part.lcscPart) score += 50;

  return score;
}

// Priority scoring for DigiKey/Mouser parts
function scoreDistributorPart(part: PartSearchResult): number {
  let score = 0;

  // In stock is critical (1000 points)
  if (part.stock > 0) score += 1000;

  // Higher stock is better (up to 100 points)
  score += Math.min(part.stock / 100000, 100);

  // Lower price is better (up to 50 points)
  if (part.price > 0) {
    score += Math.max(0, 50 - part.price * 10);
  }

  // Has datasheet (20 points)
  if (part.datasheet) score += 20;

  return score;
}

// Select best part from results
function selectBestPart(
  jlcpcbResults: PartSearchResult[],
  digikeyResults: PartSearchResult[],
  mouserResults: PartSearchResult[]
): { part: PartSearchResult | null; notes: string } {
  // Prioritize JLCPCB (China-based, no import needed)
  if (jlcpcbResults.length > 0) {
    const scored = jlcpcbResults
      .map(p => ({ part: p, score: scoreJLCPCBPart(p) }))
      .sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      const best = scored[0].part;
      return {
        part: best,
        notes: `Matched via JLCPCB (LCSC: ${best.lcscPart}, Stock: ${best.stock.toLocaleString()})`
      };
    }
  }

  // Then try DigiKey
  if (digikeyResults.length > 0) {
    const scored = digikeyResults
      .map(p => ({ part: p, score: scoreDistributorPart(p) }))
      .sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      const best = scored[0].part;
      return {
        part: best,
        notes: `Matched via Digi-Key (${best.partNumber}, Stock: ${best.stock.toLocaleString()})`
      };
    }
  }

  // Then try Mouser
  if (mouserResults.length > 0) {
    const scored = mouserResults
      .map(p => ({ part: p, score: scoreDistributorPart(p) }))
      .sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      const best = scored[0].part;
      return {
        part: best,
        notes: `Matched via Mouser (${best.partNumber}, Stock: ${best.stock.toLocaleString()})`
      };
    }
  }

  return { part: null, notes: 'No matches found' };
}

// Process a single BOM row
async function processBOMRow(row: BOMRow): Promise<SourcingResult> {
  const qty = calculateQty(row);

  // Skip if excluded from BOM
  if (row['Exclude from BOM']?.toLowerCase() === 'yes' ||
      row['Exclude from BOM']?.toLowerCase() === 'true' ||
      row['Exclude from BOM']?.toLowerCase() === 'excluded from bom') {
    return {
      originalRow: row,
      matchedPart: null,
      searchResults: { JLCPCB: [], 'Digi-Key': [], Mouser: [] },
      status: 'skipped',
      notes: 'Excluded from BOM'
    };
  }

  // Skip if DNP (Do Not Populate)
  if (row.DNP?.toLowerCase() === 'yes' ||
      row.DNP?.toLowerCase() === 'true' ||
      row.Manufacturer_Part_Number?.toUpperCase() === 'DNP') {
    return {
      originalRow: row,
      matchedPart: null,
      searchResults: { JLCPCB: [], 'Digi-Key': [], Mouser: [] },
      status: 'skipped',
      notes: 'DNP (Do Not Populate)'
    };
  }

  // Check if already sourced (has LCSC part number)
  if (row['LCSC Part #']?.trim() || row['JLCPCB Part #']?.trim()) {
    return {
      originalRow: row,
      matchedPart: null,
      searchResults: { JLCPCB: [], 'Digi-Key': [], Mouser: [] },
      status: 'already_sourced',
      notes: 'Already has LCSC/JLCPCB part number'
    };
  }

  // Get search parameters
  const value = row.Value?.trim() || '';
  const footprint = extractFootprint(row);
  const componentType = inferComponentType(value, row.Reference);
  const manufacturerPartNumber = row.Manufacturer_Part_Number?.trim() || '';

  // Skip if no value to search
  if (!value && !manufacturerPartNumber) {
    return {
      originalRow: row,
      matchedPart: null,
      searchResults: { JLCPCB: [], 'Digi-Key': [], Mouser: [] },
      status: 'not_found',
      notes: 'No value or part number to search'
    };
  }

  console.log(`[BOM] Searching for: ${value} (${componentType}, ${footprint})`);

  // Search all suppliers
  const searchResults = await searchAllSuppliers({
    value,
    footprint,
    componentType,
    manufacturerPartNumber,
    limit: 10
  });

  const jlcpcbResults = searchResults['JLCPCB'] || [];
  const digikeyResults = searchResults['Digi-Key'] || [];
  const mouserResults = searchResults['Mouser'] || [];

  // Select best part
  const { part, notes } = selectBestPart(jlcpcbResults, digikeyResults, mouserResults);

  return {
    originalRow: row,
    matchedPart: part,
    searchResults: {
      JLCPCB: jlcpcbResults,
      'Digi-Key': digikeyResults,
      Mouser: mouserResults
    },
    status: part ? 'matched' : 'not_found',
    notes
  };
}

// Merge sourced data into BOM row
function mergeSourcedData(row: BOMRow, result: SourcingResult): BOMRow {
  if (!result.matchedPart) return row;

  const part = result.matchedPart;
  const updatedRow = { ...row };

  // Fill in LCSC Part # and JLCPCB Part # (same value)
  if (part.lcscPart) {
    updatedRow['LCSC Part #'] = part.lcscPart;
    updatedRow['JLCPCB Part #'] = part.lcscPart;
  }

  // Fill in Manufacturer Part Number
  if (part.manufacturerPartNumber && !updatedRow.Manufacturer_Part_Number) {
    updatedRow.Manufacturer_Part_Number = part.manufacturerPartNumber;
  }

  // Fill in Manufacturer Name
  if (part.manufacturer && !updatedRow.Manufacturer_Name) {
    updatedRow.Manufacturer_Name = part.manufacturer;
  }

  // Fill in Datasheet
  if (part.datasheet && !updatedRow.Datasheet) {
    updatedRow.Datasheet = part.datasheet;
  }

  // Fill in Description from supplier
  if (part.description && !updatedRow.Description) {
    updatedRow.Description = part.description;
  }

  // Fill in footprint if missing
  if (part.package && !updatedRow['CASE CODE (METRIC)']) {
    updatedRow['CASE CODE (METRIC)'] = part.package;
  }

  return updatedRow;
}

// Convert BOM rows to CSV
function toCSV(rows: BOMRow[]): string {
  if (rows.length === 0) return '';

  // Get all headers from all rows
  const allHeaders = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => allHeaders.add(key));
  });

  const headers = Array.from(allHeaders);
  const lines: string[] = [];

  // Header line
  lines.push(headers.map(h => `"${h}"`).join(','));

  // Data lines
  rows.forEach(row => {
    const values = headers.map(h => {
      const value = row[h] || '';
      // Escape quotes and wrap in quotes
      return `"${value.replace(/"/g, '""')}"`;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();
    const bomRows = parseCSV(csvText);

    if (bomRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not parse BOM file or file is empty' },
        { status: 400 }
      );
    }

    console.log(`[BOM] Processing ${bomRows.length} rows`);

    // Get configuration status
    const config = getConfigurationStatus();

    // Process each row
    const results: SourcingResult[] = [];
    const sourcedRows: BOMRow[] = [];

    for (const row of bomRows) {
      const result = await processBOMRow(row);
      results.push(result);

      // Merge sourced data into row
      if (result.status === 'matched' && result.matchedPart) {
        sourcedRows.push(mergeSourcedData(row, result));
      } else {
        sourcedRows.push(row);
      }
    }

    // Generate output CSV
    const outputCSV = toCSV(sourcedRows);

    // Generate output filename
    const originalName = file.name.replace(/\.csv$/i, '');
    const outputFilename = `${originalName}_sourced.csv`;

    // Calculate statistics
    const stats = {
      total: results.length,
      matched: results.filter(r => r.status === 'matched').length,
      notFound: results.filter(r => r.status === 'not_found').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      alreadySourced: results.filter(r => r.status === 'already_sourced').length
    };

    console.log(`[BOM] Complete: ${stats.matched}/${stats.total} matched`);

    return NextResponse.json({
      success: true,
      filename: outputFilename,
      stats,
      config,
      results: results.map(r => ({
        reference: r.originalRow.Reference,
        value: r.originalRow.Value,
        status: r.status,
        notes: r.notes,
        matchedPart: r.matchedPart ? {
          partNumber: r.matchedPart.partNumber,
          lcscPart: r.matchedPart.lcscPart,
          manufacturer: r.matchedPart.manufacturer,
          manufacturerPartNumber: r.matchedPart.manufacturerPartNumber,
          stock: r.matchedPart.stock,
          price: r.matchedPart.price
        } : null
      })),
      csv: outputCSV
    });
  } catch (error) {
    console.error('BOM upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
