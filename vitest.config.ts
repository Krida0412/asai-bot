import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    exclude: [
      "**/tests/**",
      "**/node_modules/**",
      // Stale snapshots of past iterations that duplicate every src/* test.
      // They are kept on-disk for archeology but must not run in CI.
      "**/.backup-*/**",
      // Sibling project with its own vitest setup; not part of this app.
      "agent-town-main/**",
    ],
  },
});
