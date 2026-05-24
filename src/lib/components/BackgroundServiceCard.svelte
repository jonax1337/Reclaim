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
    Bell,
    Clock,
    Play,
    PlayCircle,
    Loader2,
    Power,
    Shield,
    AlertTriangle,
    AppWindow,
    LogIn,
    Pin,
    Lock,
    ShieldCheck,
    ShieldAlert,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
  import { service, type NotificationChannel, type PersistenceMode } from "$lib/service.svelte";
  import { runPersistenceCheck } from "$lib/persistence/checker";
  import { maybeCheckDriverUpdates, maybeCheckWindowsUpdates } from "$lib/persistence/updateChecker";
  import {
    isTauri,
    isPortable,
    persistenceInstallTask,
    persistenceRunTaskNow,
    persistenceTaskStatus,
    persistenceUninstallTask,
    type PersistenceTaskStatus,
  } from "$lib/tweaks/bridge";
  import { PROFILES, type Profile, resolveProfileTweaks } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import { tweakRequiresAdmin } from "$lib/tweaks/executor";
  import { admin } from "$lib/admin.svelte";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";

  let autostartOn = $state(false);
  let autostartBusy = $state(false);
  let portable = $state(false);
  let portableChecked = $state(false);
  let runningCheckIds = $state<Record<string, boolean>>({});
  let manualCheckBusy = $state(false);
  let systemTaskStatuses = $state<Record<string, PersistenceTaskStatus>>({});
  let systemTaskBusy = $state<Record<string, boolean>>({});

  onMount(async () => {
    if (!isTauri()) return;
    portable = await isPortable();
    portableChecked = true;
    if (!portable) {
      try {
        autostartOn = await autostartIsEnabled();
      } catch {}
    }
    void refreshAllTaskStatuses();
  });

  async function refreshTaskStatus(profileId: string) {
    try {
      systemTaskStatuses[profileId] = await persistenceTaskStatus(profileId);
    } catch {
      systemTaskStatuses[profileId] = { installed: false };
    }
  }

  async function refreshAllTaskStatuses() {
    if (!isTauri()) return;
    await Promise.all(
      [...PROFILES, ...customProfiles.items].map((p) => refreshTaskStatus(p.id)),
    );
  }

  const INTERVAL_OPTIONS = [
    { value: 1, label: "Every hour" },
    { value: 6, label: "Every 6 hours" },
    { value: 12, label: "Every 12 hours" },
    { value: 24, label: "Every 24 hours" },
  ];

  const allProfiles = $derived([...PROFILES, ...customProfiles.items]);

  function profileAdminCount(p: Profile): number {
    return resolveProfileTweaks(p).filter((t) => tweakRequiresAdmin(t)).length;
  }

  function profileHkcuCount(p: Profile): number {
    return resolveProfileTweaks(p).filter(
      (t) => !tweakRequiresAdmin(t) && t.check && t.check.length > 0,
    ).length;
  }

  function formatRelative(ts: number): string {
    if (!ts) return "never";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
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
    // Rebuild any installed SYSTEM tasks with the new repetition interval —
    // otherwise the user changes the slider and the scheduled tasks silently
    // keep their old cadence.
    if (admin.elevated) {
      const installedIds = Object.entries(systemTaskStatuses)
        .filter(([, s]) => s.installed)
        .map(([id]) => id);
      for (const id of installedIds) {
        const profile = [...PROFILES, ...customProfiles.items].find((p) => p.id === id);
        if (!profile) continue;
        try {
          await persistenceInstallTask(profile.id, profile.name, hours);
        } catch {}
      }
      if (installedIds.length > 0) void refreshAllTaskStatuses();
    }
    toast.success(`Background interval set to ${hours}h`);
  }

  async function togglePersisted(profile: Profile, on: boolean) {
    if (on) {
      await service.addPersisted(profile.id, "update-only");
      toast.success(
        `Persisting ${profile.name}`,
        "Drift will be re-applied after each Windows update.",
      );
    } else {
      await service.removePersisted(profile.id);
      // Also tear down the SYSTEM task if one exists — leaving it installed
      // would keep applying admin tweaks the user just opted out of.
      if (systemTaskStatuses[profile.id]?.installed && admin.elevated) {
        try {
          await persistenceUninstallTask(profile.id);
          await refreshTaskStatus(profile.id);
        } catch {}
      }
      toast.show(`Stopped persisting ${profile.name}`, {
        description: "Tweaks remain in place; drift will no longer be re-applied.",
      });
    }
  }

  async function toggleSystemTask(profile: Profile, on: boolean) {
    if (!admin.elevated) {
      toast.warning(
        "Administrator required",
        "Installing the SYSTEM scheduled task needs elevation. Click the shield in the title bar to re-launch as admin.",
      );
      return;
    }
    systemTaskBusy[profile.id] = true;
    try {
      if (on) {
        await persistenceInstallTask(
          profile.id,
          profile.name,
          service.config.intervalHours,
        );
        toast.success(
          `Admin persistence on for ${profile.name}`,
          "A SYSTEM scheduled task now re-applies HKLM + shell tweaks at logon and on your selected interval.",
        );
      } else {
        await persistenceUninstallTask(profile.id);
        toast.show(`Admin persistence off for ${profile.name}`, {
          description: "Scheduled task removed. HKCU tweaks continue to be re-applied by the tray companion.",
        });
      }
      await refreshTaskStatus(profile.id);
    } catch (e) {
      toast.error("Scheduled task change failed", String(e));
    } finally {
      systemTaskBusy[profile.id] = false;
    }
  }

  async function runSystemTaskNow(profile: Profile) {
    if (!admin.elevated) {
      toast.warning(
        "Administrator required",
        "Running the SYSTEM scheduled task on demand needs elevation.",
      );
      return;
    }
    systemTaskBusy[profile.id] = true;
    try {
      await persistenceRunTaskNow(profile.id);
      toast.success(
        `${profile.name}: admin task triggered`,
        "Check the Last-run column in a few seconds.",
      );
      setTimeout(() => void refreshTaskStatus(profile.id), 3000);
    } catch (e) {
      toast.error("Run failed", String(e));
    } finally {
      systemTaskBusy[profile.id] = false;
    }
  }

  function formatTaskTimestamp(iso: string | null | undefined): string {
    if (!iso) return "never";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "never";
    return formatRelative(t);
  }

  async function setMode(profileId: string, mode: PersistenceMode) {
    await service.setPersistedMode(profileId, mode);
  }

  async function runCheckNow(profileId: string, profileName: string) {
    runningCheckIds[profileId] = true;
    try {
      const results = await runPersistenceCheck({ profileId });
      const r = results[0];
      if (!r) {
        toast.show(`${profileName}`, { description: "Nothing to check." });
      } else if (r.skippedReason === "no-update") {
        toast.show(`${profileName}`, {
          description: "Update-only mode: no recent Windows update, skipped.",
        });
      } else if (r.driftCount === 0) {
        toast.success(`${profileName}`, "No drift detected.");
      } else {
        toast.success(
          `${profileName}`,
          `${r.driftCount} tweak${r.driftCount === 1 ? "" : "s"} re-applied.`,
        );
      }
    } catch (e) {
      toast.error("Check failed", String(e));
    } finally {
      runningCheckIds[profileId] = false;
    }
  }

  async function runAllChecks() {
    manualCheckBusy = true;
    try {
      await runPersistenceCheck({});
      await maybeCheckWindowsUpdates(true);
      await maybeCheckDriverUpdates(true);
      toast.success("Background check complete");
    } catch (e) {
      toast.error("Check failed", String(e));
    } finally {
      manualCheckBusy = false;
    }
  }

  async function toggleChannel(channel: NotificationChannel, enabled: boolean) {
    await service.setNotificationPref(channel, enabled);
  }

  async function toggleKeepInTray(on: boolean) {
    await service.setKeepInTray(on);
  }
