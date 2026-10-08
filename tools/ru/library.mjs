// Собирает ru/library.json: самостоятельная «Российская библиотека» — официальные страницы, которые нашёл срезAI, независимо от китайских пунктов.
// v=1: страница использована как источник в российском слое пункта (цитаты сверены с текстом). v=0: найдена поиском, вручную не проверена.
//   node tools/ru/library.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { parseBook, keyOf } from './parse.mjs';
import { fetchPdfText } from './lib.mjs';

const secs = parseBook();
const book = Object.fromEntries(secs.flatMap((s) => s.entries.map((e) => [keyOf(e), e])));
const verified = new Set();
for (const e of Object.values(book)) for (const m of String(e.srcRussia || '').matchAll(/<(https?:\/\/[^>\s]+)>/g)) verified.add(m[1]);
const STOP = new Set(['когда', 'можно', 'нужно', 'чтобы', 'после', 'перед', 'только', 'сначала', 'своей', 'вашей']);
const stems = (t) => [...new Set((String(t).toLowerCase().match(/[а-яё]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)))];
const GENERIC = /^(оглавление|клинические рекомендации|приложение|документ|постановление|приказ|главная|новости?|страница)(?![а-яё])/i;
const BAD = /Microsoft Word|[>@<]{2}|\.docx?(?![a-z])|^[^а-яё]*$/i;
const clean = (t) => String(t || '').replace(/\s+/g, ' ').replace(/\.\.\.$|…$/, '').replace(/^[\s"«»'’]+/, '').trim();
const items = new Map();
for (const f of readdirSync('ru-work/evidence').filter((x) => /^\d+-\d+\.md$/.test(x))) {
  const key = f.replace('.md', '');
  if (!book[key]) continue;
  const md = readFileSync(`ru-work/evidence/${f}`, 'utf8');
  const want = stems(book[key].title);
  for (const m of md.matchAll(/## Страница \d \(([^)]*)\)\nАдрес: (\S+)\nЗаголовок: ([^\n]*)\n\n([\s\S]*?)(?=\n## Страница|$)/g)) {
    const [, kind, url, title, body] = m;
    if (!/^https:\/\//.test(url)) continue;
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    const head = body.replace(/\[Дополнительные выдержки\][\s\S]*/, '').replace(/\s+/g, ' ').trim();
    const low = (title + ' ' + body).toLowerCase();
    const isV = verified.has(url);
    if (!isV && want.filter((w) => low.includes(w)).length < Math.min(want.length, Math.max(3, Math.ceil(want.length * 0.34)))) continue;
    let t = clean(title);
    if (!t || t.length < 12 || GENERIC.test(t)) t = (head.split(/(?<=[.!?])\s/)[0] || '').slice(0, 120).replace(/\s+\S*$/, '…');
    if (!t || BAD.test(t)) continue;
    let x = items.get(url);
    if (!x) { x = { u: url, t, h: host, k: kind === 'официальный' ? 'o' : 'r', v: 0, s: Number(key.split('-')[0]), e: [], x: head.slice(0, 220).replace(/\s+\S*$/, '…') }; items.set(url, x); }
    if (isV) x.v = 1;
    if (!x.e.includes(key)) x.e.push(key);
  }
}
// у PDF клинических рекомендаций заголовок из страницы бывает обрывком текста: берём название с титульного листа
const cache = existsSync('ru-work/evidence/library-titles.json') ? JSON.parse(readFileSync('ru-work/evidence/library-titles.json', 'utf8')) : {};
for (const x of items.values()) {
  if (!/(?:cr|apicr|apiportalcr)\.minzdrav\.gov\.ru/.test(x.u)) continue;
  if (!(x.u in cache)) {
    let name = '';
    try { const t = (await fetchPdfText(x.u)).slice(0, 2500).replace(/\s+/g, ' '); const m = /Клинические рекомендации\s+(.{5,160}?)\s+(?:Кодирование по Международной|Год утверждения|Возрастная группа|ID:|Разработчик)/.exec(t); name = m ? m[1].trim() : ''; } catch { /* не скачалось */ }
    cache[x.u] = name;
  }
  if (cache[x.u]) { x.t = 'Клинические рекомендации: ' + cache[x.u]; x.x = 'Клинические рекомендации Минздрава России.'; }
}
writeFileSync('ru-work/evidence/library-titles.json', JSON.stringify(cache));
const FLUFF = /приняли участие|круглом столе|поздравл|награжд|совещани|заседани|встреч[аиу] с |Директор Департамента|вручил|торжествен/i;
const good = (x) => !FLUFF.test(x.t) && /^[А-ЯЁA-Z]/.test(x.t) && x.t.length >= 12 && x.t.length <= 170 && !/_{3,}/.test(x.t);
for (const x of items.values()) if (/_{3,}|^\d/.test(x.x) || /\d{4,}.*\d{4,}.*\d{4,}/.test(x.x)) x.x = '';
for (const [u, x] of [...items]) if (!good(x)) items.delete(u);
const list = [...items.values()].sort((a, b) => a.s - b.s || b.v - a.v || a.t.localeCompare(b.t, 'ru'));
writeFileSync('ru/library.json', JSON.stringify(list));
const v = list.filter((x) => x.v).length;
console.error(`ru/library.json: страниц ${list.length} (проверено ${v}, найдено поиском ${list.length - v}); разделов ${new Set(list.map((x) => x.s)).size}`);
