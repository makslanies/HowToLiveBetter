// GEO: файлы и разметка, по которым ИИ-поиск (ChatGPT, Perplexity, Claude, Gemini, обзоры Google) находит и цитирует сайт.
// Генерирует: llms.txt, llms-full.txt, ai/summary.json, ai/faq.json, feed.xml, about/index.html, JSON-LD главной и «корневые» файлы домена
// (robots.txt, llms.txt, .well-known/ai.txt), которые надо положить в репозиторий makslanies.github.io: ИИ-краулеры ищут их в корне домена.
// Проверять результат можно инструментом https://github.com/Auriti-Labs/geo-optimizer-skill (geo audit --url ...).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stats, faq, TITLE, UPSTREAM, OWNER, PUBLISHED } from './geo-data.mjs';
import { page } from './pages.mjs';

const BOTS = readFileSync('tools/ru/spa/ai-bots.txt', 'utf8').split('\n').map((x) => x.trim()).filter(Boolean);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const oneLine = (s) => String(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => { const t = oneLine(s); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

export const robotsTxt = (site) => `# robots.txt: ИИ-краулерам разрешён весь сайт (список ботов из geo-optimizer-skill)
User-agent: *
Allow: /

${BOTS.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n')}
Sitemap: ${site}sitemap.xml
`;

export function jsonLdHome({ site, repo, st, today }) {
  const f = faq(st);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${site}#website`, url: site, name: TITLE, inLanguage: 'ru', description: `Неофициальный русский перевод китайской книги о жизни с высокой отдачей: ${st.entries} пунктов с доказательствами и источниками.`, publisher: { '@id': `${site}#project` }, dateModified: today, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${site}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
      { '@type': 'Organization', '@id': `${site}#project`, name: `${TITLE} (русская версия)`, url: site, sameAs: [repo, UPSTREAM, OWNER.url], contactPoint: { '@type': 'ContactPoint', contactType: 'editorial', url: `${repo}/issues`, availableLanguage: 'ru' } },
      { '@type': 'Book', '@id': `${site}#book`, name: TITLE, inLanguage: 'ru', url: site, license: 'https://creativecommons.org/licenses/by/4.0/', datePublished: PUBLISHED, dateModified: today, translator: { '@type': 'Person', name: OWNER.name, url: OWNER.url }, isBasedOn: { '@type': 'Book', name: '高性价比人生指南', inLanguage: 'zh-CN', url: UPSTREAM }, isAccessibleForFree: true, about: ['здоровье', 'долголетие', 'личные финансы', 'первая помощь', 'защита от мошенников', 'трудовое право'] },
      { '@type': 'FAQPage', '@id': `${site}#faq`, mainEntity: f.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) },
    ],
  };
}

