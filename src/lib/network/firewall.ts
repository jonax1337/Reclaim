export type FirewallBuiltin = {
  id: string;
  name: string;
  description: string;
  programs: string[];
  remoteAddresses: string[];
};

// Programs (under %SystemRoot%) that Windows uses for telemetry collection
// and upload. Blocking these via Windows Firewall stops outbound network
// communication at the OS level, regardless of hosts file / DNS state.
//
// Paths are absolute and locked to %SystemRoot% / %ProgramFiles% — we don't
// allow user paths so the rules are stable across machines.
const TELEMETRY_PROGRAMS: string[] = [
  "C:\\Windows\\System32\\CompatTelRunner.exe",
  "C:\\Windows\\System32\\DeviceCensus.exe",
  "C:\\Windows\\System32\\dmclient.exe",
  "C:\\Windows\\System32\\dnscacheugc.exe",
  "C:\\Windows\\System32\\wermgr.exe",
  "C:\\Windows\\System32\\WerFault.exe",
  "C:\\Windows\\System32\\TelnetService.exe",
];

// Published Microsoft telemetry endpoint IPs (Vortex / SettingsFE / Watson).
// These rotate over time but are stable enough to be useful as a defense in
// depth layer. Users can re-apply at any time to refresh.
//
// Source: MVPS / W10Privacy reference list, cross-checked against current
// vortex-win.data.microsoft.com resolutions in 2025.
const TELEMETRY_IPS: string[] = [
  "13.66.56.243",
  "13.68.31.193",
  "13.68.82.8",
  "13.68.115.44",
  "13.74.179.117",
  "13.78.130.220",
  "13.78.232.226",
  "13.107.4.50",
  "13.107.5.88",
  "20.42.65.85",
  "20.44.86.43",
  "23.99.32.7",
  "40.77.228.13",
  "40.77.228.47",
  "40.77.228.87",
  "40.77.232.101",
  "40.79.85.125",
  "51.105.13.79",
  "51.105.69.111",
  "52.158.208.111",
  "52.183.114.173",
  "52.184.221.185",
  "64.4.54.32",
  "65.39.117.230",
  "65.52.108.183",
  "65.55.252.43",
  "65.55.252.63",
  "65.55.252.92",
  "65.55.252.93",
  "65.55.252.190",
  "65.55.252.202",
  "131.253.40.37",
  "134.170.30.202",
  "157.56.91.77",
  "157.56.106.184",
  "157.56.106.185",
  "157.56.106.189",
  "204.79.197.200",
];

// Microsoft "Connected Experiences" / advertising IPs. Slightly more
// aggressive — also blocks Start menu web content, Bing weather, etc.
const ADS_IPS: string[] = [
  "13.107.21.200",
  "20.190.169.20",
  "20.190.169.21",
  "20.231.106.42",
  "204.79.197.219",
  "204.79.197.222",
];

// Office "Office Telemetry Agent" / experience IPs. Skip if Office is in use.
const OFFICE_TELEMETRY_IPS: string[] = [
  "13.107.18.11",
  "13.107.42.11",
  "52.108.0.0/14",
];

export const FIREWALL_BUILTINS: FirewallBuiltin[] = [
  {
    id: "ms-telemetry-programs",
    name: "MS Telemetry programs",
    description:
      "Blocks outbound connections from Windows telemetry/diagnostics executables (CompatTelRunner, DeviceCensus, dmclient, wermgr, ...). Safe on most setups.",
    programs: TELEMETRY_PROGRAMS,
    remoteAddresses: [],
  },
  {
    id: "ms-telemetry-ips",
    name: "MS Telemetry IPs",
    description:
      "Blocks outbound traffic to known Vortex / SettingsFE / Watson IP ranges. IPs rotate — re-apply periodically.",
    programs: [],
    remoteAddresses: TELEMETRY_IPS,
  },
  {
    id: "ms-ads-ips",
    name: "MS Ads & Suggestions IPs",
    description:
      "Blocks 'Connected Experiences' endpoints used for Bing suggestions, Start menu ads, and weather. May affect Search.",
    programs: [],
    remoteAddresses: ADS_IPS,
  },
  {
    id: "ms-office-telemetry-ips",
    name: "Office Telemetry IPs",
    description:
      "Blocks Office telemetry / connected experience IPs. Will break some Office cloud features — skip if you use Microsoft 365.",
    programs: [],
    remoteAddresses: OFFICE_TELEMETRY_IPS,
  },
];
