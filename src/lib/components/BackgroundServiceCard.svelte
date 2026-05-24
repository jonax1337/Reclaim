<script lang="ts">
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Switch,
    Select,
    Badge,
    toast,
  } from "$lib/ui";
  import {
    Play,
    PlayCircle,
    Loader2,
    AlertTriangle,
    Lock,
    ListChecks,
    ChevronDown,
    ChevronRight,
    Trash2,
    HelpCircle,
    Sparkles,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import {
    enable as autostartEnable,
    disable as autostartDisable,
    isEnabled as autostartIsEnabled,
  } from "@tauri-apps/plugin-autostart";
  import {
    service,
    type NotificationChannel,
    type PersistenceMode,
  } from "$lib/service.svelte";
  import { runPersistenceCheck, isDriftCheckable } from "$lib/persistence/checker";
  import {
    maybeCheckDriverUpdates,
    maybeCheckWindowsUpdates,
  } from "$lib/persistence/updateChecker";
  import {
    isTauri,
    isPortable,
    persistenceInstallTask,
    persistenceRunTaskNow,
    persistenceTaskStatus,
    persistenceUninstallTask,
    type PersistenceTaskStatus,
  } from "$lib/tweaks/bridge";
  import { ALL_TWEAKS, type Tweak } from "$lib/tweaks/catalog";
  import { getTweakState, tweakRequiresAdmin } from "$lib/tweaks/executor";
  import { admin } from "$lib/admin.svelte";
  import { cn } from "$lib/utils";

  let autostartOn = $state(false);
  let autostartBusy = $state(false);
  let portable = $state(false);
  let portableChecked = $state(false);
  let manualCheckBusy = $state(false);
  let snapshotBusy = $state(false);
  let systemTaskStatus = $state<PersistenceTaskStatus>({ installed: false, tweakCount: 0 });
  let systemTaskBusy = $state(false);
  let trackedExpanded = $state(false);

  const tweakById = new Map<string, Tweak>(ALL_TWEAKS.map((t) => [t.id, t] as const));

  // Display labels per Tweak.category. Same source-of-truth as the sidebar
  // group titles in Layout.svelte / TweakPreviewDialog; consolidating to a
  // shared helper is a separate cleanup.
  const CATEGORY_LABEL: Record<string, string> = {
    privacy: "Privacy",
    ai: "AI & Copilot",
    search: "Search",
    explorer: "Explorer",
    taskbar: "Taskbar & Start",
    notifications: "Notifications",
    performance: "Performance",
    updates: "Windows Update",
    browser: "Browser",
    security: "Security",
  };
  // Stable category order, matches the sidebar grouping in Layout.svelte.
  const CATEGORY_ORDER = [
    "privacy",
    "ai",
    "search",
    "explorer",
    "taskbar",
    "notifications",
    "performance",
    "updates",
    "browser",
    "security",
  ] as const;

  const trackedTweaks = $derived(
    service.config.persist.tweakIds
      .map((id) => tweakById.get(id))
      .filter((t): t is Tweak => !!t),
  );
  const trackedAdmin = $derived(trackedTweaks.filter((t) => tweakRequiresAdmin(t)));
  const trackedHkcu = $derived(trackedTweaks.filter((t) => !tweakRequiresAdmin(t)));
  const trackedUncheckable = $derived(trackedTweaks.filter((t) => !isDriftCheckable(t)));
  const adminTweakIds = $derived(trackedAdmin.map((t) => t.id));
  const persist = $derived(service.config.persist);

  // Tracked tweaks grouped + sorted by sidebar category order. Categories with
  // no tracked entries are filtered out so the grouped list collapses cleanly.
  const trackedByCategory = $derived(
    CATEGORY_ORDER.map((cat) => ({
      cat,
      label: CATEGORY_LABEL[cat] ?? cat,
      tweaks: trackedTweaks
        .filter((t) => t.category === cat)
        .sort((a, b) => a.title.localeCompare(b.title)),
    })).filter((g) => g.tweaks.length > 0),
  );

  onMount(async () => {
    if (!isTauri()) return;
    portable = await isPortable();
    portableChecked = true;
    if (!portable) {
      try {
        autostartOn = await autostartIsEnabled();
      } catch {}
    }
    await refreshTaskStatus();
  });

  const INTERVAL_OPTIONS = [
    { value: 1, label: "Every hour" },
    { value: 6, label: "Every 6 hours" },
    { value: 12, label: "Every 12 hours" },
    { value: 24, label: "Every 24 hours" },
  ];

  function formatRelative(ts: number): string {
    if (!ts) return "never";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function formatTaskTimestamp(iso: string | null | undefined): string {
    if (!iso) return "never";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "never";
    return formatRelative(t);
  }

  async function refreshTaskStatus() {
    if (!isTauri()) return;
    try {
      systemTaskStatus = await persistenceTaskStatus();
    } catch {
      systemTaskStatus = { installed: false, tweakCount: 0 };
    }
  }

  async function toggleAutostart(enabled: boolean) {
    if (portable) {
      toast.warning(
        "Autostart unavailable in portable mode",
        "Stateless on disk by design — use the installed build to autostart with Windows.",
      );
      return;
    }
    autostartBusy = true;
    try {
      if (enabled) await autostartEnable();
      else await autostartDisable();
      autostartOn = await autostartIsEnabled();
    } catch (e) {
      toast.error("Autostart toggle failed", String(e));
    } finally {
      autostartBusy = false;
    }
  }

  async function setIntervalHours(hours: number) {
    await service.setIntervalHours(hours);
    if (admin.elevated && systemTaskStatus.installed && adminTweakIds.length > 0) {
      try {
        await persistenceInstallTask(adminTweakIds, hours);
        await refreshTaskStatus();
      } catch {}
    }
  }

  async function setPersistEnabled(on: boolean) {
    await service.setPersistEnabled(on);
    if (on) {
      await snapshotCurrent();
    } else {
      if (admin.elevated && systemTaskStatus.installed) {
        try {
          await persistenceUninstallTask();
          await refreshTaskStatus();
        } catch {}
      }
      await service.setPersistSystemTaskEnabled(false);
    }
  }

  async function setMode(mode: PersistenceMode) {
    await service.setPersistMode(mode);
  }

  async function snapshotCurrent() {
    if (!isTauri()) return;
    snapshotBusy = true;
    try {
      const ids: string[] = [];
      let unknown = 0;
      for (const t of ALL_TWEAKS) {
        let state: "on" | "off" | "unknown";
        try {
          state = await getTweakState(t);
        } catch {
          continue;
        }
        if (state === "on") ids.push(t.id);
        else if (state === "unknown") unknown++;
      }
      await service.setPersistedTweakIds(ids);
      const undetectedHint =
        unknown > 0
          ? ` (${unknown} shell-only tweak${unknown === 1 ? "" : "s"} can't be auto-detected — toggle them in their categories to add.)`
          : "";
      toast.success(
        `Snapshot taken — ${ids.length} tweak${ids.length === 1 ? "" : "s"} tracked`,
        `Anything you apply from now on is added automatically; anything you revert is removed.${undetectedHint}`,
      );
      if (
        admin.elevated &&
        service.config.persist.systemTaskEnabled &&
        ids.some((id) => {
          const t = tweakById.get(id);
          return t && tweakRequiresAdmin(t);
        })
      ) {
        await syncSystemTask();
      }
    } finally {
      snapshotBusy = false;
    }
  }

  async function syncSystemTask() {
    if (!admin.elevated) return;
    systemTaskBusy = true;
    try {
      if (adminTweakIds.length === 0) {
        await persistenceUninstallTask();
      } else {
        await persistenceInstallTask(adminTweakIds, service.config.intervalHours);
      }
      await refreshTaskStatus();
    } catch (e) {
      toast.error("Scheduled task sync failed", String(e));
    } finally {
      systemTaskBusy = false;
    }
  }

  async function toggleSystemTask(on: boolean) {
    if (!admin.elevated) {
      toast.warning(
        "Administrator required",
        "Installing the SYSTEM scheduled task needs elevation. Click the shield in the title bar to re-launch as admin.",
      );
      return;
    }
    await service.setPersistSystemTaskEnabled(on);
    systemTaskBusy = true;
    try {
      if (on) {
        if (adminTweakIds.length === 0) {
          toast.show("No admin tweaks tracked yet", {
            description:
              "Apply at least one HKLM / shell-based tweak — the task will be installed automatically.",
          });
        } else {
          await persistenceInstallTask(adminTweakIds, service.config.intervalHours);
          toast.success(
            "Admin persistence on",
            `SYSTEM task installed with ${adminTweakIds.length} admin tweak${adminTweakIds.length === 1 ? "" : "s"}.`,
          );
        }
      } else {
        await persistenceUninstallTask();
        toast.show("Admin persistence off", {
          description: "Scheduled task removed. HKCU drift re-apply continues via the tray companion.",
        });
      }
      await refreshTaskStatus();
    } catch (e) {
      toast.error("Scheduled task change failed", String(e));
    } finally {
      systemTaskBusy = false;
    }
  }

  let lastSyncedIds = $state<string>("");
  $effect(() => {
    const persistSnapshot = service.config.persist;
    if (!isTauri()) return;
    if (!persistSnapshot.enabled || !persistSnapshot.systemTaskEnabled) return;
    if (!admin.elevated) return;
    const key = adminTweakIds.slice().sort().join(",");
    if (key === lastSyncedIds) return;
    if (lastSyncedIds === "" && !systemTaskStatus.installed) {
      lastSyncedIds = key;
      return;
    }
    lastSyncedIds = key;
    void syncSystemTask();
  });

  async function runManualCheck() {
    manualCheckBusy = true;
    try {
      await runPersistenceCheck();
      await maybeCheckWindowsUpdates(true);
      await maybeCheckDriverUpdates(true);
      toast.success("Background check complete");
    } catch (e) {
      toast.error("Check failed", String(e));
    } finally {
      manualCheckBusy = false;
    }
  }

  async function runSystemTaskNow() {
    if (!admin.elevated) {
      toast.warning("Administrator required", "Running the SYSTEM task on demand needs elevation.");
      return;
    }
    systemTaskBusy = true;
    try {
      await persistenceRunTaskNow();
      toast.success("Admin task triggered", "Check the Last-run timestamp in a few seconds.");
      setTimeout(() => void refreshTaskStatus(), 3000);
    } catch (e) {
      toast.error("Run failed", String(e));
    } finally {
      systemTaskBusy = false;
    }
  }

  async function clearTracked() {
    await service.setPersistedTweakIds([]);
    if (admin.elevated && systemTaskStatus.installed) {
      try {
        await persistenceUninstallTask();
        await refreshTaskStatus();
      } catch {}
    }
    toast.show("Tracked tweaks cleared", { description: "Persistence set is empty." });
  }

  async function toggleChannel(channel: NotificationChannel, enabled: boolean) {
    await service.setNotificationPref(channel, enabled);
  }

  async function toggleKeepInTray(on: boolean) {
    await service.setKeepInTray(on);
  }
</script>

<!-- Card 1: Tray companion. Plain title to match Settings.svelte siblings. -->
<Card>
  <CardHeader>
    <CardTitle>Tray companion</CardTitle>
    <CardDescription>
      Hide-to-tray on close, optional autostart with Windows, and how often the background loop checks for drift, Windows updates and drivers.
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <button
        type="button"
        class={cn(
          "flex items-start gap-3 p-4 rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-60",
          autostartOn ? "border-primary/40 bg-primary/5" : "border-input hover:bg-accent/40",
        )}
        onclick={() => toggleAutostart(!autostartOn)}
        disabled={autostartBusy || (portableChecked && portable)}
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Start with Windows</span>
            <Switch
              checked={autostartOn}
              disabled={autostartBusy || portable}
              onCheckedChange={(v: boolean) => toggleAutostart(v)}
              onclick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {#if portableChecked && portable}
              Portable mode is stateless on disk — autostart needs an installed build.
            {:else}
              Boots directly to tray at login. No window flash, no UAC prompt.
            {/if}
          </p>
        </div>
      </button>

      <button
        type="button"
        class={cn(
          "flex items-start gap-3 p-4 rounded-lg border text-left transition",
          service.config.keepInTray ? "border-primary/40 bg-primary/5" : "border-input hover:bg-accent/40",
        )}
        onclick={() => toggleKeepInTray(!service.config.keepInTray)}
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Keep running in tray when closed</span>
            <Switch
              checked={service.config.keepInTray}
              onCheckedChange={(v: boolean) => toggleKeepInTray(v)}
              onclick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Closing the window hides it. Right-click the tray icon → Quit to exit fully.
          </p>
        </div>
      </button>
    </div>

    <div class="flex flex-wrap items-end gap-3 pt-4 border-t">
      <div class="flex-1 min-w-[200px]">
        <label for="bg-interval" class="text-sm font-medium">Check interval</label>
        <p class="text-xs text-muted-foreground mt-1 mb-2">
          Last tick: {formatRelative(service.config.lastTick)}.
        </p>
        <Select.Root
          type="single"
          value={String(service.config.intervalHours)}
          onValueChange={(v) => v && setIntervalHours(Number(v))}
        >
          <Select.Trigger class="w-full" id="bg-interval">
            {INTERVAL_OPTIONS.find((o) => o.value === service.config.intervalHours)?.label ?? `Every ${service.config.intervalHours} hours`}
          </Select.Trigger>
          <Select.Content>
            {#each INTERVAL_OPTIONS as opt (opt.value)}
              <Select.Item value={String(opt.value)} label={opt.label}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <Button variant="outline" onclick={runManualCheck} disabled={manualCheckBusy}>
        {#if manualCheckBusy}
          <Loader2 class="animate-spin" />
          Checking…
        {:else}
          <PlayCircle />
          Check now
        {/if}
      </Button>
    </div>
  </CardContent>
</Card>

<!-- Card 2: Auto-persist tweaks. -->
<Card>
  <CardHeader>
    <CardTitle>Auto-persist tweaks</CardTitle>
    <CardDescription>
      Whatever you've turned on stays on — Reclaim re-applies tweaks that Windows Update flips back. Applying a tweak adds it to the persistence set; reverting removes it.
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-4">
    <button
      type="button"
      class={cn(
        "flex items-start gap-3 p-4 rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        persist.enabled ? "border-primary/40 bg-primary/5" : "border-input hover:bg-accent/40",
      )}
      onclick={() => setPersistEnabled(!persist.enabled)}
      disabled={snapshotBusy}
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">Auto-persist active tweaks</span>
          <Switch
            checked={persist.enabled}
            disabled={snapshotBusy}
            onCheckedChange={(v: boolean) => setPersistEnabled(v)}
            onclick={(e: MouseEvent) => e.stopPropagation()}
          />
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {#if persist.enabled}
            Tracking {trackedTweaks.length} tweak{trackedTweaks.length === 1 ? "" : "s"}
            {#if trackedAdmin.length > 0}
              ({trackedAdmin.length} admin{#if trackedUncheckable.length > 0}, {trackedUncheckable.length} shell-only{/if})
            {:else if trackedUncheckable.length > 0}
              ({trackedUncheckable.length} shell-only)
            {/if}. Last drift check: {formatRelative(persist.lastCheck)}{#if persist.totalDriftsFixed > 0} · {persist.totalDriftsFixed} total re-applied{/if}.
          {:else}
            Turn on to snapshot every tweak currently active and keep them re-applied after Windows updates.
          {/if}
        </p>
      </div>
    </button>

    {#if persist.enabled}
      <div class="flex flex-wrap items-end gap-3 pt-4 border-t">
        <div class="flex-1 min-w-[200px]">
          <label for="persist-mode" class="text-sm font-medium">Drift detection mode</label>
          <p class="text-xs text-muted-foreground mt-1 mb-2">
            How aggressively the background loop scans for drift.
          </p>
          <Select.Root
            type="single"
            value={persist.mode}
            onValueChange={(v) => v && setMode(v as PersistenceMode)}
          >
            <Select.Trigger class="w-full" id="persist-mode">
              {persist.mode === "strict"
                ? "Strict — every tick"
                : "Update-only — after a Windows hotfix"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="update-only" label="Update-only">
                Update-only — after a Windows hotfix in the last 48h
              </Select.Item>
              <Select.Item value="strict" label="Strict">
                Strict — re-apply any drift, every tick
              </Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <Button variant="outline" onclick={snapshotCurrent} disabled={snapshotBusy}>
          {#if snapshotBusy}
            <Loader2 class="animate-spin" />
            Scanning…
          {:else}
            <ListChecks />
            Re-snapshot
          {/if}
        </Button>
        {#if trackedTweaks.length > 0}
          <Button variant="ghost" onclick={clearTracked}>
            <Trash2 />
            Clear tracked
          </Button>
        {/if}
      </div>

      {#if trackedTweaks.length > 0}
        <button
          type="button"
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition self-start px-1"
          onclick={() => (trackedExpanded = !trackedExpanded)}
        >
          {#if trackedExpanded}
            <ChevronDown class="size-3.5" />
          {:else}
            <ChevronRight class="size-3.5" />
          {/if}
          {trackedExpanded ? "Hide" : "Show"} tracked tweaks ({trackedTweaks.length})
        </button>
        {#if trackedExpanded}
          <div class="max-h-96 overflow-y-auto -mx-1 px-1">
            {#each trackedByCategory as group (group.cat)}
              <h4 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mt-4 mb-2 first:mt-0">
                {group.label}
                <span class="tabular-nums font-normal ml-1">({group.tweaks.length})</span>
              </h4>
              <Card class="overflow-hidden gap-0 py-0 card-inset">
                {#each group.tweaks as t (t.id)}
                  {@const isAdmin = tweakRequiresAdmin(t)}
                  {@const checkable = isDriftCheckable(t)}
                  <div class="relative flex items-start gap-3 py-3 px-5 border-b last:border-b-0 bg-primary/[0.03]">
                    <span class="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-primary/60" aria-hidden="true"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm font-medium">{t.title}</span>
                        {#if t.recommended}
                          <Badge variant="success">
                            <Sparkles class="size-2.5" />
                            Recommended
                          </Badge>
                        {/if}
                        {#if isAdmin}
                          <Badge variant="warning">
                            <Lock class="size-2.5" />
                            Admin
                          </Badge>
                        {/if}
                        {#if !checkable}
                          <Badge variant="warning">
                            <HelpCircle class="size-2.5" />
                            No drift check
                          </Badge>
                        {/if}
                      </div>
                      <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {t.description}
                      </p>
                    </div>
                  </div>
                {/each}
              </Card>
            {/each}
          </div>
        {/if}
      {/if}

      <button
        type="button"
        class={cn(
          "flex items-start gap-3 p-4 rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-60",
          persist.systemTaskEnabled && systemTaskStatus.installed
            ? "border-primary/40 bg-primary/5"
            : "border-input hover:bg-accent/40",
        )}
        onclick={() => toggleSystemTask(!persist.systemTaskEnabled)}
        disabled={systemTaskBusy || !admin.elevated}
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium flex items-center gap-2">
              Also persist admin tweaks as SYSTEM
              {#if !admin.elevated}
                <Badge variant="warning">
                  <Lock class="size-2.5" />
                  needs admin
                </Badge>
              {/if}
            </span>
            <Switch
              checked={persist.systemTaskEnabled}
              disabled={systemTaskBusy || !admin.elevated}
              onCheckedChange={(v: boolean) => toggleSystemTask(v)}
              onclick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
          <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
            {#if persist.systemTaskEnabled && systemTaskStatus.installed}
              Scheduled task <code class="font-mono">\Reclaim\Persist-Current</code>
              {#if systemTaskStatus.state}· {systemTaskStatus.state}{/if}
              · {systemTaskStatus.tweakCount} tweak{systemTaskStatus.tweakCount === 1 ? "" : "s"} embedded
              · last run {formatTaskTimestamp(systemTaskStatus.lastRun)}
              · next run {formatTaskTimestamp(systemTaskStatus.nextRun)}
            {:else if persist.systemTaskEnabled && !systemTaskStatus.installed}
              Toggle is on but no scheduled task is installed yet — apply at least one HKLM / shell tweak, or click Re-snapshot if you have admin tweaks already on.
            {:else}
              Off — admin tweaks won't be re-applied at all. HKCU tweaks continue to be re-applied by the tray companion regardless.
            {/if}
          </p>
          {#if persist.systemTaskEnabled && systemTaskStatus.installed}
            <div class="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
                  void runSystemTaskNow();
                }}
                disabled={systemTaskBusy || !admin.elevated}
                class="h-7 text-xs"
              >
                {#if systemTaskBusy}
                  <Loader2 class="animate-spin" />
                  Working…
                {:else}
                  <Play />
                  Trigger now
                {/if}
              </Button>
            </div>
          {/if}
        </div>
      </button>
    {/if}
  </CardContent>
</Card>

<!-- Card 3: Notifications. -->
<Card>
  <CardHeader>
    <CardTitle>Notifications</CardTitle>
    <CardDescription>
      Native Windows toasts when the background loop does something. Clicking a toast opens Reclaim on the relevant page. The same payload is throttled to once per 24 hours.
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-3">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      {#each [
        { ch: "driftDetected" as NotificationChannel, label: "Drift re-applied", desc: "When the background loop restores tweaks Windows flipped back." },
        { ch: "windowsUpdateAvailable" as NotificationChannel, label: "Windows updates", desc: "Polled every 12h. Skipped on battery below 30%." },
        { ch: "driverUpdateAvailable" as NotificationChannel, label: "NVIDIA driver updates", desc: "Polled every 24h. AMD/Intel not supported yet." },
      ] as item (item.ch)}
        {@const on = service.config.notificationPrefs[item.ch]}
        <button
          type="button"
          class={cn(
            "flex items-start gap-3 p-4 rounded-lg border text-left transition",
            on ? "border-primary/40 bg-primary/5" : "border-input hover:bg-accent/40",
          )}
          onclick={() => toggleChannel(item.ch, !on)}
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">{item.label}</span>
              <Switch
                checked={on}
                onCheckedChange={(v: boolean) => toggleChannel(item.ch, v)}
                onclick={(e: MouseEvent) => e.stopPropagation()}
              />
            </div>
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
          </div>
        </button>
      {/each}
    </div>
    <div class="flex items-start gap-2 text-xs text-muted-foreground pt-1">
      <AlertTriangle class="size-3.5 shrink-0 mt-0.5" />
      <p>
        Toasts respect Windows Focus Assist. If you don't see them, check Settings → System → Notifications.
      </p>
    </div>
  </CardContent>
</Card>
