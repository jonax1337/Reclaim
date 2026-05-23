export type AppGroup =
  | "browsers"
  | "communication"
  | "dev"
  | "media"
  | "system"
  | "gaming"
  | "office"
  | "utilities";

export type AppEntry = {
  id: string; // winget Id, exact match (-e)
  name: string;
  description: string;
  group: AppGroup;
  recommended?: boolean;
  homepage?: string;
  /**
   * Icon identifier. Resolved by `iconUrl()`:
   * - `simple:<slug>` → simpleicons.org CDN (brand-colored)
   * - `selfhst:<slug>` → selfh.st icons CDN
   * - `favicon:<domain>` → Google favicon service (fallback for apps not on any icon repo)
   * - `https://…` → used as-is
   * - anything else → homarr-labs/dashboard-icons slug
   */
  icon?: string;
};

/** Resolve an `icon` value to a full CDN URL. See {@link AppEntry.icon}. */
export function iconUrl(icon: string): string {
  if (icon.startsWith("http://") || icon.startsWith("https://")) return icon;
  if (icon.startsWith("simple:")) {
    return `https://cdn.simpleicons.org/${icon.slice(7)}`;
  }
  if (icon.startsWith("selfhst:")) {
    return `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${icon.slice(8)}.svg`;
  }
  if (icon.startsWith("favicon:")) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(icon.slice(8))}&sz=128`;
  }
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${icon}.svg`;
}

export const GROUP_LABELS: Record<AppGroup, string> = {
  browsers: "Browsers",
  communication: "Communication",
  dev: "Development",
  media: "Media",
  system: "System tools",
  gaming: "Gaming",
  office: "Office & productivity",
  utilities: "Utilities",
};

export const GROUP_ORDER: AppGroup[] = [
  "browsers",
  "communication",
  "dev",
  "system",
  "media",
  "office",
  "gaming",
  "utilities",
];

