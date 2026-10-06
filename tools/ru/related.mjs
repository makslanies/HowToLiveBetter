// «Смотрите также»: для каждой записи подбирает похожие по смыслу, в основном из других разделов.
// Результат ru/related.json (в репозитории, чтобы CI не звал OpenAI) и ru-work/related-scores.json (для оценки).
//   node tools/ru/related.mjs [--min 0.5] [--per 3] [--sample 12]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseBook, keyOf } from './parse.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const MIN = opt('min', 0.45), PER = opt('per', 3), SAMPLE = opt('sample', 0);
const MODEL = 'text-embedding-3-small';
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sections = parseBook();
const entries = sections.flatMap((s) => s.entries);
const text = (e) => `${e.title}\n${e.human}\n${e.gain.replace(/\*\*/g, '').slice(0, 500)}`;

mkdirSync('ru-work', { recursive: true });
const CACHE = 'ru-work/embeddings.json';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const hash = (t) => createHash('sha1').update(MODEL + t).digest('hex').slice(0, 20);
const need = entries.filter((e) => !cache[hash(text(e))]);
for (let i = 0; i < need.length; i += 100) {
  const batch = need.slice(i, i + 100);
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, input: batch.map(text) }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
  j.data.forEach((d, k) => { cache[hash(text(batch[k]))] = d.embedding.map((x) => Math.round(x * 1e5) / 1e5); });
  console.error(`  эмбеддинги ${Math.min(i + 100, need.length)}/${need.length}`);
}
writeFileSync(CACHE, JSON.stringify(cache));

const V = entries.map((e) => { const v = cache[hash(text(e))]; const n = Math.hypot(...v); return v.map((x) => x / n); });
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const scores = entries.map((e, i) => entries.map((f, j) => (i === j ? -1 : dot(V[i], V[j]))));

// Кандидаты: 8 ближайших (кроме соседних пунктов того же раздела) с близостью не ниже MIN.
// Окончательно выбирает модель-судья: берёт только то, что читателю стоит открыть следом (тот же вопрос с другой стороны, шаг до или после, исключение).
const JUDGE = 'gpt-6.1-sol';
const JC = 'ru-work/related-judge.json';
const jcache = existsSync(JC) ? JSON.parse(readFileSync(JC, 'utf8')) : {};
const SYSTEM = `Читатель только что прочитал пункт книги-руководства по жизни. Ниже кандидаты «Смотрите также». Выбери не больше ${PER}, которые ему реально стоит открыть следом: тот же вопрос с другой стороны, шаг до или после, исключение или противоположный случай, прямое дополнение. Не выбирай просто соседей по теме (та же широкая область без прямой связи с этим пунктом). Лучше выбрать 0, чем слабую ссылку. Предпочитай другие разделы. Ответ JSON: {"keys":["8-11","9-5"],"why":"одно предложение"}`;
const jpost = async (user) => {
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: JUDGE, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }) });
    const j = await r.json();
    if (r.ok) { try { return JSON.parse(j.choices[0].message.content); } catch { /* повтор */ } }
    else if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((x) => setTimeout(x, 2000 * a));
  }
  return { keys: [] };
};
const short = (e) => `[${keyOf(e)}] ${e.title}\n   ${e.human.replace(/\*\*/g, '').slice(0, 260)}`;
const cands = entries.map((e, i) => entries.map((f, j) => j).filter((j) => j !== i && !(entries[j].sec === e.sec && Math.abs(entries[j].n - e.n) <= 1) && scores[i][j] >= MIN).sort((x, y) => scores[i][y] - scores[i][x]).slice(0, 8));
let nextI = 0, calls = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (nextI < entries.length) {
    const i = nextI++; const e = entries[i];
    if (!cands[i].length) continue;
    const key = keyOf(e) + ':' + cands[i].map((j) => keyOf(entries[j])).join(',');
    if (jcache[key]) continue;
    jcache[key] = await jpost(`ПУНКТ:\n${short(e)}\n\nКАНДИДАТЫ:\n${cands[i].map((j) => short(entries[j])).join('\n')}`); calls++;
    if (calls % 50 === 0) { writeFileSync(JC, JSON.stringify(jcache)); console.error(`  судья ${calls}`); }
  }
}));
writeFileSync(JC, JSON.stringify(jcache));
const related = {}, audit = {};
entries.forEach((e, i) => {
  const key = keyOf(e) + ':' + cands[i].map((j) => keyOf(entries[j])).join(',');
  const allowed = new Set(cands[i].map((j) => keyOf(entries[j])));
  const pick = ((jcache[key] || {}).keys || []).filter((k) => allowed.has(k)).slice(0, PER);
  if (pick.length) { related[keyOf(e)] = pick; audit[keyOf(e)] = pick.map((k) => [k, Math.round(scores[i][entries.findIndex((x) => keyOf(x) === k)] * 1000) / 1000, (jcache[key] || {}).why || '']); }
});
writeFileSync('ru/related.json', JSON.stringify(related));
writeFileSync('ru-work/related-scores.json', JSON.stringify(audit));

const allTop = entries.map((e, i) => Math.max(...scores[i]));
const covered = Object.keys(related).length;
const hist = [0.3, 0.4, 0.5, 0.6, 0.7].map((t) => `≥${t}: ${allTop.filter((x) => x >= t).length}`).join(', ');
console.error(`записей ${entries.length}; со ссылками «Смотрите также» ${covered}; ссылок всего ${Object.values(related).flat().length}; лучшая близость по записям: ${hist}`);
if (SAMPLE) {
  const ix = Array.from({ length: SAMPLE }, (_, k) => Math.floor((k + 0.5) * entries.length / SAMPLE));
  for (const i of ix) { const e = entries[i]; console.log(`\n[${keyOf(e)}] ${e.title.slice(0, 80)}`); for (const [k, s] of audit[keyOf(e)] || []) { const f = entries.find((x) => keyOf(x) === k); console.log(`   ${s}  [${k}] ${f.title.slice(0, 80)}`); } }
}
