// 把 book/*.md 翻译成俄语，写到 ru/book/。用法：
//   node tools/translate.mjs book/18-养孩子划不划算.md [--model gpt-5] [--dry-run]
// 密钥读环境变量 OPENAI_API_KEY，或仓库根目录 .env（已 gitignore）。
// 「- 来源：」行的正文和 HTML 注释行不送模型，原样放回；其余按条目分块翻译。
// 译完机械核对：数字、网址、占位符、条目数。有差异只报告，不自动改。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('用法：node tools/translate.mjs <book/xx.md> [--model M] [--dry-run]'); process.exit(2); }
const MODEL = opt('model', process.env.OPENAI_MODEL || 'gpt-5');
const OUT_DIR = opt('out', 'ru/book');

if (!process.env.OPENAI_API_KEY && existsSync('.env')) {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const GLOSSARY = `
成本 → Затраты; 说人话 → Простыми словами; 收益 → Выгода; 证据等级 → Уровень доказательств;
来源 → Источники; 备注 → Примечания; 争议 → Спорно（备注以「争议」开头时译为「Спорно:」）;
总死亡率 → общая смертность; 受益人 → выгодоприобретатель 仅用于保险，其余场合写「кому это выгодно」;
元 → юаней; 万元 → 10 тыс. юаней（1.5 万元 → 15 тыс. юаней，括号里的精确值照抄）;
HR/RR/OR/CI/RCT 等统计缩写保持拉丁字母不变（HR, RR, OR, CI, RCT）;
A/B/C 证据等级字母保持不变;
药名用俄语通用名（МНН）：对乙酰氨基酚 → парацетамол（不要写美式的 ацетаминофен；原文说「也叫扑热息痛」时写「парацетамол (в США его называют ацетаминофен)」）;
第 N 节 → раздел N; 第 N 条 → пункт N（指本书条目）; 法条的「第 N 条」→ статья N;
「（锚点词）」括号里的短词译成俄语，但保留括号。
`;

const SYSTEM = `你是专业的中译俄译者，正在翻译一本面向普通读者的中文人生指南。要求：
1. 忠实翻译，不增不减不润色。每个数字、百分比、年份、法条号、文号、机构名都必须原样保留或精确对应。小数点保留「.」，金额和大数不加千分位，也不加空格（10800 不写成 10 800）。「万」译成「тыс.」时换算准确（1.5 万 → 15 тыс.），六位数以上的「约 X 万元（精确值 元）」里括号中的精确值照抄。
2. 否定、范围、条件、限定语（「不」「未必」「原则上」「至多」「争议」等）一个都不许丢，也不许说得更绝对或更具体。
3. 保持 Markdown 结构不变：标题 #/###、列表符「- 」、加粗 **、行数和空行都不变。「- 成本：」「- 说人话：」这类字段名按术语表翻译，冒号改成英文冒号加空格。
4. 形如 [[KEEP:数字]] 的占位符原样保留在原位置，不翻译、不增删、不挪动。
5. 俄语要通顺、口语化、短句，让没受过专业训练的成年人一遍读懂。中国专有的机构、文件、热线、药品商品名：译成俄语，括号里附中文原文，如 «Закон о трудовых договорах (劳动合同法)»。不要用拼音音译（不写「аньфэнь-вэйма」这类），也不要自造俄语名。
6. 对读者的称呼统一用「вы」（вежливое множественное），中文里的「你」译成「вы」，不用「ты」，也不用祈使句「подай」这类单数形式，改用「подайте」。中文没有主语的句子保持无人称或用「можно / нужно」。整本书风格一致，不同块之间不要换称呼。
7. 只输出译文，不要任何解释。
术语表：${GLOSSARY}`;

// ---- 切块 ----
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');
const kept = [];
const protect = (text) => { kept.push(text); return `[[KEEP:${kept.length - 1}]]`; };
const prepared = lines.map((l) => {
  if (/^<!--.*-->\s*$/.test(l)) return protect(l);
  const m = l.match(/^(- 来源：)(.*)$/);
  if (m) return `${m[1]}${protect(m[2])}`;
  return l;
});
const chunks = [];
let cur = [];
for (const l of prepared) {
  if (/^### /.test(l) && cur.length) { chunks.push(cur.join('\n')); cur = []; }
  cur.push(l);
}
if (cur.length) chunks.push(cur.join('\n'));
console.error(`${file}: ${lines.length} 行，${chunks.length} 块，${kept.length} 处原样保留，模型 ${MODEL}`);
if (flag('dry-run')) process.exit(0);

// ---- 调 API ----
async function translate(text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }),
    });
    const j = await r.json();
    if (r.ok) return { text: j.choices[0].message.content, usage: j.usage };
    const msg = String(j.error?.message || r.status).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
    if (r.status === 401 || r.status === 404 || attempt === 3) throw new Error(`${r.status} ${msg}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

const results = new Array(chunks.length);
let next = 0, inTok = 0, outTok = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < chunks.length) {
    const i = next++;
    const { text, usage } = await translate(chunks[i]);
    results[i] = text.trim();
    inTok += usage?.prompt_tokens || 0; outTok += usage?.completion_tokens || 0;
    console.error(`  块 ${i + 1}/${chunks.length}`);
  }
}));

// ---- 可选：第二个模型逐块对照原文找问题（--verify，默认 gpt-6-luna）----
const VERIFY_MODEL = opt('verify-model', 'gpt-6-luna');
const VERIFY_SYSTEM = `你是中俄双语审校。给你一段中文原文和它的俄语译文，找出译文的实质问题，只找这几类：
(1) 漏译或少了一句；(2) 数字、日期、剂量、金额、法条号、文号、机构名与原文不符；(3) 否定、范围、条件、限定语（不、未必、原则上、至多、争议等）被丢掉，或说得比原文更绝对、更具体；(4) 译文凭空添加了原文没有的断言；(5) 俄语读不通或意思错了。
形如 [[KEEP:数字]] 的占位符是原样保留的内容，不算问题。风格偏好不算问题。
只输出 JSON：{"issues":[{"type":"漏译|数字|限定语|添加|不通","original":"原文片段","translation":"译文片段","note":"一句话说明"}]}，没有问题就输出 {"issues":[]}。`;
async function verifyChunk(orig, tr) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: VERIFY_MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: VERIFY_SYSTEM }, { role: 'user', content: `【原文】\n${orig}\n\n【译文】\n${tr}` }] }),
    });
    const j = await r.json();
    if (r.ok) { try { return { issues: JSON.parse(j.choices[0].message.content).issues || [], usage: j.usage }; } catch { return { issues: [{ type: '不通', note: '审校输出不是合法 JSON' }], usage: j.usage }; } }
    if (r.status === 401 || r.status === 404 || attempt === 3) throw new Error(`verify ${r.status} ${String(j.error?.message || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}
let verifyReport = '';
if (flag('verify')) {
  const found = new Array(chunks.length);
  let vn = 0, vIn = 0, vOut = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (vn < chunks.length) {
      const i = vn++;
      const { issues, usage } = await verifyChunk(chunks[i], results[i]);
      found[i] = issues; vIn += usage?.prompt_tokens || 0; vOut += usage?.completion_tokens || 0;
    }
  }));
  const total = found.flat().length;
  verifyReport = `# ${basename(file)}：审校（${VERIFY_MODEL}）发现 ${total} 处\n\n` + found.map((iss, i) => iss.length ? `## 块 ${i + 1}：${chunks[i].split('\n').find((l) => /^### /.test(l)) || '（节首）'}\n` + iss.map((x) => `- [${x.type}] ${x.note || ''}\n  - 原文：${x.original || ''}\n  - 译文：${x.translation || ''}`).join('\n') + '\n' : '').join('\n');
  console.error(`审校 ${VERIFY_MODEL}：${total} 处；tokens 入 ${vIn} 出 ${vOut}`);
}

