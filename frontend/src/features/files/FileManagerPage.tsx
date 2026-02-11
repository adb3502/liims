import { useState, useMemo, useCallback, useRef } from 'react'
import {
  useFiles,
  useFileUpload,
  useFileDownload,
  useDeleteFile,
  useWatchDirectories,
  useCreateWatchDirectory,
  useScanWatchDirectory,
  FILE_CATEGORY_LABELS,
  type FileCategory,
  type ManagedFile,
} from '@/api/files'
import { useAuth } from '@/hooks/useAuth'
import { extractErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Upload,
  Download,
  Trash2,
  FolderSearch,
  Plus,
  ChevronLeft,
  ChevronRight,
  FileIcon,
  ImageIcon,
  FileText,
  Search,
  FolderOpen,
  RefreshCw,
  Eye,
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

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-purple-500" />
  if (contentType === 'application/pdf' || contentType.startsWith('text/'))
    return <FileText className="h-4 w-4 text-blue-500" />
  return <FileIcon className="h-4 w-4 text-muted-foreground" />
}

export function FileManagerPage() {
  const { hasRole } = useAuth()
  const canWrite = hasRole('super_admin', 'lab_manager', 'lab_technician')
  const canAdmin = hasRole('super_admin', 'lab_manager')

  // File list state
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | ''>('')

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailFile, setDetailFile] = useState<ManagedFile | null>(null)
  const [watchDirOpen, setWatchDirOpen] = useState(false)
  const [showWatchDirs, setShowWatchDirs] = useState(false)

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState<FileCategory>('other')
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Watch dir form
  const [watchPath, setWatchPath] = useState('')
  const [watchCategory, setWatchCategory] = useState<FileCategory>('instrument_output')
  const [watchPattern, setWatchPattern] = useState('*')

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
  const { data: watchDirsData } = useWatchDirectories()

  // Mutations
  const uploadMutation = useFileUpload()
  const deleteMutation = useDeleteFile()
  const createWatchDirMutation = useCreateWatchDirectory()
  const scanMutation = useScanWatchDirectory()
  const { download } = useFileDownload()

  const files = data?.data ?? []
  const totalPages = data?.meta ? Math.ceil(data.meta.total / data.meta.per_page) : 0
  const watchDirs = watchDirsData?.data ?? []

  const handleSearch = useCallback(() => {
    setSearchTerm(searchInput)
    setPage(1)
  }, [searchInput])

  const handleUpload = useCallback(async () => {
    if (!uploadFile) return
    setUploadError('')
    try {
      await uploadMutation.mutateAsync({
        file: uploadFile,
        category: uploadCategory,
      })
      setUploadOpen(false)
      setUploadFile(null)
    } catch (err) {
      setUploadError(extractErrorMessage(err))
    }
  }, [uploadFile, uploadCategory, uploadMutation])

  const handleDelete = useCallback(
    async (fileId: string) => {
      if (!confirm('Soft-delete this file? It can be restored by an admin.')) return
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
        directory_path: watchPath,
        category: watchCategory,
        file_pattern: watchPattern || '*',
      })
      setWatchDirOpen(false)
      setWatchPath('')
    } catch {
      // handled by query
    }
  }, [watchPath, watchCategory, watchPattern, createWatchDirMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setUploadFile(dropped)
    }
  }, [])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">File Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total != null
              ? `${data.meta.total} file${data.meta.total !== 1 ? 's' : ''} in store`
              : 'Loading...'}
          </p>
        </div>
        <div className="flex gap-2">
          {canAdmin && (
            <Button variant="outline" onClick={() => setShowWatchDirs(!showWatchDirs)}>
              <FolderSearch className="h-4 w-4" />
              Watch Dirs
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload File
            </Button>
          )}
        </div>
      </div>

      {/* Watch Directories Section */}
      {showWatchDirs && canAdmin && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Watch Directories
            </h2>
            <Button size="sm" variant="outline" onClick={() => setWatchDirOpen(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {watchDirs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No watch directories configured.</p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Last Scan</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchDirs.map((wd) => (
                    <TableRow key={wd.id}>
                      <TableCell className="font-mono text-sm">{wd.directory_path}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{FILE_CATEGORY_LABELS[wd.category]}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{wd.file_pattern}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {wd.last_scan_at
                          ? new Date(wd.last_scan_at).toLocaleString()
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => scanMutation.mutate(wd.id)}
                          disabled={scanMutation.isPending}
                        >
                          <RefreshCw
                            className={cn('h-3.5 w-3.5', scanMutation.isPending && 'animate-spin')}
                          />
                          Scan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value as FileCategory | '')
            setPage(1)
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Categories</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FILE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* File Table */}
      {isLoading ? (
        <PageSpinner />
      ) : isError ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm text-danger">Failed to load files.</p>
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <FileIcon className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No files found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchTerm || categoryFilter
              ? 'Try changing your search or filter.'
              : 'Upload a file to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(f.content_type)}
                        <span className="text-sm font-medium truncate max-w-[250px]">
                          {f.original_filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {FILE_CATEGORY_LABELS[f.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatFileSize(f.file_size)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.associated_entity_type ? (
                        <span className="font-mono text-xs">
                          {f.associated_entity_type}
                        </span>
                      ) : (
                        '---'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="View details"
                          onClick={() => setDetailFile(f)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Download"
                          onClick={() => download(f.id, f.original_filename)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {canAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-danger hover:text-danger"
                            title="Delete"
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
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent onClose={() => setUploadOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Drop zone */}
            <div
              className={cn(
                'rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setUploadFile(f)
                }}
              />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              {uploadFile ? (
                <div>
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(uploadFile.size)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Max 100 MB</p>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as FileCategory)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {FILE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            {uploadError && (
              <p className="text-sm text-danger">{uploadError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Detail Dialog */}
      {detailFile && (
        <Dialog open={!!detailFile} onOpenChange={() => setDetailFile(null)}>
          <DialogContent onClose={() => setDetailFile(null)} className="max-w-lg">
            <DialogHeader>
              <DialogTitle>File Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Filename</p>
                  <p className="font-medium break-all">{detailFile.original_filename}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-medium font-mono">{formatFileSize(detailFile.file_size)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Content Type</p>
                  <p className="font-medium font-mono">{detailFile.content_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <Badge variant="secondary">{FILE_CATEGORY_LABELS[detailFile.category]}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium font-mono">
                    {new Date(detailFile.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Processed</p>
                  <Badge variant={detailFile.is_processed ? 'success' : 'secondary'}>
                    {detailFile.is_processed ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">SHA-256</p>
                <p className="font-mono text-xs break-all">{detailFile.checksum_sha256}</p>
              </div>
              {detailFile.associated_entity_type && (
                <div>
                  <p className="text-muted-foreground">Associated Entity</p>
                  <p className="font-mono text-xs">
                    {detailFile.associated_entity_type} / {detailFile.associated_entity_id}
                  </p>
                </div>
              )}
              {detailFile.processing_notes && (
                <div>
                  <p className="text-muted-foreground">Processing Notes</p>
                  <p>{detailFile.processing_notes}</p>
                </div>
              )}

              {/* Preview for images */}
              {detailFile.content_type.startsWith('image/') && (
                <div className="rounded-lg border border-border p-2">
                  <img
                    src={`/api/v1/files/${detailFile.id}/download`}
                    alt={detailFile.original_filename}
                    className="max-h-48 mx-auto rounded"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => download(detailFile.id, detailFile.original_filename)}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              {canAdmin && (
                <Button variant="destructive" onClick={() => handleDelete(detailFile.id)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Watch Directory Dialog */}
      <Dialog open={watchDirOpen} onOpenChange={setWatchDirOpen}>
        <DialogContent onClose={() => setWatchDirOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Watch Directory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Directory Path
              </label>
              <input
                type="text"
                value={watchPath}
                onChange={(e) => setWatchPath(e.target.value)}
                placeholder="/data/instrument_output"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={watchCategory}
                onChange={(e) => setWatchCategory(e.target.value as FileCategory)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {FILE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                File Pattern (glob)
              </label>
              <input
                type="text"
                value={watchPattern}
                onChange={(e) => setWatchPattern(e.target.value)}
                placeholder="*.csv"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWatchDirOpen(false)}>
              Cancel
            </Button>
            <Button
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
