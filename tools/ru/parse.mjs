// Разбор ru/book/*.md в структуру: разделы, введения, записи с полями и тегом стоимости.
// Общий для страниц (pages.mjs), «Смотрите также» (related.mjs) и проверок.
import { readFileSync, readdirSync } from 'node:fs';

const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };
export const LENS = { '死亡率': 'для жизни', '金钱': 'для денег', '时间': 'для времени и сил', '自由': 'для свободы' };
export const LABEL = { money: { '0': 'бесплатно', '少': 'немного денег', '多': 'много денег' }, time: { '少': 'мимоходом', '中': 'несколько часов', '多': 'каждый день' }, will: { '否': 'без силы воли', '些': 'немного силы воли', '是': 'много силы воли' } };

export function ratioOf(t) {
  const cs = (COST_W.money[t.money] ?? 0) + (COST_W.time[t.time] ?? 0) + (COST_W.will[t.will] ?? 0);
  return t.level === '大' ? (cs === 0 ? 'очень высокая' : cs <= 2 ? 'высокая' : 'обычная') : t.level === '中' ? (cs === 0 ? 'высокая' : 'обычная') : 'обычная';
}

export function parseBook(dir = 'ru/book') {
  const sections = [];
  for (const f of readdirSync(dir).filter((x) => /^\d\d-.+\.md$/.test(x)).sort()) {
    const text = readFileSync(`${dir}/${f}`, 'utf8');
    const parts = text.split(/^(?=### )/m);
    const head = parts[0].split('\n');
    const m = /^# (\d+)\. (.+)$/.exec(head.find((l) => /^# /.test(l)) || '');
    const sec = { n: m ? Number(m[1]) : Number(f.slice(0, 2)), title: m ? m[2].trim() : f, file: f, intro: [], entries: [] };
    sec.intro = head.filter((l) => l.trim() && !/^# /.test(l) && !/^\[← /.test(l)).map((l) => l.trim());
    for (const p of parts.slice(1)) {
      const hm = /^### (\d+)\. (.+)$/.exec(p.split('\n')[0]);
      if (!hm) continue;
      const e = { sec: sec.n, n: Number(hm[1]), title: hm[2].trim(), tag: {}, cost: '', price: '', human: '', gain: '', grade: '', src: '', note: '', ru: '' };
      for (const l of p.split('\n').slice(1)) {
        let x;
        if ((x = /^<!--\s*成本标签:\s*(.*?)\s*-->/.exec(l))) { for (const kv of x[1].split(/\s+/)) { const [k, v] = kv.split('='); ({ '钱': () => (e.tag.money = v), '时间': () => (e.tag.time = v), '毅力': () => (e.tag.will = v), '收益': () => (e.tag.level = v), '口径': () => (e.tag.lens = v) })[k]?.(); } }
        else if ((x = /^- Затраты:\s*(.*)$/.exec(l))) e.cost = x[1];
        else if ((x = /^- Цена в России[^:]*:\s*(.*)$/.exec(l))) e.price = x[1];
        else if ((x = /^- Простыми словами:\s*(.*)$/.exec(l))) e.human = x[1];
        else if ((x = /^- Выгода:\s*(.*)$/.exec(l))) e.gain = x[1];
        else if ((x = /^- Уровень доказательств:\s*([ABC])/.exec(l))) e.grade = x[1];
        else if ((x = /^- Источники:\s*(.*)$/.exec(l))) e.src = x[1];
        else if ((x = /^- Источники \(Россия\):\s*(.*)$/.exec(l))) e.src += ' ; Россия: ' + x[1];
        else if ((x = /^- Источники цен \(Россия\):\s*(.*)$/.exec(l))) e.src += ' ; Цены в России: ' + x[1];
        else if ((x = /^- В России:\s*(.*)$/.exec(l))) e.ru = (e.ru ? e.ru + ' ' : '') + x[1];
        else if ((x = /^- Примечание к «В России»:\s*(.*)$/.exec(l))) e.ru = (e.ru ? e.ru + ' ' : '') + x[1];
        else if ((x = /^- Примечания:\s*(.*)$/.exec(l))) e.note = x[1];
      }
      e.dispute = /^Спорно/.test(e.note);
      e.ratio = ratioOf(e.tag);
      sec.entries.push(e);
    }
    sections.push(sec);
  }
  return sections;
}

export const keyOf = (e) => `${e.sec}-${e.n}`;
