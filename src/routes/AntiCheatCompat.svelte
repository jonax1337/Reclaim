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
    InfoBanner,
    toast,
  } from "$lib/ui";
  import {
    Loader2,
    RefreshCw,
    ShieldCheck,
    Cpu,
    KeyRound,
    Lock,
    Bug,
    Terminal as TerminalIcon,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    HelpCircle,
  } from "@lucide/svelte";
  import { isTauri, acGetState, acDisableTestMode, acDisableKernelDebug, advancedRestart, type AntiCheatState } from "$lib/tweaks/bridge";
  import { admin } from "$lib/admin.svelte";
  import { log } from "$lib/log.svelte";
  import AdminBanner from "$lib/components/AdminBanner.svelte";

  const canFetch = $derived(isTauri() && admin.checked);

  let acState = $state<AntiCheatState | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let busy = $state(false);

  let testModeConfirmOpen = $state(false);
  let kernelDebugConfirmOpen = $state(false);
  let uefiConfirmOpen = $state(false);

  async function refresh() {
    if (!canFetch) {
      loading = false;
      return;
    }
    refreshing = true;
    try {
      acState = await acGetState();
    } catch (e) {
      toast.error("Could not query state", (e as Error).message);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  onMount(() => {
    refresh();
  });

  // ─── Compat matrix ──────────────────────────────────────────────────────

  type AntiCheat = "vanguard" | "eac" | "battleye" | "vac";

  type CheckResult = "ok" | "warn" | "fail" | "unknown";

  type AcDef = {
    id: AntiCheat;
    name: string;
    games: string;
    /** Returns a list of issues — empty list = perfectly compatible. */
    evaluate: (s: AntiCheatState) => Array<{ severity: "warn" | "fail"; reason: string }>;
  };

  const ANTI_CHEATS: AcDef[] = [
    {
      id: "vanguard",
      name: "Riot Vanguard",
      games: "Valorant · League of Legends",
      evaluate: (s) => {
        const out: Array<{ severity: "warn" | "fail"; reason: string }> = [];
        if (s.buildNumber >= 22000) {
          if (s.secureBoot === false)
            out.push({ severity: "fail", reason: "Secure Boot must be ON on Windows 11." });
          if (s.tpmPresent === false || s.tpmReady === false)
            out.push({ severity: "fail", reason: "TPM 2.0 must be present and enabled." });
        } else {
          if (s.secureBoot === false)
            out.push({
              severity: "warn",
              reason: "Vanguard tolerates this on Win10 but will require it after upgrade.",
            });
        }
        if (s.testMode)
          out.push({ severity: "fail", reason: "Test Mode (testsigning) blocks Vanguard load." });
        if (s.kernelDebug)
          out.push({ severity: "fail", reason: "Kernel debugging blocks Vanguard load." });
        return out;
      },
    },
    {
      id: "eac",
      name: "Easy Anti-Cheat",
      games: "Fortnite · Rust · Apex Legends · Elden Ring",
      evaluate: (s) => {
        const out: Array<{ severity: "warn" | "fail"; reason: string }> = [];
        if (s.secureBoot === false && s.buildNumber >= 22000)
          out.push({
            severity: "warn",
            reason: "Fortnite refuses to launch without Secure Boot on Win11.",
          });
        if (s.testMode)
          out.push({ severity: "fail", reason: "Test Mode blocks most EAC titles." });
        if (s.kernelDebug)
          out.push({ severity: "fail", reason: "Kernel debugging blocks EAC." });
        if (!s.is64bit)
          out.push({ severity: "fail", reason: "EAC requires 64-bit Windows." });
        return out;
      },
    },
    {
      id: "battleye",
      name: "BattlEye",
      games: "PUBG · Rainbow Six Siege · DayZ · ARMA 3",
      evaluate: (s) => {
        const out: Array<{ severity: "warn" | "fail"; reason: string }> = [];
        if (s.testMode)
          out.push({ severity: "fail", reason: "Test Mode blocks BattlEye." });
        if (s.kernelDebug)
          out.push({ severity: "fail", reason: "Kernel debugging blocks BattlEye." });
        return out;
      },
    },
    {
      id: "vac",
      name: "Valve Anti-Cheat (VAC)",
      games: "CS2 · TF2 · Dota 2",
      evaluate: (s) => {
        const out: Array<{ severity: "warn" | "fail"; reason: string }> = [];
        if (s.testMode)
          out.push({
            severity: "warn",
            reason: "Test Mode is allowed but flags accounts on some servers.",
          });
        return out;
      },
    },
  ];

  function summaryFor(issues: Array<{ severity: "warn" | "fail" }>): CheckResult {
    if (issues.some((i) => i.severity === "fail")) return "fail";
    if (issues.length > 0) return "warn";
    return "ok";
  }

  // ─── Actions ───────────────────────────────────────────────────────────

  async function fixTestMode() {
    testModeConfirmOpen = false;
    busy = true;
    try {
      await acDisableTestMode();
      log.success("tweak.apply", "Test Mode", "bcdedit /set testsigning off");
      toast.success("Test Mode disabled", "Reboot for the change to take effect.");
      await refresh();
    } catch (e) {
      toast.error("Could not disable test mode", (e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function fixKernelDebug() {
    kernelDebugConfirmOpen = false;
    busy = true;
    try {
      await acDisableKernelDebug();
      log.success("tweak.apply", "Kernel debug", "bcdedit /debug off");
      toast.success("Kernel debugging disabled", "Reboot for the change to take effect.");
      await refresh();
    } catch (e) {
      toast.error("Could not disable kernel debug", (e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function rebootToFirmware() {
    uefiConfirmOpen = false;
    try {
      await advancedRestart("firmware");
      log.info("recovery.restart", "UEFI firmware", "Restart triggered");
    } catch (e) {
      toast.error("Could not trigger restart", (e as Error).message);
    }
  }

  // ─── State row rendering helpers ───────────────────────────────────────

  type StateRow = {
    icon: typeof Cpu;
    label: string;
    description: string;
    value: string;
    tone: "ok" | "warn" | "fail" | "unknown";
    action?: { label: string; onClick: () => void };
  };

  const rows = $derived<StateRow[]>(acState ? buildRows(acState) : []);

  function buildRows(s: AntiCheatState): StateRow[] {
    const out: StateRow[] = [];

    out.push({
      icon: KeyRound,
      label: "Secure Boot",
      description: "UEFI firmware feature that blocks unsigned bootloaders.",
      value: s.secureBoot === null ? "Unknown (legacy BIOS?)" : s.secureBoot ? "Enabled" : "Disabled",
      tone: s.secureBoot === null ? "unknown" : s.secureBoot ? "ok" : "fail",
      action:
        s.secureBoot === false
          ? { label: "Open UEFI", onClick: () => (uefiConfirmOpen = true) }
          : undefined,
    });

    const tpmText =
      s.tpmPresent === null
        ? "Unknown"
        : !s.tpmPresent
          ? "Not present"
          : s.tpmReady
            ? `Ready (${s.tpmSpecVersion ?? "spec unknown"})`
            : `Present but not ready (${s.tpmSpecVersion ?? "spec unknown"})`;
    out.push({
      icon: Lock,
      label: "TPM 2.0",
      description: "Hardware security module — required by Win11 + Vanguard.",
      value: tpmText,
      tone:
        s.tpmPresent === null
          ? "unknown"
          : s.tpmReady === true
            ? "ok"
            : s.tpmPresent
              ? "warn"
              : "fail",
    });

    out.push({
      icon: Cpu,
      label: "VBS (Virtualization-Based Security)",
      description: "Hypervisor-isolated security context. Required for HVCI.",
      value: s.vbsRunning ? "Running" : "Off",
      tone: s.vbsRunning ? "ok" : "warn",
    });

    out.push({
      icon: ShieldCheck,
      label: "HVCI / Memory Integrity",
      description:
        "Code Integrity enforcement in the secure kernel. Some anti-cheats now demand it; older drivers may need to be removed.",
      value: s.hvciRunning ? "Running" : "Off",
      tone: s.hvciRunning ? "ok" : "warn",
    });

    out.push({
      icon: Bug,
      label: "Test Mode (testsigning)",
      description: "Allows unsigned drivers — anti-cheats treat this as hostile.",
      value: s.testMode ? "ON — anti-cheats will refuse" : "Off",
      tone: s.testMode ? "fail" : "ok",
      action: s.testMode
        ? { label: "Turn off", onClick: () => (testModeConfirmOpen = true) }
        : undefined,
    });

    out.push({
      icon: TerminalIcon,
      label: "Kernel debugging",
      description: "Debug session attached to the kernel — same story as test mode.",
      value: s.kernelDebug ? "ON — anti-cheats will refuse" : "Off",
      tone: s.kernelDebug ? "fail" : "ok",
      action: s.kernelDebug
        ? { label: "Turn off", onClick: () => (kernelDebugConfirmOpen = true) }
        : undefined,
    });

    return out;
  }

  function toneIcon(tone: "ok" | "warn" | "fail" | "unknown") {
    if (tone === "ok") return CheckCircle2;
    if (tone === "warn") return AlertTriangle;
    if (tone === "fail") return XCircle;
    return HelpCircle;
  }

  function toneClass(tone: "ok" | "warn" | "fail" | "unknown"): string {
    if (tone === "ok") return "text-success";
    if (tone === "warn") return "text-amber-600 dark:text-amber-400";
    if (tone === "fail") return "text-destructive";
    return "text-muted-foreground";
  }
</script>

<PageHeader title="Anti-cheat compatibility">
  {#snippet actions()}
    <Button variant="outline" onclick={refresh} disabled={loading || !canFetch}>
      <RefreshCw class={refreshing ? "animate-spin" : ""} />
      Refresh
    </Button>
  {/snippet}
  Live readout of the platform-security state that modern kernel anti-cheats care about. No
  changes happen here unless you click a fix.
</PageHeader>

{#if !isTauri()}
  <EmptyState>Browser preview — needs the built app.</EmptyState>
{:else if loading}
  <EmptyState loading>Probing platform security state…</EmptyState>
{:else if !acState}
  <EmptyState>State unavailable.</EmptyState>
{:else}
  {@const s = acState}
  {#if admin.checked && !admin.elevated}
    <InfoBanner tone="info">
      Reads work without admin. Fix buttons (bcdedit edits) require elevation — click the elevate
      button at the top to unlock them.
    </InfoBanner>
  {/if}

  <!-- Anti-cheat summary cards -->
  <SectionHeading title="Compatibility matrix" />
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
    {#each ANTI_CHEATS as ac (ac.id)}
      {@const issues = ac.evaluate(s)}
      {@const summary = summaryFor(issues)}
      {@const ToneIcon = toneIcon(summary)}
      <Card class="card-inset">
        <CardContent>
          <div class="flex items-start gap-3">
            <div
              class={[
                "size-10 rounded-full grid place-items-center shrink-0",
                summary === "ok"
                  ? "bg-success/15"
                  : summary === "fail"
                    ? "bg-destructive/15"
                    : "bg-amber-500/15",
              ]}
            >
              <ToneIcon class={["size-5", toneClass(summary)]} />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold">{ac.name}</span>
                {#if summary === "ok"}
                  <Badge variant="success">Ready</Badge>
                {:else if summary === "warn"}
                  <Badge variant="warning">Caveats</Badge>
                {:else}
                  <Badge variant="destructive">Won't launch</Badge>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">{ac.games}</p>
              {#if issues.length > 0}
                <ul class="mt-2 space-y-1 text-xs">
                  {#each issues as issue (issue.reason)}
                    <li class="flex items-start gap-1.5">
                      {#if issue.severity === "fail"}
                        <XCircle class="size-3.5 text-destructive shrink-0 mt-0.5" />
                      {:else}
                        <AlertTriangle class="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      {/if}
                      <span class="text-muted-foreground leading-relaxed">{issue.reason}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>

  <!-- Platform state details -->
  <SectionHeading title="Platform state" description="What the anti-cheats actually look at." />
  <div class="space-y-2 mb-6">
    {#each rows as row (row.label)}
      {@const RowIcon = row.icon}
      {@const ToneIcon = toneIcon(row.tone)}
      <Card class="card-inset">
        <CardContent>
          <div class="flex items-start gap-3">
            <div class="size-9 rounded-md bg-surface-2 border border-hairline grid place-items-center shrink-0">
              <RowIcon class="size-4 text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold">{row.label}</span>
                <span class={["text-xs font-medium inline-flex items-center gap-1", toneClass(row.tone)]}>
                  <ToneIcon class="size-3.5" />
                  {row.value}
                </span>
              </div>
              <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">{row.description}</p>
            </div>
            {#if row.action}
              <Button
                variant="outline"
                size="sm"
                onclick={row.action.onClick}
                disabled={busy || (admin.checked && !admin.elevated)}
              >
                {#if busy}<Loader2 class="size-3.5 animate-spin" />{/if}
                {row.action.label}
              </Button>
            {/if}
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>

  <InfoBanner tone="info">
    Build {s.buildNumber} · {s.is64bit ? "64-bit" : "32-bit"}. Anti-cheat policies change without
    warning — Riot tightening Vanguard's TPM/Secure Boot demands in 2024 was the most recent big
    move. Treat this matrix as a strong indicator, not gospel.
  </InfoBanner>
{/if}

<Dialog
  bind:open={testModeConfirmOpen}
  title="Disable Test Mode?"
  description="Runs `bcdedit /set testsigning off`. Requires a reboot to take effect. Unsigned drivers loaded today will refuse to load after the reboot — re-sign them or remove them first."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (testModeConfirmOpen = false)} disabled={busy}>
      Cancel
    </Button>
    <Button onclick={fixTestMode} disabled={busy}>
      {#if busy}<Loader2 class="animate-spin" />{/if}
      Disable
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={kernelDebugConfirmOpen}
  title="Disable kernel debugging?"
  description="Runs `bcdedit /debug off`. Reboot required. Only meaningful if you actually had a kernel debugger attached."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (kernelDebugConfirmOpen = false)} disabled={busy}>
      Cancel
    </Button>
    <Button onclick={fixKernelDebug} disabled={busy}>
      {#if busy}<Loader2 class="animate-spin" />{/if}
      Disable
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={uefiConfirmOpen}
  title="Reboot into UEFI firmware?"
  description="Restarts your PC directly into the BIOS/UEFI setup screen so you can enable Secure Boot. Save your work first."
>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (uefiConfirmOpen = false)}>Cancel</Button>
    <Button onclick={rebootToFirmware}>Reboot to UEFI</Button>
  {/snippet}
</Dialog>
