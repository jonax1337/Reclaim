<script lang="ts">
  import { Card, Button, Badge, Dialog, PageHeader, toast } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    KeyRound,
    AlertTriangle,
    ExternalLink,
    Terminal,
    Copy,
    Check,
    ShieldCheck,
    ShieldAlert,
    Info,
  } from "@lucide/svelte";
  import {
    isTauri,
    launchActivationScript,
    type ActivationStatus,
  } from "$lib/tweaks/bridge";
  import { log } from "$lib/log.svelte";
  import { activationStatusResource } from "$lib/route-cache.svelte";
  import { invalidate } from "$lib/cache.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  const PS_COMMAND = "irm https://get.activated.win | iex";
  const PROJECT_URL = "https://massgrave.dev/";

  const statusRes = activationStatusResource();
  const status = $derived<ActivationStatus | null>(statusRes.data ?? null);
  const loading = $derived(statusRes.loading);
  const refreshing = $derived(statusRes.revalidating);

  let confirmOpen = $state(false);
  let launching = $state(false);
  let copied = $state(false);

  async function reload() {
    invalidate("activation.status");
    await statusRes.refresh();
  }

  function askLaunch() {
    confirmOpen = true;
  }

  async function doLaunch() {
    confirmOpen = false;
    if (launching) return;
    launching = true;
    try {
      await launchActivationScript();
      log.info(
        "activation.launch",
        "MAS",
        "Launched external activation script in elevated PowerShell",
      );
      toast.success(
        "PowerShell opened",
        "Follow the menu in the new window — Reclaim does not control it.",
      );
    } catch (e) {
      const msg = String(e);
      if (msg.includes("UAC") || msg.includes("declined")) {
        toast.warning("UAC declined", "The activation script needs administrator rights.");
      } else {
        toast.error("Could not launch PowerShell", msg);
      }
      log.warn("activation.launch", "MAS", "Launch failed", msg);
    } finally {
      launching = false;
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(PS_COMMAND);
      copied = true;
      toast.success("Copied", "PowerShell command copied to clipboard.");
      setTimeout(() => (copied = false), 2000);
    } catch (e) {
      toast.error("Copy failed", String(e));
    }
  }

  async function openExternal(url: string) {
    try {
      if (isTauri()) await openUrl(url);
      else window.open(url, "_blank");
    } catch (e) {
      toast.error("Could not open browser", String(e));
    }
  }

  const isLicensed = $derived(status?.licenseStatus === 1);
  const isUnlicensed = $derived(!!status && status.detected && status.licenseStatus !== 1);

  function shortenEdition(name: string): string {
    // The WMI Name field looks like "Windows(R) Operating System, RETAIL channel".
    // The Description is usually nicer ("Windows(R), Professional edition") — we
    // pick the shortest readable form for the headline.
    return name.replace(/\s+/g, " ").trim();
  }
</script>

<PageHeader
  title="Windows activation"
  description="Current license status, plus a one-click launcher for the open-source MAS activation script. Reclaim does not bundle the script — it runs directly from the upstream URL."
