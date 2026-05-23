import type { Profile } from "./profiles";

/** Edit handoff between Profiles list page and ProfileBuilder route. */
class ProfileEditStore {
  /** When set, ProfileBuilder pre-populates with this profile and replaces it on save. */
  draft = $state<Profile | null>(null);

  startNew() {
    this.draft = null;
  }

  startEdit(p: Profile) {
    this.draft = { ...p, tweakIds: [...p.tweakIds], bloatwarePatterns: p.bloatwarePatterns ? [...p.bloatwarePatterns] : undefined };
  }

  clear() {
    this.draft = null;
  }
}

export const profileEdit = new ProfileEditStore();