</script>

<Card class="card-inset">
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Power class="size-4 text-primary" />
      Background service
    </CardTitle>
    <CardDescription>
      Tray companion that re-applies drift after Windows updates and surfaces Windows-Update + NVIDIA-driver availability.
    </CardDescription>
  </CardHeader>
  <CardContent class="flex flex-col gap-6">
    <!-- Tray + autostart row -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        type="button"
        class="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
        onclick={() => toggleAutostart(!autostartOn)}
        disabled={autostartBusy || (portableChecked && portable)}
      >
        <LogIn class="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-medium">Start with Windows</div>
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
        class="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 text-left transition"
        onclick={() => toggleKeepInTray(!service.config.keepInTray)}
      >
        <Pin class="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-medium">Keep running in tray when closed</div>
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

    <!-- Interval picker + Check now -->
    <div class="flex flex-wrap items-end gap-3 pt-4 border-t">
      <div class="flex-1 min-w-[200px]">
        <label for="bg-interval" class="text-sm font-medium flex items-center gap-2">
          <Clock class="size-4 text-muted-foreground" />
          Check interval
        </label>
        <p class="text-xs text-muted-foreground mt-1 mb-2">
          How often the background loop checks for drift, updates and drivers.
          Last check: {formatRelative(service.config.lastTick)}.
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
      <Button variant="outline" onclick={runAllChecks} disabled={manualCheckBusy}>
        {#if manualCheckBusy}
          <Loader2 class="animate-spin" />
          Checking…
        {:else}
          <PlayCircle />
          Check now
        {/if}
      </Button>
    </div>

    <!-- Active persistence -->
    <div class="pt-4 border-t">
      <h3 class="text-sm font-medium flex items-center gap-2 mb-1">
        <Shield class="size-4 text-muted-foreground" />
        Active persistence
      </h3>
      <p class="text-xs text-muted-foreground mb-3">
        Selected profiles get their HKCU tweaks re-applied by the tray companion. Profiles with admin tweaks can also install a SYSTEM-running scheduled task that re-applies HKLM + shell ops at logon and on the configured interval — no UAC prompt at every boot.
      </p>
      <div class="flex flex-col divide-y rounded-lg border overflow-hidden">
        {#each allProfiles as p (p.id)}
          {@const persisted = service.getPersisted(p.id)}
          {@const isOn = !!persisted}
          {@const hkcu = profileHkcuCount(p)}
          {@const adminCount = profileAdminCount(p)}
          {@const taskStatus = systemTaskStatuses[p.id] ?? { installed: false }}
          <div class="flex items-start gap-3 p-3 bg-card">
            <div class="size-9 rounded-md bg-foreground/[0.04] border flex items-center justify-center shrink-0">
              <ProfileIcon name={p.gradient} class="size-4 text-foreground/80" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium text-sm truncate">{p.name}</div>
                <Switch checked={isOn} onCheckedChange={(v: boolean) => togglePersisted(p, v)} />
              </div>
              <div class="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2 items-center">
                <Badge variant="outline" class="text-[10px]">{hkcu} HKCU watchable</Badge>
                {#if adminCount > 0}
                  <Badge variant="outline" class="text-[10px] gap-1">
                    <Lock class="size-3" />
                    {adminCount} admin
                  </Badge>
                {/if}
                {#if persisted}
                  <span class="text-[11px]">
                    HKCU last: {formatRelative(persisted.lastCheck)}
                    {#if persisted.lastDriftCount > 0}
                      · {persisted.lastDriftCount} re-applied
                    {/if}
                    {#if persisted.totalDriftsFixed > 0}
                      · {persisted.totalDriftsFixed} total
                    {/if}
                  </span>
                {/if}
              </div>
              {#if persisted}
                <div class="flex items-center gap-2 mt-2">
                  <Select.Root
                    type="single"
                    value={persisted.mode}
                    onValueChange={(v) => v && setMode(p.id, v as PersistenceMode)}
                  >
                    <Select.Trigger class="h-7 text-xs">
                      {persisted.mode === "strict" ? "Strict" : "Update-only"}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="update-only" label="Update-only">Update-only — re-apply only after Windows updates</Select.Item>
                      <Select.Item value="strict" label="Strict">Strict — re-apply any drift, every tick</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => runCheckNow(p.id, p.name)}
                    disabled={runningCheckIds[p.id]}
                  >
                    {#if runningCheckIds[p.id]}
                      <Loader2 class="animate-spin" />
                      Checking…
                    {:else}
                      <Play />
                      Run now
                    {/if}
                  </Button>
                </div>

                {#if adminCount > 0}
                  <div class="mt-2 rounded-md border bg-foreground/[0.02] p-2.5 flex items-start gap-2">
                    {#if taskStatus.installed}
                      <ShieldCheck class="size-4 mt-0.5 shrink-0 text-primary" />
                    {:else}
                      <ShieldAlert class="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    {/if}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-xs font-medium">
                          Run admin tweaks as SYSTEM
                          {#if !admin.elevated}
                            <Badge variant="outline" class="text-[10px] ml-1">requires admin</Badge>
                          {/if}
                        </div>
                        <Switch
                          checked={taskStatus.installed}
                          disabled={systemTaskBusy[p.id] || !admin.elevated}
                          onCheckedChange={(v: boolean) => toggleSystemTask(p, v)}
                        />
                      </div>
                      <p class="text-[11px] text-muted-foreground mt-0.5">
                        {#if taskStatus.installed}
                          Scheduled task <code class="px-1 rounded bg-foreground/5">\Reclaim\Persist-{p.id}</code>
                          {#if taskStatus.state}
                            · {taskStatus.state}
                          {/if}
                          · last run {formatTaskTimestamp(taskStatus.lastRun)}
                          · next run {formatTaskTimestamp(taskStatus.nextRun)}
                        {:else}
                          Installs <code class="px-1 rounded bg-foreground/5">\Reclaim\Persist-{p.id}</code>, runs reclaim.exe --apply-profile {p.id} --admin-only at logon + every {service.config.intervalHours}h.
                        {/if}
                      </p>
                      {#if taskStatus.installed}
                        <div class="mt-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onclick={() => runSystemTaskNow(p)}
                            disabled={systemTaskBusy[p.id] || !admin.elevated}
                            class="h-6 text-[11px]"
                          >
                            {#if systemTaskBusy[p.id]}
                              <Loader2 class="animate-spin size-3" />
                              Working…
                            {:else}
                              <Play class="size-3" />
                              Trigger now
                            {/if}
                          </Button>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Notifications -->
    <div class="pt-4 border-t">
      <h3 class="text-sm font-medium flex items-center gap-2 mb-1">
        <Bell class="size-4 text-muted-foreground" />
        Notifications
      </h3>
      <p class="text-xs text-muted-foreground mb-3">
        Native Win11 toasts. Clicking a toast opens Reclaim on the relevant page. Throttled to suppress the same payload within 24 hours.
      </p>
      <div class="flex flex-col gap-2">
        {#each [
          { ch: "driftDetected" as NotificationChannel, label: "Drift re-applied", desc: "When a persisted profile gets tweaks restored after Windows updates." },
          { ch: "windowsUpdateAvailable" as NotificationChannel, label: "Windows updates", desc: "Polled every 12h. Skipped on battery below 30%." },
          { ch: "driverUpdateAvailable" as NotificationChannel, label: "NVIDIA driver updates", desc: "Polled every 24h for detected NVIDIA GPUs. AMD/Intel not supported yet." },
        ] as item (item.ch)}
          <label class="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/20 transition cursor-pointer">
            <Bell class="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium">{item.label}</span>
                <Switch
                  checked={service.config.notificationPrefs[item.ch]}
                  onCheckedChange={(v: boolean) => toggleChannel(item.ch, v)}
                />
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          </label>
        {/each}
      </div>
      <div class="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle class="size-3.5 shrink-0 mt-0.5" />
        <p>
          Toasts respect Windows Focus Assist. If you don't see them, check Settings → System → Notifications.
        </p>
      </div>
    </div>
  </CardContent>
</Card>
