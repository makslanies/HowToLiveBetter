// Классифицирует все записи русского перевода: universal / china / mixed, плюс поисковые запросы
// и официальные сайты для российской сверки. Результат: ru-work/research/classification.json
//   node tools/ru/classify.mjs [--model gpt-6-luna]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const MODEL = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'gpt-6-luna';
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const OFFICIAL = 'pravo.gov.ru, publication.pravo.gov.ru, government.ru, kremlin.ru, minzdrav.gov.ru, cr.minzdrav.gov.ru, rospotrebnadzor.ru, mchs.gov.ru, mvd.ru, rosstat.gov.ru, nalog.gov.ru, sfr.gov.ru, rostrud.gov.ru, minfin.gov.ru, cbr.ru, vsrf.ru, genproc.gov.ru, who.int, pubmed.ncbi.nlm.nih.gov, europepmc.org';
const SYSTEM = `Ты помогаешь адаптировать запись китайского руководства по жизни для читателей России и СНГ. Определи, на чём держится запись:
- "universal": медицина, поведение, психология, физика; верна в любой стране, российский аналог нужен только для телефонов, названий лекарств, местных правил;
- "china": держится на китайском праве, органах, выплатах, платформах, телефонах, порядке регистрации; в России нужен отдельный российский аналог;
- "mixed": часть универсальная, часть китайская.
Составь до 3 поисковых запросов на русском для поиска российской версии и до 5 официальных сайтов (только из списка: ${OFFICIAL}). Если российского аналога по сути быть не может (например, нет такого института), ставь "no_analog": true.
Ответ JSON: {"type":"universal|china|mixed","no_analog":false,"why":"одно предложение","queries":["..."],"domains":["..."]}`;

const items = [];
for (const f of readdirSync('ru/book').filter((x) => /^\d\d-/.test(x)).sort()) {
  for (const p of readFileSync(`ru/book/${f}`, 'utf8').split(/^(?=### )/m)) {
    const m = p.match(/^### (\d+)\. (.*)/);
    if (!m) continue;
    const text = p.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (Источники|来源)/.test(l)).join('\n').slice(0, 3500);
    items.push({ sec: f.slice(0, 2), n: Number(m[1]), title: m[2], text });
  }
}
console.error(`записей: ${items.length}, модель ${MODEL}`);

async function call(it) {
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: it.text }] }) });
    const j = await r.json();
    if (r.ok) { try { return { d: JSON.parse(j.choices[0].message.content), u: j.usage }; } catch { /* повтор */ } }
    else if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((s) => setTimeout(s, 2000 * a));
  }
  return { d: { type: 'unknown' }, u: {} };
}
const out = new Array(items.length); let next = 0, tin = 0, tout = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < items.length) {
    const i = next++; const it = items[i];
    try { const { d, u } = await call(it); out[i] = { sec: it.sec, n: it.n, title: it.title, ...d }; tin += u.prompt_tokens || 0; tout += u.completion_tokens || 0; }
    catch (e) { out[i] = { sec: it.sec, n: it.n, title: it.title, type: 'error', why: e.message }; }
    if ((i + 1) % 100 === 0) console.error(`  ${i + 1}/${items.length}`);
  }
}));
mkdirSync('ru-work/research', { recursive: true });
writeFileSync('ru-work/research/classification.json', JSON.stringify(out, null, 1));
const cnt = {}; for (const o of out) cnt[o.type] = (cnt[o.type] || 0) + 1;
const bySec = {}; for (const o of out) { bySec[o.sec] ??= { universal: 0, china: 0, mixed: 0, other: 0 }; bySec[o.sec][['universal', 'china', 'mixed'].includes(o.type) ? o.type : 'other']++; }
console.error(`готово: ${JSON.stringify(cnt)}; no_analog: ${out.filter((o) => o.no_analog).length}; токены ${tin}/${tout}`);
console.log(Object.entries(bySec).map(([s, c]) => `${s}: у=${c.universal} к=${c.china} см=${c.mixed}${c.other ? ' ?=' + c.other : ''}`).join('\n'));
