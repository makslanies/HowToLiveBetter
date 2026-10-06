// Накладывает ручные правки из ru-work/overlay/<файл>.json на ru/book/<файл>.md после (пере)перевода.
// Формат: [{"entry": N, "lines": ["- В России: ...", ...]}]. Строки вставляются в конец записи N
// (после «Примечаний»), повторный запуск ничего не дублирует. Использование:
//   node tools/ru/apply-overlay.mjs            (все слои)
//   node tools/ru/apply-overlay.mjs <имя.md>   (один)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const only = process.argv[2];
const names = readdirSync('ru-work/overlay').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '.md')).filter((f) => !only || f === only);
for (const name of names) {
  const path = `ru/book/${name}`;
  if (!existsSync(path)) { console.error(`нет ${path}`); continue; }
  const items = JSON.parse(readFileSync(`ru-work/overlay/${name.replace(/\.md$/, '.json')}`, 'utf8'));
  // строки цен приходят только из слоя правок: стираем все прежние и накладываем актуальные (отсеянные позиции не остаются)
  const parts = readFileSync(path, 'utf8').replace(/^- (?:Цена в России|Источники цен \(Россия\))[^\n]*\n/gm, '').split(/^(?=### )/m);
  let added = 0, skipped = 0;
  for (const { entry, lines, kind } of items) {
    const i = parts.findIndex((p) => p.startsWith(`### ${entry}. `));
    if (i < 0) { console.error(`  ${name}: записи ${entry} нет`); continue; }
    if (kind === 'price') parts[i] = parts[i].replace(/^- Цена в России[^\n]*\n/gm, '');
    if (kind === 'russia') parts[i] = parts[i].replace(/^- (?:(?:Простыми словами|Затраты|Выгода|Примечания) \(Россия\)|Источники \(Россия\)):[^\n]*\n/gm, '');   // новый черновик российских полей заменяет прежний из слоя   // обновлённые цены заменяют старую строку, а не дописываются второй
    // Supplements belong to the entry, not to a section footer such as «Лицензия».
    const footer = parts[i].search(/^## /m);
    if (footer >= 0) {
      const before = parts[i].slice(0, footer);
      const tail = parts[i].slice(footer).split('\n');
      const isSupplement = (l) => /^- (?:Цена в России|Источники цен \(Россия\)|В России:|Источники \(Россия\)|(?:Простыми словами|Затраты|Выгода|Примечания) \(Россия\)|Примечание к «В России»)/.test(l);
      const misplaced = tail.filter(isSupplement);
      if (misplaced.length) parts[i] = before.trimEnd() + '\n' + misplaced.join('\n') + '\n\n' + tail.filter((l) => !isSupplement(l)).join('\n').trimEnd() + '\n';
    }
    const fresh = lines.filter((l) => !parts[i].includes(l));
    if (!fresh.length) { skipped++; continue; }
    const boundary = parts[i].search(/^## /m);
    parts[i] = boundary >= 0
      ? parts[i].slice(0, boundary).trimEnd() + '\n' + fresh.join('\n') + '\n\n' + parts[i].slice(boundary)
      : parts[i].replace(/\n*$/, '\n') + fresh.join('\n') + '\n\n';
    added += fresh.length;
  }
  writeFileSync(path, parts.join('').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n'));
  console.error(`${name}: добавлено строк ${added}, записей без изменений ${skipped}`);
}
