<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { MEMORY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Memory & caching"
  description="Memory compression, SysMain, Prefetch and pagefile management — RAM-layer toggles that Windows doesn't expose in Settings."
/>

<TweakSection tweaks={MEMORY_TWEAKS} />
