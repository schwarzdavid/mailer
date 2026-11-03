import type { DefaultTheme } from 'vitepress'
import { describe, expect, it } from 'vitest'
import { sidebar } from '../../.vitepress/sidebar.ts'
import { docsRoot, listPageFiles, routeOf, sidebarLinks } from '../pages.ts'

describe('sidebar', () => {
    it('lists every page exactly once and nothing else', async () => {
        const pages = (await listPageFiles(docsRoot)).map(routeOf).sort()
        const links = sidebarLinks(sidebar).sort()
        expect(links).toEqual(pages)
        expect(new Set(links).size).toBe(links.length)
    })
})

describe('routeOf', () => {
    it('drops the extension and treats index files as directories', () => {
        expect(routeOf('installation/dns.md')).toBe('/installation/dns')
        expect(routeOf('api/reference/index.md')).toBe('/api/reference/')
    })
})

describe('sidebarLinks', () => {
    it('collects nested groups, group links and section-level entries', () => {
        const literal: DefaultTheme.Sidebar = {
            '/a/': [
                { text: 'Top', link: '/a/top' },
                {
                    text: 'Group',
                    link: '/a/group',
                    items: [{ text: 'Inner', items: [{ text: 'Deep', link: '/a/deep' }] }],
                },
            ],
            '/b/': [{ text: 'B', items: [{ text: 'B1', link: '/b/one' }] }],
        }
        expect(sidebarLinks(literal).sort()).toEqual(['/a/deep', '/a/group', '/a/top', '/b/one'])
    })
})
