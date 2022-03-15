import React from "react"
import * as db from "../db/db.js"
import { CountriesIndexPage } from "../site/CountriesIndexPage.js"
import { GrapherInterface } from "../grapher/core/GrapherInterface.js"
import * as lodash from "lodash-es"
import {
    CountryProfileIndicator,
    CountryProfilePage,
} from "../site/CountryProfilePage.js"
import { Variable } from "../db/model/Variable.js"
import { SiteBaker } from "./SiteBaker.js"
import { countries, getCountry } from "../clientUtils/countries.js"
import { OwidTable } from "../coreTable/OwidTable.js"
import { JsonError } from "../clientUtils/owidTypes.js"
import { renderToHtmlPage } from "./siteRenderers.js"

export const countriesIndexPage = (baseUrl: string) =>
    renderToHtmlPage(
        <CountriesIndexPage countries={countries} baseUrl={baseUrl} />
    )

const cache = new Map()
// Cache the result of an operation by a key for the duration of the process
function bakeCache<T>(cacheKey: any, retriever: () => T): T {
    if (cache.has(cacheKey)) return cache.get(cacheKey)

    const result = retriever()
    cache.set(cacheKey, result)
    return result
}

// Find the charts that will be shown on the country profile page (if they have that country)
// TODO: make this page per variable instead
const countryIndicatorGraphers = async (): Promise<GrapherInterface[]> =>
    bakeCache(countryIndicatorGraphers, async () => {
        const graphers = (
            await db
                .knexTable("charts")
                .whereRaw("publishedAt is not null and is_indexable is true")
        ).map((c: any) => JSON.parse(c.config)) as GrapherInterface[]
        return graphers.filter(
            (grapher) =>
                grapher.hasChartTab &&
                grapher.type === "LineChart" &&
                grapher.dimensions?.length === 1
        )
    })

const countryIndicatorVariables = async (): Promise<Variable.Row[]> =>
    bakeCache(countryIndicatorVariables, async () => {
        const variableIds = (await countryIndicatorGraphers()).map(
            (c) => c.dimensions![0]!.variableId
        )
        return Variable.rows(
            await db.knexTable(Variable.table).whereIn("id", variableIds)
        )
    })

export const denormalizeLatestCountryData = async (variableIds?: number[]) => {
    const entities = (await db
        .knexTable("entities")
        .select("id", "code")
        .whereRaw("validated is true and code is not null")) as {
        id: number
        code: string
    }[]

    const entitiesByCode = lodash.keyBy(entities, (e) => e.code)
    const entitiesById = lodash.keyBy(entities, (e) => e.id)
    const entityIds = countries.map((c) => entitiesByCode[c.code].id)

    if (!variableIds)
        variableIds = (await countryIndicatorVariables()).map((v) => v.id)

    const dataValuesQuery = db
        .knexTable("data_values")
        .select("variableId", "entityId", "value", "year")
        .whereIn("variableId", variableIds)
        .whereRaw(`entityId in (?)`, [entityIds])
        .andWhere("year", ">", 2010)
        .andWhere("year", "<", 2020)
        .orderBy("year", "DESC")

    let dataValues = (await dataValuesQuery) as {
        variableId: number
        entityId: number
        value: string
        year: number
    }[]
    dataValues = lodash.uniqBy(
        dataValues,
        (dv) => `${dv.variableId}-${dv.entityId}`
    )
    const rows = dataValues.map((dv) => ({
        variable_id: dv.variableId,
        country_code: entitiesById[dv.entityId].code,
        year: dv.year,
        value: dv.value,
    }))

    db.knexInstance().transaction(async (t) => {
        // Remove existing values
        await t
            .table("country_latest_data")
            .whereIn("variable_id", variableIds as number[])
            .delete()

        // Insert new ones
        if (rows.length) await t.table("country_latest_data").insert(rows)
    })
}

const countryIndicatorLatestData = async (countryCode: string) => {
    const dataValuesByEntityId = await bakeCache(
        countryIndicatorLatestData,
        async () => {
            const dataValues = (await db
                .knexTable("country_latest_data")
                .select(
                    "variable_id AS variableId",
                    "country_code AS code",
                    "year",
                    "value"
                )) as {
                variableId: number
                code: string
                year: number
                value: string
            }[]

            return lodash.groupBy(dataValues, (dv) => dv.code)
        }
    )

    return dataValuesByEntityId[countryCode]
}

export const countryProfilePage = async (
    countrySlug: string,
    baseUrl: string
) => {
    const country = getCountry(countrySlug)
    if (!country) throw new JsonError(`No such country ${countrySlug}`, 404)

    const graphers = await countryIndicatorGraphers()
    const variables = await countryIndicatorVariables()
    const variablesById = lodash.keyBy(variables, (v) => v.id)
    const dataValues = await countryIndicatorLatestData(country.code)

    const valuesByVariableId = lodash.groupBy(dataValues, (v) => v.variableId)

    let indicators: CountryProfileIndicator[] = []
    for (const grapher of graphers) {
        const firstDimension = grapher.dimensions![0]
        const vid = firstDimension && firstDimension.variableId
        const values = valuesByVariableId[vid]

        if (values && values.length) {
            const latestValue = values[0]
            const variable = variablesById[vid]

            // todo: this is a lot of setup to get formatValueShort. Maybe cleanup?
            const table = new OwidTable(
                [],
                [
                    {
                        slug: vid.toString(),
                        unit: variable.unit,
                        display: variable.display,
                    },
                ]
            )
            const column = table.get(vid.toString())

            let value: string | number
            value = parseFloat(latestValue.value)
            if (isNaN(value)) value = latestValue.value
            else if (variable.display.conversionFactor)
                value *= variable.display.conversionFactor

            indicators.push({
                year: latestValue.year,
                name: grapher.title as string,
                slug: `/grapher/${grapher.slug}?tab=chart&country=${country.code}`,
                variantName: grapher.variantName,
            })
        }
    }

    indicators = lodash.sortBy(indicators, (i) => i.name.trim())

    return renderToHtmlPage(
        <CountryProfilePage
            indicators={indicators}
            country={country}
            baseUrl={baseUrl}
        />
    )
}

export const bakeCountries = async (baker: SiteBaker) => {
    const html = await countriesIndexPage(baker.baseUrl)
    await baker.writeFile("/countries.html", html)

    await baker.ensureDir("/country")
    for (const country of countries) {
        const path = `/country/${country.slug}.html`
        const html = await countryProfilePage(country.slug, baker.baseUrl)
        await baker.writeFile(path, html)
    }

    baker.progressBar.tick({ name: "✅ baked countries" })
}
