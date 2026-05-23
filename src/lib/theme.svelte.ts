import { prefs } from "./prefs.svelte";
import { getAccentColor, isTauri } from "./tweaks/bridge";

export type ThemeMode = "system" | "light" | "dark";

const media =
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function apply(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

/** sRGB byte triple → OKLCH. Hue is in degrees, [0, 360). */
function rgbToOklch(rgb: [number, number, number]): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb;
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const lp = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const mp = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const sp = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(lp);
  const m_ = Math.cbrt(mp);
  const s_ = Math.cbrt(sp);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  const h = (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360;
  return [L, C, h];
}

/** Pull the Windows DWM accent hue and override --primary / --ring on <html>.
 *  Keeps the carefully-tuned L/C from the original palette so the accent fits
 *  the rest of the chrome regardless of how saturated the user's accent is.
 *  Falls back silently when not in Tauri or when the registry read fails. */
async function applySystemAccent(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (!isTauri()) {
    html.style.removeProperty("--primary");
    html.style.removeProperty("--ring");
    html.style.removeProperty("--primary-foreground");
    return;
  }
  let rgb: [number, number, number] | null = null;
  try {
    rgb = await getAccentColor();
  } catch {
    rgb = null;
  }
  if (!rgb) {
    html.style.removeProperty("--primary");
    html.style.removeProperty("--ring");
    html.style.removeProperty("--primary-foreground");
    return;
  }
  const [, , h] = rgbToOklch(rgb);
  const L = resolved === "dark" ? 0.72 : 0.56;
  const C = resolved === "dark" ? 0.19 : 0.21;
  const primary = `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(2)})`;
  html.style.setProperty("--primary", primary);
  html.style.setProperty("--ring", primary);
  html.style.setProperty(
    "--primary-foreground",
    L > 0.55 ? "oklch(0.14 0.012 285)" : "oklch(0.99 0 0)",
  );
}

class ThemeStore {
  systemPrefersDark = $state(media?.matches ?? false);

  get mode(): ThemeMode {
    return prefs.theme;
  }

  get resolved(): "light" | "dark" {
    return prefs.theme === "system"
      ? this.systemPrefersDark
        ? "dark"
        : "light"
      : prefs.theme;
  }

  constructor() {
    apply(this.resolved);
    void applySystemAccent(this.resolved);
    media?.addEventListener("change", (e) => {
      this.systemPrefersDark = e.matches;
      apply(this.resolved);
      void applySystemAccent(this.resolved);
    });
    $effect.root(() => {
      $effect(() => {
        const r = this.resolved;
        apply(r);
        void applySystemAccent(r);
      });
    });
  }

  set(mode: ThemeMode) {
    prefs.setTheme(mode);
  }

  /** Re-read the system accent. Call after the user changes it in Windows
   *  Settings and wants the app to pick it up without a relaunch. */
  refreshAccent() {
    void applySystemAccent(this.resolved);
  }
}

export const theme = new ThemeStore();
