<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { MEMORY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Memory & caching</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Memory compression, SysMain, Prefetch and pagefile management — RAM-layer toggles that
    Windows doesn't expose in Settings.
  </p>
</header>

<TweakSection tweaks={MEMORY_TWEAKS} />
