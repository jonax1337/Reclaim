export type BloatwareEntry = {
  pattern: string;
  title: string;
  description: string;
  group: "consumer" | "office" | "gaming" | "communication" | "media" | "system" | "other";
  recommended?: boolean;
  warning?: string;
  /** Icon identifier, resolved by `iconUrl()` in `apps/catalog.ts`. */
  icon?: string;
};

export const BLOATWARE: BloatwareEntry[] = [
  // Consumer / Bing apps
  { pattern: "Microsoft.BingNews", title: "Bing News", description: "MSN News reader", group: "consumer", recommended: true, icon: "microsoft-bing" },
  { pattern: "Microsoft.BingWeather", title: "Bing Weather", description: "Weather app", group: "consumer", recommended: true, icon: "microsoft-bing" },
  { pattern: "Microsoft.BingSearch", title: "Bing Search", description: "Bing search integration", group: "consumer", recommended: true, icon: "microsoft-bing" },
  { pattern: "Microsoft.BingFinance", title: "Bing Finance", description: "Finance app", group: "consumer", recommended: true, icon: "microsoft-bing" },
  { pattern: "Microsoft.BingSports", title: "Bing Sports", description: "Sports app", group: "consumer", recommended: true, icon: "microsoft-bing" },
  { pattern: "Microsoft.GetHelp", title: "Get Help", description: "Microsoft support chat", group: "consumer", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.Getstarted", title: "Get Started", description: "Tips & tricks app", group: "consumer", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.MicrosoftOfficeHub", title: "Office Hub", description: "Office promo entry in the Start menu", group: "office", recommended: true, icon: "microsoft-office" },
  { pattern: "Microsoft.MicrosoftStickyNotes", title: "Sticky Notes", description: "Sticky Notes app", group: "office", icon: "microsoft-windows" },
  { pattern: "Microsoft.MicrosoftSolitaireCollection", title: "Solitaire Collection", description: "Ad-supported Solitaire bundle", group: "gaming", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.PowerAutomateDesktop", title: "Power Automate", description: "Workflow automation tool", group: "office", icon: "microsoft-power-automate" },
  { pattern: "Microsoft.Todos", title: "Microsoft To Do", description: "Task list app", group: "office", icon: "microsoft-to-do" },
  { pattern: "Microsoft.WindowsAlarms", title: "Alarms & Clock", description: "Alarms / timer app", group: "consumer", icon: "microsoft-windows" },
  { pattern: "Microsoft.WindowsFeedbackHub", title: "Feedback Hub", description: "Send feedback to Microsoft", group: "system", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.WindowsMaps", title: "Maps", description: "Maps app", group: "consumer", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.WindowsSoundRecorder", title: "Sound Recorder", description: "Voice recorder app", group: "media", icon: "microsoft-windows" },
  { pattern: "Microsoft.YourPhone", title: "Phone Link", description: "Smartphone companion", group: "communication", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.ZuneMusic", title: "Media Player (Groove)", description: "Media player app", group: "media", warning: "If you use Windows Media Player, keep this.", icon: "microsoft-windows" },
  { pattern: "Microsoft.ZuneVideo", title: "Films & TV", description: "Video player app", group: "media", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.MixedReality.Portal", title: "Mixed Reality Portal", description: "Windows MR portal", group: "other", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.OneConnect", title: "Mobile Plans", description: "Microsoft OneConnect", group: "other", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.Office.OneNote", title: "OneNote", description: "OneNote (Store version)", group: "office", icon: "microsoft-onenote" },
  { pattern: "Microsoft.People", title: "People", description: "Contacts app", group: "communication", recommended: true, icon: "microsoft-windows" },
  { pattern: "Microsoft.SkypeApp", title: "Skype", description: "Skype app", group: "communication", recommended: true, icon: "skype" },
  { pattern: "Microsoft.WindowsCommunicationsApps", title: "Mail & Calendar", description: "Built-in Mail / Calendar", group: "communication", warning: "Removes both Mail and Calendar.", icon: "microsoft-outlook" },
  { pattern: "Microsoft.OutlookForWindows", title: "New Outlook", description: "Outlook web app wrapper", group: "communication", recommended: true, icon: "microsoft-outlook" },
  { pattern: "MicrosoftTeams", title: "Microsoft Teams (Consumer)", description: "Consumer Teams chat", group: "communication", recommended: true, icon: "microsoft-teams" },
  { pattern: "MSTeams", title: "Microsoft Teams", description: "Teams app", group: "communication", icon: "microsoft-teams" },

  // Gaming
  { pattern: "Microsoft.Xbox.TCUI", title: "Xbox TCUI", description: "Xbox UI runtime", group: "gaming", warning: "Some games depend on this.", icon: "xbox" },
  { pattern: "Microsoft.XboxApp", title: "Xbox App", description: "Xbox console companion", group: "gaming", recommended: true, icon: "xbox" },
  { pattern: "Microsoft.XboxGameOverlay", title: "Xbox Game Overlay", description: "Xbox in-game overlay", group: "gaming", recommended: true, icon: "xbox" },
  { pattern: "Microsoft.XboxGamingOverlay", title: "Xbox Game Bar", description: "Game Bar overlay", group: "gaming", recommended: true, icon: "xbox" },
  { pattern: "Microsoft.XboxIdentityProvider", title: "Xbox Identity Provider", description: "Xbox sign-in component", group: "gaming", warning: "Required for games using Xbox Live.", icon: "xbox" },
  { pattern: "Microsoft.XboxSpeechToTextOverlay", title: "Xbox Speech to Text", description: "Xbox voice output", group: "gaming", recommended: true, icon: "xbox" },
  { pattern: "Microsoft.GamingApp", title: "Xbox / Gaming App", description: "PC Game Pass app", group: "gaming", icon: "xbox-game-pass" },

  // Third-party bloat (pre-installed)
  { pattern: "*Spotify*", title: "Spotify", description: "Pre-installed Spotify promo", group: "media", recommended: true, icon: "spotify" },
  { pattern: "*Disney*", title: "Disney+", description: "Disney+ promo app", group: "media", recommended: true, icon: "disney-plus" },
  { pattern: "*TikTok*", title: "TikTok", description: "TikTok app", group: "media", recommended: true, icon: "tiktok" },
  { pattern: "*Netflix*", title: "Netflix", description: "Netflix promo app", group: "media", recommended: true, icon: "netflix" },
  { pattern: "*Facebook*", title: "Facebook", description: "Facebook app", group: "communication", recommended: true, icon: "facebook" },
  { pattern: "*Twitter*", title: "Twitter / X", description: "Twitter app", group: "communication", recommended: true, icon: "x" },
  { pattern: "*Instagram*", title: "Instagram", description: "Instagram app", group: "communication", recommended: true, icon: "instagram" },
  { pattern: "*LinkedIn*", title: "LinkedIn", description: "LinkedIn app", group: "communication", recommended: true, icon: "linkedin" },
  { pattern: "*Amazon*", title: "Amazon Prime Video", description: "Amazon Prime promo", group: "media", recommended: true, icon: "amazon" },
  { pattern: "*HiddenCity*", title: "Hidden City", description: "Promo game", group: "gaming", recommended: true, icon: "favicon:g5e.com" },
  { pattern: "*CandyCrush*", title: "Candy Crush", description: "King Candy Crush", group: "gaming", recommended: true, icon: "favicon:king.com" },
  { pattern: "ClipChamp.Clipchamp", title: "Clipchamp", description: "Microsoft video editor", group: "media", recommended: true, icon: "favicon:clipchamp.com" },
  { pattern: "Microsoft.WindowsMeetNow", title: "Meet Now", description: "Skype Meet Now", group: "communication", recommended: true, icon: "skype" },

  // System bloat
  { pattern: "Microsoft.549981C3F5F10", title: "Cortana", description: "Cortana app", group: "system", warning: "Pairs with the 'Disable Cortana' tweak in Search.", icon: "microsoft-windows" },
  { pattern: "Microsoft.Copilot", title: "Copilot (app)", description: "Microsoft Copilot standalone app", group: "system", recommended: true, icon: "microsoft-copilot" },
  { pattern: "Microsoft.MicrosoftEdge.Stable", title: "Microsoft Edge", description: "Edge browser", group: "system", warning: "Edge is treated as a mandatory Windows component — it may reinstall.", icon: "microsoft-edge" },
  { pattern: "Microsoft.Edge.GameAssist", title: "Edge Game Assist", description: "Edge gaming overlay", group: "gaming", recommended: true, icon: "microsoft-edge" },
  { pattern: "MicrosoftCorporationII.QuickAssist", title: "Quick Assist", description: "Remote assistance tool", group: "system", icon: "microsoft-windows" },
  { pattern: "Microsoft.WindowsFamilySafety", title: "Family Safety", description: "Family Safety component", group: "system", icon: "microsoft-windows" },
];

export const GROUP_LABELS: Record<BloatwareEntry["group"], string> = {
  consumer: "Consumer apps",
  office: "Office & productivity",
  gaming: "Gaming & Xbox",
  communication: "Communication",
  media: "Media & streaming",
  system: "System & Microsoft",
  other: "Other",
};
