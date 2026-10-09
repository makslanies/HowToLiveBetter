function renderCountryField(el, key, e, view, terms) {
  el.textContent = '';
  el.hidden = !e[key] && !view.russian;
  const append = (label, text) => {
    const p = document.createElement('div'); p.className = 'country-part';
    if (label) { const b = document.createElement('strong'); b.textContent = label + '. '; p.append(b); }
    const span = document.createElement('span'); renderText(span, text, terms); p.append(span); el.append(p);
  };
  if (e[key]) append(view.labeled ? view.original : '', e[key]);
  if (view.russian) append('Россия', view.russian[key]);
}

function renderCountrySources(el, e, sc, terms) {
  el.textContent = ''; let count = 0;
  for (const g of sourceGroups(e, sc)) {
    const heading = document.createElement('p'); heading.className = 'source-country'; heading.textContent = g.title;
    const body = document.createElement('div'); count += renderSrc(body, g.text, terms);
    if (g.title === 'Источники') el.append(body); else el.append(heading, body);
  }
  return count;
}
