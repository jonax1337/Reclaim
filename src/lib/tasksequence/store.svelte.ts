/**
 * Reactive store for the active TaskSequence. Persists the current sequence
 * to localStorage so a refresh during edit doesn't lose work.
 */

import type { TaskSequence, TaskStep, StepType } from "./types";
import { makeStep, MULTI_STEP_TYPES, STEP_ORDER } from "./types";
import { cloneTemplate, TEMPLATE_MAP } from "./templates";

const STORAGE_KEY = "reclaim.task-sequence";
const DEFAULT_TEMPLATE = "privacy-max";

function loadInitial(): TaskSequence {
  if (typeof localStorage === "undefined") return cloneTemplate(DEFAULT_TEMPLATE);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneTemplate(DEFAULT_TEMPLATE);
    const parsed = JSON.parse(raw) as TaskSequence;
    if (!parsed || !Array.isArray(parsed.steps)) {
      return cloneTemplate(DEFAULT_TEMPLATE);
    }
    return parsed;
  } catch {
    return cloneTemplate(DEFAULT_TEMPLATE);
  }
}

class SequenceStore {
  current = $state<TaskSequence>(loadInitial());

  constructor() {
    // Auto-persist on any mutation. $effect.root so it survives outside a
    // component context.
    if (typeof localStorage !== "undefined") {
      $effect.root(() => {
        $effect(() => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
          } catch {}
        });
      });
    }
  }

  loadTemplate(id: string) {
    this.current = cloneTemplate(id);
  }

  reset() {
    this.current = cloneTemplate(DEFAULT_TEMPLATE);
  }

  // ── Step CRUD ────────────────────────────────────────────────────────────

  /**
   * True if a step of `type` can still be added. Singletons (everything except
   * `custom-cmd`) are blocked once one already exists; multi-types are always
   * addable.
   */
  canAddType(type: StepType): boolean {
    if (MULTI_STEP_TYPES.has(type)) return true;
    return !this.current.steps.some((s) => s.type === type);
  }

  addStep(type: StepType) {
    if (!this.canAddType(type)) return;
    const step = makeStep(type);
    const order = STEP_ORDER[type];
    const next = [...this.current.steps];
    let insertAt = next.length;
    for (let i = 0; i < next.length; i++) {
      if (STEP_ORDER[next[i].type] > order) {
        insertAt = i;
        break;
      }
    }
    next.splice(insertAt, 0, step);
    this.current.steps = next;
  }

  removeStep(id: string) {
    this.current.steps = this.current.steps.filter((s) => s.id !== id);
  }

  toggleStep(id: string, enabled?: boolean) {
    this.current.steps = this.current.steps.map((s) =>
      s.id === id ? ({ ...s, enabled: enabled ?? !s.enabled } as TaskStep) : s,
    );
  }

  updateStep(id: string, patch: Partial<TaskStep>) {
    this.current.steps = this.current.steps.map((s) =>
      s.id === id ? ({ ...s, ...patch } as TaskStep) : s,
    );
  }

  updateStepConfig<T extends TaskStep["config"]>(id: string, configPatch: Partial<T>) {
    this.current.steps = this.current.steps.map((s) => {
      if (s.id !== id) return s;
      return { ...s, config: { ...s.config, ...configPatch } } as TaskStep;
    });
  }

  reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...this.current.steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    this.current.steps = next;
  }

  setName(name: string) {
    this.current.name = name;
  }

  /** Look up the source template by templateId. Returns null for ad-hoc sequences. */
  get sourceTemplate() {
    return this.current.templateId ? TEMPLATE_MAP[this.current.templateId] : null;
  }
}

export const sequence = new SequenceStore();
