import { useState } from 'react'
import { useMe, useChangePassword } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageSpinner } from '@/components/ui/spinner'
import { User, Lock, Mail, Shield, Calendar, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI / Researcher',
}

export function ProfilePage() {
  const { user: authUser } = useAuth()
  const { data: user, isLoading } = useMe()
  const changePassword = useChangePassword()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }

    if (!/[A-Z]/.test(newPassword)) {
      setPasswordError('New password must contain at least one uppercase letter.')
      return
    }

    if (!/[a-z]/.test(newPassword)) {
      setPasswordError('New password must contain at least one lowercase letter.')
      return
    }

    if (!/[0-9]/.test(newPassword)) {
      setPasswordError('New password must contain at least one digit.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.')
      return
    }

    changePassword.mutate(
      {
        current_password: currentPassword,
        new_password: newPassword,
      },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <PageSpinner />
      </div>
    )
  }

  const displayUser = user ?? authUser

  if (!displayUser) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">Unable to load user profile.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Profile</h1>

      {/* Profile Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Your account details and role information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Full Name</Label>
              <div className="mt-1 text-base font-medium text-foreground">
                {displayUser.full_name}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <div className="mt-1 text-base text-foreground">{displayUser.email}</div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Role
              </Label>
              <div className="mt-1">
                <Badge variant="default">{ROLE_LABELS[displayUser.role] ?? displayUser.role}</Badge>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Account Status</Label>
              <div className="mt-1 flex items-center gap-2">
                {displayUser.is_active ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm text-success">Active</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">Inactive</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Member Since
              </Label>
              <div className="mt-1 text-base text-foreground">
                {format(new Date(displayUser.created_at), 'MMMM d, yyyy')}
              </div>
            </div>

            {displayUser.last_login && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Last Login</Label>
                <div className="mt-1 text-base text-foreground">
                  {format(new Date(displayUser.last_login), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="mt-1"
              />
            </div>

            {/* Password Requirements */}
            <div className="rounded-md bg-muted p-4">
              <p className="text-sm font-medium text-foreground mb-2">Password Requirements:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Minimum 8 characters</li>
                <li>• At least one uppercase letter</li>
                <li>• At least one lowercase letter</li>
                <li>• At least one digit</li>
              </ul>
            </div>

            {passwordError && (
              <div className="text-sm text-destructive">{passwordError}</div>
            )}

            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? 'Changing Password...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
