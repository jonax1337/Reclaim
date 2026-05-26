import { invoke, Channel } from "@tauri-apps/api/core";

export type PsResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
};

export type AppxPackage = {
  name: string;
  packageFullName: string;
  publisher: string;
  installed: boolean;
  provisioned: boolean;
};

export type SystemInfo = {
  productName: string;
  displayVersion: string;
  build: string;
  edition: string;
  username: string;
};

export type RegHive = "HKCU" | "HKLM" | "HKCR" | "HKU";
export type RegType = "DWORD" | "SZ" | "EXPANDSZ";

export type RegLocator = { hive: RegHive; path: string; name: string };
export type RegValue = RegLocator & { type: RegType; value: number | string };

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const raw = await invoke<{
    product_name: string;
    display_version: string;
    build: string;
    edition: string;
    username: string;
  }>("get_system_info");
  return {
    productName: raw.product_name,
    displayVersion: raw.display_version,
    build: raw.build,
    edition: raw.edition,
    username: raw.username,
  };
}

export async function isElevated(): Promise<boolean> {
  return invoke<boolean>("is_elevated");
}

export async function getAccentColor(): Promise<[number, number, number] | null> {
  return invoke<[number, number, number] | null>("get_accent_color");
}

export async function listInstalledAppx(): Promise<AppxPackage[]> {
  const raw = await invoke<
    Array<{
      name: string;
      package_full_name: string;
      publisher: string;
      installed: boolean;
      provisioned: boolean;
    }>
  >("list_installed_appx");
  return raw.map((p) => ({
    name: p.name,
    packageFullName: p.package_full_name,
    publisher: p.publisher,
    installed: p.installed,
    provisioned: p.provisioned,
  }));
}

export async function removeAppx(packageName: string, allUsers = true): Promise<PsResult> {
  return invoke<PsResult>("remove_appx", { packageName, allUsers });
}

export async function regRead(loc: RegLocator): Promise<string | number | null> {
  const v = await invoke<string | number | null>("reg_read", { locator: loc });
  return v;
}

/** Bulk variant: one IPC round-trip for the whole list. Backed by an async
 * Rust command that off-loads to spawn_blocking, so it doesn't pin the IPC
 * main thread the way 150 individual reg_read calls would. */
export async function regReadMany(
  locators: RegLocator[],
): Promise<Array<string | number | null>> {
  return invoke<Array<string | number | null>>("reg_read_many", { locators });
}

export async function regWrite(value: RegValue): Promise<void> {
  await invoke("reg_write", { value });
}

export async function regDeleteValue(loc: RegLocator): Promise<void> {
  await invoke("reg_delete_value", { locator: loc });
}

export async function runPowershell(script: string, elevated = false): Promise<PsResult> {
  return invoke<PsResult>("run_powershell", { script, elevated });
}

export async function createRestorePoint(description: string): Promise<PsResult> {
  return invoke<PsResult>("create_restore_point", { description });
}

export async function restartExplorer(): Promise<PsResult> {
  return invoke<PsResult>("restart_explorer");
}

// ─── Recovery: restart targets + System Restore points ─────────────────────

export type RestorePoint = {
  sequence_number: number;
  description: string;
  creation_time: string;
  restore_point_type: string;
  event_type: string;
};

export async function listRestorePoints(): Promise<RestorePoint[]> {
  return invoke<RestorePoint[]>("list_restore_points");
}

export async function revertToRestorePoint(sequenceNumber: number): Promise<string> {
  return invoke<string>("revert_to_restore_point", { sequenceNumber });
}

export type AdvancedRestartMode = "menu" | "firmware" | "safe-minimal" | "safe-network";

export type AdvancedRestartResult = {
  success: boolean;
  message: string;
  undo_hint: string;
};

export async function advancedRestart(mode: AdvancedRestartMode): Promise<AdvancedRestartResult> {
  return invoke<AdvancedRestartResult>("advanced_restart", { mode });
}

export type StartupApp = {
  id: string;
  name: string;
  command: string;
  source: string;
  enabled: boolean;
};

export type ServiceEntry = {
  name: string;
  displayName: string;
  status: string;
  startType: string;
  canPauseAndContinue: boolean;
};

export type ServiceStartType =
  | "Automatic"
  | "AutomaticDelayedStart"
  | "Manual"
  | "Disabled";
export type ServiceRunState = "Running" | "Stopped" | null;

export async function getHardwareInfo(): Promise<unknown> {
  return invoke<unknown>("get_hardware_info");
}

export async function listStartupApps(): Promise<StartupApp[]> {
  return invoke<StartupApp[]>("list_startup_apps");
}

export async function setStartupEnabled(id: string, enabled: boolean): Promise<void> {
  await invoke("set_startup_enabled", { id, enabled });
}

export async function listServices(): Promise<ServiceEntry[]> {
  const raw = await invoke<
    Array<{
      name: string;
      display_name: string;
      status: string;
      start_type: string;
      can_pause_and_continue: boolean;
    }>
  >("list_services");
  return raw.map((s) => ({
    name: s.name,
    displayName: s.display_name,
    status: s.status,
    startType: s.start_type,
    canPauseAndContinue: s.can_pause_and_continue,
  }));
}

export async function setService(
  name: string,
  startType: ServiceStartType,
  runState: ServiceRunState = null,
): Promise<void> {
  await invoke("set_service", { name, startType, runState });
}

