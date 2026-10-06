// Общие помощники российской сверки: прямое скачивание PDF (когда SREZAI не может прочитать сайт),
// извлечение текста через PyMuPDF и выбор нужных кусков из длинного документа по ключевым словам.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const CACHE = 'ru-work/research/pdf';

// Скачивает документ напрямую (без кредитов SREZAI) и возвращает текст. Кэш по адресу.
export async function fetchPdfText(url, { timeoutMs = 90000 } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const key = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const txt = `${CACHE}/${key}.txt`, pdf = `${CACHE}/${key}.pdf`;
  if (existsSync(txt)) return readFileSync(txt, 'utf8');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try { res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (HowToLiveBetter research)' } }); }
  finally { clearTimeout(t); }
  if (!res.ok) throw new Error(`прямое скачивание ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 5).toString() !== '%PDF-') {            // не PDF: считаем HTML, убираем теги
    const html = buf.toString('utf8');
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    writeFileSync(txt, text); return text;
  }
  writeFileSync(pdf, buf);
  const py = 'import sys,warnings;warnings.filterwarnings("ignore")\ntry:\n import pymupdf as f\nexcept Exception:\n import fitz as f\nd=f.open(sys.argv[1]);sys.stdout.write("\\n".join(p.get_text() for p in d))';
  const out = execFileSync('python3', ['-c', py, pdf], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const text = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  writeFileSync(txt, text);
  return text;
}

// Из длинного текста берёт абзацы, где чаще всего встречаются ключевые слова (корни слов), по порядку в документе.
export function excerpt(text, keywords, maxChars = 7000) {
  const kws = (keywords || []).map((k) => k.toLowerCase()).filter((k) => k.length >= 3);
  if (!kws.length || text.length <= maxChars) return text.slice(0, maxChars);
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 60)
    .filter((p) => !/\.{6,}/.test(p) && (p.match(/ – /g) || []).length < 6);   // оглавление и перечни сокращений не нужны
  const scored = paras.map((p, i) => {
    const l = p.toLowerCase();
    let hits = 0; const seen = new Set();
    for (const k of kws) { const c = l.split(k).length - 1; if (c) { hits += Math.min(c, 4); seen.add(k); } }
    const density = hits / Math.max(1, p.length / 400);
    return { i, p, s: density * (1 + seen.size) , seen: seen.size };
  }).filter((x) => x.seen >= Math.min(2, kws.length)).sort((a, b) => b.s - a.s);
  const picked = []; let len = 0;
  for (const x of scored) { if (len + x.p.length > maxChars) continue; picked.push(x); len += x.p.length + 2; if (len > maxChars * 0.95) break; }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.p).join('\n\n');
}

// Нужно ли пробовать прямое скачивание вместо SREZAI
export const isDirectFetchUrl = (u) => /apicr\.minzdrav\.gov\.ru|apiportalcr\.minzdrav\.gov\.ru|\.pdf(\?|$)/i.test(u);

// Официальный текст законов: ИПС «Законодательство России» на pravo.gov.ru. Запрос doc_itself отдаёт документ целиком (кодировка windows-1251).
// SREZAI для этого не нужен, квота не тратится. Сайт нестабилен (бывают 502 и обрывы), поэтому повторы.
const IPS = 'ru-work/research/ips';
export async function fetchIpsText(nd) {
  mkdirSync(IPS, { recursive: true });
  const f = `${IPS}/${nd}.txt`;
  if (existsSync(f)) return readFileSync(f, 'utf8');
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`http://pravo.gov.ru/proxy/ips/?doc_itself=&nd=${nd}&page=1&rdk=0`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
      if (r.ok) {
        const html = new TextDecoder('windows-1251').decode(await r.arrayBuffer());
        const t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        if (t.length > 3000) { writeFileSync(f, t); return t; }
      }
    } catch { /* повтор */ }
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error(`ИПС не отдал документ nd=${nd}`);
}

// Статья целиком. В тексте есть оглавление («Статья 1. Статья 2. …»), поэтому из всех вхождений берём самое длинное.
export function articleOf(text, art) {
  const re = new RegExp(`Статья ${String(art).replace('.', '\\.')}\\.\\s`, 'g');
  let best = null, m;
  while ((m = re.exec(text))) {
    const rest = text.slice(m.index + 8);
    const n = /\sСтатья \d+(?:\.\d+)?\.\s/.exec(rest);
    const chunk = text.slice(m.index, m.index + 8 + (n ? n.index : 6000));
    if (!best || chunk.length > best.length) best = chunk;
  }
  return best ? best.slice(0, 7000) : null;
}
