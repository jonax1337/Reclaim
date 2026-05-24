#!/usr/bin/env node
// Bundles src/lib/tweaks/{catalog,bloatware,profiles}.ts and src/lib/apps/catalog.ts
// via esbuild, imports the result, and writes JSON snapshots into src-tauri/data/.
// The Rust binary `include_str!`s those JSON files so CLI mode has the same
// data the GUI uses without re-running JS at runtime.

import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "src-tauri", "data");

const entry = resolve(here, "_catalog-entry.mjs");

async function bundle() {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "node20",
    write: false,
    logLevel: "warning",
    absWorkingDir: root,
  });
  return result.outputFiles[0].text;
}

async function main() {
  const code = await bundle();
  // Run the bundled ESM in this process via a data: URL.
  const url = "data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64");
  const mod = await import(url);
  const { ALL_TWEAKS, PROFILES, BLOATWARE, BLOATWARE_GROUPS, UNIQUE_APPS, APP_RECOMMENDED } = mod;

  await mkdir(outDir, { recursive: true });

  // The TS catalog exposes ALL_TWEAKS with everything we need. We pass it
  // through unchanged so the Rust side sees the exact same shape used by the
  // GUI executor.
  await writeFile(
    resolve(outDir, "tweaks.json"),
    JSON.stringify(ALL_TWEAKS, null, 0) + "\n",
    "utf8",
  );
  await writeFile(
    resolve(outDir, "bloatware.json"),
    JSON.stringify({ entries: BLOATWARE, groups: BLOATWARE_GROUPS }, null, 0) + "\n",
    "utf8",
  );
  await writeFile(
    resolve(outDir, "profiles.json"),
    JSON.stringify(PROFILES, null, 0) + "\n",
    "utf8",
  );
  await writeFile(
    resolve(outDir, "apps.json"),
    JSON.stringify({ apps: UNIQUE_APPS, recommended: APP_RECOMMENDED }, null, 0) + "\n",
    "utf8",
  );

  console.log(
    `[catalog] wrote ${ALL_TWEAKS.length} tweaks, ${BLOATWARE.length} bloatware patterns, ${PROFILES.length} profiles, ${UNIQUE_APPS.length} apps`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
