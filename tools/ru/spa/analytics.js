/* Яндекс Метрика (счётчик 113465970) загружается только после согласия посетителя.
   Код счётчика ниже взят без изменений. Тег <noscript> с картинкой не используется: без JavaScript согласие дать нельзя, а картинка отправляла бы данные без него.
   Выбор хранится в localStorage (ключ hltb-cookie-consent). Кнопка «Настройки cookie» в подвале (data-cookie-settings) открывает окно снова. */
(function () {
  var KEY = 'hltb-cookie-consent';
  var scr = document.currentScript;
  var base = scr && scr.src ? scr.src.replace(/assets\/analytics\.js.*$/, '') : '/';

  function loadMetrika() {
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=113465970', 'ym');

    ym(113465970, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
  }

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  // при отказе стираем cookie Метрики на этом сайте (_ym*) и перезагружаем страницу, чтобы счётчик не остался в памяти
  function clearYm() {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n.indexOf('_ym') === 0) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
  }

  function showBanner() {
    if (document.getElementById('cookie-banner')) return;
    var d = document.createElement('div');
    d.id = 'cookie-banner'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookie и статистика');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:680px;margin:0 auto;padding:14px 16px;background:#fff;color:#222;border:1px solid #c9c9cc;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.2);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    d.innerHTML = '<p style="margin:0 0 10px">Сайт использует <b>Яндекс Метрику</b>: она ставит cookie и записывает действия на странице (клики, прокрутку, Вебвизор), чтобы мы видели, чем пользуются читатели. Включить? Подробнее в <a href="' + base + 'privacy/" style="color:#3451b2">политике конфиденциальности</a>.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-cc="yes" style="padding:7px 16px;border:0;border-radius:6px;background:#3451b2;color:#fff;font:inherit;cursor:pointer">Принять</button>' +
      '<button type="button" data-cc="no" style="padding:7px 16px;border:1px solid #c9c9cc;border-radius:6px;background:#fff;color:#222;font:inherit;cursor:pointer">Отказаться</button></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-cc]'); if (!b) return;
      var was = get(); set(b.getAttribute('data-cc')); d.remove();
      if (b.getAttribute('data-cc') === 'yes') loadMetrika();
      else if (was === 'yes') { clearYm(); location.reload(); } else clearYm();
    });
    var first = d.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-cookie-settings]');
    if (a) { ev.preventDefault(); showBanner(); }
  });

  // цели Метрики по действиям читателей (создаются в кабинете или через API с теми же идентификаторами); сработают только после согласия на статистику
  var GOALS = [['#print-btn,.print-icon,.print-btn', 'print'], ['.sg,.suggest a', 'suggest_edit'], ['a[href*="library/"]', 'library_open'], ['[data-dim="rus"] .chip', 'filter_russia'], ['a[href^="mailto:"]', 'mail_author'], ['.sug-item', 'search_suggest_open']];
  document.addEventListener('click', function (ev) {
    if (get() !== 'yes' || typeof window.ym !== 'function' || !ev.target.closest) return;
    for (var i = 0; i < GOALS.length; i++) { if (ev.target.closest(GOALS[i][0])) { window.ym(113465970, 'reachGoal', GOALS[i][1]); break; } }
  });

  function start() { var v = get(); if (v === 'yes') loadMetrika(); else if (v !== 'no') showBanner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
