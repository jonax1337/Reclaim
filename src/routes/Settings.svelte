<script lang="ts">
  import { onMount } from "svelte";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, PageHeader, toast } from "$lib/ui";
  import { Sun, Moon, Monitor, History, RotateCcw, Info, ArrowDownToLine, Loader2, FolderOpen } from "@lucide/svelte";
  import BackgroundServiceCard from "$lib/components/BackgroundServiceCard.svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import {
    isTauri,
    getSystemInfo,
    isElevated,
    createRestorePoint,
    restartExplorer,
    isPortable,
    appDataDir,
    type SystemInfo,
  } from "$lib/tweaks/bridge";
  import { log } from "$lib/log.svelte";
  import { version as appVersion } from "../../package.json";
  import { check as checkUpdate } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";

  let info = $state<SystemInfo | null>(null);
  let elevated = $state(false);
  let busy = $state(false);
  let portable = $state(false);
  let dataDir = $state("");
  let checkingUpdate = $state(false);

  onMount(async () => {
    if (!isTauri()) return;
    try {
      info = await getSystemInfo();
      elevated = await isElevated();
      portable = await isPortable();
      dataDir = await appDataDir();
    } catch {}
  });

  async function checkForUpdates() {
    if (checkingUpdate) return;
    if (portable) {
      toast.warning(
        "Auto-update disabled in portable mode",
        "Opening the releases page so you can grab a fresh ZIP.",
      );
      try {
        await openUrl("https://github.com/jonax1337/reclaim/releases");
      } catch {}
      return;
    }
    checkingUpdate = true;
    try {
      const update = await checkUpdate();
      if (!update) {
        toast.success("You're up to date", `Running v${appVersion}.`);
        return;
      }
      const proceed = await ask(
        `A new version is available.\n\nCurrent: v${appVersion}\nNew: v${update.version}\n\nDownload and install now? Reclaim will restart automatically.`,
        { title: "Update available", okLabel: "Install", cancelLabel: "Later", kind: "info" },
      );
      if (!proceed) {
        toast.show("Update postponed", { description: `v${update.version} is available — install anytime from Settings.` });
        return;
      }
      toast.show("Downloading update", { description: `v${update.version} — this may take a moment.`, duration: 0 });
      await update.downloadAndInstall();
      log.success("app.update", `v${update.version}`, "Update installed, relaunching");
      await relaunch();
    } catch (e) {
      log.error("app.update", "Updater", "Update check / install failed", String(e));
      toast.warning(
        "Updater unavailable",
        "Opening the releases page so you can grab the new build manually.",
      );
      try {
        await openUrl("https://github.com/jonax1337/reclaim/releases");
      } catch {
        toast.error("Update check failed", String(e));
      }
    } finally {
      checkingUpdate = false;
    }
  }

  async function openDataDir() {
    if (!dataDir) return;
    try {
      await openUrl(dataDir);
    } catch (e) {
      toast.error("Could not open folder", String(e));
    }
  }

  const themes: Array<{ mode: ThemeMode; label: string; icon: typeof Sun }> = [
    { mode: "system", label: "System", icon: Monitor },
    { mode: "light", label: "Light", icon: Sun },
    { mode: "dark", label: "Dark", icon: Moon },
  ];

  async function snapshot() {
    busy = true;
    const r = await createRestorePoint("Reclaim — manual snapshot");
    busy = false;
    if (r.success) {
      log.success("system.restore_point", "Manual snapshot", "Restore point created");
      toast.success("Restore point created");
    } else {
      log.error("system.restore_point", "Manual snapshot", "Failed to create restore point", r.stderr);
      toast.error("Failed", r.stderr || "Admin rights required");
    }
  }

  async function explorerRestart() {
    busy = true;
    await restartExplorer();
    busy = false;
    log.info("system.explorer_restart", "Explorer", "Restarted explorer.exe");
    toast.success("Explorer restarted");
  }
</script>

<PageHeader title="Settings" description="Appearance, system actions and info." />

