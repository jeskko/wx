<script lang="ts">
  import { fade } from 'svelte/transition';
  import Header from './components/Header.svelte';
  import Settings from './components/Settings.svelte';
  import Ticker from './components/Ticker.svelte';
  import { MusicPlayer, loadPlaylist, type MusicState } from './engine/audio';
  import { loadConfig, saveConfig, slideOnFor, type Config } from './engine/config';
  import { SLIDES } from './engine/registry';
  import type { SlideCtx, SlideDef } from './engine/types';
  import { t } from './i18n';
  import { api } from './lib/data';
  import type { Place } from './lib/types';
  import { tzFor } from './lib/wx';

  const initial = loadConfig();
  let config = $state<Config>(initial.config);
  let allPlaces = $state<Place[]>([]);
  let started = $state(false);
  let paused = $state(false);
  let showSettings = $state(false);
  let musicWanted = $state(false);
  let musicState = $state<MusicState>('off');
  let error = $state<string | null>(null);

  interface Shown {
    key: number;
    def: SlideDef<any>;
    ctx: SlideCtx;
    data: unknown;
    duration: number;
  }
  let shown = $state<Shown | null>(null);
  let keyCounter = 0;
  let index = -1;
  let timer: number | undefined;
  let busy = false;

  const player = new MusicPlayer();
  player.onchange = () => {
    musicWanted = player.wanted;
    musicState = player.state;
  };

  // stage scale: fixed 1280x720 design, letterboxed
  let scale = $state(1);
  function rescale() {
    scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  }
  rescale();

  const places = $derived(
    config.places.map((id) => allPlaces.find((p) => p.id === id)).filter((p): p is Place => !!p),
  );

  /** Ordered list of (slide, place) for one loop. */
  const sequence = $derived.by(() => {
    const ps = places.length ? places : allPlaces.slice(0, 1);
    const enabled = config.slides.filter((s) => s.enabled && SLIDES[s.id]);
    const seq: { id: string; duration: number; place: Place }[] = [];
    for (const p of ps)
      for (const s of enabled)
        if (SLIDES[s.id].scope === 'place' && slideOnFor(config, p.id, s.id)) seq.push({ id: s.id, duration: s.duration, place: p });
    for (const s of enabled) if (SLIDES[s.id].scope === 'global') seq.push({ id: s.id, duration: s.duration, place: ps[0] });
    return seq;
  });

  async function go(dir: 1 | -1 = 1) {
    if (busy || !sequence.length) return;
    busy = true;
    clearTimeout(timer);
    try {
      for (let tries = 0; tries < sequence.length; tries++) {
        index = (index + dir + sequence.length) % sequence.length;
        const item = sequence[index];
        const def = SLIDES[item.id];
        const ctx: SlideCtx = { lang: config.lang, config, place: item.place, places, now: new Date(), duration: item.duration };
        let data: unknown = null;
        try {
          data = await def.prepare(ctx);
        } catch (e) {
          console.warn('slide', item.id, e);
        }
        if (data != null) {
          shown = { key: ++keyCounter, def, ctx, data, duration: item.duration };
          error = null;
          schedule(item.duration);
          return;
        }
      }
      error = t(config.lang, 'noData');
      schedule(30);
    } finally {
      busy = false;
    }
  }

  function schedule(seconds: number) {
    clearTimeout(timer);
    if (!paused) timer = window.setTimeout(() => go(1), seconds * 1000);
  }

  /** Starts by itself once places are known. Music starts too if the browser allows it;
   *  otherwise the player waits for the first click/keypress (see MusicPlayer). */
  async function start() {
    if (started) return;
    started = true;
    void requestWakeLock();
    void go(1);
    if (config.music.enabled) {
      player.configure(await loadPlaylist(), config.music.streamUrl, config.music.volume);
      player.play();
    }
  }

  async function toggleMusic() {
    if (!player.available) player.configure(await loadPlaylist(), config.music.streamUrl, config.music.volume);
    player.toggle();
  }

  // --- kiosk helpers
  let wakeLock: WakeLockSentinel | null = null;
  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* not supported / denied */
    }
  }
  function onVisibility() {
    if (document.visibilityState === 'visible' && started && (!wakeLock || wakeLock.released)) void requestWakeLock();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function onKey(e: KeyboardEvent) {
    if (showSettings) {
      if (e.key === 'Escape') showSettings = false;
      return;
    }
    if (!started) return;
    switch (e.key) {
      case 'ArrowRight':
        void go(1);
        break;
      case 'ArrowLeft':
        void go(-1);
        break;
      case ' ':
        e.preventDefault();
        paused = !paused;
        if (paused) clearTimeout(timer);
        else schedule(shown?.duration ?? 10);
        break;
      case 'm':
      case 'M':
        void toggleMusic();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 's':
      case 'S':
        if (!config.kiosk) showSettings = true;
        break;
    }
  }

  function saveSettings(c: Config) {
    config = c;
    saveConfig(c);
    showSettings = false;
    if (!c.music.enabled) player.stop();
    else
      void loadPlaylist().then((tr) => {
        player.configure(tr, c.music.streamUrl, c.music.volume);
        if (!player.wanted) player.play();
      });
    index = -1;
    void go(1);
  }

  $effect(() => {
    api
      .places()
      .then((pf) => (allPlaces = pf.places))
      .catch(() => (error = 'places.json'));
    window.addEventListener('resize', rescale);
    document.addEventListener('visibilitychange', onVisibility);
    // kiosk safety net: reload once a day (picks up new deploys, frees memory)
    const reload = window.setTimeout(() => location.reload(), 24 * 3600_000);
    return () => {
      window.removeEventListener('resize', rescale);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(reload);
      clearTimeout(timer);
    };
  });

  // start as soon as the place list is known
  $effect(() => {
    if (allPlaces.length && !started) void start();
  });

  $effect(() => {
    document.documentElement.dataset.theme = config.theme;
    document.documentElement.lang = config.lang;
  });

  const title = $derived(shown ? t(config.lang, shown.def.title) : 'wx.fi');
  const subtitle = $derived(shown && (shown.def.scope === 'place' || places.length <= 1) ? shown.ctx.place.name[config.lang] : '');
  const tz = $derived(tzFor(shown?.ctx.place.country ?? places[0]?.country ?? 'FI'));
</script>

<svelte:window onkeydown={onKey} />

<div class="viewport">
  <div class="stage" style:transform={`translate(-50%, -50%) scale(${scale})`}>
    <Header {title} {subtitle} lang={config.lang} {tz} />
    <main class="body">
      {#if shown}
        {#key shown.key}
          <div class="slide" in:fade={{ duration: 450, delay: 200 }} out:fade={{ duration: 200 }}>
            <shown.def.component ctx={shown.ctx} data={shown.data} />
          </div>
        {/key}
        <div class="progress" class:paused>
          {#key shown.key}
            <div class="bar" style:animation-duration={`${shown.duration}s`}></div>
          {/key}
        </div>
      {:else}
        <div class="msg">{error ?? t(config.lang, 'loading')}</div>
      {/if}
    </main>
    <Ticker lang={config.lang} place={places[0] ?? null} />
  </div>
  {#if !config.kiosk}
    <div class="controls">
      <button title="M" class:blocked={musicState === 'blocked'} onclick={() => void toggleMusic()}>
        {musicWanted && musicState !== 'unavailable' ? '♪' : '♪̸'}
      </button>
      <button title="F" onclick={toggleFullscreen}>⛶</button>
      <button title={t(config.lang, 'settings')} onclick={() => (showSettings = true)}>⚙</button>
    </div>
  {/if}
  {#if musicState === 'blocked' && !config.kiosk}
    <div class="musichint">♪ {t(config.lang, 'musicHint')}</div>
  {/if}
</div>

{#if showSettings}
  <Settings {config} {allPlaces} onsave={saveSettings} onclose={() => (showSettings = false)} />
{/if}
