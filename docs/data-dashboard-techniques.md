# Building Aesthetic Scientific Data Dashboards

**How the BHARAT LIMS Data Explorer is built — a practical guide for replicating the same style in your own app (e.g., a CTC fluorescence analysis dashboard).**

---

## Stack

| Layer | Tool | Why |
|-------|------|-----|
| Charts | **Plotly.js** via `react-plotly.js` | Box, violin, heatmap, histogram, density — all built-in trace types with hover, zoom, and export. ~1.5 MB bundle, but worth it for scientific dashboards. |
| UI framework | **React 19 + TypeScript** | Component model, hooks for data flow, type safety. |
| Styling | **Tailwind CSS v4** | Utility classes for layout. No component library needed. `cn()` helper (clsx + tailwind-merge) for conditional class composition. |
| Data fetching | **TanStack Query** | Caching, deduplication, stale-while-revalidate. Each chart has its own query hook. |
| Backend | **FastAPI + PostgreSQL** | Async endpoints, Pydantic validation, SQL aggregations. Any backend works — the patterns are frontend-driven. |

---

## 1. The ChartCard wrapper

Every chart lives inside a `ChartCard` component that enforces **four states**:

```
loading  → animated spinner + "Loading chart..."
error    → red error message
empty    → gray "No data available" message
populated → the actual chart (children)
```

You never see a blank white box while data loads, and you never see a chart try to render zero data points.

```tsx
<ChartCard
  title="Peak Intensity Distribution"
  subtitle="FITC channel, gated on CD3+"
  loading={isLoading}
  error={isError ? 'Failed to load data' : undefined}
  empty={!data || data.length === 0}
  emptyMessage="Select a marker above"
  height="h-96"
>
  <Plot data={plotData} layout={layout} ... />
</ChartCard>
```

The card also provides:
- **Fullscreen expand** — fixed positioning over a backdrop, always with `style={{ backgroundColor: '#ffffff' }}` inline (Tailwind classes alone can get overridden by specificity)
- **Export button** — opens a modal for SVG/PNG download
- **Consistent header** — title + subtitle + action slot, so chart titles are always styled the same

---

## 2. Making Plotly look good

Default Plotly is ugly. Here's what to override.

### Shared layout defaults

```ts
// lib/chart-theme.ts
export const PLOTLY_LAYOUT_DEFAULTS = {
  font: {
    family: '"Red Hat Display", sans-serif',
    size: 12,
    color: '#1E293B',        // near-black, not pure black
  },
  paper_bgcolor: 'rgba(0,0,0,0)',  // transparent — the ChartCard provides the bg
  plot_bgcolor: 'rgba(0,0,0,0)',
  margin: { l: 60, r: 20, t: 20, b: 80 },
  // No title here — ChartCard header handles that
}
```

Key decisions:
- **Transparent backgrounds** so charts blend into the card
- **No Plotly title** — the card header provides a consistently styled title
- **Tight margins** — Plotly defaults waste space

### Mode bar control

```ts
// Clean look for simple charts (box, violin, histogram)
config={{ displayModeBar: false, responsive: true }}

// Interactive charts that need zoom/pan (heatmaps, large scatter)
config={{
  displayModeBar: true,
  responsive: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
}}
```

### Grid lines off by default

Grid lines add noise. Default them off, provide a toggle:

```ts
xaxis: { showgrid: showGridlines },
yaxis: { showgrid: showGridlines },
```

---

## 3. Color system

### Semantic colors — not arbitrary

Every grouping dimension gets a fixed color mapping:

```ts
// LIMS example
const AGE_GROUP_COLORS = { '1': '#3674F6', '2': '#03B6D9', '3': '#8B5CF6', ... }
const SEX_COLORS = { Male: '#3674F6', Female: '#EC4899' }

// CTC fluorescence equivalent
const CHANNEL_COLORS = { FITC: '#22C55E', PE: '#EF4444', APC: '#6366F1', 'PE-Cy7': '#F59E0B' }
const GATE_COLORS = { 'CD3+': '#3674F6', 'CD3-': '#94A3B8', 'CD4+': '#059669', 'CD8+': '#DC2626' }
```

The rule: the same category always gets the same color across every chart, every tab, every view.

### Switchable palettes

Provide a palette dropdown with a colorblind-safe option:

