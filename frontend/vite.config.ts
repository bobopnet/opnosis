import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    define: {
        global: 'globalThis',
    },
    resolve: {
        alias: {
            '@opnosis/shared': path.resolve(__dirname, '../shared/src/index.ts'),
        },
    },
});
