import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "bridge", include: ["test/**/*.test.ts"], testTimeout: 20_000 },
});
