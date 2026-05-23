import type { Profile } from "./profiles";
import { PROFILES } from "./profiles";
import { isTauri, readAppFile, writeAppFile } from "./bridge";

const STORAGE_KEY = "reclaim.custom-profiles";
const FILE_NAME = "custom-profiles.json";

function isValidProfile(p: unknown): p is Profile {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Profile).id === "string" &&
    Array.isArray((p as Profile).tweakIds)
  );
}

function loadLocal(): Profile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidProfile);
  } catch {
    return [];
  }
}

function persistLocal(profiles: Profile[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
}

function genId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

class CustomProfilesStore {
  items = $state<Profile[]>(loadLocal());
  /** Resolves once the file mirror has been read (or skipped in browser preview). */
  ready: Promise<void>;

  constructor() {
    this.ready = this.#hydrate();
  }

  async #hydrate() {
    if (!isTauri()) return;
    try {
      const raw = await readAppFile(FILE_NAME);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.items = parsed.filter(isValidProfile);
          persistLocal(this.items);
          return;
        }
      }
      // No file yet — seed from whatever localStorage has, so existing users
      // get their profiles mirrored to disk on first launch after upgrade.
      if (this.items.length > 0) await this.#persistFile();
    } catch {
      // File unreadable — keep localStorage state.
    }
  }

  async #persistFile() {
    if (!isTauri()) return;
    try {
      await writeAppFile(FILE_NAME, JSON.stringify(this.items, null, 2));
    } catch {}
  }

  #commit(next: Profile[]) {
    this.items = next;
    persistLocal(next);
    void this.#persistFile();
  }

  /** Persist a new profile. Returns its generated id. */
  add(p: Omit<Profile, "id" | "custom" | "createdAt">): string {
    const id = genId();
    const full: Profile = { ...p, id, custom: true, createdAt: Date.now() };
    this.#commit([...this.items, full]);
    return id;
  }

  /** Insert or replace by id. */
  upsert(profile: Profile) {
    const updated: Profile = { ...profile, custom: true };
    const idx = this.items.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      const next = this.items.slice();
      next[idx] = updated;
      this.#commit(next);
    } else {
      this.#commit([...this.items, updated]);
    }
  }

  remove(id: string) {
    this.#commit(this.items.filter((p) => p.id !== id));
  }

  get(id: string): Profile | undefined {
    return this.items.find((p) => p.id === id);
  }
}

export const customProfiles = new CustomProfilesStore();

/** Built-in + user-defined, with built-ins first. */
export function allProfiles(): Profile[] {
  return [...PROFILES, ...customProfiles.items];
}