export const APPS: AppEntry[] = [
  // browsers
  { id: "Mozilla.Firefox", name: "Firefox", description: "Open-source browser by Mozilla.", group: "browsers", recommended: true, homepage: "https://firefox.com", icon: "firefox" },
  { id: "Brave.Brave", name: "Brave", description: "Chromium fork with built-in ad/tracker blocking.", group: "browsers", icon: "brave" },
  { id: "Google.Chrome", name: "Google Chrome", description: "Google's Chromium browser.", group: "browsers", icon: "google-chrome" },
  { id: "Vivaldi.Vivaldi", name: "Vivaldi", description: "Highly customizable Chromium browser.", group: "browsers", icon: "vivaldi" },
  { id: "LibreWolf.LibreWolf", name: "LibreWolf", description: "Privacy-hardened Firefox fork.", group: "browsers", icon: "librewolf" },
  { id: "TheTorProject.TorBrowser", name: "Tor Browser", description: "Anonymous browsing over the Tor network.", group: "browsers", icon: "selfhst:tor-browser" },

  // communication
  { id: "Discord.Discord", name: "Discord", description: "Voice, video, and text chat for communities.", group: "communication", icon: "discord" },
  { id: "OpenWhisperSystems.Signal", name: "Signal", description: "Encrypted messenger.", group: "communication", icon: "signal" },
  { id: "Telegram.TelegramDesktop", name: "Telegram", description: "Cloud-based messenger with native desktop app.", group: "communication", icon: "telegram" },
  { id: "SlackTechnologies.Slack", name: "Slack", description: "Team communication.", group: "communication", icon: "slack" },
  { id: "Zoom.Zoom", name: "Zoom", description: "Video meetings.", group: "communication", icon: "zoom" },
  { id: "Element.Element", name: "Element", description: "Matrix client — decentralized chat.", group: "communication", icon: "element" },
  { id: "Mozilla.Thunderbird", name: "Thunderbird", description: "Mozilla's email + calendar client.", group: "communication", icon: "thunderbird" },

  // dev
  { id: "Microsoft.VisualStudioCode", name: "VS Code", description: "Microsoft's open-source code editor.", group: "dev", recommended: true, homepage: "https://code.visualstudio.com", icon: "visual-studio-code" },
  { id: "Git.Git", name: "Git", description: "Distributed version control.", group: "dev", recommended: true, icon: "git" },
  { id: "GitHub.cli", name: "GitHub CLI", description: "Command-line for GitHub.", group: "dev", icon: "github" },
  { id: "OpenJS.NodeJS.LTS", name: "Node.js (LTS)", description: "JavaScript runtime — latest LTS.", group: "dev", icon: "nodejs" },
  { id: "Python.Python.3.12", name: "Python 3.12", description: "Python interpreter.", group: "dev", icon: "python" },
  { id: "Rustlang.Rustup", name: "rustup", description: "Rust toolchain installer.", group: "dev", icon: "rust" },
  { id: "GoLang.Go", name: "Go", description: "Go compiler + tools.", group: "dev", icon: "go" },
  { id: "Docker.DockerDesktop", name: "Docker Desktop", description: "Containers on Windows.", group: "dev", icon: "docker" },
  { id: "Microsoft.WindowsTerminal", name: "Windows Terminal", description: "Modern terminal for Windows.", group: "dev", recommended: true, icon: "selfhst:windows-terminal" },
  { id: "Microsoft.PowerShell", name: "PowerShell 7", description: "Cross-platform PowerShell (replaces 5.1).", group: "dev", icon: "powershell" },
  { id: "JetBrains.Toolbox", name: "JetBrains Toolbox", description: "Manager for IntelliJ, WebStorm, Rider, …", group: "dev", icon: "jetbrains-toolbox" },
  { id: "Postman.Postman", name: "Postman", description: "API development environment.", group: "dev", icon: "postman" },
  { id: "SublimeHQ.SublimeText.4", name: "Sublime Text 4", description: "Lightweight, fast text editor.", group: "dev", icon: "simple:sublimetext" },
  { id: "Notepad++.Notepad++", name: "Notepad++", description: "Classic Windows text/code editor.", group: "dev", icon: "selfhst:notepad-plus-plus" },

  // system tools
  { id: "7zip.7zip", name: "7-Zip", description: "Open-source archive utility.", group: "system", recommended: true, icon: "7zip" },
  { id: "M2Team.NanaZip", name: "NanaZip", description: "Modern 7-Zip fork with Win11 context menu.", group: "system", icon: "https://github.com/M2Team.png?size=64" },
  { id: "Microsoft.PowerToys", name: "PowerToys", description: "Microsoft's Windows power-user utilities.", group: "system", recommended: true, icon: "selfhst:microsoft-powertoys" },
  { id: "voidtools.Everything", name: "Everything", description: "Instant file search by name.", group: "system", recommended: true, icon: "favicon:voidtools.com" },
  { id: "AntibodySoftware.WizTree", name: "WizTree", description: "Visualize disk usage in seconds.", group: "system", icon: "favicon:antibody-software.com" },
  { id: "WinDirStat.WinDirStat", name: "WinDirStat", description: "Classic disk-usage visualizer.", group: "system", icon: "favicon:windirstat.net" },
  { id: "ShareX.ShareX", name: "ShareX", description: "Screenshots, screen recording, OCR.", group: "system", icon: "simple:sharex" },
  { id: "AutoHotkey.AutoHotkey", name: "AutoHotkey", description: "Windows automation scripting.", group: "system", icon: "simple:autohotkey" },
  { id: "Microsoft.Sysinternals.ProcessExplorer", name: "Process Explorer", description: "Sysinternals task manager replacement.", group: "system", icon: "favicon:learn.microsoft.com" },
  { id: "REALiX.HWiNFO", name: "HWiNFO", description: "Deep hardware monitoring + sensor data.", group: "system", icon: "favicon:hwinfo.com" },
  { id: "CrystalDewWorld.CrystalDiskInfo", name: "CrystalDiskInfo", description: "SMART health for HDDs/SSDs.", group: "system", icon: "favicon:crystalmark.info" },

  // media
  { id: "VideoLAN.VLC", name: "VLC", description: "Plays anything.", group: "media", recommended: true, icon: "simple:vlcmediaplayer" },
  { id: "OBSProject.OBSStudio", name: "OBS Studio", description: "Free screen recording and live streaming.", group: "media", icon: "simple:obsstudio" },
  { id: "Audacity.Audacity", name: "Audacity", description: "Free audio editor.", group: "media", icon: "audacity" },
  { id: "Spotify.Spotify", name: "Spotify", description: "Music streaming.", group: "media", icon: "spotify" },
  { id: "Plex.Plex", name: "Plex", description: "Personal media server desktop app.", group: "media", icon: "plex" },
  { id: "Stremio.Stremio", name: "Stremio", description: "Streaming media center.", group: "media", icon: "stremio" },
  { id: "GIMP.GIMP", name: "GIMP", description: "Free image editor.", group: "media", icon: "gimp" },
  { id: "Inkscape.Inkscape", name: "Inkscape", description: "Vector graphics editor.", group: "media", icon: "selfhst:inkscape" },
  { id: "BlenderFoundation.Blender", name: "Blender", description: "3D modeling, animation, rendering.", group: "media", icon: "blender" },

  // office
  { id: "TheDocumentFoundation.LibreOffice", name: "LibreOffice", description: "Free office suite (Writer, Calc, Impress, …).", group: "office", icon: "libreoffice" },
  { id: "ONLYOFFICE.DesktopEditors", name: "OnlyOffice", description: "MS Office-compatible suite.", group: "office", icon: "onlyoffice" },
  { id: "Obsidian.Obsidian", name: "Obsidian", description: "Local-first markdown knowledge base.", group: "office", icon: "obsidian" },
  { id: "Notion.Notion", name: "Notion", description: "Notes, wikis, project management.", group: "office", icon: "notion" },
  { id: "Joplin.Joplin", name: "Joplin", description: "Open-source notes with E2EE sync.", group: "office", icon: "joplin" },
  { id: "Logseq.Logseq", name: "Logseq", description: "Local-first outliner / knowledge graph.", group: "office", icon: "logseq" },

  // gaming
  { id: "Valve.Steam", name: "Steam", description: "Valve's game store + launcher.", group: "gaming", icon: "steam" },
  { id: "EpicGames.EpicGamesLauncher", name: "Epic Games", description: "Epic store launcher.", group: "gaming", icon: "epic-games" },
  { id: "ElectronicArts.EADesktop", name: "EA App", description: "EA games launcher.", group: "gaming", icon: "selfhst:electronic-arts" },
  { id: "GOG.Galaxy", name: "GOG Galaxy", description: "GOG store + library.", group: "gaming", icon: "simple:gogdotcom" },
  { id: "Heroic.HeroicGamesLauncher", name: "Heroic Launcher", description: "Open Epic/GOG/Amazon launcher.", group: "gaming", icon: "simple:heroicgameslauncher" },
  { id: "Guinpin.MSIAfterburner", name: "MSI Afterburner", description: "GPU overclocking + monitoring overlay.", group: "gaming", icon: "simple:msi" },
  { id: "Discord.Discord", name: "Discord", description: "Voice + text chat (duplicates listed under Communication).", group: "gaming", icon: "discord" },

  // utilities
  { id: "qBittorrent.qBittorrent", name: "qBittorrent", description: "Lightweight, ad-free BitTorrent client.", group: "utilities", icon: "qbittorrent" },
  { id: "Rufus.Rufus", name: "Rufus", description: "Create bootable USB drives.", group: "utilities", icon: "favicon:rufus.ie" },
  { id: "Ventoy.Ventoy", name: "Ventoy", description: "Multi-ISO bootable USB.", group: "utilities", icon: "favicon:ventoy.net" },
  { id: "Bitwarden.Bitwarden", name: "Bitwarden", description: "Open-source password manager.", group: "utilities", icon: "bitwarden" },
  { id: "KeePassXCTeam.KeePassXC", name: "KeePassXC", description: "Local password manager.", group: "utilities", icon: "keepassxc" },
  { id: "WinSCP.WinSCP", name: "WinSCP", description: "SCP / SFTP / FTP client.", group: "utilities", icon: "favicon:winscp.net" },
  { id: "PuTTY.PuTTY", name: "PuTTY", description: "SSH / serial client.", group: "utilities", icon: "putty" },
  { id: "Mullvad.MullvadVPN", name: "Mullvad VPN", description: "Privacy-focused VPN client.", group: "utilities", icon: "mullvad-vpn" },
];

// Deduplicate by id — gaming group references some IDs already in other groups.
export const UNIQUE_APPS: AppEntry[] = (() => {
  const seen = new Set<string>();
  const out: AppEntry[] = [];
  for (const a of APPS) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
})();

export const RECOMMENDED_IDS: string[] = UNIQUE_APPS.filter((a) => a.recommended).map((a) => a.id);
