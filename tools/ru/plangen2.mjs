// Вторая попытка запросов для пунктов, где первый сбор не дал подходящего российского текста.
// Писатель — Codex CLI (бесплатный вход через ChatGPT). Запросы конкретнее: название закона, приказа, программы, ведомства.
// Результат: ru-work/evidence/plans2.json; потом: node tools/ru/evidence.mjs --plans ru-work/evidence/plans2.json --redo
//   node tools/ru/plangen2.mjs [--batch 15] [--sections 33,15,12]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseBook, keyOf } from './parse.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BATCH = Number(opt('batch', '15'));
const SECS = (opt('sections', '') || '').split(',').filter(Boolean).map(Number);
const OUT = 'ru-work/evidence/plans2.json';
const plans1 = JSON.parse(readFileSync('ru-work/evidence/plans.json', 'utf8'));
const plans2 = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const scope = JSON.parse(readFileSync('ru/scope.json', 'utf8'));
const todo = parseBook().flatMap((s) => s.entries.map((e) => ({ s, e, k: keyOf(e) })))
  .filter(({ s, e, k }) => !e.ru && !plans2[k] && scope[k] && scope[k].t !== 'u' && scope[k].a !== 'none' && (!SECS.length || SECS.includes(Number(s.n))));
console.error(`пунктов к повторной попытке: ${todo.length}`);

const PROMPT = `Для каждого пункта русской версии книги составь ДВА новых поисковых запроса, чтобы найти российский официальный текст по теме: закон, постановление, приказ, клинические рекомендации, программу ведомства, разъяснение. Первая попытка поиска не нашла подходящего текста, поэтому запросы должны быть конкретнее и иначе сформулированы.
Правила: запросы 4–9 слов; называй конкретное: тип документа и тему («Федеральный закон о социальной защите инвалидов индивидуальная программа реабилитации»), ведомство или программу, юридический термин, как его пишут в российских документах. Не используй слова «Китай», «в России». Выбери 1–3 сайта из списка, где такой текст вероятнее всего есть.
Список сайтов: pravo.gov.ru, government.ru, minzdrav.gov.ru, rospotrebnadzor.ru, mchs.gov.ru, mvd.ru, rosstat.gov.ru, nalog.gov.ru, sfr.gov.ru, rostrud.gov.ru, minfin.gov.ru, cbr.ru, vsrf.ru, genproc.gov.ru, gosuslugi.ru, trudvsem.ru, mintrud.gov.ru, fas.gov.ru, rkn.gov.ru, minjust.gov.ru, fssp.gov.ru, sledcom.ru, minobrnauki.gov.ru, edu.gov.ru, mid.ru, who.int, consultant.ru.
Верни только JSON: {"33-1":{"q":["запрос 1","запрос 2"],"d":["sfr.gov.ru"]}}. Команды и файлы не используй.

Пункты (ключ: заголовок; прежний запрос):
`;
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const list = chunk.map(({ e, k }) => `${k}: ${e.title.slice(0, 170)}; прежний запрос: ${(plans1[k]?.q || [])[0] || '—'}`).join('\n');
  const o = `/tmp/plangen2-${i}.txt`;
  try { execFileSync('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', '-C', '/tmp', '-o', o, (PROMPT + list).replace(/\u0000/g, '')], { encoding: 'utf8', timeout: 400000, stdio: ['ignore', 'ignore', 'ignore'] }); } catch (err) { console.error(`пакет ${i / BATCH + 1}: ${String(err.message).slice(0, 80)}`); continue; }
  const m = readFileSync(o, 'utf8').match(/\{[\s\S]*\}/);
  let got = {}; try { got = JSON.parse(m[0]); } catch { console.error(`пакет ${i / BATCH + 1}: JSON не разобран`); continue; }
  let n = 0;
  for (const { k } of chunk) { const p = got[k]; if (p && Array.isArray(p.q) && p.q.length) { plans2[k] = { q: p.q.slice(0, 2).map(String), d: (p.d || []).slice(0, 3) }; n++; } }
  writeFileSync(OUT, JSON.stringify(plans2, null, 1));
  console.error(`пакет ${i / BATCH + 1}: планов ${n} из ${chunk.length}`);
}
