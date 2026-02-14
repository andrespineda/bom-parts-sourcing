import { NextResponse } from 'next/server';
import { getConfigurationStatus } from '@/lib/parts-search';

// CORS headers for local file access (file://)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  const config = getConfigurationStatus();
  
  return NextResponse.json({
    suppliers: {
      jlcpcb: {
        name: 'JLCPCB',
        configured: config.jlcpcb,
        note: 'Uses free JLCSearch API - no configuration needed',
      },
      digikey: {
        name: 'Digi-Key',
        configured: config.digikey,
        note: 'Requires DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET environment variables',
      },
      mouser: {
        name: 'Mouser',
        configured: config.mouser,
        note: 'Requires MOUSER_API_KEY environment variable',
      },
    },
    instructions: {
      digikey: {
        steps: [
          '1. Go to https://developer.digikey.com/',
          '2. Create a Digi-Key API account',
          '3. Create a new Application',
          '4. Set the Redirect URI to: http://localhost:3000',
          '5. Copy the Client ID and Client Secret',
          '6. Add to your .env file:',
          '   DIGIKEY_CLIENT_ID=your_client_id',
          '   DIGIKEY_CLIENT_SECRET=your_client_secret',
        ],
      },
      mouser: {
        steps: [
          '1. Go to https://www.mouser.com/api/',
          '2. Request API access',
          '3. Copy your API key',
          '4. Add to your .env file:',
          '   MOUSER_API_KEY=your_api_key',
        ],
      },
    },
  }, { headers: corsHeaders });
}
