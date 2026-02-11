import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateFieldEvent } from '@/api/field-events'
import { useCollectionSites } from '@/api/participants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { FieldEventType, PartnerName } from '@/types'
import { FIELD_EVENT_TYPE_LABELS, PARTNER_LABELS } from '@/types'

const ALL_EVENT_TYPES: FieldEventType[] = ['rural_mass', 'urban_scheduled']
const ALL_PARTNERS: PartnerName[] = ['healthians', '1mg', 'lalpath', 'decodeage']

const fieldEventSchema = z.object({
  event_name: z.string().min(1, 'Event name is required').max(200),
  event_date: z.string().min(1, 'Event date is required'),
  collection_site_id: z.string().uuid('Please select a site'),
  event_type: z.enum(['rural_mass', 'urban_scheduled'], {
    required_error: 'Event type is required',
  }),
  expected_participants: z.coerce.number().int().positive().optional(),
  coordinator_id: z.string().optional(),
  partner_lab: z.string().optional(),
  notes: z.string().optional(),
  wave: z.coerce.number().int().min(1).default(1),
})

type FieldEventFormData = z.infer<typeof fieldEventSchema>

export function FieldEventCreateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const createMutation = useCreateFieldEvent()
  const { data: sites, isLoading: sitesLoading } = useCollectionSites(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldEventFormData>({
    resolver: zodResolver(fieldEventSchema),
    defaultValues: {
      event_type: 'rural_mass',
      wave: 1,
    },
  })

  async function onSubmit(data: FieldEventFormData) {
    try {
      await createMutation.mutateAsync({
        event_name: data.event_name,
        event_date: data.event_date,
        collection_site_id: data.collection_site_id,
        event_type: data.event_type as FieldEventType,
        expected_participants: data.expected_participants,
        coordinator_id: data.coordinator_id || undefined,
        partner_lab: (data.partner_lab as PartnerName) || undefined,
        notes: data.notes || undefined,
        wave: data.wave,
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Field Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="event_name">Event Name</Label>
            <Input
              id="event_name"
              placeholder="e.g. Wave 1 - Kanakapura Road Camp"
              {...register('event_name')}
            />
            {errors.event_name && (
              <p className="text-xs text-danger">{errors.event_name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event_date">Date</Label>
              <Input
                id="event_date"
                type="date"
                {...register('event_date')}
              />
              {errors.event_date && (
                <p className="text-xs text-danger">{errors.event_date.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event_type">Type</Label>
              <select
                id="event_type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('event_type')}
              >
                {ALL_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_EVENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="expected_participants">Expected Participants</Label>
              <Input
                id="expected_participants"
                type="number"
                min={1}
                placeholder="e.g. 50"
                {...register('expected_participants')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wave">Wave</Label>
              <Input
                id="wave"
                type="number"
                min={1}
                {...register('wave')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="partner_lab">Partner Lab (optional)</Label>
            <select
              id="partner_lab"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('partner_lab')}
            >
              <option value="">None</option>
              {ALL_PARTNERS.map((p) => (
                <option key={p} value={p}>
                  {PARTNER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Additional notes..."
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Creating...
                </>
              ) : (
                'Create Event'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
