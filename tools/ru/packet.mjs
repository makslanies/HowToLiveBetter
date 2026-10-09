// Ручной пакет доказательств: скачивает указанные страницы напрямую (квоту срезAI не тратит) и пишет ru-work/evidence/<пункт>.md в том же формате,
// что evidence.mjs, чтобы draft.mjs мог проверить цитаты. Старый пакет откладывается в <пункт>.old.md.
//   node tools/ru/packet.mjs 33-10 https://www.consultant.ru/document/cons_doc_LAW_8559/931d.../ [ещё адреса] [--max 14000]
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fetchPdfText } from './lib.mjs';
import { parseBook, keyOf } from './parse.mjs';

const a = process.argv.slice(2);
const mi = a.indexOf('--max'); const MAX = mi >= 0 ? Number(a[mi + 1]) : 14000;
const [key, ...urls] = a.filter((x, i) => !(x === '--max' || (mi >= 0 && i === mi + 1)));
if (!key || !urls.length) { console.error('node tools/ru/packet.mjs <раздел-пункт> <адрес> [адрес…] [--max N]'); process.exit(2); }
const e = parseBook().flatMap((s) => s.entries).find((x) => keyOf(x) === key);
if (!e) { console.error(`нет пункта ${key}`); process.exit(2); }
const pages = [];
for (const u of urls) {
  let t = ''; try { t = (await fetchPdfText(u)).replace(/\u0000/g, ''); } catch (err) { console.error(`  ${u}: ${err.message}`); continue; }
  const flat = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const title = (flat.split('\n')[0] || u).slice(0, 140);
  pages.push({ u, title, text: flat.slice(0, MAX) });
  console.error(`  ${u}: ${flat.length} знаков, в пакет ${Math.min(flat.length, MAX)}`);
}
if (!pages.length) process.exit(1);
const file = `ru-work/evidence/${key}.md`;
if (existsSync(file)) renameSync(file, `ru-work/evidence/${key}.old.md`);
const kind = (u) => (/consultant\.ru|garant\.ru/.test(u) ? 'справочная база закона' : 'официальный');
writeFileSync(file, `# Пакет доказательств ${key}\n\n## Пункт (русский текст)\n${e.title}\n\nЗатраты: ${e.cost}\n\nПростыми словами: ${e.human}\n\nВыгода: ${e.gain.slice(0, 900)}\n\n## Запросы\nвручную\n\n` + pages.map((p, i) => `## Страница ${i + 1} (${kind(p.u)})\nАдрес: ${p.u}\nЗаголовок: ${p.title}\n\n${p.text}\n`).join('\n'));
const stFile = 'ru-work/evidence/state.json'; const st = JSON.parse(readFileSync(stFile, 'utf8'));
st[key] = { at: new Date().toISOString(), tries: 1, pages: pages.map((p) => p.u), official: pages.filter((p) => kind(p.u) === 'официальный').length, manual: true };
writeFileSync(stFile, JSON.stringify(st, null, 1));
console.error(`${key}: пакет записан, страниц ${pages.length}`);
