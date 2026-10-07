// Дополняет пакет доказательств нужными местами страниц: скачивает страницы пакета напрямую (квоту срезAI не тратит) и дописывает
// в конец каждой страницы пакета абзацы вокруг ключевых слов. Дальше draft.mjs принимает цитаты и из этих абзацев.
//   node tools/ru/deepen.mjs 1-6 "электровелосипед|самокат|зарядк" [--ctx 450] [--max 6]
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchPdfText } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [key, pattern] = args;
if (!key || !pattern) { console.error('node tools/ru/deepen.mjs <пункт> "слово1|слово2" [--ctx 450] [--max 6]'); process.exit(2); }
const CTX = Number(opt('ctx', '450')), MAX = Number(opt('max', '6'));
const file = `ru-work/evidence/${key}.md`;
let packet = readFileSync(file, 'utf8');
const re = new RegExp(pattern, 'gi');
const blocks = [...packet.matchAll(/(## Страница (\d) \([^)]*\)\nАдрес: (\S+)\n[^\n]*\n\n)([\s\S]*?)(?=\n## Страница|$)/g)];
let added = 0;
for (const b of blocks) {
  const [, head, , url, body] = b;
  if (body.includes('[Дополнительные выдержки]')) continue;
  let text = '';
  try { text = await fetchPdfText(url); } catch { continue; }
  if (text.length < 300) continue;
  const flat = text.replace(/\s+/g, ' ');
  const have = body.replace(/\s+/g, ' ');
  const spans = [];
  for (const m of flat.matchAll(re)) {
    const a = Math.max(0, m.index - CTX), z = Math.min(flat.length, m.index + CTX);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = z; else spans.push([a, z]);
    if (spans.length >= MAX) break;
  }
  const extra = spans.map(([a, z]) => flat.slice(a, z).trim()).filter((s) => !have.includes(s.slice(40, 140))).join('\n\n');
  if (!extra) continue;
  packet = packet.replace(head + body, head + body + '\n\n[Дополнительные выдержки]\n' + extra + '\n');
  added += spans.length;
}
writeFileSync(file, packet);
console.error(`${key}: добавлено фрагментов ${added}`);
