// Черновики российского слоя через бесплатный шлюз Kilo (без ключа). Модель только пишет, проверяет её tools/ru/draft.mjs:
// цитаты должны стоять на странице дословно, числа — в цитатах. Отправляется только публичный текст: запись книги и выдержки с официальных сайтов.
//   node tools/ru/freedraft.mjs 13-15,13-16 [--model id] [--out ru-work/evidence/drafts-free.json]
// Потом: node tools/ru/draft.mjs ru-work/evidence/drafts-free.json [--apply]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const keys = (args[0] || '').split(',').filter(Boolean);
const AGY = opt('provider', 'kilo') === 'agy';       // --provider agy: Antigravity CLI (вход по вашей учётной записи Google)
const MODEL = opt('model', AGY ? 'gemini-3.8-flash-high' : 'nvidia/nemotron-3-ultra-550b-a55b:free');
const OUT = opt('out', 'ru-work/evidence/drafts-free.json');
if (!keys.length) { console.error('node tools/ru/freedraft.mjs 13-15,13-16 [--model id] [--out file]'); process.exit(2); }
const URL_ = 'https://api.kilo.ai/api/gateway/chat/completions';

const SYSTEM = `Ты редактор русской версии книги о том, как жить выгоднее. Тебе дают запись о Китае и выдержки со страниц российских официальных сайтов.
Напиши российский слой: что в России так же, что иначе. Правила:
1. Каждое утверждение бери только из выдержек. Ничего не домысливай, не добавляй чисел, которых нет в цитатах.
2. Верни один JSON без пояснений: {"human":"...","cost":"...","gain":"...","note":"...","sources":[{"id":"1.4"}]}.
3. Источники указывай номерами предложений из выдержек, например {"id":"1.4"}: страница 1, предложение 4. Выбирай только предложения, на которые опираешься. Сам цитаты не пиши.
4. Поля human (2–4 коротких предложения), cost, gain, note обязательны. Если цены или условия в выдержках нет, прямо напиши, что в этих источниках они не указаны.
5. Все числа и сроки, которые пишешь, должны стоять в выбранных предложениях. Пиши простым языком, без канцелярита.`;

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const key of keys) {
  const pk = `ru-work/evidence/${key}.md`;
  if (!existsSync(pk)) { console.error(`${key}: нет пакета`); continue; }
  const packet = readFileSync(pk, 'utf8');
  const pageText = new Map([...packet.matchAll(/## Страница (\d) \([^)]*\)\nАдрес: \S+\n[^\n]*\n\n([\s\S]*?)(?=\n## Страница|$)/g)].map((x) => [Number(x[1]), x[2]]));
  const sent = new Map();
  let user = packet.split('## Запросы')[0].replace(/^# Пакет доказательств[^\n]*\n/, '').slice(0, 3000) + '\n';
  for (const [p, t] of pageText) {
    user += `\n## Страница ${p}\n`;
    t.replace(/\s+/g, ' ').split(/(?<=[.!?;:])\s+(?=[А-ЯЁA-Z«"\d])/).map((x) => x.trim()).filter((x) => x.length >= 30 && x.length <= 450).slice(0, 60).forEach((x, i) => { sent.set(`${p}.${i + 1}`, x); user += `[${p}.${i + 1}] ${x}\n`; });
  }
  let text = '';
  for (let attempt = 1; attempt <= 3 && !text; attempt++) {
    try {
      if (AGY) { text = execFileSync('agy', ['-p', SYSTEM + '\n\nИнструменты не используй, ответь только JSON.\n\n' + user, '--model', MODEL, '--print-timeout', '150s'], { cwd: '/tmp', encoding: 'utf8', timeout: 200000, maxBuffer: 1 << 24 }); continue; }
      const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 8000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }), signal: AbortSignal.timeout(180000) });
      const j = await r.json();
      text = j.choices?.[0]?.message?.content || '';
      if (!text) console.error(`${key}: пустой ответ (${r.status}), попытка ${attempt}`);
    } catch (e) { console.error(`${key}: ${e.message}, попытка ${attempt}`); }
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.error(`${key}: JSON не найден`); continue; }
  try { out[key] = { ...JSON.parse(m[0]) }; } catch { console.error(`${key}: JSON не разобран`); continue; }
  const titles = new Map([...packet.matchAll(/## Страница (\d) \([^)]*\)\nАдрес: \S+\nЗаголовок: ([^\n]*)/g)].map((x) => [Number(x[1]), x[2].trim()]));
  out[key].sources = (out[key].sources || []).map((x) => ({ page: Number(String(x.id || '').split('.')[0]), quote: sent.get(String(x.id)) })).filter((x) => x.quote);
  for (const s of out[key].sources || []) s.title = titles.get(Number(s.page)) || 'Официальный источник';
  console.error(`${key}: черновик получен (${MODEL})`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
