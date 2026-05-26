<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button,
    Card,
    CardContent,
    Badge,
    Dialog,
    PageHeader,
    SectionHeading,
    EmptyState,
    ListCard,
    ListRow,
    FormField,
    Switch,
    Select,
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    Play,
    Square,
    Cpu,
    ShieldOff,
    Cog,
    Zap,
    RefreshCw,
    AlertTriangle,
  } from "@lucide/svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";
  import {
    isTauri,
    listPowerPlans,
    sessionWhitelist,
    type PowerPlan,
    type SessionWhitelist,
  } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { gamingSession } from "$lib/gaming-session/store.svelte";

  const canRun = $derived(isTauri() && admin.checked && admin.elevated);

  let powerPlans = $state<PowerPlan[]>([]);
  let whitelist = $state<SessionWhitelist>({ processes: [], services: [] });
  let loading = $state(true);
  let confirmEndOpen = $state(false);

  // User selections — persisted to localStorage so they survive page revisits.
  const PREFS_KEY = "reclaim.gaming-session.prefs";
  type Prefs = {
    targetPowerPlan: string;
    pauseDefender: boolean;
    selectedProcesses: string[];
    selectedServices: string[];
  };

  function loadPrefs(): Prefs {
    if (typeof localStorage === "undefined") {
      return {
        targetPowerPlan: "",
        pauseDefender: false,
        selectedProcesses: [],
        selectedServices: [],
      };
    }
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) {
        return {
          targetPowerPlan: "",
          pauseDefender: false,
          selectedProcesses: [],
          selectedServices: [],
        };
      }
      return JSON.parse(raw) as Prefs;
    } catch {
      return {
        targetPowerPlan: "",
        pauseDefender: false,
        selectedProcesses: [],
        selectedServices: [],
      };
    }
  }

  let prefs = $state<Prefs>(loadPrefs());

  $effect(() => {
    // Persist on every change.
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  });

  onMount(async () => {
    if (!canRun) {
      loading = false;
      return;
    }
    try {
      const [plans, wl] = await Promise.all([listPowerPlans(), sessionWhitelist()]);
      powerPlans = plans;
      whitelist = wl;
      // Default to the system's Ultimate or High Performance plan if user hasn't picked.
      if (!prefs.targetPowerPlan) {
        const ult = plans.find((p) => p.name.toLowerCase().includes("ultimate"));
        const high = plans.find((p) => p.name.toLowerCase().includes("high performance"));
        prefs.targetPowerPlan = ult?.guid ?? high?.guid ?? plans[0]?.guid ?? "";
      }
    } catch (e) {
      toast.error("Failed to load power plans", (e as Error).message);
    } finally {
      loading = false;
    }
  });

  const selectedPlanName = $derived(
    powerPlans.find((p) => p.guid === prefs.targetPowerPlan)?.name ?? "Pick a power plan",
  );

  function toggleProcess(name: string) {
    if (prefs.selectedProcesses.includes(name)) {
      prefs.selectedProcesses = prefs.selectedProcesses.filter((n) => n !== name);
    } else {
      prefs.selectedProcesses = [...prefs.selectedProcesses, name];
    }
  }

  function toggleService(name: string) {
    if (prefs.selectedServices.includes(name)) {
      prefs.selectedServices = prefs.selectedServices.filter((n) => n !== name);
    } else {
      prefs.selectedServices = [...prefs.selectedServices, name];
    }
  }

  async function startSession() {
    try {
      await gamingSession.start({
        targetPowerPlan: prefs.targetPowerPlan,
        pauseDefender: prefs.pauseDefender,
        stopServices: prefs.selectedServices,
        killProcesses: prefs.selectedProcesses,
      });
      toast.success("Gaming session started", "Background noise suspended — go play.");
    } catch (e) {
      toast.error("Could not start session", (e as Error).message);
    }
  }

  async function endSession() {
    confirmEndOpen = false;
    try {
      await gamingSession.end();
      toast.success("Session ended", "Previous state restored.");
    } catch (e) {
      toast.error("Restore failed", (e as Error).message);
    }
  }

  function fmtDuration(startedAt: number): string {
    const ms = Date.now() - startedAt;
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  // Tick once a minute so the duration label refreshes without bloating the loop.
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  $effect(() => {
    void now;
  });

  const SERVICE_HINTS: Record<string, string> = {
    WSearch: "Windows Search indexer",
    SysMain: "Superfetch / preloading",
    DiagTrack: "Telemetry collector",
    WerSvc: "Error reporting",
    Spooler: "Print spooler",
    WbioSrvc: "Biometric (fingerprint reader)",
    BITS: "Background download queue",
    wuauserv: "Windows Update",
    BthAvctpSvc: "Bluetooth audio routing",
    TabletInputService: "Touch / pen input",
  };
</script>

<PageHeader title="Gaming Session">
  Snapshot the system, suspend background noise, switch power plan — then put everything back when
  you're done. Reversible by design.
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — Gaming Session needs the built app.</EmptyState>
{:else if admin.checked && !admin.elevated}
  <AdminBanner
    title="Gaming Session needs administrator"
    description="Switching power plans, pausing Defender real-time scanning and stopping services all require elevated rights."
    declinedToast="Gaming Session needs admin."
  />
{:else if loading}
  <EmptyState loading>Loading power plans and whitelist…</EmptyState>
{:else if gamingSession.active}
  {@const active = gamingSession.active}
  <!-- ───── Active session ───── -->
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="flex items-center gap-3 mb-4">
        <div class="size-10 rounded-full bg-primary/15 grid place-items-center">
          <Zap class="size-5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold">Gaming session active</span>
            <Badge variant="success">Live</Badge>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            Started {fmtDuration(active.startedAt)} ago — {new Date(
              active.startedAt,
            ).toLocaleTimeString()}
          </p>
        </div>
        <Button
          variant="destructive"
          onclick={() => (confirmEndOpen = true)}
          disabled={gamingSession.busy}
        >
          {#if gamingSession.busy}
            <Loader2 class="animate-spin" />
          {:else}
            <Square />
          {/if}
          End session
        </Button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="p-3 rounded-md bg-surface-2 border border-hairline">
          <div class="flex items-center gap-2 text-muted-foreground mb-1">
            <Cpu class="size-3.5" /> Power plan
          </div>
          <div class="font-medium">
            {powerPlans.find((p) => p.guid === active.options.targetPowerPlan)?.name ??
              "(unknown)"}
          </div>
          <div class="text-muted-foreground mt-1">
            Will restore to {powerPlans.find((p) => p.guid === active.snapshot.powerPlanGuid)?.name ??
              "previous plan"}
          </div>
        </div>
        <div class="p-3 rounded-md bg-surface-2 border border-hairline">
          <div class="flex items-center gap-2 text-muted-foreground mb-1">
            <ShieldOff class="size-3.5" /> Defender real-time
          </div>
          <div class="font-medium">
            {active.options.pauseDefender ? "Paused" : "Untouched"}
          </div>
          {#if active.options.pauseDefender}
            <div class="text-muted-foreground mt-1">
              Will resume to {active.snapshot.defenderRealtime ? "On" : "Off"}
            </div>
          {/if}
        </div>
        <div class="p-3 rounded-md bg-surface-2 border border-hairline">
          <div class="flex items-center gap-2 text-muted-foreground mb-1">
            <Cog class="size-3.5" /> Suspended
          </div>
          <div class="font-medium">
            {active.options.killProcesses.length} procs · {active.options.stopServices.length}
            services
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <InfoBanner tone="info">
    Background apps killed during the session aren't auto-restarted — they'll come back next time you
    open them. Services are restored to their snapshotted state when you end the session.
  </InfoBanner>
{:else}
  <!-- ───── Configuration ───── -->
  {#if gamingSession.lastError}
    <InfoBanner tone="error">{gamingSession.lastError}</InfoBanner>
  {/if}

  <SectionHeading title="Session settings" />
  <Card class="card-inset mb-6">
    <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <FormField label="Switch power plan to">
          <Select.Root
            type="single"
            value={prefs.targetPowerPlan}
            onValueChange={(v) => (prefs.targetPowerPlan = v ?? "")}
          >
            <Select.Trigger>
              <span>{selectedPlanName}</span>
            </Select.Trigger>
            <Select.Content>
              {#each powerPlans as p (p.guid)}
                <Select.Item value={p.guid} label={p.name}>
                  {p.name}{p.active ? " · active" : ""}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </FormField>
        <div class="flex items-start gap-3 p-3 rounded-md bg-surface-2 border border-hairline">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">Pause Defender real-time scanning</span>
              <Badge variant="warning">
                <AlertTriangle class="size-2.5" />
                Risky
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
              Disables on-access scanning for the duration of the session. Restored on end. Only use
              if you're playing offline / trusted titles — never browse with this off.
            </p>
          </div>
          <Switch
            checked={prefs.pauseDefender}
            onCheckedChange={(v) => (prefs.pauseDefender = v)}
          />
        </div>
      </div>
    </CardContent>
  </Card>

  <SectionHeading
    title="Background processes to terminate"
    description="Reclaim runs Stop-Process on these when the session starts. The whitelist is hardcoded — nothing system-critical can end up here."
  />
  <ListCard class="mb-6">
    {#each whitelist.processes as proc (proc)}
      {@const on = prefs.selectedProcesses.includes(proc)}
      <ListRow density="md">
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium">{proc}</span>
        </div>
        <Switch checked={on} onCheckedChange={() => toggleProcess(proc)} />
      </ListRow>
    {/each}
  </ListCard>

  <SectionHeading
    title="Services to stop"
    description="Stopped on session start, restored to the snapshotted state on session end."
  />
  <ListCard class="mb-6">
    {#each whitelist.services as svc (svc)}
      {@const on = prefs.selectedServices.includes(svc)}
      <ListRow density="md">
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium font-mono">{svc}</span>
          <p class="text-xs text-muted-foreground mt-0.5">{SERVICE_HINTS[svc] ?? ""}</p>
        </div>
        <Switch checked={on} onCheckedChange={() => toggleService(svc)} />
      </ListRow>
    {/each}
  </ListCard>

  <Card class="card-inset mb-6">
    <CardContent>
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-full bg-primary/15 grid place-items-center">
          <Play class="size-5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold">Ready to launch</div>
          <p class="text-xs text-muted-foreground mt-0.5">
            Snapshots current power plan, Defender state and selected services. End session restores
            everything.
          </p>
        </div>
        <Button onclick={startSession} disabled={gamingSession.busy || !prefs.targetPowerPlan}>
          {#if gamingSession.busy}
            <Loader2 class="animate-spin" />
          {:else}
            <Play />
          {/if}
          Start gaming session
        </Button>
      </div>
    </CardContent>
  </Card>
{/if}

<Dialog
  bind:open={confirmEndOpen}
  title="End gaming session?"
  description="Reclaim will restore the previous power plan, re-enable Defender if it was paused, and restart any services that were stopped."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmEndOpen = false)} disabled={gamingSession.busy}>
      Cancel
    </Button>
    <Button onclick={endSession} disabled={gamingSession.busy}>
      {#if gamingSession.busy}
        <Loader2 class="animate-spin" />
      {:else}
        <RefreshCw />
      {/if}
      Restore state
    </Button>
  {/snippet}
</Dialog>
