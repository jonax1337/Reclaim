export type DohProvider = {
  id: string;
  name: string;
  description: string;
  ipv4: string[];
  ipv6: string[];
  template: string;
};

export const DOH_PROVIDERS: DohProvider[] = [
  {
    id: "cloudflare",
    name: "Cloudflare 1.1.1.1",
    description: "Fast, no-logs DNS. Default for most setups.",
    ipv4: ["1.1.1.1", "1.0.0.1"],
    ipv6: ["2606:4700:4700::1111", "2606:4700:4700::1001"],
    template: "https://cloudflare-dns.com/dns-query",
  },
  {
    id: "cloudflare-malware",
    name: "Cloudflare for Families (malware)",
    description: "1.1.1.2 — blocks known malware domains.",
    ipv4: ["1.1.1.2", "1.0.0.2"],
    ipv6: ["2606:4700:4700::1112", "2606:4700:4700::1002"],
    template: "https://security.cloudflare-dns.com/dns-query",
  },
  {
    id: "quad9",
    name: "Quad9",
    description: "Swiss non-profit. Blocks malicious domains.",
    ipv4: ["9.9.9.9", "149.112.112.112"],
    ipv6: ["2620:fe::fe", "2620:fe::9"],
    template: "https://dns.quad9.net/dns-query",
  },
  {
    id: "adguard",
    name: "AdGuard DNS",
    description: "Blocks ads + trackers at the DNS layer.",
    ipv4: ["94.140.14.14", "94.140.15.15"],
    ipv6: ["2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"],
    template: "https://dns.adguard-dns.com/dns-query",
  },
  {
    id: "google",
    name: "Google Public DNS",
    description: "8.8.8.8. Fastest most places, but Google logs queries.",
    ipv4: ["8.8.8.8", "8.8.4.4"],
    ipv6: ["2001:4860:4860::8888", "2001:4860:4860::8844"],
    template: "https://dns.google/dns-query",
  },
  {
    id: "mullvad",
    name: "Mullvad DNS",
    description: "Privacy-focused, blocks ads + trackers. No logging.",
    ipv4: ["194.242.2.2"],
    ipv6: ["2a07:e340::2"],
    template: "https://dns.mullvad.net/dns-query",
  },
];

export function findProviderByIpv4(ips: string[]): DohProvider | null {
  if (!ips.length) return null;
  for (const p of DOH_PROVIDERS) {
    if (p.ipv4.every((ip) => ips.includes(ip))) return p;
  }
  // Looser match: any single IP matches.
  for (const p of DOH_PROVIDERS) {
    if (p.ipv4.some((ip) => ips.includes(ip))) return p;
  }
  return null;
}