<div class="flex flex-col gap-6">
  <Card>
    <CardHeader>
      <CardTitle>Appearance</CardTitle>
      <CardDescription>Pick a theme. 'System' follows your Windows setting.</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="flex gap-2">
        {#each themes as t (t.mode)}
          <button
            type="button"
            onclick={() => theme.set(t.mode)}
            class={
              "flex-1 flex flex-col items-center gap-2 py-4 rounded-lg border transition-all " +
              (theme.mode === t.mode
                ? "border-primary bg-primary/5"
                : "border-input hover:bg-accent/40")
            }
          >
            <t.icon class="size-5 {theme.mode === t.mode ? 'text-primary' : 'text-muted-foreground'}" />
            <span class="text-sm font-medium">{t.label}</span>
          </button>
        {/each}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>System</CardTitle>
      <CardDescription>Maintenance and rollback helpers.</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" onclick={snapshot} disabled={busy}>
          <History />
          Create restore point
        </Button>
        <Button variant="outline" onclick={explorerRestart} disabled={busy}>
          <RotateCcw />
          Restart Explorer
        </Button>
      </div>
      <p class="text-xs text-muted-foreground mt-3">
        Restore points need administrator rights and System Protection enabled.
      </p>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Updates</CardTitle>
      <CardDescription>Check for new Reclaim releases.</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" onclick={checkForUpdates} disabled={checkingUpdate}>
          {#if checkingUpdate}
            <Loader2 class="animate-spin" />
            Checking…
          {:else}
            <ArrowDownToLine />
            Check for updates
          {/if}
        </Button>
      </div>
      <p class="text-xs text-muted-foreground mt-3">
        Auto-updater uses the Tauri Updater plugin. If signed releases aren't published yet,
        the button takes you to the GitHub releases page instead.
      </p>
    </CardContent>
  </Card>

  <BackgroundServiceCard />

  <Card>
    <CardHeader>
      <CardTitle>About</CardTitle>
      <CardDescription>System and app information.</CardDescription>
    </CardHeader>
    <CardContent>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Reclaim</dt>
        <dd class="font-mono">v{appVersion}</dd>
        {#if info}
          <dt class="text-muted-foreground">Windows</dt>
          <dd>{info.productName}</dd>
          <dt class="text-muted-foreground">Version</dt>
          <dd>{info.displayVersion} (Build {info.build})</dd>
          <dt class="text-muted-foreground">Edition</dt>
          <dd>{info.edition || "—"}</dd>
          <dt class="text-muted-foreground">User</dt>
          <dd>{info.username}</dd>
          <dt class="text-muted-foreground">Mode</dt>
          <dd>
            {#if elevated}
              <span class="text-success font-medium">Administrator</span>
            {:else}
              <span class="text-amber-600 dark:text-amber-400 font-medium">Standard user</span>
            {/if}
          </dd>
          <dt class="text-muted-foreground">Install</dt>
          <dd>
            {#if portable}
              <span class="font-medium">Portable</span>
              <span class="text-muted-foreground"> · stateless on disk, settings live in the browser store</span>
            {:else}
              <span class="font-medium">Installed</span>
              <span class="text-muted-foreground"> · download the portable build for a single-exe variant</span>
            {/if}
          </dd>
          {#if dataDir}
            <dt class="text-muted-foreground">Data folder</dt>
            <dd>
              <button
                type="button"
                onclick={openDataDir}
                class="font-mono text-xs hover:text-primary inline-flex items-center gap-1"
                title="Open in Explorer"
              >
                <FolderOpen class="size-3" />
                {dataDir}
              </button>
            </dd>
          {/if}
        {/if}
      </dl>
      <div class="mt-4 pt-4 border-t flex items-start gap-2 text-xs text-muted-foreground">
        <Info class="size-4 shrink-0 mt-0.5" />
        <p>
          Reclaim Your Windows is an open debloating tool inspired by Win11Debloat. Every tweak is
          documented and reversible.
        </p>
      </div>
    </CardContent>
  </Card>
</div>
