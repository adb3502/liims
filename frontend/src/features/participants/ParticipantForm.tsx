import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateParticipant, useCollectionSites } from '@/api/participants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft } from 'lucide-react'

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

export function ParticipantForm() {
  const navigate = useNavigate()
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
      navigate('/participants')
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/participants')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Create Participant</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4">
            {/* Auto-preview of generated code */}
            {groupCode && participantNumber && (
              <div className="rounded-md bg-muted px-4 py-2 mb-2">
                <span className="text-xs text-muted-foreground">Preview: </span>
                <span className="font-mono font-medium text-sm">
                  {groupCode}-{String(participantNumber).padStart(3, '0')}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Participant code */}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="participant_code">Participant Code</Label>
                <Input
                  id="participant_code"
                  placeholder="e.g. 1A-001"
                  className="font-mono"
                  {...register('participant_code')}
                />
                {errors.participant_code && (
                  <p className="text-xs text-danger">
                    {errors.participant_code.message}
                  </p>
                )}
              </div>

              {/* Group code */}
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

              {/* Participant number */}
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
                  <p className="text-xs text-danger">
                    {errors.participant_number.message}
                  </p>
                )}
              </div>

              {/* Collection site */}
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
                  <p className="text-xs text-danger">
                    {errors.collection_site_id.message}
                  </p>
                )}
              </div>

              {/* Age group */}
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

              {/* Sex */}
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

              {/* Date of birth */}
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  {...register('date_of_birth')}
                />
              </div>

              {/* Enrollment date */}
              <div className="space-y-2">
                <Label htmlFor="enrollment_date">Enrollment Date</Label>
                <Input
                  id="enrollment_date"
                  type="datetime-local"
                  {...register('enrollment_date')}
                />
                {errors.enrollment_date && (
                  <p className="text-xs text-danger">
                    {errors.enrollment_date.message}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/participants')}
              >
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
    </div>
  )
}
