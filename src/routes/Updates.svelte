<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { UPDATE_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Updates</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Defer feature updates, block auto-restarts, disable peer-to-peer delivery.
  </p>
</header>

<TweakSection tweaks={UPDATE_TWEAKS} />
