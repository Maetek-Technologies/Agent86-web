import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "acp-client", include: ["test/**/*.test.ts"] },
});
