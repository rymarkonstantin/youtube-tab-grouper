import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, rm } from "node:fs/promises";
import { context } from "esbuild";
import type { BuildContext, BuildOptions } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const ESM_ENTRY_POINTS: Record<string, string> = {
  "background/index": path.join(ROOT_DIR, "src/background/index.ts"),
  "ui/popup/popup": path.join(ROOT_DIR, "ui/popup/popup.ts"),
  "ui/options/options": path.join(ROOT_DIR, "ui/options/options.ts"),
  "ui/stats/stats": path.join(ROOT_DIR, "ui/stats/stats.ts")
};

const CONTENT_ENTRY_POINTS: Record<string, string> = {
  "content/index": path.join(ROOT_DIR, "src/content/index.ts")
};

const isWatchMode = process.argv.includes("--watch");

const baseOptions: BuildOptions = {
  bundle: true,
  sourcemap: true,
  target: ["chrome120"],
  platform: "browser",
  logLevel: "info",
  resolveExtensions: [".ts", ".js", ".tsx", ".jsx", ".json"]
};

async function ensureDist() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
}

async function copyStaticAssets() {
  await cp(path.join(ROOT_DIR, "manifest.json"), path.join(DIST_DIR, "manifest.json"));
  await cp(path.join(ROOT_DIR, "images"), path.join(DIST_DIR, "images"), { recursive: true });

  await cp(path.join(ROOT_DIR, "ui"), path.join(DIST_DIR, "ui"), {
    recursive: true,
    filter: (src) => !src.endsWith(".js")
  });
}

async function buildBackgroundAndUi() {
  return context({
    ...baseOptions,
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    entryPoints: ESM_ENTRY_POINTS,
    outdir: DIST_DIR,
    entryNames: "[dir]/[name]"
  });
}

async function buildContentScript() {
  return context({
    ...baseOptions,
    format: "iife",
    splitting: false,
    entryPoints: CONTENT_ENTRY_POINTS,
    outdir: DIST_DIR,
    entryNames: "[dir]/[name]"
  });
}

async function run() {
  await ensureDist();
  await copyStaticAssets();

  const contexts: BuildContext[] = [];

  const esmCtx = await buildBackgroundAndUi();
  const contentCtx = await buildContentScript();

  contexts.push(esmCtx, contentCtx);

  if (isWatchMode) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes... press Ctrl+C to exit.");
    return contexts;
  }

  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));

  console.log("Build complete. Files written to /dist.");
  return [];
}

run().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
