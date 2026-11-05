<script lang="ts" module>
  export interface RegionalRow {
    id: string;
    name: string;
    t: number | null;
    sym: string | null;
    night: boolean;
    ws: number | null;
    wd: number | null;
  }
</script>

<script lang="ts">
  import WindDir from '../components/WindDir.svelte';
  import WxIcon from '../components/WxIcon.svelte';
  import { num, temp } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<RegionalRow[]> = $props();
  const L = $derived(ctx.lang);
  const half = $derived(Math.ceil(data.length / 2));
  const cols = $derived([data.slice(0, half), data.slice(half)]);
</script>

<div class="grid">
  {#each cols as col, ci (ci)}
    <div class="panel">
      <table>
        <tbody>
          {#each col as r (r.id)}
            <tr>
              <td class="name">{r.name}</td>
              <td class="icon"><WxIcon sym={r.sym} night={r.night} size={44} /></td>
              <td class="t">{temp(r.t)}</td>
              <td class="w">{#if r.ws != null}<WindDir lang={L} deg={r.wd} /> {num(L, r.ws)}{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    height: 100%;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 33px;
  }
  td {
    padding: 3px 6px;
    height: 54px;
  }
  .name {
    color: var(--c-value);
  }
  .icon {
    width: 56px;
    text-align: center;
  }
  .t {
    text-align: right;
    font-weight: 700;
    color: var(--c-accent);
    width: 100px;
  }
  .w {
    text-align: right;
    color: var(--c-label);
    font-size: 26px;
    width: 120px;
  }
</style>
