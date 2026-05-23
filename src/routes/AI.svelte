<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { AI_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">AI &amp; Copilot</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Disable Copilot, Recall, Click to Do and AI features in Edge.
  </p>
</header>

<TweakSection tweaks={AI_TWEAKS} />
