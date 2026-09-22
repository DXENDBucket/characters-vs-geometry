import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    watch: {
      // Generated desktop bundles and logs must not trigger recursive rescans.
      ignored: ["**/release/**", "**/logs/**", "**/*.log"]
    }
  }
});
