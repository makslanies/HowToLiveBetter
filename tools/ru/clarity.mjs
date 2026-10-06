// Проверка ясности русского текста: модель читает пункт глазами взрослого читателя без подготовки и ищет места,
// которые непонятны без контекста, звучат как буквальный перевод или грамматически неверны («1–2 юаней»).
// Правки точечные: «найти точную строку, заменить». Факты добавлять нельзя, только из самого пункта.
//   node tools/ru/clarity.mjs --only 01 [--model gpt-5.5] [--apply]
// Без --apply файлы не трогает, пишет отчёт ru-work/clarity/<раздел>.md и решения в decisions-<раздел>.json.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
const MODEL = opt('model', 'gpt-6.1-sol');
const APPLY = args.includes('--apply');
if (!ONLY.length) { console.error('укажи разделы: --only 01 или --only 01,02'); process.exit(2); }
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SYSTEM = `Ты редактор русского текста. Книга-руководство по жизни переведена с китайского. Читай каждый пункт как взрослый читатель без подготовки: он живёт в России, видит только одну карточку, не знает китайского и не открывает другие пункты. Сообщай ТОЛЬКО о том, на чём такой читатель реально споткнётся.
Что искать (по важности):
1. «контекст»: а) заголовок не называет тему или цель, хотя текст пункта её называет. Пример: «Пользуйтесь презервативом в течение всего полового акта и не пользуйтесь общими иглами» не говорит, от чего это защищает, а пункт про ВИЧ; лучше «…, чтобы не заразиться ВИЧ». Заголовок должен быть понятен сам по себе. б) «по всей стране», «в стране», «государство», «у нас» без названия страны: читатель решит, что речь о России, а данные про Китай; называй Китай (КНР). в) «список», «выше», «ниже», «в предыдущем пункте» без указания, о чём речь; г) название организации, закона или места без объяснения, если без него фраза непонятна.
2. «двусмысленность»: фраза допускает два прочтения с разным смыслом (например, «менять трубы» вместо «менять соединительные шланги»), или противоречит сама себе.
3. «грамматика»: неверные числительные и падежи («1–2 юаней» → «1–2 юаня»), согласование, несогласованные формы.
4. «калька»: фраза читается как буквальный перевод и мешает понять смысл. Не придирайся к порядку слов и стилю, если смысл ясен.
5. «термин»: иероглифы в прозе вне скобок, непереведённый китайский термин, без которого не понять.
НЕ ТРОГАЙ: сокращения HR, RR, OR, CI, RCT, BMI, ACM и их расшифровку (для них есть глоссарий с подсказками при наведении); запись десятичных чисел (точка допустима); «доверительный интервал»; порядок слов, который просто не самый красивый; названия рекомендаций, журналов, институтов.
Не больше 5 замечаний на пункт. Если читатель не споткнётся, верни пустой список.
Правила правок:
- Меняй как можно меньше. Смысл, числа, единицы, оговорки (не обязательно, как правило, спорно) и категоричность не менять. Не добавляй фактов, которых нет в китайском или русском тексте пункта: пояснение в заголовке бери из текста самого пункта.
- Заголовок можно только пояснить: слова заголовка сохраняй (можно добавить слова), смысловые слова не выкидывай.
- Поле «Источники» и строки, начинающиеся с «<!--», не трогай.
- find должен быть ТОЧНОЙ подстрокой русского текста пункта (скопируй символ в символ, 10–300 знаков) и встречаться в нём ровно один раз.
Ответ JSON: {"issues":[{"type":"контекст|двусмысленность|грамматика|калька|термин","severity":"высокая|низкая","problem":"одно предложение","find":"…","replace":"…"}]}`;

const strip = (s) => s.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (来源|Источники)/.test(l)).join('\n');
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

