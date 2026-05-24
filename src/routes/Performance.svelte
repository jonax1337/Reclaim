<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { PERFORMANCE_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Performance"
  description="Background apps, Storage Sense, Fast Startup, Game DVR, telemetry services and scheduled tasks."
/>

<TweakSection tweaks={PERFORMANCE_TWEAKS} />
