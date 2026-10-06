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
  const parts = readFileSync(path, 'utf8').split(/^(?=### )/m);
  let added = 0, skipped = 0;
  for (const { entry, lines } of items) {
    const i = parts.findIndex((p) => p.startsWith(`### ${entry}. `));
    if (i < 0) { console.error(`  ${name}: записи ${entry} нет`); continue; }
    const fresh = lines.filter((l) => !parts[i].includes(l));
    if (!fresh.length) { skipped++; continue; }
    parts[i] = parts[i].replace(/\n*$/, '\n') + fresh.join('\n') + '\n\n';
    added += fresh.length;
  }
  writeFileSync(path, parts.join('').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n'));
  console.error(`${name}: добавлено строк ${added}, записей без изменений ${skipped}`);
}
