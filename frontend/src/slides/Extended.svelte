<script lang="ts">
  import WindDir from '../components/WindDir.svelte';
  import WxIcon from '../components/WxIcon.svelte';
  import { t } from '../i18n';
  import { num, temp, weekday } from '../lib/format';
  import type { Day } from '../lib/types';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<{ days: Day[]; tz: string }> = $props();
  const L = $derived(ctx.lang);
</script>

<div class="days">
  {#each data.days as d (d.date)}
    <div class="panel day">
      <h3>{weekday(L, d.date, 'UTC')}</h3>
      <WxIcon sym={d.sym} size={130} />
      <div class="t hi"><span>{t(L, 'high')}</span>{temp(d.tmax)}</div>
      <div class="t lo"><span>{t(L, 'low')}</span>{temp(d.tmin)}</div>
      <div class="sub">
        {#if d.pr >= 0.1}{num(d.pr, d.pr < 10 ? 1 : 0)} mm{:else}&nbsp;{/if}
      </div>
      <div class="sub"><WindDir lang={L} deg={d.wd} /> {num(d.wsmax)} m/s</div>
    </div>
  {/each}
</div>

<style>
  .days {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 18px;
    height: 100%;
  }
  .day {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 40px;
    text-transform: uppercase;
    color: var(--c-accent);
  }
  .t {
    font-size: 52px;
    font-weight: 700;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .t span {
    font-size: 22px;
    font-weight: 400;
    color: var(--c-label);
  }
  .hi {
    color: var(--c-warm);
  }
  .lo {
    color: var(--c-cold);
  }
  .sub {
    font-size: 26px;
    color: var(--c-label);
  }
</style>
