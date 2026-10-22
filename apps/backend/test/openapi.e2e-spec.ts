import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INestApplication, RequestMethod, type CanActivate, type Type } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js'
import { ModulesContainer, Reflector } from '@nestjs/core'
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js'
import { SwaggerModule, type OpenAPIObject, type OperationObject } from '@nestjs/swagger'
import { ReadonlyVisitor } from '@nestjs/swagger/plugin'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { createOpenApiDocument } from '../src/factories/app.setup.js'
import { createPreviewOpenApiDocument } from '../src/openapi/preview-document.js'
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js'
import { PUBLIC_KEY } from '../src/modules/auth/decorators/Public.js'
import { createTestApp } from './support/app.js'

interface Operation {
    method: string
    path: string
    operation: OperationObject
}

interface Route {
    label: string
    method: string
    path: string
    requiresJwt: boolean
}

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

const compositionKeys = ['$ref', 'properties', 'additionalProperties', 'allOf', 'oneOf', 'anyOf']

/**
 * The @nestjs/swagger CLI plugin (nest-cli.json) only runs inside `nest build`, so
 * under Vitest + SWC the DTO/route metadata it infers is absent and the document
 * would silently omit most properties. Generate that metadata from the same
 * TypeScript sources with the plugin's own visitor — the mechanism the Nest CLI
 * uses for its SWC builder — so the document matches what `generate` emits.
 */
async function loadSwaggerPluginMetadata(): Promise<void> {
    const sourceDir = join(process.cwd(), 'src')
    const tmpRoot = join(process.cwd(), 'node_modules', '.tmp')
    await mkdir(tmpRoot, { recursive: true })
    const outputDir = await mkdtemp(join(tmpRoot, 'openapi-metadata-'))

    try {
        new PluginMetadataGenerator().generate({
            visitors: [new ReadonlyVisitor({ pathToSource: outputDir, outDir: sourceDir, rootDir: sourceDir })],
            outputDir,
            tsconfigPath: 'tsconfig.build.json',
            filename: 'metadata.ts',
            printDiagnostics: false,
        })
        const { default: metadata } = (await import(pathToFileURL(join(outputDir, 'metadata.ts')).href)) as {
            default: () => Promise<Record<string, unknown>>
        }
        await SwaggerModule.loadPluginMetadata(metadata)
    } finally {
        await rm(outputDir, { recursive: true, force: true })
    }
}

function listOperations(document: OpenAPIObject): Operation[] {
    return Object.entries(document.paths).flatMap(([path, item]) =>
        httpMethods.flatMap((method) => {
            const operation = item[method]
            return operation ? [{ method, path, operation }] : []
        }),
    )
}

function joinRoutePath(...segments: string[]): string {
    const path = segments
        .flatMap((segment) => segment.split('/'))
        .filter(Boolean)
        .map((segment) => (segment.startsWith(':') ? `{${segment.slice(1)}}` : segment))
        .join('/')
    return `/${path}`
}

function listRoutes(app: INestApplication): Route[] {
    const reflector = app.get(Reflector)

    return [...app.get(ModulesContainer).values()].flatMap((module) =>
        [...module.controllers.values()].flatMap(({ metatype }) => {
            const controller = metatype as Type
            const controllerPath = reflector.get<string>(PATH_METADATA, controller)
            const prototype = controller.prototype as Record<string, unknown>

            return Object.getOwnPropertyNames(prototype).flatMap((key) => {
                const handler = prototype[key]
                if (
                    key === 'constructor' ||
                    typeof handler !== 'function' ||
                    reflector.get(PATH_METADATA, handler) === undefined
                ) {
                    return []
                }
                const guards = reflector.getAllAndMerge<Type<CanActivate>[]>(GUARDS_METADATA, [controller, handler])
                const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, controller]) === true
                const requestMethod = reflector.get<RequestMethod>(METHOD_METADATA, handler)

                return [
                    {
                        label: `${controller.name}.${key}`,
                        method: RequestMethod[requestMethod].toLowerCase(),
                        path: joinRoutePath('api', controllerPath, reflector.get<string>(PATH_METADATA, handler)),
                        requiresJwt: guards.includes(JwtAuthGuard) && !isPublic,
                    },
                ]
            })
        }),
    )
}

