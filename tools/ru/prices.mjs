// Российские цены рядом с китайскими. Четыре шага:
//   scan      выделить в «Затратах» цены на товары и услуги (штрафы, пособия и суммы по закону пропускаются)  → ru-work/prices/items.json
//   research  найти российские цены через веб-поиск OpenAI (по одному запросу на товар)                       → ru-work/prices/results.json
//   verify    открыть страницы-источники и проверить, что цена там есть; нужно минимум 2 подтверждённых      → ru-work/prices/verified.json
//   publish   записать подтверждённые цены в слой правок ru-work/overlay (строка «- Цена в России (…)»)
//   node tools/ru/prices.mjs scan | research [--limit 20] | verify | review | publish
//   review --file <JSON>: ручная рецензия [{what, unit, ok, reason}]
//   import-manual --file <JSON>: результаты ручной проверки страниц, без API
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

if (cmd === 'import-manual') {
  const ver = load('verified.json', {});
  const decisions = JSON.parse(readFileSync(opt('file', ''), 'utf8'));
  for (const d of decisions) {
    if (!ver[d.key] || !['accepted', 'rejected'].includes(d.status) || !d.reason) throw new Error(`Некорректное ручное решение: ${d.key}`);
    if (d.status !== 'accepted') continue;
    const good = d.good || [];
    if (new Set(good.map((g) => new URL(g.url).hostname.replace(/^www\./, ''))).size < 2 || good.some((g) => !/^https?:/.test(g.url) || !g.quote || !Number.isFinite(g.price_rub) || g.price_rub <= 0)) throw new Error(`Нужны две независимые страницы с ценой: ${d.key}`);
    if (!(d.min_rub > 0 && d.max_rub >= d.min_rub) || !d.unit || !/^\d{4}-\d{2}-\d{2}$/.test(d.at)) throw new Error(`Не определены цена, единица или дата: ${d.key}`);
    if (d.examples && d.examples.some((e) => !e.label || !e.unit || !Number.isFinite(e.price_rub) || !good.some((g) => g.url === e.url && g.price_rub === e.price_rub))) throw new Error(`Пример не подтверждён источником: ${d.key}`);
  }
  for (const d of decisions) {
    const old = ver[d.key];
    if (d.status === 'accepted') ver[d.key] = { ...old, ...d, unit: old.unit, display_unit: d.unit, pack: d.display_pack || d.pack, price_note: d.price_note || d.reason, ok: true, review: true, review_by: 'manual-live', review_reason: d.reason };
    else Object.assign(old, { review: false, review_by: 'manual-live', review_reason: d.reason });
  }
  save('verified.json', ver);
  console.error(`Ручная проверка: принято ${decisions.filter((d) => d.status === 'accepted').length}, отклонено ${decisions.filter((d) => d.status === 'rejected').length}`);
  process.exit(0);
}

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

// ---------- 3б. review: независимая модель отклоняет сомнительные цены ----------
if (cmd === 'review') {
  const ver = load('verified.json', {}); const items = load('items.json', {});
  const reviewFile = opt('file', '');
  if (reviewFile) {
    const decisions = JSON.parse(readFileSync(reviewFile, 'utf8'));
    for (const d of decisions) {
      const k = normKey(d.what) + '|' + normKey(d.unit || '');
      if (!ver[k] || typeof d.ok !== 'boolean' || !d.reason) throw new Error(`Некорректная рецензия: ${k}`);
    }
    for (const d of decisions) {
      const v = ver[normKey(d.what) + '|' + normKey(d.unit || '')];
      v.review = d.ok; v.review_reason = d.reason; v.review_by = 'manual';
      v.price_only = d.price_only === true;
      if (d.display_pack) v.pack = d.display_pack;
    }
    save('verified.json', ver);
    console.error(`Сохранено ручных решений: ${decisions.length}`);
    process.exit(0);
  }
  const cn = {}; for (const v of Object.values(items)) for (const i of v.items) cn[normKey(i.what) + '|' + normKey(i.unit || '')] = i.cn_price;
  const SYSTEM = 'Ты проверяющий. Дана позиция: что за товар или услуга, за какую единицу, как цена названа в китайском тексте книги, какой диапазон в рублях нашёл поиск, сколько упаковок взято на период, и цитаты из магазинов. Реши, можно ли показать читателю такую строку цены. Отклони (ok=false), если: в диапазон явно попали разные товары, дозировки или классы (например, обычный товар и премиальный набор); единица цены неясна или не совпадает с китайским описанием; число упаковок на период взято с ошибкой; цена правдоподобна только для другой единицы (упаковка вместо курса и наоборот); магазины продают иное, чем «what». Если сомневаешься, отклоняй. Ответ JSON: {"ok":true,"reason":"одно предложение"}';
  const todo = Object.entries(ver).filter(([, v]) => v.ok && v.review === undefined);
  console.error('рецензия: ' + todo.length + ' позиций');
  await pool(todo, 4, async ([k, v]) => {
    const key = normKey(v.what) + '|' + normKey(v.unit || '');
    const d = await chat(SYSTEM, JSON.stringify({ what: v.what, unit: v.unit, китайский_текст: cn[key] || '', диапазон_руб: [v.min_rub, v.max_rub], упаковка: v.pack, упаковок_на_период: [v.packs_min, v.packs_max], цитаты: v.good.map((g) => ({ сайт: new URL(g.url).hostname, цитата: g.quote, цена: g.price_rub })) }));
    v.review = d.ok === true; v.review_reason = String(d.reason || '').slice(0, 200);
    save('verified.json', ver);
  });
  save('verified.json', ver);
  const all = Object.values(ver).filter((x) => x.ok);
  console.error('принято рецензентом: ' + all.filter((x) => x.review).length + ' из ' + all.length);
  for (const x of all.filter((x) => x.review === false)) console.error('  ⛔ ' + x.what + ' (' + x.unit + '): ' + x.review_reason);
}