export type WuUpdate = {
  id: string;
  revision: number;
  title: string;
  description: string;
  kbs: string;
  severity: string;
  sizeMb: number;
  categories: string;
  isDownloaded: boolean;
  isDriver: boolean;
  isOptional: boolean;
  rebootRequired: number;
};

export type WuInstallResult = {
  ok: boolean;
  installed: number;
  failed: number;
  rebootRequired: boolean;
  message: string;
};

export async function searchWindowsUpdates(driverOnly = false): Promise<WuUpdate[]> {
  const raw = await invoke<
    Array<{
      id: string;
      revision: number;
      title: string;
      description: string;
      kbs: string;
      severity: string;
      size_mb: number;
      categories: string;
      is_downloaded: boolean;
      is_driver: boolean;
      is_optional: boolean;
      reboot_required: number;
    }>
  >("search_windows_updates", { driverOnly });
  return raw.map((u) => ({
    id: u.id,
    revision: u.revision,
    title: u.title,
    description: u.description,
    kbs: u.kbs,
    severity: u.severity,
    sizeMb: u.size_mb,
    categories: u.categories,
    isDownloaded: u.is_downloaded,
    isDriver: u.is_driver,
    isOptional: u.is_optional,
    rebootRequired: u.reboot_required,
  }));
}

export async function openDriverSearch(
  vendor: "nvidia" | "amd" | "intel",
  gpuName: string,
  osName: string,
): Promise<void> {
  await invoke("open_driver_search", { vendor, gpuName, osName });
}

export type NvidiaDriverInfo = {
  version: string;
  name: string;
  releaseDate: string;
  osName: string;
  downloadUrl: string;
  detailsUrl: string;
  sizeMb: number | null;
};

export type DownloadedFile = {
  path: string;
  sizeBytes: number;
};

export async function lookupNvidiaDriver(gpuName: string): Promise<NvidiaDriverInfo> {
  const raw = await invoke<{
    version: string;
    name: string;
    release_date: string;
    os_name: string;
    download_url: string;
    details_url: string;
    size_mb: number | null;
  }>("lookup_nvidia_driver", { gpuName });
  return {
    version: raw.version,
    name: raw.name,
    releaseDate: raw.release_date,
    osName: raw.os_name,
    downloadUrl: raw.download_url,
    detailsUrl: raw.details_url,
    sizeMb: raw.size_mb,
  };
}

export async function downloadDriver(url: string, filename: string): Promise<DownloadedFile> {
  const raw = await invoke<{ path: string; size_bytes: number }>("download_driver", {
    url,
    filename,
  });
  return { path: raw.path, sizeBytes: raw.size_bytes };
}

export async function launchInstaller(path: string): Promise<void> {
  await invoke("launch_installer", { path });
}

export async function revealInExplorer(path: string): Promise<void> {
  await invoke("reveal_in_explorer", { path });
}

export type HostsBlock = {
  name: string;
  entryCount: number;
};

export type AdapterDns = {
  alias: string;
  description: string;
  ipv4: string[];
  ipv6: string[];
  isUp: boolean;
};

export async function readHosts(): Promise<string> {
  return invoke<string>("read_hosts");
}

export async function writeHosts(content: string): Promise<void> {
  await invoke("write_hosts", { content });
}

export async function hasHostsBackup(): Promise<boolean> {
  return invoke<boolean>("has_hosts_backup");
}

export async function restoreHostsBackup(): Promise<void> {
  await invoke("restore_hosts_backup");
}

export async function applyBlocklist(name: string, entries: string[]): Promise<number> {
  return invoke<number>("apply_blocklist", { name, entries });
}

export async function removeBlocklist(name: string): Promise<void> {
  await invoke("remove_blocklist", { name });
}

export async function listActiveBlocklists(): Promise<HostsBlock[]> {
  const raw = await invoke<Array<{ name: string; entry_count: number }>>(
    "list_active_blocklists",
  );
  return raw.map((b) => ({ name: b.name, entryCount: b.entry_count }));
}

export async function fetchBlocklist(url: string): Promise<string[]> {
  return invoke<string[]>("fetch_blocklist", { url });
}

export async function flushDns(): Promise<PsResult> {
  return invoke<PsResult>("flush_dns");
}

export async function getDnsServers(): Promise<AdapterDns[]> {
  const raw = await invoke<
    Array<{
      alias: string;
      description: string;
      ipv4: string[];
      ipv6: string[];
      is_up: boolean;
    }>
  >("get_dns_servers");
  return raw.map((a) => ({
    alias: a.alias,
    description: a.description,
    ipv4: a.ipv4 ?? [],
    ipv6: a.ipv6 ?? [],
    isUp: a.is_up,
  }));
}

export async function setDnsServers(
  adapter: string,
  ipv4: string[],
  ipv6: string[],
): Promise<void> {
  await invoke("set_dns_servers", { apply: { adapter, ipv4, ipv6 } });
}

export async function resetDnsServers(adapter: string): Promise<void> {
  await invoke("reset_dns_servers", { adapter });
}

export type FirewallBlock = {
  name: string;
  ruleCount: number;
  enabledCount: number;
};

export async function firewallListBlocks(): Promise<FirewallBlock[]> {
  const raw = await invoke<
    Array<{ name: string; rule_count: number; enabled_count: number }>
  >("firewall_list_blocks");
  return raw.map((r) => ({
    name: r.name,
    ruleCount: r.rule_count,
    enabledCount: r.enabled_count,
  }));
}

export async function firewallApplyBlock(
  name: string,
  programs: string[],
  remoteAddresses: string[],
): Promise<number> {
  return invoke<number>("firewall_apply_block", {
    apply: { name, programs, remote_addresses: remoteAddresses },
  });
}

