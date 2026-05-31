import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const doctest = mode === "doctest";

  return {
    define: {
      __DOCTEST__: JSON.stringify(doctest),
    },
    test: {
      globals: true,
      environment: "node",
    },
  };
});
