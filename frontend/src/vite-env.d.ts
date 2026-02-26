/// <reference types="vite/client" />

declare module "plotly.js" {
  export function downloadImage(
    gd: HTMLElement,
    opts: { format?: string; width?: number; height?: number; filename?: string }
  ): Promise<string>
  export function toImage(
    gd: HTMLElement,
    opts: { format?: string; width?: number; height?: number; scale?: number }
  ): Promise<string>
  export interface Data { [key: string]: unknown }
  export interface Layout { [key: string]: unknown }
  export interface Config { [key: string]: unknown }
  export interface Figure { data: Data[]; layout: Layout }
  export interface PlotMouseEvent { points: Array<{ x: unknown; y: unknown; data: Data }> }
}

declare module "plotly.js/dist/plotly" {
  export function toImage(
    gd: HTMLElement,
    opts: { format?: string; width?: number; height?: number; scale?: number }
  ): Promise<string>
  export function downloadImage(
    gd: HTMLElement,
    opts: { format?: string; width?: number; height?: number; filename?: string; scale?: number }
  ): Promise<string>
  export function relayout(
    gd: HTMLElement,
    update: Record<string, unknown>
  ): Promise<void>
}

declare module "react-plotly.js" {
  import * as Plotly from "plotly.js"
  import { Component } from "react"
  interface PlotParams {
    data: Plotly.Data[]
    layout?: Partial<Plotly.Layout>
    config?: Partial<Plotly.Config>
    style?: React.CSSProperties
    useResizeHandler?: boolean
    onInitialized?: (figure: Plotly.Figure) => void
    onUpdate?: (figure: Plotly.Figure) => void
    onClick?: (event: Plotly.PlotMouseEvent) => void
    onHover?: (event: Plotly.PlotMouseEvent) => void
  }
  class Plot extends Component<PlotParams> {}
  export default Plot
}
