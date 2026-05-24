// Re-exports the catalog data esbuild should bundle for the catalog dump.
// Kept as a separate file because esbuild needs an entry that imports the
// .ts modules; this also lets us pick the exact subset we ship to Rust.
export { ALL_TWEAKS } from "../src/lib/tweaks/catalog.ts";
export { BLOATWARE, GROUP_LABELS as BLOATWARE_GROUPS } from "../src/lib/tweaks/bloatware.ts";
export { PROFILES } from "../src/lib/tweaks/profiles.ts";
export { UNIQUE_APPS, RECOMMENDED_IDS as APP_RECOMMENDED } from "../src/lib/apps/catalog.ts";
