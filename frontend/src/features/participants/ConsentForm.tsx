import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAddConsent } from '@/api/participants'
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

const consentSchema = z.object({
  consent_type: z.enum(
    ['household', 'individual', 'dbs_storage', 'proxy_interview'],
    { required_error: 'Consent type is required' }
  ),
  consent_given: z.boolean(),
  consent_date: z.string().min(1, 'Consent date is required'),
  is_proxy: z.boolean().default(false),
  witness_name: z.string().optional(),
  form_version: z.string().optional(),
})

type ConsentFormData = z.infer<typeof consentSchema>

interface ConsentFormProps {
  participantId: string
  onClose: () => void
}

export function ConsentForm({ participantId, onClose }: ConsentFormProps) {
  const addConsent = useAddConsent(participantId)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConsentFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(consentSchema) as any,
    defaultValues: {
      consent_given: true,
      is_proxy: false,
      consent_date: new Date().toISOString().slice(0, 10),
    },
  })

  async function onSubmit(data: ConsentFormData) {
    try {
      await addConsent.mutateAsync({
        ...data,
        consent_date: data.consent_date,
        witness_name: data.witness_name || undefined,
        form_version: data.form_version || undefined,
      })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Record Consent</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4 mt-4">
          {/* Consent type */}
          <div className="space-y-2">
            <Label htmlFor="consent_type">Consent Type</Label>
            <select
              id="consent_type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('consent_type')}
            >
              <option value="">Select type...</option>
              <option value="household">Household</option>
              <option value="individual">Individual</option>
              <option value="dbs_storage">DBS Storage</option>
              <option value="proxy_interview">Proxy Interview</option>
            </select>
            {errors.consent_type && (
              <p className="text-xs text-danger">{errors.consent_type.message}</p>
            )}
          </div>

          {/* Consent date */}
          <div className="space-y-2">
            <Label htmlFor="consent_date">Date</Label>
            <Input id="consent_date" type="date" {...register('consent_date')} />
            {errors.consent_date && (
              <p className="text-xs text-danger">{errors.consent_date.message}</p>
            )}
          </div>

          {/* Consent given */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="consent_given"
              className="h-4 w-4 rounded border-input"
              {...register('consent_given')}
            />
            <Label htmlFor="consent_given">Consent given</Label>
          </div>

          {/* Is proxy */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_proxy"
              className="h-4 w-4 rounded border-input"
              {...register('is_proxy')}
            />
            <Label htmlFor="is_proxy">Proxy consent</Label>
          </div>

          {/* Witness name */}
          <div className="space-y-2">
            <Label htmlFor="witness_name">Witness Name</Label>
            <Input
              id="witness_name"
              placeholder="Optional"
              {...register('witness_name')}
            />
          </div>

          {/* Form version */}
          <div className="space-y-2">
            <Label htmlFor="form_version">Form Version</Label>
            <Input
              id="form_version"
              placeholder="e.g. v2.0"
              {...register('form_version')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addConsent.isPending}>
              {addConsent.isPending ? (
                <>
                  <Spinner size="sm" className="text-primary-foreground" />
                  Saving...
                </>
              ) : (
                'Save Consent'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
