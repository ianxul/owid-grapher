import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    BaseEntity,
    ManyToOne,
    Unique,
    Relation,
} from "typeorm"
import { Writable } from "stream"

import { User } from "./User.js"
import { Source } from "./Source.js"
import { Variable } from "./Variable.js"
import * as db from "../db.js"
import { arrToCsvRow, slugify } from "../../clientUtils/Util.js"
import filenamify from "filenamify"

@Entity("datasets")
@Unique(["name", "namespace"])
export class Dataset extends BaseEntity {
    @PrimaryGeneratedColumn() id!: number
    @Column() name!: string
    @Column({ default: "owid" }) namespace!: string
    @Column({ default: "" }) description!: string
    @Column() createdAt!: Date
    @Column() updatedAt!: Date
    @Column() metadataEditedAt!: Date
    @Column() metadataEditedByUserId!: number
    @Column() dataEditedAt!: Date
    @Column() dataEditedByUserId!: number
    @Column({ default: false }) isPrivate!: boolean
    @Column({ default: false }) nonRedistributable!: boolean

    @ManyToOne(() => User, (user) => user.createdDatasets)
    createdByUser!: Relation<User>

    // Export dataset variables to CSV (not including metadata)
    static async writeCSV(datasetId: number, stream: Writable): Promise<void> {
        const csvHeader = ["Entity", "Year"]
        const variables = await db.queryMysql(
            `SELECT name, id FROM variables v WHERE v.datasetId=? ORDER BY v.columnOrder ASC, v.id ASC`,
            [datasetId]
        )
        for (const variable of variables) {
            csvHeader.push(variable.name)
        }

        const columnIndexByVariableId: { [key: number]: number } = {}
        for (const variable of variables) {
            columnIndexByVariableId[variable.id] = csvHeader.indexOf(
                variable.name
            )
        }

        stream.write(arrToCsvRow(csvHeader))

        const data = await db.queryMysql(
            `
            SELECT e.name AS entity, dv.year, dv.value, dv.variableId FROM data_values dv
            JOIN variables v ON v.id=dv.variableId
            JOIN datasets d ON v.datasetId=d.id
            JOIN entities e ON dv.entityId=e.id
            WHERE d.id=?
            ORDER BY e.name ASC, dv.year ASC, v.columnOrder ASC, dv.variableId ASC`,
            [datasetId]
        )

        let row: string[] = []
        for (const datum of data) {
            if (datum.entity !== row[0] || datum.year !== row[1]) {
                // New row
                if (row.length) {
                    stream.write(arrToCsvRow(row))
                }
                row = [datum.entity, datum.year]
                for (const variable of variables) {
                    row.push("")
                }
            }

            row[columnIndexByVariableId[datum.variableId]] = datum.value
        }

        // Final row
        stream.write(arrToCsvRow(row))

        stream.end()
    }

    static async setTags(datasetId: number, tagIds: number[]): Promise<void> {
        await db.transaction(async (t) => {
            const tagRows = tagIds.map((tagId) => [tagId, datasetId])
            await t.execute(`DELETE FROM dataset_tags WHERE datasetId=?`, [
                datasetId,
            ])
            if (tagRows.length)
                await t.execute(
                    `INSERT INTO dataset_tags (tagId, datasetId) VALUES ?`,
                    [tagRows]
                )
        })
    }

    async toCSV(): Promise<string> {
        let csv = ""
        await Dataset.writeCSV(this.id, {
            write: (s: string) => (csv += s),
            end: () => null,
        } as any)
        return csv
    }

    get filename(): string {
        return filenamify(this.name)
    }

    get slug(): string {
        return slugify(this.name)
    }

    // Return object representing datapackage.json for this dataset
    async toDatapackage(): Promise<any> {
        // XXX
        const sources = await Source.find({ datasetId: this.id })
        const variables = (await db
            .knexTable(Variable.table)
            .where({ datasetId: this.id })) as Variable.Row[]
        const tags = await db.queryMysql(
            `SELECT t.id, t.name FROM dataset_tags dt JOIN tags t ON t.id=dt.tagId WHERE dt.datasetId=?`,
            [this.id]
        )

        const initialFields = [
            { name: "Entity", type: "string" },
            { name: "Year", type: "year" },
        ]

        const dataPackage = {
            name: this.name,
            title: this.name,
            id: this.id,
            description:
                (sources[0] &&
                    sources[0].description &&
                    sources[0].description.additionalInfo) ||
                "",
            sources: sources.map((s) => s.toDatapackage()),
            owidTags: tags.map((t: any) => t.name),
            resources: [
                {
                    path: `${this.name}.csv`,
                    schema: {
                        fields: initialFields.concat(
                            variables.map((v) => ({
                                name: v.name,
                                type: "any",
                                description: v.description,
                                owidDisplaySettings: v.display,
                            }))
                        ),
                    },
                },
            ],
        }

        return dataPackage
    }
}
