// Background music: the selected playlists from /wx/music/playlists.json (shuffled together), or a
// user stream URL.
//
// Browsers refuse audible playback until the user has interacted with the page. The player
// therefore tracks what the user *wants* (on/off) separately from what the <audio> element is
// doing: if play() is refused, it stays "blocked" and retries on the next click/keypress
// anywhere on the page. The UI shows the wanted state, so one press always toggles.

export interface Track {
  src: string; // relative to /wx/music/ or absolute URL
  title: string;
  artist: string;
  license: string;
  url?: string; // source page for attribution
}

export const MUSIC_BASE = '/wx/music/';

export interface Playlist {
  id: string;
  fi: string;
  en: string;
  tracks: Track[];
}

let lists: Promise<Playlist[]> | null = null;

/** All playlists (cached for the session; the file changes only on deploy). */
export function loadPlaylists(): Promise<Playlist[]> {
  lists ??= fetch(`${MUSIC_BASE}playlists.json?t=${Math.floor(Date.now() / 3600_000)}`)
    .then((r) => (r.ok ? r.json() : { playlists: [] }))
    .then((d) =>
      (Array.isArray(d.playlists) ? d.playlists : []).map((p: Playlist) => ({
        ...p,
        tracks: (p.tracks ?? []).filter((t) => t && typeof t.src === 'string'),
      })),
    )
    .catch(() => {
      lists = null;
      return [];
    });
  return lists!;
}

/** Tracks of the chosen playlists; none chosen (or unknown ids) = the first playlist. */
export async function loadPlaylist(ids: string[] = []): Promise<Track[]> {
  const all = await loadPlaylists();
  const chosen = all.filter((p) => ids.includes(p.id));
  return (chosen.length ? chosen : all.slice(0, 1)).flatMap((p) => p.tracks);
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type MusicState = 'off' | 'playing' | 'blocked' | 'unavailable';

export class MusicPlayer {
  private audio = new Audio();
  private queue: Track[] = [];
  private tracks: Track[] = [];
  private stream: string | null = null;
  private targetVolume = 0.5;
  private fadeTimer: number | null = null;
  private gestureHooked = false;
  wanted = false;
  state: MusicState = 'off';
  current: Track | null = null;
  onchange: (() => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => {
      // skip broken tracks; a broken stream just stops
      if (this.wanted && !this.stream && this.tracks.length) window.setTimeout(() => this.next(), 1000);
    });
  }

  configure(tracks: Track[], streamUrl: string | null, volume: number) {
    const key = (ts: Track[]) => ts.map((t) => t.src).sort().join('|');
    const changed = streamUrl !== this.stream || key(tracks) !== key(this.tracks);
    this.tracks = tracks;
    this.stream = streamUrl;
    this.setVolume(volume);
    if (!changed) return;
    // new selection: forget the old shuffle and, if music is on, switch right away
    this.queue = [];
    this.audio.pause();
    if (this.wanted && this.available) {
      this.load();
      void this.attempt();
    } else {
      this.audio.removeAttribute('src');
      if (this.wanted) this.set('unavailable');
    }
  }

  get available(): boolean {
    return !!this.stream || this.tracks.length > 0;
  }

  setVolume(v: number) {
    this.targetVolume = Math.min(1, Math.max(0, v));
    if (!this.fadeTimer) this.audio.volume = this.targetVolume;
  }

  /** Turn music on (if possible). Safe to call outside a user gesture. */
  play() {
    this.wanted = true;
    if (!this.available) return this.set('unavailable');
    if (!this.audio.getAttribute('src')) this.load();
    void this.attempt();
  }

  /** Jump to the next shuffled track (no-op for a stream or while music is off). */
  skip() {
    if (this.stream || !this.tracks.length || !this.wanted) return;
    this.audio.pause();
    this.next();
  }

  stop() {
    this.wanted = false;
    this.audio.pause();
    this.set('off');
  }

  toggle() {
    // when blocked, the user's press is exactly the gesture we were waiting for: start now
    if (this.wanted && this.state !== 'blocked') this.stop();
    else this.play();
  }

  private set(s: MusicState) {
    this.state = s;
    this.onchange?.();
  }

  private load() {
    if (this.stream) {
      this.current = { src: this.stream, title: 'Stream', artist: '', license: '' };
      this.audio.src = this.stream;
      return;
    }
    if (!this.queue.length) this.queue = shuffle(this.tracks);
    this.current = this.queue.shift()!;
    this.audio.src = /^https?:/.test(this.current.src) ? this.current.src : MUSIC_BASE + this.current.src;
    this.onchange?.();
  }

  private next() {
    if (this.stream || !this.tracks.length) return;
    this.load();
    if (this.wanted) void this.attempt();
  }

  private async attempt() {
    this.audio.volume = 0;
    try {
      await this.audio.play();
    } catch (e) {
      if (!this.wanted) return;
      if ((e as DOMException)?.name === 'NotAllowedError') {
        this.audio.pause();
        this.set('blocked');
        this.hookGesture();
      }
      return;
    }
    if (!this.wanted) {
      // turned off while play() was pending
      this.audio.pause();
      return;
    }
    this.set('playing');
    this.fadeIn();
  }

  private fadeIn() {
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
  }

  /** Retry playback inside the next user gesture (play() must be called synchronously there). */
  private hookGesture() {
    if (this.gestureHooked) return;
    this.gestureHooked = true;
    const retry = () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
      this.gestureHooked = false;
      if (this.wanted && this.state === 'blocked') void this.attempt();
    };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
  }
}
