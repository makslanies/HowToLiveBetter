// Дописывает в ru/scope.json статус российского аналога для пунктов без российского слоя:
//   a: 'none'     — пункт описывает порядок, который есть только в Китае (по оценке ИИ-классификатора; поиск не проводился)
//   a: 'searched' — искали по официальным российским сайтам, подходящего текста не нашли (ad — дата сбора пакета)
//   без a         — российские правила пока не проверены
// Запускать после scope.mjs (он пересобирает scope.json с нуля) и после сбора пакетов: node tools/ru/analog.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseBook, keyOf } from './parse.mjs';

const scope = JSON.parse(readFileSync('ru/scope.json', 'utf8'));
const plans = existsSync('ru-work/evidence/plans.json') ? JSON.parse(readFileSync('ru-work/evidence/plans.json', 'utf8')) : {};
const state = existsSync('ru-work/evidence/state.json') ? JSON.parse(readFileSync('ru-work/evidence/state.json', 'utf8')) : {};
// пометка ИИ «аналога нет» проверена вручную 2026-10-08: у этих четырёх российский аналог мог бы быть (подарки, спасатель-доброволец, данные умершего, трансляции), поэтому пока «не проверено»
const NOT_NONE = new Set(['8-24', '13-39', '25-10', '26-8']);
const ruDate = (iso) => iso.slice(0, 10).split('-').reverse().join('.');
const cnt = { none: 0, searched: 0, unchecked: 0, withRu: 0, universal: 0 };
const noneList = [];
for (const e of parseBook().flatMap((s) => s.entries)) {
  const k = keyOf(e), sc = scope[k];
  if (!sc) continue;
  delete sc.a; delete sc.ad;
  if (sc.t === 'r') continue;                       // самостоятельные российские карточки (раздел 35) метки аналога не получают
  if (e.ru) { cnt.withRu++; continue; }
  if (sc.t === 'u') { cnt.universal++; continue; }
  if (plans[k] && plans[k].skip && !NOT_NONE.has(k)) { sc.a = 'none'; cnt.none++; noneList.push(`${k} ${e.title.slice(0, 90)} | ${sc.why || ''}`); continue; }
  if (state[k] && state[k].pages && state[k].pages.length) { sc.a = 'searched'; sc.ad = ruDate(state[k].at); cnt.searched++; continue; }
  cnt.unchecked++;
}
writeFileSync('ru/scope.json', JSON.stringify(scope));
console.error(JSON.stringify(cnt));
if (process.argv.includes('--list')) console.error('\nаналога нет:\n' + noneList.join('\n'));
