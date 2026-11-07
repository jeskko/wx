<script lang="ts" module>
  import type { Taf } from '../lib/types';
  export type TafRow = Taf & { name: string | null };
</script>

<script lang="ts">
  import type { SlideProps } from '../engine/types';

  import { autoscroll } from '../lib/autoscroll';
  import { decodeTaf } from '../lib/avdecode';

  let { ctx, data }: SlideProps<TafRow[]> = $props();

  // break TAF into change groups for readability
  function lines(raw: string): string[] {
    return raw.replace(/\s+(BECMG|TEMPO|FM\d{6}|PROB\d{2}(?: TEMPO)?)/g, '\n$1').split('\n');
  }
  /** "Helsinki/Vantaa Arpt" → "Helsinki/Vantaa" */
  function shortName(n: string | null) {
    return (n ?? '').replace(/\s+(Arpt|Airport|Intl|International|Aerodrome)\.?$/i, '');
  }
</script>

<div class="panel taf" use:autoscroll={{ total: ctx.duration * 1000 }}>
  {#each data as tf (tf.icao)}
    {#if ctx.config.decodeTaf}
      {@const d = decodeTaf(tf.raw, ctx.lang, { icao: tf.icao, from: tf.from, now: ctx.now })}
      <div class="plain">
        <div class="head">
          <span class="icao">{tf.icao}</span>
          {#if tf.name}<span class="name">{shortName(tf.name)}</span>{/if}
          {#if d.valid}<span class="valid">{d.valid}</span>{/if}
        </div>
        {#if d.cancelled}
          <p>{ctx.lang === 'fi' ? 'Ennuste peruttu' : 'Forecast cancelled'}</p>
        {/if}
        {#each d.groups as g, i (i)}
          <p class:main={!g.head}>{#if g.head}<b>{g.head}:</b>{' '}{/if}{g.items.join(' · ')}{#if g.other.length}<span class="other"> {g.other.join(' ')}</span>{/if}</p>
        {/each}
      </div>
    {:else}
      <pre>{#each lines(tf.raw) as l, i (i)}<span class:first={i === 0}>{l}</span>{'\n'}{/each}</pre>
    {/if}
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
    flex: none;
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
  .plain {
    flex: none;
    font-size: 25px;
    line-height: 1.25;
    color: var(--c-label);
  }
  .plain p {
    margin: 0;
    padding-left: 24px;
  }
  .plain p.main {
    color: var(--c-value);
  }
  .plain b {
    color: var(--c-value);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .icao {
    font-size: 30px;
    font-weight: 700;
    color: var(--c-accent);
  }
  .name {
    font-size: 27px;
    color: var(--c-value);
  }
  .valid {
    font-size: 23px;
  }
  .other {
    font-family: var(--font-mono);
    opacity: 0.7;
  }
</style>
