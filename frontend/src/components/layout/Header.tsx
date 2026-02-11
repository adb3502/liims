import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { cn } from '@/lib/utils'
import { Bell, LogOut, User, Settings, Menu } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  lab_manager: 'Lab Manager',
  lab_technician: 'Lab Technician',
  field_coordinator: 'Field Coordinator',
  data_entry: 'Data Entry',
  collaborator: 'Collaborator',
  pi_researcher: 'PI / Researcher',
}

interface HeaderProps {
  onMobileMenuToggle: () => void
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { unreadCount, notifications, fetchNotifications, markAsRead } =
    useNotificationStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleNotificationClick() {
    if (!showNotifications) {
      fetchNotifications()
    }
    setShowNotifications(!showNotifications)
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden rounded-md p-2 text-muted-foreground hover:bg-accent cursor-pointer"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleNotificationClick}
            className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border border-border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.is_read) markAsRead(n.id)
                      }}
                      className={cn(
                        'w-full px-4 py-3 text-left hover:bg-accent transition-colors cursor-pointer border-b border-border last:border-0',
                        !n.is_read && 'bg-primary/5'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            n.severity === 'critical' && 'bg-danger',
                            n.severity === 'warning' && 'bg-warning',
                            n.severity === 'info' && 'bg-primary'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {n.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="border-t border-border px-4 py-2">
                  <button
                    onClick={() => {
                      navigate('/notifications')
                      setShowNotifications(false)
                    }}
                    className="w-full text-center text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    View all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user?.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) ?? 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium leading-tight">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {user?.role ? ROLE_LABELS[user.role] ?? user.role : ''}
              </p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 z-50 w-56 rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate('/profile')
                    setShowUserMenu(false)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  <User className="h-4 w-4" />
                  Profile
                </button>
                {user?.role && ['super_admin', 'lab_manager'].includes(user.role) && (
                  <button
                    onClick={() => {
                      navigate('/admin/settings')
                      setShowUserMenu(false)
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                )}
              </div>
              <div className="border-t border-border py-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-accent transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
