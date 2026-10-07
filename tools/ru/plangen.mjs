// Составляет планы запросов для evidence.mjs автоматически: Antigravity (agy) по заголовку пункта и пометке «почему» придумывает два коротких запроса
// и подбирает официальные сайты. Результат дописывается в ru-work/evidence/plans.json; готовые планы не трогаются.
//   node tools/ru/plangen.mjs [--batch 20] [--max-batches 30] [--only 1,2,13]   (номера разделов)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseBook, keyOf } from './parse.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BATCH = Number(opt('batch', '20')), MAXB = Number(opt('max-batches', '30'));
const ONLY = (opt('only', '') || '').split(',').filter(Boolean).map(Number);
const MODEL = opt('model', 'gemini-3.8-flash-high');
const SITES = ['pravo.gov.ru', 'government.ru', 'minzdrav.gov.ru', 'rospotrebnadzor.ru', 'mchs.gov.ru', 'mvd.ru', 'rosstat.gov.ru', 'nalog.gov.ru', 'sfr.gov.ru', 'rostrud.gov.ru', 'minfin.gov.ru', 'cbr.ru', 'vsrf.ru', 'genproc.gov.ru', 'gosuslugi.ru', 'trudvsem.ru', 'mintrud.gov.ru', 'fas.gov.ru', 'rkn.gov.ru', 'minjust.gov.ru', 'fssp.gov.ru', 'sledcom.ru', 'rpn.gov.ru', 'roszdravnadzor.gov.ru', 'mid.ru', 'who.int'];
const PLANS = 'ru-work/evidence/plans.json';
const plans = existsSync(PLANS) ? JSON.parse(readFileSync(PLANS, 'utf8')) : {};
const scope = JSON.parse(readFileSync('ru/scope.json', 'utf8'));

const todo = parseBook().flatMap((s) => s.entries.map((e) => ({ s, e, k: keyOf(e) })))
  .filter(({ s, e, k }) => !plans[k] && !e.ru && scope[k] && scope[k].t !== 'u' && (!ONLY.length || ONLY.includes(Number(s.n))));
console.error(`пунктов без плана: ${todo.length}`);

const PROMPT = `Для каждого пункта книги (российская версия) составь два коротких поисковых запроса на русском, чтобы найти российские официальные правила, нормы или рекомендации по этой теме (закон, приказ, клинические рекомендации, памятка ведомства). Запросы короткие, 3–8 слов, без названий сайтов и без слова «Россия». И выбери 1–2 сайта из списка, где такая информация вероятнее всего есть.
Список сайтов: ${SITES.join(', ')}.
Если пункт целиком о китайских реалиях и российского аналога нет, верни пустые запросы: "q":[].
Верни только JSON без пояснений вида {"13-2":{"q":["запрос 1","запрос 2"],"d":["minzdrav.gov.ru"]}}. Инструменты не используй.

Пункты:
`;
let batches = 0;
for (let i = 0; i < todo.length && batches < MAXB; i += BATCH, batches++) {
  const chunk = todo.slice(i, i + BATCH);
  const list = chunk.map(({ e, k }) => `${k}: ${e.title}${scope[k].why ? ' (' + scope[k].why.slice(0, 160) + ')' : ''}`).join('\n');
  let text = '';
  try { text = execFileSync('agy', ['-p', PROMPT + list, '--model', MODEL, '--print-timeout', '170s'], { cwd: '/tmp', encoding: 'utf8', timeout: 220000, maxBuffer: 1 << 24 }); } catch (err) { console.error(`пакет ${batches + 1}: ${err.message.slice(0, 80)}`); continue; }
  const m = text.match(/\{[\s\S]*\}/);
  let got = {};
  try { got = JSON.parse(m[0]); } catch { console.error(`пакет ${batches + 1}: JSON не разобран`); continue; }
  let added = 0;
  for (const { k } of chunk) {
    const p = got[k];
    if (!p || !Array.isArray(p.q) || !p.q.length) { plans[k] = { q: [], d: [], skip: true }; continue; }
    plans[k] = { q: p.q.slice(0, 2).map(String), d: (p.d || []).filter((d) => SITES.includes(d)).slice(0, 2) };
    added++;
  }
  writeFileSync(PLANS, JSON.stringify(plans, null, 1));
  console.error(`пакет ${batches + 1}: планов ${added} из ${chunk.length}`);
}