export async function firewallRemoveBlock(name: string): Promise<void> {
  await invoke("firewall_remove_block", { name });
}

export type DriverPackage = {
  publishedName: string;
  originalName: string;
  provider: string;
  className: string;
  classGuid: string;
  version: string;
  date: string;
  signer: string;
};

export async function listDriverPackages(classFilter?: string): Promise<DriverPackage[]> {
  const raw = await invoke<
    Array<{
      published_name: string;
      original_name: string;
      provider: string;
      class_name: string;
      class_guid: string;
      version: string;
      date: string;
      signer: string;
    }>
  >("list_driver_packages", { classFilter: classFilter ?? null });
  return raw.map((d) => ({
    publishedName: d.published_name,
    originalName: d.original_name,
    provider: d.provider,
    className: d.class_name,
    classGuid: d.class_guid,
    version: d.version,
    date: d.date,
    signer: d.signer,
  }));
}

export async function deleteDriverPackage(
  publishedName: string,
  uninstall: boolean,
): Promise<void> {
  await invoke("delete_driver_package", { publishedName, uninstall });
}

export async function setDohTemplate(
  serverIp: string,
  template: string,
  allowFallback = false,
): Promise<void> {
  await invoke("set_doh_template", {
    apply: { server_ip: serverIp, template, allow_fallback: allowFallback },
  });
}

export type WingetVersion = { available: boolean; version: string };

export async function wingetAvailable(): Promise<boolean> {
  return invoke<boolean>("winget_available");
}

export async function wingetVersion(): Promise<WingetVersion> {
  return invoke<WingetVersion>("winget_version");
}

export async function wingetListInstalled(): Promise<string> {
  return invoke<string>("winget_list_installed");
}

export async function wingetListUpgradable(): Promise<string> {
  return invoke<string>("winget_list_upgradable");
}

export async function wingetInstall(id: string, scopeUser = false): Promise<PsResult> {
  return invoke<PsResult>("winget_install", { id, scopeUser });
}

export async function wingetUninstall(id: string): Promise<PsResult> {
  return invoke<PsResult>("winget_uninstall", { id });
}

export async function wingetUpgrade(id: string): Promise<PsResult> {
  return invoke<PsResult>("winget_upgrade", { id });
}

export type WingetOp = "install" | "uninstall" | "upgrade";

export async function wingetRunStream(
  op: WingetOp,
  id: string,
  scopeUser: boolean,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("winget_run_stream", { op, id, scopeUser, onEvent: channel });
}

export type MaintenanceOp =
  // Repair
  | "sfc"
  | "dism-check"
  | "dism-scan"
  | "dism-restore"
  | "chkdsk-scan"
  | "chkdsk-spotfix"
  // Cleanup
  | "winsxs-cleanup"
  | "winsxs-resetbase"
  | "temp-cleanup"
  // Defender
  | "defender-sig-update"
  | "defender-quick-scan"
  | "defender-full-scan"
  | "defender-offline-scan"
  | "defender-status"
  // Reset
  | "wu-components-reset"
  | "spooler-reset"
  | "icon-cache-reset"
  | "font-cache-reset"
  | "store-reset"
  // Network
  | "network-reset"
  | "firewall-reset";

export type StreamEvent = {
  /** stdout/stderr/info: legacy line-oriented (used by winget).
   *  bytes: base64-encoded raw PTY output (maintenance — pipe straight to xterm).
   *  exit: data is the numeric exit code as a string. */
  kind: "stdout" | "stderr" | "exit" | "info" | "bytes";
  data: string;
  /** Legacy CR-flush marker for line-oriented streams. */
  progress?: boolean;
};

export type PowerPlan = {
  guid: string;
  name: string;
  active: boolean;
};

export async function maintenanceRunStream(
  taskId: string,
  op: MaintenanceOp,
  cols: number,
  rows: number,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("maintenance_run_stream", {
    taskId,
    op,
    cols,
    rows,
    onEvent: channel,
  });
}

export async function unblockFilesStream(
  taskId: string,
  target: string,
  recursive: boolean,
  cols: number,
  rows: number,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("unblock_files_stream", {
    taskId,
    target,
    recursive,
    cols,
    rows,
    onEvent: channel,
  });
}

export async function maintenancePtyResize(
  taskId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("maintenance_pty_resize", { taskId, cols, rows });
}

export async function maintenancePtyKill(taskId: string): Promise<void> {
  await invoke("maintenance_pty_kill", { taskId });
}

export async function listPowerPlans(): Promise<PowerPlan[]> {
  return invoke<PowerPlan[]>("list_power_plans");
}

export async function setPowerPlan(guid: string): Promise<void> {
  await invoke("set_power_plan", { guid });
}

export async function unlockUltimatePerformance(): Promise<string> {
  return invoke<string>("unlock_ultimate_performance");
}

export async function deletePowerPlan(guid: string): Promise<void> {
  await invoke("delete_power_plan", { guid });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}

export async function isPortable(): Promise<boolean> {
  return invoke<boolean>("is_portable");
}

export async function appDataDir(): Promise<string> {
  return invoke<string>("app_data_dir");
}

export type LogLine = {
  ts: number;
  level: string;
  action: string;
  target: string;
  message: string;
  details?: string;
};

export async function logAppend(entry: LogLine): Promise<void> {
  await invoke("log_append", { entry });
}

/** Read a file from `<app_data_dir>/<name>`. Returns null if it doesn't exist. */
export async function readAppFile(name: string): Promise<string | null> {
  return invoke<string | null>("read_app_file", { name });
}

