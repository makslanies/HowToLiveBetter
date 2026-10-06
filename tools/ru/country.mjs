// Проход «страна названа»: в китайских и смешанных пунктах каждое утверждение о законе, ведомстве, выплате, номере службы,
// национальной статистике должно читаться как «в Китае», чтобы русский читатель не принял его за российское.
// Российские блоки («В России», «Источники (Россия)», «Примечание к «В России»») модели не показываются и не правятся.
//   node tools/ru/country.mjs --only 19 [--model gpt-6.1-sol] [--apply]
// Без --apply файлы не трогает: отчёт ru-work/country/<раздел>.md. Правка допускается, только если она ДОБАВЛЯЕТ слова про страну.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
const MODEL = opt('model', 'gpt-6.1-sol');
const APPLY = args.includes('--apply');
if (!ONLY.length) { console.error('укажи разделы: --only 19 или --only 01,02'); process.exit(2); }
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const scope = JSON.parse(readFileSync('ru/scope.json', 'utf8'));

const SYSTEM = `Ты редактор. Книга о жизни написана про Китай (КНР) и переведена на русский для читателей из России. Нужно, чтобы читатель нигде не принял китайские данные за российские.
Найди в русском тексте пункта утверждения, где страна НЕ названа, хотя речь о китайских реалиях:
- законы, кодексы, постановления, суды, ведомства и органы («государство», «министерство», «суд», «полиция», «центр контроля и профилактики заболеваний», «трудовая инспекция»);
- выплаты, пособия, льготы, налоги, штрафы, суммы в юанях по закону, сроки и ставки по закону;
- номера телефонов и служб (110, 120, 12356 и т. п.), названия программ, приложений, лицензий и документов;
- национальная статистика и опросы: «по всей стране», «в стране», «у нас», «общенациональный»;
- «в некоторых регионах», «местные власти» без указания, что это регионы Китая.
Для каждого предложи минимальную правку, которая ДОБАВЛЯЕТ указание страны: «в Китае», «в КНР», «китайский/китайская», «по китайским данным», «китайского закона». Если страна уже названа рядом (Китай, КНР, китайский, название органа с «КНР», иероглифы с названием), не трогай.
Нельзя: менять смысл, числа, оговорки; добавлять факты; менять российские данные; править поле «Источники»; убирать слова. Нельзя также добавлять «в России»: российские данные сюда не вносятся.
Не больше 8 правок на пункт, только действительно нужные. Если страна везде названа или пункт общий, верни пустой список.
find должен быть ТОЧНОЙ подстрокой русского текста (10–250 знаков, один раз в пункте). replace отличается от find только добавленными словами о стране.
Ответ JSON: {"issues":[{"problem":"одно предложение","find":"…","replace":"…"}]}`;

const strip = (s) => s.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (来源|Источники|В России|Примечание к «В России»)/.test(l)).join('\n');
const entriesOf = (t) => { const o = new Map(); for (const p of t.split(/^(?=### )/m)) { const m = p.match(/^### (\d+)\./); if (m) o.set(Number(m[1]), p); } return o; };

async function judge(cn, ru) {
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `КИТАЙСКИЙ ПУНКТ (для сверки смысла):\n${strip(cn)}\n\nРУССКИЙ ПУНКТ (его правим):\n${strip(ru)}` }] }) });
    const j = await r.json();
    if (r.ok) { try { return { d: JSON.parse(j.choices[0].message.content), u: j.usage }; } catch { /* повтор */ } }
    else if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((s) => setTimeout(s, 2000 * a));
  }
  return { d: { issues: [] }, u: {} };
}

