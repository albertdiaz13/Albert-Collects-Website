/* Albert Collects — binder redesign interactions. No dependencies. */
(() => {
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  /* Header menu (details/summary): close on Escape, on link tap, and lock page scroll while open. */
  document.querySelectorAll('[data-b-menu]').forEach((menu) => {
    const summary = menu.querySelector('summary');
    menu.addEventListener('toggle', () => {
      document.documentElement.classList.toggle('b-menu-open', menu.open);
      if (menu.open) menu.querySelector('.b-menu__link')?.focus({ preventScroll: true });
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false;
        summary.focus();
      }
    });
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => (menu.open = false)));
    window.matchMedia('(min-width: 990px)').addEventListener('change', (e) => {
      if (e.matches) menu.open = false;
    });
  });

  /* Hero: one card at a time. */
  document.querySelectorAll('[data-b-hero]').forEach((hero) => {
    const slides = [...hero.querySelectorAll('[data-b-slide]')];
    if (slides.length < 2) return;
    const count = hero.querySelector('[data-b-count]');
    const live = hero.querySelector('[data-b-announce]');
    const countTpl = hero.querySelector('[data-b-counter-template]')?.innerHTML.trim() || '[current]';
    const announceTpl = hero.querySelector('[data-b-announce-template]')?.innerHTML.trim() || '[name]';
    let index = 0;
    let busy = false;
    let raf = 0;

    const announce = (text) => {
      if (!live) return;
      cancelAnimationFrame(raf);
      live.textContent = '';
      raf = requestAnimationFrame(() => (live.textContent = text));
    };

    const show = async (next, dir) => {
      if (busy || next === index) return;
      busy = true;
      const from = slides[index];
      const to = slides[next];
      // Warm the next image so it never pops in half-loaded.
      to.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = 'eager'));
      if (!reduceMotion()) {
        await from.animate(
          [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-24 * dir}px)` }],
          { duration: 180, easing: EASE }
        ).finished;
      }
      from.hidden = true;
      to.hidden = false;
      if (!reduceMotion()) {
        to.animate(
          [{ opacity: 0, transform: `translateX(${32 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }],
          { duration: 420, easing: EASE }
        );
      }
      index = next;
      const human = String(index + 1);
      if (count) count.textContent = countTpl.replace('[current]', human);
      announce(announceTpl.replace('[current]', human).replace('[name]', to.dataset.name || ''));
      busy = false;
    };

    const step = (dir) => show((index + dir + slides.length) % slides.length, dir);
    hero.querySelector('[data-b-next]')?.addEventListener('click', () => step(1));
    hero.querySelector('[data-b-prev]')?.addEventListener('click', () => step(-1));

    // Swipe on the card stage (touch and pen only; mouse keeps normal clicks).
    const stage = hero.querySelector('.b-hero__slides');
    let x0 = null;
    let y0 = null;
    stage?.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      x0 = e.clientX;
      y0 = e.clientY;
    });
    stage?.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    });
    stage?.addEventListener('pointercancel', () => (x0 = null));
  });

  /* Product gallery: swipeable pocket + thumbnails + full-screen viewer with zoom. */
  document.querySelectorAll('[data-b-product]').forEach((root) => {
    const track = root.querySelector('[data-b-track]');
    const thumbs = [...root.querySelectorAll('[data-b-thumb]')];
    const viewer = root.querySelector('[data-b-viewer]');
    const stage = viewer?.querySelector('[data-b-stage]');
    const figs = viewer ? [...viewer.querySelectorAll('[data-b-fig]')] : [];
    const tabs = viewer ? [...viewer.querySelectorAll('[data-b-view]')] : [];
    const zoomBtn = viewer?.querySelector('[data-b-zoomtoggle]');
    let opener = null;
    let current = 0;

    const items = track ? [...track.children] : [];
    const goTo = (i, smooth = true) => {
      const item = items[i];
      if (!item || !track) return;
      track.scrollTo({ left: item.offsetLeft - track.offsetLeft, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
    };
    thumbs.forEach((t) => t.addEventListener('click', () => goTo(Number(t.dataset.bThumb))));
    if (track && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting && en.intersectionRatio > 0.6) {
              const i = Number(en.target.dataset.index);
              thumbs.forEach((t, n) => (n === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')));
            }
          });
        },
        { root: track, threshold: [0.6] }
      );
      items.forEach((it) => io.observe(it));
    }

    if (!viewer) return;
    const setZoom = (on, point) => {
      viewer.classList.toggle('is-zoomed', on);
      if (zoomBtn) zoomBtn.textContent = on ? zoomBtn.dataset.labelOut : zoomBtn.dataset.labelIn;
      zoomBtn?.setAttribute('aria-pressed', String(on));
      if (on && stage) {
        requestAnimationFrame(() => {
          const img = figs[current]?.querySelector('img');
          if (!img) return;
          const rx = point ? point.rx : 0.5;
          const ry = point ? point.ry : 0.5;
          stage.scrollLeft = img.offsetWidth * rx - stage.clientWidth / 2;
          stage.scrollTop = img.offsetHeight * ry - stage.clientHeight / 2;
        });
      }
    };
    const view = (i) => {
      current = i;
      figs.forEach((f, n) => (f.hidden = n !== i));
      tabs.forEach((t, n) => t.setAttribute('aria-pressed', String(n === i)));
      figs[i]?.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
      setZoom(false);
    };
    root.querySelectorAll('[data-b-zoom]').forEach((btn) =>
      btn.addEventListener('click', () => {
        opener = btn;
        view(Number(btn.dataset.bZoom));
        viewer.showModal();
        document.documentElement.classList.add('b-viewer-open');
      })
    );
    tabs.forEach((t) => t.addEventListener('click', () => view(Number(t.dataset.bView))));
    zoomBtn?.addEventListener('click', () => setZoom(!viewer.classList.contains('is-zoomed')));
    figs.forEach((fig) =>
      fig.addEventListener('click', (e) => {
        const img = fig.querySelector('img');
        if (!img) return;
        const r = img.getBoundingClientRect();
        const point = { rx: (e.clientX - r.left) / r.width, ry: (e.clientY - r.top) / r.height };
        setZoom(!viewer.classList.contains('is-zoomed'), point);
      })
    );
    viewer.querySelector('[data-b-close-viewer]')?.addEventListener('click', () => viewer.close());
    viewer.addEventListener('close', () => {
      document.documentElement.classList.remove('b-viewer-open');
      setZoom(false);
      opener?.focus();
    });
  });

  /* Catalog: sort submits on change; filter sheet is a modal dialog. */
  document.querySelectorAll('[data-b-catalog]').forEach((root) => {
    root.querySelector('[data-b-sort] select')?.addEventListener('change', (e) => e.target.form.submit());
    const sheet = root.querySelector('[data-b-filters]');
    const opener = root.querySelector('[data-b-open-filters]');
    if (!sheet || !opener) return;
    opener.addEventListener('click', () => {
      sheet.showModal();
      document.documentElement.classList.add('b-viewer-open');
    });
    sheet.querySelector('[data-b-close-filters]')?.addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) sheet.close();
    });
    sheet.addEventListener('close', () => {
      document.documentElement.classList.remove('b-viewer-open');
      opener.focus();
    });
    // Drop empty price inputs so they don't add blank filters to the URL.
    sheet.querySelector('form')?.addEventListener('submit', (e) => {
      e.target.querySelectorAll('input[type="number"]').forEach((i) => {
        if (i.value === '') i.disabled = true;
      });
    });
  });
})();
