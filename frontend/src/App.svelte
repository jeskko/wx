<script lang="ts">
  import { fade } from 'svelte/transition';
  import Header from './components/Header.svelte';
  import Settings from './components/Settings.svelte';
  import Ticker from './components/Ticker.svelte';
  import Teletext from './teletext/Teletext.svelte';
  import { MusicPlayer, loadPlaylist, type MusicState } from './engine/audio';
  import { loadConfig, saveConfig, slideOnFor, type Config } from './engine/config';
  import { SLIDES } from './engine/registry';
  import type { SlideCtx, SlideDef } from './engine/types';
  import { t } from './i18n';
  import { api, setCustomPlaces } from './lib/data';
  import type { Place } from './lib/types';
  import { placeTz } from './lib/wx';
  import { capitalPlaces } from './lib/world';

  const initial = loadConfig();
  let config = $state<Config>(initial.config);
  let curated = $state<Place[]>([]);
  setCustomPlaces(initial.config.custom);
  // curated places (places.json) + places the viewer added with the place search
  const allPlaces = $derived(curated.length ? [...curated, ...config.custom.filter((p) => !curated.some((q) => q.id === p.id))] : []);
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
    for (const s of enabled) {
      const scope = SLIDES[s.id].scope;
      if (scope === 'global') seq.push({ id: s.id, duration: s.duration, place: ps[0] });
      else if (scope === 'capital')
        for (const c of capitalPlaces(config.capitals)) seq.push({ id: s.id, duration: s.duration, place: c });
    }
    return seq;
  });

  /** Teletext mode runs its own page carousel (teletext/Teletext.svelte). */
  const teletext = $derived(config.theme === 'teletext');

  async function go(dir: 1 | -1 = 1) {
    if (config.theme === 'teletext') {
      clearTimeout(timer);
      return;
    }
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
      player.configure(await loadPlaylist(config.music.playlists), config.music.streamUrl, config.music.volume);
      player.play();
    }
  }

  // "now playing" toast after a manual skip
  let nowPlaying = $state<string | null>(null);
  let toastTimer = 0;
  function skipTrack() {
    if (!player.wanted || musicState !== 'playing') return;
    player.skip();
    const tr = player.current;
    if (!tr) return;
    nowPlaying = tr.artist ? `${tr.title} — ${tr.artist.replace(/\s*\(.*\)$/, '')}` : tr.title;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (nowPlaying = null), 4000);
  }

  async function toggleMusic() {
    if (!player.available) player.configure(await loadPlaylist(config.music.playlists), config.music.streamUrl, config.music.volume);
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
    // teletext handles its own navigation keys
    if (teletext && ['ArrowRight', 'ArrowLeft', ' '].includes(e.key)) return;
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
      case 'n':
      case 'N':
        skipTrack();
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
    setCustomPlaces(c.custom);
    config = c;
    saveConfig(c);
    showSettings = false;
    if (!c.music.enabled) player.stop();
    else
      void loadPlaylist(c.music.playlists).then((tr) => {
        player.configure(tr, c.music.streamUrl, c.music.volume);
        if (!player.wanted) player.play();
      });
    index = -1;
    void go(1);
  }

  $effect(() => {
    api
      .places()
      .then((pf) => (curated = pf.places))
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
  const subtitle = $derived(
    shown && (shown.def.scope !== 'global' || places.length <= 1) ? shown.ctx.place.name[config.lang] : '',
  );
  const tz = $derived(placeTz(shown?.ctx.place ?? places[0] ?? { country: 'FI' }));
</script>

<svelte:window onkeydown={onKey} />

<div class="viewport">
  {#if teletext}
    {#if started}
      <Teletext {config} places={places.length ? places : allPlaces.slice(0, 1)} />
    {/if}
  {:else}
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
  {/if}
  {#if !config.kiosk}
    <div class="controls">
      <a class="gh" href="https://github.com/jeskko/wx" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub">
        <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"
          ><path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
          /></svg
        ></a
      >
      <button
        title="M"
        class:blocked={musicState === 'blocked'}
        class:off={!musicWanted || musicState === 'unavailable'}
        aria-pressed={musicWanted && musicState !== 'unavailable'}
        onclick={() => void toggleMusic()}>♫</button
      >
      {#if musicWanted && musicState === 'playing'}
        <button title="N" onclick={skipTrack}>⏭</button>
      {/if}
      <button title="F" onclick={toggleFullscreen}>⛶</button>
      <button title={t(config.lang, 'settings')} onclick={() => (showSettings = true)}>⚙</button>
    </div>
  {/if}
  {#if nowPlaying}
    <div class="nowplaying">♫ {nowPlaying}</div>
  {/if}
  {#if musicState === 'blocked' && !config.kiosk}
    <div class="musichint">♫ {t(config.lang, 'musicHint')}</div>
  {/if}
</div>

{#if showSettings}
  <Settings {config} allPlaces={curated} onsave={saveSettings} onclose={() => (showSettings = false)} />
{/if}
