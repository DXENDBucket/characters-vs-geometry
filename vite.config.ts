import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { license: { fileName: "THIRD-PARTY-LICENSES.md" } },
  esbuild: { legalComments: "eof" },
  server: {
    watch: {
      // Generated desktop bundles and logs must not trigger recursive rescans.
      ignored: ["**/release/**", "**/logs/**", "**/*.log"]
    }
  }
});
