import { defineConfig } from 'vitepress'
import { sidebar } from './sidebar.ts'

const base = '/mailer/'

export default defineConfig({
    lang: 'en-US',
    title: 'mailer',
    description: 'Self-hosted mail service for websites',
    base,
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]],
    cleanUrls: true,
    lastUpdated: true,
    srcExclude: ['**/README.md'],
    markdown: { languages: [{ name: 'dns', scopeName: 'source.dns', patterns: [], repository: {} }] },
    themeConfig: {
        logo: '/logo.svg',
        nav: [
            { text: 'Introduction', link: '/introduction/what-is-mailer', activeMatch: '^/introduction/' },
            { text: 'Installation', link: '/installation/prepare-server', activeMatch: '^/installation/' },
            { text: 'Configuration', link: '/configuration/environment', activeMatch: '^/configuration/' },
            { text: 'Admin guide', link: '/admin-guide/overview', activeMatch: '^/admin-guide/' },
            { text: 'Operations', link: '/operations/updating', activeMatch: '^/operations/' },
            { text: 'API', link: '/api/overview', activeMatch: '^/api/' },
            { text: 'Reference', link: '/reference/cli', activeMatch: '^/reference/' },
        ],
        sidebar,
        outline: [2, 3],
        search: { provider: 'local' },
        editLink: {
            pattern: 'https://github.com/schwarzdavid/mailer/edit/main/apps/docs/:path',
            text: 'Edit this page on GitHub',
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/schwarzdavid/mailer' }],
        footer: { message: 'Released under the AGPL-3.0-only license.', copyright: 'Copyright © 2026 David Schwarz' },
    },
})
