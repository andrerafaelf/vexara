import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['server.ts'],
	format: ['cjs'],
	outDir: 'dist',
	clean: true,
	sourcemap: true,
	shims: true
});
