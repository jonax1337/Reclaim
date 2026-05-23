<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Badge, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ExternalLink,
    FileType2,
    Globe,
    Info,
  } from "@lucide/svelte";
  import {
    isTauri,
    getDefaultApps,
    openDefaultApps,
    type DefaultAppInfo,
    type DefaultAppKind,
  } from "$lib/tweaks/bridge";

  type Entry = {
    kind: DefaultAppKind;
    key: string;
    label: string;
    blurb: string;
  };

  const FILE_TYPES: Entry[] = [
    { kind: "file", key: ".pdf", label: "PDF", blurb: "Documents — Edge defaults are common." },
    { kind: "file", key: ".html", label: "HTML", blurb: "Web pages opened from File Explorer." },
    { kind: "file", key: ".htm", label: "HTM", blurb: "Same as .html." },
    { kind: "file", key: ".jpg", label: "JPG", blurb: "Photos — Edge / Photos / 3rd-party viewer." },
    { kind: "file", key: ".jpeg", label: "JPEG", blurb: "Same as .jpg." },
    { kind: "file", key: ".png", label: "PNG", blurb: "Images." },
    { kind: "file", key: ".gif", label: "GIF", blurb: "Animated images." },
    { kind: "file", key: ".webp", label: "WEBP", blurb: "Modern web images." },
    { kind: "file", key: ".svg", label: "SVG", blurb: "Vector images — often Edge." },
    { kind: "file", key: ".mp4", label: "MP4", blurb: "Video — Movies & TV / 3rd-party player." },
    { kind: "file", key: ".mkv", label: "MKV", blurb: "Video container." },
    { kind: "file", key: ".mp3", label: "MP3", blurb: "Audio." },
    { kind: "file", key: ".flac", label: "FLAC", blurb: "Lossless audio." },
    { kind: "file", key: ".txt", label: "TXT", blurb: "Plain text — Notepad / alternatives." },
    { kind: "file", key: ".zip", label: "ZIP", blurb: "Archives — Explorer or 7-Zip / WinRAR." },
  ];

  const PROTOCOLS: Entry[] = [
    { kind: "protocol", key: "http", label: "http", blurb: "Web browser for plaintext links." },
    { kind: "protocol", key: "https", label: "https", blurb: "Web browser for encrypted links." },
    { kind: "protocol", key: "mailto", label: "mailto", blurb: "Email client for mailto: links." },
    { kind: "protocol", key: "ftp", label: "ftp", blurb: "FTP — usually Explorer or 3rd-party." },
  ];

  let info = $state<Record<string, DefaultAppInfo>>({});
  let loading = $state(false);

  function entryKey(e: Entry): string {
    return `${e.kind}:${e.key}`;
  }

  async function load() {
    if (!isTauri()) return;
    loading = true;
    try {
      const all = [...FILE_TYPES, ...PROTOCOLS];
      const result = await getDefaultApps(all.map((e) => ({ kind: e.kind, key: e.key })));
      const map: Record<string, DefaultAppInfo> = {};
      for (const r of result) {
        map[`${r.kind}:${r.key}`] = r;
      }
      info = map;
    } catch (e) {
      toast.error("Could not read default-app state", String(e));
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function openFor(e: Entry) {
    const target = e.kind === "file" ? `fileType=${e.key}` : `protocol=${e.key}`;
    try {
      await openDefaultApps(target);
    } catch (err) {
      toast.error("Could not open Settings", String(err));
    }
  }

  async function openRoot() {
    try {
      await openDefaultApps("");
    } catch (err) {
      toast.error("Could not open Settings", String(err));
    }
  }

  function appNameFor(e: Entry): string {
    const i = info[entryKey(e)];
    if (!i) return loading ? "" : "—";
    if (i.friendlyName) return i.friendlyName;
    if (i.progId) return i.progId;
    return "Not set";
  }

  function isEdge(e: Entry): boolean {
    const i = info[entryKey(e)];
    return !!(i?.progId && /MSEdge|Edge|MicrosoftEdge/i.test(i.progId));
  }
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Default apps</h1>
    <p class="text-sm text-muted-foreground mt-1">
      See which app currently owns each file type and protocol. Open the Windows Settings deep-link to change it.
    </p>
  </div>
  <div class="flex items-center gap-2">
    <Button variant="outline" onclick={load} disabled={loading}>
      <RefreshCw class={loading ? "animate-spin" : ""} />
      Refresh
    </Button>
    <Button variant="outline" onclick={openRoot}>
      <ExternalLink />
      Open Settings
    </Button>
  </div>
</header>

<div class="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-3 flex items-start gap-2 text-xs">
  <Info class="size-4 text-blue-500 shrink-0 mt-0.5" />
  <span class="text-foreground/80 leading-relaxed">
    Windows protects file-type defaults with a per-user hash check. Reclaim can't flip them silently — clicking
    "Change" opens the Settings page for that specific type, where one click switches the default.
  </span>
</div>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — defaults need the built app.
    </div>
  </Card>
{:else}
  <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    File types
  </h2>
  <Card class="overflow-hidden gap-0 py-0 card-inset mb-6">
    {#each FILE_TYPES as e (entryKey(e))}
      {@const edge = isEdge(e)}
      <div
        class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
      >
        <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
          <FileType2 class="size-3.5 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium font-mono">{e.key}</span>
            <span class="text-sm">{e.label}</span>
            {#if edge}
              <Badge variant="warning">Microsoft Edge</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            {e.blurb}
            {#if !loading && info[entryKey(e)]}
              · <span class="font-mono">{appNameFor(e)}</span>
            {/if}
          </p>
        </div>
        <div class="shrink-0 pt-0.5">
          <Button size="sm" variant="outline" onclick={() => openFor(e)}>
            <ExternalLink />
            Change
          </Button>
        </div>
      </div>
    {/each}
  </Card>

  <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    Protocols
  </h2>
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each PROTOCOLS as e (entryKey(e))}
      {@const edge = isEdge(e)}
      <div
        class="flex items-start gap-3 py-3 px-5 border-b last:border-b-0 hover:bg-accent/30 transition-colors"
      >
        <div class="grid place-items-center size-8 rounded-md bg-accent/60 shrink-0">
          <Globe class="size-3.5 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium font-mono">{e.key}</span>
            {#if edge}
              <Badge variant="warning">Microsoft Edge</Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            {e.blurb}
            {#if !loading && info[entryKey(e)]}
              · <span class="font-mono">{appNameFor(e)}</span>
            {/if}
          </p>
        </div>
        <div class="shrink-0 pt-0.5">
          <Button size="sm" variant="outline" onclick={() => openFor(e)}>
            <ExternalLink />
            Change
          </Button>
        </div>
      </div>
    {/each}
  </Card>
{/if}
