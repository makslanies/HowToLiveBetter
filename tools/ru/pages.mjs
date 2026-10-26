// Статические страницы для поисковиков и обычных ссылок: оглавление, страница каждого раздела и каждого пункта,
// ссылки между пунктами (из текста «раздел N, пункт M»), блок «Смотрите также», sitemap.xml.
// Вызывается из build.mjs; можно запустить отдельно: node tools/ru/pages.mjs --out dist-ru/site --site https://USER.github.io/REPO/
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseBook, keyOf, LENS, LABEL } from './parse.mjs';
import { COUNTRY_GUIDE, countryView, countrySummary, countryStatus, sourceGroups, isRu } from './country-fields.mjs';

const TITLE = 'Руководство по жизни с высокой отдачей (高性价比人生指南)';
const UPSTREAM = 'https://github.com/eternity4719/HowToLiveBetter';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unmd = (s) => s.replace(/\\([*_])/g, '$1');

// Стили панели лайка и репоста. Общие для страниц пунктов и главной.
export const SOCIAL_CSS = `
.hltb-rail{position:absolute;top:0;bottom:0;right:calc(100% + 10px);width:48px;z-index:5}
.hltb-social{position:sticky;top:24px;z-index:5;display:flex;flex-direction:column-reverse;align-items:center;gap:10px;margin:0;padding:0;border:0;background:transparent}
.hltb-social .hltb-act{font:inherit;position:relative;width:48px;height:48px;padding:0;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--t1);cursor:pointer;display:inline-grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.16);line-height:1;transition:transform .15s ease,box-shadow .15s ease}
.hltb-social .hltb-act:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 8px 22px rgba(0,0,0,.2);border-color:var(--brand);color:var(--brand)}
.hltb-social .hltb-act.is-on{background:#e2556b;border-color:#e2556b;color:#fff}
.hltb-social .hltb-act:disabled{opacity:.55;cursor:not-allowed;transform:none}
.hltb-social .hltb-ico{width:22px;height:22px;display:block}
.hltb-social [data-count]{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--t1,#222);color:var(--bg,#fff);font-size:11px;font-variant-numeric:tabular-nums;display:inline-grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.hltb-share-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;position:relative}
.hltb-share-menu{display:none;flex-direction:column;align-items:center;gap:10px;padding:0;border:0;background:transparent;box-shadow:none}
.hltb-share-menu.is-open{display:flex}
.hltb-share-menu a,.hltb-share-menu button{width:44px;height:44px;padding:0;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--t1);display:inline-grid;place-items:center;text-decoration:none;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.15);transition:transform .15s ease,box-shadow .15s ease}
.hltb-share-menu a:hover,.hltb-share-menu button:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(0,0,0,.2)}
.hltb-share-badge{width:24px;height:24px;display:block;border-radius:0}
.hltb-social-status{position:absolute;right:58px;bottom:4px;max-width:min(220px,60vw);padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--t2);font-size:12px;line-height:1.3;box-shadow:0 6px 16px rgba(0,0,0,.14);opacity:0;pointer-events:none;transform:translateX(6px);transition:opacity .15s ease,transform .15s ease;white-space:normal}
.hltb-social-status.is-on{opacity:1;transform:none}
.hltb-social.is-offline .hltb-act{opacity:.75}
@media(max-width:899px){.hltb-rail{position:static;width:auto}.hltb-social{position:static;flex-direction:row;justify-content:flex-end;gap:8px;margin:0 0 12px;width:100%}}
@media(max-width:520px){.hltb-social{gap:8px}.hltb-social .hltb-act{width:44px;height:44px}.hltb-share-menu a,.hltb-share-menu button{width:40px;height:40px}}
@media(prefers-reduced-motion:reduce){.hltb-social .hltb-act,.hltb-share-menu a,.hltb-share-menu button,.hltb-social-status{transition:none}}
`;

