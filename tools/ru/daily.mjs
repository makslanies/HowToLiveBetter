// Суточный запуск российской сверки: берёт записи из очереди по приоритету и гоняет research.mjs,
// пока не кончится суточная квота SREZAI. Состояние в ru-work/research/queue.json, поэтому на следующий день
// скрипт продолжает с того места, где остановился.
//   node tools/ru/daily.mjs [--max 60] [--dry-run] [--retry-nodata] [--only 13]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const MAX = Number(opt('max', '60'));
const ONLY = opt('only', '');
const dry = args.includes('--dry-run');
const retryNoData = args.includes('--retry-nodata');

// где российская сверка нужнее всего: срочные ситуации, лекарства, работа, пособия, документы, медицина
const SECTION_ORDER = ['13', '34', '19', '07', '25', '24', '27', '20', '16', '29', '30', '01', '02', '12', '15', '08', '09', '05', '14', '17', '18', '21', '22', '23', '28', '03', '04', '06', '10', '11', '26', '31', '32', '33'];
const QUEUE = 'ru-work/research/queue.json';
const cls = JSON.parse(readFileSync('ru-work/research/classification.json', 'utf8'));
const state = existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : {};
const files = Object.fromEntries(readdirSync('ru/book').filter((f) => /^\d\d-/.test(f)).map((f) => [f.slice(0, 2), f]));

const todo = cls
  .filter((c) => (c.type === 'mixed' || c.type === 'china') && !c.no_analog && (!ONLY || c.sec === ONLY))
  .sort((a, b) => SECTION_ORDER.indexOf(a.sec) - SECTION_ORDER.indexOf(b.sec) || a.n - b.n)
  .filter((c) => { const s = state[`${c.sec}-${c.n}`]; return !s || s.status === 'failed' || (retryNoData && s.status === 'nodata'); });
console.error(`в очереди: ${todo.length} записей (из ${cls.filter((c) => c.type !== 'universal').length} смешанных и китайских), за запуск не больше ${MAX}`);
if (dry) { for (const c of todo.slice(0, 12)) console.error(`  ${c.sec}-${c.n} [${c.type}] ${c.title.slice(0, 70)}`); process.exit(0); }

let done = 0, stopped = false;
for (const c of todo.slice(0, MAX)) {
  const key = `${c.sec}-${c.n}`;
  const file = `ru/book/${files[c.sec]}`;
  const r = spawnSync('node', ['tools/ru/research.mjs', file, '--entry', String(c.n)], { encoding: 'utf8', timeout: 600000 });
  const out = (r.stderr || '') + (r.stdout || '');
  if (r.status === 3) { console.error(`СТОП на ${key}: ${out.trim().split('\n').pop()}`); stopped = true; break; }
  if (r.status !== 0) { state[key] = { status: 'failed', note: out.trim().split('\n').pop().slice(0, 160), at: new Date().toISOString() }; console.error(`  ${key}: ошибка`); writeFileSync(QUEUE, JSON.stringify(state, null, 1)); continue; }
  const res = readFileSync(`ru-work/research/${files[c.sec].replace(/\.md$/, '')}-${c.n}.md`, 'utf8');
  const applies = (/Применимость: \*\*([^*]+)\*\*/.exec(res) || [])[1] || '?';
  state[key] = { status: applies === 'нет данных' ? 'nodata' : 'ok', applies, differs: /РАСХОДИТСЯ/.test(res), unsupported: /без подтверждающей цитаты/.test(res), credits: Number((/Кредитов потрачено: (\d+)/.exec(out) || [])[1] || 0), at: new Date().toISOString() };
  writeFileSync(QUEUE, JSON.stringify(state, null, 1));
  done++; console.error(`  ${key} → ${applies}${state[key].differs ? ' ⚠ расходится' : ''}`);
}

// сводка
const vals = Object.entries(state);
const by = (f) => vals.filter(([, v]) => f(v)).length;
const spent = vals.reduce((n, [, v]) => n + (v.credits || 0), 0);
const lines = [`# Российская сверка: сводка`, ``, `- Обработано записей: ${vals.length}. «Да»: ${by((v) => v.applies === 'да')}, «частично»: ${by((v) => v.applies === 'частично')}, «нет»: ${by((v) => v.applies === 'нет')}, «нет данных»: ${by((v) => v.status === 'nodata')}, ошибки: ${by((v) => v.status === 'failed')}`, `- Израсходовано кредитов: ${spent} (≈ ${(spent * 0.1).toFixed(0)} ₽)`, ``, `## Российский источник расходится с записью`, ...vals.filter(([, v]) => v.differs).map(([k]) => `- ${k}`), ``, `## Числа без подтверждающей цитаты (не публиковать без проверки)`, ...vals.filter(([, v]) => v.unsupported).map(([k]) => `- ${k}`), ``, `## Ошибки`, ...vals.filter(([, v]) => v.status === 'failed').map(([k, v]) => `- ${k}: ${v.note}`)];
writeFileSync('ru-work/research/SUMMARY.md', lines.join('\n') + '\n');
console.error(`запуск закончен: обработано ${done}${stopped ? ' (остановлен квотой)' : ''}; всего в очереди осталось ${todo.length - done}`);
