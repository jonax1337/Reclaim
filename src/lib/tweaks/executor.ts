import {
  regRead,
  regWrite,
  regDeleteValue,
  runPowershell,
  type RegLocator,
} from "./bridge";
import type { RegOp, Tweak, TweakOp } from "./catalog";
import { log } from "$lib/log.svelte";
import { service } from "$lib/service.svelte";

export function tweakRequiresAdmin(tweak: Tweak): boolean {
  for (const op of tweak.apply) {
    if (op.kind === "reg" && op.hive === "HKLM") return true;
    if (op.kind === "shell") return true;
  }
  return false;
}

export type TweakState = "on" | "off" | "unknown";

async function readRegOp(op: RegOp): Promise<string | number | null> {
  const loc: RegLocator = { hive: op.hive, path: op.path, name: op.name };
  try {
    return await regRead(loc);
  } catch {
    return null;
  }
}

export async function getTweakState(tweak: Tweak): Promise<TweakState> {
  const checks = tweak.check ?? tweak.apply.filter((o): o is RegOp => o.kind === "reg");
  if (checks.length === 0) return "unknown";
  for (const c of checks) {
    if (c.kind !== "reg") continue;
    const v = await readRegOp(c);
    if (v === null) return "off";
    if (v !== c.value) return "off";
  }
  return "on";
}

async function applyOp(op: TweakOp): Promise<void> {
  if (op.kind === "reg") {
    await regWrite({
      hive: op.hive,
      path: op.path,
      name: op.name,
      type: op.type,
      value: op.value,
    });
  } else {
    const res = await runPowershell(op.script, op.elevated ?? false);
    if (!res.success) {
      throw new Error(res.stderr || `PowerShell exit ${res.code}`);
    }
  }
}

export async function applyTweak(tweak: Tweak): Promise<void> {
  try {
    for (const op of tweak.apply) {
      await applyOp(op);
    }
    log.success("tweak.apply", tweak.title, `Enabled '${tweak.title}'`);
    // Auto-track into the persistence set so the background loop will re-apply
    // if Windows ever flips it back. Helper is a no-op when persist is off.
    void service.addPersistedTweak(tweak.id);
  } catch (e) {
    log.error("tweak.apply", tweak.title, `Failed to enable '${tweak.title}'`, String(e));
    throw e;
  }
}

export async function revertTweak(tweak: Tweak): Promise<void> {
  try {
    if (tweak.revert) {
      for (const op of tweak.revert) {
        await applyOp(op);
      }
    } else {
      for (const op of tweak.apply) {
        if (op.kind !== "reg") continue;
        const loc: RegLocator = { hive: op.hive, path: op.path, name: op.name };
        try {
          if (op.defaultValue !== undefined) {
            await regWrite({ ...loc, type: op.type, value: op.defaultValue });
          } else {
            await regDeleteValue(loc);
          }
        } catch {
          // best-effort
        }
      }
    }
    log.success("tweak.revert", tweak.title, `Reverted '${tweak.title}'`);
    // Pair with applyTweak: revert means the user no longer wants this on, so
    // drop it from the persistence set unconditionally. Safe if it wasn't in.
    void service.removePersistedTweak(tweak.id);
  } catch (e) {
    log.error("tweak.revert", tweak.title, `Failed to revert '${tweak.title}'`, String(e));
    throw e;
  }
}
