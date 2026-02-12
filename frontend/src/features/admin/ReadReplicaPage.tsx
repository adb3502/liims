import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Database,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Info,
  Settings,
} from 'lucide-react'

export function ReadReplicaPage() {
  const { isAdmin } = useAuth()
  const [isConfigured] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionSuccess, setConnectionSuccess] = useState<boolean | null>(null)

  // Placeholder values - in production, these would come from system settings API
  const [replicaHost, setReplicaHost] = useState('replica.liims.db.internal')
  const [replicaPort, setReplicaPort] = useState('5432')
  const [replicaDatabase, setReplicaDatabase] = useState('liims_replica')

  async function handleTestConnection() {
    setTestingConnection(true)
    setConnectionSuccess(null)

    // Simulate connection test - replace with actual API call in production
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // For now, just show placeholder behavior
    setConnectionSuccess(false)
    setTestingConnection(false)
  }

  if (!isAdmin()) {
    return (
      <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
        <p className="text-sm text-danger">
          You do not have permission to access this page.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Read Replica Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage read replica database settings for analytics and reporting.
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Read Replica Status</span>
            {isConfigured ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={isConfigured ? 'success' : 'secondary'}>
              {isConfigured ? 'Configured' : 'Not Configured'}
            </Badge>
            {!isConfigured && (
              <p className="text-sm text-muted-foreground">
                Read replica is not currently set up.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          About Read Replicas
        </h2>
        <div className="rounded-lg border border-border p-6 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">What is a read replica?</p>
            <p className="text-muted-foreground mt-1">
              A read replica is a read-only copy of the primary database that runs on a
              separate server. It allows you to offload read-heavy queries (like reports
              and analytics) from the primary database, improving overall performance.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Use cases</p>
            <p className="text-muted-foreground mt-1">
              Read replicas are ideal for long-running analytical queries, business
              intelligence dashboards, data exports, and third-party integrations that
              only need read access.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Replication lag</p>
            <p className="text-muted-foreground mt-1">
              Read replicas may be slightly behind the primary database (typically a
              few seconds). For real-time data requirements, always query the primary
              database.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          Configuration
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Database Connection Settings</CardTitle>
            <CardDescription>
              Configure the read replica database connection. These settings are typically
              managed by your database administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="replica-host">Host</Label>
              <Input
                id="replica-host"
                value={replicaHost}
                onChange={(e) => setReplicaHost(e.target.value)}
                placeholder="replica.example.com"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Hostname or IP address of the read replica server
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="replica-port">Port</Label>
              <Input
                id="replica-port"
                value={replicaPort}
                onChange={(e) => setReplicaPort(e.target.value)}
                placeholder="5432"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Database port (default: 5432 for PostgreSQL)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="replica-database">Database Name</Label>
              <Input
                id="replica-database"
                value={replicaDatabase}
                onChange={(e) => setReplicaDatabase(e.target.value)}
                placeholder="liims_replica"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Name of the replica database
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                onClick={handleTestConnection}
                disabled={testingConnection || !replicaHost || !replicaPort || !replicaDatabase}
              >
                <Database className="h-4 w-4" />
                {testingConnection ? 'Testing Connection...' : 'Test Connection'}
              </Button>

              {connectionSuccess === true && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Connection successful
                </div>
              )}

              {connectionSuccess === false && (
                <div className="flex items-center gap-2 text-sm text-danger">
                  <XCircle className="h-4 w-4" />
                  Connection failed - read replica not configured on backend
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deployment Documentation */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          Deployment Guide
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Setting Up Read Replicas</CardTitle>
            <CardDescription>
              Follow these steps to configure read replicas for your LIIMS deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-foreground mb-2">PostgreSQL Configuration</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Enable WAL archiving on the primary database</li>
                <li>Configure replication slots and standby servers</li>
                <li>Set up streaming replication from primary to replica</li>
                <li>Verify replication lag using pg_stat_replication</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground mb-2">Backend Configuration</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Add READ_REPLICA_HOST, READ_REPLICA_PORT, READ_REPLICA_DB to .env</li>
                <li>Update database.py to create a read-only session factory</li>
                <li>Modify report endpoints to use read replica sessions</li>
                <li>Test with EXPLAIN ANALYZE to verify query routing</li>
              </ol>
            </div>

            <div className="pt-4 border-t">
              <a
                href="https://www.postgresql.org/docs/current/warm-standby.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="inline-flex items-center gap-2">
                  PostgreSQL Replication Docs
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
