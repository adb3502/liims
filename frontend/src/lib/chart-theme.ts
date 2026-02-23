/**
 * Shared chart theme configuration for Recharts and Plotly.
 * All chart colors, palettes, and layout helpers in one place.
 */

// ──── Color Palettes ────

export const COLORS = {
  primary: '#3674F6',
  primaryLight: '#5B93FF',
  primaryDark: '#2558CC',
  teal: '#03B6D9',
  tealLight: '#22D3EE',

  success: '#059669',
  successLight: '#10B981',
  warning: '#D97706',
  warningLight: '#F59E0B',
  danger: '#DC2626',
  dangerLight: '#EF4444',

  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
} as const

// Age groups: 1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+
export const AGE_GROUP_COLORS: Record<string, string> = {
  '1': '#93C5FD', // 18-29 (lightest blue)
  '2': '#60A5FA', // 30-44
  '3': '#3B82F6', // 45-59
  '4': '#2563EB', // 60-74
  '5': '#1D4ED8', // 75+ (darkest blue)
}

export const AGE_GROUP_LABELS: Record<string, string> = {
  '1': '18-29',
  '2': '30-44',
  '3': '45-59',
  '4': '60-74',
  '5': '75+',
}

export const SEX_COLORS: Record<string, string> = {
  A: '#3B82F6',  // Male — blue
  B: '#EC4899',  // Female — pink
  M: '#3B82F6',
  F: '#EC4899',
  Male: '#3B82F6',
  Female: '#EC4899',
}

export const SEX_LABELS: Record<string, string> = {
  A: 'Male',
  B: 'Female',
  M: 'Male',
  F: 'Female',
}

export const HBA1C_COLORS: Record<string, string> = {
  Normal: '#10B981',
  Prediabetic: '#F59E0B',
  Diabetic: '#EF4444',
}

export const SITE_COLORS = [
  '#3674F6', '#03B6D9', '#8B5CF6', '#F97316', '#059669', '#EC4899',
  '#6366F1', '#14B8A6', '#F43F5E', '#84CC16',
]

export const SAMPLE_TYPE_COLORS: Record<string, string> = {
  whole_blood: '#DC2626',
  plasma: '#F59E0B',
  serum: '#8B5CF6',
  urine: '#06B6D4',
  pbmc: '#10B981',
  dna: '#3B82F6',
  hair: '#78716C',
  cheek_cells: '#EC4899',
  buffy_coat: '#F97316',
  stool: '#A16207',
}

export const STATUS_COLORS: Record<string, string> = {
  collected: '#3B82F6',
  in_transit: '#F59E0B',
  received: '#8B5CF6',
  in_storage: '#10B981',
  processing: '#06B6D4',
  depleted: '#94A3B8',
  discarded: '#DC2626',
  quarantine: '#F97316',
}

// General-purpose categorical palette (8 colors, colorblind-safe)
export const CATEGORICAL = [
  '#3674F6', '#03B6D9', '#8B5CF6', '#F97316',
  '#059669', '#EC4899', '#6366F1', '#14B8A6',
]

// Sequential blue scale
export const SEQUENTIAL_BLUE = ['#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E3A8A']

// Diverging blue-white-red (for correlation heatmaps)
export const DIVERGING_BWR = [
  [0, '#2563EB'],
  [0.5, '#FFFFFF'],
  [1, '#DC2626'],
] as [number, string][]

// ──── Recharts Theme ────

export const RECHARTS_THEME = {
  grid: { stroke: '#E2E8F0', strokeDasharray: '3 3' },
  axis: { stroke: '#CBD5E1', fontSize: 11, fontFamily: '"Red Hat Display", sans-serif' },
  tooltip: {
    contentStyle: {
      background: 'rgba(255,255,255,0.96)',
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      boxShadow: '0 4px 12px -2px rgba(0,0,0,0.08)',
      fontSize: '12px',
      fontFamily: '"Red Hat Display", sans-serif',
    },
  },
  gradientDefs: {
    primaryGradient: { id: 'primaryGradient', stops: [{ offset: '0%', color: '#3674F6', opacity: 0.3 }, { offset: '100%', color: '#03B6D9', opacity: 0.05 }] },
  },
} as const

// ──── Plotly Layout Defaults ────

export const PLOTLY_LAYOUT_DEFAULTS = {
  font: { family: '"Red Hat Display", sans-serif', color: '#334155', size: 12 },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  margin: { l: 60, r: 30, t: 40, b: 60 },
  xaxis: { gridcolor: '#E2E8F0', linecolor: '#CBD5E1', zerolinecolor: '#E2E8F0' },
  yaxis: { gridcolor: '#E2E8F0', linecolor: '#CBD5E1', zerolinecolor: '#E2E8F0' },
  hoverlabel: {
    bgcolor: 'white',
    bordercolor: '#E2E8F0',
    font: { family: '"Red Hat Display", sans-serif', size: 12, color: '#334155' },
  },
  modebar: { bgcolor: 'transparent', color: '#94A3B8', activecolor: '#3674F6' },
} as const

// ──── Map Config ────

export const SITE_COORDINATES: Record<string, { lat: number; lng: number; name: string; city: string }> = {
  RMH: { lat: 12.9716, lng: 77.5946, name: 'M.S. Ramaiah Memorial Hospital', city: 'Bengaluru' },
  BBH: { lat: 12.9537, lng: 77.5999, name: 'Bangalore Baptist Hospital', city: 'Bengaluru' },
  SSSSMH: { lat: 13.3637, lng: 77.5379, name: 'Sri Sathya Sai Sarla Memorial Hospital', city: 'Muddenahalli' },
  CHAF: { lat: 12.9611, lng: 77.6387, name: 'Command Hospital Air Force', city: 'Bengaluru' },
  BMC: { lat: 12.9578, lng: 77.5700, name: 'Bangalore Medical College', city: 'Bengaluru' },
  JSS: { lat: 12.3150, lng: 76.6394, name: 'JSS Hospital', city: 'Mysuru' },
}

// ──── Helpers ────

/** Get color for a site by index (cycles through palette) */
export function getSiteColor(index: number): string {
  return SITE_COLORS[index % SITE_COLORS.length]
}

/** Format large numbers with K/M suffixes */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** Format percentage with 1 decimal */
export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`
}
