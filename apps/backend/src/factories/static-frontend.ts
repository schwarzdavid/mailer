import { existsSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { join, resolve, sep } from 'node:path'
import type { ConfigService } from '@nestjs/config'
import type { ServeStaticModuleOptions } from '@nestjs/serve-static'
import type { Env } from '../config/env.schema.js'
import { API_PREFIX } from './app.setup.js'

export const FRONTEND_PUBLIC_DIR = join(import.meta.dirname, '..', '..', 'public')

const ASSETS_DIR = 'assets'
const INDEX_FILE = 'index.html'
const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'no-cache'

export function createStaticFrontendOptions(
    configService: ConfigService<Env, true>,
    rootPath = FRONTEND_PUBLIC_DIR,
): ServeStaticModuleOptions[] {
    if (configService.get('NODE_ENV', { infer: true }) !== 'production') {
        return []
    }

    const absoluteRootPath = resolve(rootPath)
    const indexPath = join(absoluteRootPath, INDEX_FILE)
    if (!existsSync(indexPath)) {
        throw new Error(`NODE_ENV=production requires the built frontend, but ${indexPath} does not exist`)
    }

    const assetsPath = resolve(absoluteRootPath, ASSETS_DIR) + sep

    return [
        {
            rootPath: absoluteRootPath,
            exclude: [`/${API_PREFIX}/{*path}`, `/${ASSETS_DIR}/{*path}`],
            serveStaticOptions: {
                setHeaders(response: ServerResponse, filePath: string) {
                    const isAsset = resolve(filePath).startsWith(assetsPath)
                    response.setHeader('Cache-Control', isAsset ? IMMUTABLE : REVALIDATE)
                },
            },
        },
    ]
}
