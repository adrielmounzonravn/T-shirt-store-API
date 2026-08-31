import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/e2e/global-setup.ts'],
    // Every suite shares the same containerized database (see
    // `resetDatabase` in `test/e2e/test-app.ts`), so files must not run
    // concurrently against it.
    fileParallelism: false,
    // Container boot + `prisma migrate deploy` can take well over Vitest's
    // 10s default hook timeout.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
