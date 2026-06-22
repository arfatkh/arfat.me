/*
 * site.js — shared progressive-enhancement script for arfat.me
 *
 * Loaded with `defer` from the shared <head> partial, so it runs after the
 * document is parsed and never blocks rendering or navigation (R9.1). JS is
 * pure enhancement here: every page is a real HTML document that works fully
 * without this file.
 *
 * The same single file is served on every route. To stay safe on pages that
 * lack a given feature's markup, each feature is an independent function that
 * guards on the presence of its target element and no-ops when absent (R9.2).
 *
 * Feature bodies are filled in by tasks 11.2-11.6; this file is the scaffold.
 */
(function () {
  'use strict';

  // 11.2 — keyboard navigation (`g` then a key → real navigation)
  function initKeyboardNav() {
    // `g` then a key navigates to a clean folder route (a REAL navigation),
    // replacing the old single-page `location.hash` jumps (R9.3).
    const nav = { h: '/', w: '/work/', a: '/about/', n: '/now/', c: '/cv/', r: '/writing/', u: '/uses/' };

    // The tooltip lives only in JS; create it on demand and guard everything on
    // its presence so the handler stays safe even if creation ever fails.
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
        location.href = path;
      }
    });
  }

  // 11.3 — reading-progress bar, guarded on the post article
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
  }

  // 11.4 — table-of-contents sidebar, guarded on the TOC sidebar
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
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  }

  // 11.5 — lightbox image zoom via delegated click (no single target element)
  function initLightbox() {
    // No single target element exists for this feature, and the matching images
    // live on different pages, so use a DELEGATED click listener on `document`
    // (R9.6). The handler no-ops unless the click lands on a zoomable image, so
    // it stays safe on every route (R9.2).
    function openLb(src, alt) {
      const o = document.createElement('div');
      o.id = 'lb-overlay';
      const img = document.createElement('img');
      img.src = src; img.alt = alt || '';
      o.appendChild(img);
      document.body.appendChild(o);
      o.addEventListener('click', function () { o.remove(); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { o.remove(); document.removeEventListener('keydown', esc); }
      });
    }
    document.addEventListener('click', function (e) {
      const img = e.target.closest('img.project-screenshot, .ss-grid img');
      if (img) { e.preventDefault(); openLb(img.src, img.alt); }
    });
  }

  // 11.6 — nav scroll-shadow `.scrolled` toggle, guarded on the nav wrapper
  function initNavScrollShadow() {
    const el = document.querySelector('.nav-wrapper');
    if (!el) return;

    // Toggle the `.scrolled` class once the page is scrolled past a small
    // threshold; CSS `.nav-wrapper.scrolled` adds the bottom border (R9.7).
    // Active-nav highlighting is owned by build-time `aria-current` stamping,
    // so this handler deliberately does NOT touch it (R9.8).
    function update() {
      el.classList.toggle('scrolled', window.scrollY > 8);
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // `defer` guarantees the DOM is parsed, but TOC build is specified to run on
  // DOMContentLoaded (task 11.4); a listener is safe and fires regardless.
  function init() {
    initKeyboardNav();
    initReadingProgress();
    initToc();
    initLightbox();
    initNavScrollShadow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
