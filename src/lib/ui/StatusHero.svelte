<script lang="ts">
  import type { Snippet } from "svelte";
  import HeroBanner from "./HeroBanner.svelte";
  import StatusAvatar from "./StatusAvatar.svelte";

  type AvatarTone = "neutral" | "muted" | "success" | "warning" | "primary";
  type HeroTone = "default" | "success" | "warning" | "none";

  type Props = {
    tone?: HeroTone;
    avatarTone?: AvatarTone;
    title: string;
    description?: string;
    avatar?: Snippet;
    badges?: Snippet;
    details?: Snippet;
    children?: Snippet;
  };

  let {
    tone = "default",
    avatarTone,
    title,
    description,
    avatar,
    badges,
    details,
    children,
  }: Props = $props();

  // Default avatar tone tracks hero tone, with "default" mapping to "muted".
  const resolvedAvatarTone = $derived<AvatarTone>(
    avatarTone ??
      ({
        default: "muted",
        success: "success",
        warning: "warning",
        none: "neutral",
      } as const)[tone],
  );
</script>

<HeroBanner {tone}>
  <div class="px-7 py-6 flex flex-wrap items-start gap-5">
    {#if avatar}
      <StatusAvatar tone={resolvedAvatarTone}>{@render avatar()}</StatusAvatar>
    {/if}
    <div class="flex-1 min-w-[16rem]">
      <div class="flex items-center gap-2 flex-wrap">
        <h2 class="text-xl font-semibold">{title}</h2>
        {#if badges}{@render badges()}{/if}
      </div>
      {#if description || children}
        <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
          {#if children}{@render children()}{:else}{description}{/if}
        </p>
      {/if}
      {#if details}
        <dl class="mt-4 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          {@render details()}
        </dl>
      {/if}
    </div>
  </div>
</HeroBanner>
