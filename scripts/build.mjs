import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: directory,
  entryPoints: { sidebar: "src/index.js" },
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "cjs",
});
