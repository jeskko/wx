<script lang="ts">
  // Radar frames (covering `extent`) shown inside a map window `view` of w x h px, looped.
  import type { Extent } from '../map/proj';
  import { frameLoop } from '../lib/loop';

  let {
    urls,
    extent,
    view,
    w,
    h,
    frame = $bindable(0),
    slideSeconds = 12,
  }: { urls: string[]; extent: Extent; view: Extent; w: number; h: number; frame?: number; slideSeconds?: number } = $props();

  // where the full radar image lands relative to the window
  const box = $derived.by(() => {
    const sx = w / (view[2] - view[0]);
    const sy = h / (view[3] - view[1]);
    return {
      left: (extent[0] - view[0]) * sx,
      top: (view[3] - extent[3]) * sy,
      width: (extent[2] - extent[0]) * sx,
      height: (extent[3] - extent[1]) * sy,
    };
  });

  // passes fitted to the slide length (see lib/loop.ts)
  $effect(() => frameLoop(urls.length, slideSeconds, 380, 2200, (k) => (frame = k)));
</script>

<div
  class="radar"
  style:left={`${box.left}px`}
  style:top={`${box.top}px`}
  style:width={`${box.width}px`}
  style:height={`${box.height}px`}
>
  {#each urls as u, k (u)}
    <img src={u} alt="" class:on={k === frame} />
  {/each}
</div>

<style>
  .radar {
    position: absolute;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
  }
  img.on {
    opacity: 1;
  }
</style>
