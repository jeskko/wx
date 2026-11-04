<script lang="ts">
  import type { Metar } from '../lib/types';
  import { temp } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  import { autoscroll } from '../lib/autoscroll';

  let { ctx, data }: SlideProps<Metar[]> = $props();

  function wind(m: Metar) {
    if (m.wskt == null) return '';
    if (m.wskt === 0) return '00000KT';
    const d = m.wdvrb ? 'VRB' : String(m.wd ?? 0).padStart(3, '0');
    return `${d}${String(m.wskt).padStart(2, '0')}${m.wgkt ? 'G' + m.wgkt : ''}KT`;
  }
  function clouds(m: Metar) {
    if (/\bCAVOK\b/.test(m.raw)) return 'CAVOK';
    if (!m.clouds.length) return /\bNCD\b/.test(m.raw) ? 'NCD' : 'NSC';
    return m.clouds
      .slice(0, 2)
      .map((c) => (c.base == null ? c.cover : `${c.cover}${String(Math.round(c.base / 100)).padStart(3, '0')}`))
      .join(' ');
  }
  function vis(m: Metar) {
    return m.vis == null ? '' : m.vis >= 9999 ? '9999' : String(m.vis);
  }
</script>

<div class="panel av" use:autoscroll={{ total: ctx.duration * 1000 }}>
  {#each data as m (m.icao)}
    <div class="row">
      <span class="icao">{m.icao}</span>
      <span class="cat {m.cat ?? ''}">{m.cat ?? '—'}</span>
      <span class="dec">{wind(m)} · {vis(m)} · {clouds(m)} · {temp(m.t, false)}/{temp(m.td, false)} · Q{m.qnh ?? ''}</span>
      <span class="raw">{m.raw}</span>
    </div>
  {/each}
</div>

<style>
  .av {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }
  .row {
    flex: none;
    display: grid;
    grid-template-columns: 110px 100px 1fr;
    grid-template-rows: auto auto;
    column-gap: 14px;
    align-items: baseline;
  }
  .icao {
    font-size: 32px;
    font-weight: 700;
    color: var(--c-accent);
  }
  .cat {
    font-size: 22px;
    font-weight: 700;
    text-align: center;
    border-radius: 4px;
    padding: 0 6px;
    color: #000;
    background: #999;
  }
  .cat.VFR {
    background: #3fbf5a;
  }
  .cat.MVFR {
    background: #4fb3ff;
  }
  .cat.IFR {
    background: #e8202a;
    color: #fff;
  }
  .cat.LIFR {
    background: #d23cff;
    color: #fff;
  }
  .dec {
    font-size: 28px;
    color: var(--c-value);
  }
  .raw {
    grid-column: 2 / 4;
    font-family: var(--font-mono);
    font-size: 23px;
    color: var(--c-label);
    text-shadow: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
