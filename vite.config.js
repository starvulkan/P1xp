// fun configs for your vite-sse

import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
})