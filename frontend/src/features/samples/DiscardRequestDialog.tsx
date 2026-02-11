import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRequestDiscard } from '@/api/samples'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { DISCARD_REASON_LABELS, type DiscardReason } from '@/types'

const ALL_REASONS: DiscardReason[] = [
  'contamination',
  'depleted',
  'consent_withdrawal',
  'expired',
  'other',
]

const discardSchema = z.object({
  reason: z.enum(
    ['contamination', 'depleted', 'consent_withdrawal', 'expired', 'other'],
    { required_error: 'Reason is required' }
  ),
  reason_notes: z.string().optional(),
})

type DiscardFormData = z.infer<typeof discardSchema>

interface DiscardRequestDialogProps {
  sampleId: string
  sampleCode: string
  onClose: () => void
}

export function DiscardRequestDialog({
  sampleId,
  sampleCode,
  onClose,
}: DiscardRequestDialogProps) {
  const mutation = useRequestDiscard(sampleId)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DiscardFormData>({
    resolver: zodResolver(discardSchema),
  })

  async function onSubmit(data: DiscardFormData) {
    try {
      await mutation.mutateAsync({
        reason: data.reason,
        reason_notes: data.reason_notes || undefined,
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
          <DialogTitle>Request Discard</DialogTitle>
        </DialogHeader>

        <div className="mt-2 rounded-md bg-danger/5 border border-danger/20 px-4 py-3">
          <p className="text-sm text-danger">
            You are requesting to discard sample{' '}
            <span className="font-mono font-medium">{sampleCode}</span>.
            This will require approval from a lab manager.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <select
              id="reason"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('reason')}
            >
              <option value="">Select reason...</option>
              {ALL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DISCARD_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="text-xs text-danger">{errors.reason.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason_notes">Notes</Label>
            <textarea
              id="reason_notes"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Provide details about why this sample should be discarded..."
              {...register('reason_notes')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-destructive-foreground" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
