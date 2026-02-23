import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import {
  Tag,
  Download,
  FileText,
  Upload,
  ListOrdered,
  ClipboardPaste,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react'

type InputMethod = 'paste' | 'upload' | 'range'

const LABEL_GROUPS = [
  { group: 'cryovial', label: 'Cryovial', suffixes: 'P1-P5', layout: '5/row' },
  { group: 'urine', label: 'Urine', suffixes: 'U1', layout: '5/row' },
  { group: 'epigenetics', label: 'Epigenetics', suffixes: 'E1-E4', layout: '4/row' },
  { group: 'samples', label: 'Samples', suffixes: 'CS1, R1, H1 (+H2 for B)', layout: '4/row' },
  { group: 'edta', label: 'EDTA', suffixes: 'EDTA1-EDTA4', layout: '4/row' },
  { group: 'sst_fl_blood', label: 'SST/Fl/Blood', suffixes: 'SST1, SST2, Fl1, B1', layout: '4/row' },
]

const CODE_PATTERN = /^\d[AB]-\d{3}$/

function validateCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}

function parseCodesFromText(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function LabelGeneratorPage() {
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste')
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'docx'>('pdf')
  const [pastedText, setPastedText] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedFile, setGeneratedFile] = useState<string | null>(null)

  // Range inputs
  const [rangePrefix, setRangePrefix] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')

  const updateCodesFromText = useCallback((text: string) => {
    setPastedText(text)
    const parsed = parseCodesFromText(text)
    const valid: string[] = []
    const invalid: string[] = []
    for (const c of parsed) {
      if (validateCode(c)) valid.push(c)
      else invalid.push(c)
    }
    setCodes(valid)
    setErrors(
      invalid.length > 0
        ? [`Invalid codes: ${invalid.join(', ')}. Expected format: 1A-001`]
        : []
    )
    setGeneratedFile(null)
  }, [])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        // CSV/text: take first column of each row
        const lines = text.split(/\r?\n/).filter(Boolean)
        const extracted = lines.map((line) => line.split(',')[0].trim().replace(/^["']|["']$/g, ''))
        const filtered = extracted.filter(Boolean)
        const valid: string[] = []
        const invalid: string[] = []
        for (const c of filtered) {
          if (validateCode(c)) valid.push(c)
          else invalid.push(c)
        }
        setCodes(valid)
        setErrors(
          invalid.length > 0
            ? [`Invalid codes from file: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '...' : ''}`]
            : []
        )
        setGeneratedFile(null)
      } catch {
        setErrors(['Failed to read file. Please check the format.'])
        setCodes([])
      }
      // Reset input so same file can be re-uploaded
      e.target.value = ''
    },
    []
  )

  const generateRange = useCallback(() => {
    if (!rangePrefix || !rangeStart || !rangeEnd) {
      setErrors(['Please fill in prefix, start, and end numbers.'])
      return
    }
    const start = parseInt(rangeStart, 10)
    const end = parseInt(rangeEnd, 10)
    if (isNaN(start) || isNaN(end) || start > end) {
      setErrors(['Invalid range. Start must be less than or equal to end.'])
      return
    }
    if (end - start > 999) {
      setErrors(['Range too large. Maximum 1000 codes at a time.'])
      return
    }
    const generated: string[] = []
    const invalid: string[] = []
    for (let i = start; i <= end; i++) {
      const code = `${rangePrefix}-${String(i).padStart(3, '0')}`
      if (validateCode(code)) generated.push(code)
      else invalid.push(code)
    }
    setCodes(generated)
    setErrors(
      invalid.length > 0
        ? [`Some generated codes are invalid: ${invalid.slice(0, 5).join(', ')}`]
        : []
    )
    setGeneratedFile(null)
  }, [rangePrefix, rangeStart, rangeEnd])

  const handleGenerate = useCallback(async () => {
    if (codes.length === 0) return
    setIsGenerating(true)
    setGeneratedFile(null)

    try {
      const response = await api.post(
        '/labels/generate-zip',
        {
          participant_codes: codes,
          date_str: dateStr,
          output_format: outputFormat,
        },
        { responseType: 'blob' }
      )

      // Extract filename from Content-Disposition header or build default
      const disposition = response.headers['content-disposition'] || ''
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/)
      const suffix = dateStr ? `_${dateStr}` : ''
      const filename = filenameMatch?.[1] || `bharat_labels${suffix}.zip`

      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      setGeneratedFile(url)

      // Trigger download using link click
      const link = document.createElement('a')
      link.style.display = 'none'
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      // Cleanup after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link)
      }, 100)
    } catch {
      setErrors(['Failed to generate labels. Please try again.'])
    } finally {
      setIsGenerating(false)
    }
  }, [codes, dateStr])

  const clearAll = () => {
    setPastedText('')
    setCodes([])
    setErrors([])
    setGeneratedFile(null)
    setRangePrefix('')
    setRangeStart('')
    setRangeEnd('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Label Generator</h1>
        <p className="text-muted-foreground mt-1">
          Generate A4 label sheets for BHARAT Study biobanking (22 labels per participant)
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Input */}
        <div className="lg:col-span-2 space-y-4">
          {/* Input method tabs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Input Participant Codes</CardTitle>
              <CardDescription>
                Code format: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{'<age_group><sex>-<number>'}</code> e.g. 1A-001, 3B-045
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Method selector */}
              <div className="flex gap-2">
                {[
                  { key: 'paste' as const, label: 'Paste Codes', icon: ClipboardPaste },
                  { key: 'upload' as const, label: 'Upload File', icon: Upload },
                  { key: 'range' as const, label: 'Code Range', icon: ListOrdered },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setInputMethod(key)
                      clearAll()
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      inputMethod === key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Paste input */}
              {inputMethod === 'paste' && (
                <div className="space-y-2">
                  <Label htmlFor="codes-input">Participant codes (one per line)</Label>
                  <textarea
                    id="codes-input"
                    value={pastedText}
                    onChange={(e) => updateCodesFromText(e.target.value)}
                    placeholder={'1A-001\n1A-002\n2B-010\n3A-055'}
                    rows={8}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              )}

              {/* File upload */}
              {inputMethod === 'upload' && (
                <div className="space-y-2">
                  <Label htmlFor="file-input">Upload CSV or text file with codes</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="file-input"
                      type="file"
                      accept=".csv,.txt,.xlsx"
                      onChange={handleFileUpload}
                      className="max-w-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      First column should contain participant codes
                    </span>
                  </div>
                </div>
              )}

              {/* Range input */}
              {inputMethod === 'range' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="range-prefix">Prefix</Label>
                      <Input
                        id="range-prefix"
                        value={rangePrefix}
                        onChange={(e) => setRangePrefix(e.target.value)}
                        placeholder="1A"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="range-start">Start number</Label>
                      <Input
                        id="range-start"
                        type="number"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        placeholder="1"
                        min={1}
                        max={999}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="range-end">End number</Label>
                      <Input
                        id="range-end"
                        type="number"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        placeholder="30"
                        min={1}
                        max={999}
                      />
                    </div>
                  </div>
                  <Button onClick={generateRange} variant="outline" size="sm">
                    Generate Range
                  </Button>
                </div>
              )}

              {/* Date field */}
              <div className="space-y-1.5">
                <Label htmlFor="date-str">Sampling date (optional, added to filenames)</Label>
                <Input
                  id="date-str"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  placeholder="24-02-2026"
                  className="max-w-[200px]"
                />
              </div>

              {/* Output format */}
              <div className="space-y-1.5">
                <Label>Output format</Label>
                <div className="flex gap-2">
                  {(['pdf', 'docx'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setOutputFormat(fmt)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        outputFormat === fmt
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{errors.map((e, i) => <p key={i}>{e}</p>)}</div>
                </div>
              )}

              {/* Code count + preview */}
              {codes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">{codes.length} valid codes</span>
                      <span className="text-muted-foreground">
                        ({codes.length * 22} total labels across 6 sheets)
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearAll}>
                      <X className="mr-1 h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={codes.length === 0 || isGenerating}
              size="lg"
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isGenerating ? 'Generating...' : 'Generate & Download Labels'}
            </Button>

            {generatedFile && (
              <a
                href={generatedFile}
                download={`bharat_labels${dateStr ? `_${dateStr}` : ''}.zip`}
                className="text-sm text-primary hover:underline"
              >
                Download again
              </a>
            )}
          </div>
        </div>

        {/* Right: Info panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4" />
                Label Groups
              </CardTitle>
              <CardDescription>
                22 labels per participant across 6 document types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {LABEL_GROUPS.map((g) => (
                  <div
                    key={g.group}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{g.label}</span>
                      <span className="ml-2 text-muted-foreground">{g.suffixes}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{g.layout}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Output
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Downloads a ZIP containing 6 files (PDF or Word), one per label group.</p>
              <p>Each file is formatted for A4 paper with precise label positioning.</p>
              <p>
                <strong>B-participants</strong> (e.g. 1B-001) get an extra H2 label in the
                Samples sheet instead of a blank position.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Code Format</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              <div className="grid grid-cols-[80px_1fr] gap-y-1 text-muted-foreground">
                <span className="font-medium text-foreground">Digit 1</span>
                <span>Age group: 1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+</span>
                <span className="font-medium text-foreground">Letter</span>
                <span>Sex: A=Male, B=Female</span>
                <span className="font-medium text-foreground">Number</span>
                <span>001-999 (participant number)</span>
              </div>
              <div className="mt-2 rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                1A-001 = Male, 18-29, participant #1
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
