// Приём черновиков российского слоя, написанных человеком или ИИ-ассистентом по пакетам доказательств (ru-work/evidence/<ключ>.md).
// Проверка без модели: (1) каждая цитата должна дословно (после нормализации пробелов и кавычек) стоять в тексте страницы с этим адресом;
// (2) каждое число из полей должно стоять в какой-нибудь подтверждённой цитате; (3) адрес должен быть в пакете. Прошедшее пишется в слой правок
// ru-work/overlay в формате «- Простыми словами (Россия):», «- Затраты (Россия):», «- Выгода (Россия):», «- Примечания (Россия):», «- Источники (Россия):».
//   node tools/ru/draft.mjs ru-work/evidence/drafts-001.json [--apply]
// Формат файла: {"13-12": {"human": "...", "cost": "...", "gain": "...", "note": "...", "sources": [{"title": "...", "url": "...", "quote": "..."}]}}
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('node tools/ru/draft.mjs <drafts.json> [--apply]'); process.exit(2); }
const APPLY = rest.includes('--apply');
const drafts = JSON.parse(readFileSync(file, 'utf8'));
const norm = (s) => s.replace(/[   ]/g, ' ').replace(/[«»"“”„]/g, '"').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));
const FIELDS = [['human', 'Простыми словами (Россия)'], ['cost', 'Затраты (Россия)'], ['gain', 'Выгода (Россия)'], ['note', 'Примечания (Россия)']];
const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('.');
const files = Object.fromEntries(readdirSync('ru/book').filter((f) => /^\d\d-/.test(f)).map((f) => [String(Number(f.slice(0, 2))), f.replace(/\.md$/, '')]));

let ok = 0, bad = 0; const perFile = {};
for (const [key, d] of Object.entries(drafts)) {
  const pk = `ru-work/evidence/${key}.md`;
  if (!existsSync(pk)) { console.error(`⛔ ${key}: нет пакета доказательств`); bad++; continue; }
  const packet = readFileSync(pk, 'utf8');
  const byIndex = new Map([...packet.matchAll(/## Страница (\d) \([^)]*\)\nАдрес: (\S+)/g)].map((m) => [Number(m[1]), m[2]]));
  for (const sx of d.sources || []) if (sx.page && !sx.url) sx.url = byIndex.get(sx.page) || '';
  const pages = new Map([...packet.matchAll(/## Страница \d \([^)]*\)\nАдрес: (\S+)\n[^\n]*\n\n([\s\S]*?)(?=\n## Страница|$)/g)].map((m) => [m[1], norm(m[2])]));
  const problems = [], good = [];
  if (!d.sources || !d.sources.length) problems.push('нет источников');
  for (const s of d.sources || []) {
    if (!pages.has(s.url)) { problems.push(`адреса нет в пакете: ${s.url.slice(0, 70)}`); continue; }
    if (!s.quote || !pages.get(s.url).includes(norm(s.quote))) { problems.push(`цитата не найдена на странице: «${(s.quote || '').slice(0, 60)}»`); continue; }
    good.push(s);
  }
  const quoted = norm(good.map((s) => s.quote).join(' '));
  const quotedNums = new Set(nums(quoted));
  const text = FIELDS.map(([k]) => d[k] || '').join(' ');
  const unsupported = [...new Set(nums(text))].filter((n) => !quotedNums.has(n) && !['1', '2', '3'].includes(n) && !(n === '112' || n === '103' || n === '101' || n === '102'));
  if (unsupported.length) problems.push(`числа без цитаты: ${unsupported.join(', ')}`);
  if (!FIELDS.some(([k]) => d[k])) problems.push('нет ни одного поля текста');
  if (problems.length) { console.error(`⛔ ${key}: ${problems.join('; ')}`); bad++; continue; }
  ok++;
  console.error(`✅ ${key}: цитат ${good.length}, полей ${FIELDS.filter(([k]) => d[k]).length}`);
  const [sec, n] = key.split('-');
  const lines = FIELDS.filter(([k]) => d[k]).map(([k, label]) => `- ${label}: ${d[k].replace(/\s+/g, ' ').trim()}`);
  const uniq = [...new Map(good.map((s) => [s.url, s])).values()];
  lines.push(`- Источники (Россия): ${uniq.map((s) => `${s.title}. Проверено ${today}. <${s.url}>`).join(' ; ')}`);
  (perFile[files[sec]] ||= []).push({ entry: Number(n), kind: 'russia', lines });
}
console.error(`\nпринято ${ok}, отклонено ${bad}${APPLY ? '' : ' (пробный прогон, добавьте --apply)'}`);
if (APPLY && ok) {
  mkdirSync('ru-work/overlay', { recursive: true });
  for (const [f, items] of Object.entries(perFile)) {
    const p = `ru-work/overlay/${f}.json`;
    const ov = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
    const keep = ov.filter((x) => !(x.kind === 'russia' && items.some((i) => i.entry === x.entry)));   // обновлённый черновик заменяет прежний
    writeFileSync(p, JSON.stringify([...keep, ...items], null, 2) + '\n');
  }
  console.error('записано в слой правок; дальше: node tools/ru/apply-overlay.mjs');
}
process.exit(bad && !ok ? 1 : 0);