// ---- 还原 + 核对 ----
let out = results.join('\n\n').replace(/\[\[KEEP:(\d+)\]\]/g, (_, n) => kept[+n] ?? `[[MISSING:${n}]]`) + '\n';
const warns = [];
const missing = (out.match(/\[\[MISSING:\d+\]\]/g) || []).length;
if (missing) warns.push(`占位符丢失/多出：${missing} 处`);
for (let n = 0; n < kept.length; n++) if (!out.includes(kept[n])) warns.push(`原样保留的第 ${n} 段没有出现在译文里`);
// 两边先换成同一口径再数：中文的「N 万 / N 亿」和「N 月」，俄文的「N тыс. / млн」和千分位空格
const mul = (n, k) => String(Math.round(parseFloat(n.replace(',', '.')) * k));
const normZh = (s) => s.replace(/(\d+(?:\.\d+)?)\s*万/g, (_, n) => mul(n, 1e4)).replace(/(\d+(?:\.\d+)?)\s*亿/g, (_, n) => mul(n, 1e8)).replace(/\d+\s*月/g, '月');
const normRu = (s) => s.replace(/(\d+(?:[.,]\d+)?)\s*(?:млн|миллион\w*)/gi, (_, n) => mul(n, 1e6)).replace(/(\d+(?:[.,]\d+)?)\s*(?:тыс\.?|тысяч\w*)/gi, (_, n) => mul(n, 1e3)).replace(/(\d) (\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
const bag = (s, norm) => { const m = new Map(); for (const t of norm(s.replace(/https?:\/\/\S+/g, '')).match(/\d+(?:\.\d+)?/g) || []) m.set(t, (m.get(t) || 0) + 1); return m; };
const body = (s) => s.split('\n').filter((l) => !/^<!--/.test(l) && !/^- (来源|Источники)[：:]/.test(l)).join('\n');
const a = bag(body(src), normZh), b = bag(body(out), normRu);
for (const [t, c] of a) if ((b.get(t) || 0) < c) warns.push(`数字 ${t}：原文 ${c} 次，译文 ${b.get(t) || 0} 次`);
for (const [t, c] of b) if (!a.has(t)) warns.push(`译文多出数字 ${t}（可能是 万→тыс. 的换算）`);
const count = (s, re) => (s.match(re) || []).length;
if (count(src, /^### /gm) !== count(out, /^### /gm)) warns.push(`条目数不一致：${count(src, /^### /gm)} → ${count(out, /^### /gm)}`);
if (count(src, /^- /gm) !== count(out, /^- /gm)) warns.push(`列表项数不一致：${count(src, /^- /gm)} → ${count(out, /^- /gm)}`);

mkdirSync(OUT_DIR, { recursive: true });
const dest = join(OUT_DIR, basename(file));
writeFileSync(dest, out);
if (verifyReport) { mkdirSync('ru-work/report', { recursive: true }); writeFileSync(join('ru-work/report', basename(file)), verifyReport); }
console.error(`写入 ${dest}；tokens 入 ${inTok} 出 ${outTok}；核对警告 ${warns.length} 条`);
for (const w of warns) console.error('  ⚠ ' + w);
