<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { SEARCH_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Search"
  description="Bing search, web suggestions, Cortana and search highlights."
/>

<TweakSection tweaks={SEARCH_TWEAKS} />
