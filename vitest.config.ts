import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/acp-client", "packages/bridge", "packages/web"],
  },
});
