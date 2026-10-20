import { INestApplication } from '@nestjs/common'
import {
    QueryTypes,
    type ColumnDescription,
    type ModelAttributeColumnOptions,
    type Model,
    type ModelCtor,
    type TableName,
} from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { App } from 'supertest/types.js'
import { createTestApp } from './support/app.js'

interface DbIndex {
    name: string
    primary: boolean
    unique: boolean
    partial: boolean
    columns: string[]
}

interface DbForeignKey {
    column: string
    referencedTable: string
    referencedColumn: string
    onDelete: string
    onUpdate: string
}

interface ModelSchema {
    model: ModelCtor<Model>
    table: string
    attributes: [string, ModelAttributeColumnOptions][]
    columns: Record<string, ColumnDescription>
    indexes: DbIndex[]
    foreignKeys: DbForeignKey[]
}

interface ModelReference {
    label: string
    attribute: ModelAttributeColumnOptions
    target: string
    foreignKey?: DbForeignKey
}

const referentialActions: Record<string, string> = {
    a: 'NO ACTION',
    r: 'RESTRICT',
    c: 'CASCADE',
    n: 'SET NULL',
    d: 'SET DEFAULT',
}

function tableNameOf(name: TableName): string {
    return typeof name === 'string' ? name : name.tableName
}

function enumLabels(column: ColumnDescription): string[] {
    return 'special' in column && Array.isArray(column.special) ? column.special.map(String) : []
}

function columnName(attributeName: string, attribute: ModelAttributeColumnOptions): string {
    return attribute.field ?? attributeName
}

function sameColumns(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((column) => right.includes(column))
}

function describeType(attribute: ModelAttributeColumnOptions): { sql: string; enumValues?: string[] } {
    const type = attribute.type
    if (typeof type === 'string') {
        return { sql: type.toUpperCase() }
    }
    const instance = 'toSql' in type ? type : new type()
    const enumValues = 'values' in instance && Array.isArray(instance.values) ? instance.values.map(String) : undefined
    const sql = instance
        .toSql()
        .toUpperCase()
        .replace(/^VARCHAR\b/, 'CHARACTER VARYING')
        .replace(/^CHAR\b/, 'CHARACTER')
        .replace(/^.+\[\]$/, 'ARRAY')
    return { sql, enumValues }
}

function referencedTable(attribute: ModelAttributeColumnOptions): string | undefined {
    const references = attribute.references
    if (!references || typeof references === 'string') {
        return references
    }
    const target = references.model
    if (!target) {
        return undefined
    }
    if (typeof target === 'function') {
        throw new Error(`${attribute.field ?? 'attribute'} references an unresolved model class ${target.name}`)
    }
    return tableNameOf(target)
}

function uniqueGroups(attributes: [string, ModelAttributeColumnOptions][]): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    for (const [name, attribute] of attributes) {
        const unique = attribute.unique
        if (!unique) {
            continue
        }
        const column = columnName(name, attribute)
        const key = unique === true ? `column:${column}` : typeof unique === 'string' ? unique : unique.name
        groups.set(key, [...(groups.get(key) ?? []), column])
    }
    return groups
}

function declaredIndexColumns(fields: unknown[]): string[] {
    return fields.map((field) => {
        if (typeof field === 'string') {
            return field
        }
        const { name, attribute } = field as { name?: string; attribute?: string }
        return name ?? attribute ?? String(field)
    })
}

