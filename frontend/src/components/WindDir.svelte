<script lang="ts">
  // Wind direction: in Finnish an arrow pointing where the wind blows (FMI convention),
  // in English the compass abbreviation of where it comes from.
  import { windShort } from '../lib/format';
  import type { Lang } from '../lib/types';

  let { lang, deg, size = '0.9em' }: { lang: Lang; deg: number | null; size?: string } = $props();
</script>

{#if deg != null}
  {#if lang === 'fi'}
    <svg class="warrow" viewBox="-10 -10 20 20" style:width={size} style:height={size} role="img" aria-label={windShort(lang, deg)}>
      <!-- arrow drawn pointing up (towards north); rotate to the direction the wind blows to -->
      <path d="M0 -9 L6 -1 L2 -1 L2 9 L-2 9 L-2 -1 L-6 -1 Z" transform={`rotate(${(deg + 180) % 360})`} />
    </svg>
  {:else}
    {windShort(lang, deg)}
  {/if}
{/if}

<style>
  .warrow {
    display: inline-block;
    vertical-align: -0.1em;
    fill: currentColor;
    filter: var(--arrow-shadow, drop-shadow(1px 1px 0 rgba(0, 0, 20, 0.7)));
  }
</style>
