<script lang="ts">
  import { Button } from "$lib/ui";
  import { Home } from "@lucide/svelte";
</script>

<div class="grid place-items-center min-h-[60vh] text-center">
  <div>
    <div class="text-6xl font-semibold text-muted-foreground/40 mb-2">404</div>
    <h1 class="text-xl font-semibold mb-2">Page not found</h1>
    <p class="text-sm text-muted-foreground mb-6">This route doesn't exist.</p>
    <Button href="/">
      <Home />
      Back to dashboard
    </Button>
  </div>
</div>