/** Atomically write to `<app_data_dir>/<name>`. */
export async function writeAppFile(name: string, content: string): Promise<void> {
  await invoke("write_app_file", { name, content });
}

/** Read the whole activity.log file (JSON-lines). Returns "" if missing. */
export async function readActivityLog(): Promise<string> {
  return invoke<string>("read_activity_log");
}

/** Returns a path → base64 PNG map. Paths whose icons can't be extracted are omitted. */
export async function getFileIcons(paths: string[]): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_file_icons", { paths });
}

/** Returns an AppX-pattern → base64 PNG map. Patterns whose package isn't installed
 * (or has no resolvable logo) are omitted. */
export async function getAppxIcons(patterns: string[]): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_appx_icons", { patterns });
}

export async function openProperties(command: string): Promise<void> {
  await invoke("open_properties", { command });
}

/** Batch-resolve registry command lines to actual file paths. Skips entries
 * whose path can't be resolved (e.g. orphaned Run keys, UWP monikers). */
export async function resolveCommands(commands: string[]): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("resolve_commands", { commands });
}

export type OneDriveStatus = {
  installed: boolean;
  processRunning: boolean;
  syncFolder: string | null;
  redirectedDocuments: string | null;
  redirectedDesktop: string | null;
  redirectedPictures: string | null;
};

export async function onedriveDetect(): Promise<OneDriveStatus> {
  const raw = await invoke<{
    installed: boolean;
    process_running: boolean;
    sync_folder: string | null;
    redirected_documents: string | null;
    redirected_desktop: string | null;
    redirected_pictures: string | null;
  }>("onedrive_detect");
  return {
    installed: raw.installed,
    processRunning: raw.process_running,
    syncFolder: raw.sync_folder,
    redirectedDocuments: raw.redirected_documents,
    redirectedDesktop: raw.redirected_desktop,
    redirectedPictures: raw.redirected_pictures,
  };
}

export async function onedriveBackup(
  targetDir: string,
  items: string[],
): Promise<PsResult> {
  return invoke<PsResult>("onedrive_backup", { req: { target_dir: targetDir, items } });
}

export async function onedriveUninstall(opts: {
  disablePolicy: boolean;
  removeLeftovers: boolean;
}): Promise<PsResult> {
  return invoke<PsResult>("onedrive_uninstall", {
    req: { disable_policy: opts.disablePolicy, remove_leftovers: opts.removeLeftovers },
  });
}

export async function launchCleanmgr(): Promise<void> {
  await invoke("launch_cleanmgr");
}

export async function launchMemoryDiagnostic(): Promise<void> {
  await invoke("launch_memory_diagnostic");
}

export type DefenderStatus = {
  realtimeProtection: boolean;
  cloudProtection: boolean;
  sampleSubmission: boolean;
  puaProtection: boolean;
  networkProtection: boolean;
  controlledFolderAccess: boolean;
  tamperProtection: boolean;
  smartscreenExplorer: boolean;
  smartscreenEdge: boolean;
  smartscreenStore: boolean;
  serviceRunning: boolean;
  managedByPolicy: boolean;
};

export type DefenderSetting =
  | "realtime_protection"
  | "cloud_protection"
  | "sample_submission"
  | "pua_protection"
  | "network_protection"
  | "controlled_folder_access"
  | "smartscreen_explorer"
  | "smartscreen_edge"
  | "smartscreen_store";

export type DefenderExclusionKind = "path" | "process" | "extension";

export type DefenderExclusions = {
  paths: string[];
  processes: string[];
  extensions: string[];
};

export async function defenderStatus(): Promise<DefenderStatus> {
  const raw = await invoke<{
    realtime_protection: boolean;
    cloud_protection: boolean;
    sample_submission: boolean;
    pua_protection: boolean;
    network_protection: boolean;
    controlled_folder_access: boolean;
    tamper_protection: boolean;
    smartscreen_explorer: boolean;
    smartscreen_edge: boolean;
    smartscreen_store: boolean;
    service_running: boolean;
    managed_by_policy: boolean;
  }>("defender_status");
  return {
    realtimeProtection: raw.realtime_protection,
    cloudProtection: raw.cloud_protection,
    sampleSubmission: raw.sample_submission,
    puaProtection: raw.pua_protection,
    networkProtection: raw.network_protection,
    controlledFolderAccess: raw.controlled_folder_access,
    tamperProtection: raw.tamper_protection,
    smartscreenExplorer: raw.smartscreen_explorer,
    smartscreenEdge: raw.smartscreen_edge,
    smartscreenStore: raw.smartscreen_store,
    serviceRunning: raw.service_running,
    managedByPolicy: raw.managed_by_policy,
  };
}

export async function defenderSetSetting(
  setting: DefenderSetting,
  enabled: boolean,
): Promise<void> {
  await invoke("defender_set_setting", { setting, enabled });
}

export async function defenderListExclusions(): Promise<DefenderExclusions> {
  return invoke<DefenderExclusions>("defender_list_exclusions");
}

export async function defenderAddExclusion(
  kind: DefenderExclusionKind,
  value: string,
): Promise<void> {
  await invoke("defender_add_exclusion", { req: { kind, value } });
}

export async function defenderRemoveExclusion(
  kind: DefenderExclusionKind,
  value: string,
): Promise<void> {
  await invoke("defender_remove_exclusion", { req: { kind, value } });
}

