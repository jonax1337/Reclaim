import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  isTauri,
  maintenancePtyKill,
  maintenancePtyResize,
  maintenanceRunStream,
  type MaintenanceOp,
  type StreamEvent,
} from "./tweaks/bridge";

export type TaskStatus = "running" | "success" | "error" | "cancelled";
export type TaskKind = "maintenance" | "other";

export type Task = {
  id: string;
  label: string;
  kind: TaskKind;
  opId: string;
  status: TaskStatus;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  terminal: Terminal;
  fit: FitAddon;
};

const MAX_COMPLETED = 30;
const PANEL_H_KEY = "reclaim.terminal-h";
const PANEL_H_DEFAULT = 320;
const PANEL_H_MIN = 160;
const PANEL_H_MAX = 1100;

function loadPanelHeight(): number {
  if (typeof localStorage === "undefined") return PANEL_H_DEFAULT;
  const raw = localStorage.getItem(PANEL_H_KEY);
  if (!raw) return PANEL_H_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return PANEL_H_DEFAULT;
  return Math.min(PANEL_H_MAX, Math.max(PANEL_H_MIN, n));
}

// Classic "Windows PowerShell" console palette — the exact colors Windows
// Terminal ships for its PowerShell profile, lifted from
// `defaults.json -> schemes -> "Windows PowerShell"`. Background is the
// iconic navy blue.
const DARK_THEME: ITheme = {
  background: "#012456",
  foreground: "#EEEDF0",
  cursor: "#EEEDF0",
  cursorAccent: "#012456",
  selectionBackground: "#FEFEDF55",
  black: "#000000",
  red: "#800000",
  green: "#008000",
  yellow: "#EEEDF0",
  blue: "#000080",
  magenta: "#012456",
  cyan: "#008080",
  white: "#C0C0C0",
  brightBlack: "#808080",
  brightRed: "#FF0000",
  brightGreen: "#00FF00",
  brightYellow: "#FFFF00",
  brightBlue: "#0000FF",
  brightMagenta: "#FF00FF",
  brightCyan: "#00FFFF",
  brightWhite: "#FFFFFF",
};

// PS-flavoured light variant — the same accent slots but on a paper-white
// background so the embedded shell stays legible when the app is in light
// mode. Errors stay red, warnings yellow, etc.
const LIGHT_THEME: ITheme = {
  background: "#FAFAF8",
  foreground: "#1A1A1A",
  cursor: "#1A1A1A",
  cursorAccent: "#FAFAF8",
  selectionBackground: "#01245633",
  black: "#000000",
  red: "#A0182B",
  green: "#0B6623",
  yellow: "#7A5E00",
  blue: "#0037DA",
  magenta: "#881798",
  cyan: "#0086A0",
  white: "#1A1A1A",
  brightBlack: "#5C5C5C",
  brightRed: "#C50F1F",
  brightGreen: "#13A10E",
  brightYellow: "#C19C00",
  brightBlue: "#3B78FF",
  brightMagenta: "#B4009E",
  brightCyan: "#3A96DD",
  brightWhite: "#000000",
};

function currentTheme(): ITheme {
  if (typeof document === "undefined") return DARK_THEME;
  // The app sets data-theme="light|dark" on <html> via theme.svelte.ts.
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? DARK_THEME
    : LIGHT_THEME;
}

