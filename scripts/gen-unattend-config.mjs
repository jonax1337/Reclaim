#!/usr/bin/env node
/**
 * Build an UnattendConfig JSON file from a profile id + locale + flags.
 *
 * Mirrors `src/lib/tasksequence/simpleStore.svelte.ts::buildSimpleConfig`
 * but reads the already-exported catalog JSONs (the same ones cli.rs embeds
 * via include_str!), so it stays in sync with whatever was last
 * `pnpm catalog:export`-ed.
 *
 * Pair with: reclaim.exe --gen-install-media <config.json> --out-dir <dir>
 *
 * Usage:
 *   node scripts/gen-unattend-config.mjs \
 *     --profile privacy-max \
 *     --locale de-de \
 *     --username TestAdmin \
 *     --password "Reclaim!Test1" \
 *     --fully-automated \
 *     --target-disk 0 \
 *     --out config.json
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "..", "src-tauri", "data");

// ── locale table (mirror of SIMPLE_LOCALES in simpleStore.svelte.ts) ──
const LOCALES = {
  "de-de": { language: "de-DE", keyboard: "0407:00000407", systemLocale: "de-DE", userLocale: "de-DE", timezone: "W. Europe Standard Time", geoId: "94" },
  "en-us": { language: "en-US", keyboard: "0409:00000409", systemLocale: "en-US", userLocale: "en-US", timezone: "Pacific Standard Time", geoId: "244" },
  "en-gb": { language: "en-GB", keyboard: "0809:00000809", systemLocale: "en-GB", userLocale: "en-GB", timezone: "GMT Standard Time", geoId: "242" },
  "fr-fr": { language: "fr-FR", keyboard: "040C:0000040C", systemLocale: "fr-FR", userLocale: "fr-FR", timezone: "Romance Standard Time", geoId: "84" },
  "es-es": { language: "es-ES", keyboard: "040A:0000040A", systemLocale: "es-ES", userLocale: "es-ES", timezone: "Romance Standard Time", geoId: "217" },
};

// ── arg parser ──
function parseArgs(argv) {
  const out = {
    profile: "privacy-max",
    locale: "de-de",
    username: "User",
    password: "",
    fullyAutomated: false,
    targetDisk: 0,
    out: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? (() => { throw new Error(`${a} requires a value`); })();
    switch (a) {
      case "--profile": out.profile = next(); break;
      case "--locale": out.locale = next(); break;
      case "--username": out.username = next(); break;
      case "--password": out.password = next(); break;
      case "--fully-automated": out.fullyAutomated = true; break;
      case "--target-disk": out.targetDisk = Number(next()); break;
      case "--out": out.out = next(); break;
      case "-h": case "--help":
        console.log(`Usage: node scripts/gen-unattend-config.mjs --profile <id> [--locale de-de] [--username U] [--password P] [--fully-automated] [--target-disk N] --out <path>`);
        process.exit(0);
      default:
        throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!out.out) throw new Error("--out <path> required");
  return out;
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

const args = parseArgs(process.argv.slice(2));

const profiles = readJson("profiles.json");
const tweaks = readJson("tweaks.json");
const bloatwareDoc = readJson("bloatware.json");
const bloatwareEntries = Array.isArray(bloatwareDoc) ? bloatwareDoc : bloatwareDoc.entries;
const tweakById = new Map(tweaks.map((t) => [t.id, t]));

const profile = profiles.find((p) => p.id === args.profile);
if (!profile) {
  console.error(`profile '${args.profile}' not found. Available:`, profiles.map((p) => p.id).join(", "));
  process.exit(1);
}

const locale = LOCALES[args.locale];
if (!locale) {
  console.error(`locale '${args.locale}' not in table. Available:`, Object.keys(LOCALES).join(", "));
  process.exit(1);
}

// Collect reg-kind apply ops from every tweak in the profile.
const registryTweaks = [];
for (const id of profile.tweakIds) {
  const t = tweakById.get(id);
  if (!t) continue;
  for (const op of t.apply) {
    if (op.kind === "reg") {
      registryTweaks.push({
        hive: op.hive,
        path: op.path,
        name: op.name,
        type: op.type,
        value: op.value,
      });
    }
  }
}

// Debloat is uniform across profiles — the curated set of recommended
// bloatware patterns. Profiles control TWEAKS only. Users who want a custom
// debloat list use the GUI advanced mode (TaskSequence editor).
const appxPatterns = bloatwareEntries.filter((b) => b.recommended).map((b) => b.pattern);

const password = args.password || (args.fullyAutomated ? "Reclaim!" : "");

const config = {
  language: locale.language,
  keyboard: locale.keyboard,
  system_locale: locale.systemLocale,
  user_locale: locale.userLocale,
  timezone: locale.timezone,
  geo_id: locale.geoId,
  username: args.username || "User",
  password: password || null,
  autologon: args.fullyAutomated && password.length > 0,
  computer_name: "RECLAIM-IM-TEST",
  organization: "Reclaim",
  edition: "Windows 11 Pro",
  product_key: "W269N-WFGWX-YVC9B-4J6C9-T83GX",
  bypass_tpm_check: true,
  bypass_secure_boot_check: true,
  bypass_ram_check: true,
  bypass_storage_check: true,
  bypass_cpu_check: true,
  bypass_network_requirement: true,
  skip_ms_account: true,
  skip_eula: true,
  skip_oobe_privacy: true,
  disable_telemetry: true,
  disable_advertising_id: true,
  disable_location: true,
  disable_tailored_experiences: true,
  disable_find_my_device: true,
  disable_inking_typing: true,
  disable_diagnostic_data: true,
  disable_cortana: true,
  debloat_appx_patterns: appxPatterns,
  registry_tweaks: registryTweaks,
  custom_commands: [],
  winget_apps: [],
  disk_auto_setup: args.fullyAutomated ? { disk_number: args.targetDisk } : null,
};

fs.writeFileSync(args.out, JSON.stringify(config, null, 2));
console.log(`[ok] profile=${args.profile} locale=${args.locale} fully-automated=${args.fullyAutomated}`);
console.log(`[ok] ${registryTweaks.length} registry tweaks, ${appxPatterns.length} appx patterns`);
console.log(`[ok] wrote ${args.out}`);
