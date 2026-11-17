import type { DefaultTheme } from 'vitepress'

export const sidebar: DefaultTheme.Sidebar = {
    '/installation/': [
        {
            text: 'Installation',
            items: [
                { text: 'Install mailer', link: '/installation/' },
                { text: 'First-run setup', link: '/installation/first-run-setup' },
                { text: 'Advanced configuration', link: '/installation/advanced-configuration' },
            ],
        },
    ],
    '/admin-guide/': [
        {
            text: 'Admin guide',
            items: [
                { text: 'Overview', link: '/admin-guide/overview' },
                { text: 'Projects', link: '/admin-guide/projects' },
                { text: 'Domains', link: '/admin-guide/domains' },
                {
                    text: 'Inbound forms',
                    items: [
                        { text: 'Create a form', link: '/admin-guide/inbound-forms/create' },
                        { text: 'Fields', link: '/admin-guide/inbound-forms/fields' },
                        { text: 'Security checks', link: '/admin-guide/inbound-forms/security' },
                        { text: 'Receivers and templates', link: '/admin-guide/inbound-forms/receivers-and-templates' },
                        { text: 'Embed the form', link: '/admin-guide/inbound-forms/embed' },
                        { text: 'Deliveries', link: '/admin-guide/inbound-forms/deliveries' },
                    ],
                },
                { text: 'Send API', link: '/admin-guide/send-api' },
                { text: 'Bounces', link: '/admin-guide/bounces' },
                { text: 'Users and roles', link: '/admin-guide/users-and-roles' },
                { text: 'Settings', link: '/admin-guide/settings' },
            ],
        },
    ],
    '/operations/': [
        {
            text: 'Operations',
            items: [
                { text: 'Update', link: '/operations/updating' },
                { text: 'Roll back', link: '/operations/rollback' },
                { text: 'Backup and restore', link: '/operations/backup-restore' },
                { text: 'Deliverability', link: '/operations/deliverability' },
                { text: 'Monitoring', link: '/operations/monitoring' },
                { text: 'Scaling', link: '/operations/scaling' },
                { text: 'Troubleshooting', link: '/operations/troubleshooting' },
                { text: 'Security', link: '/operations/security' },
            ],
        },
    ],
    '/api/': [
        {
            text: 'API',
            items: [
                { text: 'Overview', link: '/api/overview' },
                { text: 'Errors', link: '/api/errors' },
            ],
        },
        {
            text: 'Reference',
            items: [
                { text: 'Send API', link: '/api/reference/public-send' },
                { text: 'Form endpoints', link: '/api/reference/public-form' },
            ],
        },
    ],
}
