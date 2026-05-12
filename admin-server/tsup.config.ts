import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
});
