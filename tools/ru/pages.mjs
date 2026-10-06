// Статические страницы для поисковиков и обычных ссылок: оглавление, страница каждого раздела и каждого пункта,
// ссылки между пунктами (из текста «раздел N, пункт M»), блок «Смотрите также», sitemap.xml.
// Вызывается из build.mjs; можно запустить отдельно: node tools/ru/pages.mjs --out dist-ru/site --site https://USER.github.io/REPO/
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parseBook, keyOf, LENS, LABEL } from './parse.mjs';
import { COUNTRY_GUIDE, countryView, countrySummary, countryStatus, sourceGroups } from './country-fields.mjs';

const TITLE = 'Руководство по жизни с высокой отдачей';
const UPSTREAM = 'https://github.com/eternity4719/HowToLiveBetter';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unmd = (s) => s.replace(/\\([*_])/g, '$1');

const CSS = `:root{--bg:#fff;--t1:#222;--t2:#555;--line:#e2e2e3;--soft:#f6f6f7;--brand:#3451b2;--ok:#18794e;--warn:#915930;--bad:#b8272c}
@media(prefers-color-scheme:dark){:root{--bg:#1b1b1f;--t1:#e6e6e0;--t2:#a8a8a8;--line:#2e2e32;--soft:#202127;--brand:#a8b1ff;--ok:#3dd68c;--warn:#e0b070;--bad:#ff8a8a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t1);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand)}header.top,footer{max-width:780px;margin:0 auto;padding:14px 20px;font-size:14px;color:var(--t2)}
header.top{border-bottom:1px solid var(--line)}header.top a{margin-right:14px;text-decoration:none}
main{max-width:780px;margin:0 auto;padding:8px 20px 40px}h1{font-size:26px;line-height:1.3;margin:.6em 0 .4em}h2{font-size:17px;margin:1.4em 0 .3em}
.crumbs{font-size:14px;color:var(--t2);margin-top:14px}.badges{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;padding:0;list-style:none}
.badge{font-size:12px;padding:2px 9px;border-radius:99px;background:var(--soft);border:1px solid var(--line);color:var(--t2)}
.badge.hi{color:var(--ok)}.badge.warn{color:var(--bad)}.human{background:var(--soft);border-left:4px solid var(--brand);padding:10px 14px;border-radius:6px}
.src ol{padding-left:22px;font-size:14px;color:var(--t2);word-break:break-word}.related ul,.list{padding-left:20px}.list li{margin:.5em 0}.list .sub{display:block;font-size:14px;color:var(--t2)}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px;padding-top:14px;border-top:1px solid var(--line);font-size:14px}
.note{font-size:14px;color:var(--t2);margin-top:24px}.scope{font-size:14px;color:var(--t2);margin:10px 0;padding:8px 12px;border-left:3px solid var(--warn);background:var(--soft);border-radius:4px}footer{border-top:1px solid var(--line);margin-top:20px}`;

// ---------- текст ----------
const NUMS = '(?:с\\s+)?\\d+(?:\\s*(?:,|и)\\s*\\d+)*(?:\\s*(?:–|—|-|по)\\s*\\d+)?';
const XREF = new RegExp(`(раздел(?:а|е|у|ом)?\\s+\\d+,\\s*пункт(?:а|е|у|ы|ов)?\\s+${NUMS})|(пункт(?:а|е|у|ы|ов)?\\s+${NUMS}\\s+раздел(?:а|е|у|ом)?\\s+\\d+)|(раздел(?:а|е|у|ом|ы|ов)?\\s+\\d+(?:\\s*(?:,|и)\\s*\\d+)*)|(пункт(?:а|е|у|ы|ов)?\\s+${NUMS})`, 'gi');

function makeCtx(secs, root) {
  const have = new Set(secs.flatMap((s) => s.entries.map(keyOf)));
  const haveSec = new Set(secs.map((s) => String(s.n)));
  return { have, haveSec, root };
}

