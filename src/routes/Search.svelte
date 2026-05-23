<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { SEARCH_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Search</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Bing search, web suggestions, Cortana and search highlights.
  </p>
</header>

<TweakSection tweaks={SEARCH_TWEAKS} />
