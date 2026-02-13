'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Search, 
  ExternalLink, 
  FileText, 
  Package, 
  DollarSign, 
  Database,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Cpu,
  Zap,
  Radio,
  Lightbulb,
  Plug,
  CircuitBoard
} from 'lucide-react'

interface PartResult {
  supplier: string
  partNumber: string
  manufacturer: string
  manufacturerPartNumber: string
  description: string
  value: string
  footprint: string
  stock: number
  price: number
  currency: string
  url: string
  datasheet: string
  lcscPart?: string
  image?: string
  package?: string
  specifications?: Record<string, string>
}

interface SearchResults {
  JLCPCB?: PartResult[]
  'Digi-Key'?: PartResult[]
  Mouser?: PartResult[]
}

interface ConfigStatus {
  jlcpcb: boolean
  digikey: boolean
  mouser: boolean
}

interface ConfigResponse {
  suppliers: {
    jlcpcb: { name: string; configured: boolean; note: string }
    digikey: { name: string; configured: boolean; note: string }
    mouser: { name: string; configured: boolean; note: string }
  }
  instructions: {
    digikey: { steps: string[] }
    mouser: { steps: string[] }
  }
}

const componentTypes = [
  { value: '', label: 'All Types', icon: CircuitBoard },
  { value: 'resistor', label: 'Resistor', icon: Zap },
  { value: 'capacitor', label: 'Capacitor', icon: Cpu },
  { value: 'inductor', label: 'Inductor', icon: Radio },
  { value: 'diode', label: 'Diode', icon: Zap },
  { value: 'led', label: 'LED', icon: Lightbulb },
  { value: 'transistor', label: 'Transistor', icon: Cpu },
  { value: 'ic', label: 'IC', icon: Cpu },
  { value: 'connector', label: 'Connector', icon: Plug },
]

const supplierColors: Record<string, string> = {
  'JLCPCB': 'bg-blue-500',
  'Digi-Key': 'bg-red-500',
  'Mouser': 'bg-cyan-500',
}

const supplierBorderColors: Record<string, string> = {
  'JLCPCB': 'border-blue-500',
  'Digi-Key': 'border-red-500',
  'Mouser': 'border-cyan-500',
}

