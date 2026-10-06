// Российские цены рядом с китайскими. Четыре шага:
//   scan      выделить в «Затратах» цены на товары и услуги (штрафы, пособия и суммы по закону пропускаются)  → ru-work/prices/items.json
//   research  найти российские цены через веб-поиск OpenAI (по одному запросу на товар)                       → ru-work/prices/results.json
//   verify    открыть страницы-источники и проверить, что цена там есть; нужно минимум 2 подтверждённых      → ru-work/prices/verified.json
//   publish   записать подтверждённые цены в слой правок ru-work/overlay (строка «- Цена в России (…)»)
//   node tools/ru/prices.mjs scan | research [--limit 20] | verify | publish
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { parseBook, keyOf } from './parse.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const MODEL = opt('model', 'gpt-6.1-sol');
const LIMIT = Number(opt('limit', '0'));
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
mkdirSync('ru-work/prices', { recursive: true });
const P = (f) => `ru-work/prices/${f}`;
const load = (f, d) => (existsSync(P(f)) ? JSON.parse(readFileSync(P(f), 'utf8')) : d);
const save = (f, v) => writeFileSync(P(f), JSON.stringify(v, null, 1));
const scrub = (s) => String(s).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
const normKey = (s) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();

async function chat(system, user) {
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const j = await r.json();
    if (r.ok) { try { return JSON.parse(j.choices[0].message.content); } catch { /* повтор */ } }
    else if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${scrub(j.error?.message || '')}`);
    await new Promise((s) => setTimeout(s, 2000 * a));
  }
  return {};
}
const isPeriodic = (unit) => /курс|месяц|год|день|недел|сутк/i.test(unit || '');
const pool = async (list, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const x = list[i++]; await fn(x); } })); };

// ---------- 1. scan ----------
if (cmd === 'scan') {
  const entries = parseBook().flatMap((s) => s.entries).filter((e) => /юан|¥/i.test(e.cost));
  const SYSTEM = `Из строки «Затраты» пункта книги выдели цены на ТОВАРЫ и УСЛУГИ, для которых можно найти рыночную цену в российских магазинах, клиниках и сервисах. Для каждой верни: what (название товара или услуги по-русски так, как его ищут в российских магазинах, например «шлем для мотоцикла», «автономный дымовой пожарный извещатель»), unit (за что цена: за штуку, за приём, за курс, в месяц, в год), cn_price (дословный фрагмент китайской цены, например «от 100 до 300 юаней»), kind (товар, услуга, медицина или юрист).
НЕ выделяй: штрафы, пособия, налоги, пошлины, суммы и компенсации по закону, зарплаты, государственные услуги китайского государства, цены, у которых нет российского аналога, и «сколько стоит» чего-то абстрактного. Если нечего выделить, верни пустой список. Ответ JSON: {"items":[{"what":"","unit":"","cn_price":"","kind":""}]}`;
  const out = load('items.json', {});
  await pool(entries.filter((e) => !out[keyOf(e)]), 6, async (e) => {
    const d = await chat(SYSTEM, `Пункт: ${e.title}\nЗатраты: ${e.cost}`);
    out[keyOf(e)] = { title: e.title, items: (d.items || []).filter((x) => x.what && x.cn_price) };
  });
  save('items.json', out);
  const n = Object.values(out).reduce((a, x) => a + x.items.length, 0);
  console.error(`пунктов с ценами ${entries.length}; найдено товаров и услуг ${n}; уникальных ${new Set(Object.values(out).flatMap((x) => x.items.map((i) => normKey(i.what)))).size}`);
}

// ---------- 2. research ----------
if (cmd === 'research') {
  const items = load('items.json', {}); const res = load('results.json', {});
  const todo = new Map();
  for (const [key, v] of Object.entries(items)) for (const it of v.items) { const k = normKey(it.what) + '|' + normKey(it.unit || ''); if (!res[k] && !todo.has(k)) todo.set(k, { ...it, entries: [key] }); else if (todo.has(k)) todo.get(k).entries.push(key); }
  const list = [...todo.entries()].slice(0, LIMIT || Infinity);
  console.error(`нужно найти цен: ${todo.size}, в этом запуске ${list.length}`);
  let done = 0;
  await pool(list, 4, async ([k, it]) => {
    const input = isPeriodic(it.unit) ? `Найди актуальные цены в российских интернет-магазинах и аптеках: «${it.what}». Нужна цена за период: ${it.unit}. В китайском тексте цена такая: «${it.cn_price}» (по ней понятен класс товара или услуги). Важно: в sources давай цену ОДНОЙ УПАКОВКИ (одной единицы продажи) в рублях, как она написана на странице, а не стоимость курса. Отдельно укажи: pack (что в упаковке, например «упаковка 7 пластырей»), packs_min и packs_max (сколько таких упаковок нужно на указанный период при обычной дозировке из инструкции) и calc (одна фраза, как посчитал число упаковок). Дай 3–5 разных российских сайтов со ссылкой на страницу товара и ТОЧНОЙ цитатой цены. Только российские сайты. min_rub и max_rub: диапазон цены одной упаковки. Ответ только JSON: {"item":"","unit":"","pack":"","packs_min":0,"packs_max":0,"calc":"","min_rub":0,"max_rub":0,"note":"","sources":[{"url":"","quote":"","price_rub":0}]}` :
      `Найди актуальные цены в российских интернет-магазинах, клиниках или сервисах: «${it.what}», цена ${it.unit || 'за штуку'}. В китайском тексте цена такая: «${it.cn_price}» (по ней понятно, какой класс товара или услуги имеется в виду: обычный, бытовой, не премиум). Дай типичный диапазон в рублях (нижняя и верхняя цена обычного варианта, без акций и без крайностей), цену в рублях за ту же единицу, и 3–5 разных российских сайтов со ссылкой на страницу товара или прайс и ТОЧНОЙ цитатой цены, как она написана на странице. Только российские сайты и цены в рублях. Ответ только JSON: {"item":"","unit":"","min_rub":0,"max_rub":0,"note":"","sources":[{"url":"","quote":"","price_rub":0}]}`;
    for (let a = 1; a <= 3; a++) {
      try {
        const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, tools: [{ type: 'web_search' }], input }), signal: AbortSignal.timeout(240000) });
        const j = await r.json();
        if (!r.ok) throw new Error(scrub(j.error?.message || r.status));
        const txt = (j.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []).map((c) => c.text || '').join('');
        const m = /\{[\s\S]*\}/.exec(txt); if (!m) throw new Error('нет JSON в ответе');
        res[k] = { ...it, answer: JSON.parse(m[0]), at: new Date().toISOString().slice(0, 10) };
        break;
      } catch (e) { if (a === 3) res[k] = { ...it, error: String(e.message).slice(0, 120) }; else await new Promise((s) => setTimeout(s, 3000 * a)); }
    }
    save('results.json', res); done++; if (done % 10 === 0) console.error(`  ${done}/${list.length}`);
  });
  save('results.json', res);
  console.error(`готово: найдено ${Object.values(res).filter((x) => x.answer).length}, с ошибкой ${Object.values(res).filter((x) => x.error).length}`);
}

// ---------- 3. verify ----------
const pageText = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let t = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;|&#160;|&thinsp;|&#8239;/g, ' ').replace(/&#8381;|&#x20bd;/gi, '₽').replace(/ | | /g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  return t.replace(/(\d) (?=\d{3}(?!\d))/g, '$1');         // «1 290» → «1290»
};
const priceOnPage = (text, price) => {
  const s = String(price); const [i, f] = s.split('.');
  const re = new RegExp(`(?<![\\d.,])${i}${f ? `[.,]${f}` : '(?:[.,]0{1,2})?'}(?![\\d])`);
  return re.test(text);
};
if (cmd === 'verify') {
  const res = load('results.json', {}); const ver = load('verified.json', {});
  const todo = Object.entries(res).filter(([k, v]) => v.answer && !ver[k]);
  console.error(`проверяю ${todo.length} позиций`);
  await pool(todo, 4, async ([k, v]) => {
    if (isPeriodic(v.unit) && !v.answer.pack) { ver[k] = { what: v.what, unit: v.unit, entries: v.entries, ok: false, good: [], bad: [{ why: 'цена за период без указания упаковки, нужен пересчёт' }], at: v.at }; save('verified.json', ver); return; }
    const good = [], bad = [];
    for (const s of (v.answer.sources || []).slice(0, 5)) {
      try {
        if (!/^https?:\/\/[^/]+\.(ru|рф|su)(\/|$)/i.test(s.url) && !/\.ru\b/.test(s.url)) { bad.push({ url: s.url, why: 'не российский домен' }); continue; }
        const t = await pageText(s.url);
        if (priceOnPage(t, Number(s.price_rub))) good.push({ url: s.url, price_rub: Number(s.price_rub), quote: s.quote }); else bad.push({ url: s.url, why: 'цены нет на странице' });
      } catch (e) { bad.push({ url: s.url, why: String(e.message).slice(0, 50) }); }
    }
    const prices = good.map((g) => g.price_rub).filter((x) => x > 0).sort((a, b) => a - b);
    ver[k] = { what: v.what, unit: v.unit, entries: v.entries, ok: good.length >= 2, good, bad, min_rub: prices[0], max_rub: prices[prices.length - 1], pack: v.answer.pack, packs_min: v.answer.packs_min, packs_max: v.answer.packs_max, calc: v.answer.calc, at: v.at };
    save('verified.json', ver);
  });
  const all = Object.values(ver);
  console.error(`подтверждено (≥2 источника): ${all.filter((x) => x.ok).length} из ${all.length}`);
}

// ---------- 4. publish ----------
if (cmd === 'publish') {
  const ver = load('verified.json', {});
  const files = Object.fromEntries(readdirSync('ru/book').filter((f) => /^\d\d-/.test(f)).map((f) => [String(Number(f.slice(0, 2))), f.replace(/\.md$/, '')]));
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const byEntry = {};
  for (const v of Object.values(ver).filter((x) => x.ok)) for (const k of v.entries) (byEntry[k] ||= []).push(v);
  mkdirSync('ru-work/overlay', { recursive: true });
  const perFile = {};
  for (const [key, list] of Object.entries(byEntry)) {
    const [sec, n] = key.split('-'); const f = files[sec]; if (!f) continue;
    const date = list[0].at.split('-').reverse().join('.');
    const range = (a, b) => (a === b ? fmt(a) : `от ${fmt(a)} до ${fmt(b)}`);
    const parts = list.map((v) => {
      if (v.pack && v.packs_min > 0 && v.packs_max >= v.packs_min) return `${v.what}: ${v.pack} стоит ${range(v.min_rub, v.max_rub)} ₽; на ${v.unit.replace(/^за /, '')} нужно около ${v.packs_min === v.packs_max ? v.packs_min : `${v.packs_min}–${v.packs_max}`} таких упаковок, то есть примерно ${range(Math.round(v.packs_min * v.min_rub), Math.round(v.packs_max * v.max_rub))} ₽ (расчёт${v.calc ? ': ' + v.calc.replace(/[.\s]+$/, '') : ''})`;
      return `${v.what}${v.unit ? ' (' + v.unit + ')' : ''}: ${range(v.min_rub, v.max_rub)} ₽`;
    });
    const srcs = [...new Set(list.flatMap((v) => v.good.map((g) => g.url)))].slice(0, 4);
    const line = `- Цена в России (ориентир на ${date}): ${parts.join('; ')}. Цены в российских магазинах и клиниках меняются и зависят от региона. Источники цен: ${srcs.map((u) => `<${u}>`).join('; ')}`;
    (perFile[f] ||= []).push({ entry: Number(n), kind: 'price', lines: [line] });
  }
  for (const [f, items] of Object.entries(perFile)) {
    const path = `ru-work/overlay/${f}.json`;
    const ov = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    const rest2 = ov.filter((x) => x.kind !== 'price');
    writeFileSync(path, JSON.stringify([...rest2, ...items], null, 2) + '\n');
  }
  console.error(`записано строк «Цена в России»: ${Object.values(perFile).flat().length} в ${Object.keys(perFile).length} разделах; дальше: node tools/ru/apply-overlay.mjs`);
}