export type ScheduledTask = {
  path: string;
  name: string;
  state: string;
  author: string;
  description: string;
  lastRun: string | null;
  lastResult: number;
  nextRun: string | null;
  triggers: string;
  actions: string;
};

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const raw = await invoke<
    Array<{
      path: string;
      name: string;
      state: string;
      author: string;
      description: string;
      last_run: string | null;
      last_result: number;
      next_run: string | null;
      triggers: string;
      actions: string;
    }>
  >("list_scheduled_tasks");
  return raw.map((t) => ({
    path: t.path,
    name: t.name,
    state: t.state,
    author: t.author,
    description: t.description,
    lastRun: t.last_run,
    lastResult: t.last_result,
    nextRun: t.next_run,
    triggers: t.triggers,
    actions: t.actions,
  }));
}

export async function setScheduledTask(
  path: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  await invoke("set_scheduled_task", { task: { path, name }, enabled });
}

export async function runScheduledTask(path: string, name: string): Promise<void> {
  await invoke("run_scheduled_task", { task: { path, name } });
}

export async function deleteScheduledTask(path: string, name: string): Promise<void> {
  await invoke("delete_scheduled_task", { task: { path, name } });
}

export type RecallStatus = {
  dataPresent: boolean;
  dataPath: string | null;
  sizeBytes: number;
  snapshotCount: number;
  appxInstalled: boolean;
  policyDisabled: boolean;
};

export async function recallStatus(): Promise<RecallStatus> {
  const raw = await invoke<{
    data_present: boolean;
    data_path: string | null;
    size_bytes: number;
    snapshot_count: number;
    appx_installed: boolean;
    policy_disabled: boolean;
  }>("recall_status");
  return {
    dataPresent: raw.data_present,
    dataPath: raw.data_path,
    sizeBytes: raw.size_bytes,
    snapshotCount: raw.snapshot_count,
    appxInstalled: raw.appx_installed,
    policyDisabled: raw.policy_disabled,
  };
}

export async function recallWipe(
  alsoRemoveAppx: boolean,
  alsoSetPolicy: boolean,
): Promise<PsResult> {
  return invoke<PsResult>("recall_wipe", {
    alsoRemoveAppx,
    alsoSetPolicy,
  });
}

export type ActivationStatus = {
  name: string;
  description: string;
  licenseStatus: number;
  licenseStatusText: string;
  channel: string;
  partialKey: string;
  gracePeriodMinutes: number;
  detected: boolean;
};

export async function getActivationStatus(): Promise<ActivationStatus> {
  const raw = await invoke<{
    name: string;
    description: string;
    license_status: number;
    license_status_text: string;
    channel: string;
    partial_key: string;
    grace_period_minutes: number;
    detected: boolean;
  }>("get_activation_status");
  return {
    name: raw.name,
    description: raw.description,
    licenseStatus: raw.license_status,
    licenseStatusText: raw.license_status_text,
    channel: raw.channel,
    partialKey: raw.partial_key,
    gracePeriodMinutes: raw.grace_period_minutes,
    detected: raw.detected,
  };
}

export async function launchActivationScript(): Promise<void> {
  await invoke("launch_activation_script");
}

export type UnattendRegistryTweak = {
  hive: "HKCU" | "HKLM" | "HKCR" | "HKU";
  path: string;
  name: string;
  type: "DWORD" | "SZ" | "EXPANDSZ";
  value: number | string;
};

export type UnattendConfig = {
  language: string;
  keyboard: string;
  system_locale: string;
  user_locale: string;
  timezone: string;
  geo_id: string;
  username: string;
  password: string | null;
  autologon: boolean;
  computer_name: string;
  organization: string;
  edition: string | null;
  product_key: string | null;
  bypass_tpm_check: boolean;
  bypass_secure_boot_check: boolean;
  bypass_ram_check: boolean;
  bypass_storage_check: boolean;
  bypass_cpu_check: boolean;
  bypass_network_requirement: boolean;
  skip_ms_account: boolean;
  skip_eula: boolean;
  skip_oobe_privacy: boolean;
  disable_telemetry: boolean;
  disable_advertising_id: boolean;
  disable_location: boolean;
  disable_tailored_experiences: boolean;
  disable_find_my_device: boolean;
  disable_inking_typing: boolean;
  disable_diagnostic_data: boolean;
  disable_cortana: boolean;
  debloat_appx_patterns: string[];
  registry_tweaks: UnattendRegistryTweak[];
  /** Custom commands routed by hook into the right unattend pass. */
  custom_commands?: Array<{
    hook: "windowsPE" | "specialize" | "oobeSystem" | "setupcomplete" | "firstlogon";
    command: string;
    description: string;
  }>;
  /** Winget IDs installed silently via setupcomplete.cmd after OOBE. */
  winget_apps?: string[];
  /** Opt-in fully-automated disk wipe (UEFI/GPT layout). When set, Setup
   *  installs without asking the user where Windows goes. */
  disk_auto_setup?: { disk_number: number } | null;
};

export type Win11Edition = { key: string; label: string };

export async function generateAutounattendXml(config: UnattendConfig): Promise<string> {
  return invoke<string>("generate_autounattend_xml", { config });
}

/** Generate the setupcomplete.cmd body that goes alongside autounattend.xml
 * under \$OEM$\$$\Setup\Scripts\ on the install medium. Returns an empty
 * string if the config has no debloat patterns (in which case the caller
 * should skip writing the file). */
export async function generateSetupCompleteCmd(config: UnattendConfig): Promise<string> {
  return invoke<string>("generate_setupcomplete_cmd", { config });
}

