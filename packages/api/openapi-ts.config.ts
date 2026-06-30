import { UserConfig } from '@hey-api/openapi-ts'

export default {
    input: './assets/openapi.json',
    output: './dist',
    plugins: [
        '@hey-api/typescript',
        {
            name: '@hey-api/sdk',
            transformer: true,
            operations: {
                strategy: 'byTags',
                containerName: '{{name}}Api',
            },
            responseStyle: 'data',
        },
        '@hey-api/transformers',
        { name: '@hey-api/client-fetch', throwOnError: true },
    ],
} satisfies UserConfig
