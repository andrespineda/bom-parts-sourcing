# Project History

This document records the complete history of the BOM Parts Sourcing project for continuity across sessions and agents.

---

## Session 1: February 2026

### Initial Context (From Previous Session with GLM-4.7)

The user had previously worked on a BOM Sourcing Utility with the following components:
- **JLCPCB Integration**: Using free JLCSearch API (https://jlcsearch.tscircuit.com) - no API key required
- **DigiKey Integration**: Requires Client ID and Client Secret
- **Mouser Integration**: Requires API Key
- **Configuration**: Stored in `config.json` with fields for `digikey_client_id`, `digikey_client_secret`, `mouser_api_key`, `jlcpcb_api_key`

The user had already created a repository: https://github.com/andrespineda/bom-sourcing-utility

### Previous Project: InteractiveHtmlBom-Enhanced

The user attempted to fork InteractiveHtmlBom and add part search functionality:
- **Repository**: https://github.com/andrespineda/InteractiveHtmlBom-Enhanced
- **Goal**: Add Digi-Key and JLCPCB part search to KiCad BOM generation
- **Issue**: JLCPCB client-side search had a CORS bug - searches returned "No Results" even when parts existed
- **Issue**: Digi-Key and Mouser only provided redirect links, not full API integration
- **Issue**: KiCad plugin installation didn't work as documented (no "Add a New Plugin Directory" option)

### Current Session Work

#### User Request
> "Read the memory file about my request for an server-side interface to DigiKey.com to get parts for a BOM."

The user wanted a **server-side API interface** to solve:
1. **Full DigiKey API integration** with secure server-side key storage
2. **JLCPCB CORS issue** - client-side fetch was being blocked

---

## Implementation Details

### Project Created: BOM Parts Sourcing API

**Repository**: https://github.com/andrespineda/bom-parts-sourcing

**Technology Stack**:
- Next.js 15 with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Server-side API routes

### Files Created

#### 1. `/src/lib/parts-search.ts` (Main API Library)

**Classes Implemented**:

##### DigiKeyClient
- OAuth2 authentication with automatic token caching
- Token expiry handling with 5-minute buffer
- Product search via `/Products/v3/Search/Keyword` endpoint
- Parses: part number, manufacturer, description, stock, pricing, datasheet, specifications
- Requires: `DIGIKEY_CLIENT_ID` and `DIGIKEY_CLIENT_SECRET` environment variables

##### JLCPCBClient
- Uses free JLCSearch API: `https://jlcsearch.tscircuit.com/components/list.json`
- No API key required
- Extracts: LCSC part number, stock, price, manufacturer, package
- Normalizes footprints (e.g., "0402 (1005 Metric)" → "0402")
- Sorts results by stock (descending) then price (ascending)

##### MouserClient
- Uses Mouser API v1: `https://api.mouser.com/api/v1/product/search`
- Requires: `MOUSER_API_KEY` environment variable
- Parses: part number, manufacturer, description, stock, pricing, datasheet

#### 2. `/src/app/api/parts-search/route.ts` (API Endpoint)

**GET Request**:
```
GET /api/parts-search?value=100k&footprint=0402&suppliers=jlcpcb,digikey,mouser&limit=10
```

**POST Request**:
```json
POST /api/parts-search
{
  "value": "1uF",
  "footprint": "0603",
  "componentType": "capacitor",
  "suppliers": ["jlcpcb", "digikey"],
  "limit": 15
}
```

**Response Format**:
```json
{
  "success": true,
  "query": { "value": "100k", "footprint": "0402", "limit": 10 },
  "results": {
    "JLCPCB": [...],
    "Digi-Key": [...],
    "Mouser": [...]
  },
  "configured": {
    "jlcpcb": true,
    "digikey": false,
    "mouser": false
  }
}
```

#### 3. `/src/app/api/config/route.ts` (Configuration Status)

**GET /api/config** returns:
- Which suppliers are configured
- Setup instructions for DigiKey and Mouser

#### 4. `/src/app/page.tsx` (Frontend UI)

**Features**:
- Search form with value, footprint, and component type inputs
- Supplier checkboxes (JLCPCB, Digi-Key, Mouser)
- Configuration status badges showing which APIs are ready
- Tabbed results view organized by supplier
- Part cards showing:
  - LCSC part number (for JLCPCB)
  - Manufacturer and part number
  - Stock level (green = in stock, red = out of stock)
  - Price
  - Package/footprint
  - Direct purchase link
  - Datasheet link (when available)
- Dark mode support
- Responsive design

#### 5. `/.env` and `/.env.example` (Configuration)

```env
DATABASE_URL=file:./db/custom.db

# DigiKey API Configuration
DIGIKEY_CLIENT_ID=
DIGIKEY_CLIENT_SECRET=

# Mouser API Configuration
MOUSER_API_KEY=
```

---

## Testing Results

### JLCPCB Search (Working)
```bash
curl "http://localhost:3000/api/parts-search?value=100k&footprint=0402&suppliers=jlcpcb"
```
**Result**: 10 parts returned with stock levels up to 2M+ units

```bash
curl "http://localhost:3000/api/parts-search?value=1uF&footprint=0402&suppliers=jlcpcb"
```
**Result**: Parts returned with LCSC numbers (e.g., C141382 with 354,560 in stock)

### DigiKey Search (Ready for Configuration)
- Not yet tested (requires user to add API keys)
- OAuth flow implemented and ready

### Mouser Search (Ready for Configuration)
- Not yet tested (requires user to add API key)
- API integration implemented and ready

---

## Key Decisions

### Why Server-Side?
1. **CORS Resolution**: Browser CORS policies block direct calls to JLCSearch/DigiKey/Mouser APIs
2. **Security**: API keys stored in environment variables, never exposed to client
3. **Token Management**: OAuth tokens cached server-side with automatic refresh
4. **Rate Limiting**: Centralized request management

### Why JLCSearch API for JLCPCB?
- Free and requires no API key
- Access to 1.5M+ parts
- Real-time stock and pricing
- No CORS issues when called server-side

---

## How to Continue

### For User: Adding DigiKey API Keys
1. Go to https://developer.digikey.com/
2. Create a Digi-Key API account
3. Create a new Application
4. Set Redirect URI: `http://localhost:3000`
5. Copy Client ID and Client Secret
6. Add to `.env` file:
   ```
   DIGIKEY_CLIENT_ID=your_client_id
   DIGIKEY_CLIENT_SECRET=your_client_secret
   ```

### For User: Running Locally
```bash
git clone https://github.com/andrespineda/bom-parts-sourcing.git
cd bom-parts-sourcing
bun install
bun run dev
# Open http://localhost:3000
```

### For Future Agents: Key Files to Understand
| File | Purpose |
|------|---------|
| `src/lib/parts-search.ts` | Core API clients for all suppliers |
| `src/app/api/parts-search/route.ts` | REST API endpoint |
| `src/app/api/config/route.ts` | Configuration status endpoint |
| `src/app/page.tsx` | Frontend UI |
| `.env` | API credentials (not in git) |
| `.env.example` | Template for credentials |

---

## Related Repositories

| Repository | Purpose | Status |
|------------|---------|--------|
| https://github.com/andrespineda/bom-parts-sourcing | Server-side API (this project) | ✅ Complete |
| https://github.com/andrespineda/bom-sourcing-utility | Python CLI for BOM sourcing | ✅ Previous work |
| https://github.com/andrespineda/InteractiveHtmlBom-Enhanced | KiCad plugin with part search | ⚠️ Has CORS bug |

---

## Outstanding Issues / Future Work

1. **InteractiveHtmlBom-Enhanced**: Still has JLCPCB CORS bug - could be fixed by calling this server-side API
2. **DigiKey Integration**: Needs user to add API credentials to test
3. **Mouser Integration**: Needs user to add API key to test
4. **Potential Enhancement**: Create API endpoint that InteractiveHtmlBom can call for part searches
5. **Potential Enhancement**: Add batch search for entire BOM at once
6. **Potential Enhancement**: Export results to CSV with LCSC parts for JLCPCB assembly

---

## Session Summary

| Item | Details |
|------|---------|
| **Date** | February 2026 |
| **Project** | BOM Parts Sourcing API |
| **Repository** | https://github.com/andrespineda/bom-parts-sourcing |
| **Status** | ✅ Complete and pushed to GitHub |
| **JLCPCB** | ✅ Working (no config needed) |
| **DigiKey** | 🔑 Ready for API keys |
| **Mouser** | 🔑 Ready for API key |

---

*This history file should be updated at the start of each new session to maintain continuity.*
