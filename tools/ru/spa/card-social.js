/* Главная: панель лайка и репоста в каждой карточке пункта (слот .hltb-card-social в заголовке).
   Панель монтируется, когда карточка приближается к экрану: счётчики грузятся по требованию, без анимаций.
   Шаблон — <template id="hltb-social-tpl">, логика — window.__hltbSocialMount из social.js. */
(function () {
  var tpl = document.getElementById('hltb-social-tpl');
  if (!tpl || typeof window.__hltbSocialMount !== 'function' || !('IntersectionObserver' in window)) return;

  function attr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function mountCard(card) {
    var slot = card.querySelector('.hltb-card-social');
    if (!slot || slot.firstChild) return;
    var key = card.id.slice(2);                       // e-1-5 -> 1-5
    var title = (card.querySelector('.t') || {}).textContent || '';
    var url = new URL('p/' + key + '/', location.href).href;
    var wrap = document.createElement('div');
    wrap.innerHTML = tpl.innerHTML
      .split('__KEY__').join(attr(key))
      .split('__TITLE__').join(attr(title))
      .split('__URL__').join(attr(url));
    var panel = wrap.firstElementChild;
    slot.appendChild(panel);
    window.__hltbSocialMount(panel);
  }

  // Когда список только отрисован, десятки карточек могут пересечь порог одновременно:
  // IntersectionObserver отдаёт их одним пакетом. Монтируем по одной за простой кадр,
  // иначе цикл mountCard (fetch счётчиков + слушатели на карточку) даёт одну длинную
  // задачу на весь пакет и рушит INP/TBT главной страницы.
  var queue = [];
  var flushScheduled = false;
  function flushOne(deadline) {
    var budget = deadline && deadline.timeRemaining ? deadline.timeRemaining() : 8;
    while (queue.length && budget > 4) {
      mountCard(queue.shift());
      budget = deadline && deadline.timeRemaining ? deadline.timeRemaining() : 0;
    }
    if (queue.length) scheduleFlush();
    else flushScheduled = false;
  }
  function scheduleFlush() {
    flushScheduled = true;
    if ('requestIdleCallback' in window) requestIdleCallback(flushOne, { timeout: 300 });
    else setTimeout(flushOne, 16);
  }
  function enqueue(card) {
    queue.push(card);
    if (!flushScheduled) scheduleFlush();
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      enqueue(en.target);
      io.unobserve(en.target);
    });
  }, { rootMargin: '300px 0px' });

  function watch() {
    document.querySelectorAll('article.card[id^="e-"]:not([data-social-watch])').forEach(function (card) {
      card.setAttribute('data-social-watch', '');
      io.observe(card);
    });
  }

  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  watch();
})();
