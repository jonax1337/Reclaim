<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { UPDATE_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Updates"
  description="Defer feature updates, block auto-restarts, disable peer-to-peer delivery."
/>

<TweakSection tweaks={UPDATE_TWEAKS} />
