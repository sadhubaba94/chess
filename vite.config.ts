import { defineConfig } from 'vitest/config';

// No React plugin is required: Vite transforms TSX with the automatic JSX runtime
// (configured through tsconfig "jsx": "react-jsx"). Fast Refresh is therefore not enabled;
// add @vitejs/plugin-react if you want it during development.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
