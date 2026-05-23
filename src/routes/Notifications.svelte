<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { NOTIFICATION_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Notifications</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Quiet down toasts, the Welcome experience, app suggestions, and Defender summary alerts.
  </p>
</header>

<TweakSection tweaks={NOTIFICATION_TWEAKS} />
