<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../i18n';
  import type { Place } from '../lib/types';
  import { DEFAULT_CONFIG, shareUrl, slideOnFor, type Config } from '../engine/config';
  import { SLIDES } from '../engine/registry';

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
  /** Per-place switch for place-scoped slides (stored as exceptions in c.off). */
  function toggleCell(placeId: string, slideId: string) {
    const cur = new Set(c.off[placeId] ?? []);
    if (cur.has(slideId)) cur.delete(slideId);
    else cur.add(slideId);
    const off = { ...c.off };
    if (cur.size) off[placeId] = [...cur];
    else delete off[placeId];
    c.off = off;
  }
  function toggleIn(key: 'auroraPlaces' | 'almanacPlaces', id: string) {
    const cur = c[key];
    c[key] = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }
  const chosen = $derived(c.places.map((id) => allPlaces.find((p) => p.id === id)).filter((p): p is Place => !!p));

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

    {#snippet picker(key: 'auroraPlaces' | 'almanacPlaces', title: string)}
      <h3>{title}</h3>
      <div class="chips">
        {#each allPlaces as p (p.id)}
          <button
            class="chip"
            class:on={c[key].includes(p.id)}
            disabled={!c[key].includes(p.id) && c[key].length >= 7}
            onclick={() => toggleIn(key, p.id)}>{p.name[L]}</button
          >
        {/each}
      </div>
    {/snippet}
    <p class="hint">
      {L === 'fi'
        ? 'Koostesivujen paikkakunnat (enintään 7). Jos mitään ei ole valittu, käytetään omia paikkakuntia.'
        : 'Places on the summary slides (up to 7). If none is selected, your own places are used.'}
    </p>
    {@render picker('auroraPlaces', L === 'fi' ? 'Revontulikatsaus' : 'Aurora summary')}
    {@render picker('almanacPlaces', L === 'fi' ? 'Almanakka' : 'Almanac')}

    <h3>{L === 'fi' ? 'Lentoasemat (ICAO, pilkulla erotettuna)' : 'Airports (ICAO, comma separated)'}</h3>
    <input class="wide" value={c.airports.join(', ')} oninput={(e) => (c.airports = e.currentTarget.value.split(/[ ,]+/).filter(Boolean).map((x) => x.toUpperCase()))} />

    <h3>{L === 'fi' ? 'Sivut ja paikkakunnat' : 'Slides per place'}</h3>
    <p class="hint">
      {L === 'fi'
        ? 'Ensimmäinen ruutu kytkee sivun päälle tai pois kokonaan. Paikkakuntasarakkeista valitaan, millä paikkakunnilla paikkakuntakohtainen sivu näytetään. Koko maan sivut näytetään kerran kierroksessa.'
        : 'The first box switches a slide on or off entirely. The place columns choose where a per-place slide is shown. Country-wide slides show once per loop.'}
    </p>
    <div class="matrix-wrap">
      <table class="matrix">
        <thead>
          <tr>
            <th class="sl">{L === 'fi' ? 'Sivu' : 'Slide'}</th>
            <th>{L === 'fi' ? 'Päällä' : 'On'}</th>
            {#each chosen as p (p.id)}<th class="pl"><span>{p.name[L]}</span></th>{/each}
            <th>s</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each c.slides as s, i (s.id)}
            {@const perPlace = SLIDES[s.id]?.scope === 'place'}
            <tr class:dim={!s.enabled}>
              <td class="sl">{t(L, `slide.${s.id}` as 'slide.current')}</td>
              <td class="c"><input type="checkbox" bind:checked={s.enabled} aria-label="on" /></td>
              {#if perPlace}
                {#each chosen as p (p.id)}
                  <td class="c">
                    <input
                      type="checkbox"
                      checked={slideOnFor(c, p.id, s.id)}
                      disabled={!s.enabled}
                      onchange={() => toggleCell(p.id, s.id)}
                      aria-label={p.name[L]}
                    />
                  </td>
                {/each}
              {:else}
                <td class="once" colspan={Math.max(1, chosen.length)}>{L === 'fi' ? 'kerran kierroksessa' : 'once per loop'}</td>
              {/if}
              <td class="c"><input type="number" min="4" max="120" bind:value={s.duration} /></td>
              <td class="c nowrap">
                <button onclick={() => move(i, -1)} aria-label="up">▲</button>
                <button onclick={() => move(i, 1)} aria-label="down">▼</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

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
  .matrix-wrap {
    overflow-x: auto;
    border: 1px solid #ccd;
    border-radius: 6px;
  }
  .matrix {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
  }
  .matrix th,
  .matrix td {
    padding: 3px 6px;
    border-bottom: 1px solid #e2e5ee;
  }
  .matrix thead th {
    background: #e8ecf6;
    font-weight: 600;
    vertical-align: bottom;
  }
  .matrix .pl span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    display: inline-block;
    max-height: 110px;
  }
  .matrix .sl {
    text-align: left;
    white-space: nowrap;
  }
  .matrix .c {
    text-align: center;
  }
  .matrix .once {
    text-align: center;
    color: #778;
    font-style: italic;
  }
  .matrix tr.dim td {
    color: #99a;
  }
  .matrix input[type='number'] {
    width: 52px;
  }
  .matrix button {
    padding: 1px 6px;
  }
  .nowrap {
    white-space: nowrap;
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
