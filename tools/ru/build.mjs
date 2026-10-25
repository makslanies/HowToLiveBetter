// Сборка русской версии в готовые к публикации артефакты (без зависимостей, только node).
//   node tools/ru/build.mjs [--out dist-ru] [--repo-url https://github.com/USER/REPO] [--site-url https://USER.github.io/REPO/] [--skip-index] [--check]
// Шаги: (1) слой правок → книга, (2) пересборка ru/index.html из index.html, (3) проверки (ошибки валят сборку),
// (4) статический сайт dist-ru/site/, (5) офлайн-файл dist-ru/HowToLiveBetter-ru.html (двойной щелчок, без сервера),
// (6) сканирование на утечки ключей и аналитику, (7) build-info.json со счётчиками.
// --check: только шаги 1–3 и сканирование исходников, ничего не пишет (для CI на pull request).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { validate } from './validate.mjs';
import { generatePages } from './pages.mjs';
import { generateGeo, robotsTxt, jsonLdHome } from './geo.mjs';
import { findChrome, buildPdf } from './pdf.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'dist-ru');
const REPO = opt('repo-url', 'https://github.com/makslanies/HowToLiveBetter').replace(/\/$/, '');
const SITE = opt('site-url', 'https://howtolivebetter.ru/');
const CHECK = args.includes('--check');
// PDF для скачивания (книга, разделы, пункты) собирает Chrome; без него или с --no-pdf ссылок на PDF на сайте нет
const WANT_PDF = !CHECK && !args.includes('--no-pdf') && !!findChrome();
if (WANT_PDF) process.env.HLTB_PDF = '1'; else delete process.env.HLTB_PDF;
const step = (n, t) => console.error(`\n[${n}] ${t}`);
const run = (script, a = []) => { const r = spawnSync('node', [script, ...a], { stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) { console.error(`сборка остановлена: ${script} завершился с кодом ${r.status}`); process.exit(r.status || 1); } };
const kb = (n) => `${(n / 1024) | 0} КБ`;

// ---- 1–2 ----
step(1, 'слой правок «В России» → ru/book');
if (existsSync('ru-work/overlay')) run('tools/ru/apply-overlay.mjs');
if (!args.includes('--skip-index')) { step(2, 'ru/index.html из index.html'); run('tools/ru/build-index.mjs'); } else console.error('\n[2] пропущено (--skip-index)');

// ---- 3 проверки ----
step(3, 'проверки');
const v = validate();
for (const w of v.warnings.slice(0, 15)) console.error('  предупреждение:', w);
if (v.warnings.length > 15) console.error(`  … и ещё ${v.warnings.length - 15} предупреждений (node tools/ru/validate.mjs покажет все)`);
for (const e of v.errors) console.error('  ОШИБКА:', e);
if (v.errors.length) { console.error(`\nсборка остановлена: ошибок ${v.errors.length}`); process.exit(1); }
console.error(`  записей ${v.stats.entries}, A/B/C ${v.stats.A}/${v.stats.B}/${v.stats.C}, спорных ${v.stats.disputes}, «В России» ${v.stats.russia}, сносок ${v.stats.xrefs} (битых ${v.stats.badXrefs})`);

// ---- 6 (для исходников): секреты и чужая аналитика ----
const GA_OK = 'G-X3XN8KBL24';   // единственный разрешённый счётчик Google; скрипт только в assets/analytics.js после согласия
const LEAKS = [[/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/, 'ключ в стиле OpenAI'], [/OPENAI_API_KEY\s*=|SREZAI_API_KEY\s*=/, 'строка из .env'], [/mcyyy|wechat-reward/, 'реклама или донат из оригинала']];
function scan(label, files) {
  const hits = [];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    const norm = f.replace(/\\/g, '/');
    for (const [re, what] of LEAKS) if (re.test(t)) hits.push(`${f}: ${what}`);
    // чужой GA запрещён; наш ID и gtag.js с Consent Mode — в analytics.js, gtag-boot.html и страницах сайта
    const ids = [...t.matchAll(/\bG-[A-Z0-9]{6,}\b/g)].map((m) => m[0]);
    const badId = ids.find((id) => id !== GA_OK);
    if (badId) hits.push(`${f}: аналитика Google (${badId})`);
    else if (/googletagmanager|google-analytics/i.test(t) && ids.length && ids.some((id) => id !== GA_OK)) hits.push(`${f}: аналитика Google`);
  }
  if (hits.length) { console.error(`\nОШИБКА: ${label}:\n  ` + hits.join('\n  ')); process.exit(1); }
}
const srcFiles = ['ru/index.html', 'ru/README.md', ...readdirSync('ru/book').map((f) => `ru/book/${f}`)];
scan('в исходниках найдено лишнее', srcFiles);
if (CHECK) { console.error('\nтолько проверка (--check): всё в порядке, артефакты не собирались'); process.exit(0); }

