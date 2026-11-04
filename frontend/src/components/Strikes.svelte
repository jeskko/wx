<script lang="ts">
  // Lightning strikes of the last hour drawn over a map window; newer = brighter.
  import { pixel, type Extent } from '../map/proj';
  import type { LightningFile } from '../lib/types';

  let { strikes, view, w, h, now }: { strikes: LightningFile['strikes']; view: Extent; w: number; h: number; now: Date } = $props();

  const pts = $derived.by(() => {
    const px = pixel(view, w, h);
    const t = now.getTime() / 1000;
    return strikes
      .map(([la, lo, ts, cloud]) => {
        const [x, y] = px.fromLatLon(la, lo);
        return { x, y, age: (t - ts) / 60, cloud };
      })
      .filter((p) => p.x >= -5 && p.x <= w + 5 && p.y >= -5 && p.y <= h + 5 && p.age < 60)
      .sort((a, b) => b.age - a.age);
  });
  const color = (age: number) => (age < 10 ? '#ffffff' : age < 30 ? '#ffe14a' : '#ff8a1e');
</script>

{#if pts.length}
  <svg class="strikes" width={w} height={h}>
    {#each pts as p, i (i)}
      {#if p.cloud}
        <circle cx={p.x} cy={p.y} r="2.5" fill={color(p.age)} stroke="#000" stroke-width="0.8" opacity={p.age < 30 ? 1 : 0.7} />
      {:else}
        <path d={`M${p.x - 5} ${p.y}h10M${p.x} ${p.y - 5}v10`} stroke="#000" stroke-width="4" />
        <path d={`M${p.x - 5} ${p.y}h10M${p.x} ${p.y - 5}v10`} stroke={color(p.age)} stroke-width="2" opacity={p.age < 30 ? 1 : 0.75} />
      {/if}
    {/each}
  </svg>
{/if}

<style>
  .strikes {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }
</style>
