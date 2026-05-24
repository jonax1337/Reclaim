<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { TASKBAR_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Taskbar & Start"
  description="Widgets, chat icon, sponsored recommendations, lock screen ads."
/>

<TweakSection tweaks={TASKBAR_TWEAKS} />
