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
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
  import { service, type NotificationChannel, type PersistenceMode } from "$lib/service.svelte";
  import { runPersistenceCheck } from "$lib/persistence/checker";
  import { maybeCheckDriverUpdates, maybeCheckWindowsUpdates } from "$lib/persistence/updateChecker";
  import { isTauri, isPortable } from "$lib/tweaks/bridge";
  import { PROFILES, type Profile, resolveProfileTweaks } from "$lib/tweaks/profiles";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import { tweakRequiresAdmin } from "$lib/tweaks/executor";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";

  let autostartOn = $state(false);
  let autostartBusy = $state(false);
  let portable = $state(false);
  let portableChecked = $state(false);
  let runningCheckIds = $state<Record<string, boolean>>({});
  let manualCheckBusy = $state(false);

  onMount(async () => {
    if (!isTauri()) return;
    portable = await isPortable();
    portableChecked = true;
    if (!portable) {
      try {
        autostartOn = await autostartIsEnabled();
      } catch {}
    }
  });

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
      toast.show(`Stopped persisting ${profile.name}`, {
        description: "Tweaks remain in place; drift will no longer be re-applied.",
      });
    }
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
            <Switch checked={autostartOn} disabled={autostartBusy || portable} onclick={(e: MouseEvent) => e.stopPropagation()} />
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {#if portableChecked && portable}
              Portable mode is stateless on disk — autostart needs an installed build.
            {:else}
              Boots directly to tray at login. No window flash.
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
            <Switch checked={service.config.keepInTray} onclick={(e: MouseEvent) => e.stopPropagation()} />
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
        Selected profiles get their HKCU tweaks re-applied on a schedule. Admin-requiring tweaks (HKLM, shell ops) are skipped — those need a SYSTEM-scheduled task and will land in a later release.
      </p>
      <div class="flex flex-col divide-y rounded-lg border overflow-hidden">
        {#each allProfiles as p (p.id)}
          {@const persisted = service.getPersisted(p.id)}
          {@const isOn = !!persisted}
          {@const hkcu = profileHkcuCount(p)}
          {@const admin = profileAdminCount(p)}
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
                <Badge variant="outline" class="text-[10px]">{hkcu} watchable</Badge>
                {#if admin > 0}
                  <Badge variant="outline" class="text-[10px] gap-1">
                    <Lock class="size-3" />
                    {admin} admin (skipped)
                  </Badge>
                {/if}
                {#if persisted}
                  <span class="text-[11px]">
                    Last: {formatRelative(persisted.lastCheck)}
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