describe('database schema matches the Sequelize models', () => {
    let app: INestApplication<App>
    let sequelize: Sequelize
    let schemas: ModelSchema[]

    async function loadIndexes(table: string): Promise<DbIndex[]> {
        return sequelize.query<DbIndex>(
            `SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indpred IS NOT NULL AS partial,
                    array_agg(a.attname::text ORDER BY k.ord) AS columns
             FROM pg_index ix
             JOIN pg_class t ON t.oid = ix.indrelid
             JOIN pg_class i ON i.oid = ix.indexrelid
             JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
             WHERE t.relname = :table AND t.relnamespace = 'public'::regnamespace
             GROUP BY i.relname, ix.indisprimary, ix.indisunique, ix.indpred`,
            { type: QueryTypes.SELECT, replacements: { table } },
        )
    }

    async function loadForeignKeys(table: string): Promise<DbForeignKey[]> {
        const rows = await sequelize.query<Omit<DbForeignKey, 'onDelete' | 'onUpdate'> & { del: string; upd: string }>(
            `SELECT a.attname AS "column", rt.relname AS "referencedTable", ra.attname AS "referencedColumn",
                    c.confdeltype AS del, c.confupdtype AS upd
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             JOIN pg_class rt ON rt.oid = c.confrelid
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
             WHERE c.contype = 'f' AND t.relname = :table AND t.relnamespace = 'public'::regnamespace`,
            { type: QueryTypes.SELECT, replacements: { table } },
        )
        return rows.map(({ del, upd, ...row }) => ({
            ...row,
            onDelete: referentialActions[del] ?? del,
            onUpdate: referentialActions[upd] ?? upd,
        }))
    }

    async function tableExists(table: string): Promise<boolean> {
        const rows = await sequelize.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :table`,
            { type: QueryTypes.SELECT, replacements: { table } },
        )
        return rows.length > 0
    }

    beforeAll(async () => {
        app = await createTestApp()
        sequelize = app.get(Sequelize)

        const models = Object.values(sequelize.models)
        schemas = await Promise.all(
            models.map(async (model) => {
                const table = tableNameOf(model.getTableName())
                const exists = await tableExists(table)
                return {
                    model,
                    table,
                    attributes: Object.entries(model.getAttributes()).filter(
                        ([, attribute]) => describeType(attribute).sql !== 'VIRTUAL',
                    ),
                    columns: exists ? await sequelize.getQueryInterface().describeTable(table) : {},
                    indexes: exists ? await loadIndexes(table) : [],
                    foreignKeys: exists ? await loadForeignKeys(table) : [],
                }
            }),
        )
    })

    afterAll(async () => {
        await app?.close()
    })

    it('registers the application models', () => {
        expect(schemas.length).toBeGreaterThanOrEqual(20)
    })

    it('has a migrated table for every model', async () => {
        const missing: string[] = []
        for (const { model, table } of schemas) {
            if (!(await tableExists(table))) {
                missing.push(`${model.name}: table "${table}" does not exist`)
            }
        }
        expect(missing).toEqual([])
    })

    it('has a column for every model attribute', () => {
        const problems = schemas.flatMap(({ model, attributes, columns }) =>
            attributes
                .map(([name, attribute]) => columnName(name, attribute))
                .filter((column) => !columns[column])
                .map((column) => `${model.name}.${column}: column missing in migrated schema`),
        )
        expect(problems).toEqual([])
    })

    it('matches every column type', () => {
        const problems = schemas.flatMap(({ model, attributes, columns }) =>
            attributes.flatMap(([name, attribute]) => {
                const column = columns[columnName(name, attribute)]
                if (!column) {
                    return []
                }
                const expected = describeType(attribute)
                if (expected.enumValues) {
                    const actual = enumLabels(column)
                    return column.type === 'USER-DEFINED' && sameColumns(actual, expected.enumValues)
                        ? []
                        : [
                              `${model.name}.${name}: expected ENUM(${expected.enumValues.join(', ')}), got ${column.type}(${actual.join(', ')})`,
                          ]
                }
                return column.type === expected.sql
                    ? []
                    : [`${model.name}.${name}: expected ${expected.sql}, got ${column.type}`]
            }),
        )
        expect(problems).toEqual([])
    })

    it('matches nullability of every column', () => {
        const problems = schemas.flatMap(({ model, attributes, columns }) =>
            attributes.flatMap(([name, attribute]) => {
                const column = columns[columnName(name, attribute)]
                const expected = attribute.primaryKey ? false : attribute.allowNull !== false
                return column && column.allowNull !== expected
                    ? [`${model.name}.${name}: model allowNull=${expected}, database allowNull=${column.allowNull}`]
                    : []
            }),
        )
        expect(problems).toEqual([])
    })

    it('matches the primary key of every table', () => {
        const problems = schemas.flatMap(({ model, attributes, columns }) => {
            const expected = attributes
                .filter(([, attribute]) => attribute.primaryKey)
                .map(([name, attribute]) => columnName(name, attribute))
            const actual = Object.entries(columns)
                .filter(([, column]) => column.primaryKey)
                .map(([name]) => name)
            return sameColumns(expected, actual)
                ? []
                : [`${model.name}: model primary key (${expected.join(', ')}), database (${actual.join(', ')})`]
        })
        expect(problems).toEqual([])
    })

    it('has no NOT NULL column without a default that the model cannot populate', () => {
        const problems = schemas.flatMap(({ model, attributes, columns }) => {
            const known = attributes.map(([name, attribute]) => columnName(name, attribute))
            return Object.entries(columns)
                .filter(([name, column]) => !column.allowNull && column.defaultValue == null && !known.includes(name))
                .map(
                    ([name]) =>
                        `${model.name}: database column "${name}" is NOT NULL without default but not in the model`,
                )
        })
        expect(problems).toEqual([])
    })

    function declaredIndexes(model: ModelCtor<Model>, attributes: [string, ModelAttributeColumnOptions][]) {
        return [
            ...[...uniqueGroups(attributes).values()].map((columns) => ({ columns, unique: true, partial: false })),
            ...(model.options.indexes ?? []).map((index) => ({
                columns: declaredIndexColumns(index.fields ?? []),
                unique: index.unique === true,
                partial: index.where !== undefined,
            })),
        ]
    }

    const describeIndex = ({ columns, unique, partial }: Pick<DbIndex, 'columns' | 'unique' | 'partial'>) =>
        `${partial ? 'partial ' : ''}${unique ? 'unique ' : ''}index on (${columns.join(', ')})`

    const matchesIndex = (
        left: Pick<DbIndex, 'columns' | 'unique' | 'partial'>,
        right: Pick<DbIndex, 'columns' | 'unique' | 'partial'>,
    ) => left.unique === right.unique && left.partial === right.partial && sameColumns(left.columns, right.columns)

    it('enforces every unique constraint the model declares', () => {
        const problems = schemas.flatMap(({ model, attributes, indexes }) =>
            declaredIndexes(model, attributes)
                .filter((declared) => declared.unique)
                .filter((declared) => !indexes.some((index) => matchesIndex(index, declared)))
                .map((declared) => `${model.name}: missing ${describeIndex(declared)}`),
        )
        expect(problems).toEqual([])
    })

    it('has every non-unique index the model declares', () => {
        const problems = schemas.flatMap(({ model, attributes, indexes }) =>
            declaredIndexes(model, attributes)
                .filter((declared) => !declared.unique)
                .filter((declared) => !indexes.some((index) => matchesIndex(index, declared)))
                .map((declared) => `${model.name}: missing ${describeIndex(declared)}`),
        )
        expect(problems).toEqual([])
    })

    it('declares every index the database has', () => {
        const problems = schemas.flatMap(({ model, attributes, indexes }) => {
            const declared = declaredIndexes(model, attributes)
            return indexes
                .filter((index) => !index.primary)
                .filter((index) => !declared.some((candidate) => matchesIndex(index, candidate)))
                .map((index) => `${model.name}: database ${describeIndex(index)} (${index.name}) is not declared`)
        })
        expect(problems).toEqual([])
    })

    function modelReferences(): ModelReference[] {
        return schemas.flatMap(({ model, attributes, foreignKeys }) =>
            attributes.flatMap(([name, attribute]) => {
                const table = referencedTable(attribute)
                if (!table || !attribute.references || typeof attribute.references === 'string') {
                    return []
                }
                const key = attribute.references.key ?? 'id'
                const column = columnName(name, attribute)
                const foreignKey = foreignKeys.find(
                    (candidate) =>
                        candidate.column === column &&
                        candidate.referencedTable === table &&
                        candidate.referencedColumn === key,
                )
                return [{ label: `${model.name}.${column}`, attribute, target: `${table}.${key}`, foreignKey }]
            }),
        )
    }

    it('has a foreign key for every model reference', () => {
        const problems = modelReferences()
            .filter(({ foreignKey }) => !foreignKey)
            .map(({ label, target }) => `${label}: missing foreign key to ${target}`)
        expect(problems).toEqual([])
    })

    it('declares a model reference for every foreign key in the database', () => {
        const references = modelReferences()
        const problems = schemas.flatMap(({ model, foreignKeys }) =>
            foreignKeys
                .filter((foreignKey) => !references.some((reference) => reference.foreignKey === foreignKey))
                .map(
                    (foreignKey) =>
                        `${model.name}.${foreignKey.column}: database foreign key to ${foreignKey.referencedTable}.${foreignKey.referencedColumn} has no model association`,
                ),
        )
        expect(problems).toEqual([])
    })

    it('applies exactly the referential actions the model declares', () => {
        const problems = modelReferences().flatMap(({ label, attribute, foreignKey }) =>
            (['onDelete', 'onUpdate'] as const)
                .filter(
                    (action) => foreignKey && (attribute[action]?.toUpperCase() ?? 'NO ACTION') !== foreignKey[action],
                )
                .map(
                    (action) =>
                        `${label}: model ${action}=${attribute[action] ?? 'NO ACTION'}, database ${action}=${foreignKey?.[action]}`,
                ),
        )
        expect(problems).toEqual([])
    })
})
