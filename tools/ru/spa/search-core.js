/* ---------- поиск: нормализация, основы слов, синонимы, фразы, минус-слова, номер пункта ---------- */
let RELAX = false, JUMP_FILLED = false;
const normQ = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
// Грубая основа: у русских слов отбрасываем окончание («прививку», «прививки» → «привив»); остальное без изменений
function stemOf(w) {
  if (!/^[а-я]+$/.test(w)) return w;
  if (w.length >= 7) return w.slice(0, -2);
  if (w.length >= 5) return w.slice(0, -1);
  return w;
}
// Разговорное слово и официальный термин книги: поиск по одному находит и другое
const SYN_RAW = [
  ['курить', 'курение', 'табак', 'сигарета', 'никотин'], ['зарплата', 'заработная', 'оплата труда'],
  ['развод', 'расторжение'], ['машина', 'автомобиль', 'авто'], ['ребенок', 'дети', 'младенец'],
  ['деньги', 'денег', 'средства'], ['полиция', 'полицейский', 'мвд'], ['врач', 'доктор', 'медицинская помощь', 'поликлиника'],
  ['налог', 'ндфл', 'вычет'], ['пенсия', 'пенсионный', 'сфр'], ['уволить', 'увольнение', 'сокращение'],
  ['кредит', 'заем', 'займ', 'ссуда'], ['мошенник', 'мошенничество', 'аферист', 'обман'], ['пожар', 'огонь', 'возгорание'],
  ['лекарство', 'препарат', 'таблетки'], ['жилье', 'квартира', 'недвижимость'], ['алкоголь', 'спиртное', 'выпивка'],
];
const SYN = SYN_RAW.map((g) => g.map((w) => normQ(w)).map((w) => (w.includes(' ') ? w : stemOf(w))));
function altsFor(t) { for (const g of SYN) if (g.includes(t)) return [...new Set(g)]; return [t]; }
// "точная фраза" в кавычках, -минус для исключения слова, 5-38 или 5.38 — номер пункта
function parseQuery(raw) {
  const phr = [], neg = [], pos = [];
  let q = normQ(raw).replace(/["«»]([^"«»]+)["«»]/g, (m, p) => { if (p.trim().length > 1) phr.push(p.trim()); return ' '; });
  for (const w of q.split(/\s+/).filter(Boolean)) {
    if (w[0] === '-' && w.length > 2) { neg.push(stemOf(w.slice(1))); continue; }
    const id = /^(\d{1,2})[-.](\d{1,2})$/.exec(w);
    if (id) { pos.push(['§' + id[1] + '-' + id[2] + ' ']); continue; }
    if (w.length < 2) continue;
    pos.push(altsFor(stemOf(w)));
  }
  const hl = [...new Set([...pos.flat().filter((x) => x[0] !== '§'), ...phr])];
  return { pos, neg, phr, hl };
}
function matchQuery(hay, Q, relax) {
  if (Q.neg.some((n) => hay.includes(n))) return false;
  if (!Q.phr.every((p) => hay.includes(p))) return false;
  if (!Q.pos.length) return true;
  const hit = (alts) => alts.some((a) => hay.includes(a));
  return relax ? Q.pos.some(hit) : Q.pos.every(hit);
}
function fillJump() {
  const jmp = document.getElementById('jump');
  if (!jmp || JUMP_FILLED || !SECS.size) return;
  JUMP_FILLED = true;
  for (const [n, s] of SECS) { const o = document.createElement('option'); o.value = n; o.textContent = n + '. ' + s.title.slice(0, 40); jmp.append(o); }
  jmp.addEventListener('change', () => { if (jmp.value) gotoItem('s' + jmp.value); jmp.value = ''; });
}
function wirePlain() {
  const pt = document.getElementById('plain-toggle');
  if (!pt) return;
  const set = (on) => { document.body.classList.toggle('plain-only', on); pt.setAttribute('aria-pressed', String(on)); try { localStorage.setItem('hltb-plain', on ? '1' : ''); } catch (err) { /* без хранилища просто не запоминаем */ } };
  let saved = false; try { saved = !!localStorage.getItem('hltb-plain'); } catch (err) { /* нет хранилища */ }
  set(saved);
  pt.addEventListener('click', () => set(!document.body.classList.contains('plain-only')));
}
