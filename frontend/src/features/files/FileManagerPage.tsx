import { useState, useMemo, useCallback } from 'react'
import {
  useFiles,
  useDeleteFile,
  useWatchDirectories,
  useCreateWatchDirectory,
  useUpdateWatchDirectory,
  useScanWatchDirectory,
  useVerifyFileIntegrity,
  FILE_CATEGORY_LABELS,
  type FileCategory,
  type ManagedFile,
  type WatchDirectory,
} from '@/api/files'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSpinner } from '@/components/ui/spinner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  HardDrive,
  FolderSearch,
  Plus,
  ChevronLeft,
  ChevronRight,
  FileIcon,
  Search,
  RefreshCw,
  Eye,
  ShieldCheck,
  Trash2,
  FolderOpen,
  Activity,
  Database,
  Hash,
  Clock,
  Link2,
  FileType,
  Ruler,
  Power,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

const PER_PAGE = 20
const ALL_CATEGORIES: FileCategory[] = [
  'instrument_output',
  'partner_data',
  'icc_image',
  'report',
  'omics_data',
  'other',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function categoryColor(cat: FileCategory): string {
  const map: Record<FileCategory, string> = {
    instrument_output: 'bg-primary/10 text-primary border-primary/20',
    partner_data: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    icc_image: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    report: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    omics_data: 'bg-primary-teal/10 text-primary-teal border-primary-teal/20',
    other: 'bg-muted text-muted-foreground border-border',
  }
  return map[cat] ?? map.other
}

// -- Stat indicator used in header --
function StatBlock({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/60 border border-border/60">
      <div className="flex items-center justify-center h-9 w-9 rounded-md bg-background border border-border text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono text-foreground leading-tight">{value}</p>
      </div>
    </div>
  )
}


export function FileManagerPage() {
  const { hasRole } = useAuth()
  const canAdmin = hasRole('super_admin', 'lab_manager')

  // File list state
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | ''>('')

  // Dialogs
  const [detailFile, setDetailFile] = useState<ManagedFile | null>(null)
  const [watchDirOpen, setWatchDirOpen] = useState(false)
  const [showWatchDirs, setShowWatchDirs] = useState(false)

  // Watch dir form
  const [watchPath, setWatchPath] = useState('')
  const [watchCategory, setWatchCategory] = useState<FileCategory>('instrument_output')
  const [watchPattern, setWatchPattern] = useState('*')

  // Integrity verification
  const [verifyResult, setVerifyResult] = useState<{
    file_id: string
    match?: boolean
    error?: string | null
    stored_checksum?: string
    current_checksum?: string | null
  } | null>(null)

  // Queries
  const queryParams = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      search: searchTerm || undefined,
      category: categoryFilter || undefined,
    }),
    [page, searchTerm, categoryFilter],
  )

  const { data, isLoading, isError } = useFiles(queryParams)
  const { data: watchDirsData } = useWatchDirectories({ include_inactive: true })

  // Mutations
  const deleteMutation = useDeleteFile()
  const createWatchDirMutation = useCreateWatchDirectory()
  const updateWatchDirMutation = useUpdateWatchDirectory()
  const scanMutation = useScanWatchDirectory()
  const verifyMutation = useVerifyFileIntegrity()

  const files = data?.data ?? []
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0
  const totalFiles = data?.meta?.total ?? 0
  const watchDirs = (watchDirsData?.data ?? []) as WatchDirectory[]
  const activeWatchDirs = watchDirs.filter((w) => w.is_active).length

  const handleSearch = useCallback(() => {
    setSearchTerm(searchInput)
    setPage(1)
  }, [searchInput])

  const handleDelete = useCallback(
    async (fileId: string) => {
      if (!confirm('Remove this file record? The file on the NAS will not be affected.')) return
      try {
        await deleteMutation.mutateAsync(fileId)
        setDetailFile(null)
      } catch {
        // handled by query
      }
    },
    [deleteMutation],
  )

  const handleCreateWatchDir = useCallback(async () => {
    if (!watchPath.trim()) return
    try {
      await createWatchDirMutation.mutateAsync({
        path: watchPath,
        category: watchCategory,
        file_pattern: watchPattern || '*',
      })
      setWatchDirOpen(false)
      setWatchPath('')
      setWatchPattern('*')
    } catch {
      // handled by query
    }
  }, [watchPath, watchCategory, watchPattern, createWatchDirMutation])

  const handleToggleActive = useCallback(
    async (wd: WatchDirectory) => {
      try {
        await updateWatchDirMutation.mutateAsync({
          id: wd.id,
          is_active: !wd.is_active,
        })
      } catch {
        // handled by query
      }
    },
    [updateWatchDirMutation],
  )

  const handleVerify = useCallback(
    async (fileId: string) => {
      setVerifyResult(null)
      try {
        const result = await verifyMutation.mutateAsync(fileId)
        setVerifyResult(result)
      } catch {
        setVerifyResult({ file_id: fileId, error: 'Verification request failed.' })
      }
    },
    [verifyMutation],
  )

  return (
    <div className="space-y-6">
      {/* ---- Header with system status indicators ---- */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center h-8 w-8 rounded-md bg-gradient-primary">
            <HardDrive className="h-4.5 w-4.5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            NAS File Manager
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-11">
          Metadata registry for files discovered on network-attached storage. Files are read-only on the NAS.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock
          label="Registered Files"
          value={totalFiles.toLocaleString()}
          icon={<Database className="h-4 w-4" />}
        />
        <StatBlock
          label="Watch Directories"
          value={`${activeWatchDirs} active`}
          icon={<FolderSearch className="h-4 w-4" />}
        />
        <StatBlock
          label="Scan Interval"
          value="5 min"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatBlock
          label="Integrity Check"
          value="Hourly"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      {/* ---- Watch Directories Section ---- */}
      {canAdmin && (
        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle
                className="text-base font-semibold flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setShowWatchDirs(!showWatchDirs)}
              >
                <FolderOpen className="h-4.5 w-4.5 text-primary-teal" />
                Watch Directories
                <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
                  {watchDirs.length}
                </Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowWatchDirs(!showWatchDirs)}
                  className="text-xs"
                >
                  {showWatchDirs ? 'Collapse' : 'Expand'}
                </Button>
                <Button size="sm" onClick={() => setWatchDirOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Directory
                </Button>
              </div>
            </div>
          </CardHeader>

          {showWatchDirs && (
            <CardContent>
              {watchDirs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <FolderSearch className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No watch directories configured. Add one to start discovering files.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">NAS Path</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">Pattern</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">Last Scanned</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider w-36">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {watchDirs.map((wd) => (
                        <TableRow key={wd.id} className={cn(!wd.is_active && 'opacity-50')}>
                          <TableCell>
                            {wd.is_active ? (
                              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                                </span>
                                Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                                Inactive
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded border border-border/60">
                              {wd.path}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] font-mono border', categoryColor(wd.category))}
                            >
                              {FILE_CATEGORY_LABELS[wd.category]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs font-mono text-muted-foreground">{wd.file_pattern}</code>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {wd.last_scanned_at ? formatTimestamp(wd.last_scanned_at) : (
                              <span className="text-warning">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => scanMutation.mutate(wd.id)}
                                disabled={scanMutation.isPending || !wd.is_active}
                                title="Trigger manual scan"
                              >
                                <RefreshCw
                                  className={cn('h-3 w-3', scanMutation.isPending && 'animate-spin')}
                                />
                                Scan
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleToggleActive(wd)}
                                title={wd.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {wd.is_active ? (
                                  <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <Power className="h-3.5 w-3.5 text-success" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Scan result toast-like feedback */}
              {scanMutation.isSuccess && scanMutation.data && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Scan complete: {scanMutation.data.meta.files_ingested} new file(s) registered.
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ---- File Registry ---- */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-primary" />
              File Registry
            </CardTitle>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value as FileCategory | '')
                  setPage(1)
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {FILE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <PageSpinner />
          ) : isError ? (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-danger mb-2" />
              <p className="text-sm text-danger">Failed to load file registry.</p>
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <FileIcon className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No files registered</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchTerm || categoryFilter
                  ? 'Try adjusting your search or filter.'
                  : 'Files will appear here after a watch directory scan discovers them on the NAS.'}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs uppercase tracking-wider">File Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-right">Size</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Discovered</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Entity</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((f) => (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer"
                        onClick={() => setDetailFile(f)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate max-w-[280px]" title={f.file_name}>
                              {f.file_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] font-mono border', categoryColor(f.category))}
                          >
                            {FILE_CATEGORY_LABELS[f.category]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatFileSize(f.file_size)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(f.discovered_at)}
                        </TableCell>
                        <TableCell>
                          {f.entity_type ? (
                            <code className="text-[10px] font-mono bg-muted/60 px-1.5 py-0.5 rounded border border-border/60">
                              {f.entity_type}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">---</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="View details"
                              onClick={() => setDetailFile(f)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {canAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-danger hover:text-danger"
                                title="Remove record"
                                onClick={() => handleDelete(f.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs font-mono text-muted-foreground">
                    Page {page}/{totalPages} -- {totalFiles.toLocaleString()} records
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- File Detail Dialog ---- */}
      {detailFile && (
        <Dialog open={!!detailFile} onOpenChange={() => { setDetailFile(null); setVerifyResult(null) }}>
          <DialogContent
            onClose={() => { setDetailFile(null); setVerifyResult(null) }}
            className="max-w-xl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileIcon className="h-4.5 w-4.5 text-primary" />
                File Metadata
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-3">
              {/* File name banner */}
              <div className="rounded-md bg-muted/60 border border-border/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">File Name</p>
                <p className="font-mono text-sm font-semibold break-all">{detailFile.file_name}</p>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-3">
                <MetaRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="NAS Path">
                  <code className="text-xs font-mono break-all">{detailFile.file_path}</code>
                </MetaRow>
                <MetaRow icon={<Ruler className="h-3.5 w-3.5" />} label="File Size">
                  <span className="font-mono text-sm">{formatFileSize(detailFile.file_size)}</span>
                </MetaRow>
                <MetaRow icon={<FileType className="h-3.5 w-3.5" />} label="MIME Type">
                  <code className="text-xs font-mono">{detailFile.mime_type}</code>
                </MetaRow>
                <MetaRow icon={<Database className="h-3.5 w-3.5" />} label="Category">
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] font-mono border', categoryColor(detailFile.category))}
                  >
                    {FILE_CATEGORY_LABELS[detailFile.category]}
                  </Badge>
                </MetaRow>
                <MetaRow icon={<Clock className="h-3.5 w-3.5" />} label="Discovered">
                  <span className="font-mono text-xs">{formatTimestamp(detailFile.discovered_at)}</span>
                </MetaRow>
                <MetaRow icon={<Activity className="h-3.5 w-3.5" />} label="Processed">
                  <Badge variant={detailFile.processed ? 'success' : 'secondary'} className="text-[10px]">
                    {detailFile.processed ? 'Yes' : 'No'}
                  </Badge>
                  {detailFile.processed_at && (
                    <span className="text-[10px] font-mono text-muted-foreground ml-1">
                      {formatTimestamp(detailFile.processed_at)}
                    </span>
                  )}
                </MetaRow>
              </div>

              {/* SHA-256 */}
              <div className="rounded-md bg-muted/40 border border-border/60 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    SHA-256 Checksum
                  </p>
                </div>
                <code className="text-[11px] font-mono text-foreground/80 break-all select-all">
                  {detailFile.checksum_sha256}
                </code>
              </div>

              {/* Entity association */}
              {detailFile.entity_type && (
                <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <Link2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">
                      Associated Entity
                    </p>
                    <code className="text-xs font-mono">
                      {detailFile.entity_type} / {detailFile.entity_id}
                    </code>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailFile.notes && (
                <div className="text-sm text-muted-foreground border-l-2 border-border pl-3">
                  {detailFile.notes}
                </div>
              )}

              {/* Integrity verification */}
              {canAdmin && (
                <div className="border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Integrity Verification
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleVerify(detailFile.id)}
                      disabled={verifyMutation.isPending}
                    >
                      <ShieldCheck className={cn('h-3.5 w-3.5', verifyMutation.isPending && 'animate-pulse')} />
                      {verifyMutation.isPending ? 'Verifying...' : 'Verify Checksum'}
                    </Button>
                  </div>

                  {verifyResult && verifyResult.file_id === detailFile.id && (
                    <div
                      className={cn(
                        'mt-2 rounded-md border p-3 text-xs',
                        verifyResult.error
                          ? 'border-danger/30 bg-danger/5'
                          : verifyResult.match
                            ? 'border-success/30 bg-success/5'
                            : 'border-warning/30 bg-warning/5',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {verifyResult.error ? (
                          <XCircle className="h-3.5 w-3.5 text-danger" />
                        ) : verifyResult.match ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        )}
                        <span className="font-semibold">
                          {verifyResult.error
                            ? 'Error'
                            : verifyResult.match
                              ? 'Integrity OK'
                              : 'Checksum Mismatch'}
                        </span>
                      </div>
                      {verifyResult.error && (
                        <p className="text-danger/80">{verifyResult.error}</p>
                      )}
                      {verifyResult.current_checksum && !verifyResult.match && (
                        <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                          <p>Stored: {verifyResult.stored_checksum}</p>
                          <p>Current: {verifyResult.current_checksum}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              {canAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(detailFile.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Record
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ---- Create Watch Directory Dialog ---- */}
      <Dialog open={watchDirOpen} onOpenChange={setWatchDirOpen}>
        <DialogContent onClose={() => setWatchDirOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary-teal" />
              Add Watch Directory
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                NAS Directory Path
              </label>
              <input
                type="text"
                value={watchPath}
                onChange={(e) => setWatchPath(e.target.value)}
                placeholder="/data/nas/instrument_output"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Category
                </label>
                <select
                  value={watchCategory}
                  onChange={(e) => setWatchCategory(e.target.value as FileCategory)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {FILE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  File Pattern
                </label>
                <input
                  type="text"
                  value={watchPattern}
                  onChange={(e) => setWatchPattern(e.target.value)}
                  placeholder="*.csv"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWatchDirOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateWatchDir}
              disabled={!watchPath.trim() || createWatchDirMutation.isPending}
            >
              {createWatchDirMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// -- Small helper component for metadata rows in the detail dialog --
function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  )
}
