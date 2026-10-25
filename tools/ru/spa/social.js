/* Анонимные лайки и шаринг. Конфиг: window.__HLTB_SOCIAL__ = { base, enabled }. */
(function () {
  var cfg = window.__HLTB_SOCIAL__ || {};
  if (cfg.enabled === false) return;
  var base = String(cfg.base == null ? '' : cfg.base).replace(/\/$/, '');
  var root = document.querySelector('.hltb-social');
  if (!root) return;

  var key = root.getAttribute('data-key');
  var title = root.getAttribute('data-title') || '';
  var pageUrl = root.getAttribute('data-url') || location.href;
  if (!key) return;

  try {
    pageUrl = new URL(pageUrl, location.href).href.replace(/#.*$/, '');
  } catch (_) {}

  var DID = 'hltb-device-id';
  function deviceId() {
    try {
      var id = localStorage.getItem(DID);
      if (id && id.length >= 16) return id;
      id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(16).slice(2));
      localStorage.setItem(DID, id);
      return id;
    } catch (_) {
      return 'anon-' + String(Date.now());
    }
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(base + path, {
      method: opts.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-device-id': deviceId(),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (_) { data = { error: t }; }
        if (!r.ok) {
          var err = new Error((data && data.error) || (r.status + ' error'));
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  var likeBtn = root.querySelector('[data-act="like"]');
  var shareBtn = root.querySelector('[data-act="share"]');
  var menu = root.querySelector('[data-share-menu]');
  var likeCount = root.querySelector('[data-count="likes"]');
  var repostCount = root.querySelector('[data-count="reposts"]');
  var status = root.querySelector('[data-status]');

  var statusTimer = null;
  function setStatus(msg) {
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('is-on', !!msg);
    if (statusTimer) clearTimeout(statusTimer);
    if (msg) {
      statusTimer = setTimeout(function () {
        status.classList.remove('is-on');
      }, 2200);
    }
  }

  function paint(s) {
    if (!s) return;
    if (likeCount) likeCount.textContent = String(s.likes || 0);
    if (repostCount) repostCount.textContent = String(s.reposts || 0);
    if (likeBtn) {
      likeBtn.setAttribute('aria-pressed', s.liked ? 'true' : 'false');
      likeBtn.classList.toggle('is-on', !!s.liked);
    }
  }

  function busy(on) {
    if (likeBtn) likeBtn.disabled = !!on;
    if (shareBtn) shareBtn.disabled = !!on;
  }

  function loadStats() {
    return api('/v1/entry/' + encodeURIComponent(key))
      .then(function (s) {
        root.classList.remove('is-offline');
        paint(s);
        return s;
      })
      .catch(function (e) {
        if (e.status === 429) setStatus('Слишком часто. Подождите немного.');
        else {
          root.classList.add('is-offline');
          setStatus('Счётчики временно недоступны');
        }
      });
  }
  loadStats();

  function recordRepost(via) {
    return api('/v1/entry/' + encodeURIComponent(key) + '/repost', {
      method: 'POST',
      body: { title: title, url: pageUrl, via: via || '' },
    }).then(function (s) {
      paint(s);
      return s;
    });
  }

  function shareText() {
    return title ? (title + '\n' + pageUrl) : pageUrl;
  }

  function shareTargets(url) {
    var u = encodeURIComponent(url);
    var plain = encodeURIComponent(shareText());
    return {
      vk: 'https://vk.com/share.php?url=' + u + '&title=' + encodeURIComponent(title),
      ok: 'https://connect.ok.ru/offer?url=' + u + '&title=' + encodeURIComponent(title),
      tg: 'https://t.me/share/url?url=' + u + '&text=' + encodeURIComponent(title),
      max: 'https://max.ru/:share?text=' + plain,
      wa: 'https://api.whatsapp.com/send?text=' + plain,
    };
  }

  function setMenuOpen(open) {
    if (!menu || !shareBtn) return;
    menu.hidden = !open;
    menu.classList.toggle('is-open', !!open);
    shareBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function copyFallback(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return copyFallback(text); });
    }
    return copyFallback(text);
  }

  if (likeBtn) {
    likeBtn.addEventListener('click', function () {
      busy(true);
      setStatus('');
      api('/v1/entry/' + encodeURIComponent(key) + '/like', { method: 'POST' })
        .then(function (s) {
          paint(s);
          setStatus(s.liked ? 'Лайк учтён' : 'Лайк снят');
        })
        .catch(function (e) {
          setStatus(e.status === 429 ? 'Слишком часто. Подождите немного.' : 'Не удалось поставить лайк');
        })
        .then(function () { busy(false); });
    });
  }

  if (shareBtn && menu) {
    var targets = shareTargets(pageUrl);
    menu.querySelectorAll('a[data-share]').forEach(function (a) {
      var kind = a.getAttribute('data-share');
      if (targets[kind]) a.href = targets[kind];
    });

    shareBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setMenuOpen(menu.hidden);
    });

    document.addEventListener('click', function (ev) {
      if (!root.contains(ev.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setMenuOpen(false);
    });

    menu.addEventListener('click', function (ev) {
      var item = ev.target.closest('[data-share]');
      if (!item) return;
      var kind = item.getAttribute('data-share');

      if (kind === 'copy') {
        ev.preventDefault();
        busy(true);
        copyText(pageUrl)
          .then(function () { return recordRepost('copy'); })
          .then(function () {
            setStatus('Ссылка скопирована');
            setMenuOpen(false);
          })
          .catch(function (e) {
            setStatus(e.status === 429 ? 'Слишком часто. Подождите немного.' : 'Не удалось скопировать');
          })
          .then(function () { busy(false); });
        return;
      }

      // внешняя сеть: считаем репост, ссылка уже в href
      recordRepost(kind)
        .then(function () {
          setStatus('Репост учтён');
          setMenuOpen(false);
        })
        .catch(function (e) {
          setStatus(e.status === 429 ? 'Слишком часто. Подождите немного.' : 'Не удалось учесть репост');
        });
    });
  }
})();