const CSS = `:root{--bg:#fff;--t1:#222;--t2:#555;--line:#e2e2e3;--soft:#f6f6f7;--brand:#3451b2;--ok:#18794e;--warn:#915930;--bad:#b8272c}
@media(prefers-color-scheme:dark){:root{--bg:#1b1b1f;--t1:#e6e6e0;--t2:#a8a8a8;--line:#2e2e32;--soft:#202127;--brand:#a8b1ff;--ok:#3dd68c;--warn:#e0b070;--bad:#ff8a8a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t1);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif}
a{color:var(--brand)}header.top,footer{max-width:780px;margin:0 auto;padding:14px 20px;font-size:14px;color:var(--t2)}
header.top{border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center}.print-icon{margin-left:auto;text-decoration:none;display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid var(--line);border-radius:8px;background:none;color:var(--t2);cursor:pointer}header.top a.print-icon{margin-right:0}.pdf-icon+.print-icon{margin-left:6px}.print-icon:hover{color:var(--brand);border-color:var(--brand)}.print-icon svg{width:20px;height:20px;fill:currentColor}header.top a{margin-right:14px;text-decoration:none}
main{position:relative;max-width:780px;margin:0 auto;padding:8px 20px 40px}h1{font-size:26px;line-height:1.3;margin:.6em 0 .4em}h2{font-size:17px;margin:1.4em 0 .3em}
.crumbs{font-size:14px;color:var(--t2);margin-top:14px}.badges{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;padding:0;list-style:none}
.badge{font-size:12px;padding:2px 9px;border-radius:99px;background:var(--soft);border:1px solid var(--line);color:var(--t2)}
.badge.hi{color:var(--ok)}.badge.warn{color:var(--bad)}.human{background:var(--soft);border-left:4px solid var(--brand);padding:10px 14px;border-radius:6px}
.src ol{padding-left:22px;font-size:14px;color:var(--t2);word-break:break-word}.related ul,.list{padding-left:20px}.list li{margin:.5em 0}.list .sub{display:block;font-size:14px;color:var(--t2)}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px;padding-top:14px;border-top:1px solid var(--line);font-size:14px}
.suggest{font-size:14px;color:var(--t2);margin-top:18px}.lib{padding-left:18px}.lib li{margin:0 0 12px}.lib .sub{color:var(--t2);font-size:14px}.lib .ok{font-size:12px;color:var(--ok);border:1px solid var(--ok);border-radius:999px;padding:0 7px}.lib-nav{line-height:2;margin:10px 0}.print-btn{font:inherit;color:var(--brand);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
${SOCIAL_CSS}
@media print{header.top,.pager,.related,.suggest,main>.note,footer,.crumbs,#cookie-banner,.hltb-social{display:none!important}body{background:#fff;color:#000}a{color:inherit;text-decoration:none}}.note{font-size:14px;color:var(--t2);margin-top:24px}.scope{font-size:14px;color:var(--t2);margin:10px 0;padding:8px 12px;border-left:3px solid var(--warn);background:var(--soft);border-radius:4px}footer{border-top:1px solid var(--line);margin-top:20px}`;
const pdfOn = () => process.env.HLTB_PDF === '1';        // флаг читается при вызове: build.mjs выставляет его после загрузки модулей
const PDF_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="1.5" y="6" width="21" height="12" rx="2.5" fill="currentColor"/><text x="12" y="15.2" font-size="8.4" font-weight="800" text-anchor="middle" fill="var(--bg)" font-family="system-ui,sans-serif">PDF</text></svg>';
const CSS_V = createHash('sha1').update(CSS).digest('hex').slice(0, 8);

// Форма «Предложить правку»: адрес обработчика (Cloudflare Worker) из HLTB_FEEDBACK_URL. Пусто = остаётся mailto.
export function feedbackConfigJs() {
  const endpoint = String(process.env.HLTB_FEEDBACK_URL || '').trim();
  return `window.__HLTB_FEEDBACK__=${JSON.stringify({ endpoint })};\n`;
}
export const feedbackScripts = (root) => `<script src="${root}assets/feedback-config.js" defer></script>\n<script src="${root}assets/feedback.js" defer></script>`;

