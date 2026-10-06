// Сравнивает числа по каждой записи: китайский оригинал vs чужой русский перевод vs наш.
//   node tools/ru/crosscheck.mjs /tmp/dlgrv/book/ru
// Печатает записи, где у чужого перевода числа не сходятся с оригиналом, а у нашего сходятся.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const THEIRS = process.argv[2];
const mul = (n, k) => String(Math.round(parseFloat(n.replace(',', '.')) * k));
const normZh = (s) => s.replace(/(\d+(?:\.\d+)?)\s*万/g, (_, n) => mul(n, 1e4)).replace(/(\d+(?:\.\d+)?)\s*亿/g, (_, n) => mul(n, 1e8)).replace(/\d+\s*月/g, '月');
const normRu = (s) => s.replace(/(\d+(?:[.,]\d+)?)\s*(?:млн|миллион\w*)/gi, (_, n) => mul(n, 1e6)).replace(/(\d+(?:[.,]\d+)?)\s*(?:тыс\.?|тысяч\w*)/gi, (_, n) => mul(n, 1e3)).replace(/(\d) (\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
const body = (s) => s.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (来源|Источники|Источник)\s*[：:]/.test(l)).join('\n').replace(/https?:\/\/\S+/g, '');
const bag = (s, norm) => { const m = new Map(); for (const t of norm(body(s)).match(/\d+(?:\.\d+)?/g) || []) m.set(t, (m.get(t) || 0) + 1); return m; };
// чего не хватает в b относительно a (по числу вхождений)
const missing = (a, b) => [...a].filter(([t, c]) => (b.get(t) || 0) < c).map(([t]) => t);
const entries = (txt) => { const o = new Map(); for (const p of txt.split(/^(?=### )/m)) { const m = p.match(/^### (\d+)\./); if (m) o.set(Number(m[1]), p); } return o; };

const rows = [];
let total = 0, theirsBad = 0, mineBad = 0, onlyTheirs = 0, both = 0;
for (const f of readdirSync('book').filter((x) => /^\d\d-.*\.md$/.test(x))) {
  const nn = f.slice(0, 2);
  const tf = readdirSync(THEIRS).find((x) => x.startsWith(nn + '-'));
  const mine = readdirSync('ru/book').find((x) => x.startsWith(nn + '-'));
  if (!tf || !mine) continue;
  const O = entries(readFileSync(`book/${f}`, 'utf8')), T = entries(readFileSync(`${THEIRS}/${tf}`, 'utf8')), M = entries(readFileSync(`ru/book/${mine}`, 'utf8'));
  for (const [n, o] of O) {
    total++;
    const a = bag(o, normZh);
    const t = T.get(n) ? missing(a, bag(T.get(n), normRu)) : ['(записи нет)'];
    const m = M.get(n) ? missing(a, bag(M.get(n), normRu)) : ['(записи нет)'];
    if (t.length) theirsBad++;
    if (m.length) mineBad++;
    if (t.length && !m.length) { onlyTheirs++; rows.push({ nn, n, miss: t, title: o.split('\n')[0].slice(0, 70) }); }
    if (t.length && m.length) both++;
  }
}
console.log(`записей: ${total}; расхождений в их переводе: ${theirsBad}; в нашем: ${mineBad}; только у них: ${onlyTheirs}; у обоих: ${both}`);
writeFileSync('ru-work/crosscheck.md', `# Расхождения чисел только в чужом переводе (${onlyTheirs})\n\n` + rows.map((r) => `- ${r.nn} · запись ${r.n} · нет чисел: ${r.miss.join(', ')} · ${r.title}`).join('\n') + '\n');