```ts
const COLOR_PALETTES = {
  default:    { label: 'Default',         colors: ['#3674F6', '#03B6D9', '#8B5CF6', ...] },
  viridis:    { label: 'Viridis',         colors: ['#440154', '#482878', '#3E4A89', ...] },
  colorblind: { label: 'Colorblind Safe', colors: ['#E69F00', '#56B4E9', '#009E73', ...] },
}
```

Show color swatches next to the dropdown so users can preview before switching.

### Diverging scale for correlation

Blue → White → Red, centered at zero:

```ts
const DIVERGING_BWR = [
  [0, '#2166AC'], [0.25, '#67A9CF'], [0.5, '#F7F7F7'],
  [0.75, '#EF8A62'], [1, '#B2182B'],
]
```

---

## 4. Box, Violin, Density — same data, different views

All three chart types fetch the same raw data (an array of numeric values per group). A chart type toggle just changes how the `plotData` useMemo builds Plotly traces.

### Box plot

```ts
{
  type: 'box',
  name: label,
  x: values.map(() => label),   // explicit x array — critical for alignment
  y: values,
  width: 0.5,                   // prevents boxes from being too wide
  boxpoints: showPoints ? 'all' : 'outliers',
  jitter: 0.4,
  pointpos: 0,
  marker: { color: colors, size: 3, opacity: 0.6 },
  line: { color: traceColor },
  fillcolor: `${traceColor}33`, // 20% opacity fill
}
```

### Violin plot

```ts
{
  type: 'violin',
  name: label,
  x: values.map(() => label),
  y: values,
  width: 0.6,
  scalegroup: label,             // consistent sizing across groups
  box: { visible: true },        // embedded box inside violin
  meanline: { visible: true },   // dashed mean line
  points: showPoints ? 'all' : false,
  marker: { color: colors, size: 3, opacity: 0.6 },
  line: { color: traceColor },
  fillcolor: `${traceColor}33`,
}
```

### Density plot (client-side KDE)

Plotly doesn't have a native density trace. We compute a Gaussian KDE on the client and render it as a filled scatter:

```ts
function computeKDE(values: number[], nPoints = 200) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1))
  const iqr = sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)]

  // Silverman's rule of thumb
  const bandwidth = 1.06 * Math.min(sd, (iqr || sd) / 1.34) * Math.pow(n, -0.2)

  const pad = 3 * bandwidth
  const xMin = sorted[0] - pad
  const xMax = sorted[n - 1] + pad
  const step = (xMax - xMin) / (nPoints - 1)
  const coeff = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI))

  const xs = [], ys = []
  for (let i = 0; i < nPoints; i++) {
    const x = xMin + i * step
    let sum = 0
    for (const v of sorted) sum += Math.exp(-0.5 * ((x - v) / bandwidth) ** 2)
    xs.push(x)
    ys.push(coeff * sum)
  }
  return { x: xs, y: ys }
}
```

Then render as:

```ts
{
  type: 'scatter',
  mode: 'lines',
  x: kde.x,
  y: kde.y,
  fill: 'tozeroy',
  line: { color: traceColor, width: 2 },
  fillcolor: `${traceColor}22`,
}
```

### Critical: the alignment fix

Each trace must get an explicit `x` array:

```ts
x: values.map(() => label)  // every point mapped to its category label
```

Without this, Plotly's `boxmode: 'group'` / `violinmode: 'group'` divides each category slot into sub-slots (one per trace) and offsets them — causing misalignment between labels and plots. With explicit x arrays and no group mode, each trace lands centered on its category.

Also remove `boxmode: 'group'` and `violinmode: 'group'` from the layout entirely. Control spacing with gap properties instead:

```ts
layout={{
  boxgap: 0.3,
  boxgroupgap: 0.15,
  violingap: 0.35,
  violingroupgap: 0.15,
}}
```

---

## 5. Per-point coloring and rich hover

This is what makes a dashboard feel interactive rather than static.

### Color By — independent of Group By

Users can group by one dimension (e.g., cell line) but color individual points by another (e.g., fluorescence channel):

```ts
// marker.color accepts an array — one color per data point
marker: {
  color: rawPoints.map(pt => getPointColor(pt, colorBy, palette)),
  size: 3,
  opacity: 0.6,
}
```

