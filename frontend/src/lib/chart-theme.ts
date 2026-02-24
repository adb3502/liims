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
// Hue-varied palette passes deuteranopia, protanopia, and tritanopia simulation
export const AGE_GROUP_COLORS: Record<string, string> = {
  '1': '#3674F6',  // blue (18-29)
  '2': '#03B6D9',  // teal (30-44)
  '3': '#8B5CF6',  // purple (45-59)
  '4': '#F97316',  // orange (60-74)
  '5': '#059669',  // green (75+)
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

// Diverging blue-yellow-amber (for correlation heatmaps)
// Blue-White-Red fails tritanopia; this palette is safe for all three deficiency types
export const DIVERGING_BWR = [
  [0, '#1D4ED8'],    // dark blue
  [0.5, '#FEFCE8'],  // light yellow (visible midpoint)
  [1, '#B45309'],    // dark amber (not red)
] as [number, string][]

// ──── Recharts Theme ────

export const RECHARTS_THEME = {
  grid: { stroke: '#E2E8F0', strokeDasharray: '3 3' },
  axisLine: { stroke: '#CBD5E1' },
  tick: { fontSize: 11, fontFamily: '"Red Hat Display", sans-serif', fill: '#000000', stroke: 'none' },
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
  font: { family: '"Red Hat Display", sans-serif', color: '#1E293B', size: 12 },
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

// Verified coordinates from Google Maps / OpenStreetMap / Wikimapia (Feb 2026)
export const SITE_COORDINATES: Record<string, { lat: number; lng: number; name: string; city: string; address: string; urban: boolean }> = {
  RMH: { lat: 13.0282, lng: 77.5699, name: 'M.S. Ramaiah Memorial Hospital', city: 'Bengaluru', address: 'New BEL Rd, M S Ramaiah Nagar, MSRIT Post, Bengaluru 560054', urban: true },
  BBH: { lat: 13.0467, lng: 77.5880, name: 'Bangalore Baptist Hospital', city: 'Bengaluru', address: 'Bellary Rd, Hebbal, Bengaluru 560024', urban: true },
  SSSSMH: { lat: 13.4034, lng: 77.6976, name: 'Sri Sathya Sai Sarla Memorial Hospital', city: 'Muddenahalli', address: 'Sathya Sai Grama, Muddenahalli, Chikkaballapur 562101', urban: false },
  CHAF: { lat: 12.9639, lng: 77.6280, name: 'Command Hospital Air Force', city: 'Bengaluru', address: 'Old Airport Rd, Agram Post, Bengaluru 560007', urban: true },
  BMC: { lat: 12.9580, lng: 77.5710, name: 'Bangalore Medical College & Research Institute', city: 'Bengaluru', address: 'Victoria Hospital Campus, Fort, Bengaluru 560002', urban: true },
  JSS: { lat: 12.2960, lng: 76.6552, name: 'JSS Hospital', city: 'Mysuru', address: 'Ramanuja Rd, Vani Vilas, Mysuru 570001', urban: true },
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