export async function saveAutounattendXml(path: string, xml: string): Promise<void> {
  await invoke("save_autounattend_xml", { path, xml });
}

export async function listWin11Editions(): Promise<Win11Edition[]> {
  return invoke<Win11Edition[]>("list_win11_editions");
}

export type IsoTools = {
  oscdimgPath: string | null;
  dismAvailable: boolean;
  ready: boolean;
  adkHint: string;
};

export async function isoCheckTools(): Promise<IsoTools> {
  const raw = await invoke<{
    oscdimg_path: string | null;
    dism_available: boolean;
    ready: boolean;
    adk_hint: string;
  }>("iso_check_tools");
  return {
    oscdimgPath: raw.oscdimg_path,
    dismAvailable: raw.dism_available,
    ready: raw.ready,
    adkHint: raw.adk_hint,
  };
}

export async function downloadAdkSetup(): Promise<string> {
  return invoke<string>("download_adk_setup");
}

export async function launchAdkInstaller(path: string): Promise<void> {
  await invoke("launch_adk_installer", { path });
}

export type AdkDownloadProgress = { downloaded: number; total: number };

export async function isoBuild(
  taskId: string,
  inputIso: string,
  outputIso: string,
  autounattendXml: string,
  setupcompleteCmd: string | null,
  cols: number,
  rows: number,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("iso_build", {
    taskId,
    req: {
      input_iso: inputIso,
      output_iso: outputIso,
      autounattend_xml: autounattendXml,
      setupcomplete_cmd: setupcompleteCmd,
    },
    cols,
    rows,
    onEvent: channel,
  });
}

/* ─────────────────────────────── USB flasher ──────────────────────────────── */

export type UsbDrive = {
  diskNumber: number;
  friendlyName: string;
  model: string;
  serialNumber: string;
  sizeBytes: number;
  busType: string;
  partitionStyle: string;
  isSystem: boolean;
  isBoot: boolean;
  isOffline: boolean;
};

export async function listUsbDrives(): Promise<UsbDrive[]> {
  const raw = await invoke<
    Array<{
      disk_number: number;
      friendly_name: string;
      model: string;
      serial_number: string;
      size_bytes: number;
      bus_type: string;
      partition_style: string;
      is_system: boolean;
      is_boot: boolean;
      is_offline: boolean;
    }>
  >("list_usb_drives");
  return raw.map((d) => ({
    diskNumber: d.disk_number,
    friendlyName: d.friendly_name,
    model: d.model,
    serialNumber: d.serial_number,
    sizeBytes: d.size_bytes,
    busType: d.bus_type,
    partitionStyle: d.partition_style,
    isSystem: d.is_system,
    isBoot: d.is_boot,
    isOffline: d.is_offline,
  }));
}

export async function usbFlashIso(
  taskId: string,
  isoPath: string,
  diskNumber: number,
  autounattendXml: string | null,
  setupcompleteCmd: string | null,
  cols: number,
  rows: number,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("usb_flash_iso", {
    taskId,
    req: {
      iso_path: isoPath,
      disk_number: diskNumber,
      autounattend_xml: autounattendXml,
      setupcomplete_cmd: setupcompleteCmd,
    },
    cols,
    rows,
    onEvent: channel,
  });
}

/* ───────────────────────── Background service / persistence ───────────────────── */

export type PowerState = {
  onBattery: boolean;
  percent: number;
  hasBattery: boolean;
};

export async function getPowerState(): Promise<PowerState> {
  const raw = await invoke<{ on_battery: boolean; percent: number; has_battery: boolean }>(
    "get_power_state",
  );
  return {
    onBattery: raw.on_battery,
    percent: raw.percent,
    hasBattery: raw.has_battery,
  };
}

export async function recentHotfixInstalledSince(hours: number): Promise<boolean> {
  return invoke<boolean>("recent_hotfix_installed_since", { hours });
}

export async function serviceSetInterval(hours: number): Promise<void> {
  await invoke("service_set_interval", { hours });
}

export async function serviceGetInterval(): Promise<number> {
  return invoke<number>("service_get_interval");
}

export async function serviceSetKeepInTray(enabled: boolean): Promise<void> {
  await invoke("service_set_keep_in_tray", { enabled });
}

export async function serviceTriggerNow(): Promise<void> {
  await invoke("service_trigger_now");
}

export type PersistenceTaskStatus = {
  installed: boolean;
  state?: string | null;
  lastRun?: string | null;
  lastResult?: number | null;
  nextRun?: string | null;
  tweakCount: number;
};

/** Install (or replace) the singleton `\Reclaim\Persist-Current` SYSTEM task
 *  with the given admin-tweak id list. Empty list calls uninstall. */
export async function persistenceInstallTask(
  tweakIds: string[],
  intervalHours: number,
): Promise<void> {
  await invoke("persistence_install_task", { tweakIds, intervalHours });
}

export async function persistenceUninstallTask(): Promise<void> {
  await invoke("persistence_uninstall_task");
}

export async function persistenceTaskStatus(): Promise<PersistenceTaskStatus> {
  return invoke<PersistenceTaskStatus>("persistence_task_status");
}

export async function persistenceRunTaskNow(): Promise<void> {
  await invoke("persistence_run_task_now");
}

/** Remove every leftover v0.15.1 per-profile `\Reclaim\Persist-<id>` task.
 *  Returns the count of tasks actually removed. Requires elevation. */
export async function persistenceCleanupLegacyTasks(): Promise<number> {
  return invoke<number>("persistence_cleanup_legacy_tasks");
}

