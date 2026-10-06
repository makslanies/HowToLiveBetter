// Shared by static pages and the browser (inlined by build-index.mjs).
export const COUNTRY_GUIDE = 'Китайские условия и российские данные разделены внутри полей «Простыми словами», «Затраты», «Выгода» и «Примечания». Российские цены не означают проверку российских правил. Оценки выгодности, доказательности и затрат относятся к исходной версии, если отдельно не указано иное.';

export function readCountryField(e, line) {
  const m = /^- (Простыми словами|Затраты|Выгода|Примечания) \(Россия\):\s*(.*)$/.exec(line);
  if (!m) return false;
  const key = { 'Простыми словами': 'human', 'Затраты': 'cost', 'Выгода': 'gain', 'Примечания': 'note' }[m[1]];
  e.russian ||= {};
  e.russian[key] = m[2];
  e.ru = Object.values(e.russian).join(' ');
  return true;
}

export function countryView(e, sc) {
  const scoped = !sc || sc.t !== 'u';
  const hasRu = !!e.ru;
  const original = scoped ? 'Китай — исходная версия' : 'Исходная версия';
  const missing = 'Российская версия этого поля пока не проверена.';
  const russian = hasRu ? {
    human: missing, cost: missing, gain: e.russian ? missing : e.ru,
    note: 'Российские данные проверены частично. Оценки исходной версии на них автоматически не переносятся.',
    ...e.russian,
  } : null;
  const notice = hasRu
    ? 'Китайские условия и российские данные разделены по полям. Российская сверка частичная; непроверенные поля отмечены отдельно. Оценки и фильтры относятся к исходной версии.'
    : scoped
      ? 'Здесь приведена исходная версия с китайскими условиями. Российские правила пока не проверены; китайские законы, выплаты и телефоны нельзя переносить на Россию.'
      : '';
  return { original, labeled: scoped || hasRu || !!e.price, russian, notice };
}

export function countrySummary(e, sc) {
  const v = countryView(e, sc);
  const base = e.human || e.gain || '';
  return (v.labeled ? v.original + ': ' : '') + base + (v.russian ? ' Россия: ' + v.russian.human : '');
}

export function countryStatus(e, sc) {
  return e.ru ? 'Китай / Россия: частичные российские данные' : (!sc || sc.t !== 'u') ? 'Китай; Россия пока не проверена' : 'Общие данные';
}

export function sourceGroups(e, sc) {
  const v = countryView(e, sc);
  return [
    { title: v.labeled ? v.original + ' — источники' : 'Источники исходной версии', text: e.srcOriginal || e.src },
    { title: 'Россия — источники', text: (e.srcRussia || '').replace(/;\s+/g, ' ; ') },
    { title: 'Россия — источники цен', text: (e.srcPrices || '').replace(/;\s+/g, ' ; ') },
  ].filter((g) => g.text);
}
