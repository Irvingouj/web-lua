import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DOCTEST__: JSON.stringify(true),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/doctest.test.ts"],
  },
});