/* ───────────────────────── Developer features (Block A) ───────────────────── */

export type DevFeature = {
  name: string;
  displayName: string;
  category: "wsl" | "hyperv" | "sandbox" | string;
  description: string;
  state: "Enabled" | "Disabled" | "EnablePending" | "DisablePending" | "Unknown" | string;
};

export type WslDistro = {
  name: string;
  state: string;
  version: number;
  default: boolean;
};

export type DevDriveInfo = {
  supported: boolean;
  build: number;
  note: string;
};

export async function listOptionalFeatures(): Promise<DevFeature[]> {
  const raw = await invoke<
    Array<{
      name: string;
      display_name: string;
      category: string;
      description: string;
      state: string;
    }>
  >("list_optional_features");
  return raw.map((f) => ({
    name: f.name,
    displayName: f.display_name,
    category: f.category,
    description: f.description,
    state: f.state,
  }));
}

export async function setOptionalFeatureStream(
  taskId: string,
  name: string,
  enable: boolean,
  cols: number,
  rows: number,
  onEvent: (e: StreamEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("set_optional_feature_stream", {
    taskId,
    name,
    enable,
    cols,
    rows,
    onEvent: channel,
  });
}

export async function listWslDistros(): Promise<WslDistro[]> {
  return invoke<WslDistro[]>("list_wsl_distros");
}

export async function devDriveInfo(): Promise<DevDriveInfo> {
  return invoke<DevDriveInfo>("dev_drive_info");
}

export async function installWindowsUpdates(ids: string[]): Promise<WuInstallResult> {
  const r = await invoke<{
    ok: boolean;
    installed: number;
    failed: number;
    reboot_required: boolean;
    message: string;
  }>("install_windows_updates", { ids });
  return {
    ok: r.ok,
    installed: r.installed,
    failed: r.failed,
    rebootRequired: r.reboot_required,
    message: r.message,
  };
}

export type WuProgressEvent =
  | { t: "queued"; id: string; index: number; total: number; title: string }
  | { t: "download_start"; total: number }
  | { t: "download_progress"; percent: number; currentIndex: number; currentPercent: number }
  | { t: "download_done"; id: string; index: number; ok: boolean; code: number }
  | { t: "install_start"; total: number }
  | { t: "install_progress"; percent: number; currentIndex: number; currentPercent: number }
  | { t: "install_done"; id: string; index: number; ok: boolean; code: number }
  | { t: "finished"; installed: number; failed: number; rebootRequired: boolean; message: string }
  | { t: "info"; message: string }
  | { t: "error"; message: string };

export async function installWindowsUpdatesStream(
  ids: string[],
  onEvent: (e: WuProgressEvent) => void,
): Promise<number> {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (e) => {
    if (e.kind !== "stdout") return;
    const line = e.data.trim();
    if (!line) return;
    try {
      const parsed = JSON.parse(line) as WuProgressEvent;
      if (parsed && typeof parsed === "object" && "t" in parsed) onEvent(parsed);
    } catch {
      // non-JSON stdout (e.g. PowerShell warnings) — ignore.
    }
  };
  return invoke<number>("install_windows_updates_stream", { ids, onEvent: channel });
}

/* ─────────────────────────  Gaming session  ──────────────────────────── */

export type ProcessSnapshot = {
  name: string;
  running: boolean;
  commandLine: string | null;
};

export type ServiceSnapshot = {
  name: string;
  startType: string;
  status: string;
};

export type SessionSnapshot = {
  powerPlanGuid: string;
  defenderRealtime: boolean;
  processes: ProcessSnapshot[];
  services: ServiceSnapshot[];
};

export type SessionKillResult = {
  name: string;
  success: boolean;
  stderr: string;
};

export type SessionServiceResult = {
  name: string;
  success: boolean;
  stderr: string;
};

export type SessionWhitelist = {
  processes: string[];
  services: string[];
};

type RawProcessSnapshot = { name: string; running: boolean; command_line: string | null };
type RawServiceSnapshot = { name: string; start_type: string; status: string };
type RawSessionSnapshot = {
  power_plan_guid: string;
  defender_realtime: boolean;
  processes: RawProcessSnapshot[];
  services: RawServiceSnapshot[];
};

export async function sessionSnapshot(): Promise<SessionSnapshot> {
  const raw = await invoke<RawSessionSnapshot>("session_snapshot");
  return {
    powerPlanGuid: raw.power_plan_guid,
    defenderRealtime: raw.defender_realtime,
    processes: raw.processes.map((p) => ({
      name: p.name,
      running: p.running,
      commandLine: p.command_line,
    })),
    services: raw.services.map((s) => ({
      name: s.name,
      startType: s.start_type,
      status: s.status,
    })),
  };
}

export async function sessionKillProcesses(names: string[]): Promise<SessionKillResult[]> {
  return invoke<SessionKillResult[]>("session_kill_processes", { names });
}

export async function sessionSetPowerPlan(guid: string): Promise<void> {
  await invoke("session_set_power_plan", { guid });
}

export async function sessionSetDefenderRealtime(enabled: boolean): Promise<void> {
  await invoke("session_set_defender_realtime", { enabled });
}

export async function sessionStopServices(names: string[]): Promise<SessionServiceResult[]> {
  return invoke<SessionServiceResult[]>("session_stop_services", { names });
}

export async function sessionRestoreServices(
  items: ServiceSnapshot[],
): Promise<SessionServiceResult[]> {
  // Rust expects snake_case fields on the snapshot wire type.
  const wire = items.map((s) => ({
    name: s.name,
    start_type: s.startType,
    status: s.status,
  }));
  return invoke<SessionServiceResult[]>("session_restore_services", { items: wire });
}

export async function sessionWhitelist(): Promise<SessionWhitelist> {
  return invoke<SessionWhitelist>("session_whitelist");
}

/* ─────────────────────────  Anti-cheat compat  ───────────────────────── */

export type AntiCheatState = {
  secureBoot: boolean | null;
  tpmPresent: boolean | null;
  tpmReady: boolean | null;
  tpmSpecVersion: string | null;
  vbsRunning: boolean;
  hvciRunning: boolean;
  testMode: boolean;
  kernelDebug: boolean;
  is64bit: boolean;
  buildNumber: number;
};

type RawAntiCheatState = {
  secure_boot: boolean | null;
  tpm_present: boolean | null;
  tpm_ready: boolean | null;
  tpm_spec_version: string | null;
  vbs_running: boolean;
  hvci_running: boolean;
  test_mode: boolean;
  kernel_debug: boolean;
  is_64bit: boolean;
  build_number: number;
};

export async function acGetState(): Promise<AntiCheatState> {
  const raw = await invoke<RawAntiCheatState>("ac_get_state");
  return {
    secureBoot: raw.secure_boot,
    tpmPresent: raw.tpm_present,
    tpmReady: raw.tpm_ready,
    tpmSpecVersion: raw.tpm_spec_version,
    vbsRunning: raw.vbs_running,
    hvciRunning: raw.hvci_running,
    testMode: raw.test_mode,
    kernelDebug: raw.kernel_debug,
    is64bit: raw.is_64bit,
    buildNumber: raw.build_number,
  };
}

export async function acDisableTestMode(): Promise<void> {
  await invoke("ac_disable_test_mode");
}

export async function acDisableKernelDebug(): Promise<void> {
  await invoke("ac_disable_kernel_debug");
}

/* ─────────────────────────  NIC tuning  ──────────────────────────────── */

export type NicAdapter = {
  name: string;
  interfaceDescription: string;
  status: string;
  linkSpeed: string;
  macAddress: string;
  mediaType: string;
};

export type NicProperty = {
  registryKeyword: string;
  displayName: string;
  registryValue: string;
  displayValue: string | null;
  defaultValue: string | null;
  validValues: string[];
  validDisplayValues: string[];
};

type RawNicAdapter = {
  name: string;
  interface_description: string;
  status: string;
  link_speed: string;
  mac_address: string;
  media_type: string;
};

type RawNicProperty = {
  registry_keyword: string;
  display_name: string;
  registry_value: string;
  display_value: string | null;
  default_value: string | null;
  valid_values: string[];
  valid_display_values: string[];
};

export async function nicListAdapters(): Promise<NicAdapter[]> {
  const raw = await invoke<RawNicAdapter[]>("nic_list_adapters");
  return raw.map((a) => ({
    name: a.name,
    interfaceDescription: a.interface_description,
    status: a.status,
    linkSpeed: a.link_speed,
    macAddress: a.mac_address,
    mediaType: a.media_type,
  }));
}

export async function nicListProperties(adapterName: string): Promise<NicProperty[]> {
  const raw = await invoke<RawNicProperty[]>("nic_list_properties", { adapterName });
  return raw.map((p) => ({
    registryKeyword: p.registry_keyword,
    displayName: p.display_name,
    registryValue: p.registry_value,
    displayValue: p.display_value,
    defaultValue: p.default_value,
    validValues: p.valid_values,
    validDisplayValues: p.valid_display_values,
  }));
}

export async function nicSetProperty(
  adapterName: string,
  registryKeyword: string,
  registryValue: string,
): Promise<void> {
  await invoke("nic_set_property", { adapterName, registryKeyword, registryValue });
}

export async function nicResetProperty(adapterName: string, registryKeyword: string): Promise<void> {
  await invoke("nic_reset_property", { adapterName, registryKeyword });
}

export async function nicRestart(adapterName: string): Promise<void> {
  await invoke("nic_restart", { adapterName });
}

/* ─────────────────────────  MSI mode manager  ───────────────────────── */

export type MsiDevice = {
  instanceId: string;
  friendlyName: string;
  class: string;
  manufacturer: string;
  status: string;
  present: boolean;
  msiSupported: number | null;
  messageNumberLimit: number | null;
  hasInterruptProps: boolean;
};

type RawMsiDevice = {
  instance_id: string;
  friendly_name: string;
  class: string;
  manufacturer: string;
  status: string;
  present: boolean;
  msi_supported: number | null;
  message_number_limit: number | null;
  has_interrupt_props: boolean;
};

export async function msiListDevices(): Promise<MsiDevice[]> {
  const raw = await invoke<RawMsiDevice[]>("msi_list_devices");
  return raw.map((d) => ({
    instanceId: d.instance_id,
    friendlyName: d.friendly_name,
    class: d.class,
    manufacturer: d.manufacturer,
    status: d.status,
    present: d.present,
    msiSupported: d.msi_supported,
    messageNumberLimit: d.message_number_limit,
    hasInterruptProps: d.has_interrupt_props,
  }));
}

export async function msiSetSupported(instanceId: string, enabled: boolean): Promise<void> {
  await invoke("msi_set_supported", { instanceId, enabled });
}

export async function msiSetMessageLimit(instanceId: string, limit: number | null): Promise<void> {
  await invoke("msi_set_message_limit", { instanceId, limit });
}
