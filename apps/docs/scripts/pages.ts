import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DefaultTheme } from 'vitepress'

export const docsRoot = resolve(import.meta.dirname, '..')

const excludedPrefixes = ['node_modules/', '.vitepress/', 'public/']
const excludedFiles = ['README.md', 'index.md']

export async function listPageFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { recursive: true, withFileTypes: true })
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => resolve(entry.parentPath, entry.name))
        .map((path) => path.slice(resolve(root).length + 1).replaceAll('\\', '/'))
        .filter((file) => !excludedPrefixes.some((prefix) => file.startsWith(prefix)))
        .filter((file) => !file.split('/').includes('node_modules'))
        .filter((file) => !excludedFiles.includes(file) && file.split('/').at(-1) !== 'README.md')
}

export function routeOf(pageFile: string): string {
    const withoutExtension = pageFile.replace(/\.md$/, '')
    if (withoutExtension === 'index') return '/'
    if (withoutExtension.endsWith('/index')) return `/${withoutExtension.slice(0, -'index'.length)}`
    return `/${withoutExtension}`
}

function collectLinks(items: DefaultTheme.SidebarItem[]): string[] {
    return items.flatMap((item) => [...(item.link ? [item.link] : []), ...collectLinks(item.items ?? [])])
}

export function sidebarLinks(sidebar: DefaultTheme.Sidebar): string[] {
    const sections = Array.isArray(sidebar) ? [sidebar] : Object.values(sidebar)
    return sections.flatMap((section) => collectLinks(Array.isArray(section) ? section : section.items))
}