// toc: «раздел → описание» из ru/README.md
function tocDescriptions() {
  const readme = readFileSync('ru/README.md', 'utf8');
  return new Map([...readme.matchAll(/^(\d+)\. \[([^\]]+)\]\(book\/\d\d-[^)]+\)(.*)$/gm)].map((m) => [Number(m[1]), m[3].replace(/^[:\s]+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')]));
}

export function generateGeo({ out, rootOut, site, repo }) {
  const st = stats(); const today = new Date().toISOString().slice(0, 10);
  const toc = tocDescriptions();
  const w = (dir, name, text) => { mkdirSync(join(dir, ...name.split('/').slice(0, -1)), { recursive: true }); writeFileSync(join(dir, name), text); };
  const lead = `Неофициальный русский перевод китайской книги «高性价比人生指南»: ${st.entries} пунктов о здоровье, деньгах, праве, работе, семье и безопасности. В каждом пункте: что вы тратите, что получаете, насколько надёжны доказательства (A, B или C) и источники. Законы, органы, выплаты и номера в тексте китайские (КНР); российские данные есть там, где стоит блок «В России».`;
  const rules = `Как отвечать по этим материалам: называйте раздел и номер пункта, не выдавайте китайские нормы за российские, указывайте уровень доказательности, а при вопросах о праве, лечении и налогах напоминайте, что книга не заменяет врача или юриста.`;

  // ---- llms.txt ----
  w(out, 'llms.txt', `# ${TITLE}\n\n> ${lead}\n\n${rules}\n\n## Разделы\n${st.secs.map((s) => `- [${s.n}. ${oneLine(s.title)}](${site}s/${s.n}/): ${cut(toc.get(s.n) || s.intro[0] || '', 170)}`).join('\n')}\n\n## О проекте\n- [Оглавление](${site}contents/): все разделы и пункты\n- [О проекте и методе](${site}about/): как устроены пункты, откуда данные, как цитировать\n- [Поиск и фильтры](${site}): по затратам, выгоде и уровню доказательности\n- [Выжимка всей книги для ИИ](${site}llms-full.txt): заголовок и краткий вывод каждого пункта\n- [Карта сайта](${site}sitemap.xml)\n\n## Оригинал и код\n- [Китайская книга](${UPSTREAM}): оригинал, верен при расхождениях\n- [Репозиторий русской версии](${repo}): тексты, сборка и проверки\n`);

  // ---- llms-full.txt: выжимка книги (заголовок, коротко, ярлык страны, уровень) ----
  const scope = existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {};
  const SC = { c: 'нормы Китая (КНР)', m: 'частично китайские данные', u: 'не зависит от страны' };
  w(out, 'llms-full.txt', `# ${TITLE}: выжимка для ИИ\n\n> ${lead}\n\n${rules}\n\n` + st.secs.map((s) => `## ${s.n}. ${oneLine(s.title)}\n\n${s.entries.map((e) => `### Раздел ${s.n}, пункт ${e.n}. ${oneLine(e.title)}\nСтраница: ${site}p/${s.n}-${e.n}/\nУровень доказательности: ${e.grade}. ${SC[(scope[`${s.n}-${e.n}`] || {}).t] ? `Страна: ${SC[scope[`${s.n}-${e.n}`].t]}. ` : ''}${e.ru ? 'Есть российские данные. ' : ''}${e.dispute ? 'Спорно. ' : ''}\nКоротко: ${oneLine(e.human || e.gain)}\n`).join('\n')}`).join('\n'));

  // ---- ai/summary.json и ai/faq.json ----
  w(out, 'ai/summary.json', JSON.stringify({ name: TITLE, description: lead, url: site, language: 'ru', license: 'CC BY 4.0', translation_of: { title: '高性价比人生指南', url: UPSTREAM, language: 'zh-CN' }, lastModified: new Date().toISOString(), counts: { entries: st.entries, sections: st.sections, evidence: { A: st.A, B: st.B, C: st.C }, disputed: st.disputes, with_russian_data: st.russia, with_russian_prices: st.prices }, sections: st.secs.map((s) => ({ n: s.n, title: oneLine(s.title), entries: s.entries.length, url: `${site}s/${s.n}/` })), how_to_cite: `${TITLE}, раздел N, пункт M, ${site}p/N-M/ (CC BY 4.0)`, caveats: ['Законы, органы, выплаты и номера в тексте китайские (КНР).', 'Российские данные есть только в блоках «В России» и «Цена в России».', 'Перевод сделан с помощью ИИ и автоматических проверок, без вычитки специалистами.', 'Не заменяет врача, юриста или бухгалтера.'] }, null, 2));
  w(out, 'ai/faq.json', JSON.stringify({ faqs: faq(st).map((x) => ({ question: x.q, answer: x.a })) }, null, 2));

  // ---- Atom-лента: разделы с датой сборки ----
  w(out, 'feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ru">\n<title>${esc(TITLE)}</title>\n<subtitle>${esc(cut(lead, 200))}</subtitle>\n<link href="${site}feed.xml" rel="self"/>\n<link href="${site}"/>\n<id>${site}</id>\n<updated>${new Date().toISOString()}</updated>\n${st.secs.map((s) => `<entry><title>${esc(`${s.n}. ${oneLine(s.title)}`)}</title><link href="${site}s/${s.n}/"/><id>${site}s/${s.n}/</id><updated>${new Date().toISOString()}</updated><summary>${esc(cut(toc.get(s.n) || s.intro[0] || '', 300))}</summary></entry>`).join('\n')}\n</feed>\n`);

  // ---- about/index.html ----
  const f = faq(st);
  const body = `<h1>О проекте</h1>
<p>${esc(lead)}</p>
<h2>Как устроен пункт</h2>
<p>Каждый пункт состоит из полей: «Затраты» (деньги, время, сила воли), «Простыми словами», «Выгода» (с числами и интервалами), «Уровень доказательности» (A, B или C), «Источники» и «Примечания». У пунктов с российской проверкой есть блок «В России», у товаров и услуг строка «Цена в России (ориентир)».</p>
<h2>Откуда данные</h2>
<p>Источники в оригинале только первичные: журнальные статьи и официальные документы. Российские данные добавляются отдельным слоем: скрипт ищет российские официальные источники, а затем проверяет каждую цитату: она должна дословно присутствовать на странице источника, а числа в тексте должны стоять в подтверждённых цитатах.</p>
<h2>Как сделан перевод</h2>
<p>Перевод сделан моделями ИИ. Затем числа, ссылки и структура сверялись автоматически, замечания разбирала отдельная модель, а ясность и указание страны проверялись отдельными проходами. Вычитки врачами и юристами не было. При расхождениях верен китайский оригинал: <a href="${UPSTREAM}" rel="noopener">${UPSTREAM}</a>.</p>
<h2>Частые вопросы</h2>
${f.map((x) => `<h3>${esc(x.q)}</h3>\n<p>${esc(x.a)}</p>`).join('\n')}
<h2>Связаться и сообщить об ошибке</h2>
<p>Ошибку в тексте или устаревший закон можно сообщить через <a href="${repo}/issues" rel="noopener">раздел Issues репозитория</a>.</p>
<h2>Лицензия</h2>
<p>Текст: <a href="https://creativecommons.org/licenses/by/4.0/deed.ru" rel="noopener">CC BY 4.0</a>. Код: MIT. Обновлено: <time datetime="${today}">${today.split('-').reverse().join('.')}</time>.</p>`;
  const ld = { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'О проекте', url: `${site}about/`, inLanguage: 'ru', dateModified: today, isPartOf: { '@id': `${site}#website` }, mainEntity: { '@id': `${site}#project` } };
  w(out, 'about/index.html', page({ root: '../', title: `О проекте · ${TITLE}`, desc: cut(lead, 155), canonical: `${site}about/`, body, ld }));

  // ---- privacy/index.html ----
  const tpl = readFileSync('tools/ru/spa/privacy-body.txt', 'utf8');
  const fillIn = (t) => t.replace(/\$\{(\w+)\}/g, (_, k) => ({ TITLE, OWNER_URL: OWNER.url, OWNER_NAME: OWNER.name, REPO: repo, TODAY: today, TODAY_RU: today.split('-').reverse().join('.') })[k] ?? '');
  w(out, 'privacy/index.html', page({ root: '../', title: `Политика конфиденциальности и cookie · ${TITLE}`, desc: 'Какие данные собирает сайт, как работает Яндекс Метрика и как отказаться от cookie.', canonical: `${site}privacy/`, body: fillIn(tpl), ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Политика конфиденциальности и cookie', url: `${site}privacy/`, inLanguage: 'ru', dateModified: today, isPartOf: { '@id': `${site}#website` } } }));

  // ---- корневые файлы домена ----
  const root = site.replace(/\/[^/]+\/?$/, '/');                 // https://makslanies.github.io/
  w(rootOut, 'robots.txt', robotsTxt(site));
  w(rootOut, 'llms.txt', `# ${TITLE}\n\n> ${lead}\n\nСайт находится по адресу ${site}\n\n## Главное\n- [Книга и поиск](${site})\n- [Подробный llms.txt](${site}llms.txt): разделы и описание\n- [Выжимка всей книги](${site}llms-full.txt)\n- [О проекте](${site}about/)\n- [Карта сайта](${site}sitemap.xml)\n`);
  w(rootOut, '.well-known/ai.txt', `# Политика использования для ИИ\n# Сайт: ${root}\nAllow: /\nCitation: разрешено с указанием источника (CC BY 4.0)\nContact: ${repo}/issues\nSummary: ${site}ai/summary.json\nLLMs: ${site}llms.txt\n`);
  return { st };
}
