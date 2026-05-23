import { isTauri, readAppFile, writeAppFile } from "./tweaks/bridge";

/**
 * App-level preferences mirrored to <app_data_dir>/prefs.json so they survive
 * the WebView2 cache being wiped (e.g. portable USB-stick move). localStorage
 * remains the synchronous source of truth for first paint; the file is the
 * durable backup that's read on cold start and re-syncs the in-memory store.
 */
const FILE_NAME = "prefs.json";
const STORAGE_KEY = "reclaim.prefs";

type PrefsData = {
  theme?: "system" | "light" | "dark";
  onboarded?: boolean;
};

function readLocal(): PrefsData {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Backwards-compat: migrate legacy keys.
      const legacyTheme = localStorage.getItem("reclaim.theme");
      const legacyOnboarded = localStorage.getItem("reclaim.onboarded");
      const out: PrefsData = {};
      if (legacyTheme === "light" || legacyTheme === "dark" || legacyTheme === "system") {
        out.theme = legacyTheme;
      }
      if (legacyOnboarded === "1") out.onboarded = true;
      return out;
    }
    return JSON.parse(raw) as PrefsData;
  } catch {
    return {};
  }
}

function writeLocal(data: PrefsData) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

class PrefsStore {
  theme = $state<"system" | "light" | "dark">("system");
  onboarded = $state(false);
  loaded = $state(false);
  /** Resolves once the file mirror has been read (or skipped in browser preview). */
  ready: Promise<void>;

  constructor() {
    const local = readLocal();
    this.theme = local.theme ?? "system";
    this.onboarded = local.onboarded ?? false;
    this.ready = this.#hydrate();
  }

  async #hydrate() {
    if (!isTauri()) {
      this.loaded = true;
      return;
    }
    try {
      const raw = await readAppFile(FILE_NAME);
      if (raw) {
        const parsed = JSON.parse(raw) as PrefsData;
        if (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system") {
          this.theme = parsed.theme;
        }
        if (typeof parsed.onboarded === "boolean") {
          this.onboarded = parsed.onboarded;
        }
        writeLocal({ theme: this.theme, onboarded: this.onboarded });
      } else {
        // First run on a fresh machine in installed mode, OR fresh portable
        // install where the data folder was just created. Seed the file from
        // whatever migrated localStorage had.
        await this.#persist();
      }
    } catch {
      // File missing or unreadable — keep localStorage values.
    }
    this.loaded = true;
  }

  async #persist() {
    const data: PrefsData = { theme: this.theme, onboarded: this.onboarded };
    writeLocal(data);
    if (isTauri()) {
      try {
        await writeAppFile(FILE_NAME, JSON.stringify(data, null, 2));
      } catch {}
    }
  }

  setTheme(theme: "system" | "light" | "dark") {
    this.theme = theme;
    void this.#persist();
  }

  setOnboarded(value: boolean) {
    this.onboarded = value;
    void this.#persist();
  }
}

export const prefs = new PrefsStore();
