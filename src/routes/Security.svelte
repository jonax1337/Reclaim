<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { PageHeader } from "$lib/ui";
  import { SECURITY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<PageHeader
  title="Security hardening"
  description="LSA Protection, Controlled Folder Access and Defender's Attack Surface Reduction rules. Each rule blocks a specific malware behavior — pick the ones that fit your usage."
/>

<TweakSection tweaks={SECURITY_TWEAKS} />
