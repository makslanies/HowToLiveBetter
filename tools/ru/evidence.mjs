// Сбор «пакетов доказательств» для российского слоя БЕЗ языковой модели. Запросы составляет человек или ИИ-ассистент (ru-work/evidence/plans.json),
// поиск и чтение идут через срезAI (быстрые /search и /read), официальные страницы скачиваются напрямую. Формулировки пишутся по пакету,
// цитаты и числа проверяет tools/ru/draft.mjs.
//   node tools/ru/evidence.mjs [--max 30] [--only 13-2,19-1] [--redo] [--dry-run]
// План: {"13-2": {"q": ["запрос 1", "запрос 2"], "d": ["minzdrav.gov.ru"]}}. Пакет: ru-work/evidence/<раздел>-<пункт>.md. Состояние: state.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseBook, keyOf } from './parse.mjs';
import { fetchPdfText, excerpt } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const MAX = Number(opt('max', '30')), ONLY = (opt('only', '') || '').split(',').filter(Boolean), DRY = args.includes('--dry-run'), REDO = args.includes('--redo');
const DAILY = Number(opt('daily-limit', '480'));
for (const l of readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const O = new URL(process.env.SREZAI_BASE_URL).origin;

mkdirSync('ru-work/evidence', { recursive: true });
const STATE = 'ru-work/evidence/state.json';
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

// ---- журнал суточного расхода обращений (общий с research.mjs) ----
const USAGE = 'ru-work/research/usage.json';
let last = 0, credits = 0;
function guard() {
  const u = existsSync(USAGE) ? JSON.parse(readFileSync(USAGE, 'utf8')) : { blockedUntil: 0, calls: [] };
  const now = Math.floor(Date.now() / 1000);
  if (u.blockedUntil && now < u.blockedUntil) { console.error(`СТОП: квота сбросится ${new Date(u.blockedUntil * 1000).toLocaleString('ru-RU')}`); process.exit(3); }
  u.calls = (u.calls || []).filter((t) => now - t < 86400);
  if (u.calls.length >= DAILY) { console.error(`СТОП: за сутки ${u.calls.length} обращений (потолок ${DAILY})`); process.exit(3); }
  return u;
}
async function srez(path, body, timeoutMs = 45000) {
  const u = guard();
  const wait = last + 400 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now(); u.calls.push(Math.floor(last / 1000)); writeFileSync(USAGE, JSON.stringify(u)); credits++;
  let r, j;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { r = await fetch(`${O}/api/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SREZAI_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }); j = await r.json().catch(() => ({})); } catch { r = { ok: false, status: 0 }; j = {}; }
    if (r.status !== 0 && r.status < 500) break;
    await new Promise((x) => setTimeout(x, 2500 * attempt));         // 5xx и обрывы: подождать и повторить
  }
  if (r.status === 429 && j.reason === 'quota') { u.blockedUntil = Math.floor(Date.now() / 1000) + (j.retryAfterSec || 3600); writeFileSync(USAGE, JSON.stringify(u)); console.error('СТОП: квота исчерпана'); process.exit(3); }
  if (!r.ok) throw new Error(`srezai ${path} ${r.status}`);
  return j;
}

const OFFICIAL = ['pravo.gov.ru', 'government.ru', 'kremlin.ru', 'minzdrav.gov.ru', 'rospotrebnadzor.ru', 'mchs.gov.ru', 'mvd.ru', 'rosstat.gov.ru', 'nalog.gov.ru', 'fns.gov.ru', 'sfr.gov.ru', 'rostrud.gov.ru', 'minfin.gov.ru', 'cbr.ru', 'vsrf.ru', 'genproc.gov.ru', 'gosuslugi.ru', 'trudvsem.ru', 'mintrud.gov.ru', 'fas.gov.ru', 'rkn.gov.ru', 'minjust.gov.ru', 'fssp.gov.ru', 'fedresurs.ru', 'sledcom.ru', 'rpn.gov.ru', 'minprirody.gov.ru', 'roszdravnadzor.gov.ru', 'mid.ru', 'who.int', 'xn--80akibcicpdbetz7e2g.xn--p1ai', 'xn--80aaaajbbqe6bcm1b.xn--p1ai'];
const LEGAL_DB = ['consultant.ru', 'garant.ru'];     // текст действующей редакции закона; вторичный источник, помечается
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isIn = (u, list) => { const h = hostOf(u); return list.some((d) => h === d || h.endsWith('.' + d)); };
const STOP = new Set(['сначала', 'нужно', 'когда', 'можно', 'вашей', 'своей', 'чтобы', 'после', 'перед', 'только', 'любой', 'должны', 'должен', 'также']);
const keywordsOf = (t) => [...new Set((t.toLowerCase().match(/[а-яё]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 6)))].slice(0, 12);

const PLANS = existsSync('ru-work/evidence/plans.json') ? JSON.parse(readFileSync('ru-work/evidence/plans.json', 'utf8')) : {};
const book = Object.fromEntries(parseBook().flatMap((s) => s.entries.map((e) => [keyOf(e), e])));
const todo = Object.keys(PLANS).filter((k) => (!ONLY.length || ONLY.includes(k)) && book[k] && !book[k].ru && (REDO || ONLY.length || !(state[k] && (state[k].pages.length || state[k].tries >= 2))));
console.error(`в плане ${Object.keys(PLANS).length}, к обработке ${todo.length}; за запуск не больше ${MAX}`);
if (DRY) { for (const k of todo.slice(0, 15)) console.error(`  ${k} ${PLANS[k].q[0]}`); process.exit(0); }

let done = 0, fails = 0;
for (const key of todo.slice(0, MAX)) {
  const e = book[key], plan = PLANS[key];
  const kws = keywordsOf(plan.q.join(' ') + ' ' + e.title);
  try {
    const found = new Map();
    for (const q of plan.q.slice(0, 2)) {
      const res = await srez('search', { query: q, num: 10, language: 'ru' });
      for (const r of res.results || []) {
        if (found.has(r.url)) continue;
        if (isIn(r.url, OFFICIAL)) found.set(r.url, { ...r, kind: 'официальный' });
        else if (isIn(r.url, LEGAL_DB)) found.set(r.url, { ...r, kind: 'справочная база закона' });
      }
      if ([...found.values()].filter((x) => x.kind === 'официальный').length >= 3) break;
    }
    if ([...found.values()].filter((x) => x.kind === 'официальный').length < 2) {          // точечные запросы по одному официальному сайту
      for (const d of (plan.d || []).slice(0, 2)) {
        const res = await srez('search', { query: plan.q[0], num: 4, language: 'ru', includeDomains: [d] }).catch(() => ({}));
        for (const r of (res.results || []).slice(0, 2)) if (!found.has(r.url)) found.set(r.url, { ...r, kind: 'официальный' });
      }
    }
    const pick = [...found.values()].sort((a, b) => (a.kind === 'официальный' ? 0 : 1) - (b.kind === 'официальный' ? 0 : 1)).slice(0, 5);
    const pages = [];
    for (const r of pick) {
      let text = '';
      try { text = await fetchPdfText(r.url); } catch { /* пробуем срезAI */ }
      if (text.length < 500) { try { const p = await srez('read', { url: r.url, maxChars: 14000 }, 60000); text = p.markdown || p.content || ''; } catch { /* пропуск */ } }
      const ex = excerpt(text, kws, 3200).trim();
      if (ex.length < 250) continue;                                                       // страница не про это
      pages.push({ url: r.url, title: r.title || '', kind: r.kind, text: ex });
    }
    const tries = ((state[key] || {}).tries || 0) + 1;
    if (!pages.length) { state[key] = { at: new Date().toISOString(), tries, pages: [] }; save(); console.error(`  ${key}: страниц нет (попытка ${tries})`); continue; }
    const md = `# Пакет доказательств ${key}\n\n## Пункт (русский текст)\n${e.title}\n\nЗатраты: ${e.cost}\n\nПростыми словами: ${e.human}\n\nВыгода: ${e.gain.slice(0, 900)}\n\n## Запросы\n${plan.q.join('\n')}\n\n` + pages.map((p, i) => `## Страница ${i + 1} (${p.kind})\nАдрес: ${p.url}\nЗаголовок: ${p.title}\n\n${p.text}\n`).join('\n');
    writeFileSync(`ru-work/evidence/${key}.md`, md);
    state[key] = { at: new Date().toISOString(), tries, pages: pages.map((p) => p.url), official: pages.filter((p) => p.kind === 'официальный').length }; save();
    done++; fails = 0; console.error(`  ${key}: страниц ${pages.length} (официальных ${state[key].official})`);
  } catch (err) { console.error(`  ${key}: ошибка ${err.message}`); if (++fails >= 6) { console.error('СТОП: 6 ошибок подряд, срезAI сейчас нестабилен'); break; } }
}
console.error(`готово пакетов: ${done}; обращений за запуск: ${credits}`);
