import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateSample } from '@/api/samples'
import { useCollectionSites } from '@/api/participants'
import { useParticipants } from '@/api/participants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { SampleType } from '@/types'

const SAMPLE_TYPE_OPTIONS: { value: SampleType; label: string; hasVolume: boolean }[] = [
  { value: 'plasma', label: 'Plasma', hasVolume: true },
  { value: 'epigenetics', label: 'Epigenetics', hasVolume: true },
  { value: 'extra_blood', label: 'Extra Blood', hasVolume: true },
  { value: 'rbc_smear', label: 'RBC Smear', hasVolume: false },
  { value: 'cheek_swab', label: 'Cheek Swab', hasVolume: false },
  { value: 'hair', label: 'Hair', hasVolume: false },
  { value: 'urine', label: 'Urine', hasVolume: true },
  { value: 'stool_kit', label: 'Stool Kit', hasVolume: false },
]

const LIQUID_TYPES: SampleType[] = ['plasma', 'epigenetics', 'extra_blood', 'urine']

const sampleSchema = z.object({
  participant_id: z.string().uuid('Please select a participant'),
  sample_type: z.enum(
    ['plasma', 'epigenetics', 'extra_blood', 'rbc_smear', 'cheek_swab', 'hair', 'urine', 'stool_kit'],
    { required_error: 'Sample type is required' }
  ),
  initial_volume_ul: z.coerce.number().positive('Volume must be positive').optional(),
  collection_site_id: z.string().uuid('Please select a collection site').optional(),
  notes: z.string().optional(),
  wave: z.coerce.number().int().min(1).optional().default(1),
})

type SampleFormData = z.infer<typeof sampleSchema>

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SampleRegisterForm() {
  const navigate = useNavigate()
  const createMutation = useCreateSample()
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)

  // Participant search
  const [participantSearch, setParticipantSearch] = useState('')
  const debouncedParticipantSearch = useDebounce(participantSearch, 300)
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false)

  const { data: participantsData } = useParticipants({
    search: debouncedParticipantSearch || undefined,
    per_page: 10,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<SampleFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(sampleSchema) as any,
    defaultValues: {
      wave: 1,
    },
  })

  const selectedType = watch('sample_type') as SampleType | undefined
  const selectedParticipantId = watch('participant_id')
  const isLiquid = selectedType ? LIQUID_TYPES.includes(selectedType) : false

  // Track selected participant display name
  const [selectedParticipantLabel, setSelectedParticipantLabel] = useState('')

  async function onSubmit(data: SampleFormData) {
    try {
      const payload: Record<string, unknown> = {
        participant_id: data.participant_id,
        sample_type: data.sample_type,
        collection_site_id: data.collection_site_id || undefined,
        notes: data.notes || undefined,
        wave: data.wave,
      }
      if (isLiquid && data.initial_volume_ul) {
        payload.initial_volume_ul = data.initial_volume_ul
      }
      const result = await createMutation.mutateAsync(payload as unknown as Parameters<typeof createMutation.mutateAsync>[0])
      navigate(`/samples/${result.id}`)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/samples')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Samples
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Register Sample</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4">
            {/* Participant search */}
            <div className="space-y-2">
              <Label htmlFor="participant_search">Participant</Label>
              <div className="relative">
                <Input
                  id="participant_search"
                  placeholder="Search participants by code..."
                  value={selectedParticipantLabel || participantSearch}
                  onChange={(e) => {
                    setParticipantSearch(e.target.value)
                    setSelectedParticipantLabel('')
                    setValue('participant_id', '')
                    setShowParticipantDropdown(true)
                  }}
                  onFocus={() => setShowParticipantDropdown(true)}
                  className="font-mono"
                />
                {showParticipantDropdown && participantsData?.data && participantsData.data.length > 0 && !selectedParticipantId && (
                  <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                    {participantsData.data.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm cursor-pointer"
                        onClick={() => {
                          setValue('participant_id', p.id)
                          setSelectedParticipantLabel(p.participant_code)
                          setParticipantSearch('')
                          setShowParticipantDropdown(false)
                        }}
                      >
                        <span className="font-mono font-medium">{p.participant_code}</span>
                        <span className="text-muted-foreground ml-2">
                          ({p.sex === 'M' ? 'Male' : 'Female'}, Wave {p.wave})
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type="hidden" {...register('participant_id')} />
              {errors.participant_id && (
                <p className="text-xs text-danger">{errors.participant_id.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Sample type */}
              <div className="space-y-2">
                <Label htmlFor="sample_type">Sample Type</Label>
                <select
                  id="sample_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...register('sample_type')}
                >
                  <option value="">Select type...</option>
                  {SAMPLE_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {errors.sample_type && (
                  <p className="text-xs text-danger">{errors.sample_type.message}</p>
                )}
              </div>

              {/* Wave */}
              <div className="space-y-2">
                <Label htmlFor="wave">Wave</Label>
                <Input
                  id="wave"
                  type="number"
                  min={1}
                  {...register('wave')}
                />
              </div>

              {/* Volume (conditional) */}
              {isLiquid && (
                <div className="space-y-2">
                  <Label htmlFor="initial_volume_ul">Initial Volume (uL)</Label>
                  <Input
                    id="initial_volume_ul"
                    type="number"
                    min={1}
                    step="0.01"
                    placeholder="e.g. 2500"
                    className="font-mono"
                    {...register('initial_volume_ul')}
                  />
                  {errors.initial_volume_ul && (
                    <p className="text-xs text-danger">{errors.initial_volume_ul.message}</p>
                  )}
                </div>
              )}

              {/* Collection site */}
              <div className={isLiquid ? 'space-y-2' : 'col-span-2 space-y-2'}>
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
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Any additional notes about this sample..."
                {...register('notes')}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/samples')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="text-primary-foreground" />
                    Registering...
                  </>
                ) : (
                  'Register Sample'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
