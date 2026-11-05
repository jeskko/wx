<script lang="ts">
  // Bottom crawl: temperatures around Finland, active warnings, aurora status.
  import { t } from '../i18n';
  import { api } from '../lib/data';
  import { activity, outlook } from '../lib/aurora';
  import { num, temp } from '../lib/format';
  import type { Lang, Place } from '../lib/types';
  import { nearestStation } from '../lib/wx';

  let { lang, place }: { lang: Lang; place: Place | null } = $props();

  const CITIES = ['helsinki', 'turku', 'tampere', 'jyvaskyla', 'vaasa', 'kuopio', 'joensuu', 'oulu', 'kajaani', 'rovaniemi', 'sodankyla', 'ivalo', 'utsjoki', 'maarianhamina'];

  let items = $state<string[]>([]);

  async function refresh() {
    const out: string[] = [];
    try {
      const [pf, obs, w, a] = await Promise.all([
        api.places().catch(() => null),
        api.obs().catch(() => null),
        api.warnings().catch(() => null),
        api.aurora().catch(() => null),
      ]);
      if (w) {
        const active = w.warnings.filter((x) => !x.expires || Date.parse(x.expires) > Date.now());
        const severe = active.filter((x) => x.color === 'orange' || x.color === 'red');
        for (const x of [...severe, ...active.filter((y) => !severe.includes(y))].slice(0, 4)) {
          const tx = x.text[lang] ?? x.text.fi;
          if (tx?.headline) out.push(`⚠ ${tx.headline}`);
        }
      }
      if (pf && obs) {
        const temps = CITIES.map((id) => pf.places.find((p) => p.id === id))
          .filter((p): p is Place => !!p)
          .map((p) => {
            const st = nearestStation(obs.stations, p.lat, p.lon, 30);
            return st ? `${p.name[lang]} ${temp(st.t)}` : null;
          })
          .filter(Boolean);
        if (temps.length) out.push(temps.join('   '));
      }
      if (a && place) {
        const o = outlook(a, place.lat, place.lon, null, new Date());
        const strongest = (a.mag ?? []).reduce((m, s) => Math.max(m, s.range), 0);
        out.push(
          `${t(lang, 'slide.aurora')}: Kp ${num(lang, o.kpNow, 1)} · ${t(lang, 'localActivity')}: ${t(lang, `activity.${activity(strongest)}`)}`,
        );
      }
    } catch {
      /* keep old items */
    }
    if (out.length) items = out;
  }

  $effect(() => {
    void lang;
    void place;
    refresh();
    const id = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(id);
  });

  const text = $derived(items.join('     ◆     '));
  // constant reading speed: ~110 px/s at 1280 px stage width
  const seconds = $derived(Math.max(20, (text.length * 15 + 1280) / 110));
</script>

<footer class="ticker">
  <div class="tag">wx.fi</div>
  <div class="crawl">
    {#key text}
      <div class="run" style:animation-duration={`${seconds}s`}>{text}</div>
    {/key}
  </div>
</footer>

<style>
  .crawl {
    position: relative;
    overflow: hidden;
    flex: 1;
    height: 100%;
  }
  .run {
    position: absolute;
    white-space: nowrap;
    top: 50%;
    left: 0;
    transform: translate(1280px, -50%);
    animation: crawl linear infinite;
  }
  @keyframes crawl {
    from {
      transform: translate(1100px, -50%);
    }
    to {
      transform: translate(-100%, -50%);
    }
  }
</style>
