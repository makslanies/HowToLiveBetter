// Самостоятельные российские карточки (раздел 35). Данные пишутся в ru-work/cards/cards.json, этот скрипт их проверяет и собирает ru/book/35-rossiyskie-spravki.md.
// Проверка без модели: адрес официальный; каждая цитата дословно стоит на странице (после нормализации пробелов, кавычек, тире, переносов); каждое число из полей есть в цитатах карточки.
// Карточка, не прошедшая проверку, в книгу не попадает. Ничего не выдумывается: нет цитаты, нет факта.
//   node tools/ru/cards.mjs [--offline]      (--offline: брать страницы только из кэша ru-work/cards/pages)
// Формат карточки: {id,title,cost,human,gain,level:'A|B|C',note,tag:{money,time,will,benefit,lens},sources:[{title,url,quote}],checked?:'ДД.ММ.ГГГГ'}
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchPdfText } from './lib.mjs';

const OFFLINE = process.argv.includes('--offline');
const SRC = 'ru-work/cards/cards.json', OUT = 'ru/book/35-rossiyskie-spravki.md', CACHE = 'ru-work/cards/pages';
mkdirSync(CACHE, { recursive: true });
const cards = JSON.parse(readFileSync(SRC, 'utf8'));
const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('.');
const norm = (s) => s.replace(/[   ]/g, ' ').replace(/[«»"“”„]/g, '"').replace(/[‐‑–—]/g, '-').replace(/(\p{L})- (\p{L})/gu, '$1$2').replace(/\s+/g, ' ').trim().toLowerCase();
const normKeep = (s) => s.replace(/[   ]/g, ' ').replace(/[«»"“”„]/g, '"').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));
const OFFICIAL = /(^|\.)(gov\.ru|cbr\.ru|consultant\.ru|garant\.ru|sledcom\.ru|vsrf\.ru|mvd\.ru|trudvsem\.ru|gosuslugi\.ru|rospotrebnadzor\.ru|who\.int|xn--p1ai)$/;
const MAP = {
  money: { '0': '0', 'мало': '少', 'много': '多' }, time: { 'мало': '少', 'средне': '中', 'много': '多' }, will: { 'нет': '否', 'немного': '些', 'да': '是' },
  benefit: { 'большая': '大', 'средняя': '中', 'малая': '小' }, lens: { 'здоровье': '死亡率', 'деньги': '金钱', 'время': '时间', 'свобода': '自由' },
};
const pageText = async (url) => {
  const f = `${CACHE}/${createHash('sha1').update(url).digest('hex').slice(0, 16)}.txt`;
  if (existsSync(f)) return readFileSync(f, 'utf8');
  if (OFFLINE) return '';
  let t = ''; try { t = (await fetchPdfText(url)).replace(/\u0000/g, ''); } catch { /* страница не скачалась */ }
  if (t.length > 300) writeFileSync(f, t);
  return t;
};

const good = []; let bad = 0;
for (const c of cards) {
  const problems = [];
  for (const k of ['id', 'title', 'cost', 'human', 'gain', 'level', 'note']) if (!c[k]) problems.push(`нет поля ${k}`);
  if (!['A', 'B', 'C'].includes(c.level)) problems.push('уровень не A, B или C');
  for (const [k, m] of Object.entries(MAP)) if (!(c.tag && m[c.tag[k]])) problems.push(`тег ${k}: ${c.tag && c.tag[k]}`);
  if (!c.sources || !c.sources.length) problems.push('нет источников');
  const quoted = [];
  for (const s of c.sources || []) {
    let host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { problems.push(`плохой адрес ${s.url}`); continue; }
    if (!OFFICIAL.test(host)) { problems.push(`сайт не из списка официальных: ${host}`); continue; }
    const text = norm(await pageText(s.url)), textKeep = normKeep(await pageText(s.url));
    if (!s.quote || !(text.includes(norm(s.quote)) || textKeep.includes(normKeep(s.quote)))) { problems.push(`цитата не найдена на ${host}: «${(s.quote || '').slice(0, 50)}»`); continue; }
    quoted.push(s.quote);
  }
  const have = new Set(nums(quoted.join(' ')));
  const free = (n) => ['1', '2', '3'].includes(n) || n === '112' || n === '101' || n === '102' || n === '103';
  const miss = [...new Set(nums([c.title, c.cost, c.human, c.gain, c.note].join(' ')))].filter((n) => !have.has(n) && !free(n));
  if (miss.length) problems.push(`числа без цитаты: ${miss.join(', ')}`);
  if (problems.length) { console.error(`⛔ ${c.id}: ${problems.join('; ')}`); bad++; continue; }
  console.error(`✅ ${c.id}: цитат ${quoted.length}`);
  good.push(c);
}

const tagLine = (t) => `<!-- 成本标签: 钱=${MAP.money[t.money]} 时间=${MAP.time[t.time]} 毅力=${MAP.will[t.will]} 收益=${MAP.benefit[t.benefit]} 口径=${MAP.lens[t.lens]} -->`;
const entry = (c, i) => `### ${i + 1}. ${c.title}
${tagLine(c.tag)}
- Затраты: ${c.cost}
- Простыми словами: ${c.human}
- Выгода: ${c.gain}
- Уровень доказательств: ${c.level}
- Источники: ${[...new Map(c.sources.map((s) => [s.url, s])).values()].map((s) => `${s.title}. Проверено ${c.checked || today}. <${s.url}>`).join(' ; ')}
- Примечания: ${c.note}
`;
const intro = `[← К общему оглавлению](../README.md)

# 35. Российские справки

Здесь собраны карточки, которых нет в китайской книге. Каждая написана по официальным российским источникам: законам, приказам, клиническим рекомендациям и разъяснениям ведомств. Цитаты из источников сверены с текстом страниц, числа есть в цитатах.
Законы и порядки меняются. Перед важным решением проверьте действующую редакцию на сайте-источнике.
`;
writeFileSync(OUT, intro + '\n' + good.map(entry).join('\n') + '\n');

// метка страны: этим карточкам нужен тип r («Российский материал»), он нужен сайту, чтобы не выводить китайские пометки
const scopeFile = 'ru/scope.json';
const scope = JSON.parse(readFileSync(scopeFile, 'utf8'));
for (const k of Object.keys(scope)) if (k.startsWith('35-')) delete scope[k];
good.forEach((_, i) => { scope[`35-${i + 1}`] = { t: 'r' }; });
writeFileSync(scopeFile, JSON.stringify(scope));
console.error(`\nпринято ${good.length}, отклонено ${bad}; записано ${OUT}`);
process.exit(good.length ? 0 : 1);
