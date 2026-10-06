// Пометка каждого пункта: китайские нормы (c), смешанно (m) или не зависит от страны (u), плюс одна фраза «почему».
// Источник: ru-work/research/classification.json (классификатор tools/ru/classify.mjs). Результат ru/scope.json лежит в репозитории,
// потому что сайт и страницы строятся из него. Запускать после classify.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
const cls = JSON.parse(readFileSync('ru-work/research/classification.json', 'utf8'));
const T = { universal: 'u', china: 'c', mixed: 'm' };
const out = {};
for (const c of cls) {
  const t = T[c.type]; if (!t) continue;
  const key = `${Number(c.sec)}-${c.n}`;
  let why = String(c.why || '').replace(/\s+/g, ' ').trim();
  if (why.length > 260) why = why.slice(0, 257).replace(/\s+\S*$/, '') + '…';
  out[key] = t === 'u' ? { t } : { t, why };
}
writeFileSync('ru/scope.json', JSON.stringify(out));
const n = Object.values(out).reduce((m, x) => (m[x.t] = (m[x.t] || 0) + 1, m), {});
console.error(`ru/scope.json: ${Object.keys(out).length} пунктов, ${JSON.stringify(n)}`);
