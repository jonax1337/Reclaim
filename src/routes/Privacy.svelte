<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { PRIVACY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Privacy"
  description="Telemetry, advertising ID, activity history, location tracking."
/>

<TweakSection tweaks={PRIVACY_TWEAKS} />
