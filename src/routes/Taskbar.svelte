<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { TASKBAR_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Taskbar &amp; Start</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Widgets, chat icon, sponsored recommendations, lock screen ads.
  </p>
</header>

<TweakSection tweaks={TASKBAR_TWEAKS} />
