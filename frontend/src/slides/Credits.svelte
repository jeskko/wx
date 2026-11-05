<script lang="ts">
  import { t } from '../i18n';
  import { autoscroll } from '../lib/autoscroll';
  import type { Track } from '../engine/audio';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<{ tracks: Track[] }> = $props();
  const L = $derived(ctx.lang);

  // group tracks by artist + license: "Artist — “A”, “B” (CC BY 4.0)"
  const byArtist = $derived.by(() => {
    const m = new Map<string, { artist: string; license: string; titles: string[] }>();
    for (const tr of data.tracks) {
      const k = `${tr.artist}|${tr.license}`;
      if (!m.has(k)) m.set(k, { artist: tr.artist, license: tr.license, titles: [] });
      m.get(k)!.titles.push(tr.title);
    }
    return [...m.values()];
  });

  const SOURCES = $derived([
    { name: 'Natural Earth', what: { fi: 'karttapohjat', en: 'base maps' }, lic: 'public domain' },
    { name: 'GeoNames', what: { fi: 'paikkahaku', en: 'place search' }, lic: 'CC BY 4.0' },
    { name: 'Ilmatieteen laitos / Finnish Meteorological Institute', what: { fi: 'havainnot, ennusteet, tutka, salamat, merisää, ilmanlaatu, varoitukset, magnetometrit', en: 'observations, forecasts, radar, lightning, sea, air quality, warnings, magnetometers' }, lic: 'CC BY 4.0' },
    { name: 'SMHI', what: { fi: 'havainnot Ruotsista', en: 'observations in Sweden' }, lic: 'CC BY 4.0' },
    { name: 'DMI', what: { fi: 'havainnot Tanskasta ja Färsaarilta', en: 'observations in Denmark and the Faroe Islands' }, lic: 'CC BY 4.0' },
    { name: 'Keskkonnaagentuur / Estonian Environment Agency', what: { fi: 'havainnot Virosta', en: 'observations in Estonia' }, lic: L === 'fi' ? 'avoin data' : 'open data' },
    { name: 'Veðurstofa Íslands / Icelandic Met Office', what: { fi: 'havainnot Islannista', en: 'observations in Iceland' }, lic: L === 'fi' ? 'avoin data' : 'open data' },
    { name: 'Fintraffic / Digitraffic', what: { fi: 'ajokeli, tiesääasemat, kelikamerat ja liikennetiedotteet', en: 'road conditions, road weather stations, weather cameras and traffic announcements' }, lic: 'CC BY 4.0' },
    { name: 'ECMWF', what: { fi: 'maailmankartat (Ilmatieteen laitoksen avoimen datan kautta)', en: 'world maps (via FMI open data)' }, lic: 'CC BY 4.0' },
    { name: 'MET Norway', what: { fi: 'sadetutkan lyhyt ennuste, ennusteet Suomen ulkopuolelle ja haetuille paikoille', en: 'precipitation nowcast, forecasts outside Finland and for searched places' }, lic: 'CC BY 4.0' },
    { name: 'CelesTrak', what: { fi: 'avaruusasemien ratatiedot (ylilennot lasketaan SGP4-mallilla)', en: 'space station orbital elements (passes computed with SGP4)' }, lic: L === 'fi' ? 'avoin data' : 'open data' },
    { name: 'NOAA Aviation Weather Center', what: { fi: 'METAR, TAF', en: 'METAR, TAF' }, lic: 'public domain' },
    { name: 'NOAA Space Weather Prediction Center', what: { fi: 'Kp-indeksi, revontuliovaali, aurinkotuuli', en: 'Kp index, auroral oval, solar wind' }, lic: 'public domain' },
  ]);
</script>

<div class="panel credits" use:autoscroll={{ total: ctx.duration * 1000 }}>
  <p class="lead">{t(L, 'credits')}</p>
  <ul>
    {#each SOURCES as s (s.name)}
      <li><b>{s.name}</b> — {s.what[L]} <span class="lic">({s.lic})</span></li>
    {/each}
  </ul>
  {#if data.tracks.length}
    <h3>{t(L, 'music')}</h3>
    <ul class="music">
      {#each byArtist as g (g.artist + g.license)}
        <li><b>{g.artist}</b> — {g.titles.map((x) => `“${x}”`).join(', ')} <span class="lic">({g.license})</span></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .credits {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 25px;
  }
  .lead {
    font-size: 36px;
    color: var(--c-accent);
    margin: 0 0 6px;
  }
  ul {
    margin: 0;
    padding-left: 1.1em;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .music {
    font-size: 21px;
    line-height: 1.25;
  }
  h3 {
    margin: 12px 0 0;
    font-size: 28px;
    color: var(--c-accent);
  }
  .lic {
    color: var(--c-label);
  }
  .credits > :global(*) {
    flex: none;
  }
</style>
