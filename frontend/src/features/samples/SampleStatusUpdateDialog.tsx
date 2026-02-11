import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useUpdateSampleStatus } from '@/api/samples'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { SampleStatus } from '@/types'
import { SAMPLE_STATUS_LABELS } from '@/types'

/**
 * Valid status transitions. Each status maps to possible next statuses.
 */
const VALID_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  registered: ['collected'],
  collected: ['transported', 'processing'],
  transported: ['received'],
  received: ['processing'],
  processing: ['stored'],
  stored: ['reserved', 'in_analysis', 'pending_discard'],
  reserved: ['stored', 'in_analysis'],
  in_analysis: ['stored'],
  pending_discard: ['discarded', 'stored'],
  depleted: [],
  discarded: [],
}

const statusSchema = z.object({
  status: z.string().min(1, 'Please select a status'),
  notes: z.string().optional(),
  location_context: z.string().optional(),
})

type StatusFormData = z.infer<typeof statusSchema>

interface SampleStatusUpdateDialogProps {
  sampleId: string
  currentStatus: SampleStatus
  onClose: () => void
}

export function SampleStatusUpdateDialog({
  sampleId,
  currentStatus,
  onClose,
}: SampleStatusUpdateDialogProps) {
  const mutation = useUpdateSampleStatus(sampleId)
  const nextStatuses = VALID_TRANSITIONS[currentStatus] ?? []

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StatusFormData>({
    resolver: zodResolver(statusSchema),
  })

  async function onSubmit(data: StatusFormData) {
    try {
      await mutation.mutateAsync({
        status: data.status as SampleStatus,
        notes: data.notes || undefined,
        location_context: data.location_context || undefined,
      })
      onClose()
    } catch {
      // Handled by mutation
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Update Sample Status</DialogTitle>
        </DialogHeader>

        {nextStatuses.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No status transitions available from{' '}
              <span className="font-medium">{SAMPLE_STATUS_LABELS[currentStatus]}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="status">New Status</Label>
              <select
                id="status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('status')}
              >
                <option value="">Select status...</option>
                {nextStatuses.map((s) => (
                  <option key={s} value={s}>
                    {SAMPLE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {errors.status && (
                <p className="text-xs text-danger">{errors.status.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location_context">Location Context</Label>
              <Input
                id="location_context"
                placeholder="e.g. Lab bench 3, Freezer F2-R1"
                {...register('location_context')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Optional notes about this status change..."
                {...register('notes')}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <>
                    <Spinner size="sm" className="text-primary-foreground" />
                    Updating...
                  </>
                ) : (
                  'Update Status'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
