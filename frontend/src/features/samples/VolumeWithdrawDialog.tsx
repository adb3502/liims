import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useWithdrawVolume } from '@/api/samples'
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
import { cn } from '@/lib/utils'

const withdrawSchema = z.object({
  volume_ul: z.coerce.number().positive('Volume must be greater than 0'),
  reason: z.string().optional(),
})

type WithdrawFormData = z.infer<typeof withdrawSchema>

interface VolumeWithdrawDialogProps {
  sampleId: string
  sampleCode: string
  remainingVolumeUl: number
  initialVolumeUl: number
  onClose: () => void
}

export function VolumeWithdrawDialog({
  sampleId,
  sampleCode,
  remainingVolumeUl,
  initialVolumeUl,
  onClose,
}: VolumeWithdrawDialogProps) {
  const mutation = useWithdrawVolume(sampleId)
  const [previewAmount, setPreviewAmount] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WithdrawFormData>({
    resolver: zodResolver(withdrawSchema),
  })

  const afterWithdrawal = remainingVolumeUl - previewAmount
  const afterPct = initialVolumeUl > 0
    ? (afterWithdrawal / initialVolumeUl) * 100
    : 0
  const wouldExceed = previewAmount > remainingVolumeUl

  async function onSubmit(data: WithdrawFormData) {
    try {
      await mutation.mutateAsync({
        volume_ul: data.volume_ul,
        reason: data.reason || undefined,
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
          <DialogTitle>Withdraw Volume</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Sample <span className="font-mono font-medium text-foreground">{sampleCode}</span>
          </p>

          {/* Current volume display */}
          <div className="rounded-md bg-muted px-4 py-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Current volume</span>
              <span className="font-mono font-medium">
                {remainingVolumeUl.toLocaleString()} / {initialVolumeUl.toLocaleString()} uL
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-background overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  afterPct < 10 && 'bg-danger',
                  afterPct >= 10 && afterPct < 20 && 'bg-warning',
                  afterPct >= 20 && 'bg-primary'
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, (afterWithdrawal / initialVolumeUl) * 100))}%`,
                }}
              />
            </div>
            {previewAmount > 0 && (
              <div className="flex items-center justify-between text-xs mt-1.5">
                <span className="text-muted-foreground">After withdrawal</span>
                <span
                  className={cn(
                    'font-mono font-medium',
                    wouldExceed ? 'text-danger' : 'text-foreground'
                  )}
                >
                  {wouldExceed ? 'Exceeds remaining' : `${afterWithdrawal.toLocaleString()} uL`}
                </span>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="volume_ul">Withdrawal Amount (uL)</Label>
            <Input
              id="volume_ul"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingVolumeUl}
              placeholder="e.g. 50"
              className="font-mono"
              {...register('volume_ul', {
                onChange: (e) => setPreviewAmount(parseFloat(e.target.value) || 0),
              })}
            />
            {errors.volume_ul && (
              <p className="text-xs text-danger">{errors.volume_ul.message}</p>
            )}
            {wouldExceed && (
              <p className="text-xs text-danger">
                Cannot withdraw more than the remaining volume ({remainingVolumeUl} uL).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              placeholder="e.g. Aliquot for proteomics run"
              {...register('reason')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || wouldExceed}
            >
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Withdrawing...
                </>
              ) : (
                'Withdraw'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
