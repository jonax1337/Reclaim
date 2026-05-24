<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { BROWSER_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Browser"
  description="Microsoft Edge policy tweaks — disable the shopping assistant, news feed, wallet, Discover, and other built-in advertising / engagement surfaces."
/>

<TweakSection tweaks={BROWSER_TWEAKS} />