The `getPointColor` function maps each point to a color based on whichever dimension the user selected:

```ts
function getPointColor(pt: DataPoint, colorByDim: string, palette: string): string {
  if (colorByDim === 'channel')  return CHANNEL_COLORS[pt.channel]
  if (colorByDim === 'gate')     return GATE_COLORS[pt.gate]
  if (colorByDim === 'replicate') return REPLICATE_COLORS[pt.replicate]
  return DEFAULT_COLOR
}
```

**Critical implementation detail**: the `values` array and `rawPoints` array must stay perfectly in sync. If you apply outlier removal or filtering, filter both arrays together:

```ts
const filtered = values
  .map((v, i) => ({ v, pt: rawPoints[i] }))
  .filter(({ v }) => v >= lower && v <= upper)
values = filtered.map(({ v }) => v)
points = filtered.map(({ pt }) => pt)
```

### Rich hover text

Every data point shows its full context on hover:

```ts
function buildPointHoverText(pt: DataPoint): string {
  return [
    `<b>${pt.sample_id}</b>`,
    `MFI: ${pt.value.toFixed(1)}`,
    `Channel: ${pt.channel} | Gate: ${pt.gate}`,
    `Replicate: ${pt.replicate} | Plate: ${pt.plate}`,
  ].join('<br>')
}

// Applied via:
text: rawPoints.map(pt => buildPointHoverText(pt)),
hovertemplate: '%{text}<extra></extra>',
```

The `<extra></extra>` hides Plotly's default secondary hover box.

---

## 6. Correlation heatmap

### Two-layer rendering for significance

Significant cells (p < 0.05) get the diverging colorscale. Non-significant cells get flat gray. This is done by stacking three heatmap traces:

```ts
[
  // Layer 1: gray background for non-significant cells
  { z: zNonSig, colorscale: [['#E5E7EB', '#E5E7EB']], showscale: false },

  // Layer 2: colored cells for significant correlations
  { z: zSignificant, colorscale: DIVERGING_BWR, texttemplate: '%{text}',
    hovertemplate: '%{customdata}<extra></extra>' },

  // Layer 3: grayed-out text overlay for non-significant cells
  { z: zNonSigValues, textfont: { color: '#9CA3AF' },
    colorscale: [['rgba(0,0,0,0)', 'rgba(0,0,0,0)']], showscale: false },
]
```

### Compact cell text with significance stars

```ts
const sigStars = (p: number) => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : ''
const cellText = `${r.toFixed(2)}${sigStars(p)}`
```

Cell text shows `0.72***` — compact. Full details appear on hover: parameter names, exact r, exact p-value, sample size.

### Dynamic sizing

```ts
// Font size scales down with more parameters
const fontSize = nParams > 20 ? 8 : nParams > 12 ? 9 : nParams > 8 ? 10 : 11

// Chart height scales up
style={{ height: Math.max(400, Math.min(1200, nParams * 45 + 200)) }}

// Cell text auto-toggles off above 10 parameters (with manual override)
const textTemplate = showCellText ? '%{text}' : ''
```

---

## 7. Outlier removal

IQR method, applied client-side before building traces:

```ts
const sorted = [...values].sort((a, b) => a - b)
const q1 = sorted[Math.floor(n * 0.25)]
const q3 = sorted[Math.floor(n * 0.75)]
const iqr = q3 - q1
const lower = q1 - 1.5 * iqr
const upper = q3 + 1.5 * iqr
```

- ON by default (scientific data often has instrument outliers)
- Toggle checkbox lets users compare with/without
- Summary stats table recalculates from filtered values
- Footer note: "Outliers removed using IQR ×1.5 method" when active

---

## 8. Filter architecture

### Sidebar → filters object → query hooks → API

```
[Sidebar checkboxes] → { channels: ['FITC'], gates: ['CD3+'], replicates: ['R1','R2'] }
                            ↓
                     TanStack Query hook
                            ↓
                     GET /api/distribution?channel=FITC&gate=CD3+&replicate=R1,R2
```

Each filter dimension is a section in the sidebar with checkboxes. The filter object is passed to every query hook. TanStack Query includes the filters in the cache key, so changing a filter triggers a new fetch (or hits cache if previously seen).

### Exact filtered counts

