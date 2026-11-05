<script lang="ts">
  import { capitalize } from '../lib/format';
  import { flagDaysOn } from '../lib/flagdays';
  import { LOCALE } from '../i18n';
  import type { Lang } from '../lib/types';

  let { title, subtitle = '', lang, tz }: { title: string; subtitle?: string; lang: Lang; tz: string } = $props();

  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });
  const clock = $derived(now.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz }));
  // Finnish flag day today (Finnish calendar date); recomputed when the date changes
  const fiDate = $derived(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' }));
  const flag = $derived.by(() => {
    void fiDate;
    const f = flagDaysOn(now)[0];
    if (!f) return null;
    // header shows the short form: "Mikael Agricolan päivä, suomen kielen päivä" -> first part
    const n = f.name[lang];
    return { short: n.split(', ')[0], full: n };
  });
  const date = $derived(capitalize(now.toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })));
</script>

<header class="hdr">
  <div class="titles">
    <div class="title">{title}</div>
    {#if subtitle}<div class="subtitle">{subtitle}</div>{/if}
  </div>
  <div class="clock">
    <div class="time">{clock}</div>
    <div class="date">
      {#if flag}
        <span class="flagday" title={flag.full}>
          <svg viewBox="0 0 18 11" width="29" height="18" aria-hidden="true"
            ><rect width="18" height="11" fill="#fff" /><rect x="5" width="3" height="11" fill="#002f6c" /><rect y="4" width="18" height="3" fill="#002f6c" /></svg
          >{flag.short}</span
        ><span class="sep">·</span>
      {/if}{date}
    </div>
  </div>
</header>

<style>
  .flagday {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .flagday svg {
    flex: none;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  }
  .sep {
    margin: 0 8px;
    opacity: 0.6;
  }
</style>
