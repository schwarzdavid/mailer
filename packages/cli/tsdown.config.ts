import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: { mailer: 'src/bin.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node22',
    dts: false,
    fixedExtension: false,
    clean: true,
    deps: { alwaysBundle: [/.*/] },
})
