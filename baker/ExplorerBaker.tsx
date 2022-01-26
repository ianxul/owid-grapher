import { mkdirp, writeFile } from "fs-extra"
import path from "path"
import { ExplorerProgram } from "../explorer/ExplorerProgram"
import { explorerUrlMigrationsById } from "../explorer/urlMigrations/ExplorerUrlMigrations"
import { ExplorerAdminServer } from "../explorerAdminServer/ExplorerAdminServer"
import { explorerRedirectTable } from "../explorerAdminServer/ExplorerRedirects"
import { renderExplorerPage } from "./siteRenderers"

export const bakeAllPublishedExplorers = async (
    outputFolder: string,
    explorerAdminServer: ExplorerAdminServer
) => {
    const published = await explorerAdminServer.getAllPublishedExplorers()
    await bakeExplorersToDir(outputFolder, published)
}

const bakeExplorersToDir = async (
    directory: string,
    explorers: ExplorerProgram[] = []
) => {
    for (const explorer of explorers) {
        await write(
            `${directory}/${explorer.slug}.html`,
            await renderExplorerPage(explorer)
        )
    }
}

export const bakeAllExplorerRedirects = async (
    outputFolder: string,
    explorerAdminServer: ExplorerAdminServer
) => {
    const explorers = await explorerAdminServer.getAllExplorers()
    const redirects = explorerRedirectTable.rows
    for (const redirect of redirects) {
        const { migrationId, path: redirectPath, baseQueryStr } = redirect
        const transform = explorerUrlMigrationsById[migrationId]
        if (!transform) {
            throw new Error(
                `No explorer URL migration with id '${migrationId}'. Fix the list of explorer redirects and retry.`
            )
        }
        const { explorerSlug } = transform
        const program = explorers.find(
            (program) => program.slug === explorerSlug
        )
        if (!program) {
            throw new Error(
                `No explorer with slug '${explorerSlug}'. Fix the list of explorer redirects and retry.`
            )
        }
        const html = await renderExplorerPage(program, {
            explorerUrlMigrationId: migrationId,
            baseQueryStr,
        })
        await write(path.join(outputFolder, `${redirectPath}.html`), html)
    }
}

// todo: merge with SiteBaker's?
const write = async (outPath: string, content: string) => {
    await mkdirp(path.dirname(outPath))
    await writeFile(outPath, content)
    console.log(outPath)
}