>
  {#snippet actions()}
    <Button variant="outline" onclick={reload} disabled={loading}>
      <RefreshCw class={loading || refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
</PageHeader>

<!-- Disclaimer banner -->
<div
  class="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 mb-6 flex items-start gap-3"
>
  <AlertTriangle
    class="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
  />
  <div class="text-sm text-amber-900 dark:text-amber-200 leading-relaxed space-y-1">
    <p class="font-semibold">Reclaim does not ship, bundle, or modify any activation script.</p>
    <p class="text-amber-900/90 dark:text-amber-200/90">
      The button below opens a new elevated PowerShell window that runs
      <code class="font-mono text-[12px] px-1 py-0.5 rounded bg-amber-500/20">irm https://get.activated.win | iex</code>
      — an open-source project (MAS) maintained at
      <button
        type="button"
        onclick={() => openExternal(PROJECT_URL)}
        class="underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-100"
      >massgrave.dev</button>. You're responsible for using it only on systems you own
      a license for. Microsoft Defender may flag activation tools; that is expected.
    </p>
  </div>
</div>

{#if !isTauri()}
  <Card class="card-inset">
    <div class="px-6 py-16 text-center text-sm text-muted-foreground">
      Browser preview — activation detection needs the built app.
    </div>
  </Card>
{:else if loading}
  <div class="grid place-items-center py-24 text-sm text-muted-foreground">
    <Loader2 class="size-6 animate-spin mb-2" />
    Reading license state…
  </div>
{:else}
  <!-- Status hero card -->
  <section
    class={[
      "relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-xl shadow-sm mb-6",
      isLicensed ? "hero-glow-success" : isUnlicensed ? "hero-glow-warning" : "hero-glow",
    ]}
  >
    <div class="px-7 py-6 flex flex-wrap items-start gap-5">
      <div
        class={[
          "grid place-items-center size-16 rounded-2xl shadow-sm shrink-0 ring-1 ring-foreground/5",
          isLicensed
            ? "bg-success/15 text-success"
            : isUnlicensed
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-foreground/[0.06] text-muted-foreground",
        ]}
      >
        {#if isLicensed}
          <ShieldCheck class="size-8" />
        {:else if isUnlicensed}
          <ShieldAlert class="size-8" />
        {:else}
          <KeyRound class="size-8" />
        {/if}
      </div>
      <div class="flex-1 min-w-[16rem]">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-xl font-semibold">
            {status?.detected
              ? shortenEdition(status.description || status.name) || "License detected"
              : "No license detected"}
          </h2>
          {#if status?.detected}
            {#if isLicensed}
              <Badge variant="success">{status.licenseStatusText}</Badge>
            {:else}
              <Badge variant="outline" class="border-amber-500/40 text-amber-700 dark:text-amber-300">
                {status.licenseStatusText}
              </Badge>
            {/if}
            {#if status.channel}
              <Badge variant="outline">{status.channel}</Badge>
            {/if}
          {/if}
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {#if !status?.detected}
            Windows did not report a license product. This is unusual — try Refresh.
          {:else if isLicensed}
            Windows reports the install as fully licensed. No activation action needed.
          {:else}
            License is present but not in the Licensed state — Windows may show a watermark or
            limit personalization until activated.
          {/if}
        </p>

        {#if status?.detected}
          <dl class="mt-4 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
            {#if status.partialKey}
              <dt class="text-muted-foreground sm:text-xs">Partial key</dt>
              <dd class="font-mono">XXXXX-XXXXX-XXXXX-XXXXX-{status.partialKey}</dd>
            {/if}
            {#if status.gracePeriodMinutes > 0}
              <dt class="text-muted-foreground sm:text-xs">Grace remaining</dt>
              <dd class="font-mono">{Math.round(status.gracePeriodMinutes / 60 / 24)} days</dd>
            {/if}
            <dt class="text-muted-foreground sm:text-xs">Status code</dt>
            <dd class="font-mono">{status.licenseStatus}</dd>
          </dl>
        {/if}
      </div>
    </div>
  </section>

  <!-- Launch card -->
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Activation script
  </h2>
  <Card class="card-inset mb-6 py-0">
    <div class="px-5 py-4 space-y-4">
      <p class="text-xs text-muted-foreground leading-relaxed">
        Microsoft Activation Scripts (MAS) is an open-source project that exposes the standard
        Windows licensing methods: HWID (permanent, Win 10/11), KMS38 (until 2038), Ohook for
        Office, and TSforge. After launch, follow the on-screen menu — Reclaim has no further
        involvement.
      </p>

      <!-- Command preview -->
      <div class="rounded-lg border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
        <div class="px-3 py-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 border-b border-foreground/8">
          <span class="flex items-center gap-1.5">
            <Terminal class="size-3" />
            PowerShell command
          </span>
          <button
            type="button"
            onclick={copyCommand}
            class="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            {#if copied}
              <Check class="size-3 text-success" />
              Copied
            {:else}
              <Copy class="size-3" />
              Copy
            {/if}
          </button>
        </div>
        <pre class="px-3 py-2.5 font-mono text-[12px] text-foreground/90 overflow-x-auto">{PS_COMMAND}</pre>
      </div>

      <div class="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3 flex items-start gap-2">
        <Info class="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <p class="text-xs text-muted-foreground leading-relaxed">
          The button below triggers UAC, then opens a new elevated PowerShell window that runs
          the command above. You'll see the MAS menu in that window — press a number to choose
          a method. Close the PowerShell window when you're done.
        </p>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onclick={() => openExternal(PROJECT_URL)}>
          <ExternalLink />
          Documentation
        </Button>
        <Button onclick={askLaunch} disabled={launching}>
          {#if launching}
            <Loader2 class="animate-spin" />
            Launching…
          {:else}
            <Terminal />
            Launch in PowerShell
          {/if}
        </Button>
      </div>
    </div>
  </Card>

  <!-- Methods reference -->
  <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
    Methods at a glance
  </h2>
  <Card class="card-inset overflow-hidden gap-0 py-0">
    <div class="divide-y divide-foreground/8">
      <div class="px-5 py-3 flex items-start gap-3">
        <Badge variant="default" class="shrink-0 mt-0.5">HWID</Badge>
        <div class="text-xs text-muted-foreground leading-relaxed flex-1">
          <span class="font-medium text-foreground">Windows 10 / 11 — permanent.</span>
          Ties activation to the machine's hardware ID via Microsoft's servers. Survives reinstalls
          on the same hardware. Needs internet.
        </div>
      </div>
      <div class="px-5 py-3 flex items-start gap-3">
        <Badge variant="default" class="shrink-0 mt-0.5">KMS38</Badge>
        <div class="text-xs text-muted-foreground leading-relaxed flex-1">
          <span class="font-medium text-foreground">Windows / Server — until 2038.</span>
          Local KMS variant that grants a license valid through January 2038. No internet
          required after activation.
        </div>
      </div>
      <div class="px-5 py-3 flex items-start gap-3">
        <Badge variant="default" class="shrink-0 mt-0.5">Ohook</Badge>
        <div class="text-xs text-muted-foreground leading-relaxed flex-1">
          <span class="font-medium text-foreground">Office — permanent.</span>
          Hooks a single Office DLL to skip the license check. Works offline.
        </div>
      </div>
      <div class="px-5 py-3 flex items-start gap-3">
        <Badge variant="default" class="shrink-0 mt-0.5">TSforge</Badge>
        <div class="text-xs text-muted-foreground leading-relaxed flex-1">
          <span class="font-medium text-foreground">Windows / Office — permanent.</span>
          Newest method (build 19041+). Activates ESU, Server, and most Office SKUs.
        </div>
      </div>
      <div class="px-5 py-3 flex items-start gap-3">
        <Badge variant="outline" class="shrink-0 mt-0.5">Online KMS</Badge>
        <div class="text-xs text-muted-foreground leading-relaxed flex-1">
          <span class="font-medium text-foreground">Windows / Office — 180 days, renewable.</span>
          Uses public KMS servers. Renews automatically while the network reaches them.
        </div>
      </div>
    </div>
  </Card>
{/if}

<Dialog
  bind:open={confirmOpen}
  title="Launch external activation script?"
  description="A new PowerShell window will open after the UAC prompt. It will download and run an external script from get.activated.win. Reclaim does not control what runs in that window."
>
  <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
    <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <p class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
      Only proceed on systems you own a Windows / Office license for. Microsoft Defender may
      quarantine the script — that is expected behavior for activation tools.
    </p>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
    <Button onclick={doLaunch}>
      <Terminal />
      Launch PowerShell
    </Button>
  {/snippet}
</Dialog>
