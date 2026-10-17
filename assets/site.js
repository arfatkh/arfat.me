/*
 * site.js — shared progressive-enhancement script for arfat.me
 *
 * Loaded with `defer` from the shared <head> partial. Every route is a real
 * HTML document that works fully without this file; JS only enhances it.
 *
 * Two kinds of feature:
 *   - global (run once): router, keyboard nav, lightbox, nav scroll shadow.
 *     They hang off document/window or the persistent nav wrapper.
 *   - per-page (re-run after every router swap): reading progress, TOC.
 *     Each guards on its own markup and returns a cleanup function.
 *
 * The router (swup, vendored in assets/vendor/swup and bundled ahead of this
 * file by build.mjs) keeps the page shell alive and swaps only the nav and
 * <main> with those of the fetched real document, so navigation feels like the
 * old single-file site while every URL stays a crawlable page.
 */
(function () {
  'use strict';

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Per-page features ───────────────────────────────────────────────────

  // Reading-progress bar, guarded on the post article.
  function initReadingProgress() {
    const el = document.querySelector('.post-article');
    if (!el) return;

    const prog = Object.assign(document.createElement('div'), { id: 'reading-progress' });
    document.body.appendChild(prog);

    function update() {
      const h = el.offsetHeight - window.innerHeight;
      const s = window.scrollY - el.offsetTop;
      prog.style.width = Math.max(0, Math.min(100, (s / h) * 100)) + '%';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
    return function () {
      window.removeEventListener('scroll', update);
      prog.remove();
    };
  }

  // Table-of-contents sidebar, guarded on the TOC sidebar.
  function initToc() {
    const el = document.querySelector('.toc-sidebar');
    if (!el) return;
    const nav = el.querySelector('nav');
    const prose = document.querySelector('.post-article .prose');
    if (!nav || !prose) return;
    nav.innerHTML = '';
    const heads = prose.querySelectorAll('h2');
    if (heads.length < 2) return;
    const slug = (s) => s.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    const links = [];
    heads.forEach((h, i) => {
      if (!h.id) h.id = slug(h.textContent) || ('wi-s' + i);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      });
      nav.appendChild(a);
      links.push({ a, h });
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach(({ a }) => a.classList.remove('toc-active'));
          const m = links.find(({ h }) => h === entry.target);
          if (m) m.a.classList.add('toc-active');
        }
      });
    }, { rootMargin: '-10% 0px -80% 0px' });
    heads.forEach((h) => observer.observe(h));
    return function () { observer.disconnect(); };
  }

  // Zoomable screenshots: reachable and operable from the keyboard.
  const ZOOMABLE = 'img.project-screenshot, .ss-grid img';
  function initZoomables() {
    document.querySelectorAll(ZOOMABLE).forEach((img) => {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Enlarge image: ' + img.alt);
    });
  }

  // 404: name the path that wasn't found (textContent, so nothing is parsed).
  function initNotFound() {
    const code = document.getElementById('nf-path');
    if (!code) return;
    try { code.textContent = decodeURI(location.pathname); } catch { code.textContent = location.pathname; }
    code.parentElement.hidden = false;
  }

  const pageFeatures = [initReadingProgress, initToc, initZoomables, initNotFound];
  let cleanups = [];
  function mountPage() {
    cleanups = pageFeatures.map((f) => f()).filter(Boolean);
  }
  function unmountPage() {
    cleanups.forEach((fn) => fn());
    cleanups = [];
  }

  // ── Router (swup) ───────────────────────────────────────────────────────

  // Set by initRouter when swup is available; keyboard nav uses it.
  let go = function (href) { location.href = href; };

  function initRouter() {
    if (typeof window.Swup !== 'function') return;

    // Hover/touch/focus preloading, plus any page link that has been on screen
    // for 500ms, so taps on touch screens (no hover) are instant too. Pages are
    // ~10KB gzipped; skipped entirely when the browser asks to save data.
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const preload = new window.SwupPreloadPlugin({
      preloadHoveredLinks: !saveData,
      preloadVisibleLinks: !saveData,
      // Re-fetching the current page on a 404 just logs a second 404.
      preloadInitialPage: !document.getElementById('not-found')
    });

    const swup = new window.Swup({
      // The nav carries the build-stamped aria-current, so swap it with main.
      containers: ['.site-nav', 'main'],
      // No View Transitions for swaps: they cost ~38ms per click in Chrome and
      // Firefox 157 painted blank frames mid-transition. The fadeUp is a plain
      // CSS animation on <main> instead (same as the old single-file site).
      native: false,
      // Don't wait for CSS animations before swapping (no fade-out phase).
      animationSelector: false,
      ignoreVisit: (url, { el, event } = {}) =>
        !!(el && el.closest('[data-no-swup]')) ||
        // e.g. TOC links that scroll themselves, lightbox clicks
        !!(event && event.defaultPrevented) ||
        // Only folder routes are pages; PDFs, images, etc. load normally (and
        // the preload plugin skips them too, it asks this same function).
        !new URL(url, location.href).pathname.endsWith('/'),
      plugins: [
        new window.SwupHeadPlugin(),
        preload,
        // Jump to the top between pages like the old site; restore on back.
        new window.SwupScrollPlugin({
          animateScroll: { betweenPages: false, samePageWithHash: true, samePage: true }
        }),
        new window.SwupA11yPlugin()
      ]
    });

    // Workaround for @swup/preload-plugin 3.2.12: hover preloads are keyed by
    // the link's absolute href, but a click looks them up by the relative url,
    // so clicking during an in-flight preload fetched the page a second time.
    // This replaces page:load (it runs before the plugin's handler, which is
    // `next`, then swup's default) and reuses the in-flight preload. It must wait
    // inside the handler: swup skips handlers of a visit that a newer click
    // has superseded, and a skipped page:load throws in swup. Harmless once
    // fixed upstream (the lookup also tries the relative key).
    swup.hooks.replace('page:load', async (visit, args, next) => {
      const promises = preload.preloadPromises;
      const pending = promises &&
        (promises.get(new URL(visit.to.url, location.href).href) || promises.get(visit.to.url));
      const page = pending ? await pending.catch(() => null) : null;
      if (page) {
        args.page = page;
        args.cache = false;
        return page;
      }
      return next(visit, args);
    });

    swup.hooks.before('content:replace', unmountPage);
    swup.hooks.on('content:replace', () => {
      mountPage();
      const main = document.querySelector('main');
      main.classList.remove('swap-in');
      void main.offsetWidth; // restart the animation
      main.classList.add('swap-in');
    });

    go = function (href) { swup.navigate(href); };
  }

  // ── Global features ─────────────────────────────────────────────────────

  // Keyboard navigation: `g` then a key.
  function initKeyboardNav() {
    const nav = { h: '/', w: '/work/', a: '/about/', n: '/now/', c: '/cv/', r: '/writing/', u: '/uses/' };

    const tip = Object.assign(document.createElement('div'), {
      id: 'kb-tip',
      innerHTML: '<b>g →</b> &nbsp;h home &nbsp;w work &nbsp;a about &nbsp;n now &nbsp;c cv &nbsp;r writing &nbsp;u uses'
    });
    if (document.body) document.body.appendChild(tip);

    let armed = false, timer;
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'g') {
        armed = true; clearTimeout(timer);
        if (tip) tip.classList.add('visible');
        timer = setTimeout(() => { armed = false; if (tip) tip.classList.remove('visible'); }, 1500);
        return;
      }
      if (armed) {
        armed = false; clearTimeout(timer); if (tip) tip.classList.remove('visible');
        const path = nav[e.key];
        if (!path) return;
        if (path === location.pathname) { window.scrollTo({ top: 0, behavior: 'instant' }); return; }
        go(path);
      }
    });
  }

  // Lightbox: one native <dialog> (top layer, focus trap, Esc to close, focus
  // returns to the image). Delegated listeners so it works on swapped pages.
  function initLightbox() {
    const dlg = document.createElement('dialog');
    dlg.id = 'lb';
    dlg.setAttribute('aria-label', 'Enlarged image');
    dlg.innerHTML = '<button type="button" class="lb-close">close</button><img alt="">';
    document.body.appendChild(dlg);
    const big = dlg.querySelector('img');
    dlg.addEventListener('click', () => dlg.close()); // button, image or backdrop
    dlg.addEventListener('close', () => big.removeAttribute('src'));

    function open(img) {
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      dlg.showModal();
    }
    document.addEventListener('click', (e) => {
      const img = e.target.closest(ZOOMABLE);
      if (img) { e.preventDefault(); open(img); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches(ZOOMABLE)) {
        e.preventDefault();
        open(e.target);
      }
    });
  }

  // Nav scroll-shadow: `.scrolled` on the persistent nav wrapper.
  function initNavScrollShadow() {
    const el = document.querySelector('.nav-wrapper');
    if (!el) return;
    function update() {
      el.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function init() {
    initRouter();
    initKeyboardNav();
    initLightbox();
    initNavScrollShadow();
    mountPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
