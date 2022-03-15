import React from "react"
import { observer } from "mobx-react"
import { action, runInAction, observable } from "mobx"
import { format } from "timeago.js"
import * as lodash from "lodash-es"

import { Link } from "./Link.js"
import { Tag } from "./TagBadge.js"
import { bind } from "decko"
import { EditableTags } from "./Forms.js"
import { AdminAppContext, AdminAppContextType } from "./AdminAppContext.js"
import { BAKED_GRAPHER_URL } from "../settings/clientSettings.js"
import { ChartTypeName } from "../grapher/core/GrapherConstants.js"
import { startCase } from "../clientUtils/Util.js"
import { GrapherInterface } from "../grapher/core/GrapherInterface.js"

// These properties are coming from OldChart.ts
export interface ChartListItem {
    // the first few entries mirror GrapherInterface, so take the types from there
    id: GrapherInterface["id"]
    title: GrapherInterface["title"]
    slug: GrapherInterface["slug"]
    type: GrapherInterface["type"]
    internalNotes: GrapherInterface["internalNotes"]
    variantName: GrapherInterface["variantName"]
    isPublished: GrapherInterface["isPublished"]
    tab: GrapherInterface["tab"]
    hasChartTab: GrapherInterface["hasChartTab"]
    hasMapTab: GrapherInterface["hasMapTab"]

    lastEditedAt: string
    lastEditedBy: string
    publishedAt: string
    publishedBy: string
    isExplorable: boolean

    tags: Tag[]
}

function showChartType(chart: ChartListItem) {
    const chartType = chart.type ?? ChartTypeName.LineChart
    const displayType = ChartTypeName[chartType]
        ? startCase(ChartTypeName[chartType])
        : "Unknown"

    if (chart.tab === "map") {
        if (chart.hasChartTab) return `Map + ${displayType}`
        else return "Map"
    } else {
        if (chart.hasMapTab) return `${displayType} + Map`
        else return displayType
    }
}

@observer
class ChartRow extends React.Component<{
    chart: ChartListItem
    searchHighlight?: (text: string) => string | JSX.Element
    availableTags: Tag[]
    onDelete: (chart: ChartListItem) => void
}> {
    static contextType = AdminAppContext
    context!: AdminAppContextType

    async saveTags(tags: Tag[]) {
        const { chart } = this.props
        const json = await this.context.admin.requestJSON(
            `/api/charts/${chart.id}/setTags`,
            { tagIds: tags.map((t) => t.id) },
            "POST"
        )
        if (json.success) {
            runInAction(() => (chart.tags = tags))
        }
    }

    @action.bound onSaveTags(tags: Tag[]) {
        this.saveTags(tags)
    }

    render() {
        const { chart, searchHighlight, availableTags } = this.props

        const highlight = searchHighlight || lodash.identity

        return (
            <tr>
                <td style={{ minWidth: "140px", width: "12.5%" }}>
                    {chart.isPublished && (
                        <a href={`${BAKED_GRAPHER_URL}/${chart.slug}`}>
                            <img
                                src={`${BAKED_GRAPHER_URL}/exports/${chart.slug}.svg`}
                                className="chartPreview"
                            />
                        </a>
                    )}
                </td>
                <td style={{ minWidth: "180px" }}>
                    {chart.isPublished ? (
                        <a href={`${BAKED_GRAPHER_URL}/${chart.slug}`}>
                            {highlight(chart.title ?? "")}
                        </a>
                    ) : (
                        <span>
                            <span style={{ color: "red" }}>Draft: </span>{" "}
                            {highlight(chart.title ?? "")}
                        </span>
                    )}{" "}
                    {chart.variantName ? (
                        <span style={{ color: "#aaa" }}>
                            ({highlight(chart.variantName)})
                        </span>
                    ) : undefined}
                    {chart.internalNotes && (
                        <div className="internalNotes">
                            {highlight(chart.internalNotes)}
                        </div>
                    )}
                </td>
                <td style={{ minWidth: "100px" }}>{chart.id}</td>
                <td style={{ minWidth: "100px" }}>{showChartType(chart)}</td>
                <td style={{ minWidth: "340px" }}>
                    <EditableTags
                        tags={chart.tags}
                        suggestions={availableTags}
                        onSave={this.onSaveTags}
                    />
                </td>
                <td>
                    {chart.publishedAt && format(chart.publishedAt)}
                    {chart.publishedBy && (
                        <span> by {highlight(chart.publishedBy)}</span>
                    )}
                </td>
                <td>
                    {format(chart.lastEditedAt)} by{" "}
                    {highlight(chart.lastEditedBy)}
                </td>
                <td>
                    <Link
                        to={`/charts/${chart.id}/edit`}
                        className="btn btn-primary"
                    >
                        Edit
                    </Link>
                </td>
                <td>
                    <button
                        className="btn btn-danger"
                        onClick={() => this.props.onDelete(chart)}
                    >
                        Delete
                    </button>
                </td>
            </tr>
        )
    }
}

@observer
export class ChartList extends React.Component<{
    charts: ChartListItem[]
    searchHighlight?: (text: string) => string | JSX.Element
    onDelete?: (chart: ChartListItem) => void
}> {
    static contextType = AdminAppContext
    context!: AdminAppContextType

    @observable availableTags: Tag[] = []

    @bind async onDeleteChart(chart: ChartListItem) {
        if (
            !window.confirm(
                `Delete the chart ${chart.slug}? This action cannot be undone!`
            )
        )
            return

        const json = await this.context.admin.requestJSON(
            `/api/charts/${chart.id}`,
            {},
            "DELETE"
        )

        if (json.success) {
            if (this.props.onDelete) this.props.onDelete(chart)
            else
                runInAction(() =>
                    this.props.charts.splice(
                        this.props.charts.indexOf(chart),
                        1
                    )
                )
        }
    }

    @bind async getTags() {
        const json = await this.context.admin.getJSON("/api/tags.json")
        runInAction(() => (this.availableTags = json.tags))
    }

    componentDidMount() {
        this.getTags()
    }

    render() {
        const { charts, searchHighlight } = this.props
        const { availableTags } = this
        return (
            <table className="table table-bordered">
                <thead>
                    <tr>
                        <th></th>
                        <th>Chart</th>
                        <th>Id</th>
                        <th>Type</th>
                        <th>Tags</th>
                        <th>Published</th>
                        <th>Last Updated</th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {charts.map((chart) => (
                        <ChartRow
                            chart={chart}
                            key={chart.id}
                            availableTags={availableTags}
                            searchHighlight={searchHighlight}
                            onDelete={this.onDeleteChart}
                        />
                    ))}
                </tbody>
            </table>
        )
    }
}
