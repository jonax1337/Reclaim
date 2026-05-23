<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PRIVACY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Privacy</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Telemetry, advertising ID, activity history, location tracking.
  </p>
</header>

<TweakSection tweaks={PRIVACY_TWEAKS} />