// ---------- 4. publish ----------
if (cmd === 'publish') {
  const ver = load('verified.json', {});
  const files = Object.fromEntries(readdirSync('ru/book').filter((f) => /^\d\d-/.test(f)).map((f) => [String(Number(f.slice(0, 2))), f.replace(/\.md$/, '')]));
  const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
  const clean = (t, max) => {
    let x = String(t || '').replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    x = x.split(/;\s*(?:цены|цена|в sources|sources)/i)[0].replace(/\bsources?\b/gi, '').replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
    if (x.length > max) x = x.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
    return /^[А-ЯЁ][а-яё]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x;   // «Упаковка» → «упаковка», сокращения не трогаем
  };
  const byEntry = {};
  for (const v of Object.values(ver).filter((x) => x.ok && x.review === true && Number.isFinite(x.min_rub) && Number.isFinite(x.max_rub) && x.min_rub > 0 && x.max_rub >= x.min_rub && x.max_rub / x.min_rub <= 15 && (x.examples?.length || !isPeriodic(x.display_unit || x.unit) || (x.price_only && x.pack) || (x.pack && x.packs_min > 0 && x.packs_max >= x.packs_min)))) for (const k of v.entries) (byEntry[k] ||= []).push(v);
  mkdirSync('ru-work/overlay', { recursive: true });
  const perFile = {};
  for (const [key, list] of Object.entries(byEntry)) {
    const [sec, n] = key.split('-'); const f = files[sec]; if (!f) continue;
    const date = list[0].at.split('-').reverse().join('.');
    const range = (a, b) => (a === b ? fmt(a) : `от ${fmt(a)} до ${fmt(b)}`);
    const unique = [...new Map(list.map((v) => [JSON.stringify([v.what, v.display_unit || v.unit, v.pack, v.min_rub, v.max_rub, v.examples]), v])).values()];
    const parts = unique.map((v) => {
      const unit = v.display_unit || v.unit;
      if (v.examples?.length) return `${v.what}: примеры предложений — ${v.examples.map((e) => `${e.label}: ${e.from ? 'от ' : ''}${fmt(e.price_rub)} ₽ ${e.unit}`).join('; ')}${v.price_note ? '. ' + v.price_note.replace(/[.\s]+$/, '') : ''}`;
      if (v.price_only && v.pack) return `${v.what}: ${clean(v.pack, Infinity)} стоит ${range(v.min_rub, v.max_rub)} ₽${v.price_note ? '. ' + v.price_note.replace(/[.\s]+$/, '') : '. Указана цена упаковки, а не расход за месяц, год или полный курс'}`;
      if (v.pack && v.packs_min > 0 && v.packs_max >= v.packs_min) {
        const packTxt = clean(v.pack, Infinity); const packOk = Boolean(packTxt);
        const per = unit.replace(/^за /, 'на ');
        const n = v.packs_min === v.packs_max ? v.packs_min : `${v.packs_min}–${v.packs_max}`;
        return `${v.what}: ${packOk ? packTxt : 'одна упаковка'} стоит ${range(v.min_rub, v.max_rub)} ₽; ${per} расход — около ${n} уп., то есть примерно ${range(v.packs_min * v.min_rub, v.packs_max * v.max_rub)} ₽${v.calc ? ' (расчёт: ' + clean(v.calc, Infinity) + ')' : ''}`;
      }
      return `${v.what}${unit ? ' (' + unit + ')' : ''}: ${range(v.min_rub, v.max_rub)} ₽${v.price_note ? '. ' + v.price_note.replace(/[.\s]+$/, '') : ''}`;
    });
    const sources = [...new Map(unique.flatMap((v) => v.good.map((g) => {
      const host = new URL(g.url).hostname.replace(/^www\./, '');
      const label = `${host} — ${v.what.replace(/[\[\]]/g, '')}: ${fmt(g.price_rub)} ₽`;
      return [`${g.url}|${v.what}`, `[${label}](${g.url}) (проверено ${v.at.split('-').reverse().join('.')})`];
    }))).values()];
    const line = `- Цена в России (ориентир на ${date}): ${parts.join('; ')}. Цены в российских магазинах и клиниках меняются и зависят от региона.`;
    (perFile[f] ||= []).push({ entry: Number(n), kind: 'price', lines: [line, `- Источники цен (Россия): ${sources.join(' ; Цены в России: ')}`] });
  }
  // Удаляем отклонённые цены и из разделов, где больше нет принятых позиций.
  for (const f of new Set([...Object.keys(perFile), ...readdirSync('ru-work/overlay').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))])) {
    const items = perFile[f] || [];
    const path = `ru-work/overlay/${f}.json`;
    const ov = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    const rest2 = ov.filter((x) => x.kind !== 'price');
    writeFileSync(path, JSON.stringify([...rest2, ...items], null, 2) + '\n');
  }
  console.error(`записано строк «Цена в России»: ${Object.values(perFile).flat().length} в ${Object.keys(perFile).length} разделах; дальше: node tools/ru/apply-overlay.mjs`);
}
