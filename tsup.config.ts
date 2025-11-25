import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/agent.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: "dist",
});
