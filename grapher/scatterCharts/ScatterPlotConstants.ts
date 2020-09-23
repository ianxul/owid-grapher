import { AbstractCoreColumn } from "coreTable/CoreTable"
import { EntityName } from "coreTable/CoreTableConstants"
import { DualAxis } from "grapher/axis/Axis"
import { ChartOptionsProvider } from "grapher/chart/ChartOptionsProvider"
import { NoDataOverlayOptionsProvider } from "grapher/chart/NoDataOverlay"
import { ColorScale } from "grapher/color/ColorScale"
import {
    ScatterPointLabelStrategy,
    AddCountryMode,
} from "grapher/core/GrapherConstants"
import { Bounds } from "grapher/utils/Bounds"
import { PointVector } from "grapher/utils/PointVector"

export interface ScatterPlotOptionsProvider extends ChartOptionsProvider {
    hideConnectedScatterLines?: boolean
    scatterPointLabelStrategy?: ScatterPointLabelStrategy
    addCountryMode?: AddCountryMode
}

export interface ScatterTooltipProps {
    yColumn: AbstractCoreColumn
    xColumn: AbstractCoreColumn
    series: ScatterSeries
    maxWidth: number
    fontSize: number
    x: number
    y: number
}

export interface ScatterSeries {
    color: string
    entityName: string
    label: string
    size: number
    values: ScatterValue[]
    isScaleColor?: true
}

export interface ScatterValue {
    x: number
    y: number
    size: number
    entityName?: EntityName
    color?: number | string
    year: number
    time: {
        x: number
        y: number
        span?: [number, number]
    }
}

export interface ScatterRenderValue {
    position: PointVector
    color: string
    size: number
    fontSize: number
    label: string
    time: {
        x: number
        y: number
    }
}

export interface ScatterRenderSeries {
    entityName: EntityName
    displayKey: string
    color: string
    size: number
    values: ScatterRenderValue[]
    text: string
    isHover?: boolean
    isFocus?: boolean
    isForeground?: boolean
    offsetVector: PointVector
    startLabel?: ScatterLabel
    midLabels: ScatterLabel[]
    endLabel?: ScatterLabel
    allLabels: ScatterLabel[]
}

export interface ScatterLabel {
    text: string
    fontSize: number
    fontWeight: number
    color: string
    bounds: Bounds
    series: ScatterRenderSeries
    isHidden?: boolean
    isStart?: boolean
    isMid?: boolean
    isEnd?: boolean
}

export interface PointsWithLabelsProps {
    seriesArray: ScatterSeries[]
    hoverKeys: string[]
    focusKeys: string[]
    dualAxis: DualAxis
    colorScale?: ColorScale
    sizeDomain: [number, number]
    onMouseOver: (series: ScatterSeries) => void
    onMouseLeave: () => void
    onClick: () => void
    hideLines: boolean
    formatLabel: (v: ScatterValue) => string
    noDataOverlayOptionsProvider: NoDataOverlayOptionsProvider
}