// Текст без разметки: ссылки на пункты внутри. bare — «пункт N» без раздела считается пунктом этого раздела (во введениях).
function linkRefs(text, c, { sec, bare }) {
  let out = '', last = 0, links = 0;
  for (const m of text.matchAll(XREF)) {
    const [whole, a, b, cc, d] = m;
    let html = null;
    const linkNums = (str, s) => str.replace(/\d+/g, (n) => (c.have.has(`${s}-${n}`) ? (links++, `<a href="${c.root}p/${s}-${n}/">${n}</a>`) : n));
    if (a) { const i = a.search(/пункт/i); const s = /\d+/.exec(a)[0]; html = esc(a.slice(0, i)) + linkNums(esc(a.slice(i)), s); }
    else if (b) { const i = b.search(/раздел/i); const s = /\d+/.exec(b.slice(i))[0]; html = linkNums(esc(b.slice(0, i)), s) + esc(b.slice(i)); }
    else if (cc) html = esc(cc).replace(/\d+/g, (n) => (c.haveSec.has(n) ? (links++, `<a href="${c.root}s/${n}/">${n}</a>`) : n));
    else if (d && sec && (bare || /^\s*\(/.test(text.slice(m.index + whole.length)))) html = linkNums(esc(d), sec);   // «пункт 10 (пояснение)» — ссылка на пункт того же раздела; голый «пункт N» без скобки в тексте не трогаем: это может быть пункт закона
    if (html == null || !html.includes('<a ')) continue;
    out += esc(text.slice(last, m.index)) + html; last = m.index + whole.length;
  }
  return { html: out + esc(text.slice(last)), links };
}

const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>()«»]+)|\*\*((?:\\\*|[^*\n])+)\*\*/g;
function inline(text, c, opts = {}) {
  text = unmd(text);
  let out = '', last = 0, links = 0;
  const plain = (s) => { const r = linkRefs(s, c, opts); links += r.links; return r.html; };
  const ext = (u, label) => `<a href="${esc(u)}" rel="nofollow noopener" target="_blank">${esc(label)}</a>`;
  for (const m of text.matchAll(INLINE)) {
    out += plain(text.slice(last, m.index)); last = m.index + m[0].length;
    if (m[5] !== undefined) { const r = inline(m[5], c, opts); links += r.links; out += `<strong>${r.html}</strong>`; }
    else if (m[1] !== undefined) out += ext(m[2], m[1]);
    else { let u = m[3] || m[4]; let tail = ''; while (/[.,;:]$/.test(u)) { tail = u.slice(-1) + tail; u = u.slice(0, -1); } const lab = u.replace(/^https?:\/\//, '').replace(/\/$/, ''); out += ext(u, lab.length > 70 ? lab.slice(0, 67) + '…' : lab) + esc(tail); }
  }
  out += plain(text.slice(last));
  return { html: out, links };
}

function splitSrc(text) {
  const parts = []; let buf = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('「『（'.includes(ch)) depth++; if ('」』）'.includes(ch)) depth = Math.max(0, depth - 1);
    const semi = ch === '；' || (ch === ';' && /\s/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || ''));
    if (semi && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((x) => x.trim()).filter(Boolean);
}

const firstSentence = (s, max = 160) => { const t = unmd(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); const m = /^(.{40,}?[.!?…])(\s|$)/.exec(t); const r = m ? m[1] : t; return r.length > max ? r.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : r; };

// ---------- страницы ----------
export function page({ root, title, desc, canonical, body, ld }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="stylesheet" href="${root}assets/page.css">
<link rel="alternate" type="application/atom+xml" title="${TITLE}" href="${root}feed.xml">
<meta property="article:modified_time" content="${new Date().toISOString().slice(0, 10)}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="top"><a href="${root}">Поиск и фильтры</a><a href="${root}contents/">Оглавление</a><a href="${root}about/">О проекте</a><a href="${UPSTREAM}" rel="noopener">Китайский оригинал</a></header>
<main>
${body}
</main>
<footer>Обновлено: <time datetime="${new Date().toISOString().slice(0, 10)}">${new Date().toISOString().slice(0, 10).split('-').reverse().join('.')}</time>. Неофициальный русский перевод книги «高性价比人生指南» по лицензии <a href="https://creativecommons.org/licenses/by/4.0/deed.ru" rel="noopener">CC BY 4.0</a>. ${esc(COUNTRY_GUIDE)}<br><a href="${root}privacy/">Политика конфиденциальности</a> · <a href="#cookie-settings" data-cookie-settings>Настройки cookie</a></footer>
<script src="${root}assets/analytics.js" defer></script>
</body>
</html>
`;
}

// Пометка «что в пункте китайское, что российское» (ru/scope.json, классификация tools/ru/classify.mjs)
const scopeBadge = (sc) => (!sc ? '' : `<li class="badge ${sc.t === 'u' ? 'hi' : 'warn'}">${sc.t === 'c' ? 'Нормы Китая (КНР)' : sc.t === 'm' ? 'Частично Китай' : 'Не зависит от страны'}</li>`);

export function generatePages({ out, site = '', relatedPath = 'ru/related.json' }) {
  const secs = parseBook();
  const all = secs.flatMap((s) => s.entries);
  const scope = existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {};
  const related = existsSync(relatedPath) ? JSON.parse(readFileSync(relatedPath, 'utf8')) : {};
  const byKey = Object.fromEntries(all.map((e) => [keyOf(e), e]));
  const url = (p) => (site ? `${site.replace(/\/?$/, '/')}${p}` : '');
  const urls = [''];
  let nLinks = 0, nRel = 0;
  const put = (p, html) => { const f = join(out, p, 'index.html'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };

  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'assets/page.css'), CSS);
  writeFileSync(join(out, 'assets/analytics.js'), readFileSync('tools/ru/spa/analytics.js', 'utf8'));

  const badge = (t, cls = '') => `<li class="badge ${cls}">${esc(t)}</li>`;

  // записи
  const flat = all;
  flat.forEach((e, idx) => {
    const root = '../../';
    const c = makeCtx(secs, '../');                     // из p/8-11/ соседний пункт лежит рядом: ../8-12/
    const cc = { ...c, root: '../../' };
    const sec = secs.find((s) => s.n === e.sec);
    const f = (txt, o = {}) => { const r = inline(txt, { ...c, root: '../../' }, { sec: e.sec, ...o }); nLinks += r.links; return r.html; };
    // ссылки на пункты строим от корня сайта, чтобы не зависеть от глубины
    const rel = (related[keyOf(e)] || []).map((k) => byKey[k]).filter(Boolean);
    nRel += rel.length;
    const sc = scope[keyOf(e)];
    const view = countryView(e, sc);
    const field = (name, key, human = false) => {
      if (!e[key] && !view.russian) return '';
      const original = e[key] ? `<p${human ? ' class="human"' : ''}>${view.labeled ? `<strong>${esc(view.original)}.</strong> ` : ''}${f(e[key])}</p>` : '';
      const russian = view.russian ? `<p${human ? ' class="human"' : ''}><strong>Россия.</strong> ${f(view.russian[key])}</p>` : '';
      return `<section class="country-field" data-field="${key}"><h2>${name}</h2>${original}${russian}${key === 'cost' && e.price ? `<h3>Цена в России (ориентир)</h3><p>${f(e.price)}</p>` : ''}</section>`;
    };
    const srcItems = sourceGroups(e, sc).map((g) => `<h3>${esc(g.title)}</h3><ol>${splitSrc(g.text).map((x) => `<li>${f(x)}</li>`).join('')}</ol>`).join('');
    const prev = flat[idx - 1], next = flat[idx + 1];
    const badges = [e.ratio ? badge(`Выгодность исходной версии: ${e.ratio}`, e.ratio === 'очень высокая' || e.ratio === 'высокая' ? 'hi' : '') : '', badge(`Доказательность ${e.grade} · исходная версия`), e.tag.lens ? badge(LENS[e.tag.lens]) : '', ...['money', 'time', 'will'].filter((d) => e.tag[d]).map((d) => badge(LABEL[d][e.tag[d]])), scopeBadge(scope[keyOf(e)]), e.dispute ? badge('Спорно', 'warn') : '', e.ru ? badge('Российские данные: частично') : ''].join('');
    const desc = firstSentence(countrySummary(e, sc) || e.title);
    const canonical = url(`p/${keyOf(e)}/`);
    const body = `<nav class="crumbs" aria-label="Навигация"><a href="${root}contents/">Оглавление</a> › <a href="${root}s/${e.sec}/">${e.sec}. ${esc(sec.title)}</a> › пункт ${e.n}</nav>
<article>
<h1>${e.n}. ${esc(e.title)}</h1>
<ul class="badges">${badges}</ul>
${view.notice ? `<p class="scope">${esc(view.notice)}</p>` : ''}
<p class="note">Оценки выше относятся к исходной версии; отдельная оценка российского варианта не проводилась.</p>
${field('Простыми словами', 'human', true)}
${field('Затраты', 'cost')}
${field('Выгода', 'gain')}
${field('Примечания', 'note')}
<section class="src"><h2>Источники</h2>\n${srcItems}</section>
</article>
${rel.length ? `<aside class="related"><h2>Смотрите также</h2>\n<ul>${rel.map((r) => `<li><a href="${root}p/${keyOf(r)}/">Раздел ${r.sec}, пункт ${r.n}: ${esc(r.title)}</a><span class="sub">${esc(countryStatus(r, scope[keyOf(r)]))}</span></li>`).join('')}</ul></aside>` : ''}
<nav class="pager" aria-label="Соседние пункты"><span>${prev ? `← <a href="${root}p/${keyOf(prev)}/">${prev.sec}.${prev.n} ${esc(prev.title.slice(0, 50))}…</a>` : ''}</span><span>${next ? `<a href="${root}p/${keyOf(next)}/">${next.sec}.${next.n} ${esc(next.title.slice(0, 50))}…</a> →` : ''}</span></nav>
<p class="note"><a href="${root}#e-${e.sec}-${e.n}">Открыть этот пункт в поиске с фильтрами</a></p>`;
    const cites = [...new Set([...(e.src.matchAll(/https?:\/\/[^\s<>()；;]+/g))].map((m) => m[0].replace(/[.,;]+$/, '')))].slice(0, 8);
    const today = new Date().toISOString().slice(0, 10);
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: e.title.slice(0, 110), description: desc, inLanguage: 'ru', url: canonical || undefined, mainEntityOfPage: canonical || undefined, datePublished: '2026-10-06', dateModified: today, author: { '@type': 'Organization', name: `${TITLE} (русская версия)`, url: site || undefined }, publisher: { '@type': 'Organization', name: `${TITLE} (русская версия)`, url: site || undefined }, translator: { '@type': 'Person', name: 'makslanies', url: 'https://github.com/makslanies' }, isBasedOn: { '@type': 'Book', name: '高性价比人生指南', inLanguage: 'zh-CN', url: UPSTREAM }, isPartOf: { '@type': 'Book', name: TITLE }, articleSection: sec.title, license: 'https://creativecommons.org/licenses/by/4.0/', citation: cites.length ? cites : undefined, about: e.ru ? 'Содержит российские данные' : undefined };
    put(`p/${keyOf(e)}`, page({ root, title: `${e.title} · раздел ${e.sec} · ${TITLE}`, desc, canonical, body, ld }));
    urls.push(`p/${keyOf(e)}/`);
  });

  // разделы
  for (const s of secs) {
    const root = '../../';
    const c = { ...makeCtx(secs, root), root };
    const r = (t, o = {}) => { const x = inline(t, c, { sec: s.n, bare: true, ...o }); nLinks += x.links; return x.html; };
    const intro = s.intro.map((p) => `<p>${r(p)}</p>`).join('\n');
    const list = s.entries.map((e) => `<li><a href="${root}p/${keyOf(e)}/">${e.n}. ${esc(e.title)}</a><span class="sub">${esc(countryStatus(e, scope[keyOf(e)]))}</span><span class="sub">${esc(firstSentence(e.human || e.gain, 150))}</span>${e.ru ? `<span class="sub">Россия: ${esc(firstSentence(countryView(e, scope[keyOf(e)]).russian.human, 150))}</span>` : ''}</li>`).join('\n');
    const body = `<nav class="crumbs" aria-label="Навигация"><a href="${root}contents/">Оглавление</a> › раздел ${s.n}</nav>
<h1>${s.n}. ${esc(s.title)}</h1>
<p class="scope">${esc(COUNTRY_GUIDE)} Российские данные есть у ${s.entries.filter((e) => e.ru).length} из ${s.entries.length} пунктов этого раздела. Введение ниже относится к исходной версии.</p>
${intro}
<h2>Пункты раздела (${s.entries.length})</h2>
<ol class="list" style="padding-left:0;list-style:none">${list}</ol>
<p class="note"><a href="${root}?sec=${s.n}">Открыть раздел в поиске с фильтрами</a></p>`;
    put(`s/${s.n}`, page({ root, title: `${s.n}. ${s.title} · ${TITLE}`, desc: firstSentence(s.intro[0] || s.title), canonical: url(`s/${s.n}/`), body, ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.title, inLanguage: 'ru', url: url(`s/${s.n}/`) || undefined, isPartOf: { '@type': 'Book', name: TITLE } } }));
    urls.push(`s/${s.n}/`);
  }

  // оглавление: описания разделов берём из ru/README.md
  const readme = readFileSync('ru/README.md', 'utf8');
  const toc = new Map([...readme.matchAll(/^(\d+)\. \[([^\]]+)\]\(book\/\d\d-[^)]+\)(.*)$/gm)].map((m) => [Number(m[1]), m[3].replace(/^[:\s]+/, '')]));
  {
    const root = '../';
    const c = { ...makeCtx(secs, root), root };
    const items = secs.map((s) => { const x = inline(toc.get(s.n) || '', c, {}); nLinks += x.links; return `<li><a href="${root}s/${s.n}/">${s.n}. ${esc(s.title)}</a> <small>(${s.entries.length})</small><span class="sub">${x.html}</span></li>`; }).join('\n');
    const body = `<h1>${TITLE}: оглавление</h1>
<p>${all.length} пунктов в ${secs.length} разделах. В каждом пункте: что вы тратите, что получаете, насколько надёжны доказательства и откуда сведения. Для поиска и фильтров по стоимости откройте <a href="${root}">главную страницу</a>.</p>
<p class="scope">${esc(COUNTRY_GUIDE)}</p>
<ol class="list" style="padding-left:0;list-style:none">${items}</ol>`;
    put('contents', page({ root, title: `Оглавление · ${TITLE}`, desc: `Оглавление: ${secs.length} разделов и ${all.length} пунктов руководства по жизни с высокой отдачей.`, canonical: url('contents/'), body }));
    urls.push('contents/', 'about/', 'privacy/');
  }

  // sitemap
  if (site) {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${url(u)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  }

  // проверка: все внутренние ссылки ведут на существующие страницы
  const broken = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.html$/.test(n) && check(p); } };
  const check = (file) => {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"#?]*)(?:[?#][^"]*)?"/g)) {
      const h = m[1]; if (!h || /^(https?:|mailto:|data:)/.test(h)) continue;
      const target = resolve(dirname(file), h);
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
      if (!ok) broken.push(`${file.replace(out + '/', '')}: ${h}`);
    }
  };
  walk(join(out, 'p')); walk(join(out, 's')); walk(join(out, 'contents'));
  return { pages: urls.length, entries: all.length, sections: secs.length, refLinks: nLinks, relatedLinks: nRel, broken };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const o = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const r = generatePages({ out: o('out', 'dist-ru/site'), site: o('site', '') });
  console.log(JSON.stringify({ ...r, broken: r.broken.slice(0, 10), brokenCount: r.broken.length }));
  process.exit(r.broken.length ? 1 : 0);
}
