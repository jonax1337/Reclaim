<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { GAMING_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Gaming</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Scheduler, multimedia and network tweaks that trade a small amount of background
    smoothness for lower foreground latency. Read the warnings — some of these can affect
    voice apps or hardware compatibility.
  </p>
</header>

<TweakSection tweaks={GAMING_TWEAKS} />
