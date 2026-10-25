/* Форма «Предложить правку». Конфиг: window.__HLTB_FEEDBACK__ = { endpoint }. Без endpoint ссылка остаётся mailto. */
(function () {
  var cfg = window.__HLTB_FEEDBACK__ || {};
  var endpoint = String(cfg.endpoint || '').trim();
  if (!endpoint) return;

  var STYLE = '.hltb-fb{box-sizing:border-box;width:min(480px,calc(100vw - 32px));margin:auto;padding:20px;border:1px solid var(--line,#ccc);border-radius:12px;background:var(--bg-elv,var(--bg,#fff));color:var(--t1,#222);box-shadow:0 12px 40px rgba(0,0,0,.25)}' +
    '.hltb-fb::backdrop{background:rgba(0,0,0,.45)}' +
    '.hltb-fb h2{margin:0 0 6px;font-size:18px}' +
    '.hltb-fb .hltb-fb-item{margin:0 0 4px;font-size:14px;color:var(--t2,#444)}' +
    '.hltb-fb label{display:block;margin:12px 0 0;font-size:14px;font-weight:600}' +
    '.hltb-fb label span{font-weight:400;color:var(--t3,#666)}' +
    '.hltb-fb textarea,.hltb-fb input{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:8px 10px;font:inherit;font-weight:400;border:1px solid var(--divider,#bbb);border-radius:8px;background:var(--bg,#fff);color:inherit}' +
    '.hltb-fb textarea{min-height:110px;resize:vertical}' +
    '.hltb-fb .hltb-fb-note{margin:12px 0 0;font-size:13px;color:var(--t3,#666)}' +
    '.hltb-fb .hltb-fb-status{min-height:1.4em;margin:10px 0 0;font-size:14px}' +
    '.hltb-fb .hltb-fb-status.is-err{color:#b3261e}' +
    '.hltb-fb .hltb-fb-status a{color:inherit}' +
    '.hltb-fb .hltb-fb-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}' +
    '.hltb-fb .hltb-fb-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}' +
    '.hltb-fb button{font:inherit;padding:8px 16px;border:1px solid var(--line,#bbb);border-radius:8px;background:transparent;color:inherit;cursor:pointer}' +
    '.hltb-fb button[type=submit]{background:var(--brand,#3451b2);border-color:var(--brand,#3451b2);color:#fff}' +
    '.hltb-fb button:disabled{opacity:.6;cursor:default}';

  var dlg = null, form = null, statusEl = null, sendBtn = null, itemEl = null, mailHref = '', current = null;

  function build() {
    var st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);

    dlg = document.createElement('dialog');
    dlg.className = 'hltb-fb';
    dlg.setAttribute('aria-labelledby', 'hltb-fb-title');
    dlg.innerHTML =
      '<form novalidate>' +
      '<h2 id="hltb-fb-title">Предложить правку</h2>' +
      '<p class="hltb-fb-item"></p>' +
      '<label>Что исправить<textarea name="text" maxlength="2000" class="ym-disable-keys"></textarea></label>' +
      '<label>Источник, на который опереться <span>(необязательно)</span><input name="source" type="url" maxlength="500" class="ym-disable-keys"></label>' +
      '<label>Почта для ответа <span>(необязательно)</span><input name="contact" type="email" maxlength="200" autocomplete="email" class="ym-disable-keys"></label>' +
      '<p class="hltb-fb-note">Письмо получит владелец сайта. Почту указывайте, только если хотите получить ответ.</p>' +
      '<label class="hltb-fb-hp" aria-hidden="true">Не заполняйте это поле<input name="website" tabindex="-1" autocomplete="off"></label>' +
      '<p class="hltb-fb-status" role="status" aria-live="polite"></p>' +
      '<div class="hltb-fb-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Отправить</button></div>' +
      '</form>';
    document.body.appendChild(dlg);

    form = dlg.querySelector('form');
    statusEl = dlg.querySelector('.hltb-fb-status');
    sendBtn = dlg.querySelector('button[type=submit]');
    itemEl = dlg.querySelector('.hltb-fb-item');

    form.addEventListener('submit', send);
    dlg.querySelector('[data-cancel]').addEventListener('click', function () { dlg.close(); });
  }

  function setStatus(text, isErr) {
    statusEl.textContent = '';
    statusEl.className = 'hltb-fb-status' + (isErr ? ' is-err' : '');
    statusEl.appendChild(document.createTextNode(text));
    if (isErr && mailHref) {
      var a = document.createElement('a');
      a.href = mailHref;
      a.textContent = ' Или напишите на почту.';
      statusEl.appendChild(a);
    }
  }

  function open(el) {
    if (!dlg) build();
    current = el;
    mailHref = el.getAttribute('href') || '';
    var where = el.dataset.sec && el.dataset.n ? 'Пункт: раздел ' + el.dataset.sec + ', пункт ' + el.dataset.n + '. ' : '';
    itemEl.textContent = where + (el.dataset.title || '');
    form.reset();
    setStatus('');
    sendBtn.disabled = false;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    form.text.focus();
  }

  function send(ev) {
    ev.preventDefault();
    var f = form;
    var data = {
      section: current.dataset.sec || '',
      item: current.dataset.n || '',
      title: current.dataset.title || '',
      url: current.dataset.url || location.href,
      text: f.text.value,
      source: f.source.value,
      contact: f.contact.value,
      website: f.website.value,
    };
    if (!data.text.trim()) {
      setStatus('Напишите, что нужно исправить.', true);
      f.text.focus();
      return;
    }
    sendBtn.disabled = true;
    setStatus('Отправляем…');
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || String(r.status));
      });
    }).then(function () {
      f.reset();
      setStatus('Спасибо. Сообщение отправлено.');
    }).catch(function (err) {
      setStatus(err && err.message && /[а-яё]/i.test(err.message) ? err.message : 'Не получилось отправить. Попробуйте позже.', true);
    }).then(function () {
      sendBtn.disabled = false;
    });
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-suggest]');
    if (!el) return;
    ev.preventDefault();
    open(el);
  });
})();
