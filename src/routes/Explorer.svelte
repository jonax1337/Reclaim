<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { EXPLORER_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Explorer"
  description="Classic context menu, file extensions, hidden files, hide Home and Gallery."
/>

<TweakSection tweaks={EXPLORER_TWEAKS} />
