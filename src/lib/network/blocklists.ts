export type Blocklist = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | string;
  builtinEntries?: string[];
  category: "telemetry" | "ads" | "social" | "malware";
};

// Curated Microsoft telemetry hosts. Sourced from public docs + the Win10/11
// "Restricted Traffic Limited Functionality" baseline and StevenBlack/hosts.
const MS_TELEMETRY: string[] = [
  "vortex.data.microsoft.com",
  "vortex-win.data.microsoft.com",
  "telecommand.telemetry.microsoft.com",
  "telecommand.telemetry.microsoft.com.nsatc.net",
  "oca.telemetry.microsoft.com",
  "oca.telemetry.microsoft.com.nsatc.net",
  "sqm.telemetry.microsoft.com",
  "sqm.telemetry.microsoft.com.nsatc.net",
  "watson.telemetry.microsoft.com",
  "watson.telemetry.microsoft.com.nsatc.net",
  "redir.metaservices.microsoft.com",
  "choice.microsoft.com",
  "choice.microsoft.com.nsatc.net",
  "df.telemetry.microsoft.com",
  "reports.wes.df.telemetry.microsoft.com",
  "wes.df.telemetry.microsoft.com",
  "services.wes.df.telemetry.microsoft.com",
  "sqm.df.telemetry.microsoft.com",
  "telemetry.microsoft.com",
  "watson.ppe.telemetry.microsoft.com",
  "telemetry.appex.bing.net",
  "telemetry.urs.microsoft.com",
  "settings-sandbox.data.microsoft.com",
  "vortex-sandbox.data.microsoft.com",
  "survey.watson.microsoft.com",
  "watson.live.com",
  "watson.microsoft.com",
  "statsfe2.ws.microsoft.com",
  "corpext.msitadfs.glbdns2.microsoft.com",
  "compatexchange.cloudapp.net",
  "cs1.wpc.v0cdn.net",
  "a-0001.a-msedge.net",
  "fe2.update.microsoft.com.akadns.net",
  "diagnostics.support.microsoft.com",
  "corp.sts.microsoft.com",
  "statsfe1.ws.microsoft.com",
  "feedback.windows.com",
  "feedback.microsoft-hohm.com",
  "feedback.search.microsoft.com",
];

// Edge / Bing / Office / Activity history endpoints.
const MS_OFFICE_TELEMETRY: string[] = [
  "nexus.officeapps.live.com",
  "nexusrules.officeapps.live.com",
  "officeclient.microsoft.com",
  "browser.events.data.microsoft.com",
  "self.events.data.microsoft.com",
  "v10.events.data.microsoft.com",
  "v10c.events.data.microsoft.com",
  "v10.vortex-win.data.microsoft.com",
  "us.vortex-win.data.microsoft.com",
  "eu.vortex-win.data.microsoft.com",
  "v20.events.data.microsoft.com",
  "settings-win.data.microsoft.com",
  "fe3.delivery.mp.microsoft.com",
  "feedback.microsoft.com",
  "activity.windows.com",
];

// Common in-OS ad delivery and "suggested apps" content.
const MS_ADS: string[] = [
  "g.msn.com",
  "g.msn.com.nsatc.net",
  "ads.msn.com",
  "ads1.msads.net",
  "ads1.msn.com",
  "adnexus.net",
  "adnxs.com",
  "msftncsi.com",
  "static.ads-twitter.com",
  "ad.doubleclick.net",
  "stats.g.doubleclick.net",
  "googleads.g.doubleclick.net",
  "ads.yahoo.com",
  "advertising.yahoo.com",
  "ads-twitter.com",
];

export const BLOCKLISTS: Blocklist[] = [
  {
    id: "ms-telemetry",
    name: "Microsoft Telemetry",
    description:
      "Core Windows diagnostic and telemetry endpoints. Blocks vortex, watson, sqm, settings-win, …",
    source: "builtin",
    builtinEntries: MS_TELEMETRY,
    category: "telemetry",
  },
  {
    id: "ms-office-edge",
    name: "Office / Edge / Activity",
    description:
      "Office telemetry, Edge events, Activity history, Bing search backends.",
    source: "builtin",
    builtinEntries: MS_OFFICE_TELEMETRY,
    category: "telemetry",
  },
  {
    id: "ms-ads",
    name: "Microsoft & Web Ads",
    description:
      "ads.msn.com, msftncsi, doubleclick, adnxs and friends — content suggestions and ad delivery.",
    source: "builtin",
    builtinEntries: MS_ADS,
    category: "ads",
  },
  {
    id: "stevenblack-base",
    name: "StevenBlack — Unified Ads + Malware",
    description:
      "Community-maintained hosts list. Blocks ad/tracking + known malware C2 domains. Fetched at apply time.",
    source: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    category: "ads",
  },
  {
    id: "stevenblack-fakenews",
    name: "StevenBlack — Fake News",
    description: "Adds known fake-news domains on top of the base list.",
    source:
      "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-only/hosts",
    category: "ads",
  },
  {
    id: "stevenblack-social",
    name: "StevenBlack — Social trackers",
    description:
      "Facebook, Twitter/X, Reddit tracker endpoints (does NOT block the sites themselves on this list).",
    source:
      "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts",
    category: "social",
  },
];

export const CATEGORY_LABELS: Record<Blocklist["category"], string> = {
  telemetry: "Telemetry",
  ads: "Ads & trackers",
  social: "Social",
  malware: "Malware",
};
