// Переносит черновики российской сверки из ru-work/research/ в слой правок ru-work/overlay/ и накладывает его на книгу.
//   node tools/ru/promote.mjs --auto-safe            (всё, что прошло автоматические проверки)
//   node tools/ru/promote.mjs --approve 13-1,13-2    (выбранные вручную, даже с пометками)
//   node tools/ru/promote.mjs --list                 (что готово к переносу, ничего не меняя)
// «Безопасно» = применимость «да» или «частично», российский источник не расходится с записью,
// в черновике нет чисел без цитаты, все цитаты найдены на странице. Расхождения (⚠) только вручную.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APPROVED = new Set((opt('approve', '') || '').split(',').filter(Boolean));
const AUTO = args.includes('--auto-safe');
const LIST = args.includes('--list');
const today = new Date().toISOString().slice(0, 10);

const state = JSON.parse(readFileSync('ru-work/research/queue.json', 'utf8'));
const files = Object.fromEntries(readdirSync('ru/book').filter((f) => /^\d\d-/.test(f)).map((f) => [f.slice(0, 2), f]));
const picked = [];
for (const [key, st] of Object.entries(state)) {
  const [sec, n] = key.split('-');
  const resPath = `ru-work/research/${files[sec].replace(/\.md$/, '')}-${n}.md`;
  if (!existsSync(resPath)) continue;
  const res = readFileSync(resPath, 'utf8');
  const draft = ((/## Черновик[^\n]*\n+([\s\S]*?)\n+(?:> ⚠[^\n]*\n+)?## Источники/.exec(res) || [])[1] || '').trim();
  if (!draft || draft.startsWith('(нет данных)')) continue;
  const srcs = [...res.matchAll(/^- ✅ (.*?) <([^>]+)>/gm)].map((m) => ({ title: m[1].trim(), url: m[2] }));
  const allOk = !/❌/.test(res) && srcs.length > 0;
  const safe = allOk && (st.applies === 'да' || st.applies === 'частично') && !st.differs && !st.unsupported;
  if (!(APPROVED.has(key) || (AUTO && safe))) { if (LIST && safe) console.log(`готово (безопасно): ${key}`); continue; }
  picked.push({ key, sec, n: Number(n), draft, srcs, flagged: !safe });
}
if (LIST) { console.log(`к переносу автоматически: ${picked.length}`); process.exit(0); }
if (!picked.length) { console.error('нечего переносить'); process.exit(0); }

let added = 0, skipped = 0;
const bySec = {};
for (const p of picked) (bySec[p.sec] ||= []).push(p);
for (const [sec, list] of Object.entries(bySec)) {
  const ovPath = `ru-work/overlay/${files[sec].replace(/\.md$/, '.json')}`;
  const ov = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : [];
  for (const p of list) {
    if (ov.some((x) => x.entry === p.n)) { skipped++; continue; }   // ручной слой не перезаписываем
    const srcLine = `- Источники (Россия): ${p.srcs.map((s) => `${s.title} <${s.url}>`).join('; ')}. Прочитано ${today}.`;
    const note = `- Примечание к «В России»: цитаты проверены автоматически, юридическая и медицинская проверка не проводилась.${p.flagged ? ' Российский источник отличается от китайского: сверьте с оригиналом.' : ''}`;
    ov.push({ entry: p.n, lines: [`- В России: ${p.draft.replace(/\n+/g, ' ')}`, srcLine, note] });
    added++;
  }
  writeFileSync(ovPath, JSON.stringify(ov, null, 2) + '\n');
}
console.error(`перенесено записей: ${added}, пропущено (уже есть ручной слой): ${skipped}`);
spawnSync('node', ['tools/ru/apply-overlay.mjs'], { stdio: 'inherit' });
