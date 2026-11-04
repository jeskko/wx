<script lang="ts" module>
  import type { Current } from '../lib/wx';
  export interface CurrentData {
    cur: Current | null;
    sym: string | null;
    night: boolean;
    fcT: number | null;
  }
</script>

<script lang="ts">
  import WindDir from '../components/WindDir.svelte';
  import WxIcon from '../components/WxIcon.svelte';
  import { t } from '../i18n';
  import { num, temp, time, visibility } from '../lib/format';
  import { symLabel } from '../lib/textfc';
  import { tzFor } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<CurrentData> = $props();
  const L = $derived(ctx.lang);
  const c = $derived(data.cur);
  const tz = $derived(tzFor(ctx.place.country));

  const trend = $derived(
    c?.ptend == null ? '' : c.ptend > 0.7 ? `▲ ${t(L, 'rising')}` : c.ptend < -0.7 ? `▼ ${t(L, 'falling')}` : `► ${t(L, 'steady')}`,
  );
</script>

<div class="current">
  <div class="panel hero">
    <WxIcon sym={data.sym} night={data.night} size={190} />
    <div class="temp-big">{temp(c?.t ?? data.fcT)}</div>
    <div class="cond">{symLabel(L, data.sym)}</div>
  </div>

  <div class="panel facts">
    {#if c}
      <dl>
        <dt>{t(L, 'feelsLike')}</dt>
        <dd>{temp(c.feels)}</dd>
        <dt>{t(L, 'wind')}</dt>
        <dd>
          {#if c.ws == null}–{:else if c.ws < 0.5}{t(L, 'calm')}{:else}<WindDir lang={L} deg={c.wd} /> {num(c.ws)} m/s{/if}
          {#if c.wg != null && c.wg >= (c.ws ?? 0) + 3}<small> ({t(L, 'gusts')} {num(c.wg)})</small>{/if}
        </dd>
        <dt>{t(L, 'humidity')}</dt>
        <dd>{num(c.rh)} %</dd>
        <dt>{t(L, 'dewpoint')}</dt>
        <dd>{temp(c.td)}</dd>
        <dt>{t(L, 'pressure')}</dt>
        <dd>{num(c.p)} hPa <small>{trend}</small></dd>
        <dt>{t(L, 'visibility')}</dt>
        <dd>{visibility(L, c.vis)}</dd>
        {#if c.n != null && c.n <= 8}
          <dt>{t(L, 'cloudiness')}</dt>
          <dd>{c.n}{t(L, 'octas')}</dd>
        {/if}
        {#if c.snow != null && c.snow > 0}
          <dt>{t(L, 'snowDepth')}</dt>
          <dd>{num(c.snow)} cm</dd>
        {/if}
      </dl>
      <p class="foot">
        {t(L, 'station')}: {c.stationName} · {t(L, 'observedAt')} {time(L, c.time, tz)}
      </p>
    {:else}
      <p class="nodata">{t(L, 'noData')}</p>
    {/if}
  </div>
</div>

<style>
  .current {
    display: grid;
    grid-template-columns: 5fr 6fr;
    gap: 28px;
    height: 100%;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .temp-big {
    font-size: 150px;
    line-height: 1;
    font-weight: 700;
    color: var(--c-value);
  }
  .cond {
    font-size: 40px;
    color: var(--c-accent);
    text-align: center;
  }
  .facts {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 28px;
    margin: 0;
    font-size: 36px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    color: var(--c-value);
    text-align: right;
  }
  small {
    font-size: 0.7em;
    color: var(--c-label);
  }
  .foot {
    margin: 24px 0 0;
    font-size: 22px;
    color: var(--c-label);
  }
  .nodata {
    font-size: 36px;
    text-align: center;
  }
</style>
