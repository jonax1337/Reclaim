<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { Minus, Square, Copy, X } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { service } from "$lib/service.svelte";

  type Props = {
    title?: string;
    children?: Snippet;
    actions?: Snippet;
  };
  let { title = "Reclaim", children, actions }: Props = $props();

  const win = getCurrentWindow();
  let maximized = $state(false);

  onMount(() => {
    win.isMaximized().then((m) => (maximized = m));
    const un = win.onResized(async () => {
      maximized = await win.isMaximized();
    });
    return () => {
      un.then((u) => u());
    };
  });

  // Tauri 2's `prevent_close` flag is checked by the runtime but on the IPC
  // close path (`getCurrentWindow().close()` from JS) on Windows it has been
  // observed to still tear down the window — which makes the event loop exit
  // and the tray companion die with it. Calling `hide()` directly here is the
  // robust fix: the window stays alive, the runtime stays alive, no
  // prevent_close gymnastics. The Rust-side `on_window_event` handler still
  // covers Alt+F4 / OS-initiated close paths.
  async function handleClose() {
    if (service.config.keepInTray) {
      await win.hide();
    } else {
      await win.close();
    }
  }
</script>

<header
  data-tauri-drag-region
  class="titlebar select-none flex items-center h-9 shrink-0 bg-foreground/[0.025] backdrop-blur-xl border-b border-foreground/8 text-foreground"
>
  <div data-tauri-drag-region class="flex items-center gap-2 pl-3 pr-4">
    <div
      class="grid place-items-center size-5 rounded-[6px] bg-gradient-to-br from-primary via-primary to-primary/60 text-primary-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)]"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-3 drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M14.158 2.13a.5.5 0 0 1 .811.553L13.06 9h6.44a.5.5 0 0 1 .374.832l-10 11.25a.5.5 0 0 1-.84-.482L10.94 14H4.5a.5.5 0 0 1-.375-.832l10.033-11.038Z"
        />
      </svg>
    </div>
  </div>

  <div
    data-tauri-drag-region
    class="flex-1 flex items-center gap-3 text-xs font-medium text-muted-foreground tracking-tight"
  >
    {title}
    {@render children?.()}
  </div>

  {#if actions}
    <div class="flex items-center h-full pr-1" style="-webkit-app-region: no-drag">
      {@render actions()}
    </div>
  {/if}

  <div class="flex items-center h-full">
    <button type="button" class="titlebar-btn" aria-label="Minimize" onclick={() => win.minimize()}>
      <Minus class="size-3.5" />
    </button>
    <button
      type="button"
      class="titlebar-btn"
      aria-label={maximized ? "Restore" : "Maximize"}
      onclick={() => win.toggleMaximize()}
    >
      {#if maximized}
        <Copy class="size-3 -scale-x-100" />
      {:else}
        <Square class="size-3" />
      {/if}
    </button>
    <button
      type="button"
      class="titlebar-btn titlebar-btn-close"
      aria-label="Close"
      onclick={handleClose}
    >
      <X class="size-4" />
    </button>
  </div>
</header>

<style>
  .titlebar {
    -webkit-app-region: drag;
  }
  .titlebar :global(button) {
    -webkit-app-region: no-drag;
  }
  :global(.titlebar-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    color: var(--color-foreground);
    background: transparent;
    transition: background-color 120ms ease;
    cursor: pointer;
  }
  :global(.titlebar-btn:hover) {
    background-color: var(--color-muted);
  }
  :global(.titlebar-btn-close:hover) {
    background-color: oklch(0.6 0.235 27);
    color: white;
  }
</style>
