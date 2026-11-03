import type { DefaultTheme } from 'vitepress'

const referencePages: DefaultTheme.SidebarItem[] = [
    { text: 'Setup', link: '/api/reference/setup' },
    { text: 'Authentication', link: '/api/reference/auth' },
    { text: 'Projects', link: '/api/reference/project' },
    { text: 'Domains', link: '/api/reference/domain' },
    { text: 'Inbound forms', link: '/api/reference/inbound-form' },
    { text: 'Public form endpoints', link: '/api/reference/public-form' },
    { text: 'Public send API', link: '/api/reference/public-send' },
    { text: 'API keys', link: '/api/reference/api-key' },
    { text: 'Sent mail', link: '/api/reference/mail-message' },
    { text: 'Bounces', link: '/api/reference/bounce' },
    { text: 'Users', link: '/api/reference/user' },
    { text: 'Roles', link: '/api/reference/role' },
    { text: 'Settings', link: '/api/reference/settings' },
]

export const sidebar: DefaultTheme.Sidebar = {
    '/introduction/': [
        {
            text: 'Introduction',
            items: [
                { text: 'What is mailer', link: '/introduction/what-is-mailer' },
                { text: 'How it works', link: '/introduction/how-it-works' },
                { text: 'Requirements', link: '/introduction/requirements' },
            ],
        },
    ],
    '/installation/': [
        {
            text: 'Installation',
            items: [
                { text: 'Prepare the server', link: '/installation/prepare-server' },
                { text: 'DNS records', link: '/installation/dns' },
                { text: 'Docker Compose', link: '/installation/docker-compose' },
                { text: 'First-run setup', link: '/installation/first-run-setup' },
                { text: 'Verify the installation', link: '/installation/verify' },
                { text: 'Going live', link: '/installation/going-live' },
            ],
        },
    ],
    '/configuration/': [
        {
            text: 'Configuration',
            items: [
                { text: 'Environment variables', link: '/configuration/environment' },
                { text: 'External Postgres and Redis', link: '/configuration/external-postgres-redis' },
                { text: 'Reverse proxy', link: '/configuration/reverse-proxy' },
                { text: 'Rate limits', link: '/configuration/rate-limits' },
                { text: 'Logging', link: '/configuration/logging' },
                { text: 'Health checks', link: '/configuration/health-checks' },
                { text: 'Without Docker', link: '/configuration/without-docker' },
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
                { text: 'Rotating secrets', link: '/operations/rotating-secrets' },
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
            items: [{ text: 'Reference', link: '/api/reference/' }, ...referencePages],
        },
    ],
    '/reference/': [
        {
            text: 'Reference',
            items: [
                { text: 'CLI', link: '/reference/cli' },
                { text: 'Compose stack', link: '/reference/compose-stack' },
                { text: 'Glossary', link: '/reference/glossary' },
                { text: 'Roadmap', link: '/reference/roadmap' },
                { text: 'Development', link: '/reference/development' },
            ],
        },
    ],
}
