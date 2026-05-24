<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { Card, Button, Badge, Checkbox, PageHeader, toast } from "$lib/ui";
  import {
    ArrowLeft,
    Save,
    Sparkles,
    ChevronDown,
    Package,
    Shield,
    Bell,
    FolderOpen,
    Search,
    Gauge,
    RefreshCw,
    BellRing,
  } from "@lucide/svelte";
  import {
    ALL_TWEAKS,
    type TweakCategory,
  } from "$lib/tweaks/catalog";
  import { BLOATWARE, type BloatwareEntry } from "$lib/tweaks/bloatware";
  import {
    ICON_PRESETS,
    profileIconName,
    type Profile,
  } from "$lib/tweaks/profiles";
  import ProfileIcon from "$lib/components/ProfileIcon.svelte";
  import { customProfiles } from "$lib/tweaks/customProfiles.svelte";
  import { profileEdit } from "$lib/tweaks/profileEdit.svelte";
  import { cn } from "$lib/utils";

  const draft = profileEdit.draft;
  const isEdit = !!draft;

  let name = $state(draft?.name ?? "");
  let tagline = $state(draft?.tagline ?? "");
  let description = $state(draft?.description ?? "");
  let gradient = $state(profileIconName({ gradient: draft?.gradient }));
  let selectedTweaks = $state<Set<string>>(new Set(draft?.tweakIds ?? []));
  let selectedBloatware = $state<Set<string>>(new Set(draft?.bloatwarePatterns ?? []));

  onMount(() => {
    // Clear the draft after we read it — prevents stale state on next visit.
    profileEdit.clear();
  });

  const TWEAK_CATEGORIES: { id: TweakCategory; label: string; icon: typeof Shield }[] = [
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "ai", label: "AI & Copilot", icon: Sparkles },
    { id: "search", label: "Search", icon: Search },
    { id: "explorer", label: "Explorer", icon: FolderOpen },
    { id: "taskbar", label: "Taskbar & Start", icon: Bell },
    { id: "notifications", label: "Notifications", icon: BellRing },
    { id: "performance", label: "Performance", icon: Gauge },
    { id: "updates", label: "Updates", icon: RefreshCw },
  ];

  const BLOAT_GROUPS: { id: BloatwareEntry["group"]; label: string }[] = [
    { id: "consumer", label: "Consumer apps" },
    { id: "office", label: "Office" },
    { id: "communication", label: "Communication" },
    { id: "media", label: "Media" },
    { id: "gaming", label: "Gaming" },
    { id: "system", label: "System" },
    { id: "other", label: "Other" },
  ];

  function toggleTweak(id: string, on: boolean) {
    const next = new Set(selectedTweaks);
    on ? next.add(id) : next.delete(id);
    selectedTweaks = next;
  }
  function toggleBloat(pattern: string, on: boolean) {
    const next = new Set(selectedBloatware);
    on ? next.add(pattern) : next.delete(pattern);
    selectedBloatware = next;
  }
  function selectAllTweaks(cat: TweakCategory, on: boolean) {
    const next = new Set(selectedTweaks);
    for (const t of ALL_TWEAKS.filter((x) => x.category === cat)) {
      on ? next.add(t.id) : next.delete(t.id);
    }
    selectedTweaks = next;
  }
  function selectAllBloat(group: BloatwareEntry["group"], on: boolean) {
    const next = new Set(selectedBloatware);
    for (const b of BLOATWARE.filter((x) => x.group === group)) {
      on ? next.add(b.pattern) : next.delete(b.pattern);
    }
    selectedBloatware = next;
  }
  function selectRecommended() {
    const next = new Set(selectedTweaks);
    for (const t of ALL_TWEAKS) {
      if (t.recommended) next.add(t.id);
    }
    selectedTweaks = next;
  }

  function tweaksByCategory(cat: TweakCategory) {
    return ALL_TWEAKS.filter((t) => t.category === cat);
  }
  function bloatByGroup(group: BloatwareEntry["group"]) {
    return BLOATWARE.filter((b) => b.group === group);
  }

  function countTweaksInCategory(cat: TweakCategory): number {
    let n = 0;
    for (const t of ALL_TWEAKS) {
      if (t.category === cat && selectedTweaks.has(t.id)) n++;
    }
    return n;
  }
  function countBloatInGroup(group: BloatwareEntry["group"]): number {
    let n = 0;
    for (const b of BLOATWARE) {
      if (b.group === group && selectedBloatware.has(b.pattern)) n++;
    }
    return n;
  }

  function save() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    if (selectedTweaks.size === 0 && selectedBloatware.size === 0) {
      toast.error("Pick at least one tweak or bloatware entry");
      return;
    }
    const profile: Profile = {
      id: draft?.id ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      tagline: tagline.trim() || "Custom profile",
      description: description.trim() || "User-defined profile.",
      gradient,
      tweakIds: [...selectedTweaks],
      bloatwarePatterns: selectedBloatware.size > 0 ? [...selectedBloatware] : undefined,
      custom: true,
      createdAt: draft?.createdAt ?? Date.now(),
    };
    customProfiles.upsert(profile);
    toast.success(isEdit ? `Updated '${profile.name}'` : `Created '${profile.name}'`);
    push("/profiles");
  }

  function cancel() {
    push("/profiles");
  }
