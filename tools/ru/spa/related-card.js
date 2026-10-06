  const rk = RELATED[e.sec + '-' + e.n] || [];
  f.rel.hidden = f.relK.hidden = !rk.length;
  if (rk.length && !f.rel.firstChild){
    rk.forEach((k, i) => {
      const t = ITEMS.get(k); if (!t) return;
      if (i) f.rel.append('; ');
      const a = document.createElement('a'); a.href = '#e-' + k; a.dataset.go = k;
      a.textContent = `раздел ${t.sec}, пункт ${t.n}: ${t.title} (${countryStatus(t, SCOPE[k])})`;
      f.rel.append(a);
    });
  }
