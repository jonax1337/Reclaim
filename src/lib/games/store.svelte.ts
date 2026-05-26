import { regRead, regWrite, regDeleteValue } from "$lib/tweaks/bridge";

const STORAGE_KEY = "reclaim.game-profiles";

const GPU_PREFS_KEY = "Software\\Microsoft\\DirectX\\UserGpuPreferences";
const APPCOMPAT_LAYERS_KEY = "Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers";

export type GpuPreference = "auto" | "power-save" | "high-performance";

export type GameProfile = {
  /** Stable id (timestamp + random) so renames don't lose the row. */
  id: string;
  /** User-visible label — derived from filename by default but editable. */
  name: string;
  /** Absolute path to the executable. Used as the registry value name. */
  exePath: string;
  /** Optional icon, base64 PNG. Filled lazily by the route. */
  iconBase64?: string;
  gpuPreference: GpuPreference;
  disableFullscreenOptimizations: boolean;
  highDpiAware: boolean;
  runAsAdmin: boolean;
  /** When the profile was first created. */
  createdAt: number;
};

function loadLocal(): GameProfile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (g): g is GameProfile =>
        typeof g === "object" &&
        g !== null &&
        typeof (g as GameProfile).id === "string" &&
        typeof (g as GameProfile).exePath === "string",
    );
  } catch {
    return [];
  }
}

function persist(items: GameProfile[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function genId(): string {
  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function gpuPreferenceValue(pref: GpuPreference): string {
  // Windows GPU scheduler format: "GpuPreference=N;" — 0 auto, 1 power, 2 perf.
  const n = pref === "high-performance" ? 2 : pref === "power-save" ? 1 : 0;
  return `GpuPreference=${n};`;
}

function layersValue(opts: {
  disableFullscreenOptimizations: boolean;
  highDpiAware: boolean;
  runAsAdmin: boolean;
}): string {
  // AppCompat Layers values are space-separated flags prefixed with "~".
  // Empty list means no overrides — we delete the value in that case.
  const flags: string[] = [];
  if (opts.disableFullscreenOptimizations) flags.push("DISABLEDXMAXIMIZEDWINDOWEDMODE");
  if (opts.highDpiAware) flags.push("HIGHDPIAWARE");
  if (opts.runAsAdmin) flags.push("RUNASADMIN");
  if (flags.length === 0) return "";
  return `~ ${flags.join(" ")}`;
}

/** Push a profile's settings into the Windows registry. HKCU only — no admin
 *  needed. Returns silently on failure so a single bad path doesn't abort. */
export async function syncProfileToRegistry(p: GameProfile): Promise<void> {
  // GPU preference: write or delete value depending on whether the user wants
  // the OS default.
  if (p.gpuPreference === "auto") {
    try {
      await regDeleteValue({ hive: "HKCU", path: GPU_PREFS_KEY, name: p.exePath });
    } catch {}
  } else {
    await regWrite({
      hive: "HKCU",
      path: GPU_PREFS_KEY,
      name: p.exePath,
      type: "SZ",
      value: gpuPreferenceValue(p.gpuPreference),
    });
  }

  // AppCompat Layers: write or delete depending on whether any flag is on.
  const layers = layersValue(p);
  if (layers === "") {
    try {
      await regDeleteValue({ hive: "HKCU", path: APPCOMPAT_LAYERS_KEY, name: p.exePath });
    } catch {}
  } else {
    await regWrite({
      hive: "HKCU",
      path: APPCOMPAT_LAYERS_KEY,
      name: p.exePath,
      type: "SZ",
      value: layers,
    });
  }
}

/** Best-effort read of whether a profile's reg values are currently in place. */
export async function profileLooksApplied(p: GameProfile): Promise<boolean> {
  try {
    const gpu = await regRead({ hive: "HKCU", path: GPU_PREFS_KEY, name: p.exePath });
    const layers = await regRead({ hive: "HKCU", path: APPCOMPAT_LAYERS_KEY, name: p.exePath });
    const expectedGpu = p.gpuPreference === "auto" ? null : gpuPreferenceValue(p.gpuPreference);
    const expectedLayers = layersValue(p);
    const gpuOk = expectedGpu === null ? gpu === null : gpu === expectedGpu;
    const layersOk = expectedLayers === "" ? layers === null : layers === expectedLayers;
    return gpuOk && layersOk;
  } catch {
    return false;
  }
}

/** Delete a profile's reg traces. Used when the user removes a profile. */
export async function removeProfileFromRegistry(p: GameProfile): Promise<void> {
  try {
    await regDeleteValue({ hive: "HKCU", path: GPU_PREFS_KEY, name: p.exePath });
  } catch {}
  try {
    await regDeleteValue({ hive: "HKCU", path: APPCOMPAT_LAYERS_KEY, name: p.exePath });
  } catch {}
}

class GameProfilesStore {
  items = $state<GameProfile[]>(loadLocal());

  add(input: Omit<GameProfile, "id" | "createdAt">): GameProfile {
    const profile: GameProfile = {
      ...input,
      id: genId(),
      createdAt: Date.now(),
    };
    this.items = [...this.items, profile];
    persist(this.items);
    return profile;
  }

  update(id: string, patch: Partial<Omit<GameProfile, "id" | "createdAt">>) {
    this.items = this.items.map((p) => (p.id === id ? { ...p, ...patch } : p));
    persist(this.items);
  }

  remove(id: string) {
    this.items = this.items.filter((p) => p.id !== id);
    persist(this.items);
  }

  findByExePath(exePath: string): GameProfile | undefined {
    return this.items.find((p) => p.exePath.toLowerCase() === exePath.toLowerCase());
  }
}

export const gameProfiles = new GameProfilesStore();
