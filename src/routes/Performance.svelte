<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PERFORMANCE_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Performance</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Background apps, Storage Sense, Fast Startup, Game DVR, telemetry services and scheduled tasks.
  </p>
</header>

<TweakSection tweaks={PERFORMANCE_TWEAKS} />
