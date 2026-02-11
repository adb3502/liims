import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

const ROUTE_LABELS: Record<string, string> = {
  participants: 'Participants',
  create: 'Create',
  'odk-sync': 'ODK Sync',
  samples: 'Samples',
  register: 'Register',
  processing: 'Processing',
  storage: 'Storage',
  freezers: 'Freezers',
  boxes: 'Boxes',
  search: 'Search',
  'field-ops': 'Field Operations',
  events: 'Events',
  digitization: 'Digitization',
  conflicts: 'Conflicts',
  partners: 'Partners',
  import: 'Import Data',
  history: 'Import History',
  results: 'Results',
  'stool-kits': 'Stool Kits',
  instruments: 'Instruments',
  queue: 'Queue',
  plates: 'Plate Designer',
  runs: 'Runs',
  omics: 'Omics Results',
  icc: 'ICC Workflow',
  reports: 'Reports',
  enrollment: 'Enrollment',
  inventory: 'Inventory',
  sites: 'Sites',
  'data-availability': 'Data Availability',
  quality: 'Quality',
  'query-builder': 'Query Builder',
  admin: 'Admin',
  users: 'Users',
  replica: 'Read Replica',
  'audit-logs': 'Audit Logs',
  'access-logs': 'Access Logs',
  settings: 'System Settings',
  notifications: 'Notifications',
  profile: 'Profile',
}

export function Breadcrumbs() {
  const location = useLocation()
  const pathSegments = location.pathname.split('/').filter(Boolean)

  if (pathSegments.length === 0) return null

  return (
    <nav className="flex items-center text-sm text-muted-foreground" aria-label="Breadcrumb">
      <Link
        to="/"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>
      {pathSegments.map((segment, index) => {
        const path = '/' + pathSegments.slice(0, index + 1).join('/')
        const isLast = index === pathSegments.length - 1
        const label = ROUTE_LABELS[segment] ?? segment

        // Skip UUID-like segments in breadcrumb labels (show "Detail" instead)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(segment)
        const displayLabel = isUuid ? 'Detail' : label

        return (
          <span key={path} className="flex items-center">
            <ChevronRight className="mx-2 h-3.5 w-3.5" />
            {isLast ? (
              <span className="font-medium text-foreground">{displayLabel}</span>
            ) : (
              <Link
                to={path}
                className="hover:text-foreground transition-colors"
              >
                {displayLabel}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
