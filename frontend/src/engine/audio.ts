// Background music: shuffled playlist from /wx/music/playlist.json, or a user stream URL.
// Browsers block autoplay until a user gesture, so start() must be called from one.

export interface Track {
  src: string; // relative to /wx/music/ or absolute URL
  title: string;
  artist: string;
  license: string;
  url?: string; // source page for attribution
}

export const MUSIC_BASE = '/wx/music/';

export async function loadPlaylist(): Promise<Track[]> {
  try {
    const r = await fetch(`${MUSIC_BASE}playlist.json?t=${Math.floor(Date.now() / 3600_000)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.tracks) ? d.tracks.filter((t: Track) => t && typeof t.src === 'string') : [];
  } catch {
    return [];
  }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class MusicPlayer {
  private audio = new Audio();
  private queue: Track[] = [];
  private tracks: Track[] = [];
  private stream: string | null = null;
  private targetVolume = 0.5;
  private fadeTimer: number | null = null;
  current: Track | null = null;
  onchange: (() => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => {
      // skip broken tracks; a broken stream just stops
      if (!this.stream) window.setTimeout(() => this.next(), 1000);
    });
  }

  configure(tracks: Track[], streamUrl: string | null, volume: number) {
    this.tracks = tracks;
    this.stream = streamUrl;
    this.setVolume(volume);
  }

  get available(): boolean {
    return !!this.stream || this.tracks.length > 0;
  }

  get playing(): boolean {
    return !this.audio.paused;
  }

  setVolume(v: number) {
    this.targetVolume = Math.min(1, Math.max(0, v));
    if (!this.fadeTimer) this.audio.volume = this.targetVolume;
  }

  async start() {
    if (!this.available) return;
    if (this.stream) {
      this.current = { src: this.stream, title: 'Stream', artist: '', license: '' };
      this.audio.src = this.stream;
    } else {
      this.next(false);
    }
    await this.playWithFade();
  }

  private next(play = true) {
    if (this.stream || !this.tracks.length) return;
    if (!this.queue.length) this.queue = shuffle(this.tracks);
    this.current = this.queue.shift()!;
    this.audio.src = /^https?:/.test(this.current.src) ? this.current.src : MUSIC_BASE + this.current.src;
    this.onchange?.();
    if (play) void this.playWithFade();
  }

  private async playWithFade() {
    this.audio.volume = 0;
    try {
      await this.audio.play();
    } catch {
      return; // autoplay blocked; the start screen will retry on a gesture
    }
    const step = this.targetVolume / 20;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = window.setInterval(() => {
      const v = Math.min(this.targetVolume, this.audio.volume + step);
      this.audio.volume = v;
      if (v >= this.targetVolume) {
        clearInterval(this.fadeTimer!);
        this.fadeTimer = null;
      }
    }, 100);
    this.onchange?.();
  }

  toggle() {
    if (this.audio.paused) {
      if (this.audio.src) void this.playWithFade();
      else void this.start();
    } else {
      this.audio.pause();
      this.onchange?.();
    }
  }

  stop() {
    this.audio.pause();
    this.onchange?.();
  }
}