// Панель лайка и репоста: одна разметка для страниц пунктов и для главной (там её переносят за якорем).
export function socialBarHtml({ key, title, url }) {
  const icoHeart = '<svg class="hltb-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  // репост: очищенный noun_repost_5126351.svg, цвет наследуется от кнопки (currentColor)
  const icoShare = readFileSync('noun_repost_5126351.svg', 'utf8').trim().replace('<svg ', '<svg class="hltb-ico" aria-hidden="true" focusable="false" ');
  // иконки сетей: упрощённые официальные знаки (цвета брендов)
  const shareIco = (svg) => `<svg class="hltb-share-badge" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${svg}</svg>`;
  const icoVk = shareIco('<path fill="#0077FF" d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2zm3.32 14.27h-1.46c-.55 0-.72-.44-1.71-1.45-.86-.83-1.24-.94-1.45-.94-.3 0-.38.08-.38.49v1.32c0 .35-.11.56-1.04.56-1.53 0-3.23-.93-4.43-2.65-1.8-2.48-2.3-4.34-2.3-4.72 0-.21.08-.4.49-.4h1.46c.37 0 .51.17.65.56.71 2.05 1.9 3.85 2.39 3.85.18 0 .27-.09.27-.55v-2.13c-.06-.98-.57-1.06-.57-1.41 0-.17.14-.34.37-.34h2.3c.31 0 .42.17.42.54v2.88c0 .31.14.42.23.42.18 0 .33-.11.67-.45 1.04-1.17 1.78-2.97 1.78-2.97.1-.21.27-.4.64-.4h1.46c.44 0 .53.22.44.54-.18.86-1.95 3.32-1.95 3.32-.16.26-.22.37 0 .66.16.22.7.69 1.06 1.11.66.76 1.16 1.4 1.3 1.84.14.44-.08.66-.5.66z"/>');
  const icoOk = shareIco('<path fill="#EE8208" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 6.15A3.35 3.35 0 1 1 8.65 9.5 3.35 3.35 0 0 1 12 6.15zm0 11.7a8.16 8.16 0 0 1-5.2-1.87.9.9 0 0 1 1.14-1.39 6.36 6.36 0 0 0 8.12 0 .9.9 0 1 1 1.14 1.39A8.16 8.16 0 0 1 12 17.85zm4.33-4.55a.9.9 0 0 1-1.27.05 4.4 4.4 0 0 0-6.12 0 .9.9 0 1 1-1.22-1.32 6.2 6.2 0 0 1 8.56 0 .9.9 0 0 1 .05 1.27z"/>');
  const icoTg = shareIco('<path fill="#26A5E4" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.96 6.502-1.358 8.627-.168.9-.5 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>');
  const icoMax = shareIco('<rect width="24" height="24" rx="6" fill="#4C48EE"/><path fill="#fff" d="M6.2 16.8V7.2h2.1l2.55 5.55h.1L13.5 7.2h2.1v9.6h-1.85v-5.7h-.1l-2.35 5.25h-1.3L7.65 11.1h-.1v5.7H6.2zm9.55 0-2.05-3.15h1.95l1.15 1.8 1.15-1.8h1.9L18 13.65 20.05 16.8h-2.05l-1.1-1.7-1.1 1.7h-2.05z"/>');
  const icoWa = shareIco('<path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.79 14.24c-.24.68-1.41 1.25-1.95 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.93-4.36-.15-.19-1.17-1.56-1.17-2.97 0-1.42.74-2.11 1-2.4.26-.28.57-.35.76-.35h.55c.17 0 .4-.07.63.48.24.57.81 1.98.88 2.12.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.3.37-.43.5-.15.14-.3.29-.13.57.17.28.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.29.14.46.12.63-.07.17-.19.73-.85.93-1.14.19-.29.39-.24.65-.14.26.1 1.67.79 1.96.93.29.14.48.21.55.33.07.12.07.68-.17 1.36z"/>');
  const icoCopy = shareIco('<rect x="1" y="1" width="22" height="22" rx="5" fill="#6b7280"/><path fill="#fff" d="M9 8h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm-3 3H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1H9a3 3 0 0 1-3-3v-5z"/>');
  return `<aside class="hltb-social" data-key="${esc(key)}" data-title="${esc(title)}" data-url="${esc(url)}" aria-label="Лайк и репост">
<span class="hltb-social-status" data-status aria-live="polite"></span>
<button type="button" class="hltb-act" data-act="like" aria-label="Нравится" aria-pressed="false" title="Нравится">${icoHeart}<span data-count="likes">0</span></button>
<div class="hltb-share-wrap">
<div class="hltb-share-menu" data-share-menu hidden role="menu" aria-label="Поделиться">
<a href="#" role="menuitem" data-share="vk" rel="noopener noreferrer" target="_blank" aria-label="ВКонтакте" title="ВКонтакте">${icoVk}</a>
<a href="#" role="menuitem" data-share="ok" rel="noopener noreferrer" target="_blank" aria-label="Одноклассники" title="Одноклассники">${icoOk}</a>
<a href="#" role="menuitem" data-share="tg" rel="noopener noreferrer" target="_blank" aria-label="Telegram" title="Telegram">${icoTg}</a>
<a href="#" role="menuitem" data-share="max" rel="noopener noreferrer" target="_blank" aria-label="Max" title="Max">${icoMax}</a>
<a href="#" role="menuitem" data-share="wa" rel="noopener noreferrer" target="_blank" aria-label="WhatsApp" title="WhatsApp">${icoWa}</a>
<button type="button" role="menuitem" data-share="copy" aria-label="Скопировать ссылку" title="Скопировать ссылку">${icoCopy}</button>
</div>
<button type="button" class="hltb-act" data-act="share" aria-label="Поделиться" aria-expanded="false" aria-haspopup="menu" title="Поделиться">${icoShare}<span data-count="reposts">0</span></button>
</div>
</aside>`;
}

function socialConfigJs() {
  const raw = process.env.HLTB_SOCIAL_URL;
  if (raw === 'off' || raw === '0' || raw === 'false') {
    return 'window.__HLTB_SOCIAL__={enabled:false};\n';
  }
  // пустой base = тот же origin (локально: social-server --static; в проде: nginx → /v1/)
  const base = raw === undefined || raw === null ? '' : String(raw).trim();
  return `window.__HLTB_SOCIAL__=${JSON.stringify({ enabled: true, base })};\n`;
}

// ---------- текст ----------
const NUMS = '(?:с\\s+)?\\d+(?:\\s*(?:,|и)\\s*\\d+)*(?:\\s*(?:–|—|-|по)\\s*\\d+)?';
const XREF = new RegExp(`(раздел(?:а|е|у|ом)?\\s+\\d+,\\s*пункт(?:а|е|у|ы|ов)?\\s+${NUMS})|(пункт(?:а|е|у|ы|ов)?\\s+${NUMS}\\s+раздел(?:а|е|у|ом)?\\s+\\d+)|(раздел(?:а|е|у|ом|ы|ов)?\\s+\\d+(?:\\s*(?:,|и)\\s*\\d+)*)|(пункт(?:а|е|у|ы|ов)?\\s+${NUMS})`, 'gi');