export default function Home() {
  const [value, setValue] = useState('')
  const [footprint, setFootprint] = useState('')
  const [componentType, setComponentType] = useState('')
  const [suppliers, setSuppliers] = useState({
    jlcpcb: true,
    digikey: true,
    mouser: true,
  })
  const [results, setResults] = useState<SearchResults>({})
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [configured, setConfigured] = useState<ConfigStatus>({ jlcpcb: true, digikey: false, mouser: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // Fetch configuration status on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data)
        if (data.suppliers) {
          setConfigured({
            jlcpcb: data.suppliers.jlcpcb.configured,
            digikey: data.suppliers.digikey.configured,
            mouser: data.suppliers.mouser.configured,
          })
        }
      })
      .catch(err => console.error('Failed to fetch config:', err))
  }, [])

  const searchParts = useCallback(async () => {
    if (!value.trim() && !footprint.trim()) {
      setError('Please enter a value or footprint to search')
      return
    }

    if (!suppliers.jlcpcb && !suppliers.digikey && !suppliers.mouser) {
      setError('Please select at least one supplier')
      return
    }

    setLoading(true)
    setError(null)
    setResults({})
    setSearched(true)

    try {
      const enabledSuppliers = []
      if (suppliers.jlcpcb) enabledSuppliers.push('jlcpcb')
      if (suppliers.digikey) enabledSuppliers.push('digikey')
      if (suppliers.mouser) enabledSuppliers.push('mouser')

      const response = await fetch('/api/parts-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: value.trim(),
          footprint: footprint.trim(),
          componentType: componentType || undefined,
          suppliers: enabledSuppliers,
          limit: 15,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error || 'Search failed')
        return
      }

      setResults(data.results || {})
      
      if (data.configured) {
        setConfigured(data.configured)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [value, footprint, componentType, suppliers])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchParts()
    }
  }

  const totalResults = Object.values(results).flat().length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Package className="h-10 w-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">BOM Parts Sourcing</h1>
          </div>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Search for electronic components across JLCPCB, Digi-Key, and Mouser APIs. 
            Find the best parts for your Bill of Materials with real-time stock and pricing.
          </p>
        </div>

        {/* Configuration Status Alert */}
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                API Configuration Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Badge variant={configured.jlcpcb ? "default" : "secondary"} className="flex items-center gap-1 px-3 py-1">
                  {configured.jlcpcb ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  JLCPCB {configured.jlcpcb ? '(Ready)' : '(Not Configured)'}
                </Badge>
                <Badge variant={configured.digikey ? "default" : "secondary"} className="flex items-center gap-1 px-3 py-1">
                  {configured.digikey ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Digi-Key {configured.digikey ? '(Ready)' : '(Add API Keys)'}
                </Badge>
                <Badge variant={configured.mouser ? "default" : "secondary"} className="flex items-center gap-1 px-3 py-1">
                  {configured.mouser ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Mouser {configured.mouser ? '(Ready)' : '(Add API Key)'}
                </Badge>
              </div>
              {(!configured.digikey || !configured.mouser) && (
                <p className="text-sm text-muted-foreground mt-3">
                  Add your API keys to the <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.env</code> file to enable Digi-Key and Mouser search.
                  JLCPCB uses the free JLCSearch API and works without configuration.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search Card */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Components
            </CardTitle>
            <CardDescription>
              Enter component specifications to search across suppliers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Value Input */}
              <div className="space-y-2">
                <Label htmlFor="value">Component Value</Label>
                <Input
                  id="value"
                  placeholder="e.g., 100K, 1uF, 2.2nH"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              {/* Footprint Input */}
              <div className="space-y-2">
                <Label htmlFor="footprint">Footprint / Package</Label>
                <Input
                  id="footprint"
                  placeholder="e.g., 0402, 0603, SOIC-8"
                  value={footprint}
                  onChange={(e) => setFootprint(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              {/* Component Type */}
              <div className="space-y-2">
                <Label htmlFor="type">Component Type</Label>
                <select
                  id="type"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={componentType}
                  onChange={(e) => setComponentType(e.target.value)}
                >
                  {componentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Suppliers Checkboxes */}
              <div className="space-y-2">
                <Label>Suppliers</Label>
                <div className="flex flex-wrap gap-4 h-10 items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={suppliers.jlcpcb}
                      onCheckedChange={(checked) => setSuppliers({ ...suppliers, jlcpcb: !!checked })}
                    />
                    <span className="text-sm">JLCPCB</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={suppliers.digikey}
                      onCheckedChange={(checked) => setSuppliers({ ...suppliers, digikey: !!checked })}
                      disabled={!configured.digikey}
                    />
                    <span className={`text-sm ${!configured.digikey ? 'text-muted-foreground' : ''}`}>Digi-Key</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={suppliers.mouser}
                      onCheckedChange={(checked) => setSuppliers({ ...suppliers, mouser: !!checked })}
                      disabled={!configured.mouser}
                    />
                    <span className={`text-sm ${!configured.mouser ? 'text-muted-foreground' : ''}`}>Mouser</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Search Button */}
            <Button 
              onClick={searchParts} 
              disabled={loading} 
              className="w-full md:w-auto px-8"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Components
                </>
              )}
            </Button>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {searched && (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Search Results
              </h2>
              {totalResults > 0 && (
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {totalResults} part{totalResults !== 1 ? 's' : ''} found
                </Badge>
              )}
            </div>

            {totalResults === 0 && !loading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No results found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search terms or selecting different suppliers.
                    <br />
                    Tip: JLCPCB has the largest database with 1.5M+ parts.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue={Object.keys(results)[0] || 'JLCPCB'} className="w-full">
                <TabsList className="w-full justify-start mb-4">
                  {Object.keys(results).map((supplier) => (
                    <TabsTrigger key={supplier} value={supplier} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${supplierColors[supplier]}`} />
                      {supplier}
                      <Badge variant="secondary" className="ml-1">
                        {results[supplier as keyof SearchResults]?.length || 0}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {Object.entries(results).map(([supplier, parts]) => (
                  <TabsContent key={supplier} value={supplier}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {parts?.map((part, index) => (
                        <PartCard key={`${supplier}-${index}`} part={part} />
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        )}

        {/* Instructions Section */}
        <div className="mt-12">
          <Card>
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
              <CardDescription>
                How to configure API keys for Digi-Key and Mouser
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    Digi-Key API Setup
                  </h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li>1. Go to <a href="https://developer.digikey.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developer.digikey.com</a></li>
                    <li>2. Create a Digi-Key API account</li>
                    <li>3. Create a new Application</li>
                    <li>4. Set the Redirect URI to: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">http://localhost:3000</code></li>
                    <li>5. Copy the Client ID and Client Secret</li>
                    <li>6. Add to your <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.env</code> file:</li>
                  </ol>
                  <div className="mt-3 p-3 bg-slate-900 rounded-md text-sm font-mono text-slate-100">
                    <div>DIGIKEY_CLIENT_ID=your_client_id</div>
                    <div>DIGIKEY_CLIENT_SECRET=your_client_secret</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-500" />
                    Mouser API Setup
                  </h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li>1. Go to <a href="https://www.mouser.com/api/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">mouser.com/api</a></li>
                    <li>2. Request API access</li>
                    <li>3. Copy your API key</li>
                    <li>4. Add to your <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.env</code> file:</li>
                  </ol>
                  <div className="mt-3 p-3 bg-slate-900 rounded-md text-sm font-mono text-slate-100">
                    <div>MOUSER_API_KEY=your_api_key</div>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  JLCPCB (No Setup Required)
                </h4>
                <p className="text-sm text-muted-foreground">
                  JLCPCB search uses the free JLCSearch API provided by tscircuit. 
                  It provides access to 1.5M+ parts with real-time stock and pricing - no API key needed!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Part Card Component
function PartCard({ part }: { part: PartResult }) {
  const stockColor = part.stock > 0 
    ? 'text-green-600 dark:text-green-400' 
    : 'text-red-600 dark:text-red-400'
  const stockBg = part.stock > 0 
    ? 'bg-green-50 dark:bg-green-950' 
    : 'bg-red-50 dark:bg-red-950'

  return (
    <Card className={`border-l-4 ${supplierBorderColors[part.supplier]} hover:shadow-md transition-shadow`}>
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={supplierColors[part.supplier]}>
                {part.supplier}
              </Badge>
              {part.lcscPart && (
                <Badge variant="outline" className="border-blue-300 text-blue-600">
                  LCSC: {part.lcscPart}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-lg">
              {part.manufacturerPartNumber || part.partNumber || 'N/A'}
            </h3>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${stockBg} ${stockColor}`}>
            {part.stock > 0 ? `${part.stock.toLocaleString()} in stock` : 'Out of stock'}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {part.description || 'No description available'}
        </p>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Manufacturer:</span>
            <p className="font-medium">{part.manufacturer || 'N/A'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Package:</span>
            <p className="font-medium">{part.package || part.footprint || 'N/A'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Value:</span>
            <p className="font-medium">{part.value || 'N/A'}</p>
          </div>
          <div>
            <span className="text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Price:
            </span>
            <p className="font-medium">
              {part.price > 0 ? `$${part.price.toFixed(4)} ${part.currency}` : 'Contact supplier'}
            </p>
          </div>
        </div>

        {/* Specifications */}
        {part.specifications && Object.keys(part.specifications).length > 0 && (
          <div className="mb-4 text-sm">
            <span className="text-muted-foreground">Specifications:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(part.specifications).slice(0, 4).map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-xs">
                  {key}: {value}
                </Badge>
              ))}
              {Object.keys(part.specifications).length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{Object.keys(part.specifications).length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {part.url && (
            <Button asChild size="sm" className={`flex-1 ${part.supplier === 'JLCPCB' ? 'bg-blue-600 hover:bg-blue-700' : part.supplier === 'Digi-Key' ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
              <a href={part.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                View Part
              </a>
            </Button>
          )}
          {part.datasheet && (
            <Button asChild variant="outline" size="sm">
              <a href={part.datasheet} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4 mr-1" />
                Datasheet
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
