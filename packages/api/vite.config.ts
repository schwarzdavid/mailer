import {defineConfig} from "vite";
import {heyApiPlugin} from "@hey-api/vite-plugin";
import {resolve} from "node:path";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(import.meta.dirname, 'src/index.ts'),
            name: 'api',
            formats: ['es'],
        }
    },
    plugins: [
        heyApiPlugin({
            config: {
                input: './assets/openapi.json',
                output: {path: 'src/openapi', entryFile: false}
            }
        })
    ]
})