export function themeForMode(mode: "light" | "dark"): ITheme {
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

function makeTerminal(): { terminal: Terminal; fit: FitAddon } {
  const terminal = new Terminal({
    cols: 120,
    rows: 28,
    // Classic PowerShell 5.1 ships Lucida Console; Win10+ defaults moved to
    // Consolas. We use Consolas first to match what users see in conhost.
    fontFamily:
      '"Consolas", "Cascadia Mono", "Lucida Console", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.0,
    fontWeight: "normal",
    cursorBlink: false,
    convertEol: false,
    scrollback: 8000,
    allowProposedApi: true,
    theme: currentTheme(),
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.loadAddon(new WebLinksAddon());
  return { terminal, fit };
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let nextId = 1;

class TaskStore {
  tasks = $state<Task[]>([]);
  activeTabId = $state<string | null>(null);
  panelOpen = $state(false);
  panelHeight = $state(loadPanelHeight());

  setPanelHeight(px: number) {
    const clamped = Math.min(PANEL_H_MAX, Math.max(PANEL_H_MIN, Math.round(px)));
    this.panelHeight = clamped;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(PANEL_H_KEY, String(clamped));
      } catch {}
    }
  }

  private newTaskId(): string {
    return `task-${Date.now()}-${nextId++}`;
  }

  start(opts: { label: string; kind: TaskKind; opId: string }): Task {
    const { terminal, fit } = makeTerminal();
    const t: Task = {
      id: this.newTaskId(),
      label: opts.label,
      kind: opts.kind,
      opId: opts.opId,
      status: "running",
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      terminal,
      fit,
    };
    this.tasks = [...this.tasks, t];
    this.activeTabId = t.id;
    this.panelOpen = true;
    return t;
  }

  finish(id: string, exitCode: number, status: TaskStatus = "success") {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const t = this.tasks[idx];
    if (t.status !== "running") return;
    const finalStatus: TaskStatus =
      status === "cancelled"
        ? "cancelled"
        : exitCode === 0
          ? "success"
          : "error";
    const endedAt = Date.now();
    const elapsedMs = endedAt - t.startedAt;
    const elapsedS = Math.floor(elapsedMs / 1000);
    const elapsed =
      elapsedS < 60
        ? `${elapsedS}s`
        : `${Math.floor(elapsedS / 60)}m ${elapsedS % 60}s`;
    // Write a final summary line straight into the shell scrollback so the
    // user sees the exit state inline, the way PowerShell would print after
    // a command finishes.
    const color =
      finalStatus === "success"
        ? "\x1b[32m"
        : finalStatus === "cancelled"
          ? "\x1b[33m"
          : "\x1b[31m";
    const verb =
      finalStatus === "cancelled" ? "Cancelled" : "Finished";
    try {
      t.terminal.write(
        `\r\n${color}>>> ${verb} — exit ${exitCode} · ran ${elapsed}\x1b[0m\r\n`,
      );
    } catch {}
    this.tasks[idx] = {
      ...t,
      status: finalStatus,
      endedAt,
      exitCode,
    };
    this.trimCompleted();
  }

  remove(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    try {
      t.terminal.dispose();
    } catch {}
    this.tasks = this.tasks.filter((x) => x.id !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.tasks[this.tasks.length - 1]?.id ?? null;
    }
    if (this.tasks.length === 0) this.panelOpen = false;
  }

  async cancel(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.status !== "running") return;
    if (!isTauri()) return;
    try {
      await maintenancePtyKill(id);
    } catch {}
  }

  clearCompleted() {
    const stillRunning: Task[] = [];
    for (const t of this.tasks) {
      if (t.status === "running") {
        stillRunning.push(t);
      } else {
        try {
          t.terminal.dispose();
        } catch {}
      }
    }
    this.tasks = stillRunning;
    if (this.activeTabId && !this.tasks.some((t) => t.id === this.activeTabId)) {
      this.activeTabId = this.tasks[0]?.id ?? null;
    }
    if (this.tasks.length === 0) this.panelOpen = false;
  }

  focus(id: string) {
    this.activeTabId = id;
    this.panelOpen = true;
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
  }

  /** Re-theme every open terminal. Called from a $effect watching theme.resolved
   *  so the embedded shells follow the app's light/dark mode in real time. */
  applyTheme(mode: "light" | "dark") {
    const t = themeForMode(mode);
    for (const task of this.tasks) {
      try {
        task.terminal.options.theme = t;
      } catch {}
    }
  }

  get active(): Task[] {
    return this.tasks.filter((t) => t.status === "running");
  }

  hasRunning(opId: string): boolean {
    return this.tasks.some((t) => t.opId === opId && t.status === "running");
  }

  private trimCompleted() {
    const completed = this.tasks.filter((t) => t.status !== "running");
    if (completed.length <= MAX_COMPLETED) return;
    const overflow = completed.length - MAX_COMPLETED;
    const completedSorted = [...completed].sort(
      (a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0),
    );
    const drop = new Set(completedSorted.slice(0, overflow).map((t) => t.id));
    this.tasks = this.tasks.filter((x) => {
      if (drop.has(x.id)) {
        try {
          x.terminal.dispose();
        } catch {}
        return false;
      }
      return true;
    });
  }
}

export const tasks = new TaskStore();

export async function runMaintenanceTask(
  opId: MaintenanceOp,
  label: string,
): Promise<Task> {
  const task = tasks.start({ label, kind: "maintenance", opId });
  if (!isTauri()) {
    task.terminal.write(
      "\x1b[33mBrowser preview — PowerShell is not available outside Tauri.\x1b[0m\r\n",
    );
    tasks.finish(task.id, -1, "error");
    return task;
  }
  const onEvent = (e: StreamEvent) => {
    if (e.kind === "bytes") {
      task.terminal.write(decodeBase64(e.data));
    } else if (e.kind === "exit") {
      // Final exit is also returned by the invoke promise; nothing to do here.
    } else {
      // Legacy line events (shouldn't appear from maintenance, but be safe).
      task.terminal.writeln(e.data);
    }
  };
  try {
    const { cols, rows } = task.terminal;
    const exit = await maintenanceRunStream(task.id, opId, cols, rows, onEvent);
    tasks.finish(task.id, exit);
  } catch (err) {
    task.terminal.write(
      `\r\n\x1b[31m${String(err)}\x1b[0m\r\n`,
    );
    tasks.finish(task.id, -1, "error");
  }
  return task;
}

export async function resizeTask(
  task: Task,
  cols: number,
  rows: number,
): Promise<void> {
  if (!isTauri()) return;
  if (task.status !== "running") return;
  try {
    await maintenancePtyResize(task.id, cols, rows);
  } catch {}
}