A dedicated `/counts` endpoint accepts the same filter params and returns the exact intersection count via SQL:

```sql
SELECT COUNT(*) FROM samples
WHERE channel IN ('FITC') AND gate IN ('CD3+') AND replicate IN ('R1', 'R2')
```

This replaces any client-side approximation. The sidebar displays the exact N for the current filter combination.

### Frontend-only derived dimensions

Some grouping dimensions don't exist in the database. For example, "Site (Urban/Rural)" in our LIMS is a frontend lookup table:

```ts
const CENTRE_SITE_TYPE = { RMH: 'Urban', BBH: 'Rural', SSSSMH: 'Rural', ... }
```

When the user groups by this dimension, the frontend fetches by the underlying dimension (site/centre) and regroups the raw data client-side. No backend changes needed. For CTC fluorescence, you might derive "High/Low expresser" from MFI thresholds the same way.

---

## 9. Export

### Same Plotly instance

```ts
import Plot from 'react-plotly.js'
import PlotlyStatic from 'plotly.js/dist/plotly'  // SAME module instance
```

This is critical. If you `import('plotly.js')` dynamically, you get a *different* Plotly instance that can't access the chart's internal state. Import from the same path that `react-plotly.js` uses internally.

### Export with temporary relayout

Before exporting, temporarily apply export-friendly settings, capture the image, then restore:

```ts
// Apply export settings
await PlotlyStatic.relayout(el, {
  paper_bgcolor: '#ffffff',
  'title.text': 'Peak Intensity — FITC',
  'title.font': { size: 16, color: '#1E293B' },
  'margin.t': 50,
  'xaxis.tickangle': -35,
})

// Capture
const dataUrl = await PlotlyStatic.toImage(el, { format, width, height, scale })

// Restore original settings
await PlotlyStatic.relayout(el, originalSettings)
```

### Export dialog

A modal with:
- Format toggle: SVG (vector) / PNG (raster)
- Width × Height inputs
- DPI selector (72 screen / 150 draft / 300 publication) — implemented as a `scale` multiplier
- Transparent background checkbox
- Live preview thumbnail (rendered at 600px width)
- Effective resolution display: "4800 × 2400 px" for 1200×600 at 300 dpi

---

## 10. Mapping to a CTC fluorescence dashboard

| LIMS concept | CTC fluorescence equivalent |
|---|---|
| Parameter (Hemoglobin, BMI, ...) | Fluorescence marker (CD3, CD4, CD8, Ki-67, ...) |
| Age Group / Sex / Centre | Cell line / Treatment / Replicate / Plate |
| Site (Urban/Rural) | Sample type (Patient / Control) |
| Distribution tab | MFI distributions across conditions |
| Correlation tab | Marker-marker correlation (e.g., CD4 vs CD8 MFI) |
| Density plot | Fluorescence intensity histograms (like FlowJo) |
| Box/Violin | Compare MFI across treatment groups |
| Color By dimension | Color events by gate, channel, or sample metadata |
| Outlier removal | Remove debris / doublet events |
| Cohort filter sidebar | Gate hierarchy filter (CD3+ → CD4+/CD8+) |
| Per-point hover | Event ID, all channel values, gate membership |
| Export dialog | Publication figures for papers |

---

## Summary of techniques

1. **ChartCard with 4 states** — never show empty or broken charts
2. **Transparent Plotly backgrounds** — let the card provide the white
3. **Explicit x arrays** on box/violin traces — prevents alignment bugs
4. **Client-side KDE** with Silverman bandwidth — smooth density curves without server compute
5. **Per-point marker.color arrays** — color by any dimension independently of grouping
6. **Rich hover with `<extra></extra>`** — show full context, hide Plotly's secondary box
7. **Three-layer heatmap** — significant colored, non-significant grayed
8. **Significance stars in cells** — compact text, full details on hover
9. **IQR outlier toggle** — on by default, recalculates stats
10. **Same Plotly instance for export** — `plotly.js/dist/plotly` import path
11. **Temporary relayout for export** — white bg + title + angled labels, then restore
12. **Backend filtered counts** — exact N via SQL intersection, not client approximation
13. **Frontend-only derived dimensions** — regroup raw data client-side for computed categories
14. **Consistent semantic colors** — same category = same color everywhere
15. **Colorblind-safe palette option** — always available
