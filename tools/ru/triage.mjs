// Разбор замечаний проверки (ru-work/report/*.md): независимая модель смотрит китайскую и русскую запись
// целиком и решает, настоящая ли ошибка. Правка — это «найти точную строку в русской записи и
// заменить»; скрипт применяет её только если строка встречается в записи ровно один раз и
// проверка чисел проходит. Использование:
//   node tools/ru-work/triage.mjs [--model gpt-5.5] [--apply] [--only 05-]
// Без --apply файлы книги не трогает, пишет ru-work/triage/decisions.json и summary.md.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const MODEL = opt('model', 'gpt-5.5');
const ONLY = opt('only', '');
if (!process.env.OPENAI_API_KEY && existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// ---- разбор отчётов ----
const issues = [];
for (const f of readdirSync('ru-work/report').filter((x) => x.endsWith('.md') && x.startsWith(ONLY))) {
  const txt = readFileSync(`ru-work/report/${f}`, 'utf8');
  for (const blk of txt.split(/^(?=## 块 )/m).filter((b) => b.startsWith('## 块 '))) {
    const head = blk.split('\n')[0];
    const em = head.match(/### (\d+)\./);
    for (const m of blk.matchAll(/^- \[([^\]]*)\] (.*)\n  - 原文：(.*)\n  - 译文：(.*)$/gm)) {
      issues.push({ file: f, entry: em ? Number(em[1]) : null, type: m[1], note: m[2], orig: m[3], tr: m[4] });
    }
  }
}
console.error(`замечаний: ${issues.length}`);

const entryOf = (text, n) => {
  const parts = text.split(/^(?=### )/m);
  return (n == null ? parts[0] : parts.find((p) => p.startsWith(`### ${n}. `))) || '';
};
const strip = (s) => s.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (来源|Источники)/.test(l)).join('\n');

const SYSTEM = `Ты независимый судья перевода с китайского на русский. Книга — руководство по жизни для обычных людей, поэтому смысл, числа и оговорки (не, не обязательно, как правило, не более, спорно) нельзя менять ни в какую сторону.
Тебе дают китайскую запись, русский перевод записи и замечание автоматического рецензента. Рецензент часто ошибается, поэтому реши сам:
- verdict "real": в русском тексте действительно есть ошибка (потеря или усиление оговорки, неверное число, пропуск, выдумка, неправильный смысл, непонятный русский);
- verdict "false": перевод верный или отличие стилистическое;
- verdict "unclear": по тексту не решить.
Если "real", дай правку: "find" — ТОЧНАЯ подстрока из русского перевода (скопируй символ в символ, 20–300 знаков, она должна быть в тексте ровно один раз), "replace" — исправленный текст. Меняй как можно меньше, сохраняй стиль («вы», короткие предложения). Не добавляй ничего, чего нет в китайском. Если ошибка "real", но безопасной точечной правки нет, верни find и replace пустыми.
Ответ JSON: {"verdict":"real|false|unclear","severity":"high|low","reason":"одно предложение","find":"","replace":""}`;

async function judge(it, cn, ru) {
  const user = `КИТАЙСКАЯ ЗАПИСЬ:\n${strip(cn)}\n\nРУССКИЙ ПЕРЕВОД:\n${strip(ru)}\n\nЗАМЕЧАНИЕ РЕЦЕНЗЕНТА [${it.type}]: ${it.note}\nфрагмент оригинала: ${it.orig}\nфрагмент перевода: ${it.tr}`;
  for (let a = 1; a <= 3; a++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }) });
    const j = await r.json();
    if (r.ok) { try { return { d: JSON.parse(j.choices[0].message.content), u: j.usage }; } catch { /* повтор */ } }
    else if (r.status === 401 || a === 3) throw new Error(`openai ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((s) => setTimeout(s, 2000 * a));
  }
  return { d: { verdict: 'unclear', reason: 'судья не вернул JSON' }, u: {} };
}

mkdirSync('ru-work/triage', { recursive: true });
const decisions = new Array(issues.length);
let next = 0, tin = 0, tout = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < issues.length) {
    const i = next++;
    const it = issues[i];
    const cn = entryOf(readFileSync(`book/${it.file}`, 'utf8'), it.entry);
    const ru = entryOf(readFileSync(`ru/book/${it.file}`, 'utf8'), it.entry);
    try {
      const { d, u } = await judge(it, cn, ru);
      tin += u.prompt_tokens || 0; tout += u.completion_tokens || 0;
      decisions[i] = { ...it, ...d, inEntry: !!ru && !!d.find && ru.split(d.find).length - 1 === 1 };
    } catch (e) { decisions[i] = { ...it, verdict: 'unclear', reason: `ошибка вызова: ${e.message}` }; }
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${issues.length}`);
  }
}));
writeFileSync('ru-work/triage/decisions.json', JSON.stringify(decisions, null, 1));

// ---- применение ----
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).sort().join(',');
let applied = 0, refused = 0;
if (flag('apply')) {
  cpSync('ru/book', 'ru-work/book.before-triage', { recursive: true });
  for (const d of decisions) {
    d.applied = false;
    if (d.verdict !== 'real' || !d.find || !d.replace || !d.inEntry) continue;
    const path = `ru/book/${d.file}`;
    let t = readFileSync(path, 'utf8');
    const ok = t.split(d.find).length - 1 === 1 && nums(d.find) === nums(d.replace) && !/\[\[|https?:/.test(d.replace) && d.replace.length < d.find.length * 2.5 + 40;
    if (!ok) { refused++; d.refusal = 'не прошла механическая проверка (числа, ссылки или длина), правка вручную'; continue; }
    writeFileSync(path, t.replace(d.find, () => d.replace)); d.applied = true; applied++;
  }
  writeFileSync('ru-work/triage/decisions.json', JSON.stringify(decisions, null, 1));
}

const by = (k) => decisions.reduce((m, d) => (m[d[k]] = (m[d[k]] || 0) + 1, m), {});
const real = decisions.filter((d) => d.verdict === 'real');
const md = `# Разбор замечаний (${MODEL})\n\n- Всего: ${decisions.length}. Вердикты: ${JSON.stringify(by('verdict'))}\n- Применено правок: ${applied}, отказано проверкой: ${refused}\n- Токены судьи: вход ${tin}, выход ${tout}\n\n## Настоящие ошибки (${real.length})\n\n` + real.map((d) => `- **${d.file} · запись ${d.entry ?? 'введение'} · ${d.type} · ${d.severity}** ${d.applied ? '✅ исправлено' : '⏳ вручную'}\n  - ${d.reason}\n  - было: ${d.find || d.tr}\n  - стало: ${d.replace || '—'}`).join('\n') + '\n';
writeFileSync('ru-work/triage/summary.md', md);
console.error(`готово: вердикты ${JSON.stringify(by('verdict'))}; применено ${applied}; токены ${tin}/${tout}`);
