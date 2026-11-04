<script lang="ts">
  import WxIcon from '../components/WxIcon.svelte';
  import { t } from '../i18n';
  import { temp } from '../lib/format';
  import type { PeriodSummary } from '../lib/textfc';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<PeriodSummary[]> = $props();
  const L = $derived(ctx.lang);
</script>

<div class="cols">
  {#each data as p (p.label)}
    <div class="panel col">
      <h3>{t(L, p.label)}</h3>
      <WxIcon sym={p.sym} night={p.night} size={150} />
      <div class="hilo">
        <span class="lbl">{p.night ? t(L, 'low') : t(L, 'high')}</span>
        <span class="v">{temp(p.night ? p.tmin : p.tmax)}</span>
      </div>
      <p class="text">{p.text}</p>
    </div>
  {/each}
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 22px;
    height: 100%;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  h3 {
    margin: 0;
    text-align: center;
    white-space: nowrap;
    font-size: var(--h3-size, 40px);
    color: var(--c-accent);
    text-transform: uppercase;
  }
  .hilo {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .lbl {
    font-size: 26px;
    color: var(--c-label);
  }
  .v {
    font-size: 80px;
    font-weight: 700;
    color: var(--c-value);
  }
  .text {
    margin: 6px 0 0;
    font-size: 31px;
    line-height: 1.25;
    text-align: center;
  }
</style>
