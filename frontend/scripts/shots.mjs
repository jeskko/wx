// Smoke test + screenshots: open each slide alone, start without music, capture the stage.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
//   baseUrl default http://localhost:5173/wx/app/  (npm run dev)
// Env: PW_CHROMIUM=/path/to/chrome-headless-shell (if Playwright's own build is missing)
//      THEMES=retro,modern  LANGS=fi,en  SLIDES=current,next36  PLACE=helsinki
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/wx/app/';
const out = process.argv[3] ?? 'shots';
const slides = (process.env.SLIDES ?? 'current,next36,chart,extended,warnings,regional,aurora,aviation,taf,almanac,credits').split(',');
const themes = (process.env.THEMES ?? 'retro').split(',');
const langs = (process.env.LANGS ?? 'fi').split(',');
const place = process.env.PLACE ?? 'helsinki';

mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
for (const theme of themes)
  for (const lang of langs)
    for (const id of slides) {
      const url = `${base}?slides=${id}&place=${place}&lang=${lang}&theme=${theme}&music=0`;
      await page.goto(url);
      await page.getByRole('button', { name: /▶/ }).waitFor();
      await page.locator('.nomusic').click();
      try {
        await page.locator('.slide').waitFor({ timeout: 10000 });
        await page.waitForTimeout(900); // fade-in
        await page.screenshot({ path: `${out}/${theme}-${lang}-${id}.png` });
        console.log('ok  ', theme, lang, id);
      } catch {
        const msg = await page.locator('.msg').textContent().catch(() => '');
        console.log('SKIP', theme, lang, id, msg ? `(${msg})` : '');
        if (id !== 'warnings' && id !== 'taf') failed++;
      }
    }
await browser.close();
if (errors.length) console.log('page errors:\n ', [...new Set(errors)].join('\n  '));
process.exit(failed || errors.length ? 1 : 0);
