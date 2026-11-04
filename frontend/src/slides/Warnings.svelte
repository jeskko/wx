<script lang="ts" module>
  import type { Warning } from '../lib/types';
  export interface WarningsData {
    here: Warning[];
    elsewhere: Warning[];
  }
</script>

<script lang="ts">
  import { t } from '../i18n';
  import { time, weekday } from '../lib/format';
  import { tzFor } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<WarningsData> = $props();
  const L = $derived(ctx.lang);
  const tz = $derived(tzFor(ctx.place.country));

  function txt(w: Warning) {
    return w.text[L] ?? w.text.fi ?? w.text.en ?? { event: '', headline: '', description: '', instruction: '' };
  }
  function when(iso: string | null) {
    return iso ? `${weekday(L, new Date(iso), tz)} ${time(L, iso, tz)}` : '';
  }
  function areaNames(w: Warning, max = 4) {
    const names = w.areas.map((a) => a.name[L] ?? a.name.fi ?? '').filter(Boolean);
    const uniq = [...new Set(names)];
    return uniq.length > max ? `${uniq.slice(0, max).join(', ')} +${uniq.length - max}` : uniq.join(', ');
  }
</script>

<div class="warn">
  {#if data.here.length}
    <section class="panel">
      <h3>{t(L, 'warningsHere')}</h3>
      {#each data.here.slice(0, 3) as w (w.id)}
        <article>
          <span class="badge {w.color}"></span>
          <div>
            <div class="head">{txt(w).event}</div>
            <div class="desc">{txt(w).description ?? txt(w).headline}</div>
            <div class="valid">{t(L, 'valid')}: {when(w.onset)} – {when(w.expires)}</div>
          </div>
        </article>
      {/each}
    </section>
  {/if}
  {#if data.elsewhere.length}
    <section class="panel">
      <h3>{data.here.length ? t(L, 'warningsElsewhere') : t(L, 'slide.warnings')}</h3>
      {#each data.elsewhere.slice(0, data.here.length ? 3 : 6) as w (w.id)}
        <article class="compact">
          <span class="badge {w.color}"></span>
          <div>
            <div class="head">{txt(w).event} <small>· {areaNames(w)}</small></div>
            <div class="valid">{when(w.onset)} – {when(w.expires)}</div>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</div>

<style>
  .warn {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
  }
  section {
    flex: 1;
    overflow: hidden;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 32px;
    color: var(--c-accent);
    text-transform: uppercase;
  }
  article {
    display: flex;
    gap: 16px;
    margin: 0 0 14px;
  }
  .badge {
    flex: none;
    width: 30px;
    height: 30px;
    margin-top: 4px;
    border-radius: 50%;
    border: 3px solid rgba(0, 0, 0, 0.6);
  }
  .badge.green {
    background: #3fbf5a;
  }
  .badge.yellow {
    background: #ffd800;
  }
  .badge.orange {
    background: #ff8a00;
  }
  .badge.red {
    background: #e8202a;
  }
  .head {
    font-size: 30px;
    color: var(--c-value);
  }
  .head small {
    font-size: 24px;
    color: var(--c-label);
  }
  .desc {
    font-size: 25px;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .valid {
    font-size: 22px;
    color: var(--c-label);
  }
  .compact {
    margin-bottom: 8px;
  }
</style>
