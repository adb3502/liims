import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUploadCsv, useImportPreview, useExecuteImport } from '@/api/partner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { PartnerName } from '@/types'
import { PARTNER_LABELS } from '@/types'
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

const ALL_PARTNERS: PartnerName[] = ['healthians', '1mg', 'lalpath', 'decodeage']

const STEPS = [
  { label: 'Upload', description: 'Select partner and file' },
  { label: 'Preview', description: 'Review matched data' },
  { label: 'Mapping', description: 'Configure field mapping' },
  { label: 'Import', description: 'Execute and summary' },
]

export function ImportWizardPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [partner, setPartner] = useState<PartnerName | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [importId, setImportId] = useState('')
  const [importDone, setImportDone] = useState(false)

  const uploadMutation = useUploadCsv()
  const executeMutation = useExecuteImport()
  const { data: preview, isLoading: previewLoading } = useImportPreview(importId)

  async function handleUpload() {
    if (!partner || !file) return
    try {
      const result = await uploadMutation.mutateAsync({ file, partner_name: partner })
      setImportId(result.id)
      setStep(1)
    } catch {
      // handled by mutation
    }
  }

  async function handleExecute() {
    if (!importId) return
    try {
      await executeMutation.mutateAsync(importId)
      setImportDone(true)
      setStep(3)
    } catch {
      // handled by mutation
    }
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/partners/history')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Import History
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-6">Import Partner Data</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                i === step
                  ? 'bg-primary text-primary-foreground font-medium'
                  : i < step
                    ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              <span className="font-mono text-xs">{i + 1}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px w-6', i < step ? 'bg-success' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 0 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Select Partner & Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Partner Lab</label>
              <select
                value={partner}
                onChange={(e) => setPartner(e.target.value as PartnerName)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a partner...</option>
                {ALL_PARTNERS.map((p) => (
                  <option key={p} value={p}>{PARTNER_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">CSV File</label>
              <div
                className={cn(
                  'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  file ? 'border-success/50 bg-success/5' : 'border-border hover:border-primary/30',
                )}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button
                      onClick={() => setFile(null)}
                      className="text-muted-foreground hover:text-foreground ml-2 cursor-pointer"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      Drop a CSV file here or click to browse
                    </p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="block mx-auto text-sm"
                    />
                  </>
                )}
              </div>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!partner || !file || uploadMutation.isPending}
              className="w-full"
            >
              {uploadMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload & Preview
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview Import Data</CardTitle>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : preview ? (
              <div className="space-y-4">
                {/* Match stats */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center">
                    <CheckCircle2 className="mx-auto h-6 w-6 text-success mb-1" />
                    <p className="text-2xl font-bold font-mono text-success">
                      {preview.matched ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Matched</p>
                  </div>
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-center">
                    <AlertTriangle className="mx-auto h-6 w-6 text-warning mb-1" />
                    <p className="text-2xl font-bold font-mono text-warning">
                      {preview.unmatched ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Unmatched</p>
                  </div>
                  <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-center">
                    <XCircle className="mx-auto h-6 w-6 text-danger mb-1" />
                    <p className="text-2xl font-bold font-mono text-danger">
                      {preview.issues ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Issues</p>
                  </div>
                </div>

                {/* Sample rows */}
                {preview.sample_rows && preview.sample_rows.length > 0 && (
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {Object.keys(preview.sample_rows[0]).map((key) => (
                            <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample_rows.slice(0, 10).map((row: Record<string, unknown>, idx: number) => (
                          <tr key={idx} className="border-b last:border-0">
                            {Object.values(row).map((val, cidx) => (
                              <td key={cidx} className="px-3 py-2 text-sm font-mono">
                                {String(val ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={() => setStep(2)}>
                    Next: Mapping
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No preview data available.</p>
                <Button variant="outline" className="mt-3" onClick={() => setStep(0)}>
                  Back
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Mapping */}
      {step === 2 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Field Mapping Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Field mapping is configured automatically based on the partner's canonical test aliases.
              Review the mapping below and proceed when ready.
            </p>

            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium mb-2">Auto-mapped fields:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Participant code column detected
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Test name columns mapped via aliases
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Unit conversion factors applied
                </li>
              </ul>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleExecute} disabled={executeMutation.isPending}>
                {executeMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="text-primary-foreground" />
                    Importing...
                  </>
                ) : (
                  <>
                    Execute Import
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Summary */}
      {step === 3 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
              <p className="text-lg font-bold text-success mb-1">Import Successful</p>
              <p className="text-sm text-muted-foreground">
                The partner data has been imported and matched to participants.
              </p>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep(0)
                  setFile(null)
                  setPartner('')
                  setImportId('')
                  setImportDone(false)
                }}
              >
                Import Another
              </Button>
              <Button onClick={() => navigate('/partners/history')}>
                View Import History
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
