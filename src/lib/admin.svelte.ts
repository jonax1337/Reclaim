import { invoke } from "@tauri-apps/api/core";
import { isTauri, isElevated } from "./tweaks/bridge";

class AdminStore {
  elevated = $state(false);
  checked = $state(false);
  requesting = $state(false);

  async refresh() {
    if (!isTauri()) {
      this.checked = true;
      return;
    }
    try {
      this.elevated = await isElevated();
    } catch {
      this.elevated = false;
    }
    this.checked = true;
  }

  /**
   * Triggers Windows UAC via the existing elevated copy spawn + delayed exit.
   * Used by the Titlebar Elevate button and AdminBanner clicks — the initial
   * cold-launch UAC prompt is handled in Rust before the window mounts.
   */
  async relaunchElevated(): Promise<boolean> {
    if (!isTauri() || this.requesting) return false;
    this.requesting = true;
    try {
      await invoke("relaunch_elevated");
      return true;
    } catch {
      return false;
    } finally {
      this.requesting = false;
    }
  }
}

export const admin = new AdminStore();
