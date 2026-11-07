<script lang="ts" module>
  export interface VhfData {
    /** Es path: Finland -> Central Europe */
    path: { km: number; midLat: number; midLon: number };
    kpNow: number | null;
    kpMax12h: number | null;
  }
</script>

<script lang="ts">
  // Sporadic E (ITU-R P.534 climatology), meteor scatter and radio aurora indicators.
  import { ES_BANDS, auroraLevel, esChance, meteorNow } from '../lib/vhf';
  import { capitalize, num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<VhfData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';
  const LEVEL_COLORS = ['rgba(255,255,255,0.12)', '#4fb3ff', '#e8d640', '#3fbf5a'];

  const es = $derived(ES_BANDS.map((b) => ({ b, pct: esChance(b, data.path.km, data.path.midLon, ctx.now) })));
  const esLevel = (p: number) => (p >= 3 ? 3 : p >= 1 ? 2 : p >= 0.1 ? 1 : 0);
  const ES_WORD = {
    fi: ['hyvin harvinainen', 'pieni', 'mahdollinen', 'hyvä'],
    en: ['very rare', 'small', 'possible', 'good'],
  };
  const pctText = (p: number) => (p < 0.01 ? (L === 'fi' ? 'alle 0,01 %' : 'below 0.01%') : `${num(L, p, p < 1 ? 2 : 1)}${L === 'fi' ? ' %' : '%'}`);

  // 6 m chance for the next 24 hours, hourly
  const strip = $derived.by(() => {
    const h0 = new Date(ctx.now);
    h0.setUTCMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, k) => {
      const t = new Date(h0.getTime() + k * 3600_000);
      return { t, p: esChance(ES_BANDS[0], data.path.km, data.path.midLon, t) };
    });
  });
  const stripMax = $derived(Math.max(1, ...strip.map((x) => x.p)));

  const met = $derived(meteorNow(ctx.now, data.path.midLat, data.path.midLon));
  const MET_WORD = {
    fi: ['heikko', 'tavallinen', 'hyvä', 'erinomainen'],
    en: ['weak', 'normal', 'good', 'excellent'],
  };

  const aur = $derived(auroraLevel(data.kpNow));
  const aurNext = $derived(auroraLevel(data.kpMax12h));
  const AUR_WORD = {
    fi: ['epätodennäköinen', 'mahdollinen', 'todennäköinen', 'voimakas'],
    en: ['unlikely', 'possible', 'likely', 'strong'],
  };
</script>

