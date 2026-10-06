// Проверки русской версии перед сборкой. Ошибки (errors) валят сборку, предупреждения (warnings) только печатаются.
//   node tools/ru/validate.mjs [--json]
// Проверяет: состав файлов и ссылки README, 6 полей и тег стоимости у каждой записи, число записей как в оригинале,
// допустимые значения тега, китайский текст вне источников и скобок, сноски «раздел N, пункт M», счётчики в тексте.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export function validate() {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);

  const readme = existsSync('ru/README.md') ? readFileSync('ru/README.md', 'utf8') : '';
  if (!readme) E('нет ru/README.md');
  const linked = [...new Set([...readme.matchAll(/\]\((book\/[^)#\s]+\.md)\)/g)].map((m) => m[1]))].sort();
  const onDisk = readdirSync('ru/book').filter((f) => /^\d\d-.+\.md$/.test(f)).map((f) => `book/${f}`).sort();
  for (const f of onDisk) if (!linked.includes(f)) E(`файл ${f} не упомянут в оглавлении README`);
  for (const f of linked) if (!onDisk.includes(f)) E(`README ссылается на несуществующий ${f}`);
  if (onDisk.length !== 34) W(`разделов ${onDisk.length}, в оригинале 34`);

  const FIELDS = [['Затраты', /^- Затраты:\s*\S/m], ['Простыми словами', /^- Простыми словами:\s*\S/m], ['Выгода', /^- Выгода:\s*\S/m], ['Уровень доказательств', /^- Уровень доказательств:\s*[ABC]\b/m], ['Источники', /^- Источники:\s*\S/m], ['Примечания', /^- Примечания:\s*\S/m]];
  const TAG = /^<!-- 成本标签: 钱=(0|少|多) 时间=(少|中|多) 毅力=(否|些|是) 收益=(大|中|小) 口径=(死亡率|金钱|时间|自由) -->$/;
  const stats = { files: onDisk.length, entries: 0, A: 0, B: 0, C: 0, disputes: 0, russia: 0 };
  const counts = {};            // секция → число записей
  const proses = [];            // для проверки сносок

  for (const rel of onDisk) {
    const nn = rel.slice(5, 7);
    const text = readFileSync(`ru/${rel}`, 'utf8');
    const lines = text.split('\n');
    if (!/^\[← .+\]\(\.\.\/README\.md\)$/.test(lines[0])) W(`${rel}: первая строка не ссылка на оглавление`);
    if (!new RegExp(`^# ${Number(nn)}\\. `, 'm').test(text)) E(`${rel}: нет заголовка «# ${Number(nn)}. …»`);
    const parts = text.split(/^(?=### )/m).filter((p) => /^### /.test(p));
    counts[Number(nn)] = parts.length;
    // число записей как в оригинале
    const orig = readdirSync('book').find((f) => f.startsWith(nn + '-'));
    if (orig) {
      const n0 = (readFileSync(`book/${orig}`, 'utf8').match(/^### \d+\./gm) || []).length;
      if (n0 !== parts.length) E(`${rel}: записей ${parts.length}, в оригинале ${n0}`);
    }
    parts.forEach((p, i) => {
      const head = p.split('\n')[0];
      const m = /^### (\d+)\. (.+)$/.exec(head);
      const where = `${rel} запись ${m ? m[1] : '?'}`;
      if (!m) { E(`${rel}: странный заголовок «${head.slice(0, 50)}»`); return; }
      if (Number(m[1]) !== i + 1) E(`${where}: номер идёт не по порядку (ожидался ${i + 1})`);
      stats.entries++;
      const tag = p.split('\n').find((l) => l.startsWith('<!--'));
      if (!tag) E(`${where}: нет тега стоимости`); else if (!TAG.test(tag.trim())) E(`${where}: тег стоимости с недопустимыми значениями: ${tag.trim().slice(0, 70)}`);
      for (const [name, re] of FIELDS) if (!re.test(p)) E(`${where}: нет поля «${name}»`);
      const g = /^- Уровень доказательств:\s*([ABC])/m.exec(p); if (g) stats[g[1]]++;
      if (/^- Примечания:\s*Спорно/m.test(p)) stats.disputes++;
      if (/^- (?:В России|(?:Простыми словами|Затраты|Выгода|Примечания) \(Россия\)):/m.test(p)) stats.russia++;
      // китайский вне источников, комментариев и скобок
      for (const l of p.split('\n')) {
        if (/^(<!--|- Источники)/.test(l)) continue;
        const clean = l.replace(/https?:\/\/\S+/g, '').replace(/\([^)]*\)/g, '').replace(/«[^»]*»/g, (s) => (/[一-鿿]/.test(s) ? '' : s));
        const cjk = (clean.match(/[一-鿿]/g) || []).length;
        if (cjk >= 4) W(`${where}: китайский текст в прозе (${cjk} знаков): ${l.trim().slice(0, 80)}`);
        if (!/^(- Источники|<!--)/.test(l) && !/^\[/.test(l)) proses.push({ where, nn: Number(nn), l });
      }
    });
  }

  // сноски «раздел N, пункт M» / «пункт M раздела N»
  const NUMS = '(?:с\\s+)?\\d+(?:\\s*(?:,|и)\\s*\\d+)*(?:\\s*(?:–|—|-|по)\\s*\\d+)?';
  const XR = new RegExp(`раздел(?:а|е|у|ом)?\\s+(\\d+),\\s*пункт(?:а|е|у|ы|ов)?\\s+(${NUMS})|пункт(?:а|е|у|ы|ов)?\\s+(${NUMS})\\s+раздел(?:а|е|у|ом)?\\s+(\\d+)`, 'gi');
  let xrefs = 0;
  const bad = [];
  for (const { where, l } of proses) {
    for (const m of l.matchAll(XR)) {
      xrefs++;
      const sec = Number(m[1] ?? m[4]); const spec = String(m[2] ?? m[3]);
      const nums = [];
      for (const part of spec.split(/\s*(?:,|и)\s*/)) {
        const r = /^(?:с\s+)?(\d+)\s*(?:–|—|-|по)\s*(\d+)$/.exec(part.trim());
        if (r) { for (let k = +r[1]; k <= +r[2] && k - +r[1] <= 40; k++) nums.push(k); } else if (/^\d+$/.test(part.trim())) nums.push(+part);
      }
      for (const n of nums) if (!counts[sec] || n < 1 || n > counts[sec]) bad.push(`${where}: «${m[0]}» → в разделе ${sec} нет пункта ${n}`);
    }
  }
  for (const b of bad.slice(0, 25)) W(`сноска: ${b}`);
  if (bad.length > 25) W(`… и ещё ${bad.length - 25} битых сносок`);
  stats.xrefs = xrefs; stats.badXrefs = bad.length;

  // «Смотрите также»: ключи должны существовать
  if (existsSync('ru/related.json')) {
    const rel = JSON.parse(readFileSync('ru/related.json', 'utf8'));
    const keys = new Set(Object.entries(counts).flatMap(([sec, n]) => Array.from({ length: n }, (_, i) => `${sec}-${i + 1}`)));
    let bad = 0;
    for (const [k, list] of Object.entries(rel)) { if (!keys.has(k)) bad++; for (const x of list) { if (!keys.has(x) || x === k) bad++; } }
    if (bad) E(`related.json: ${bad} ссылок на несуществующие пункты`);
    stats.related = Object.values(rel).flat().length;
  }

  // ярлыки Китай/универсально: ключи должны существовать, у китайских и смешанных должно быть пояснение
  if (existsSync('ru/scope.json')) {
    const sc = JSON.parse(readFileSync('ru/scope.json', 'utf8'));
    const keys = new Set(Object.entries(counts).flatMap(([sec, n]) => Array.from({ length: n }, (_, i) => `${sec}-${i + 1}`)));
    const missing = [...keys].filter((k) => !sc[k]).length, extra = Object.keys(sc).filter((k) => !keys.has(k)).length, noWhy = Object.values(sc).filter((x) => x.t !== 'u' && !x.why).length;
    if (missing) W(`scope.json: у ${missing} пунктов нет ярлыка`);
    if (extra) E(`scope.json: ${extra} ключей без пункта`);
    if (noWhy) W(`scope.json: у ${noWhy} китайских и смешанных пунктов нет пояснения`);
    stats.scope = Object.keys(sc).length;
  }

  // счётчики в тексте
  const declared = [...new Set([...(readFileSync('ru/index.html', 'utf8') + readme).matchAll(/(\d{3})\s+пункт/g)].map((m) => Number(m[1])))];
  for (const d of declared.filter((x) => x >= 500)) if (d !== stats.entries) W(`в тексте заявлено «${d} пунктов», по факту ${stats.entries}`);

  return { errors, warnings, stats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = validate();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    for (const w of r.warnings) console.log('предупреждение:', w);
    for (const e of r.errors) console.log('ОШИБКА:', e);
    console.log(`\nзаписей ${r.stats.entries}, A/B/C ${r.stats.A}/${r.stats.B}/${r.stats.C}, спорных ${r.stats.disputes}, «В России» ${r.stats.russia}, сносок ${r.stats.xrefs} (битых ${r.stats.badXrefs}); ошибок ${r.errors.length}, предупреждений ${r.warnings.length}`);
  }
  process.exit(r.errors.length ? 1 : 0);
}