function findBareObjects(node: unknown, pointer: string): string[] {
    if (Array.isArray(node)) {
        return node.flatMap((child, index) => findBareObjects(child, `${pointer}/${index}`))
    }
    if (typeof node !== 'object' || node === null) {
        return []
    }
    const record = node as Record<string, unknown>
    const isBare = record.type === 'object' && !compositionKeys.some((key) => key in record)
    return [
        ...(isBare ? [pointer] : []),
        ...Object.entries(record).flatMap(([key, child]) => findBareObjects(child, `${pointer}/${key}`)),
    ]
}

describe('OpenAPI contract', () => {
    let app: INestApplication<App>
    let document: OpenAPIObject
    let operations: Operation[]
    let routes: Route[]

    beforeAll(async () => {
        await loadSwaggerPluginMetadata()
        app = await createTestApp()
        document = createOpenApiDocument(app)
        operations = listOperations(document)
        routes = listRoutes(app)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('generates the same document in preview mode as the booted app', async () => {
        expect(await createPreviewOpenApiDocument()).toEqual(document)
    })

    it('lists no servers, so every client resolves requests against its own origin', () => {
        expect(document.servers ?? []).toEqual([])
    })

    it('documents every controller route', () => {
        expect(routes.length).toBeGreaterThan(0)
        const documented = new Set(operations.map(({ method, path }) => `${method} ${path}`))
        const missing = routes
            .filter(({ method, path }) => !documented.has(`${method} ${path}`))
            .map(({ label, method, path }) => `${label}: ${method.toUpperCase()} ${path}`)
        expect(missing).toEqual([])
    })

    it('gives every operation a unique operationId', () => {
        const seen = new Map<string, string>()
        const problems: string[] = []
        for (const { method, path, operation } of operations) {
            const label = `${method.toUpperCase()} ${path}`
            if (!operation.operationId) {
                problems.push(`${label}: missing operationId`)
                continue
            }
            const previous = seen.get(operation.operationId)
            if (previous) {
                problems.push(`${label}: operationId "${operation.operationId}" already used by ${previous}`)
            }
            seen.set(operation.operationId, label)
        }
        expect(problems).toEqual([])
    })

    it('tags every operation so the SDK can group it', () => {
        const untagged = operations
            .filter(({ operation }) => !operation.tags?.length)
            .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
        expect(untagged).toEqual([])
    })

    it('declares bearer security on every JWT-protected route so the client sends the token', () => {
        const bearerSchemes = Object.entries(document.components?.securitySchemes ?? {})
            .filter(([, scheme]) => 'scheme' in scheme && scheme.type === 'http' && scheme.scheme === 'bearer')
            .map(([name]) => name)
        expect(bearerSchemes.length).toBeGreaterThan(0)

        const problems = routes
            .filter(({ requiresJwt }) => requiresJwt)
            .filter(({ method, path }) => {
                const match = operations.find((operation) => operation.method === method && operation.path === path)
                const security = match?.operation.security ?? document.security ?? []
                return !security.some((requirement) => bearerSchemes.some((scheme) => scheme in requirement))
            })
            .map(({ label, method, path }) => `${label}: ${method.toUpperCase()} ${path} lacks bearer security`)
        expect(problems).toEqual([])
    })

    it('rejects unauthenticated requests to every JWT-protected route', async () => {
        const protectedRoutes = routes.filter(({ requiresJwt }) => requiresJwt)
        expect(protectedRoutes.length).toBeGreaterThan(0)

        const problems: string[] = []
        for (const { label, method, path } of protectedRoutes) {
            const url = path.replace(/\{[^}]+\}/g, '1')
            const response = await request(app.getHttpServer())[method as 'get'](url)
            if (response.status !== 401) {
                problems.push(`${label}: ${method.toUpperCase()} ${url} returned ${response.status}`)
            }
        }
        expect(problems).toEqual([])
    })

    it('emits no schema as a bare object without properties, $ref or additionalProperties', () => {
        expect(Object.keys(document.components?.schemas ?? {}).length).toBeGreaterThan(0)
        expect(findBareObjects(document.components?.schemas, '#/components/schemas')).toEqual([])
        expect(findBareObjects(document.paths, '#/paths')).toEqual([])
    })
})
