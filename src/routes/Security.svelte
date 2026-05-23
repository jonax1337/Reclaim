<script lang="ts">
  import TweakSection from "$lib/components/TweakSection.svelte";
  import { SECURITY_TWEAKS } from "$lib/tweaks/catalog";
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Security hardening</h1>
  <p class="text-sm text-muted-foreground mt-1">
    LSA Protection, Controlled Folder Access and Defender's Attack Surface Reduction rules.
    Each rule blocks a specific malware behavior — pick the ones that fit your usage.
  </p>
</header>

<TweakSection tweaks={SECURITY_TWEAKS} />