<div class="vhf">
  <section class="panel">
    <h3>{L === 'fi' ? 'Sporadinen E' : 'Sporadic E'}</h3>
    <p class="sub">{L === 'fi' ? `Suomesta Keski-Eurooppaan (${num(L, Math.round(data.path.km / 100) * 100)} km)` : `Finland to Central Europe (${num(L, Math.round(data.path.km / 100) * 100)} km)`}</p>
    <ul class="bands">
      {#each es as e (e.b.id)}
        {@const lv = esLevel(e.pct)}
        <li>
          <span class="bn">{e.b.id.replace('m', ' m')}</span>
          <span class="sw" style:background={LEVEL_COLORS[lv]}></span>
          <span class="val">{pctText(e.pct)}</span>
          <span class="word">{ES_WORD[L][lv]}</span>
        </li>
      {/each}
    </ul>
    <div class="strip" aria-label="6 m">
      {#each strip as s, i (i)}
        <span class="col" title={time(L, s.t, tz)}><span class="barv" style:height={`${Math.max(3, (s.p / stripMax) * 100)}%`} style:background={LEVEL_COLORS[esLevel(s.p)]}></span></span>
      {/each}
    </div>
    <div class="axis">
      <span>{time(L, strip[0].t, tz)}</span><span>6 m · 24 h</span><span>{time(L, strip[23].t, tz)}</span>
    </div>
    <p class="note">
      {L === 'fi'
        ? 'Tilastollinen todennäköisyys, että Es kantaa SSB-yhteyden (100 W, 5-el. Yagi) – ei ennuste. ITU-R P.534.'
        : 'Statistical chance that Es carries an SSB contact (100 W, 5-el. Yagi), not a forecast. ITU-R P.534.'}
    </p>
  </section>

  <section class="panel">
    <h3>{L === 'fi' ? 'Meteorisironta' : 'Meteor scatter'}</h3>
    <div class="big" style:color={met.level ? LEVEL_COLORS[met.level] : undefined}>{capitalize(MET_WORD[L][met.level])}</div>
    {#if met.showers.length}
      <ul class="showers">
        {#each met.showers.slice(0, 3) as x (x.s.en)}
          <li>
            <b>{x.s[L]}</b>{x.s.day ? (L === 'fi' ? ' (päiväparvi)' : ' (daytime shower)') : ''}<br />
            <small>ZHR {num(L, Math.round(x.zhr))} · {L === 'fi' ? 'radiantti' : 'radiant'} {num(L, Math.round(x.alt))}°</small>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="plain">{L === 'fi' ? 'Ei aktiivisia meteoriparvia – vain satunnaisia meteoreja.' : 'No active showers – sporadic meteors only.'}</p>
    {/if}
    <p class="note">
      {L === 'fi'
        ? 'Satunnaisia meteoreja on eniten aamuyöllä ja kesällä. ITU-R P.843, IMO.'
        : 'Sporadic meteors peak before dawn and in summer. ITU-R P.843, IMO.'}
    </p>
  </section>

  <section class="panel">
    <h3>{L === 'fi' ? 'Revontuliheijastus' : 'Radio aurora'}</h3>
    <div class="big" style:color={aur ? LEVEL_COLORS[aur] : undefined}>{capitalize(AUR_WORD[L][aur])}</div>
    <dl>
      <dt>{L === 'fi' ? 'Kp nyt' : 'Kp now'}</dt>
      <dd>{data.kpNow == null ? '–' : num(L, data.kpNow, 0)}</dd>
      <dt>{L === 'fi' ? 'Kp enintään 12 h' : 'Kp max 12 h'}</dt>
      <dd>{data.kpMax12h == null ? '–' : num(L, data.kpMax12h, 0)}</dd>
    </dl>
    {#if aurNext > aur}
      <p class="plain">{L === 'fi' ? `Seuraavien tuntien aikana: ${AUR_WORD.fi[aurNext]}` : `In the coming hours: ${AUR_WORD.en[aurNext]}`}</p>
    {/if}
    <p class="note">
      {L === 'fi'
        ? '6 m ja 2 m: suuntaa antenni pohjoiseen. Nyrkkisääntö Kp-indeksistä.'
        : '6 m and 2 m: point the antenna north. Rule of thumb from the Kp index.'}
    </p>
  </section>
</div>

<style>
  .vhf {
    display: grid;
    grid-template-columns: 1.25fr 1fr 1fr;
    gap: 22px;
    height: 100%;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 30px;
    color: var(--c-accent);
  }
  .sub {
    margin: -6px 0 4px;
    font-size: 19px;
    color: var(--c-label);
  }
  .bands {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bands li {
    display: grid;
    grid-template-columns: 62px 28px auto 1fr;
    align-items: center;
    gap: 10px;
    font-size: 24px;
  }
  .bn {
    color: var(--c-value);
    font-weight: 700;
  }
  .val {
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .word {
    color: var(--c-label);
    font-size: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sw {
    width: 26px;
    height: 16px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
  }
  .strip {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 80px;
    margin-top: 6px;
  }
  .col {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .barv {
    display: block;
    width: 100%;
    border-radius: 2px 2px 0 0;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 16px;
    color: var(--c-label);
  }
  .big {
    font-size: 40px;
    font-weight: 700;
    line-height: 1.1;
  }
  .showers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 22px;
  }
  .showers small {
    font-size: 18px;
    color: var(--c-label);
  }
  .plain {
    margin: 0;
    font-size: 21px;
    color: var(--c-label);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 12px;
    font-size: 22px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    color: var(--c-value);
    text-align: right;
  }
  .note {
    margin: auto 0 0;
    font-size: 16px;
    color: var(--c-label);
  }
</style>
