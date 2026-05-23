<script lang="ts">
  import { Sparkles, Shield, Zap, Gauge, Wand2, Cpu, Lock, Compass } from "@lucide/svelte";
  import { profileIconName } from "$lib/tweaks/profiles";

  type Props = { name?: string; class?: string };
  let { name, class: klass }: Props = $props();

  const ICONS: Record<string, typeof Sparkles> = {
    sparkles: Sparkles,
    shield: Shield,
    bolt: Zap,
    gauge: Gauge,
    wand: Wand2,
    cpu: Cpu,
    lock: Lock,
    compass: Compass,
  };

  const resolved = $derived(ICONS[profileIconName({ gradient: name })] ?? Sparkles);
</script>

{#if resolved}
  {@const Icon = resolved}
  <Icon class={klass} />
{/if}
