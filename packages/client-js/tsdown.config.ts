import { defineConfig } from 'tsdown'

export default defineConfig([
    {
        entry: { index: 'src/index.ts' },
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        dts: true,
        clean: true,
    },
    {
        entry: { 'client.iife': 'src/index.ts' },
        format: 'iife',
        globalName: 'MailerClient',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        dts: false,
        clean: false,
        outputOptions: { entryFileNames: '[name].js' },
    },
])
