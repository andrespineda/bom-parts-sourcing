# BOM Parts Sourcing API

A server-side interface for searching electronic components across **DigiKey**, **JLCPCB**, and **Mouser** APIs. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- **Multi-Supplier Search**: Search across DigiKey, JLCPCB, and Mouser simultaneously
- **JLCPCB Ready**: Uses free JLCSearch API - no API key needed (1.5M+ parts)
- **DigiKey OAuth**: Full OAuth2 integration with automatic token caching
- **Mouser API**: Ready for API key configuration
- **Real-Time Data**: Stock levels, pricing, and part specifications
- **Server-Side Proxy**: Fixes CORS issues - works from any browser
- **Secure**: API keys stored in environment variables, never exposed to client

## Quick Start

```bash
# Clone the repository
git clone https://github.com/andrespineda/bom-parts-sourcing.git
cd bom-parts-sourcing

# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the search interface.

## Configuration

### JLCPCB (No Configuration Needed)
JLCPCB uses the free JLCSearch API - works immediately without any API keys.

### DigiKey API Setup

1. Go to [developer.digikey.com](https://developer.digikey.com/)
2. Create a Digi-Key API account
3. Create a new Application
4. Set the Redirect URI to: `http://localhost:3000`
5. Copy the Client ID and Client Secret
6. Add to your `.env` file:

```env
DIGIKEY_CLIENT_ID=your_client_id
DIGIKEY_CLIENT_SECRET=your_client_secret
```

### Mouser API Setup

1. Go to [mouser.com/api](https://www.mouser.com/api/)
2. Request API access
3. Copy your API key
4. Add to your `.env` file:

```env
MOUSER_API_KEY=your_api_key
```

## API Endpoints

### Search Parts

```bash
# GET request
curl "http://localhost:3000/api/parts-search?value=100k&footprint=0402&suppliers=jlcpcb"

# POST request
curl -X POST http://localhost:3000/api/parts-search \
  -H "Content-Type: application/json" \
  -d '{"value": "1uF", "footprint": "0402", "suppliers": ["jlcpcb", "digikey"]}'
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | string | Component value (e.g., "100K", "1uF") |
| `footprint` | string | Package/footprint (e.g., "0402", "0603") |
| `componentType` | string | Type filter (resistor, capacitor, etc.) |
| `suppliers` | string[] | Suppliers to search: jlcpcb, digikey, mouser |
| `limit` | number | Max results per supplier (default: 10) |

### Check Configuration

```bash
curl http://localhost:3000/api/config
```

Returns the configuration status of each supplier API.

## Response Format

```json
{
  "success": true,
  "query": {
    "value": "100k",
    "footprint": "0402",
    "limit": 10
  },
  "results": {
    "JLCPCB": [
      {
        "supplier": "JLCPCB",
        "partNumber": "RC0402FR-07100KL",
        "manufacturer": "YAGEO",
        "description": "100K Ohm Resistor",
        "footprint": "0402",
        "stock": 2068667,
        "price": 0.001,
        "currency": "USD",
        "url": "https://jlcpcb.com/partdetail/C60491",
        "lcscPart": "C60491"
      }
    ]
  },
  "configured": {
    "jlcpcb": true,
    "digikey": false,
    "mouser": false
  }
}
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── parts-search/route.ts  # Parts search API endpoint
│   │   └── config/route.ts        # Configuration status endpoint
│   └── page.tsx                   # Frontend UI
├── lib/
│   └── parts-search.ts            # API clients for DigiKey, JLCPCB, Mouser
└── components/ui/                 # shadcn/ui components
```

## Technology Stack

- **Next.js 15** - App Router, Server Components
- **TypeScript** - Full type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Lucide React** - Icons

## Examples

### Search for Resistors
```
Value: 100K
Footprint: 0402
```
Returns YAGEO, UniOhm, and other resistor options with stock levels.

### Search for Capacitors
```
Value: 1uF
Footprint: 0603
```
Returns ceramic and MLCC capacitor options.

### Search for ICs
```
Value: STM32F103
Component Type: IC
```
Returns microcontroller variants with full specifications.

## Why Server-Side?

- **CORS-Free**: Browser CORS policies don't block server-side requests
- **Secure**: API keys stored safely in environment variables
- **Caching**: Token caching for OAuth APIs reduces latency
- **Rate Limiting**: Centralized rate limit management

## Related Projects

- [InteractiveHtmlBom-Enhanced](https://github.com/andrespineda/InteractiveHtmlBom-Enhanced) - KiCad plugin with integrated part search
- [bom-sourcing-utility](https://github.com/andrespineda/bom-sourcing-utility) - Python CLI for BOM sourcing

## License

MIT License