</script>

<PageHeader
  title={isEdit ? "Edit profile" : "New profile"}
  description="Pick the tweaks and bloatware patterns this profile should apply. Saved locally — export to JSON to share."
>
  {#snippet above()}
    <button
      type="button"
      onclick={cancel}
      class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
    >
      <ArrowLeft class="size-3" />
      Back to profiles
    </button>
  {/snippet}
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button variant="outline" onclick={selectRecommended}>
        <Sparkles />
        Add all recommended
      </Button>
      <Button variant="outline" onclick={cancel}>Cancel</Button>
      <Button onclick={save}>
        <Save />
        Save
      </Button>
    </div>
  {/snippet}
</PageHeader>

<Card class="card-inset mb-6">
  <div class="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
    <label class="flex flex-col gap-1 md:col-span-1">
      <span class="text-xs font-medium text-muted-foreground">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. My Gaming Rig"
        class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </label>
    <label class="flex flex-col gap-1 md:col-span-1">
      <span class="text-xs font-medium text-muted-foreground">Tagline</span>
      <input
        type="text"
        bind:value={tagline}
        placeholder="Short one-liner"
        class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring"
      />
    </label>
    <label class="flex flex-col gap-1 md:col-span-2">
      <span class="text-xs font-medium text-muted-foreground">Description</span>
      <textarea
        bind:value={description}
        placeholder="What does this profile do? When should someone apply it?"
        rows="2"
        class="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring resize-none"
      ></textarea>
    </label>
    <div class="flex flex-col gap-2 md:col-span-2">
      <span class="text-xs font-medium text-muted-foreground">Icon</span>
      <div class="flex flex-wrap gap-2">
        {#each ICON_PRESETS as g (g.value)}
          <button
            type="button"
            onclick={() => (gradient = g.value)}
            class={cn(
              "grid place-items-center size-9 rounded-md transition-all bg-foreground/[0.06] text-foreground/80 ring-1 ring-inset ring-foreground/5",
              gradient === g.value
                ? "ring-2 ring-primary text-foreground bg-primary/10"
                : "hover:bg-foreground/[0.10]",
            )}
            title={g.label}
            aria-label={g.label}
          >
            <ProfileIcon name={g.value} class="size-4" />
          </button>
        {/each}
      </div>
    </div>
  </div>
</Card>

<div class="mb-6">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
      Tweaks
    </h2>
    <span class="text-[11px] text-muted-foreground">
      <span class="text-foreground font-medium">{selectedTweaks.size}</span> selected of {ALL_TWEAKS.length}
    </span>
  </div>
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each TWEAK_CATEGORIES as cat (cat.id)}
      {@const entries = tweaksByCategory(cat.id)}
      {@const count = countTweaksInCategory(cat.id)}
      {#if entries.length > 0}
        <details class="group border-b last:border-b-0">
          <summary
            class="flex items-center gap-3 py-3 px-5 cursor-pointer hover:bg-accent/30 transition-colors list-none"
          >
            <ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
            <div class="grid place-items-center size-7 rounded-md bg-accent/60 shrink-0">
              <cat.icon class="size-3.5 text-muted-foreground" />
            </div>
            <span class="text-sm font-medium flex-1">{cat.label}</span>
            <Badge variant={count > 0 ? "default" : "outline"}>
              {count} / {entries.length}
            </Badge>
            <button
              type="button"
              class="text-xs text-primary hover:underline shrink-0"
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectAllTweaks(cat.id, count !== entries.length);
              }}
            >
              {count === entries.length ? "none" : "all"}
            </button>
          </summary>
          <div class="border-t bg-foreground/[0.02]">
            {#each entries as t (t.id)}
              {@const checked = selectedTweaks.has(t.id)}
              <label class="flex items-start gap-3 py-2.5 px-5 pl-12 border-b last:border-b-0 hover:bg-accent/20 transition-colors cursor-pointer">
                <div class="pt-0.5">
                  <Checkbox
                    {checked}
                    onCheckedChange={(v) => toggleTweak(t.id, !!v)}
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm">{t.title}</span>
                    {#if t.recommended}
                      <Badge variant="success">
                        <Sparkles class="size-2.5" />
                        Recommended
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.description}</p>
                </div>
              </label>
            {/each}
          </div>
        </details>
      {/if}
    {/each}
  </Card>
</div>

<div class="mb-6">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
      Bloatware
    </h2>
    <span class="text-[11px] text-muted-foreground">
      <span class="text-foreground font-medium">{selectedBloatware.size}</span> selected of {BLOATWARE.length}
    </span>
  </div>
  <Card class="overflow-hidden gap-0 py-0 card-inset">
    {#each BLOAT_GROUPS as g (g.id)}
      {@const entries = bloatByGroup(g.id)}
      {@const count = countBloatInGroup(g.id)}
      {#if entries.length > 0}
        <details class="group border-b last:border-b-0">
          <summary
            class="flex items-center gap-3 py-3 px-5 cursor-pointer hover:bg-accent/30 transition-colors list-none"
          >
            <ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
            <div class="grid place-items-center size-7 rounded-md bg-accent/60 shrink-0">
              <Package class="size-3.5 text-muted-foreground" />
            </div>
            <span class="text-sm font-medium flex-1">{g.label}</span>
            <Badge variant={count > 0 ? "default" : "outline"}>
              {count} / {entries.length}
            </Badge>
            <button
              type="button"
              class="text-xs text-primary hover:underline shrink-0"
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectAllBloat(g.id, count !== entries.length);
              }}
            >
              {count === entries.length ? "none" : "all"}
            </button>
          </summary>
          <div class="border-t bg-foreground/[0.02]">
            {#each entries as b (b.pattern)}
              {@const checked = selectedBloatware.has(b.pattern)}
              <label class="flex items-start gap-3 py-2.5 px-5 pl-12 border-b last:border-b-0 hover:bg-accent/20 transition-colors cursor-pointer">
                <div class="pt-0.5">
                  <Checkbox
                    {checked}
                    onCheckedChange={(v) => toggleBloat(b.pattern, !!v)}
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm">{b.title}</span>
                    {#if b.recommended}
                      <Badge variant="success">
                        <Sparkles class="size-2.5" />
                        Recommended
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">{b.description}</p>
                  <p class="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{b.pattern}</p>
                </div>
              </label>
            {/each}
          </div>
        </details>
      {/if}
    {/each}
  </Card>
</div>
