/* ---------- подсказки под строкой поиска: похожие слова и список пунктов, где слово встречается ---------- */
let VOCAB = null, SUG_ACTIVE = -1, SUG_TM = 0;
function buildVocab() {
  const m = new Map();
  for (const card of CARDS) for (const w of (card.e.hay.match(/[а-я]{3,}/g) || [])) m.set(w, (m.get(w) || 0) + 1);
  VOCAB = [...m].sort((a, b) => b[1] - a[1]);
}
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let lo = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v); if (v < lo) lo = v;
    }
    if (lo > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Слова из текста книги, похожие на последнее набранное: с тем же началом, а если таких мало, то с опечаткой в одну-две буквы
function similarWords(term) {
  const t = normQ(term);
  if (t.length < 3 || !/^[а-я]+$/.test(t)) return [];
  if (!VOCAB) buildVocab();
  const stem = stemOf(t), out = [];
  for (const [w] of VOCAB) { if (w !== t && w.startsWith(stem)) { out.push(w); if (out.length >= 6) break; } }
  if (out.length < 3 && t.length >= 4) {
    const max = t.length > 6 ? 2 : 1;
    for (const [w] of VOCAB) { if (w !== t && !out.includes(w) && editDist(t, w, max) <= max) { out.push(w); if (out.length >= 6) break; } }
  }
  return out;
}
function snipText(e) {
  return e._snip ||= [e.human, e.gain, e.cost, e.note, e.ru, e.price].filter(Boolean).join(' · ').replace(/\*\*/g, '').replace(/\\([*_])/g, '$1').replace(/\s+/g, ' ');
}
function suggestEntries(Q, relax) {
  const rows = [];
  for (const card of CARDS) {
    const e = card.e;
    if (!matchQuery(e.hay, Q, relax)) continue;
    const title = normQ(e.title), human = normQ(e.human || '');
    let score = 0;
    for (const t of Q.hl) score += (title.includes(t) ? 3 : 0) + (human.includes(t) ? 2 : 0) + 1;
    rows.push({ e, score });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}
function snippetNodes(e, hl) {
  const text = snipText(e), low = normQ(text);
  let at = -1, len = 0;
  for (const t of hl) { const k = low.indexOf(t); if (k !== -1 && (at === -1 || k < at)) { at = k; len = t.length; } }
  const frag = document.createDocumentFragment();
  if (at === -1) { frag.append((e.human || text).slice(0, 110)); return frag; }
  let end = at + len; while (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) end++;
  const from = Math.max(0, at - 45), to = Math.min(text.length, end + 70);
  frag.append((from > 0 ? '…' : '') + text.slice(from, at));
  const mk = document.createElement('mark'); mk.textContent = text.slice(at, end); frag.append(mk);
  frag.append(text.slice(end, to) + (to < text.length ? '…' : ''));
  return frag;
}
function wireSuggest() {
  const input = document.getElementById('q'), box = document.getElementById('sug');
  if (!input || !box) return;
  const close = () => { box.hidden = true; SUG_ACTIVE = -1; };
  const items = () => [...box.querySelectorAll('.sug-item')];
  const mark = () => items().forEach((it, i) => it.classList.toggle('on', i === SUG_ACTIVE));
  const render = () => {
    const raw = input.value.trim();
    if (raw.length < 2) { close(); return; }
    const Q = parseQuery(raw);
    let rows = suggestEntries(Q, false), relaxed = false;
    if (!rows.length && Q.pos.length > 1) { rows = suggestEntries(Q, true); relaxed = true; }
    const words = raw.split(/\s+/), last = words[words.length - 1].replace(/^-/, '');
    const sim = similarWords(last);
    box.textContent = '';
    if (sim.length) {
      const wrap = document.createElement('div'); wrap.className = 'sug-words';
      const lab = document.createElement('span'); lab.textContent = 'Похожие слова: '; wrap.append(lab);
      for (const w of sim) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sug-word'; b.textContent = w;
        b.addEventListener('mousedown', (ev) => { ev.preventDefault(); words[words.length - 1] = (words[words.length - 1].startsWith('-') ? '-' : '') + w; input.value = words.join(' '); input.dispatchEvent(new Event('input')); render(); input.focus(); });
        wrap.append(b);
      }
      box.append(wrap);
    }
    if (!rows.length) {
      const none = document.createElement('div'); none.className = 'sug-none'; none.textContent = 'В тексте книги такого нет. Попробуйте похожее слово или короче.'; box.append(none);
    } else {
      const head = document.createElement('div'); head.className = 'sug-head';
      head.textContent = (relaxed ? 'Есть хотя бы одно из слов: ' : 'Встречается в пунктах: ') + rows.length;
      box.append(head);
      for (const { e } of rows.slice(0, 8)) {
        const a = document.createElement('a'); a.className = 'sug-item'; a.href = '#e-' + e.sec + '-' + e.n; a.dataset.go = e.sec + '-' + e.n;
        const t = document.createElement('b'); t.textContent = e.sec + '.' + e.n + ' ' + e.title;
        const s = document.createElement('span'); s.append(snippetNodes(e, Q.hl));
        a.append(t, s);
        a.addEventListener('mousedown', (ev) => { ev.preventDefault(); close(); gotoItem(e.sec + '-' + e.n); });
        box.append(a);
      }
      if (rows.length > 8) {
        const more = document.createElement('div'); more.className = 'sug-more'; more.textContent = 'Ещё ' + (rows.length - 8) + '. Нажмите Enter, чтобы показать все в ленте.'; box.append(more);
      }
    }
    const r = input.getBoundingClientRect(), p = box.offsetParent ? box.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    box.style.left = Math.max(0, r.left - p.left) + 'px'; box.style.top = (r.bottom - p.top + 6) + 'px'; box.style.width = Math.min(560, Math.max(r.width, 320)) + 'px';
    box.hidden = false; SUG_ACTIVE = -1;
  };
  input.addEventListener('input', () => { clearTimeout(SUG_TM); SUG_TM = setTimeout(render, 90); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (ev) => {
    const list = items();
    if (ev.key === 'Escape') { close(); return; }
    if (box.hidden || !list.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); SUG_ACTIVE = (SUG_ACTIVE + 1) % list.length; mark(); list[SUG_ACTIVE].scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); SUG_ACTIVE = (SUG_ACTIVE - 1 + list.length) % list.length; mark(); list[SUG_ACTIVE].scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'Enter' && SUG_ACTIVE >= 0) { ev.preventDefault(); const key = list[SUG_ACTIVE].dataset.go; close(); gotoItem(key); }
  });
  document.addEventListener('scroll', close, { passive: true });
}
