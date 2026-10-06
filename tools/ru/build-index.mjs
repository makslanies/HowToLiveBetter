// Собирает ru/index.html из index.html: русский интерфейс и разбор русских полей.
// Ключи логики (大/中/小, 极高/高/一般, 钱/时间/毅力 в теге стоимости) остаются китайскими, они лежат в данных;
// переводятся подписи, названия полей, сноски «раздел N, пункт M». Аналитику, рекламу и донаты вырезает.
//   node tools/ru/build-index.mjs
import { readFileSync, writeFileSync } from 'node:fs';

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

writeFileSync('ru/index.html', s);
const left = s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[一-鿿]/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l) && !/\/\/.*[一-鿿]/.test(l.replace(/'[^']*'/g, '')) );
console.error(`ru/index.html записан, ${s.length} знаков. Строк с китайским вне комментариев: ${left.length}`);
if (process.argv.includes('--verbose')) for (const [i, l] of left.slice(0, 40)) console.error(`  ${i}: ${l.trim().slice(0, 160)}`);
