<script lang="ts">
  import type { Snippet } from "svelte";
  import { Switch, Badge, ListCard } from "$lib/ui";
  import { GripVertical, ChevronDown, ChevronRight, Trash2 } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = {
    title: string;
    description?: string;
    iconName?: string; // unused placeholder for future
    enabled: boolean;
    onEnabledChange: (v: boolean) => void;
    onDelete?: () => void;
    dragging?: boolean;
    children?: Snippet;
    /** Drag handle props from parent's drag-drop logic. */
    onDragStart?: (e: DragEvent) => void;
    onDragOver?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
    onDragEnd?: () => void;
  };

  let {
    title,
    description,
    enabled,
    onEnabledChange,
    onDelete,
    dragging = false,
    children,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }: Props = $props();

  let expanded = $state(true);
</script>

<div
  role="listitem"
  draggable={!!onDragStart}
  ondragstart={onDragStart}
  ondragover={(e) => {
    e.preventDefault();
    onDragOver?.(e);
  }}
  ondrop={(e) => {
    e.preventDefault();
    onDrop?.(e);
  }}
  ondragend={onDragEnd}
  class={cn(
    "transition-opacity",
    dragging && "opacity-40",
  )}
>
  <ListCard class={cn(!enabled && "opacity-60")}>
    <div class="flex items-center gap-3 px-5 py-3">
      {#if onDragStart}
        <button
          type="button"
          aria-label="Drag to reorder"
          class="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing -ml-1 p-1"
        >
          <GripVertical class="size-4" />
        </button>
      {/if}
      <button
        type="button"
        onclick={() => (expanded = !expanded)}
        class="text-muted-foreground/60 hover:text-foreground -m-1 p-1"
        aria-label={expanded ? "Collapse" : "Expand"}
      >
        {#if expanded}
          <ChevronDown class="size-4" />
        {:else}
          <ChevronRight class="size-4" />
        {/if}
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-medium truncate">{title}</span>
          {#if !enabled}
            <Badge variant="outline" class="text-[10px] px-1.5 py-0">Skipped</Badge>
          {/if}
        </div>
        {#if description}
          <div class="text-xs text-muted-foreground truncate">{description}</div>
        {/if}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => onEnabledChange(v)}
      />
      {#if onDelete}
        <button
          type="button"
          onclick={onDelete}
          aria-label="Remove step"
          class="text-muted-foreground/50 hover:text-destructive p-1 -mr-1"
        >
          <Trash2 class="size-4" />
        </button>
      {/if}
    </div>
    {#if expanded && enabled && children}
      <div class="px-5 pb-5 pt-4 border-t border-hairline">
        {@render children()}
      </div>
    {/if}
  </ListCard>
</div>
