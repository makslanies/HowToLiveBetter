// Собирает ru/index.html из index.html: русский интерфейс и разбор русских полей.
// Ключи логики (大/中/小, 极高/高/一般, 钱/时间/毅力 в теге стоимости) остаются китайскими, они лежат в данных;
// переводятся подписи, названия полей, сноски «раздел N, пункт M». Аналитику, рекламу и донаты вырезает.
//   node tools/ru/build-index.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { stats, faq } from './geo-data.mjs';
import { COUNTRY_GUIDE } from './country-fields.mjs';

// репозиторий русской версии (ссылка в шапке); оригинал остаётся только в подвале и README как указание авторов
const MY_REPO = (process.env.RU_REPO_URL || 'https://github.com/makslanies/HowToLiveBetter').replace(/\/$/, '');
let s = readFileSync('index.html', 'utf8');
const fail = (m) => { console.error('ОШИБКА: ' + m); process.exit(1); };
const sub = (a, b, all = false) => { if (!s.includes(a)) fail(`нет фрагмента: ${a.slice(0, 80)}`); s = all ? s.split(a).join(b) : s.replace(a, () => b); };
const re = (r, b) => { if (!r.test(s)) fail(`нет совпадения: ${r}`); s = s.replace(r, () => b); };

// ---------- head ----------
sub('<html lang="zh-CN">', '<html lang="ru">');
const TITLE = 'Руководство по жизни с высокой отдачей';
const DESC = 'Руководство по жизни, расставленное по выгодности: 665 пунктов о здоровье и долголетии, первой помощи, деньгах, защите от мошенников и юридических красных линиях, безработице, риске своего дела, любви и детях, поездках и навыках. В каждом пункте затраты, выгода, надёжность доказательств и первоисточник. Неофициальный русский перевод, законы и органы в тексте китайские.';
re(/<title>.*?<\/title>/, `<title>${TITLE} · меньше денег, времени и сил, больше здоровья, денег и свободы</title>`);
re(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${DESC}">`);
re(/<meta name="keywords" content="[^"]*">/, '<meta name="keywords" content="долголетие,здоровье,доказательная медицина,экономия,защита от мошенников,первая помощь,юридические красные линии,безработица,выгодность">');
re(/<meta name="author" content="[^"]*">/, `<meta name="author" content="${TITLE}">`);
// подтверждение прав на сайт в Google Search Console (только на главной странице); Яндекс подтверждается файлом в корне, его кладёт build.mjs
sub('<meta name="viewport"', '<meta name="google-site-verification" content="wLzQi1ukjxvHhg1tqMvbR_SGp3KLrD01b5IqgRD3LW4" />\n<meta name="viewport"');
re(/<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="${TITLE}">`);
re(/<meta property="og:locale" content="[^"]*">/, '<meta property="og:locale" content="ru_RU">');
re(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${TITLE}">`);
re(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${DESC}">`);
re(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${TITLE}">`);
re(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${DESC}">`);
// адреса оригинала и разметка поисковиков не наши
for (const r of [/<link rel="canonical"[^>]*>\n/, /<meta property="og:url"[^>]*>\n/, /<meta property="og:image[^>]*>\n/g, /<meta name="twitter:image"[^>]*>\n/, /<script type="application\/ld\+json">[\s\S]*?<\/script>\n/]) re(r, '');
re(/<!-- ga:start[\s\S]*?<!-- ga:end -->\n?/, '');   // чужая Google Analytics

// ---------- noscript ----------
re(/<noscript>[\s\S]*?<\/noscript>/, `<noscript>
  <div style="max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.7">
    <h1>${TITLE}</h1>
    <p>Для фильтров на этой странице нужен JavaScript. Текст можно читать и без него: оглавление в <a href="README.md">README.md</a>, разделы в папке <a href="book/">book/</a>.</p>
  </div>
</noscript>`);

// ---------- шапка ----------
sub('aria-label="打开筛选"', 'aria-label="Открыть фильтры"');
sub('<span>高性价比人生指南</span>', `<span>${TITLE}</span>`);
sub('placeholder="搜索条目" autocomplete="off" aria-label="搜索条目"', 'placeholder="Поиск по пунктам" autocomplete="off" aria-label="Поиск по пунктам"');
sub('title="查看 README.md"', 'title="Открыть README.md"');
sub('<a class="icon-btn" href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener" title="在 GitHub 上查看源仓库" aria-label="GitHub 仓库">', `<a class="icon-btn" href="${MY_REPO}" target="_blank" rel="noopener" title="Русская версия на GitHub" aria-label="Репозиторий русской версии">`);
sub('aria-label="切换深色模式" title="切换深色模式"', 'aria-label="Тёмная тема" title="Тёмная тема"');

// ---------- боковая панель ----------
sub('<div class="gt">章节</div>', '<div class="gt">Разделы</div>');
sub('<div class="gt">性价比 <small>作者判断，同口径内可比</small></div>', '<div class="gt">Выгодность <small>оценка автора, сравнима в одной единице счёта</small></div>');
sub('data-v="极高" aria-pressed="false">极高<', 'data-v="极高" aria-pressed="false">Очень высокая<');
sub('data-v="高" aria-pressed="false">高<', 'data-v="高" aria-pressed="false">Высокая<');
sub('data-v="一般" aria-pressed="false">一般<', 'data-v="一般" aria-pressed="false">Обычная<');
sub('<div class="gt">换回什么 <small>口径，不跨口径比较</small></div>', '<div class="gt">Что получаете <small>единица счёта, разные единицы не сравниваются</small></div>');
sub('data-v="死亡率" aria-pressed="false">寿命<', 'data-v="死亡率" aria-pressed="false">Жизнь<');
sub('data-v="金钱" aria-pressed="false">钱<', 'data-v="金钱" aria-pressed="false">Деньги<');
sub('data-v="时间" aria-pressed="false">时间精力<', 'data-v="时间" aria-pressed="false">Время и силы<');
sub('data-v="自由" aria-pressed="false">人身自由<', 'data-v="自由" aria-pressed="false">Свобода<');
sub('<div class="gt">证据等级 <small>荟萃/RCT · 有研究 · 共识</small></div>', '<div class="gt">Доказательность <small>метаанализ/РКИ · есть исследования · консенсус</small></div>');
for (const g of 'ABC') sub(`data-v="${g}" aria-pressed="false">${g} 级<`, `data-v="${g}" aria-pressed="false">${g}<`);
sub('<div class="gt">花钱</div>', '<div class="gt">Затраты денег</div>');
sub('data-v="0" aria-pressed="false">不花钱<', 'data-v="0" aria-pressed="false">Бесплатно<');
sub('<div class="chips" data-dim="money">\n      <button class="chip" data-v="0" aria-pressed="false">Бесплатно</button>\n      <button class="chip" data-v="少" aria-pressed="false">少<', '<div class="chips" data-dim="money">\n      <button class="chip" data-v="0" aria-pressed="false">Бесплатно</button>\n      <button class="chip" data-v="少" aria-pressed="false">Немного<');
sub('<button class="chip" data-v="多" aria-pressed="false">多</button>\n    </div>\n  </div>\n  <div class="group">\n    <div class="gt">花时间</div>', '<button class="chip" data-v="多" aria-pressed="false">Много</button>\n    </div>\n  </div>\n  <div class="group">\n    <div class="gt">Затраты времени</div>');
sub('data-v="少" aria-pressed="false">顺手<', 'data-v="少" aria-pressed="false">Мимоходом<');
sub('data-v="中" aria-pressed="false">几小时<', 'data-v="中" aria-pressed="false">Несколько часов<');
sub('data-v="多" aria-pressed="false">每天占用<', 'data-v="多" aria-pressed="false">Каждый день<');
sub('<div class="gt">要毅力</div>', '<div class="gt">Сила воли</div>');
sub('data-v="否" aria-pressed="false">不用<', 'data-v="否" aria-pressed="false">Не нужна<');
sub('data-v="些" aria-pressed="false">一点<', 'data-v="些" aria-pressed="false">Немного<');
sub('data-v="是" aria-pressed="false">很多<', 'data-v="是" aria-pressed="false">Много<');
sub('id="f-dispute"> 只看标了争议的', 'id="f-dispute"> Только спорные');
sub('id="f-todo"> 只看有待核实的', 'id="f-todo"> Только с непроверенным');
sub('<button class="reset" id="reset">清空筛选</button>', '<button class="reset" id="reset">Сбросить фильтры</button>');
re(/<div class="hint">[\s\S]*?<\/div>\n  <div class="group ad">[\s\S]*?<\/div>\n<\/aside>/, `<div class="hint">
    <p>Раздел можно выбрать только один, затраты и уровни доказательности можно отмечать по несколько. Внутри одной группы условия соединяются через «или», между группами через «и».</p>
    <p>Внутри раздела пункты идут от более выгодных к менее выгодным, поиск порядок не меняет.</p>
    <p>Тексты и теги берутся из файлов в папке <a href="book/">book/</a>: 34 раздела.</p>
  </div>
  <div class="group ad" hidden><button type="button" class="tip-open" id="tip-open" hidden></button></div>
</aside>`);

// ---------- заголовок документа ----------
re(/<div class="doc-head">[\s\S]*?<details class="gloss" id="gloss">[\s\S]*?<\/details>/, `<div class="doc-head">
      <h1>${TITLE}</h1>
      <p>В каждом пункте два вопроса: что вы тратите и что получаете.</p>
      <p>Получатель выгоды тоже делится на уровни: вы сами, затем супруг и прямые родственники, затем друзья и коллеги, ниже всех незнакомцы. Ниже не значит ноль: вероятность ответной выгоды мала, и нужно смотреть на риски.</p>
      <p>Делать всё не нужно: это список вариантов, расставленных по выгодности, а не перечень заданий. Достаточно одного-двух пунктов. Чтобы выбрать самое лёгкое, отметьте слева «Бесплатно» в затратах денег и «Не нужна» в силе воли. Ссылки с пунктиром вида «раздел 8, пункт 11» открываются на месте.</p>
      <p><b>Это неофициальный перевод китайской книги.</b> Законы, органы, телефоны и выплаты в тексте китайские (КНР). Там, где проверена российская версия, под пунктом есть строка «В России». Где её нет, российская проверка ещё не проведена.</p>
      <div class="stat" aria-live="polite">Показано <b id="cnt">–</b> из <span id="tot">–</span> пунктов</div>
      <div class="doc-links">Длинные статьи (на китайском, в оригинальном репозитории): <a href="https://github.com/eternity4719/HowToLiveBetter/tree/main/docs">папка docs</a></div>
      <details class="gloss" id="gloss"><summary>Непонятные сокращения и термины</summary><p>Слова с пунктирным подчёркиванием можно нажать или навести на них курсор, появится пояснение. Весь список ниже.</p><dl></dl></details>`);
sub('<span id="status-t">正在读取正文 …</span>', '<span id="status-t">Загрузка текста …</span>');
sub('没有匹配的条目。去掉一个筛选条件，或换个更短的关键词。', 'Подходящих пунктов нет. Уберите одно условие или введите слово покороче.');
sub('<div><button id="reset2">清空筛选</button></div>', '<div><button id="reset2">Сбросить фильтры</button></div>');
re(/<div class="foot">[\s\S]*?<\/div>\n  <\/div>\n<\/main>/, `<div class="foot">Единица счёта указана в самих пунктах: разделы 1 и 2 считают общую смертность или отдельные причины смерти, разделы 3 и 4 силы и время, раздел 5 деньги, раздел 7 деньги и социальные гарантии, разделы 8 и 9 деньги и личную свободу. Между собой они не пересчитываются. Источники проверялись по оригиналу (<a href="https://github.com/eternity4719/HowToLiveBetter/tree/main/docs">журнал проверки на китайском</a>). Текст опубликован по лицензии <a href="https://creativecommons.org/licenses/by/4.0/deed.ru">CC BY 4.0</a>: при копировании и переработке укажите авторов и ссылку на <a href="https://github.com/eternity4719/HowToLiveBetter">оригинал</a>.</div>
  </div>
</main>`);
sub('rel="noopener">在 GitHub 打开</a><button type="button" id="dm-x" aria-label="关闭">', 'rel="noopener">Открыть на GitHub</a><button type="button" id="dm-x" aria-label="Закрыть">');
re(/<div id="tip-mask" hidden>[\s\S]*?<\/div>\n<\/div>\n\n<div id="xref-pop"/, '<div id="tip-mask" hidden>\n  <div id="tip-box"><button type="button" id="tip-x">×</button></div>\n</div>\n\n<div id="xref-pop"');
sub('<button class="xp-go" type="button">跳过去</button><button class="xp-x" type="button" aria-label="关闭">', '<button class="xp-go" type="button">Перейти</button><button class="xp-x" type="button" aria-label="Закрыть">');

// ---------- разбор данных ----------
sub('if ((m = /^- 成本：(.*)$/.exec(line))) entry.cost = m[1];', 'if ((m = /^- Затраты:\\s*(.*)$/.exec(line))) entry.cost = m[1];');
sub('else if ((m = /^- 说人话：(.*)$/.exec(line))) entry.human = m[1];', 'else if ((m = /^- Простыми словами:\\s*(.*)$/.exec(line))) entry.human = m[1];');
sub('else if ((m = /^- 收益：(.*)$/.exec(line))) entry.gain = m[1];', 'else if ((m = /^- Выгода:\\s*(.*)$/.exec(line))) entry.gain = m[1];');
sub('else if ((m = /^- 证据等级：\\s*([ABC])/.exec(line))) entry.grade = m[1];', 'else if ((m = /^- Уровень доказательств:\\s*([ABC])/.exec(line))) entry.grade = m[1];');
sub('else if ((m = /^- 来源：(.*)$/.exec(line))) entry.src = m[1];', 'else if ((m = /^- Источники:\\s*(.*)$/.exec(line))) entry.src = m[1];\n      else if ((m = /^- В России:\\s*(.*)$/.exec(line))) entry.ru = (entry.ru ? entry.ru + \' \' : \'\') + m[1];\n      else if ((m = /^- Источники \\(Россия\\):\\s*(.*)$/.exec(line))) entry.src += \'; Россия: \' + m[1];\n      else if ((m = /^- Примечание к «В России»:\\s*(.*)$/.exec(line))) entry.ru = (entry.ru ? entry.ru + \' \' : \'\') + m[1];');
sub('else if ((m = /^- 备注：(.*)$/.exec(line))) entry.note = m[1];', 'else if ((m = /^- Примечания:\\s*(.*)$/.exec(line))) entry.note = m[1];');
sub("entry.src += '; Россия: '", "entry.src += ' ; Россия: '");
sub("title:m[2].trim(), cost:'', human:''", "title:m[2].trim(), ru:'', cost:'', human:''");
sub('e.dispute = /^争议/.test(e.note);', 'e.dispute = /^Спорно/.test(e.note);');
sub('e.todo = /待核实|TODO/.test(e.src + e.gain + e.note + e.cost);', 'e.todo = /требует проверки|TODO|待核实/.test(e.src + e.gain + e.note + e.cost + e.ru);');
sub('e.hay = [e.title, e.human, e.cost, e.gain, e.note, e.src, e.grade]', 'e.hay = [e.title, e.human, e.cost, e.gain, e.note, e.ru, e.src, e.grade]');
sub('/^## 读懂数字[^\\n]*\\n([\\s\\S]*?)(?=^## )/m', '/^## Как читать цифры[^\\n]*\\n([\\s\\S]*?)(?=^## )/m');
sub("c[1] === '术语'", "c[1] === 'Термин'");
sub("c[1].split('、')", "c[1].split(' / ')");
sub("a.term.localeCompare(b.term, 'zh')", "a.term.localeCompare(b.term, 'ru')");

// ---------- сноски «раздел N, пункт M» ----------
sub("const NUMS = '[\\\\d、]+(?:\\\\s*到\\\\s*\\\\d+)?';", "const NUMS = '(?:с\\\\s+)?\\\\d+(?:\\\\s*(?:,|и)\\\\s*\\\\d+)*(?:\\\\s*(?:–|—|-|по)\\\\s*\\\\d+)?';");
re(/const XREF_RE = new RegExp\(`[^`]*`, 'g'\);/, "const XREF_RE = new RegExp(`раздел(?:а|е|у|ом)?\\\\s+(\\\\d+),\\\\s*пункт(?:а|е|у|ы|ов)?\\\\s+(${NUMS})|пункт(?:а|е|у|ы|ов)?\\\\s+(${NUMS})\\\\s+раздел(?:а|е|у|ом)?\\\\s+(\\\\d+)|раздел(?:а|е|у|ом|ы|ов)?\\\\s+(\\\\d+(?:\\\\s*(?:,|и)\\\\s*\\\\d+)*)`, 'gi');");
sub("for (const part of String(spec).split('、')){\n    const r = /^\\s*(\\d+)\\s*到\\s*(\\d+)\\s*$/.exec(part);", "for (const part of String(spec).split(/\\s*(?:,|и)\\s*/)){\n    const r = /^\\s*(?:с\\s+)?(\\d+)\\s*(?:–|—|-|по)\\s*(\\d+)\\s*$/.exec(part);");
sub("const keys = m[5] != null\n      ? String(m[5]).split('、').map(x => x.trim()).filter(x => SECS.has(x)).map(x => 's' + x)\n      : xrefKeys(m[1] ?? CUR_SEC, m[2] ?? m[3] ?? m[4] ?? '');", "const keys = m[5] != null\n      ? String(m[5]).split(/\\s*(?:,|и)\\s*/).map(x => x.trim()).filter(x => SECS.has(x)).map(x => 's' + x)\n      : xrefKeys(m[1] ?? m[4] ?? CUR_SEC, m[2] ?? m[3] ?? '');");
sub('s.textContent = `整节，共 ${sec.entries.length} 条`;', 's.textContent = `Весь раздел, пунктов: ${sec.entries.length}`;');
sub('s.textContent = `第 ${e.sec} 节第 ${e.n} 条`;', 's.textContent = `Раздел ${e.sec}, пункт ${e.n}`;');
sub('/第\\s*\\d/.test(w.currentNode.nodeValue)', '/раздел|пункт/i.test(w.currentNode.nodeValue)');

// ---------- подписи ----------
sub("const LENS_LABEL = {'死亡率':'换寿命','金钱':'换钱','时间':'换时间精力','自由':'换人身自由'};", "const LENS_LABEL = {'死亡率':'для жизни','金钱':'для денег','时间':'для времени и сил','自由':'для свободы'};");
sub("const LABEL = { money:{'0':'不花钱','少':'花少量钱','多':'花不少钱'}, time:{'少':'顺手','中':'花几小时','多':'每天占时间'}, will:{'否':'不用毅力','些':'要一点毅力','是':'要很多毅力'} };", "const LABEL = { money:{'0':'бесплатно','少':'немного денег','多':'много денег'}, time:{'少':'мимоходом','中':'несколько часов','多':'каждый день'}, will:{'否':'без силы воли','些':'немного силы воли','是':'много силы воли'} };");
sub('<span>全部章节</span>', '<span>Все разделы</span>');
sub('title="展开或收起本节目录"', 'title="Развернуть или свернуть раздел"');
sub("none.textContent = '没有符合当前筛选的条目';", "none.textContent = 'Нет пунктов под текущие фильтры';");
sub('aria-label="本条链接"', 'aria-label="Ссылка на пункт"');
sub('<div class="k">成本</div><div class="v cost"></div>\n          <div class="k">收益</div><div class="v gain"></div>\n          <div class="k">备注</div><div class="v note"></div>', '<div class="k">Затраты</div><div class="v cost"></div>\n          <div class="k">Выгода</div><div class="v gain"></div>\n          <div class="k ru-k" hidden>В России</div><div class="v ru" hidden></div>\n          <div class="k">Примечания</div><div class="v note"></div>');
sub('<summary>来源<span class="cnt"></span></summary>', '<summary>Источники<span class="cnt"></span></summary>');
sub("t.textContent = '性价比 ' + e.ratio;", "t.textContent = 'Выгодность: ' + ({'极高':'очень высокая','高':'высокая','一般':'обычная'}[e.ratio] || e.ratio);");
sub("t.title = '作者判断：由收益量级（' + e.level + '）和三项成本合成，只在同一口径（' + LENS_LABEL[e.lens] + '）内可比，与证据等级无关';", "t.title = 'Оценка автора: складывается из масштаба выгоды (' + ({'大':'большая','中':'средняя','小':'малая'}[e.level] || e.level) + ') и трёх видов затрат. Сравнима только в одной единице счёта (' + LENS_LABEL[e.lens] + '), от уровня доказательности не зависит';");
sub('add(e.grade, `证据 ${e.grade} 级`);', 'add(e.grade, `Доказательность ${e.grade}`);');
sub("add('danger', '争议');", "add('danger', 'Спорно');");
sub("add('warn', '含待核实');", "add('warn', 'Есть непроверенное');");
sub('f:{t:c.querySelector(\'.t\'),', 'f:{ru:c.querySelector(\'.ru\'), ruK:c.querySelector(\'.ru-k\'), t:c.querySelector(\'.t\'),');
sub('  renderText(f.gain, e.gain, terms);\n', '  renderText(f.gain, e.gain, terms);\n  f.ru.hidden = f.ruK.hidden = !e.ru;\n  if (e.ru) renderText(f.ru, e.ru, terms);\n');
sub("f.srcN.textContent = nSrc > 1 ? ` · ${nSrc} 条` : '';", "f.srcN.textContent = nSrc > 1 ? ` · ${nSrc}` : '';");

// ---------- сообщения ----------
sub('`取不到 ${path}（网络中断或超时）`', '`Не удалось получить ${path} (обрыв сети или таймаут)`');
sub('\'<div class="dm-load">正在读取 …</div>\'', '\'<div class="dm-load">Загрузка …</div>\'');
sub('\'<div class="dm-load">读不到这篇长文（\'', '\'<div class="dm-load">Не удалось прочитать статью (\'');
sub("'）。'\n", "').'\n");
sub('rel="noopener">在 GitHub 打开</a></div>\';', 'rel="noopener">Открыть на GitHub</a></div>\';');
sub('`正在读取正文 ${done}/${total}`', '`Загрузка текста ${done}/${total}`');
sub("'离线副本里缺 '+f", "'В офлайн-копии нет '+f");
sub("'这个页面要通过 http 打开才能读取正文。在仓库目录运行 <code>python -m http.server</code>，然后访问 <code>http://localhost:8000/</code>；或直接用 GitHub Pages 地址。'", "'Страницу нужно открывать по http. В папке сайта выполните <code>python -m http.server</code> и откройте <code>http://localhost:8000/</code>, либо используйте адрес GitHub Pages.'");
sub('`加载失败：${esc(String(err.message))}`', '`Ошибка загрузки: ${esc(String(err.message))}`');
sub('id="retry">继续加载</button>', 'id="retry">Продолжить загрузку</button>');
sub('\'<span id="status-t">正在读取正文 …</span><div class="bar"><i id="status-b"></i></div>\'', '\'<span id="status-t">Загрузка текста …</span><div class="bar"><i id="status-b"></i></div>\'');
sub('`读取正文失败（${esc(String(err.message))}）。确认 README.md 和 book/ 目录都在 index.html 旁边。`', '`Не удалось прочитать текст (${esc(String(err.message))}). Проверьте, что README.md и папка book/ лежат рядом с index.html.`');
sub('/^\\[← 回总目录\\]/.test(ln)', '/^\\[← (?:Вернуться|К оглавлению)/.test(ln)');

// длинные статьи в русской версии не встроены: перехват ссылок на docs/ выключаем, ссылки ведут на оригинал
sub("const DOC_PREFIX = REPO_BLOB + 'docs/';", "const DOC_PREFIX = 'x-disabled:docs/';");


// ---------- настоящие ссылки между пунктами, «Смотрите также», отдельные страницы ----------
const snip = (n) => readFileSync(`tools/ru/spa/${n}`, 'utf8').trimEnd();
re(/const XREF_RE = new RegExp\(`[^`]*`, 'gi'\);/, snip('xref-re.js'));
sub("XREF_RE.lastIndex = 0; let m, last = 0, any = false;\n  while ((m = XREF_RE.exec(s))){", "const RE = BARE ? XREF_BARE_RE : XREF_RE; RE.lastIndex = 0; let m, last = 0, any = false;\n  while ((m = RE.exec(s))){");
sub("xrefKeys(m[1] ?? m[4] ?? CUR_SEC, m[2] ?? m[3] ?? '')", "xrefKeys(m[1] ?? m[4] ?? CUR_SEC, m[2] ?? m[3] ?? m[6] ?? '')");
// сноска становится ссылкой с адресом: средний клик и Ctrl/Cmd открывают отдельную страницу, обычный клик показывает окошко
sub("const a = document.createElement('span');\n    a.className = 'xref'; a.tabIndex = 0; a.dataset.keys = keys.join(',');", "const a = document.createElement('a');\n    a.className = 'xref'; a.tabIndex = 0; a.dataset.keys = keys.join(',');\n    a.href = keys[0][0] === 's' ? 's/' + keys[0].slice(1) + '/' : 'p/' + keys[0] + '/';");
sub("  if (a){ showXref(a); return; }", "  if (a){ if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return; ev.preventDefault(); showXref(a); return; }");
sub("document.addEventListener('click', ev => {\n  const a = ev.target.closest?.('.xref');", "document.addEventListener('click', ev => {\n  const g = ev.target.closest?.('.rel a[data-go]');\n  if (g){ if (!(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)){ ev.preventDefault(); gotoItem(g.dataset.go, g.closest('.card')?.id || ''); } return; }\n  const a = ev.target.closest?.('.xref');");
sub(".xref{color:var(--brand-1);cursor:pointer;border-bottom:1px dashed currentColor}", ".xref{color:var(--brand-1);cursor:pointer;border-bottom:1px dashed currentColor;text-decoration:none}\n.rel a{color:var(--brand-1)}");
sub("renderText(p, para, [], false); block.appendChild(p);", "BARE = true; renderText(p, para, [], false); BARE = false; block.appendChild(p);");
// ссылка на отдельную страницу в шапке карточки
sub('aria-label="Ссылка на пункт">#</a></div>', 'aria-label="Ссылка на пункт">#</a><a class="anchor" href="p/${e.sec}-${e.n}/" aria-label="Отдельная страница пункта" title="Отдельная страница">↗</a></div>');
// строка «Смотрите также»
sub('<div class="k">Примечания</div><div class="v note"></div>', '<div class="k">Примечания</div><div class="v note"></div>\n          <div class="k rel-k" hidden>Смотрите также</div><div class="v rel" hidden></div>');
sub("f:{ru:c.querySelector('.ru'), ruK:c.querySelector('.ru-k'),", "f:{rel:c.querySelector('.rel'), relK:c.querySelector('.rel-k'), ru:c.querySelector('.ru'), ruK:c.querySelector('.ru-k'),");
sub("  if (e.ru) renderText(f.ru, e.ru, terms);\n", "  if (e.ru) renderText(f.ru, e.ru, terms);\n" + snip('related-card.js') + "\n");
sub("    GLOSS = parseGlossary(md);", "    RELATED = EMBED ? (EMBED.related || {}) : await readText('related.json').then((t) => JSON.parse(t), () => ({}));\n    GLOSS = parseGlossary(md);");
// пометка «что китайское, что российское»: ярлык в карточке и пояснение под «Простыми словами»
sub("let RELATED = {};", "let RELATED = {};\nlet SCOPE = {};   // ru/scope.json: ключ пункта → {t: c|m|u, why}");
sub('<p class="human"></p>', '<p class="human"></p>\n        <p class="scope" hidden></p>');
sub("f:{rel:c.querySelector('.rel'),", "f:{scope:c.querySelector('.scope'), rel:c.querySelector('.rel'),");
sub("      if (e.dispute) add('danger', 'Спорно');", "      { const sc = SCOPE[e.sec + '-' + e.n]; if (sc) add(sc.t === 'u' ? 'plain' : 'warn', sc.t === 'c' ? 'Нормы Китая (КНР)' : sc.t === 'm' ? 'Частично Китай' : 'Не зависит от страны'); }\n      if (e.ru) add('plain', 'Есть российские данные');\n      if (e.dispute) add('danger', 'Спорно');");
sub("  f.ru.hidden = f.ruK.hidden = !e.ru;", "  { const sc = SCOPE[e.sec + '-' + e.n]; const on = !!sc && sc.t !== 'u'; f.scope.hidden = !on; if (on) f.scope.textContent = 'Как в Китае. ' + (sc.t === 'c' ? 'Пункт построен на китайских нормах (КНР): законы, органы, выплаты или номера в нём китайские. ' : 'В пункте есть и общее для всех стран, и китайское (законы, органы, выплаты, номера). ') + (sc.why || '') + (e.ru ? ' Российские данные есть в строке «В России» ниже.' : ' Российская версия пока не проверена: переносить правила на другую страну нельзя.'); }\n  f.ru.hidden = f.ruK.hidden = !e.ru;");
sub("<div class=\"k ru-k\" hidden>В России</div>", "<div class=\"k ru-k\" hidden>В России (российские данные)</div>");
sub("    RELATED = EMBED ?", "    SCOPE = EMBED ? (EMBED.scope || {}) : await readText('scope.json').then((t) => JSON.parse(t), () => ({}));\n    RELATED = EMBED ?");
sub(".rel a{color:var(--brand-1)}", ".rel a{color:var(--brand-1)}\n.scope{font-size:13px;color:var(--t2);margin:0 0 10px;padding:6px 10px;border-left:3px solid var(--yellow-1);background:var(--yellow-soft);border-radius:4px}");

// строка «Цена в России (ориентир)» под «Затратами»
sub("title:m[2].trim(), ru:'', cost:''", "title:m[2].trim(), price:'', ru:'', cost:''");
sub("else if ((m = /^- Примечания:\\s*(.*)$/.exec(line))) entry.note = m[1];", "else if ((m = /^- Примечания:\\s*(.*)$/.exec(line))) entry.note = m[1];\n      else if ((m = /^- Цена в России[^:]*:\\s*(.*)$/.exec(line))) entry.price = m[1];");
sub("else if ((m = /^- Цена в России[^:]*:\\s*(.*)$/.exec(line))) entry.price = m[1];", "else if ((m = /^- Цена в России[^:]*:\\s*(.*)$/.exec(line))) entry.price = m[1];\n      else if ((m = /^- Источники цен \\(Россия\\):\\s*(.*)$/.exec(line))) entry.src += ' ; Цены в России: ' + m[1];");
sub('<div class="k">Затраты</div><div class="v cost"></div>', '<div class="k">Затраты</div><div class="v cost"></div>\n          <div class="k price-k" hidden>Цена в России (ориентир)</div><div class="v price" hidden></div>');
sub("f:{scope:c.querySelector('.scope'),", "f:{price:c.querySelector('.price'), priceK:c.querySelector('.price-k'), scope:c.querySelector('.scope'),");
sub("  renderText(f.cost, e.cost, terms);\n", "  renderText(f.cost, e.cost, terms);\n  f.price.hidden = f.priceK.hidden = !e.price;\n  if (e.price) renderText(f.price, e.price, terms);\n");

// GEO: видимый статический блок «О книге», частые вопросы и ссылки на все разделы. Его видят краулеры без JavaScript;
// вопросы совпадают с разметкой FAQPage (tools/ru/geo-data.mjs)
{
  const st = stats();
  const e2 = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const faqHtml = faq(st).map((x) => '<h3>' + e2(x.q) + '</h3><p>' + e2(x.a) + '</p>').join('');
  const secHtml = st.secs.map((x) => '<li><a href="s/' + x.n + '/">' + x.n + '. ' + e2(x.title) + '</a> (пунктов: ' + x.entries.length + ')</li>').join('');
  const block = '<section class="about-static" aria-label="О книге">\n      <h2>О книге</h2>\n      <p>«Руководство по жизни с высокой отдачей» — неофициальный русский перевод китайской книги «高性价比人生指南»: ' + st.entries + ' пунктов в ' + st.sections + ' разделах о здоровье, деньгах, праве, работе, семье и безопасности. Подробнее: <a href="about/">о проекте и методе</a>, <a href="contents/">оглавление</a>, <a href="llms.txt">llms.txt</a>.</p>\n      <details><summary>Частые вопросы</summary>' + faqHtml + '</details>\n      <details><summary>Разделы книги (ссылки работают без JavaScript)</summary><ol>' + secHtml + '</ol></details>\n    </section>\n      ';
  sub('<details class="gloss" id="gloss">', block + '<details class="gloss" id="gloss">');
  sub('.rel a{color:var(--brand-1)}', '.rel a{color:var(--brand-1)}\n.about-static{margin:20px 0}.about-static h2{font-size:18px;margin:0 0 8px}.about-static h3{font-size:15px;margin:14px 0 4px}.about-static details{margin:8px 0}.about-static summary{cursor:pointer;font-weight:600}.about-static ol{columns:2;padding-left:20px}@media(max-width:700px){.about-static ol{columns:1}}');
  sub('<div class="nav-r">', '<div class="nav-r">\n      <a class="nav-text" href="author/">Автор</a>');
  sub('.icon-btn:hover{', '.nav-text{font-size:14px;color:var(--t2);padding:0 10px;line-height:36px;border-radius:8px;white-space:nowrap}.nav-text:hover{background:var(--bg-soft);color:var(--t1);text-decoration:none}\n.icon-btn:hover{');
  sub('<meta name="viewport"', '<link rel="alternate" type="application/atom+xml" title="Руководство по жизни с высокой отдачей" href="feed.xml">\n<meta name="viewport"');
}

// путь к оглавлению для читателей без JavaScript и для поисковиков
sub('<p>Для фильтров на этой странице нужен JavaScript. Текст можно читать и без него:', '<p>Для фильтров на этой странице нужен JavaScript. Текст можно читать и без него: <a href="contents/">оглавление со ссылками на все разделы и пункты</a>,');
sub('при копировании и переработке укажите авторов и ссылку на <a href="https://github.com/eternity4719/HowToLiveBetter">оригинал</a>.</div>', 'при копировании и переработке укажите авторов и ссылку на <a href="https://github.com/eternity4719/HowToLiveBetter">оригинал</a>. <a href="contents/">Оглавление без JavaScript</a>.</div>');

// Country-aware fields use the same model as static pages and offline output.
const countryModel = readFileSync('tools/ru/country-fields.mjs', 'utf8').replace(/^export /gm, '');
sub('function renderCard(card, terms, key){', countryModel + '\n' + snip('country-card.js') + '\nfunction renderCard(card, terms, key){');
sub('if ((m = /^- Затраты:\\s*(.*)$/.exec(line))) entry.cost = m[1];', 'if (readCountryField(entry, line)) continue;\n      else if ((m = /^- Затраты:\\s*(.*)$/.exec(line))) entry.cost = m[1];');
sub('entry.src = m[1];', 'entry.src = m[1]; entry.srcOriginal = m[1];');
// Braces matter: retain the else-if parser chain.
sub('else if ((m = /^- Источники:\\s*(.*)$/.exec(line))) entry.src = m[1]; entry.srcOriginal = m[1];', 'else if ((m = /^- Источники:\\s*(.*)$/.exec(line))) { entry.src = m[1]; entry.srcOriginal = m[1]; }');
sub("else if ((m = /^- Источники \\(Россия\\):\\s*(.*)$/.exec(line))) entry.src += ' ; Россия: ' + m[1];", "else if ((m = /^- Источники \\(Россия\\):\\s*(.*)$/.exec(line))) { entry.srcRussia = m[1]; entry.src += ' ; Россия: ' + m[1]; }");
sub("else if ((m = /^- Источники цен \\(Россия\\):\\s*(.*)$/.exec(line))) entry.src += ' ; Цены в России: ' + m[1];", "else if ((m = /^- Источники цен \\(Россия\\):\\s*(.*)$/.exec(line))) { entry.srcPrices = m[1]; entry.src += ' ; Цены в России: ' + m[1]; }");
sub('<div class="k ru-k" hidden>В России (российские данные)</div><div class="v ru" hidden></div>', '');
sub('<p class="human"></p>', '<div class="human"></div>');
sub('  renderText(f.cost, e.cost, terms);', "  const sc = SCOPE[e.sec + '-' + e.n]; const view = countryView(e, sc);\n  renderCountryField(f.cost, 'cost', e, view, terms);");
sub('  f.human.hidden = !e.human;\n  if (e.human) renderText(f.human, e.human, terms);', "  renderCountryField(f.human, 'human', e, view, terms);");
sub('  renderText(f.gain, e.gain, terms);', "  renderCountryField(f.gain, 'gain', e, view, terms);");
re(/  \{ const sc = SCOPE\[e.sec \+ '-' \+ e.n\]; const on = !!sc[\s\S]*?if \(e.ru\) renderText\(f.ru, e.ru, terms\);/, "  f.scope.hidden = !view.notice;\n  f.scope.textContent = view.notice;");
sub('  renderText(f.note, e.note, terms);', "  renderCountryField(f.note, 'note', e, view, terms);");
sub('const nSrc = renderSrc(f.src, e.src, terms);', 'const nSrc = renderCountrySources(f.src, e, sc, terms);');
sub("'Есть российские данные'", "'Российские данные: частично'");
sub('`Доказательность ${e.grade}`', '`Доказательность ${e.grade} · исходная версия`');
sub("'Выгодность: ' +", "'Выгодность исходной версии: ' +");
sub("  const inBody = (e.title+e.human+e.cost+e.gain+e.note).toLowerCase();", "  const inBody = (e.title+e.human+e.cost+e.gain+e.note+e.ru).toLowerCase();");
sub('p.textContent = e.human;', "p.textContent = countrySummary(e, SCOPE[e.sec + '-' + e.n]);");
sub('    CUR_SEC = s.n;\n    for (const para of s.intro){', "    const countryIntro = document.createElement('p'); countryIntro.className = 'scope'; countryIntro.textContent = COUNTRY_GUIDE + ' Российские данные есть у ' + s.entries.filter(e => e.ru).length + ' из ' + s.entries.length + ' пунктов раздела. Введение ниже относится к исходной версии.'; block.append(countryIntro);\n    CUR_SEC = s.n;\n    for (const para of s.intro){");
sub('a.title = e.title;', "a.title = e.title + ' · ' + countryStatus(e, SCOPE[e.sec + '-' + e.n]);");
sub("ru:c.querySelector('.ru'), ruK:c.querySelector('.ru-k'), ", '');
sub('.scope{font-size:13px', '.country-part + .country-part{margin-top:10px}.source-country{font-weight:600;margin:12px 0 6px}\n.scope{font-size:13px');
re(/Законы, органы, телефоны и выплаты в тексте китайские \(КНР\)\. Там, где проверена российская версия, под пунктом есть строка «В России»\. Где её нет, российская проверка ещё не проведена\./, COUNTRY_GUIDE);
sub('<div class="gt">Выгодность <small>', '<div class="gt">Выгодность исходной версии <small>');
sub('<div class="gt">Доказательность <small>', '<div class="gt">Доказательность исходной версии <small>');
sub('<p>Тексты и теги берутся', '<p>Фильтры затрат и оценки относятся к исходной версии. Российские условия смотрите в полях с подписью «Россия».</p>\n    <p>Тексты и теги берутся');

sub('<div class="body"></div></details>`;', '<div class="body"></div></details>\n        <p class="suggest"><a class="sg" rel="noopener">Предложить правку</a><span> — ошибка, устаревший закон или лучший источник</span></p>`;');
sub('      const card = {e, el:c,', "      const sgl = c.querySelector('.sg'); if (sgl) sgl.href = suggestHref(e);\n      const card = {e, el:c,");
sub('function renderCard(card, terms, key){', "function suggestHref(e){\n  const link = location.origin + location.pathname + '#e-' + e.sec + '-' + e.n;\n  return 'mailto:max0r@yandex.ru?subject=HowToLiveBetter&body=' + encodeURIComponent('Пункт: раздел ' + e.sec + ', пункт ' + e.n + '. ' + e.title + '\\n' + link + '\\n\\nЧто исправить и на какой источник опереться:\\n');\n}\nfunction renderCard(card, terms, key){");
sub('.src summary .cnt{', '.suggest{margin:10px 0 0;font-size:13px;color:var(--t3)}.suggest a{font-weight:500}\n.src summary .cnt{');

// ---- поиск и навигация: основы слов, синонимы, фразы, минус-слова, номер пункта, список разделов, режим «Кратко», печать ----
const searchCore = readFileSync('tools/ru/spa/search-core.js', 'utf8');
sub("e.src, e.grade].join('\\n')", "e.src, e.grade, e.price, e.srcRussia].filter(Boolean).join('\\n')");
sub(".replace(/\\\\([*_])/g, '$1').toLowerCase();", ".replace(/\\\\([*_])/g, '$1').toLowerCase().replace(/ё/g, 'е') + ' §' + e.sec + '-' + e.n + ' ';");
sub('function apply(){', searchCore + '\nfunction apply(){\n  fillJump();');
sub("const terms = state.q.toLowerCase().split(/\\s+/).filter(Boolean);\n  const key = terms.join(' ');", "const QRY = parseQuery(state.q), terms = QRY.hl;\n  const relax = RELAX; RELAX = false;\n  const key = terms.join(' ') + (relax ? '|any' : '');");
sub("if (ok && terms.length && !terms.every(t => e.hay.includes(t))) ok = false;", "if (ok && !matchQuery(e.hay, QRY, relax)) ok = false;");
sub("  for (const b of BLOCKS){ const n = perSec[b.n]||0;", "  if (!shown && !relax && QRY.pos.length > 1) { RELAX = true; apply(); return; }\n  document.getElementById('relaxed').hidden = !(relax && shown);\n  for (const b of BLOCKS){ const n = perSec[b.n]||0;");
sub('<div class="empty" id="empty" hidden>', '<p class="relaxed" id="relaxed" hidden>Точных совпадений нет. Показаны пункты, где есть хотя бы одно из слов запроса.</p>\n      <div class="empty" id="empty" hidden>');
sub("const lower = s.toLowerCase(); let i = 0;", "const lower = s.toLowerCase().replace(/ё/g, 'е'); let i = 0;");
sub("const mk = document.createElement('mark'); mk.textContent = s.slice(best, best+bl); el.appendChild(mk);\n    i = best + bl;", "let end = best + bl; while (end < s.length && /[\\p{L}\\p{N}]/u.test(s[end])) end++;\n    const mk = document.createElement('mark'); mk.textContent = s.slice(best, end); el.appendChild(mk);\n    i = end;");
sub("terms.some(t => e.src.toLowerCase().includes(t))", "terms.some(t => e.src.toLowerCase().replace(/ё/g, 'е').includes(t))");
sub("const inBody = (e.title+e.human+e.cost+e.gain+e.note+e.ru).toLowerCase();", "const inBody = (e.title+e.human+e.cost+e.gain+e.note+e.ru).toLowerCase().replace(/ё/g, 'е');");
sub('function wire(){', 'function wire(){\n  wirePlain();');
sub('<a class="nav-text" href="author/">Автор</a>', '<select id="jump" class="nav-text jump" aria-label="Перейти к разделу"><option value="">Разделы…</option></select><button type="button" class="nav-text" id="plain-toggle" aria-pressed="false" title="В карточках оставить только блок «Простыми словами»">Кратко</button><a class="nav-text" href="author/">Автор</a>');
sub('.icon-btn:hover{', '.nav-text.jump{max-width:150px;height:32px;line-height:normal;padding:0 6px;border:1px solid var(--divider);background:transparent;color:var(--t2);font:inherit;font-size:13px}\nbutton.nav-text{border:0;background:none;cursor:pointer;font-family:inherit}\n#plain-toggle[aria-pressed="true"]{background:var(--bg-soft);color:var(--t1);font-weight:600}\nbody.plain-only .rows,body.plain-only .src,body.plain-only .suggest,body.plain-only .scope{display:none}\n.relaxed{margin:12px 0;padding:8px 12px;border-left:3px solid var(--brand-1);background:var(--bg-soft);font-size:14px;color:var(--t2)}\n@media(max-width:700px){.nav-text.jump{display:none}}\n@media print{.nav,.sidebar,.backdrop,.foot,.pop,.suggest,.anchor,.relaxed,.empty,.status{display:none!important}body{background:#fff;color:#000}.card{break-inside:avoid;box-shadow:none;border:1px solid #bbb;margin:0 0 10px}.sec-block{break-before:auto}a{color:inherit;text-decoration:none}mark{background:none;color:inherit}}\n.icon-btn:hover{');

// ---- подсказки под строкой поиска и кнопка «Печать» ----
const searchUi = readFileSync('tools/ru/spa/search-ui.js', 'utf8');
sub('function apply(){', searchUi + '\nfunction apply(){');
sub('function wire(){\n  wirePlain();', 'function wire(){\n  wirePlain();\n  wireSuggest();\n  const pb = document.getElementById("print-btn"); if (pb) pb.addEventListener("click", () => window.print());');
sub('<div class="backdrop" id="backdrop"></div>', '<div class="sug" id="sug" role="listbox" aria-label="Подсказки поиска" hidden></div>\n<div class="backdrop" id="backdrop"></div>');
sub('<button class="switch" id="theme"', '<button type="button" class="icon-btn" id="print-btn" title="Распечатать то, что сейчас показано на странице" aria-label="Печать"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 3h10v4H7zM5 8h14a3 3 0 0 1 3 3v6h-4v4H6v-4H2v-6a3 3 0 0 1 3-3zm3 7v4h8v-4zm10-3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg></button>\n      <button class="switch" id="theme"');
sub('.icon-btn:hover{', '.nav-in{position:relative}\n.sug{position:absolute;z-index:60;background:var(--bg);border:1px solid var(--divider);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);max-height:70vh;overflow:auto;font-size:14px}\n.sug[hidden]{display:none}\n.sug-words{padding:8px 12px;border-bottom:1px solid var(--divider);color:var(--t3);display:flex;flex-wrap:wrap;gap:6px;align-items:center}\n.sug-word{border:1px solid var(--divider);background:var(--bg-soft);color:var(--t1);border-radius:999px;padding:2px 10px;font:inherit;font-size:13px;cursor:pointer}\n.sug-word:hover{border-color:var(--brand-1);color:var(--brand-1)}\n.sug-head,.sug-more,.sug-none{padding:8px 12px;color:var(--t3);font-size:13px}\n.sug-item{display:block;padding:8px 12px;border-top:1px solid var(--divider);color:var(--t1);text-decoration:none}\n.sug-item b{display:block;font-weight:600;line-height:1.35}\n.sug-item span{display:block;color:var(--t2);font-size:13px;line-height:1.45;margin-top:2px}\n.sug-item:hover,.sug-item.on{background:var(--bg-soft);text-decoration:none}\n.sug mark{background:rgba(255,200,0,.35);color:inherit;border-radius:2px}\n@media print{.sug{display:none!important}}\n.icon-btn:hover{');

s = s.replace(/^[\t ]+$/gm, '');
writeFileSync('ru/index.html', s);
const left = s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[一-鿿]/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l) && !/\/\/.*[一-鿿]/.test(l.replace(/'[^']*'/g, '')) );
console.error(`ru/index.html записан, ${s.length} знаков. Строк с китайским вне комментариев: ${left.length}`);
if (process.argv.includes('--verbose')) for (const [i, l] of left.slice(0, 40)) console.error(`  ${i}: ${l.trim().slice(0, 160)}`);
