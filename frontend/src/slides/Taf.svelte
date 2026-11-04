<script lang="ts">
  import type { Taf } from '../lib/types';
  import type { SlideProps } from '../engine/types';

  let { data }: SlideProps<Taf[]> = $props();

  // break TAF into change groups for readability
  function lines(raw: string): string[] {
    return raw.replace(/\s+(BECMG|TEMPO|FM\d{6}|PROB\d{2}(?: TEMPO)?)/g, '\n$1').split('\n');
  }
</script>

<div class="panel taf">
  {#each data.slice(0, 4) as tf (tf.icao)}
    <pre>{#each lines(tf.raw) as l, i (i)}<span class:first={i === 0}>{l}</span>{'\n'}{/each}</pre>
  {/each}
</div>

<style>
  .taf {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }
  pre {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 29px;
    line-height: 1.15;
    text-shadow: none;
    white-space: pre-wrap;
    color: var(--c-label);
  }
  .first {
    color: var(--c-value);
  }
</style>
