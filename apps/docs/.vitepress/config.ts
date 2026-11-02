import { defineConfig } from 'vitepress'
import { sidebar } from './sidebar.ts'

export default defineConfig({
    lang: 'en-US',
    title: 'mailer',
    description: 'Self-hosted mail service for websites',
    base: '/mailer/',
    cleanUrls: true,
    lastUpdated: true,
    srcExclude: ['**/README.md'],
    markdown: { languages: [{ name: 'dns', scopeName: 'source.dns', patterns: [], repository: {} }] },
    themeConfig: {
        nav: [
            { text: 'Introduction', link: '/introduction/what-is-mailer' },
            { text: 'Installation', link: '/installation/prepare-server' },
            { text: 'Configuration', link: '/configuration/environment' },
            { text: 'Admin guide', link: '/admin-guide/overview' },
            { text: 'Operations', link: '/operations/updating' },
            { text: 'API', link: '/api/overview' },
            { text: 'Reference', link: '/reference/cli' },
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
