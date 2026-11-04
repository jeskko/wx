<script lang="ts" module>
  export interface AlmanacData {
    sunrise: Date | null;
    sunset: Date | null;
    dawn: Date | null;
    dusk: Date | null;
    dayMin: number;
    changeMin: number;
    polar: 'night' | 'day' | null;
    moonPhase: number; // 0 new .. 0.5 full .. 1
    moonFraction: number;
    moonrise: Date | null;
    moonset: Date | null;
  }
</script>

<script lang="ts">
  import { t } from '../i18n';
  import { duration, time } from '../lib/format';
  import { tzFor } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AlmanacData> = $props();
  const L = $derived(ctx.lang);
  const tz = $derived(tzFor(ctx.place.country));

  const PHASES = {
    fi: ['Uusikuu', 'Kasvava sirppi', 'Ensimmäinen neljännes', 'Kasvava kuu', 'Täysikuu', 'Vähenevä kuu', 'Viimeinen neljännes', 'Vähenevä sirppi'],
    en: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
  };
  const phaseName = $derived(PHASES[L][Math.round(data.moonPhase * 8) % 8]);

  // moon drawing: lit part = half disc + terminator ellipse
  const R = 70;
  const moonPath = $derived.by(() => {
    const p = data.moonPhase;
    const waxing = p < 0.5;
    const k = Math.cos(2 * Math.PI * p); // 1 new, -1 full
    const rx = Math.abs(k) * R;
    // outer half on the lit side, then terminator back
    const sweepOuter = waxing ? 1 : 0;
    const sweepTerm = (waxing ? k > 0 : k < 0) ? 0 : 1;
    return `M0 ${-R} A${R} ${R} 0 0 ${sweepOuter} 0 ${R} A${rx} ${R} 0 0 ${sweepTerm} 0 ${-R}Z`;
  });
  const sign = (m: number) => (m >= 0 ? '+' : '−') + `${Math.abs(Math.round(m))} min`;
</script>

<div class="alm">
  <div class="panel sun">
    {#if data.polar}
      <p class="polar">{data.polar === 'night' ? t(L, 'polarNight') : t(L, 'midnightSun')}</p>
    {:else}
      <dl>
        <dt>{t(L, 'sunrise')}</dt>
        <dd>{time(L, data.sunrise, tz)}</dd>
        <dt>{t(L, 'sunset')}</dt>
        <dd>{time(L, data.sunset, tz)}</dd>
        <dt>{t(L, 'dayLength')}</dt>
        <dd>{duration(data.dayMin)}</dd>
        <dt>{t(L, 'dayLengthChange')}</dt>
        <dd>{sign(data.changeMin)}</dd>
      </dl>
    {/if}
    <dl class="twil">
      <dt>{t(L, 'civilDawn')}</dt>
      <dd>{time(L, data.dawn, tz)}</dd>
      <dt>{t(L, 'civilDusk')}</dt>
      <dd>{time(L, data.dusk, tz)}</dd>
    </dl>
  </div>
  <div class="panel moon">
    <svg viewBox="-80 -80 160 160" width="200" height="200">
      <circle r={R} class="dark" />
      <path d={moonPath} class="lit" />
    </svg>
    <div class="phase">{phaseName}</div>
    <div class="sub">{Math.round(data.moonFraction * 100)} % {t(L, 'illumination')}</div>
    <dl>
      <dt>{t(L, 'moonrise')}</dt>
      <dd>{time(L, data.moonrise, tz)}</dd>
      <dt>{t(L, 'moonset')}</dt>
      <dd>{time(L, data.moonset, tz)}</dd>
    </dl>
  </div>
</div>

<style>
  .alm {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    height: 100%;
  }
  .sun,
  .moon {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
  }
  .moon {
    align-items: center;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 24px;
    margin: 0;
    font-size: 34px;
    width: 100%;
  }
  .twil {
    font-size: 26px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    text-align: right;
    color: var(--c-value);
  }
  .polar {
    font-size: 36px;
    color: var(--c-accent);
  }
  .dark {
    fill: #1d2440;
    stroke: #5d6890;
    stroke-width: 2;
  }
  .lit {
    fill: #f3efc8;
  }
  .phase {
    font-size: 38px;
    color: var(--c-accent);
  }
  .sub {
    font-size: 24px;
    color: var(--c-label);
    margin-top: -14px;
  }
</style>
