// Native Win11 toast notification dispatcher with per-channel throttling and
// click routing. Wraps `tauri-plugin-notification` so the rest of the app
// doesn't care which backend the OS uses. All notifications open Reclaim on
// the relevant route when clicked — no one-click actions from the toast
// itself by design (WU installs reboot; driver installs can brick GPUs).

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
} from "@tauri-apps/plugin-notification";
import { push as routerPush } from "svelte-spa-router";
import { service, type NotificationChannel } from "./service.svelte";
import { isTauri } from "./tweaks/bridge";
import { log } from "./log.svelte";

let permissionEnsured = false;
let actionHandlerWired = false;

async function ensurePermission(): Promise<boolean> {
  if (!isTauri()) return false;
  if (permissionEnsured) return true;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const p = await requestPermission();
      granted = p === "granted";
    }
    permissionEnsured = granted;
    return granted;
  } catch {
    return false;
  }
}

function ensureActionHandler() {
  if (actionHandlerWired || !isTauri()) return;
  actionHandlerWired = true;
  // The notification plugin returns an opaque payload via the `onAction`
  // callback when the user clicks the toast itself. We stash the target
  // route inside a `[reclaim:/route]` prefix on the body so we can recover it
  // here without needing tray-side state.
  try {
    onAction((notification) => {
      const body = String(notification.body ?? "");
      const m = body.match(/\[reclaim:(\/[A-Za-z0-9/_-]+)\]$/);
      if (m) {
        try {
          routerPush(m[1]);
        } catch {}
      }
    });
  } catch {
    // older plugin versions may not support onAction — silent fallback
  }
}

export type NotifyArgs = {
  channel: NotificationChannel;
  title: string;
  body: string;
  /** Hash used for 24h throttling. Identical-hash repeats within 24h are dropped. */
  hash: string;
  /** Route to open on click. Encoded into the body so onAction can recover it. */
  route?: string;
};

/**
 * Send a native toast for a channel. Returns true if the toast was actually
 * shown, false if it was throttled, disabled by user prefs, permission
 * missing, or the OS suppressed it.
 */
export async function notify(args: NotifyArgs): Promise<boolean> {
  if (!isTauri()) return false;
  // 1) per-channel user pref check
  if (!service.config.notificationPrefs[args.channel]) return false;
  // 2) 24h throttle dedupe
  if (service.shouldThrottle(args.channel, args.hash)) return false;
  // 3) OS permission
  if (!(await ensurePermission())) return false;
  ensureActionHandler();

  const routeTag = args.route ? `\n\n[reclaim:${args.route}]` : "";
  try {
    sendNotification({
      title: args.title,
      body: `${args.body}${routeTag}`,
    });
    await service.recordThrottle(args.channel, args.hash);
    log.info("notification.sent", args.channel, args.title);
    return true;
  } catch {
    return false;
  }
}

/** Tiny djb2-style hash for throttle keys. Stable across reloads. */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
