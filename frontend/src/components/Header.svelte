<script lang="ts">
  import { LOCALE } from '../i18n';
  import type { Lang } from '../lib/types';

  let { title, subtitle = '', lang, tz }: { title: string; subtitle?: string; lang: Lang; tz: string } = $props();

  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });
  const clock = $derived(now.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz }));
  const date = $derived(now.toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }));
</script>

<header class="hdr">
  <div class="logo"><span class="wx">wx</span><span class="dot">.</span><span class="fi">fi</span></div>
  <div class="titles">
    <div class="title">{title}</div>
    {#if subtitle}<div class="subtitle">{subtitle}</div>{/if}
  </div>
  <div class="clock">
    <div class="time">{clock}</div>
    <div class="date">{date}</div>
  </div>
</header>
