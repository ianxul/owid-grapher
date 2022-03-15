import React from "react"
import { Head } from "./Head.js"
import { SiteHeader } from "./SiteHeader.js"
import { SiteFooter } from "./SiteFooter.js"
import { ChartListItemVariant } from "./ChartListItemVariant.js"
import * as lodash from "lodash-es"
import { TableOfContents } from "./TableOfContents.js"
import { slugify } from "../clientUtils/Util.js"

export interface ChartIndexItem {
    id: number
    title: string
    slug: string
    variantName?: string
    tags: { id: number; name: string }[]
}

export interface TagWithCharts {
    id: number
    name: string
    charts: ChartIndexItem[]
}

export const ChartsIndexPage = (props: {
    chartItems: ChartIndexItem[]
    baseUrl: string
}) => {
    const { chartItems, baseUrl } = props

    const allTags = lodash.sortBy(
        lodash.uniqBy(
            lodash.flatten(chartItems.map((item) => item.tags)),
            (tag) => tag.id
        ),
        (tag) => tag.name
    ) as TagWithCharts[]

    for (const chartItem of chartItems) {
        for (const tag of allTags) {
            if (tag.charts === undefined) tag.charts = []

            if (chartItem.tags.some((t) => t.id === tag.id))
                tag.charts.push(chartItem)
        }
    }

    // Sort the charts in each tag
    for (const tag of allTags) {
        tag.charts = lodash.sortBy(tag.charts, (c) => c.title.trim())
    }

    const pageTitle = "Charts"
    const tocEntries = allTags.map((t) => {
        return {
            isSubheading: true,
            slug: slugify(t.name),
            text: t.name,
        }
    })

    return (
        <html>
            <Head
                canonicalUrl={`${baseUrl}/charts`}
                pageTitle="Charts"
                pageDesc="All of the interactive charts on Our World in Data."
                baseUrl={baseUrl}
            />
            <body className="ChartsIndexPage">
                <SiteHeader baseUrl={baseUrl} />
                <main>
                    <div className="page with-sidebar">
                        <div className="content-wrapper">
                            <TableOfContents
                                headings={tocEntries}
                                pageTitle={pageTitle}
                            />
                            <div className="offset-content">
                                <div className="content">
                                    <header className="chartsHeader">
                                        <input
                                            type="search"
                                            className="chartsSearchInput"
                                            placeholder="Filter interactive charts by title"
                                            autoFocus
                                        />
                                    </header>
                                    {allTags.map((t) => (
                                        <section key={t.id}>
                                            <h2 id={slugify(t.name)}>
                                                {t.name}
                                            </h2>
                                            <ul>
                                                {t.charts.map((c) => (
                                                    <ChartListItemVariant
                                                        key={c.slug}
                                                        chart={c}
                                                    />
                                                ))}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
                <SiteFooter baseUrl={baseUrl} />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                        window.runChartsIndexPage()
                        runTableOfContents(${JSON.stringify({
                            headings: tocEntries,
                            pageTitle,
                        })})`,
                    }}
                />
            </body>
        </html>
    )
}
