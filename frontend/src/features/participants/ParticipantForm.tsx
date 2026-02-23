import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateParticipant, useCollectionSites } from '@/api/participants'
import api, { extractErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { ArrowLeft, Users, UserPlus, CheckCircle, AlertCircle, Info } from 'lucide-react'

// ──── Schemas ─────────────────────────────────────────────────────────────

const participantSchema = z.object({
  participant_code: z
    .string()
    .min(1, 'Participant code is required')
    .max(20, 'Code must be 20 characters or less'),
  group_code: z
    .string()
    .min(1, 'Group code is required')
    .max(5, 'Group code must be 5 characters or less'),
  participant_number: z.coerce
    .number()
    .int()
    .min(1, 'Participant number must be at least 1'),
  age_group: z.coerce.number().int().min(1).max(5, 'Age group must be 1-5'),
  sex: z.enum(['M', 'F'], { required_error: 'Sex is required' }),
  date_of_birth: z.string().optional(),
  collection_site_id: z.string().uuid('Please select a collection site'),
  enrollment_date: z.string().min(1, 'Enrollment date is required'),
  enrollment_source: z.enum(['manual', 'bulk_import']).default('manual'),
  wave: z.coerce.number().int().min(1).optional().default(1),
})

type ParticipantFormData = z.infer<typeof participantSchema>

// ──── Bulk create schema ───────────────────────────────────────────────────

// Participant code format: {group_code}-{number} e.g. 1A-001
const CODE_PATTERN = /^[1-5][AB]-\d{3}$/

const bulkCreateSchema = z.object({
  start_code: z
    .string()
    .min(1, 'Start code is required')
    .regex(CODE_PATTERN, 'Format must be e.g. 1A-001'),
  end_code: z
    .string()
    .min(1, 'End code is required')
    .regex(CODE_PATTERN, 'Format must be e.g. 1A-050'),
  collection_site_id: z.string().uuid('Please select a collection site'),
  enrollment_date: z.string().min(1, 'Enrollment date is required'),
  wave: z.coerce.number().int().min(1).default(1),
})

type BulkFormData = z.infer<typeof bulkCreateSchema>

// ──── Bulk create API response ─────────────────────────────────────────────

interface BulkCreateResult {
  created: number
  skipped: number
  errors: string[]
  codes_created: string[]
}

// ──── Helpers ─────────────────────────────────────────────────────────────

/** Parse a participant code like "1A-001" into {group_code, number} */
function parseCode(code: string): { group: string; num: number } | null {
  const match = code.match(/^([1-5][AB])-(\d{3})$/)
  if (!match) return null
  return { group: match[1], num: parseInt(match[2], 10) }
}

/** Count how many participants will be created for preview */
function countParticipants(startCode: string, endCode: string): number | null {
  const start = parseCode(startCode)
  const end = parseCode(endCode)
  if (!start || !end) return null
  if (start.group !== end.group) return null
  if (end.num < start.num) return null
  return end.num - start.num + 1
}

// ──── Mode toggle ─────────────────────────────────────────────────────────

type Mode = 'single' | 'bulk'

// ──── Page ────────────────────────────────────────────────────────────────

export function ParticipantForm() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('single')

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <button
        onClick={() => navigate('/participants')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </button>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-fit" role="tablist" aria-label="Create mode">
        <button
          role="tab"
          aria-selected={mode === 'single'}
          aria-controls="panel-single"
          onClick={() => setMode('single')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer',
            mode === 'single'
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <UserPlus className="h-4 w-4" />
          Single
        </button>
        <button
          role="tab"
          aria-selected={mode === 'bulk'}
          aria-controls="panel-bulk"
          onClick={() => setMode('bulk')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer',
            mode === 'bulk'
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" />
          Bulk Create
        </button>
      </div>

      {mode === 'single' ? (
        <div id="panel-single" role="tabpanel" aria-label="Single participant creation">
          <SingleCreateForm onSuccess={() => navigate('/participants')} />
        </div>
      ) : (
        <div id="panel-bulk" role="tabpanel" aria-label="Bulk participant creation">
          <BulkCreateForm />
        </div>
      )}
    </div>
  )
}

// ──── Single create form (original form, unchanged logic) ─────────────────

function SingleCreateForm({ onSuccess }: { onSuccess: () => void }) {
  const createMutation = useCreateParticipant()
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ParticipantFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(participantSchema) as any,
    defaultValues: {
      enrollment_source: 'manual',
      wave: 1,
      enrollment_date: new Date().toISOString().slice(0, 16),
    },
  })

  const groupCode = watch('group_code')
  const participantNumber = watch('participant_number')

  async function onSubmit(data: ParticipantFormData) {
    try {
      await createMutation.mutateAsync({
        ...data,
        age_group: data.age_group as 1 | 2 | 3 | 4 | 5,
        enrollment_date: new Date(data.enrollment_date).toISOString(),
        date_of_birth: data.date_of_birth || undefined,
      })
      onSuccess()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Participant</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4">
          {/* Preview */}
          {groupCode && participantNumber && (
            <div className="rounded-md bg-muted px-4 py-2 mb-2">
              <span className="text-xs text-muted-foreground">Preview: </span>
              <span className="font-mono font-medium text-sm">
                {groupCode}-{String(participantNumber).padStart(3, '0')}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="participant_code">Participant Code</Label>
              <Input
                id="participant_code"
                placeholder="e.g. 1A-001"
                className="font-mono"
                {...register('participant_code')}
              />
              {errors.participant_code && (
                <p className="text-xs text-danger">{errors.participant_code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="group_code">Group Code</Label>
              <Input
                id="group_code"
                placeholder="e.g. 1A"
                className="font-mono"
                {...register('group_code')}
              />
              {errors.group_code && (
                <p className="text-xs text-danger">{errors.group_code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="participant_number">Number</Label>
              <Input
                id="participant_number"
                type="number"
                min={1}
                placeholder="e.g. 1"
                {...register('participant_number')}
              />
              {errors.participant_number && (
                <p className="text-xs text-danger">{errors.participant_number.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="collection_site_id">Collection Site</Label>
              <select
                id="collection_site_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={sitesLoading}
                {...register('collection_site_id')}
              >
                <option value="">Select a site...</option>
                {sites?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              {errors.collection_site_id && (
                <p className="text-xs text-danger">{errors.collection_site_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age_group">Age Group</Label>
              <select
                id="age_group"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('age_group')}
              >
                <option value="">Select...</option>
                <option value="1">1 (18-29)</option>
                <option value="2">2 (30-44)</option>
                <option value="3">3 (45-59)</option>
                <option value="4">4 (60-74)</option>
                <option value="5">5 (75+)</option>
              </select>
              {errors.age_group && (
                <p className="text-xs text-danger">{errors.age_group.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <select
                id="sex"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('sex')}
              >
                <option value="">Select...</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              {errors.sex && (
                <p className="text-xs text-danger">{errors.sex.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input id="date_of_birth" type="date" {...register('date_of_birth')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="enrollment_date">Enrollment Date</Label>
              <Input
                id="enrollment_date"
                type="datetime-local"
                {...register('enrollment_date')}
              />
              {errors.enrollment_date && (
                <p className="text-xs text-danger">{errors.enrollment_date.message}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Creating...
                </>
              ) : (
                'Create Participant'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ──── Bulk create form ────────────────────────────────────────────────────

function BulkCreateForm() {
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)
  const [isPending, setIsPending] = useState(false)
  const [result, setResult] = useState<BulkCreateResult | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<BulkFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bulkCreateSchema) as any,
    defaultValues: {
      enrollment_date: new Date().toISOString().slice(0, 16),
      wave: 1,
    },
  })

  const startCode = watch('start_code') ?? ''
  const endCode = watch('end_code') ?? ''
  const previewCount = countParticipants(startCode, endCode)

  async function onSubmit(data: BulkFormData) {
    setIsPending(true)
    setResult(null)
    setApiError(null)
    try {
      const response = await api.post<{ success: true; data: BulkCreateResult }>(
        '/participants/bulk-create',
        {
          start_code: data.start_code,
          end_code: data.end_code,
          collection_site_id: data.collection_site_id,
          enrollment_date: new Date(data.enrollment_date).toISOString(),
          wave: data.wave,
        }
      )
      setResult(response.data.data)
      reset()
    } catch (err) {
      setApiError(extractErrorMessage(err))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Create Participants</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Results panel */}
        {result && (
          <div className="mb-6 rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <span className="font-semibold text-success text-sm">Bulk create complete</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md bg-white border border-success/20 p-3 text-center">
                <p className="text-2xl font-bold text-success tabular-nums">{result.created}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Created</p>
              </div>
              <div className="rounded-md bg-white border border-warning/20 p-3 text-center">
                <p className="text-2xl font-bold text-warning tabular-nums">{result.skipped}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
              </div>
              <div className="rounded-md bg-white border border-danger/20 p-3 text-center">
                <p className="text-2xl font-bold text-danger tabular-nums">{result.errors.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-danger mb-1">Errors:</p>
                <ul className="text-xs text-danger space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i} className="font-mono">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {apiError && (
          <div className="mb-6 rounded-lg border border-danger/30 bg-danger/5 p-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-danger mt-0.5 flex-shrink-0" />
            <p className="text-sm text-danger">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4">
          {/* Format hint */}
          <div className="rounded-md bg-blue-50 border border-blue-100 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-medium mb-0.5">Participant code format</p>
              <p>
                <span className="font-mono">{'{age_group}{sex}-{number}'}</span> — e.g.{' '}
                <span className="font-mono">1A-001</span> (Age 18-29, Male, #1)
              </p>
              <p className="mt-1">Age groups: 1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+</p>
              <p>Sex: A=Male, B=Female</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_code">Start Code</Label>
              <Input
                id="start_code"
                placeholder="e.g. 1A-001"
                className="font-mono"
                {...register('start_code')}
              />
              {errors.start_code && (
                <p className="text-xs text-danger">{errors.start_code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_code">End Code</Label>
              <Input
                id="end_code"
                placeholder="e.g. 1A-050"
                className="font-mono"
                {...register('end_code')}
              />
              {errors.end_code && (
                <p className="text-xs text-danger">{errors.end_code.message}</p>
              )}
            </div>
          </div>

          {/* Preview count */}
          {startCode && endCode && (
            <div className={cn(
              'rounded-md px-4 py-2.5 text-sm',
              previewCount === null
                ? 'bg-danger/10 text-danger'
                : 'bg-muted text-muted-foreground'
            )}>
              {previewCount === null ? (
                'Invalid range — ensure both codes use the same group (e.g. 1A) and start number is less than end.'
              ) : (
                <>
                  <span className="text-foreground font-semibold tabular-nums">{previewCount}</span>{' '}
                  participant{previewCount !== 1 ? 's' : ''} will be created
                  {previewCount > 100 && (
                    <span className="ml-2 text-warning font-medium">— large batch, this may take a moment</span>
                  )}
                </>
              )}
            </div>
          )}

          <div className="col-span-2 space-y-2">
            <Label htmlFor="bulk_collection_site_id">Collection Site</Label>
            <select
              id="bulk_collection_site_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={sitesLoading}
              {...register('collection_site_id')}
            >
              <option value="">Select a site...</option>
              {sites?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            {errors.collection_site_id && (
              <p className="text-xs text-danger">{errors.collection_site_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bulk_enrollment_date">Enrollment Date</Label>
              <Input
                id="bulk_enrollment_date"
                type="datetime-local"
                {...register('enrollment_date')}
              />
              {errors.enrollment_date && (
                <p className="text-xs text-danger">{errors.enrollment_date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk_wave">Wave</Label>
              <Input
                id="bulk_wave"
                type="number"
                min={1}
                {...register('wave')}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={isPending || previewCount === null || previewCount === 0}
            >
              {isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  {previewCount && previewCount > 0
                    ? `Create ${previewCount} Participant${previewCount !== 1 ? 's' : ''}`
                    : 'Bulk Create'}
                </>
              )}
            </Button>
            {result && (
              <Badge variant="success" className="text-xs">
                Last run: {result.created} created
              </Badge>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
