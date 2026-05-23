<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { BROWSER_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Browser</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Microsoft Edge policy tweaks — disable the shopping assistant, news feed, wallet, Discover, and
    other built-in advertising / engagement surfaces.
  </p>
</header>

<TweakSection tweaks={BROWSER_TWEAKS} />
