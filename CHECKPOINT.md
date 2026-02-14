# 🚀 BOM Parts Sourcing - Session Checkpoint

> **Quick Start**: Read this file first when starting a new session to get up to speed quickly.

---

## 📋 Project Overview

**Purpose**: Server-side API for searching electronic components across JLCPCB, Digi-Key, and Mouser with BOM upload auto-sourcing capability.

**Repository**: https://github.com/andrespineda/bom-parts-sourcing

**Tech Stack**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui

---

## ✅ Current Status (All Systems Operational)

| Component | Status | Notes |
|-----------|--------|-------|
| **JLCPCB API** | ✅ Working | Free JLCSearch API, no key needed |
| **DigiKey API** | ✅ Working | ProductInformation V4 endpoint |
| **Mouser API** | ✅ Working | Search/keyword endpoint |
| **Part Search UI** | ✅ Complete | Single component search |
| **BOM Upload** | ✅ Complete | CSV upload with auto-sourcing |
| **GitHub** | ✅ Synced | All changes pushed |

---

## 🔑 Environment Variables (.env)

```env
# Database
DATABASE_URL=file:./db/custom.db

# GitHub (for pushing changes)
GITHUB_TOKEN=<your-github-token>

# DigiKey Production API
DIGIKEY_CLIENT_ID=<your-client-id>
DIGIKEY_CLIENT_SECRET=<your-client-secret>
DIGIKEY_SANDBOX=false

# Mouser API
MOUSER_API_KEY=<your-api-key>
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/lib/parts-search.ts` | Core API clients for JLCPCB, DigiKey, Mouser |
| `src/app/api/parts-search/route.ts` | Single part search endpoint |
| `src/app/api/bom-upload/route.ts` | BOM upload and auto-sourcing |
| `src/app/api/config/route.ts` | API configuration status |
| `src/app/page.tsx` | Frontend UI (tabs: Part Search, BOM Upload) |
| `.env` | API credentials (not in git) |
| `HISTORY.md` | Detailed session-by-session history |
| `CHECKPOINT.md` | This file - quick session restart |

---

## 🔧 API Endpoints

### Single Part Search
```
POST /api/parts-search
{
  "value": "100K",
  "footprint": "0402",
  "componentType": "resistor",
  "suppliers": ["jlcpcb", "digikey", "mouser"],
  "limit": 10
}
```

### BOM Upload
```
POST /api/bom-upload
Content-Type: multipart/form-data
file: <csv file>
```

### Configuration Status
```
GET /api/config
```

---

## 🎯 Part Matching Priority Rules

### Supplier Priority
1. **JLCPCB** (preferred) - China-based, no import needed
2. **DigiKey** - US distributor
3. **Mouser** - US distributor

### Scoring (per supplier)
- In stock: +1000 points
- Stock quantity: +0-100 points (higher = better)
- Lower price: +0-50 points (lower = better)
- Has LCSC part (JLCPCB only): +50 points
- Has datasheet: +20 points

---

## 📊 Sessions Summary

| Session | Focus | Status |
|---------|-------|--------|
| 1 | Initial build, JLCPCB working | ✅ |
| 2 | Mouser fix, DigiKey sandbox | ✅ |
| 3 | JLCPCB category endpoints | ✅ |
| 4 | DigiKey V4 API fix | ✅ |
| 5 | BOM Upload feature | ✅ |

---

## 🔜 Future Work / Ideas

### High Priority
- [ ] Test BOM upload with more real-world files
- [ ] Refine matching algorithm based on user feedback
- [ ] Add support for different BOM column formats

### Medium Priority
- [ ] KiCad plugin integration (use this API for part search)
- [ ] BOM history/favorites storage
- [ ] Export to different formats (Excel, etc.)

### Low Priority
- [ ] Multi-language support
- [ ] Price history tracking
- [ ] Alternative part suggestions

---

## 🐛 Known Issues / Gotchas

1. **DigiKey API**: Must use `/products/v4/search/keyword` (POST), not V3 endpoint
2. **JLCPCB**: Uses category-specific endpoints (e.g., `/resistors/list.json`), not generic `/components/list.json`
3. **Mouser**: Prices include "$" prefix that needs to be stripped
4. **BOM CSV**: Must have "Reference" and "Value" columns minimum

---

## 🏃 Quick Commands

```bash
# Start development
bun run dev

# Lint check
bun run lint

# Test APIs
curl "http://localhost:3000/api/parts-search?value=100k&suppliers=jlcpcb,digikey,mouser&limit=3"
curl "http://localhost:3000/api/config"

# Test BOM upload
curl -X POST "http://localhost:3000/api/bom-upload" -F "file=@test.csv"

# Git push (token already in .env)
git add . && git commit -m "message" && git push origin main
```

---

## 📎 Related Repositories

| Repository | Purpose | Status |
|------------|---------|--------|
| [bom-parts-sourcing](https://github.com/andrespineda/bom-parts-sourcing) | This project (server-side API) | ✅ Active |
| [InteractiveHtmlBom-Enhanced](https://github.com/andrespineda/InteractiveHtmlBom-Enhanced) | KiCad plugin with part search | ✅ Updated - uses this API |
| [bom-sourcing-utility](https://github.com/andrespineda/bom-sourcing-utility) | Python CLI for BOM sourcing | ✅ Complete |

---

## 🔌 KiCad Plugin Integration

The **InteractiveHtmlBom-Enhanced** plugin now uses this API for part searches:

1. Install the plugin in KiCad
2. Start the BOM Parts Sourcing API: `bun run dev`
3. Generate a BOM in KiCad
4. Click "🔍 Parts" button in the BOM HTML
5. Search across JLCPCB, Digi-Key, and Mouser

**Configuration**: The plugin connects to `http://localhost:3000` by default. Change via `--api-url` flag.

---

## 📝 For New Sessions

When starting a new session:
1. Read this `CHECKPOINT.md` file
2. Check `HISTORY.md` for detailed session logs
3. Verify `.env` has all API keys
4. Run `curl http://localhost:3000/api/config` to verify APIs
5. Check `git log --oneline -5` for recent changes

---

*Last updated: Session 5 (February 2026)*
