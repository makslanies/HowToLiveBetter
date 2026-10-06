// Российская сверка одной записи русского перевода. Использование:
//   node tools/ru-work/research.mjs ru/book/34-xxx.md --entry 1 [--model gpt-6.1-sol]
// Шаги: (1) gpt-6-luna решает, чего касается запись (универсально / только Китай / смешанно) и
// составляет поисковые запросы и список официальных сайтов; (2) SREZAI ищет только на этих сайтах
// и читает страницы; (3) gpt-6.1-sol пишет поле «В России» ТОЛЬКО из прочитанного текста и
// приводит дословные цитаты; (4) скрипт механически проверяет, что каждая цитата есть на странице.
// Результат — ru-work/research/<файл>-<N>.md для ручной проверки. В книгу сам ничего не пишет.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fetchPdfText, excerpt, isDirectFetchUrl } from './lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ENTRY = Number(opt('entry', '1'));
const MODEL = opt('model', 'gpt-6.1-sol');
const MAX_CREDITS = Number(opt('max-credits', '40'));   // жёсткий потолок на запись; 1 кредит = 0.10 ₽
const REPLAN = args.includes('--replan');
const MANUAL_URLS = opt('urls', '');            // --urls a,b: не искать, а читать эти адреса (для проверки без квоты)
const NO_LAWS = args.includes('--no-laws');
let credits = 0;
const COST = { search: 1, read: 1, fetch: 3, extract: 4 };
if (!file) { console.error('node tools/ru-work/research.mjs <ru/book/NN.md> --entry N'); process.exit(2); }

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const ORIGIN = new URL(process.env.SREZAI_BASE_URL).origin;
const scrub = (s) => String(s).replace(/(sk-|Bearer\s+)[A-Za-z0-9_.-]+/g, '$1***');

// Журнал суточного расхода: тариф даёт 200 обращений в сутки и 10 в 10 секунд. blockedUntil — когда сбросится квота.
const USAGE = 'ru-work/research/usage.json';
const DAILY = Number(opt('daily-limit', '190'));
let lastCall = 0;
function usageGuard() {
  const u = existsSync(USAGE) ? JSON.parse(readFileSync(USAGE, 'utf8')) : { blockedUntil: 0, calls: [] };
  const now = Math.floor(Date.now() / 1000);
  if (u.blockedUntil && now < u.blockedUntil) { console.error(`СТОП: квота SREZAI сбросится ${new Date(u.blockedUntil * 1000).toLocaleString('ru-RU')} (по журналу). Файл результата не тронут.`); process.exit(3); }
  u.calls = (u.calls || []).filter((t) => now - t < 86400);
  if (u.calls.length >= DAILY) { console.error(`СТОП: за сутки уже ${u.calls.length} обращений (лимит ${DAILY}), освободится ${new Date((u.calls[0] + 86400) * 1000).toLocaleString('ru-RU')}.`); process.exit(3); }
  return u;
}
async function srez(path, body) {
  const u = usageGuard();
  const wait = lastCall + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));   // не больше 10 запросов в 10 секунд
  lastCall = Date.now(); u.calls.push(Math.floor(lastCall / 1000)); writeFileSync(USAGE, JSON.stringify(u));
  credits += COST[path] ?? 1;
  if (credits > MAX_CREDITS) throw new Error(`лимит ${MAX_CREDITS} кредитов исчерпан`);
  let r, j;
  for (let attempt = 1; attempt <= 3; attempt++) {
    r = await fetch(`${ORIGIN}/api/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SREZAI_API_KEY}` }, body: JSON.stringify(body) });
    j = await r.json().catch(() => ({}));
    if (r.status !== 429) break;
    if (j.reason === 'quota') {   // дневная квота ключа: ждать бесполезно, ничего не пишем, чтобы не затереть прежние результаты пустыми
      console.error(`СТОП: дневная квота SREZAI исчерпана (лимит ${r.headers.get('x-ratelimit-limit')}/сутки), сброс через ${Math.round((j.retryAfterSec || 0) / 60)} мин. Файл результата не тронут.`);
      const uu = existsSync(USAGE) ? JSON.parse(readFileSync(USAGE, 'utf8')) : { calls: [] };
      uu.blockedUntil = Math.floor(Date.now() / 1000) + (j.retryAfterSec || 3600); writeFileSync(USAGE, JSON.stringify(uu));
      process.exit(3);
    }
    await new Promise((res) => setTimeout(res, Math.min(5, j.retryAfterSec || 1) * 1000 + 500));
  }
  if (!r.ok) throw new Error(`srezai ${path} ${r.status} ${scrub(JSON.stringify(j)).slice(0, 200)}`);
  return j;
}
async function gpt(model, system, user) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`openai ${r.status} ${scrub(j.error?.message || '')}`);
  return JSON.parse(j.choices[0].message.content);
}

