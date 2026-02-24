/// <reference types="vite/client" />
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
