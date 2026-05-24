<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { NOTIFICATION_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Notifications"
  description="Quiet down toasts, the Welcome experience, app suggestions, and Defender summary alerts."
/>

<TweakSection tweaks={NOTIFICATION_TWEAKS} />
