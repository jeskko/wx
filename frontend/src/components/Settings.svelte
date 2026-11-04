<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../i18n';
  import type { Place } from '../lib/types';
  import { DEFAULT_CONFIG, shareUrl, type Config } from '../engine/config';

  let {
    config,
    allPlaces,
    onsave,
    onclose,
  }: { config: Config; allPlaces: Place[]; onsave: (c: Config) => void; onclose: () => void } = $props();

  // edit a copy taken when the dialog opens
  let c = $state(untrack(() => structuredClone($state.snapshot(config)) as Config));
  let copied = $state(false);
  const L = $derived(c.lang);

  function togglePlace(id: string) {
    c.places = c.places.includes(id) ? c.places.filter((x) => x !== id) : [...c.places, id];
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= c.slides.length) return;
    const s = [...c.slides];
    [s[i], s[j]] = [s[j], s[i]];
    c.slides = s;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(c));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      prompt('URL', shareUrl(c));
    }
  }
  const groups = $derived([
    { label: L === 'fi' ? 'Suomi' : 'Finland', items: allPlaces.filter((p) => p.country === 'FI') },
    { label: L === 'fi' ? 'Pohjoismaat ja lähialueet' : 'Nordics & nearby', items: allPlaces.filter((p) => p.country !== 'FI') },
  ]);
</script>

<div class="overlay" role="dialog" aria-label={t(L, 'settings')}>
  <div class="sheet">
    <h2>{t(L, 'settings')}</h2>

    <section class="row">
      <label>
        {L === 'fi' ? 'Kieli' : 'Language'}
        <select bind:value={c.lang}>
          <option value="fi">Suomi</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {L === 'fi' ? 'Teema' : 'Theme'}
        <select bind:value={c.theme}>
          <option value="retro">Retro</option>
          <option value="modern">{L === 'fi' ? 'Moderni' : 'Modern'}</option>
        </select>
      </label>
      <label>
        {t(L, 'music')}
        <input type="checkbox" bind:checked={c.music.enabled} />
      </label>
      <label class="grow">
        {L === 'fi' ? 'Äänenvoimakkuus' : 'Volume'}
        <input type="range" min="0" max="1" step="0.05" bind:value={c.music.volume} />
      </label>
    </section>
    <section>
      <label class="wide">
        {L === 'fi' ? 'Oma musiikkistriimi (URL, valinnainen)' : 'Custom music stream (URL, optional)'}
        <input type="url" placeholder="https://…" value={c.music.streamUrl ?? ''} oninput={(e) => (c.music.streamUrl = e.currentTarget.value || null)} />
      </label>
    </section>

    <h3>{L === 'fi' ? 'Paikkakunnat' : 'Places'}</h3>
    {#each groups as g (g.label)}
      <div class="chips">
        <span class="glabel">{g.label}</span>
        {#each g.items as p (p.id)}
          <button class="chip" class:on={c.places.includes(p.id)} onclick={() => togglePlace(p.id)}>{p.name[L]}</button>
        {/each}
      </div>
    {/each}

    <h3>{L === 'fi' ? 'Lentoasemat (ICAO, pilkulla erotettuna)' : 'Airports (ICAO, comma separated)'}</h3>
    <input class="wide" value={c.airports.join(', ')} oninput={(e) => (c.airports = e.currentTarget.value.split(/[ ,]+/).filter(Boolean).map((x) => x.toUpperCase()))} />

    <h3>{L === 'fi' ? 'Sivut' : 'Slides'}</h3>
    <ol class="slides">
      {#each c.slides as s, i (s.id)}
        <li>
          <input type="checkbox" bind:checked={s.enabled} />
          <span class="sname">{t(L, `slide.${s.id}` as 'slide.current')}</span>
          <input type="number" min="4" max="120" bind:value={s.duration} /> s
          <button onclick={() => move(i, -1)} aria-label="up">▲</button>
          <button onclick={() => move(i, 1)} aria-label="down">▼</button>
        </li>
      {/each}
    </ol>

    <div class="actions">
      <button onclick={copyLink}>{copied ? '✓' : L === 'fi' ? 'Kopioi jakolinkki' : 'Copy share link'}</button>
      <button onclick={() => (c = structuredClone(DEFAULT_CONFIG))}>{L === 'fi' ? 'Oletukset' : 'Defaults'}</button>
      <span class="spacer"></span>
      <button onclick={onclose}>{L === 'fi' ? 'Peruuta' : 'Cancel'}</button>
      <button class="primary" disabled={!c.places.length} onclick={() => onsave($state.snapshot(c) as Config)}>{L === 'fi' ? 'Tallenna' : 'Save'}</button>
    </div>
    <p class="hint">
      {L === 'fi'
        ? 'Näppäimet: ← → selaa · välilyönti tauko · M musiikki · F koko näyttö · S asetukset'
        : 'Keys: ← → browse · space pause · M music · F fullscreen · S settings'}
    </p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow-y: auto;
    z-index: 100;
    padding: 24px 16px;
  }
  .sheet {
    background: #f4f6fb;
    color: #111;
    font-family: system-ui, sans-serif;
    font-size: 15px;
    border-radius: 10px;
    padding: 20px 24px;
    width: min(760px, 100%);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  h2 {
    margin: 0 0 12px;
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 15px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .wide {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    margin-top: 10px;
  }
  input.wide {
    box-sizing: border-box;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
    align-items: center;
  }
  .glabel {
    width: 100%;
    font-size: 13px;
    color: #555;
  }
  .chip {
    border: 1px solid #99a;
    background: #fff;
    border-radius: 14px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .chip.on {
    background: #1a3fb8;
    border-color: #1a3fb8;
    color: #fff;
  }
  .slides {
    padding-left: 22px;
    margin: 0;
  }
  .slides li {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 3px 0;
  }
  .sname {
    flex: 1;
  }
  .slides input[type='number'] {
    width: 56px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }
  .spacer {
    flex: 1;
  }
  button {
    padding: 6px 12px;
    cursor: pointer;
  }
  .primary {
    background: #1a3fb8;
    color: #fff;
    border: 0;
    border-radius: 4px;
  }
  .hint {
    font-size: 13px;
    color: #555;
    margin: 12px 0 0;
  }
</style>
