// Собирает ru/materials.json: официальные российские страницы, которые нашёл срезAI по теме пункта (ссылка, заголовок, сайт).
// Это не проверенный российский слой, а список «что прочитать по теме»; на карточке он подписан именно так.
// Берём только официальные сайты и справочные базы закона (consultant.ru, garant.ru); у пунктов с готовым российским слоем список не нужен.
//   node tools/ru/materials.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseBook, keyOf } from './parse.mjs';

const have = new Set(parseBook().flatMap((s) => s.entries.filter((e) => e.ru).map(keyOf)));
const clean = (t) => String(t || '').replace(/\s+/g, ' ').replace(/\.\.\.$|…$/, '').replace(/\s*[|·—–-]\s*(КонсультантПлюс|Министерство.*|Федеральн.*|Управление.*|Официальный.*)$/i, '').trim();
const book = Object.fromEntries(parseBook().flatMap((x) => x.entries.map((e) => [keyOf(e), e])));
const STOP = new Set(['когда', 'можно', 'нужно', 'чтобы', 'после', 'перед', 'только', 'сначала', 'своей', 'вашей']);
const stems = (t) => [...new Set((String(t).toLowerCase().match(/[а-яё]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)))];
const GENERIC = /^(оглавление|клинические рекомендации|приложение|документ|постановление|приказ|главная|новости?|страница)(?![а-яё])/i;
const out = {};
let pages = 0;
for (const f of readdirSync('ru-work/evidence').filter((x) => /^\d+-\d+\.md$/.test(x))) {
  const key = f.replace('.md', '');
  if (have.has(key)) continue;
  const md = readFileSync(`ru-work/evidence/${f}`, 'utf8');
  const list = [];
  const want = stems(book[key] ? book[key].title : '');
  for (const m of md.matchAll(/## Страница \d \(([^)]*)\)\nАдрес: (\S+)\nЗаголовок: ([^\n]*)\n\n([\s\S]*?)(?=\n## Страница|$)/g)) {
    const [, kind, url, title, body] = m;
    const low = (title + ' ' + body).toLowerCase();
    if (want.filter((w) => low.includes(w)).length < Math.min(want.length, Math.max(3, Math.ceil(want.length * 0.34)))) continue;                 // страница не про тему пункта
    const head = body.replace(/\[Дополнительные выдержки\][\s\S]*/, '').replace(/\s+/g, ' ').trim();
    if (!/^https:\/\//.test(url) || list.some((x) => x.u === url)) continue;
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    let t = clean(title); if (!t || t.length < 12 || GENERIC.test(t)) t = (head.split(/(?<=[.!?])\s/)[0] || '').slice(0, 110).replace(/\s+\S*$/, '…') || host;
    if (/Microsoft Word|[>@<]{2}|\.docx?(?![a-z])|^[^а-яё]*$/i.test(t)) continue;                    // мусорный заголовок из PDF
    list.push({ u: url, t, h: host, k: kind === 'официальный' ? 'o' : 'r' });
  }
  if (list.length) { out[key] = list.slice(0, 4); pages += Math.min(4, list.length); }
}
writeFileSync('ru/materials.json', JSON.stringify(out));
console.error(`ru/materials.json: пунктов ${Object.keys(out).length}, ссылок ${pages}`);
