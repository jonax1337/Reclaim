<script lang="ts">
  import type { Component } from "svelte";
  import { push } from "svelte-spa-router";
  import { ArrowRight } from "@lucide/svelte";
  import Card from "./Card.svelte";
  import CardContent from "./CardContent.svelte";
  import IconTile from "./IconTile.svelte";

  type Props = {
    href: string;
    icon: Component;
    label: string;
    description?: string;
    count?: number | string;
    countSuffix?: string;
  };

  let {
    href,
    icon: Icon,
    label,
    description,
    count,
    countSuffix = "entries",
  }: Props = $props();
</script>

<button type="button" onclick={() => push(href)} class="group text-left">
  <Card
    class="card-inset cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 transition-all duration-200 py-4"
  >
    <CardContent>
      <div class="flex items-start gap-3">
        <IconTile size="lg" interactive>
          <Icon class="size-4" />
        </IconTile>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">{label}</span>
            <ArrowRight
              class="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </div>
          {#if description}
            <div class="text-xs text-muted-foreground mt-0.5 truncate">{description}</div>
          {/if}
          {#if count !== undefined}
            <div class="text-[10px] text-muted-foreground/70 mt-1.5 uppercase tracking-wider">
              {count} {countSuffix}
            </div>
          {/if}
        </div>
      </div>
    </CardContent>
  </Card>
</button>