// ---- 4 сайт ----
step(4, `статический сайт → ${OUT}/site`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/site/book`, { recursive: true });
let indexHtml = readFileSync('ru/index.html', 'utf8');
if (SITE) {
  const ogImg = `${SITE.replace(/\/?$/, '/')}assets/og.png`;
  indexHtml = indexHtml.replace('<meta name="viewport"', `<link rel="canonical" href="${SITE}">\n<meta property="og:url" content="${SITE}">\n<meta property="og:image" content="${ogImg}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${ogImg}">\n<meta name="viewport"`);
}
writeFileSync(`${OUT}/site/index.html`, indexHtml);
cpSync('ru/README.md', `${OUT}/site/README.md`);
cpSync('ru/book', `${OUT}/site/book`, { recursive: true });
// /book/ без index даёт 403 у nginx; страница-указатель ведёт на оглавление
{
  const base = SITE ? SITE.replace(/\/?$/, '/') : '../';
  const home = SITE || '../';
  // каталог без index давал 403; страница с навигацией и каноном на оглавление
  writeFileSync(`${OUT}/site/book/index.html`, `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Разделы книги · Руководство по жизни с высокой отдачей</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${base}contents/">
${SITE ? `<link rel="canonical" href="${base}contents/">\n` : ''}</head>
<body>
<p>Исходные файлы разделов лежат здесь для сборки. Читать книгу удобнее в <a href="${base}contents/">оглавлении</a> или на <a href="${home}">главной</a> с поиском.</p>
</body>
</html>
`);
  // страница ошибки: заметная ссылка назад (nginx error_page 404/403 → /404.html)
  writeFileSync(`${OUT}/site/404.html`, `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Страница не найдена · Руководство по жизни с высокой отдачей</title>
<meta name="robots" content="noindex">
<style>
body{margin:0;font:18px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f6f7;color:#222}
main{max-width:560px;margin:12vh auto;padding:28px 24px;background:#fff;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 28px rgba(0,0,0,.06)}
h1{font-size:26px;margin:0 0 10px}p{margin:0 0 14px;color:#444}
nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
a.btn{display:inline-block;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}
a.primary{background:#3451b2;color:#fff}a.secondary{background:#eef0f7;color:#3451b2}
</style>
</head>
<body>
<main>
<h1>Страница не найдена</h1>
<p>Такого адреса на сайте нет. Можно вернуться на главную с поиском и фильтрами или открыть оглавление разделов.</p>
<nav>
<a class="btn primary" href="${home}">На главную</a>
<a class="btn secondary" href="${base}contents/">Оглавление</a>
<a class="btn secondary" href="${base}library/">Библиотека</a>
<a class="btn secondary" href="${base}about/">О проекте</a>
</nav>
</main>
</body>
</html>
`);
}
writeFileSync(`${OUT}/site/.nojekyll`, '');
// подтверждение прав на сайт в Яндекс Вебмастере: файл с кодом в корне сайта
writeFileSync(`${OUT}/site/yandex_0d7702b9fd71adfe.html`, '<html>\n    <head>\n        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n    </head>\n    <body>Verification: 0d7702b9fd71adfe</body>\n</html>');
writeFileSync(`${OUT}/site/9ce6be1c87be61d9e769df6f1921395b.txt`, '9ce6be1c87be61d9e769df6f1921395b');
writeFileSync(`${OUT}/site/robots.txt`, `User-agent: *\nAllow: /\n${SITE ? `Sitemap: ${SITE}sitemap.xml\n` : ''}`);

if (existsSync('ru/related.json')) cpSync('ru/related.json', `${OUT}/site/related.json`);
if (existsSync('ru/scope.json')) cpSync('ru/scope.json', `${OUT}/site/scope.json`);
if (existsSync('ru/materials.json')) cpSync('ru/materials.json', `${OUT}/site/materials.json`);
// один файл вместо десятков book/*.md на главной (PageSpeed: total-byte-weight / LCP)
{
  const readme = readFileSync('ru/README.md', 'utf8');
  const files = [...new Set([...readme.matchAll(/\]\((book\/[^)#\s]+\.md)\)/g)].map((m) => m[1]))].sort();
  const corpus = {
    readme,
    parts: Object.fromEntries(files.map((f) => [f, readFileSync(`ru/${f}`, 'utf8')])),
    scope: existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {},
    related: existsSync('ru/related.json') ? JSON.parse(readFileSync('ru/related.json', 'utf8')) : {},
    materials: existsSync('ru/materials.json') ? JSON.parse(readFileSync('ru/materials.json', 'utf8')) : {},
  };
  writeFileSync(`${OUT}/site/corpus.json`, JSON.stringify(corpus));
  console.error(`  corpus.json: ${files.length} разделов, ${kb(statSync(`${OUT}/site/corpus.json`).size)}`);
}
// GEO: llms.txt, ai/*.json, лента, «О проекте», корневые файлы домена и разметка главной (tools/ru/geo.mjs)
const geo = generateGeo({ out: `${OUT}/site`, rootOut: `${OUT}/root`, site: SITE, repo: REPO });
writeFileSync(`${OUT}/site/robots.txt`, robotsTxt(SITE));
{
  const today = new Date().toISOString().slice(0, 10);
  const ld = '<script type="application/ld+json">' + JSON.stringify(jsonLdHome({ site: SITE, repo: REPO, st: geo.st, today })).replace(/</g, '\\u003c') + '</script>\n';
  const f = `${OUT}/site/index.html`; const h = readFileSync(f, 'utf8');
  if (!h.includes('</head>')) { console.error('ОШИБКА: в index.html нет </head>'); process.exit(1); }
  writeFileSync(f, h.replace('</head>', () => ld + '</head>'));
  indexHtml = readFileSync(f, 'utf8');            // офлайн-версия берёт уже готовую главную
}
console.error(`  GEO: llms.txt, llms-full.txt, ai/*.json, feed.xml, about/, privacy/; корневые файлы домена в ${OUT}/root`);
// Яндекс Метрика после согласия; Google gtag в HTML с Consent Mode (denied), после согласия — granted. Офлайн-файл без них (берёт indexHtml до этой вставки).
{
  const f = `${OUT}/site/index.html`; let h = readFileSync(f, 'utf8');
  const foot = '<a href="contents/">Оглавление без JavaScript</a>.</div>';
  if (!h.includes(foot) || !h.includes('</body>') || !h.includes('</head>')) { console.error('ОШИБКА: в index.html нет подвала, </head> или </body> для счётчика'); process.exit(1); }
  const gtag = readFileSync('tools/ru/spa/gtag-boot.html', 'utf8').trim() + '\n';
  h = h.replace('</head>', () => gtag + '</head>');
  h = h.replace(foot, () => '<a href="contents/">Оглавление без JavaScript</a>. <a href="privacy/">Политика конфиденциальности</a> · <a href="#cookie-settings" data-cookie-settings>Настройки cookie</a></div>');
  h = h.replace('</body>', () => '<script src="assets/analytics.js" defer></script>\n</body>');
  h = h.replace('href="about/"', () => `href="${SITE}about/"`);   // абсолютная ссылка «О проекте»: так её находят и люди, и проверяющие инструменты
  writeFileSync(f, h);
}

const pg = generatePages({ out: `${OUT}/site`, site: SITE });
console.error(`  страниц ${pg.pages} (разделов ${pg.sections}, пунктов ${pg.entries}), ссылок на пункты в тексте ${pg.refLinks}, «Смотрите также» ${pg.relatedLinks}, битых внутренних ссылок ${pg.broken.length}`);
if (pg.broken.length) { for (const b of pg.broken.slice(0, 15)) console.error('  ОШИБКА: битая ссылка', b); console.error(`\nсборка остановлена: битых внутренних ссылок ${pg.broken.length}`); process.exit(1); }

// ---- 4б PDF ----
if (WANT_PDF) {
  step('4б', 'PDF: книга, разделы, пункты');
  // PDF нужны читателю, но сайт из-за них не должен вставать: сбой Chrome на сервере только предупреждаем, остальное публикуется
  let pr; try { pr = await buildPdf({ out: OUT, siteUrl: SITE }); } catch (e) { pr = { failed: 0, error: e.message }; }
  if (pr.error) console.error(`::warning::PDF не созданы (${pr.error}); сайт публикуется без них`);
  else if (pr.failed) console.error(`::warning::PDF: не удалось создать ${pr.failed} файлов; остальное опубликовано`);
} else console.error('\n[4б] PDF пропущены (нет Chrome, --no-pdf или --check)');

// ---- 5 офлайн ----
step(5, `офлайн-файл → ${OUT}/HowToLiveBetter-ru.html`);
const readme = readFileSync('ru/README.md', 'utf8');
const files = [...new Set([...readme.matchAll(/\]\((book\/[^)#\s]+\.md)\)/g)].map((m) => m[1]))].sort();
const corpus = { readme, parts: Object.fromEntries(files.map((f) => [f, readFileSync(`ru/${f}`, 'utf8')])), docs: {}, scope: existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {}, related: existsSync('ru/related.json') ? JSON.parse(readFileSync('ru/related.json', 'utf8')) : {}, materials: existsSync('ru/materials.json') ? JSON.parse(readFileSync('ru/materials.json', 'utf8')) : {} };
const corpusJson = JSON.stringify(corpus).replace(/<\/script/gi, '<\\/script');   // </script внутри данных закрыл бы тег
let off = indexHtml;
const must = (needle, what) => { if (!off.includes(needle)) { console.error(`ОШИБКА: в index.html нет ${what}, скрипт сборки надо поправить: ${needle.slice(0, 60)}`); process.exit(1); } };
const main = '\n<script>\n/* ---------- 调试面板';
must(main, 'начала основного скрипта');
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();
const stamp = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
off = off.replace(main, `\n<script>window.__CORPUS__=${corpusJson}</script>${main}`);
must('<div class="foot">', 'подвала');
off = off.replace('<div class="foot">', `<div class="foot">Офлайн-копия от ${stamp} (МСК)${commit ? `, коммит ${commit}` : ''}. Текст продолжает обновляться, в онлайн-версии он новее.<br>`);
if (REPO) off = off.replaceAll('href="README.md"', `href="${REPO}/blob/main/ru/README.md"`).replaceAll('href="book/"', `href="${REPO}/tree/main/ru/book"`);
if (SITE) off = off.replaceAll('<a class="title" href="./"', `<a class="title" href="${SITE}"`);
if (/mc\.yandex\.ru|analytics\.js|data-cookie-settings/.test(off)) { console.error('ОШИБКА: в офлайн-файл попал счётчик или окно cookie: он не должен отправлять данные из чужого файла'); process.exit(1); }
writeFileSync(`${OUT}/HowToLiveBetter-ru.html`, off);

// ---- 6 (для артефактов) ----
const all = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : all.push(p); } }; walk(OUT);
scan('в собранных артефактах найдено лишнее', all.filter((f) => /\.(html|md|txt|json)$/.test(f)));

// ---- 7 build-info ----
const info = { builtAt: new Date().toISOString(), builtAtMoscow: stamp, commit, ...v.stats, pages: pg.pages, refLinks: pg.refLinks, relatedLinks: pg.relatedLinks, warnings: v.warnings.length, files: all.length, offlineKB: (statSync(`${OUT}/HowToLiveBetter-ru.html`).size / 1024) | 0 };
writeFileSync(`${OUT}/site/build-info.json`, JSON.stringify(info, null, 1));
console.error(`\nГотово: ${OUT}/site (${all.filter((f) => f.startsWith(`${OUT}/site`)).length} файлов) и ${OUT}/HowToLiveBetter-ru.html (${kb(statSync(`${OUT}/HowToLiveBetter-ru.html`).size)})`);
