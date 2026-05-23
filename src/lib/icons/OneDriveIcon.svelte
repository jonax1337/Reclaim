<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  type Props = { class?: ClassValue | null };
  let { class: klass }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={klass}
  aria-hidden="true"
>
  <g transform="translate(12 12) scale(1.12) translate(-12 -12)" vector-effect="non-scaling-stroke">
    <path d="M18.456 10.45a6.45 6.45 0 0 0-12-2.151a4.857 4.857 0 0 0-4.44 5.241a4.856 4.856 0 0 0 5.236 4.444h10.751a3.77 3.77 0 0 0 3.99-3.54a3.77 3.77 0 0 0-3.538-3.992z" vector-effect="non-scaling-stroke" />
  </g>
</svg>
