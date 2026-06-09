import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@pi-oxide\/extension-lua$/,
        replacement: path.resolve(__dirname, "../../extension-lua/js/src/main/index.ts"),
      },
      {
        find: /^@pi-oxide\/extension-lua\/shared$/,
        replacement: path.resolve(__dirname, "../../extension-lua/js/src/shared/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
  },
});