mkdirSync('ru-work/clarity', { recursive: true });
const labels = (t) => (t.match(/^- [^:\n]{2,60}:/gm) || []).join('|');
const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort().join(',');
const words = (s) => (s.toLowerCase().match(/[а-яё]{4,}/g) || []).map((w) => w.slice(0, 5));
const files = readdirSync('ru/book').filter((f) => /^\d\d-/.test(f) && ONLY.includes(f.slice(0, 2)));
let tin = 0, tout = 0, applied = 0, refused = 0, total = 0;
for (const f of files) {
  const sec = f.slice(0, 2);
  const cnFile = readdirSync('book').find((x) => x.startsWith(sec + '-'));
  const cn = entriesOf(readFileSync(`book/${cnFile}`, 'utf8'));
  const ruText = readFileSync(`ru/book/${f}`, 'utf8');
  const ru = entriesOf(ruText);
  const res = [];
  let next = 0; const ids = [...ru.keys()];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < ids.length) {
      const n = ids[next++];
      try { const { d, u } = await judge(cn.get(n) || '', ru.get(n)); tin += u.prompt_tokens || 0; tout += u.completion_tokens || 0; res.push({ n, issues: (d.issues || []).filter((x) => x.find && x.replace && x.find !== x.replace) }); }
      catch (e) { res.push({ n, issues: [], error: e.message }); }
    }
  }));
  res.sort((a, b) => a.n - b.n);
  // применение: проверки как в triage
  let text = ruText;
  if (APPLY && !existsSync('ru-work/book.before-clarity')) cpSync('ru/book', 'ru-work/book.before-clarity', { recursive: true });   // одна общая копия до правок
  const lines = [`# Ясность текста, раздел ${sec} (${MODEL})\n`];
  for (const { n, issues } of res) for (const x of issues) {
    total++;
    const entry = ru.get(n);
    const unique = entry.split(x.find).length - 1 === 1;
    const okNums = nums(x.find) === nums(x.replace);
    const isTitle = entry.split('\n')[0].includes(x.find);
    const keep = isTitle ? words(x.find).filter((w) => words(x.replace).includes(w)).length / Math.max(1, words(x.find).length) >= 0.8 : true;
    const safe = unique && okNums && keep && !/https?:|\[\[/.test(x.replace) && x.replace.length < x.find.length * 2.5 + 80;
    // автоматически только безопасные виды и без новых названий/сокращений, которых нет в пункте (русском и китайском)
    const known = (entry + (cn.get(n) || '')).toLowerCase();
    const newNames = ((x.replace.match(/[A-Za-z][A-Za-z0-9-]{2,}|[А-ЯЁ]{3,}/g) || []).filter((t) => !known.includes(t.toLowerCase())));
    const autoOk = ['контекст', 'грамматика', 'термин'].includes(x.type) && newNames.length === 0;
    x.applied = false; x.manual = safe && !autoOk;
    if (APPLY && safe && autoOk && text.split(x.find).length - 1 === 1) {
      const t2 = text.replace(x.find, () => x.replace);
      if (labels(t2) === labels(text)) { text = t2; x.applied = true; applied++; } else x.manual = true;   // подпись поля — ключ для разбора, трогать нельзя
    }
    else if (!safe) refused++;
    lines.push(`- **${sec}-${n} · ${x.type} · ${x.severity}** ${x.applied ? '✅ применено' : safe ? (autoOk ? '⏳ предложено' : '✋ вручную' + (newNames.length ? ' (новые слова: ' + newNames.join(', ') + ')' : '')) : '⛔ не прошла проверку'}\n  - ${x.problem}\n  - было: ${x.find}\n  - стало: ${x.replace}`);
  }
  if (APPLY && text !== ruText) writeFileSync(`ru/book/${f}`, text);
  writeFileSync(`ru-work/clarity/${sec}.md`, lines.join('\n') + '\n');
  writeFileSync(`ru-work/clarity/decisions-${sec}.json`, JSON.stringify(res, null, 1));
  console.error(`раздел ${sec}: пунктов ${ids.length}, замечаний ${res.reduce((a, r) => a + r.issues.length, 0)}`);
}
console.error(`итого замечаний ${total}${APPLY ? `, применено ${applied}` : ''}, не прошло проверку ${refused}; токены ${tin}/${tout}`);