// ---- берём запись ----
const text = readFileSync(file, 'utf8');
const parts = text.split(/^(?=### )/m).filter((p) => /^### /.test(p));
const entry = parts.find((p) => p.startsWith(`### ${ENTRY}. `));
if (!entry) { console.error(`Записи ${ENTRY} нет в ${file}`); process.exit(1); }
const title = entry.split('\n')[0];
const entryNoSrc = entry.split('\n').filter((l) => !/^- (Источники|来源)/.test(l) && !/^<!--/.test(l)).join('\n');
console.error(`Запись: ${title}`);

// ---- 1. план ----
const OFFICIAL = 'pravo.gov.ru, publication.pravo.gov.ru, government.ru, kremlin.ru, minzdrav.gov.ru, cr.minzdrav.gov.ru, apicr.minzdrav.gov.ru, grls.minzdrav.gov.ru, rospotrebnadzor.ru, mchs.gov.ru, mvd.ru, rosstat.gov.ru, nalog.gov.ru, sfr.gov.ru, rostrud.gov.ru, minfin.gov.ru, cbr.ru, vsrf.ru, genproc.gov.ru, who.int, pubmed.ncbi.nlm.nih.gov, europepmc.org, cochranelibrary.com';
mkdirSync('ru-work/research/plans', { recursive: true });
const planPath = `ru-work/research/plans/${basename(file, '.md')}-${ENTRY}.json`;
const plan = (!REPLAN && existsSync(planPath)) ? JSON.parse(readFileSync(planPath, 'utf8')) : await gpt('gpt-6-luna',
  `Ты помогаешь адаптировать запись китайского руководства по жизни для читателей России и СНГ. Определи, чего касается запись: "universal" (медицина и поведение, одинаковые в любой стране), "china" (держится на китайском праве, органах, выплатах, телефонах) или "mixed". Составь до 3 поисковых запросов на русском для поиска российского аналога или российской версии данных, и до 8 официальных сайтов для поиска (выбирай ТОЛЬКО из списка: ${OFFICIAL}). Вторичные сайты (аптеки, справочники, дзен, консультанты-агрегаторы) не допускаются. Если запись держится на правовых нормах и ты уверен, какой российский акт и статья ей соответствуют, назови до 3 пар в поле laws (это гипотезы, их проверят по тексту): {"name":"полное название акта","article":"номер статьи"}. Не уверен — оставь laws пустым.
Для медицинских записей включай в запросы название российских клинических рекомендаций Минздрава (например «клинические рекомендации ОРВИ у взрослых») и сайт minzdrav.gov.ru.
Поле keywords: 4–8 корней слов в нижнем регистре, по которым в длинном документе (рекомендации на 100+ страниц, кодекс) искать нужные абзацы, например ["парацетамол","суточн","доза"].
Ответ JSON: {"type":"universal|china|mixed","why":"одно предложение","queries":["..."],"domains":["..."],"laws":[],"keywords":["..."]}`,
  entryNoSrc);
writeFileSync(planPath, JSON.stringify(plan, null, 1));
console.error(`Тип: ${plan.type}. Запросов: ${plan.queries?.length}, сайтов: ${plan.domains?.length}`);

// ---- 2. поиск и чтение ----
const seen = new Map();
const OFFICIAL_HOSTS = [...new Set([...OFFICIAL.split(/,\s*/), 'apicr.minzdrav.gov.ru', 'apiportalcr.minzdrav.gov.ru', ...(plan.domains || [])])];
const isOfficial = (u) => { try { const h = new URL(u).hostname; return OFFICIAL_HOSTS.some((d) => h === d || h.endsWith('.' + d)); } catch { return false; } };
const domains = (plan.domains || []).filter((d) => d !== 'grls.minzdrav.gov.ru');
// 1 запрос без фильтра (num 10) и отбор официальных адресов; только если их меньше двух, ещё один запрос по сайту
for (const q of (MANUAL_URLS ? [] : (plan.queries || []).slice(0, 2))) {
  if (seen.size >= 3) break;
  const res = await srez('search', { query: q, num: 10, language: 'ru' }).catch(() => ({}));
  for (const r of res.results || []) if (isOfficial(r.url) && !seen.has(r.url)) seen.set(r.url, { title: r.title, query: q, domain: '' });
  if (seen.size < 2 && domains[0]) {
    const r2 = await srez('search', { query: q, num: 3, language: 'ru', includeDomains: [domains[0]] }).catch(() => ({}));
    for (const r of r2.results || []) if (!seen.has(r.url)) seen.set(r.url, { title: r.title, query: q, domain: domains[0] });
  }
}
for (const u of MANUAL_URLS.split(',').filter(Boolean)) seen.set(u, { title: u, query: 'вручную', domain: '' });
const urls = [...seen.keys()].slice(0, 4);
console.error(`Найдено страниц: ${seen.size}, читаю ${urls.length}`);
const pages = [];
for (const url of urls) {
  try {
    let md = '';
    if (isDirectFetchUrl(url) || isOfficial(url)) md = await fetchPdfText(url).catch((e) => { console.error(`  прямое скачивание не вышло (${e.message}), пробую SREZAI`); return ''; });
    if (md.length < 500) md = '';
    if (!md) {
      try { const p = await srez('read', { url, maxChars: 14000 }); md = p.markdown || p.content || ''; }
      catch (e) { if (/ 502 |source_refused/.test(e.message)) md = await fetchPdfText(url); else throw e; }   // сайт закрыт для SREZAI, пробуем сами
    }
    if (md.length > 9000) md = excerpt(md, plan.keywords, 7000);
    if (md.length > 200) pages.push({ url, title: seen.get(url).title, md });
  } catch (e) { console.error(`  не прочиталась ${url}: ${e.message}`); }
}

// ---- 2б. статьи законов: акт читается целиком один раз и кэшируется ----
mkdirSync('ru-work/research/laws', { recursive: true });
async function lawText(name) {
  const key = name.toLowerCase().replace(/[^a-zа-я0-9]+/g, '-').slice(0, 70);
  const cache = `ru-work/research/laws/${key}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const res = await srez('search', { query: `${name} официальный текст`, num: 3, language: 'ru', includeDomains: ['pravo.gov.ru'] });
  const hit = (res.results || [])[0];
  if (!hit) return null;
  const p = await srez('read', { url: hit.url, maxChars: 900000 });
  const md = p.markdown || p.content || '';
  const rec = { name, url: hit.url, title: hit.title, chars: md.length, text: md };
  if (md.length > 5000) writeFileSync(cache, JSON.stringify(rec));
  return rec;
}
function article(text, art) {
  const re = new RegExp(`(?:^|\\n)[#*\\s]*Статья ${String(art).replace('.', '\\.')}\\.[\\s\\S]*?(?=\\n[#*\\s]*Статья \\d+(?:\\.\\d+)?\\.|$)`);
  const m = re.exec(text);
  return m ? m[0].trim().slice(0, 7000) : null;
}
for (const { name, article: art } of (NO_LAWS ? [] : (plan.laws || []).slice(0, 3))) {
  try {
    const law = await lawText(name);
    if (!law) { console.error(`  закон не найден: ${name}`); continue; }
    const ex = article(law.text, art);
    if (!ex) { console.error(`  в ${name} (${law.chars} знаков) статьи ${art} не нашлось`); continue; }
    pages.push({ url: law.url, title: `${name}, статья ${art}`, md: ex });
    console.error(`  найдена ${name}, ст. ${art} (${ex.length} знаков)`);
  } catch (e) { console.error(`  закон ${name}: ${e.message}`); }
}

// ---- 3. черновик ----
let draft = { applies: 'нет данных', ru_note: '', sources: [], parallel_entry_needed: false };
if (pages.length) {
  draft = await gpt(MODEL,
    `Ты пишешь для русской версии книги поле «В России:» к записи. Правила:
1. Используй ТОЛЬКО факты из приведённых страниц. Ничего из памяти.
2. Каждое утверждение с числом, сроком, суммой или номером нормы подкрепи дословной цитатой из страницы (поле quote, до 300 символов, точное совпадение с текстом страницы).
3. Если страницы не подтверждают российский аналог, верни applies="нет данных" и пустой ru_note. Не выдумывай.
4. Пиши просто, короткими предложениями, на «вы», без канцелярита, 1–4 предложения.
5. Если запись в Китае держится на китайском праве и в России действует другая схема, укажи parallel_entry_needed=true.
6. Если российский источник называет другое число, срок, сумму или условие, чем сказано в записи (например, другой предел суточной дозы), обязательно приведи российское значение с цитатой и прямо напиши, что оно отличается от китайского. Расхождение важнее общих слов. Не выбирай, какое значение «правильное», это решает врач или юрист.
Добавь в JSON поле "differs": true, если нашёл такое расхождение, иначе false.
Ответ JSON: {"applies":"да|частично|нет|нет данных","differs":false,"ru_note":"текст","sources":[{"url":"...","title":"...","quote":"..."}],"parallel_entry_needed":true|false}`,
    `ЗАПИСЬ:\n${entryNoSrc}\n\nСТРАНИЦЫ:\n` + pages.map((p, i) => `[${i + 1}] ${p.url}\n${p.md}`).join('\n\n---\n\n'));
}

// ---- 4. механическая проверка цитат ----
const norm = (s) => s.replace(/[\s ]+/g, ' ').replace(/[«»"“”„]/g, '"').trim().toLowerCase();
const byUrl = new Map(pages.map((p) => [p.url, norm(p.md)]));
const checks = (draft.sources || []).map((s) => ({ ...s, ok: byUrl.has(s.url) && !!s.quote && byUrl.get(s.url).includes(norm(s.quote)) }));
const bad = checks.filter((c) => !c.ok).length;
// каждое число из черновика должно стоять в одной из подтверждённых цитат, иначе его нечем подкрепить
const quoted = checks.filter((c) => c.ok).map((c) => norm(c.quote)).join(' ');
const unsupported = [...new Set((draft.ru_note || '').match(/\d+(?:[.,]\d+)?/g) || [])].filter((n) => !quoted.includes(n.replace(',', '.')) && !quoted.includes(n));

mkdirSync('ru-work/research', { recursive: true });
const out = `# ${basename(file)} · запись ${ENTRY}\n\n${title}\n\n- Тип: **${plan.type}** — ${plan.why}\n- Запросы: ${(plan.queries || []).join(' | ')}\n- Сайты: ${(plan.domains || []).join(', ')}\n- Прочитано страниц: ${pages.length}\n- Применимость: **${draft.applies}**${draft.differs ? ' · ⚠ российский источник РАСХОДИТСЯ с записью' : ''}; отдельная российская запись нужна: ${draft.parallel_entry_needed ? 'да' : 'нет'}\n\n## Черновик поля «В России:»\n\n${draft.ru_note || '(нет данных)'}\n\n${unsupported.length ? `> ⚠ Числа в черновике без подтверждающей цитаты: ${unsupported.join(', ')}. Не публиковать без проверки.\n\n` : ''}## Источники и проверка цитат (${checks.length - bad}/${checks.length} цитат найдено на странице)\n\n${checks.map((c) => `- ${c.ok ? '✅' : '❌'} ${c.title || ''} <${c.url}>\n  > ${c.quote}`).join('\n')}\n`;
writeFileSync(`ru-work/research/${basename(file, '.md')}-${ENTRY}.md`, out);
console.error(`Кредитов потрачено: ${credits} (≈ ${(credits * 0.1).toFixed(1)} ₽)`);
console.error(`Записано ru-work/research/${basename(file, '.md')}-${ENTRY}.md; цитат не подтвердилось: ${bad}`);