const labels = (t) => (t.match(/^- [^:\n]{2,60}:/gm) || []).join('|');
const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort().join(',');
const toks = (s) => (s.toLowerCase().match(/[а-яёa-z0-9-]+/g) || []);
const OK_ADDED = new Set(['в', 'по', 'на', 'и', 'же', 'как', 'для', 'данным', 'данные', 'нормам', 'нормы', 'правилам', 'закону', 'закона', 'согласно', 'территории', 'кнр', 'китае', 'китая', 'китаю', 'китаем']);
// допустимы только добавленные слова про страну и служебные слова; все слова старого текста должны остаться
function addsOnlyCountry(find, rep) {
  const a = toks(find), b = toks(rep); const bag = new Map(); for (const t of b) bag.set(t, (bag.get(t) || 0) + 1);
  for (const t of a) { if (!bag.get(t)) return false; bag.set(t, bag.get(t) - 1); }
  const added = [...bag].filter(([, c]) => c > 0).map(([t]) => t);
  return added.length > 0 && added.every((t) => OK_ADDED.has(t) || t.startsWith('китай'));
}

mkdirSync('ru-work/country', { recursive: true });
const files = readdirSync('ru/book').filter((f) => /^\d\d-/.test(f) && ONLY.includes(f.slice(0, 2)));
let tin = 0, tout = 0, total = 0, applied = 0, entriesN = 0;
for (const f of files) {
  const sec = f.slice(0, 2);
  const cnFile = readdirSync('book').find((x) => x.startsWith(sec + '-'));
  const cn = entriesOf(readFileSync(`book/${cnFile}`, 'utf8'));
  const ruText = readFileSync(`ru/book/${f}`, 'utf8');
  const ru = entriesOf(ruText);
  const ids = [...ru.keys()].filter((n) => ['c', 'm'].includes((scope[`${Number(sec)}-${n}`] || {}).t));   // только китайские и смешанные
  entriesN += ids.length;
  const res = []; let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < ids.length) {
      const n = ids[next++];
      try { const { d, u } = await judge(cn.get(n) || '', ru.get(n)); tin += u.prompt_tokens || 0; tout += u.completion_tokens || 0; res.push({ n, issues: (d.issues || []).filter((x) => x.find && x.replace && x.find !== x.replace) }); }
      catch (e) { res.push({ n, issues: [], error: e.message }); }
    }
  }));
  res.sort((a, b) => a.n - b.n);
  if (APPLY && !existsSync('ru-work/book.before-country')) cpSync('ru/book', 'ru-work/book.before-country', { recursive: true });
  let text = readFileSync(`ru/book/${f}`, 'utf8');          // перечитываем: параллельные правки других проходов не затираем
  const lines = [`# Страна названа, раздел ${sec} (${MODEL})\n`];
  for (const { n, issues } of res) {
    const entry = entriesOf(text).get(n) || '';
    for (const x of issues) {
      total++;
      const safe = entry.split(x.find).length - 1 === 1 && nums(x.find) === nums(x.replace) && addsOnlyCountry(x.find, x.replace) && !/https?:|\[\[/.test(x.replace) && !/^- (В России|Источники)/.test(x.find);
      x.applied = false;
      if (APPLY && safe && text.split(x.find).length - 1 === 1) {
        const t2 = text.replace(x.find, () => x.replace);
        if (labels(t2) === labels(text)) { text = t2; x.applied = true; applied++; } else x.rejected = 'правка меняет подпись поля';   // подпись «- Затраты:» — ключ для разбора, трогать нельзя
      }
      lines.push(`- **${sec}-${n}** ${x.applied ? '✅ применено' : safe ? '⏳ предложено' : '⛔ не прошла проверку'}\n  - ${x.problem}\n  - было: ${x.find}\n  - стало: ${x.replace}`);
    }
  }
  if (APPLY) writeFileSync(`ru/book/${f}`, text);
  writeFileSync(`ru-work/country/${sec}.md`, lines.join('\n') + '\n');
  writeFileSync(`ru-work/country/decisions-${sec}.json`, JSON.stringify(res, null, 1));
  console.error(`раздел ${sec}: проверено китайских и смешанных пунктов ${ids.length}, правок ${res.reduce((a, r) => a + r.issues.length, 0)}`);
}
console.error(`итого: пунктов ${entriesN}, правок ${total}${APPLY ? `, применено ${applied}` : ''}; токены ${tin}/${tout}`);
