<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { X, FileCode2, Save, Copy, Check } from "@lucide/svelte";
  import { Button } from "$lib/ui";
  import { highlightXml } from "$lib/unattend/xmlHighlight";
  import { toast } from "$lib/ui";

  type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    title: string;
    subtitle?: string;
    filename?: string;
    xml: string;
    onSave?: () => void | Promise<void>;
    saving?: boolean;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    subtitle,
    filename = "autounattend.xml",
    xml,
    onSave,
    saving = false,
  }: Props = $props();

  const highlighted = $derived(highlightXml(xml));
  const lineCount = $derived(xml ? xml.split(/\r?\n/).length : 0);

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(xml);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch (e) {
      toast.error("Copy failed", String(e));
    }
  }
</script>

<DialogPrimitive.Root bind:open onOpenChange={(v) => onOpenChange?.(v)}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogPrimitive.Content
      class="fixed left-1/2 top-1/2 z-50 flex w-[min(1280px,calc(100vw-2rem))] max-h-[min(900px,calc(100vh-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border bg-card shadow-lg rounded-xl overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <header class="relative px-6 pt-5 pb-4 border-b border-foreground/10">
        <div class="pr-10">
          <DialogPrimitive.Title class="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
            <FileCode2 class="size-5 text-primary" />
            {title}
          </DialogPrimitive.Title>
          {#if subtitle}
            <DialogPrimitive.Description class="mt-2 text-sm text-muted-foreground leading-relaxed">
              {subtitle}
            </DialogPrimitive.Description>
          {/if}
        </div>
        <DialogPrimitive.Close
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X class="size-4" />
          <span class="sr-only">Close</span>
        </DialogPrimitive.Close>
      </header>

      <div class="flex items-center gap-3 px-6 py-2 border-b border-foreground/10 bg-foreground/[0.025] text-[11px]">
        <code class="px-1.5 py-0.5 rounded bg-foreground/10 font-mono text-foreground/90">{filename}</code>
        <span class="text-muted-foreground">{lineCount.toLocaleString()} lines · {xml.length.toLocaleString()} chars</span>
        <div class="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onclick={copyToClipboard}>
            {#if copied}
              <Check class="size-3.5 text-success" />
              Copied
            {:else}
              <Copy class="size-3.5" />
              Copy
            {/if}
          </Button>
        </div>
      </div>

      <div class="flex-1 overflow-auto bg-background/40">
        <pre
          class="xml-pre m-0 px-5 py-4 font-mono text-[12.5px] leading-[1.65]"
          style="white-space: pre; tab-size: 2;"
        >{@html highlighted}</pre>
      </div>

      <footer class="flex items-center justify-end gap-2 px-6 py-4 border-t border-foreground/10 bg-foreground/[0.025]">
        <Button variant="outline" onclick={() => (open = false)} disabled={saving}>
          Close
        </Button>
        {#if onSave}
          <Button onclick={() => onSave?.()} disabled={saving}>
            <Save class="size-4" />
            Save to disk
          </Button>
        {/if}
      </footer>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  /* Browser-native XML viewer palette. Light and dark variants follow
     Chrome/Firefox view-source tones. */
  :global(.xml-pre) {
    color: rgb(15 23 42); /* slate-900 base */
  }
  :global([data-theme="dark"]) :global(.xml-pre) {
    color: rgb(226 232 240); /* slate-200 base */
  }

  :global(.xml-tag) {
    color: rgb(126 34 206); /* violet-700 */
    font-weight: 500;
  }
  :global(.xml-bracket) {
    color: rgb(100 116 139); /* slate-500 */
  }
  :global(.xml-attr) {
    color: rgb(190 18 60); /* rose-700 */
  }
  :global(.xml-eq) {
    color: rgb(100 116 139);
  }
  :global(.xml-value) {
    color: rgb(2 132 199); /* sky-600 */
  }
  :global(.xml-comment) {
    color: rgb(22 101 52); /* green-800 */
    font-style: italic;
    opacity: 0.85;
  }
  :global(.xml-pi),
  :global(.xml-doctype) {
    color: rgb(162 28 175); /* fuchsia-700 */
    font-weight: 500;
  }
  :global(.xml-cdata) {
    color: rgb(120 53 15); /* amber-900 */
  }

  /* Dark theme overrides — brighter saturations on a dark background. */
  :global([data-theme="dark"]) :global(.xml-tag) {
    color: rgb(196 181 253); /* violet-300 */
  }
  :global([data-theme="dark"]) :global(.xml-bracket) {
    color: rgb(148 163 184); /* slate-400 */
  }
  :global([data-theme="dark"]) :global(.xml-attr) {
    color: rgb(253 164 175); /* rose-300 */
  }
  :global([data-theme="dark"]) :global(.xml-eq) {
    color: rgb(148 163 184);
  }
  :global([data-theme="dark"]) :global(.xml-value) {
    color: rgb(125 211 252); /* sky-300 */
  }
  :global([data-theme="dark"]) :global(.xml-comment) {
    color: rgb(134 239 172); /* green-300 */
  }
  :global([data-theme="dark"]) :global(.xml-pi),
  :global([data-theme="dark"]) :global(.xml-doctype) {
    color: rgb(240 171 252); /* fuchsia-300 */
  }
  :global([data-theme="dark"]) :global(.xml-cdata) {
    color: rgb(252 211 77); /* amber-300 */
  }
</style>