function makeCtx(secs, root) {
  const have = new Set(secs.flatMap((s) => s.entries.map(keyOf)));
  const haveSec = new Set(secs.map((s) => String(s.n)));
  return { have, haveSec, root };
}

// Текст без разметки: ссылки на пункты внутри. bare — «пункт N» без раздела считается пунктом этого раздела (во введениях).
function linkRefs(text, c, { sec, bare }) {
  let out = '', last = 0, links = 0;
  for (const m of text.matchAll(XREF)) {
    const [whole, a, b, cc, d] = m;
    let html = null;
    const linkNums = (str, s) => str.replace(/\d+/g, (n) => (c.have.has(`${s}-${n}`) ? (links++, `<a href="${c.root}p/${s}-${n}/">${n}</a>`) : n));
    if (a) { const i = a.search(/пункт/i); const s = /\d+/.exec(a)[0]; html = esc(a.slice(0, i)) + linkNums(esc(a.slice(i)), s); }
    else if (b) { const i = b.search(/раздел/i); const s = /\d+/.exec(b.slice(i))[0]; html = linkNums(esc(b.slice(0, i)), s) + esc(b.slice(i)); }
    else if (cc) html = esc(cc).replace(/\d+/g, (n) => (c.haveSec.has(n) ? (links++, `<a href="${c.root}s/${n}/">${n}</a>`) : n));
    else if (d && sec && (bare || /^\s*\(/.test(text.slice(m.index + whole.length)))) html = linkNums(esc(d), sec);   // «пункт 10 (пояснение)» — ссылка на пункт того же раздела; голый «пункт N» без скобки в тексте не трогаем: это может быть пункт закона
    if (html == null || !html.includes('<a ')) continue;
    out += esc(text.slice(last, m.index)) + html; last = m.index + whole.length;
  }
  return { html: out + esc(text.slice(last)), links };
}

const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>()«»]+)|\*\*((?:\\\*|[^*\n])+)\*\*/g;
function inline(text, c, opts = {}) {
  text = unmd(text);
  let out = '', last = 0, links = 0;
  const plain = (s) => { const r = linkRefs(s, c, opts); links += r.links; return r.html; };
  const ext = (u, label) => `<a href="${esc(u)}" rel="nofollow noopener" target="_blank">${esc(label)}</a>`;
  for (const m of text.matchAll(INLINE)) {
    out += plain(text.slice(last, m.index)); last = m.index + m[0].length;
    if (m[5] !== undefined) { const r = inline(m[5], c, opts); links += r.links; out += `<strong>${r.html}</strong>`; }
    else if (m[1] !== undefined) out += ext(m[2], m[1]);
    else { let u = m[3] || m[4]; let tail = ''; while (/[.,;:]$/.test(u)) { tail = u.slice(-1) + tail; u = u.slice(0, -1); } const lab = u.replace(/^https?:\/\//, '').replace(/\/$/, ''); out += ext(u, lab.length > 70 ? lab.slice(0, 67) + '…' : lab) + esc(tail); }
  }
  out += plain(text.slice(last));
  return { html: out, links };
}

function splitSrc(text) {
  const parts = []; let buf = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('「『（'.includes(ch)) depth++; if ('」』）'.includes(ch)) depth = Math.max(0, depth - 1);
    const semi = ch === '；' || (ch === ';' && /\s/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || ''));
    if (semi && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((x) => x.trim()).filter(Boolean);
}

const firstSentence = (s, max = 160) => { const t = unmd(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); const m = /^(.{40,}?[.!?…])(\s|$)/.exec(t); const r = m ? m[1] : t; return r.length > max ? r.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : r; };

// ---------- страницы ----------
export const suggestHref = (e, link) => `mailto:max0r@yandex.ru?subject=HowToLiveBetter&body=${encodeURIComponent(`Пункт: раздел ${e.sec}, пункт ${e.n}. ${e.title}\n${link || ''}\n\nЧто исправить и на какой источник опереться:\n`)}`;

const GTAG_BOOT = readFileSync('tools/ru/spa/gtag-boot.html', 'utf8').trim() + '\n';

export const ogImageUrl = (site) => (site ? `${String(site).replace(/\/?$/, '/')}assets/og.png` : '');

export function page({ root, title, desc, canonical, body, ld, pdf, image, scripts = '' }) {
  const pdfLink = pdfOn() ? `<a class="print-icon pdf-icon" rel="nofollow" href="${pdf ? pdf.href : root + 'pdf/book.pdf'}" download title="${pdf ? pdf.title : 'Скачать всю книгу в PDF'}" aria-label="Скачать PDF">${PDF_ICON}</a>` : '';
  const ogImage = image || '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
<link rel="stylesheet" href="${root}assets/page.css?v=${CSS_V}">
<link rel="alternate" type="application/atom+xml" title="${TITLE}" href="${root}feed.xml">
<meta property="article:modified_time" content="${new Date().toISOString().slice(0, 10)}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
${GTAG_BOOT}</head>
<body>
<header class="top"><a href="${root}">Поиск и фильтры</a><a href="${root}contents/">Оглавление</a><a href="${root}library/">Библиотека</a><a href="${root}about/">О проекте</a><a href="${root}author/">Автор</a><a href="${UPSTREAM}" rel="nofollow noopener" target="_blank">Китайский оригинал</a>${pdfLink}<button type="button" class="print-icon" onclick="window.print()" aria-label="Распечатать страницу" title="Распечатать страницу"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 3h10v4H7zM5 8h14a3 3 0 0 1 3 3v6h-4v4H6v-4H2v-6a3 3 0 0 1 3-3zm3 7v4h8v-4zm10-3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg></button></header>
<main>
${body}
</main>
<footer>Обновлено: <time datetime="${new Date().toISOString().slice(0, 10)}">${new Date().toISOString().slice(0, 10).split('-').reverse().join('.')}</time>. Неофициальный русский перевод книги «高性价比人生指南» по лицензии <a href="https://creativecommons.org/licenses/by/4.0/deed.ru" rel="noopener">CC BY 4.0</a>. ${esc(COUNTRY_GUIDE)}<br><a href="${root}privacy/">Политика конфиденциальности</a> · <a href="#cookie-settings" data-cookie-settings>Настройки cookie</a></footer>
<script src="${root}assets/analytics.js" defer></script>
${scripts}
</body>
</html>
`;
}

// Пометка «что в пункте китайское, что российское» (ru/scope.json, классификация tools/ru/classify.mjs)
const scopeBadge = (sc, hasRu) => (!sc ? '' : `<li class="badge ${sc.t === 'u' || sc.t === 'r' ? 'hi' : 'warn'}">${sc.t === 'c' ? 'Нормы Китая (КНР)' : sc.t === 'm' ? 'Частично Китай' : sc.t === 'r' ? 'Российский материал' : 'Не зависит от страны'}</li>` + (!hasRu && sc.t !== 'u' && sc.t !== 'r' && sc.a ? `<li class="badge warn">${sc.a === 'none' ? 'Аналога в России нет' : 'Аналог в России не найден'}</li>` : ''));

export function generatePages({ out, site = '', relatedPath = 'ru/related.json' }) {
  const secs = parseBook();
  const all = secs.flatMap((s) => s.entries);
  const scope = existsSync('ru/scope.json') ? JSON.parse(readFileSync('ru/scope.json', 'utf8')) : {};
  const materials = existsSync('ru/materials.json') ? JSON.parse(readFileSync('ru/materials.json', 'utf8')) : {};
  const related = existsSync(relatedPath) ? JSON.parse(readFileSync(relatedPath, 'utf8')) : {};
  const byKey = Object.fromEntries(all.map((e) => [keyOf(e), e]));
  const url = (p) => (site ? `${site.replace(/\/?$/, '/')}${p}` : '');
  const urls = [''];
  let nLinks = 0, nRel = 0;
  const ARTS = {}, SECH = {}, ORDER = {};
  const put = (p, html) => { const f = join(out, p, 'index.html'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };

  mkdirSync(join(out, 'assets'), { recursive: true });
  writeFileSync(join(out, 'assets/page.css'), CSS);
  writeFileSync(join(out, 'assets/analytics.js'), readFileSync('tools/ru/spa/analytics.js', 'utf8'));
  writeFileSync(join(out, 'assets/social-config.js'), socialConfigJs());
  writeFileSync(join(out, 'assets/social.js'), readFileSync('tools/ru/spa/social.js', 'utf8'));
  writeFileSync(join(out, 'assets/card-social.js'), readFileSync('tools/ru/spa/card-social.js', 'utf8'));
  writeFileSync(join(out, 'assets/feedback-config.js'), feedbackConfigJs());
  writeFileSync(join(out, 'assets/feedback.js'), readFileSync('tools/ru/spa/feedback.js', 'utf8'));
  if (existsSync('tools/ru/spa/og.png')) cpSync('tools/ru/spa/og.png', join(out, 'assets/og.png'));
  const image = ogImageUrl(site);
  const socialScripts = (root) => `<script src="${root}assets/social-config.js" defer></script>\n<script src="${root}assets/social.js" defer></script>`;

  const badge = (t, cls = '') => `<li class="badge ${cls}">${esc(t)}</li>`;

  // записи
  const flat = all;
  flat.forEach((e, idx) => {
    const root = '../../';
    const c = makeCtx(secs, '../');                     // из p/8-11/ соседний пункт лежит рядом: ../8-12/
    const cc = { ...c, root: '../../' };
    const sec = secs.find((s) => s.n === e.sec);
    const f = (txt, o = {}) => { const r = inline(txt, { ...c, root: '../../' }, { sec: e.sec, ...o }); nLinks += r.links; return r.html; };
    // ссылки на пункты строим от корня сайта, чтобы не зависеть от глубины
    const rel = (related[keyOf(e)] || []).map((k) => byKey[k]).filter(Boolean);
    nRel += rel.length;
    const sc = scope[keyOf(e)];
    const view = countryView(e, sc);
    const field = (name, key, human = false) => {
      if (!e[key] && !view.russian) return '';
      const original = e[key] ? `<p${human ? ' class="human"' : ''}>${view.labeled ? `<strong>${esc(view.original)}.</strong> ` : ''}${f(e[key])}</p>` : '';
      const russian = view.russian ? `<p${human ? ' class="human"' : ''}><strong>Россия.</strong> ${f(view.russian[key])}</p>` : '';
      return `<section class="country-field" data-field="${key}"><h2>${name}</h2>${original}${russian}${key === 'cost' && e.price ? `<h3>Цена в России (ориентир)</h3><p>${f(e.price)}</p>` : ''}</section>`;
    };
    const srcItems = sourceGroups(e, sc).map((g) => `${g.title === 'Источники' ? '' : `<h3>${esc(g.title)}</h3>`}<ol>${splitSrc(g.text).map((x) => `<li>${f(x)}</li>`).join('')}</ol>`).join('');
    const prev = flat[idx - 1], next = flat[idx + 1];
    const badges = [e.ratio ? badge(`Выгодность${isRu(sc) ? '' : ' исходной версии'}: ${e.ratio}`, e.ratio === 'очень высокая' || e.ratio === 'высокая' ? 'hi' : '') : '', badge(`Доказательность ${e.grade}${isRu(sc) ? '' : ' · исходная версия'}`), e.tag.lens ? badge(LENS[e.tag.lens]) : '', ...['money', 'time', 'will'].filter((d) => e.tag[d]).map((d) => badge(LABEL[d][e.tag[d]])), scopeBadge(scope[keyOf(e)], e.ru), e.dispute ? badge('Спорно', 'warn') : '', e.ru ? badge('Российские данные: частично') : ''].join('');
    const desc = firstSentence(countrySummary(e, sc) || e.title);
    const canonical = url(`p/${keyOf(e)}/`);
    const shareUrl = canonical || `https://howtolivebetter.ru/p/${keyOf(e)}/`;
    const socialBar = socialBarHtml({ key: keyOf(e), title: e.title, url: shareUrl });
    const body = `<nav class="crumbs" aria-label="Навигация"><a href="${root}contents/">Оглавление</a> › <a href="${root}s/${e.sec}/">${e.sec}. ${esc(sec.title)}</a> › пункт ${e.n}</nav>
<div class="hltb-rail">${socialBar}</div>
<article>
<h1>${e.n}. ${esc(e.title)}</h1>
<ul class="badges">${badges}</ul>
${view.notice ? `<p class="scope">${esc(view.notice)}</p>` : ''}
${isRu(sc) ? '' : '<p class="note">Оценки выше относятся к исходной версии; отдельная оценка российского варианта не проводилась.</p>'}
${field('Простыми словами', 'human', true)}
${field('Затраты', 'cost')}
${field('Выгода', 'gain')}
${field('Примечания', 'note')}
<section class="src"><h2>Источники</h2>\n${srcItems}</section>
${(!e.ru && materials[keyOf(e)]) ? `<section class="mat"><h2>Российские материалы по теме</h2>\n<p class="note">Официальные страницы, которые нашёл автоматический поиск по теме пункта. Мы не проверяли их вручную и не утверждаем, что они подтверждают текст пункта.</p>\n<ul>${materials[keyOf(e)].map((m) => `<li><a href="${esc(m.u)}" rel="nofollow noopener" target="_blank">${esc(m.t)}</a> — ${esc(m.h)}${m.k === 'r' ? ' (справочная база закона)' : ''}</li>`).join('')}</ul></section>` : ''}
<p class="suggest"><a href="${suggestHref(e, canonical)}" data-suggest data-sec="${e.sec}" data-n="${e.n}" data-title="${esc(e.title)}" data-url="${esc(canonical || '')}">Предложить правку</a> — ошибка, устаревший закон или лучший источник.</p>
</article>
${rel.length ? `<aside class="related"><h2>Смотрите также</h2>\n<ul>${rel.map((r) => `<li><a href="${root}p/${keyOf(r)}/">Раздел ${r.sec}, пункт ${r.n}: ${esc(r.title)}</a><span class="sub">${esc(countryStatus(r, scope[keyOf(r)]))}</span></li>`).join('')}</ul></aside>` : ''}
<nav class="pager" aria-label="Соседние пункты"><span>${prev ? `← <a href="${root}p/${keyOf(prev)}/">${prev.sec}.${prev.n} ${esc(prev.title.slice(0, 50))}…</a>` : ''}</span><span>${next ? `<a href="${root}p/${keyOf(next)}/">${next.sec}.${next.n} ${esc(next.title.slice(0, 50))}…</a> →` : ''}</span></nav>
<p class="note"><a href="${root}#e-${e.sec}-${e.n}">Открыть этот пункт в поиске с фильтрами</a> · <button type="button" class="print-btn" onclick="window.print()">Распечатать страницу</button></p>`;
    const cites = [...new Set([...(e.src.matchAll(/https?:\/\/[^\s<>()；;]+/g))].map((m) => m[0].replace(/[.,;]+$/, '')))].slice(0, 8);
    const today = new Date().toISOString().slice(0, 10);
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: e.title.slice(0, 110), description: desc, inLanguage: 'ru', url: canonical || undefined, mainEntityOfPage: canonical || undefined, datePublished: '2026-10-06', dateModified: today, author: { '@type': 'Organization', name: `${TITLE} (русская версия)`, url: site || undefined }, publisher: { '@type': 'Organization', name: `${TITLE} (русская версия)`, url: site || undefined }, translator: { '@type': 'Person', name: 'makslanies', url: 'https://github.com/makslanies' }, isBasedOn: { '@type': 'Book', name: '高性价比人生指南', inLanguage: 'zh-CN', url: UPSTREAM }, isPartOf: { '@type': 'Book', name: TITLE }, articleSection: sec.title, license: 'https://creativecommons.org/licenses/by/4.0/', citation: cites.length ? cites : undefined, about: e.ru ? 'Содержит российские данные' : undefined };
    put(`p/${keyOf(e)}`, page({ root, title: `${e.title} · раздел ${e.sec} · ${TITLE}`, desc, canonical, body, ld, image, pdf: { href: `${root}pdf/p/${keyOf(e)}.pdf`, title: 'Скачать пункт в PDF' }, scripts: socialScripts(root) + '\n' + feedbackScripts(root) }));
    ARTS[keyOf(e)] = ((body.match(/<article>[\s\S]*?<\/article>/) || [''])[0]).replace(/<aside class="hltb-social"[\s\S]*?<\/aside>\n?/, '');
    (ORDER[e.sec] ||= []).push(keyOf(e));
    urls.push(`p/${keyOf(e)}/`);
  });

  // разделы
  for (const s of secs) {
    const root = '../../';
    const c = { ...makeCtx(secs, root), root };
    const r = (t, o = {}) => { const x = inline(t, c, { sec: s.n, bare: true, ...o }); nLinks += x.links; return x.html; };
    const intro = s.intro.map((p) => `<p>${r(p)}</p>`).join('\n');
    const list = s.entries.map((e) => `<li><a href="${root}p/${keyOf(e)}/">${e.n}. ${esc(e.title)}</a><span class="sub">${esc(countryStatus(e, scope[keyOf(e)]))}</span><span class="sub">${esc(firstSentence(e.human || e.gain, 150))}</span>${e.ru ? `<span class="sub">Россия: ${esc(firstSentence(countryView(e, scope[keyOf(e)]).russian.human, 150))}</span>` : ''}</li>`).join('\n');
    const body = `<nav class="crumbs" aria-label="Навигация"><a href="${root}contents/">Оглавление</a> › раздел ${s.n}</nav>
<h1>${s.n}. ${esc(s.title)}</h1>
${s.entries.length && s.entries.every((e) => isRu(scope[keyOf(e)])) ? '<p class="scope">Все карточки этого раздела — самостоятельные российские материалы по официальным источникам. Китайской версии у них нет.</p>' : `<p class="scope">${esc(COUNTRY_GUIDE)} Российские данные есть у ${s.entries.filter((e) => e.ru).length} из ${s.entries.length} пунктов этого раздела. Введение ниже относится к исходной версии.</p>`}
${intro}
<h2>Пункты раздела (${s.entries.length})</h2>
<ol class="list" style="padding-left:0;list-style:none">${list}</ol>
<p class="note"><a href="${root}?sec=${s.n}">Открыть раздел в поиске с фильтрами</a></p>`;
    SECH[s.n] = { title: s.title, intro };
    put(`s/${s.n}`, page({ root, pdf: { href: `${root}pdf/s/${s.n}.pdf`, title: 'Скачать раздел в PDF' }, title: `${s.n}. ${s.title} · ${TITLE}`, desc: firstSentence(s.intro[0] || s.title), canonical: url(`s/${s.n}/`), body, ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.title, inLanguage: 'ru', url: url(`s/${s.n}/`) || undefined, isPartOf: { '@type': 'Book', name: TITLE } }, image }));
    urls.push(`s/${s.n}/`);
  }

  // оглавление: описания разделов берём из ru/README.md
  const readme = readFileSync('ru/README.md', 'utf8');
  const toc = new Map([...readme.matchAll(/^(\d+)\. \[([^\]]+)\]\(book\/\d\d-[^)]+\)(.*)$/gm)].map((m) => [Number(m[1]), m[3].replace(/^[:\s]+/, '')]));
  {
    const root = '../';
    const c = { ...makeCtx(secs, root), root };
    const items = secs.map((s) => { const x = inline(toc.get(s.n) || '', c, {}); nLinks += x.links; return `<li><a href="${root}s/${s.n}/">${s.n}. ${esc(s.title)}</a> <small>(${s.entries.length})</small><span class="sub">${x.html}</span></li>`; }).join('\n');
    const body = `<h1>${TITLE}: оглавление</h1>
<p>${all.length} пунктов в ${secs.length} разделах. В каждом пункте: что вы тратите, что получаете, насколько надёжны доказательства и откуда сведения. Для поиска и фильтров по стоимости откройте <a href="${root}">главную страницу</a>.</p>
<p class="scope">${esc(COUNTRY_GUIDE)}</p>
<ol class="list" style="padding-left:0;list-style:none">${items}</ol>`;
    put('contents', page({ root, title: `Оглавление · ${TITLE}`, desc: `Оглавление: ${secs.length} разделов и ${all.length} пунктов руководства по жизни с высокой отдачей.`, canonical: url('contents/'), body, image }));
    const libItems = existsSync('ru/library.json') ? JSON.parse(readFileSync('ru/library.json', 'utf8')) : [];
    if (libItems.length) {
      const bySec = new Map();
      for (const x of libItems) (bySec.get(x.s) || bySec.set(x.s, []).get(x.s)).push(x);
      const nV = libItems.filter((x) => x.v).length;
      const groups = secs.filter((s) => bySec.has(Number(s.n)) || bySec.has(s.n)).map((s) => {
        const arr = bySec.get(Number(s.n)) || bySec.get(s.n) || [];
        return '<h2 id="s' + s.n + '">' + s.n + '. ' + esc(s.title) + ' <small>(' + arr.length + ')</small></h2>\n<ul class="lib">' + arr.map((x) => '<li><a href="' + esc(x.u) + '" rel="' + (x.v ? 'noopener' : 'nofollow noopener') + '" target="_blank">' + esc(x.t) + '</a> <small>' + esc(x.h) + (x.k === 'r' ? ', справочная база закона' : '') + '</small>' + (x.v ? ' <span class="ok">проверено</span>' : '') + '' + (x.x ? '<br><span class="sub">' + esc(x.x) + '</span>' : '') + '<br><small>К пунктам: ' + x.e.map((k) => '<a href="' + root + 'p/' + k + '/">' + k + '</a>').join(', ') + '</small></li>').join('') + '</ul>';
      }).join('\n');
      const libBody = '<h1>Российская библиотека: официальные материалы</h1>\n<p>Страницы российских официальных сайтов (Минздрав, Роструд, СФР, МВД, Банк России, Роспотребнадзор, МЧС, Минтруд и другие), которые нашёл автоматический поиск по темам книги. Они не привязаны к китайским пунктам: открывайте их сами. Всего ' + libItems.length + ' страниц, ' + nV + ' из них отмечены «проверено».</p>\n<p class="scope">«Проверено» значит, что цитаты из этой страницы сверены с её текстом и использованы в российской справке к пункту. Остальные страницы нашёл поиск: их читали автоматически, вручную не проверяли и не утверждают, что они подтверждают конкретный пункт. Законы меняются, перед важным решением проверьте актуальную редакцию на сайте-источнике.</p>\n<nav class="lib-nav">' + secs.filter((s) => bySec.has(Number(s.n)) || bySec.has(s.n)).map((s) => '<a href="#s' + s.n + '">' + s.n + '</a>').join(' · ') + '</nav>\n' + groups;
      put('library', page({ root, title: 'Российская библиотека: официальные материалы · ' + TITLE, desc: 'Страницы российских официальных сайтов по темам книги: здоровье, деньги, работа, право, семья. ' + libItems.length + ' страниц, отдельно отмечены проверенные.', canonical: url('library/'), body: libBody, image }));
      urls.push('library/');
    }
    urls.push('contents/', 'about/', 'author/', 'privacy/');
  }

  // sitemap
  if (site) {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${url(u)}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  }

  if (pdfOn()) { const tmp = join(dirname(out), 'pdf-tmp'); mkdirSync(tmp, { recursive: true }); writeFileSync(join(tmp, 'articles.json'), JSON.stringify({ arts: ARTS, secs: SECH, order: ORDER })); }

  // проверка: все внутренние ссылки ведут на существующие страницы
  const broken = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.html$/.test(n) && check(p); } };
  const check = (file) => {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"#?]*)(?:[?#][^"]*)?"/g)) {
      const h = m[1]; if (!h || /^(https?:|mailto:|data:)/.test(h) || /(^|\/)pdf\//.test(h)) continue;
      const target = resolve(dirname(file), h);
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
      if (!ok) broken.push(`${file.replace(out + '/', '')}: ${h}`);
    }
  };
  walk(join(out, 'p')); walk(join(out, 's')); walk(join(out, 'contents'));
  return { pages: urls.length, entries: all.length, sections: secs.length, refLinks: nLinks, relatedLinks: nRel, broken };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const o = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const r = generatePages({ out: o('out', 'dist-ru/site'), site: o('site', '') });
  console.log(JSON.stringify({ ...r, broken: r.broken.slice(0, 10), brokenCount: r.broken.length }));
  process.exit(r.broken.length ? 1 : 0);
}
