<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { GAMING_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Gaming"
  description="Scheduler, multimedia and network tweaks that trade a small amount of background smoothness for lower foreground latency. Read the warnings — some of these can affect voice apps or hardware compatibility."
/>

<TweakSection tweaks={GAMING_TWEAKS} />
