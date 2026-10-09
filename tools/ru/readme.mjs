// Собирает ru/README.md: русская обложка + переведённые разделы исходного README
// (вопросы книги, как читать, четыре ресурса, уровни доказательности, уровни выгоды, глоссарий,
// оглавление, лицензия). Значки, реклама, донаты, «свой экземпляр» не переносятся.
//   node tools/ru/readme.mjs [--model gpt-6.1-sol]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { SLUGS } from './rename.mjs';

const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'gpt-6.1-sol';
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const UPSTREAM_REPO = 'https://github.com/eternity4719/HowToLiveBetter';
const UPSTREAM_DOCS = `${UPSTREAM_REPO}/blob/main/docs/`;
const src = readFileSync('README.md', 'utf8');

// исходный заголовок → русский заголовок (index.html ищет именно их)
const SECTIONS = [
  ['## 这本书想回答的问题', 'Какие вопросы разбирает книга'],
  ['## 怎么读', 'Как читать'],
  ['## 四种资源', 'Четыре ресурса'],
  ['## 证据分级', 'Уровни доказательности'],
  ['## 性价比档', 'Уровни выгодности'],
  ['## 读懂数字（术语表）', 'Как читать цифры (глоссарий)'],
  ['## 目录', 'Оглавление'],
  ['## 许可', 'Лицензия'],
];
const lines = src.split('\n');
const grab = (h) => {
  const a = lines.findIndex((l) => l.startsWith(h));
  if (a < 0) throw new Error(`нет раздела ${h}`);
  let b = lines.findIndex((l, i) => i > a && /^## /.test(l)); if (b < 0) b = lines.length;
  return lines.slice(a + 1, b).join('\n').trim();
};

const SYSTEM = `Ты переводишь с китайского на русский разделы README книги-руководства по жизни для обычных читателей. Правила:
1. Точно, без добавлений и украшений. Числа, проценты, имена, названия документов не менять.
2. К читателю на «вы», короткие предложения, простой язык.
3. Markdown-структуру сохраняй: списки, таблицы, <details>/<summary>, жирный шрифт. Ссылки и их адреса не трогай, переводи только подпись.
4. Поля записи называются так: 成本 → Затраты, 说人話/说人话 → Простыми словами, 收益 → Выгода, 证据等级 → Уровень доказательности, 来源 → Источники, 备注 → Примечания.
5. Статистические сокращения (HR, RR, OR, CI, RCT, BMI, LPR) оставляй латиницей. В таблице глоссария заголовки: «Термин | Значение». Если в первой ячейке несколько синонимов через «、», разделяй их « / ».
6. «第 N 节第 M 条» → «раздел N, пункт M». «条» в смысле записи книги → «пункт».
7. Китайские названия документов и органов: русское название и китайский оригинал в скобках.
8. Выводи только перевод, без заголовка раздела и пояснений.`;

async function tr(text) {
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) });
    const j = await r.json();
    if (r.ok) return j.choices[0].message.content.trim();
    if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((s) => setTimeout(s, 2000 * a));
  }
}

// ссылки: book/NN-китайское.md → book/NN-slug.md; docs/X.md → оригинал; якоря → русские
const fixLinks = (md) => md
  .replace(/\]\((?:\.\/)?book\/(\d\d)-[^)#\s]*\.md(#[^)\s]*)?\)/g, (_, nn, h) => `](book/${nn}-${SLUGS[nn]}.md${h || ''})`)
  .replace(/\]\((?:\.\/)?docs\/([^)#\s]+\.md)(#[^)\s]*)?\)/g, (_, p) => `](${UPSTREAM_DOCS}${p.split('/').map((s) => (/%/.test(s) ? s : encodeURIComponent(s))).join('/')})`);

const bodies = await Promise.all(SECTIONS.map(async ([h]) => tr(grab(h))));
const parts = SECTIONS.map(([, ru], i) => `## ${ru}\n\n${fixLinks(bodies[i])}`);

const header = `# Руководство по жизни с высокой отдачей (高性价比人生指南)

Книга о том, как прожить дольше и болеть меньше, что делать при несчастных случаях, как не терять деньги и не попадать на мошенников и в суд, на что можно рассчитывать, если нет ни работы, ни денег, что нужно оформить, чтобы открыть магазин, фирму или сайт. Ещё о любви, браке и детях, поездках за границу и профессиональных навыках.

В каждом пункте сказано, что вы тратите, что получаете и насколько надёжны доказательства. Источники только первичные: журнальные статьи и официальные документы.

Не нужно делать всё. Это список вариантов, расставленных по выгодности, а не перечень заданий. Достаточно одного-двух пунктов.

> **Это неофициальный русский перевод** китайской книги [高性价比人生指南](${UPSTREAM_REPO}) (лицензия CC BY 4.0). При расхождениях верен китайский оригинал.
>
> **Китайские условия и российские данные разделены по полям.** В «Простыми словами», «Затратах», «Выгоде» и «Примечаниях» российские сведения отмечены «(Россия)». Источники обеих версий указаны отдельно. Непроверенные российские поля обозначены явно. Российские цены не означают проверку российских правил. Оценки и фильтры относятся к исходной версии.

[К оглавлению](#оглавление) · [Глоссарий](#как-читать-цифры-глоссарий) · [Оригинал на китайском](${UPSTREAM_REPO})

`;
const footer = `\n## Текст книги\n\nПункты лежат в папке [book/](book/): один файл на раздел. Поиск и фильтры по стоимости, времени и надёжности доказательств есть на странице [index.html](index.html).\n`;
writeFileSync('ru/README.md', header + parts.join('\n\n') + '\n' + footer);

// проверки
const out = readFileSync('ru/README.md', 'utf8');
const links = new Set([...out.matchAll(/\]\((book\/\d\d-[^)#\s]+\.md)\)/g)].map((m) => m[1]));
const missingFiles = [...links].filter((l) => !existsSync(`ru/${l}`));
console.error(`README: ${out.length} знаков; ссылок на разделы ${links.size}/34; битых ссылок на файлы: ${missingFiles.length}`);
console.error(`строк глоссария: ${(out.match(/^\|\s*[^|\-][^|]*\|/gm) || []).length}; китайских знаков осталось: ${(out.match(/[一-鿿]/g) || []).length}`);
