<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { EXPLORER_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Explorer</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Classic context menu, file extensions, hidden files, hide Home and Gallery.
  </p>
</header>

<TweakSection tweaks={EXPLORER_TWEAKS} />
