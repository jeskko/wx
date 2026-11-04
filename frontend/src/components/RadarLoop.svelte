<script lang="ts">
  // Radar frames (covering `extent`) shown inside a map window `view` of w x h px, looped.
  import type { Extent } from '../map/proj';

  let {
    urls,
    extent,
    view,
    w,
    h,
    frame = $bindable(0),
  }: { urls: string[]; extent: Extent; view: Extent; w: number; h: number; frame?: number } = $props();

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

  $effect(() => {
    const n = urls.length;
    let timer: number;
    const tick = () => {
      frame = (frame + 1) % n;
      timer = window.setTimeout(tick, frame === n - 1 ? 2200 : 380);
    };
    frame = 0;
    timer = window.setTimeout(tick, 600);
    return () => clearTimeout(timer);
  });
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
