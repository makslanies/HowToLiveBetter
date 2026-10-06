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

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'dist-ru');
const REPO = opt('repo-url', 'https://github.com/makslanies/HowToLiveBetter').replace(/\/$/, '');
const SITE = opt('site-url', 'https://makslanies.github.io/HowToLiveBetter/');
const CHECK = args.includes('--check');
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
const LEAKS = [[/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/, 'ключ в стиле OpenAI'], [/OPENAI_API_KEY\s*=|SREZAI_API_KEY\s*=/, 'строка из .env'], [/googletagmanager|google-analytics|G-[A-Z0-9]{8,}/, 'аналитика Google'], [/mcyyy|wechat-reward/, 'реклама или донат из оригинала']];
function scan(label, files) {
  const hits = [];
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const [re, what] of LEAKS) if (re.test(t)) hits.push(`${f}: ${what}`); }
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
if (SITE) indexHtml = indexHtml.replace('<meta name="viewport"', `<link rel="canonical" href="${SITE}">\n<meta name="viewport"`);
writeFileSync(`${OUT}/site/index.html`, indexHtml);
cpSync('ru/README.md', `${OUT}/site/README.md`);
cpSync('ru/book', `${OUT}/site/book`, { recursive: true });
writeFileSync(`${OUT}/site/.nojekyll`, '');
// подтверждение прав на сайт в Яндекс Вебмастере: файл с кодом в корне сайта
writeFileSync(`${OUT}/site/yandex_0d7702b9fd71adfe.html`, '<html>\n    <head>\n        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n    </head>\n    <body>Verification: 0d7702b9fd71adfe</body>\n</html>');
writeFileSync(`${OUT}/site/robots.txt`, `User-agent: *\nAllow: /\n${SITE ? `Sitemap: ${SITE}sitemap.xml\n` : ''}`);

if (existsSync('ru/related.json')) cpSync('ru/related.json', `${OUT}/site/related.json`);
if (existsSync('ru/scope.json')) cpSync('ru/scope.json', `${OUT}/site/scope.json`);
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
// Яндекс Метрика только в онлайн-версии, и только после согласия (assets/analytics.js); indexHtml для офлайн-файла остаётся без неё
{
  const f = `${OUT}/site/index.html`; let h = readFileSync(f, 'utf8');
  const foot = '<a href="contents/">Оглавление без JavaScript</a>.</div>';
  if (!h.includes(foot) || !h.includes('</body>')) { console.error('ОШИБКА: в index.html нет подвала или </body> для счётчика'); process.exit(1); }
  h = h.replace(foot, () => '<a href="contents/">Оглавление без JavaScript</a>. <a href="privacy/">Политика конфиденциальности</a> · <a href="#cookie-settings" data-cookie-settings>Настройки cookie</a></div>');
  h = h.replace('</body>', () => '<script src="assets/analytics.js" defer></script>\n</body>');
  writeFileSync(f, h);
}

const pg = generatePages({ out: `${OUT}/site`, site: SITE });
console.error(`  страниц ${pg.pages} (разделов ${pg.sections}, пунктов ${pg.entries}), ссылок на пункты в тексте ${pg.refLinks}, «Смотрите также» ${pg.relatedLinks}, битых внутренних ссылок ${pg.broken.length}`);
if (pg.broken.length) { for (const b of pg.broken.slice(0, 15)) console.error('  ОШИБКА: битая ссылка', b); console.error(`\nсборка остановлена: битых внутренних ссылок ${pg.broken.length}`); process.exit(1); }

// ---- 5 офлайн ----
step(5, `офлайн-файл → ${OUT}/HowToLiveBetter-ru.html`);
const readme = readFileSync('ru/README.md', 'utf8');
const files = [...new Set([...readme.matchAll(/\]\((book\/[^)#\s]+\.md)\)/g)].map((m) => m[1]))].sort();
const corpus = { readme, parts: Object.fromEntries(files.map((f) => [f, readFileSync(`ru/${f}`, 'utf8')])), docs: {}, scope: existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {}, related: existsSync('ru/related.json') ? JSON.parse(readFileSync('ru/related.json', 'utf8')) : {} };
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
