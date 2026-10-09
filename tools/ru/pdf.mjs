// PDF-версии для скачивания: вся книга, каждый раздел и каждый пункт. Печатает страницы сайта в PDF через Chrome без головы,
// управляя им по протоколу DevTools (встроенный в Node WebSocket, без зависимостей).
//   node tools/ru/pdf.mjs [--out dist-ru] [--site-url https://…/]   (после tools/ru/build.mjs, нужен dist-ru/pdf-tmp/articles.json)
// Chrome ищется в переменной CHROME, в стандартных местах macOS и в PATH (google-chrome, chromium).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TITLE } from './geo-data.mjs';

export function findChrome() {
  const cand = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  for (const c of cand) if (existsSync(c)) return c;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [n], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startChrome(chrome) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await startChromeOnce(chrome); } catch (e) { last = e; console.error(`  Chrome: попытка ${attempt} не удалась (${e.message})`); await sleep(2000 * attempt); }
  }
  throw last;
}
async function startChromeOnce(chrome) {
  const dir = mkdtempSync(join(tmpdir(), 'hltb-chrome-'));
  // на сервере сборки Chrome стартует медленно: ждём порт до 40 с и отключаем всё лишнее (общая память /dev/shm там мала)
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 400 && !existsSync(join(dir, 'DevToolsActivePort')); i++) await sleep(100);
  if (!existsSync(join(dir, 'DevToolsActivePort'))) { proc.kill(); throw new Error('Chrome не открыл порт отладки'); }
  const port = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  let target;
  for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* ждём */ } if (!target) await sleep(100); }
  if (!target) { proc.kill(); throw new Error('нет вкладки Chrome'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('не удалось подключиться к Chrome')); });
  let id = 0, onLoad = null; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Page.loadEventFired' && onLoad) { const f = onLoad; onLoad = null; f(); }
  };
  const send = (method, params = {}, ms = 180000) => new Promise((res, rej) => {
    const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error(`${method}: тайм-аут`)); }, ms);
    pending.set(i, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable');
  const footer = '<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>';
  return {
    async print(url, file) {
      const loaded = new Promise((r) => { onLoad = r; });
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(60000)]);
      const r = await send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.55, marginBottom: 0.7, marginLeft: 0.6, marginRight: 0.6, printBackground: false, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer, generateDocumentOutline: true, generateTaggedPDF: true }, 600000);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    close() { try { ws.close(); } catch { /* уже закрыт */ } proc.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* временная папка */ } },
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function composeHtml({ sections, base, cover, data, styleHref }) {
  const body = sections.map((n) => {
    const s = data.secs[n];
    const arts = (data.order[n] || []).map((k) => (data.arts[k] || '').replace(/<h1>/g, '<h2>').replace(/<\/h1>/g, '</h2>')).join('\n');
    return `<section class="sec"><h1>${n}. ${esc(s.title)}</h1>\n${s.intro}\n${arts}</section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(cover.title)}</title><link rel="stylesheet" href="${styleHref}">
<style>main.book{max-width:none;padding:0}.cover{padding:60px 0 30px}.cover h1{font-size:30px}.sec{break-before:page}.sec:first-of-type{break-before:auto}article{margin:0 0 22px;break-inside:auto}h2{break-after:avoid}.toc li{margin:2px 0}</style></head>
<body><main class="book">${cover.html}${body}</main></body></html>`;
  return html.replace(/href="(?:\.\.\/)+/g, `href="${base}`);   // ссылки между пунктами ведут на сайт
}

export async function buildPdf({ out = 'dist-ru', siteUrl = '' } = {}) {
  const chrome = findChrome();
  if (!chrome) { console.error('PDF пропущены: Chrome не найден (задайте CHROME)'); return { made: 0, failed: 0 }; }
  const tmp = join(out, 'pdf-tmp'), jsonFile = join(tmp, 'articles.json');
  if (!existsSync(jsonFile)) throw new Error(`нет ${jsonFile}: сначала соберите статический сайт`);
  const data = JSON.parse(readFileSync(jsonFile, 'utf8'));
  const base = siteUrl || '../site/';
  const nums = Object.keys(data.secs).map(Number).sort((a, b) => a - b);
  const day = new Date().toISOString().slice(0, 10).split('-').reverse().join('.');
  const credit = `Неофициальный русский перевод книги «高性价比人生指南». Автор русской версии: Максим Ланиес, max0r@yandex.ru. Текст: CC BY 4.0. ${siteUrl ? 'Сайт: ' + siteUrl + '. ' : ''}Версия от ${day}.`;
  const toc = `<h2>Оглавление</h2><ol class="toc">${nums.map((n) => `<li>${n}. ${esc(data.secs[n].title)} (пунктов: ${(data.order[n] || []).length})</li>`).join('')}</ol>`;
  mkdirSync(join(out, 'site/pdf/p'), { recursive: true }); mkdirSync(join(out, 'site/pdf/s'), { recursive: true });
  const jobs = [];
  const bookHtml = join(tmp, 'book.html');
  writeFileSync(bookHtml, composeHtml({ sections: nums, base, data, styleHref: '../site/assets/page.css', cover: { title: TITLE, html: `<section class="cover"><h1>${esc(TITLE)}</h1><p>${esc(credit)}</p><p class="scope">Китайские условия и российские данные разделены внутри полей. Российская сверка частичная: непроверенные поля отмечены отдельно. Вычитки врачами и юристами не было.</p>${toc}</section>` } }));
  jobs.push([bookHtml, join(out, 'site/pdf/book.pdf')]);
  for (const n of nums) {
    const f = join(tmp, `s-${n}.html`);
    writeFileSync(f, composeHtml({ sections: [n], base, data, styleHref: '../site/assets/page.css', cover: { title: `${n}. ${data.secs[n].title} · ${TITLE}`, html: `<p class="note">${esc(TITLE)}. ${esc(credit)}</p>` } }));
    jobs.push([f, join(out, `site/pdf/s/${n}.pdf`)]);
  }
  for (const k of Object.keys(data.arts)) jobs.push([resolve(out, `site/p/${k}/index.html`), join(out, `site/pdf/p/${k}.pdf`)]);
  const b = await startChrome(chrome);
  let made = 0, failed = 0; const t0 = Date.now();
  try {
    for (const [src, dst] of jobs) {
      try { await b.print('file://' + resolve(src), dst); made++; } catch (e) { failed++; console.error(`  ${dst}: ${e.message}`); }
      if (made % 100 === 0 && made) console.error(`  готово ${made} из ${jobs.length} за ${Math.round((Date.now() - t0) / 1000)} с`);
    }
  } finally { b.close(); }
  rmSync(tmp, { recursive: true, force: true });
  console.error(`PDF: создано ${made}, не удалось ${failed}`);
  return { made, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const o = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const r = await buildPdf({ out: o('out', 'dist-ru'), siteUrl: o('site-url', '') });
  process.exit(r.failed ? 1 : 0);
}
