/* ==========================================================================
   AURA STUDIO — main.js
   Réplica del sistema de transiciones de venetianspa.ca:
   Lenis (scroll suave) + GSAP/ScrollTrigger + SplitType + Swiper.
   ========================================================================== */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.registerPlugin(ScrollTrigger);

  /* ----------------------------------------------------------------------
     0. Utilidades
     ---------------------------------------------------------------------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ----------------------------------------------------------------------
     1. Lenis — scroll suave (mismos parámetros que la referencia)
     ---------------------------------------------------------------------- */
  if (!REDUCED) {
    var lenis = new Lenis({
      duration: 1.4,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 1,
      smoothTouch: false,
      touchMultiplier: 2
    });

    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    window.auraLenis = lenis;

    // Anclas internas a través de Lenis
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id === '#') return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -80 });
        closeMenu();
      });
    });
  }

  /* ----------------------------------------------------------------------
     2. Header — estado "scrolled" y menú móvil
     ---------------------------------------------------------------------- */
  var header = document.getElementById('site-header');
  var burger = document.getElementById('burger');

  function onScrollHeader() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  function closeMenu() {
    if (!header || !burger) return;
    header.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }
  if (burger) {
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ----------------------------------------------------------------------
     3. HERO — titular por caracteres + botón
     ---------------------------------------------------------------------- */
  if (!REDUCED) document.querySelectorAll('.hero-heading').forEach(function (wrap) {
    var isMobile = window.matchMedia('(max-width: 900px)').matches;
    var target = isMobile ? wrap.querySelector('.t-mob') : wrap.querySelector('.t-desk');
    if (!target) return;

    var split = new SplitType(target, { types: 'words, chars' });

    var tl = gsap.timeline({ delay: 0.25 });
    tl.from(split.chars, {
      y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out'
    });
    tl.from('.hero-button', {
      y: 20, opacity: 0, duration: 0.4, ease: 'power2.out'
    }, '+=0.025');
  });

  /* ----------------------------------------------------------------------
     4. HERO — persiana veneciana (láminas que se cierran con el scroll)
     ---------------------------------------------------------------------- */
  (function blinds() {
    if (REDUCED) return;
    var cover = document.querySelector('.home-hero-cover');
    var hero = document.querySelector('.home-hero-container');
    if (!cover || !hero) return;

    var w = window.innerWidth;
    var count = w <= 767 ? 25 : (w <= 1024 ? 35 : 52);
    var stripWidth = hero.clientWidth / count;

    cover.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var strip = document.createElement('div');
      strip.className = 'blind-strip-v';
      strip.style.cssText =
        'position:absolute;top:0;height:100%;' +
        'left:' + (i * stripWidth - 0.5) + 'px;' +
        'width:' + (stripWidth + 1) + 'px;' +
        'background:var(--gold);' +
        'transform-origin:left center;transform:rotateY(-90deg);' +
        'transform-style:preserve-3d;';
      cover.appendChild(strip);
    }

    var mm = gsap.matchMedia();

    mm.add('(min-width: 1025px)', function () {
      var tween = gsap.to('.blind-strip-v', {
        rotationY: 0, stagger: 0.005, ease: 'power3.out',
        scrollTrigger: { trigger: hero, start: 'top+=10% top', end: '+=125%', scrub: true }
      });
      return function () { tween.kill(); };
    });

    mm.add('(max-width: 1024px)', function () {
      var tween = gsap.to('.blind-strip-v', {
        rotationY: 0, stagger: 0.005, ease: 'power3.out',
        scrollTrigger: { trigger: hero, start: 'top top', end: '+=100%', scrub: true }
      });
      return function () { tween.kill(); };
    });
  })();

  /* ----------------------------------------------------------------------
     5. NOSOTROS — el borde superior se redondea con el scroll
     ---------------------------------------------------------------------- */
  window.addEventListener('load', function () {
    if (REDUCED || window.innerWidth <= 1024) return;
    var radiusSection = document.querySelector('.radius-section');
    if (!radiusSection) return;

    gsap.to(radiusSection, {
      borderTopLeftRadius: '400px',
      borderTopRightRadius: '400px',
      scrollTrigger: { trigger: radiusSection, start: 'top 95%', end: '+=600', scrub: true }
    });
  });

  /* ----------------------------------------------------------------------
     6. Revelados de texto reutilizables
     ---------------------------------------------------------------------- */
  function revealChars(scope, sel) {
    if (REDUCED) return;
    document.querySelectorAll(scope).forEach(function (el) {
      var node = el.querySelector(sel);
      if (!node) return;
      var split = new SplitType(node, { types: 'words, chars' });
      gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%' } })
        .from(split.chars, { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
    });
  }

  function revealWords(scope, sel) {
    if (REDUCED) return;
    document.querySelectorAll(scope).forEach(function (el) {
      var node = el.querySelector(sel);
      if (!node) return;
      var split = new SplitType(node, { types: 'words' });
      gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%' } })
        .from(split.words, { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
    });
  }

  /** Titular (chars) + párrafo (lines) + botón, encadenados en una timeline. */
  function revealBlock(headSel, paraSel, btnSel) {
    if (REDUCED) return;
    var heads = document.querySelectorAll(headSel);
    var paras = document.querySelectorAll(paraSel);

    heads.forEach(function (headEl, i) {
      var h = headEl.querySelector('h2');
      if (!h) return;
      var splitH = new SplitType(h, { types: 'words, chars' });
      var tl = gsap.timeline({ scrollTrigger: { trigger: headEl, start: 'top 80%' } });

      tl.from(splitH.chars, { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });

      var pWrap = paras[i];
      if (pWrap && pWrap.querySelector('p')) {
        var splitP = new SplitType(pWrap.querySelector('p'), { types: 'lines' });
        tl.from(splitP.lines, { y: 20, opacity: 0, duration: 0.35, stagger: 0.1, ease: 'power2.out' }, '-=0.15');
      }

      if (btnSel) {
        var btn = document.querySelectorAll(btnSel)[i];
        if (btn) tl.from(btn, { y: 20, opacity: 0, duration: 0.4, ease: 'power2.out' }, '+=0');
      }
    });
  }

  /* ----------------------------------------------------------------------
     7. NOSOTROS — imagen en arco con barrido (clip-path) + zoom-out
     ---------------------------------------------------------------------- */
  if (!REDUCED) gsap.utils.toArray('.general-reveal-img').forEach(function (wrapper) {
    var img = wrapper.querySelector('img');
    var container = wrapper.closest('.radius-img-container');
    if (!img || !container) return;

    gsap.timeline({
      scrollTrigger: { trigger: container, start: 'top 65%', once: true, invalidateOnRefresh: true }
    })
      .fromTo(wrapper,
        { clipPath: 'polygon(0 0, 0 0, 0 0, 0 0)' },
        { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', duration: 1, ease: 'power1.out' })
      .fromTo(img, { scale: 1.5 }, { scale: 1, duration: 1, ease: 'power2.out' }, 0);
  });

  /* ----------------------------------------------------------------------
     8. Botones sueltos
     ---------------------------------------------------------------------- */
  if (!REDUCED) document.querySelectorAll('.general-button').forEach(function (button) {
    gsap.timeline({ scrollTrigger: { trigger: button, start: 'top 98%' } })
      .from(button, { y: 30, opacity: 0, duration: 0.3, ease: 'power2.out' });
  });

  /* ----------------------------------------------------------------------
     9. Textos por sección (esperando a las fuentes para medir bien las líneas)
     ---------------------------------------------------------------------- */
  document.fonts.ready.then(function () {
    revealWords('.radius-sub-heading', 'h3');
    revealBlock('.radius-heading', '.radius-p', '.radius-button');
    revealBlock('.home-scroll-h2', '.home-scroll-p', null);
    revealBlock('.home-text-h2', '.home-text-p', '.home-text-button');
    revealChars('.gallery-h2', 'h2');
    revealChars('.testimonial-h2', 'h2');

    // Servicios: h2 por caracteres + h3 por palabras encadenados
    if (!REDUCED) document.querySelectorAll('.home-carousel-h2').forEach(function (el, i) {
      var h2 = el.querySelector('h2');
      var h3wrap = document.querySelectorAll('.home-carousel-h3')[i];
      if (!h2) return;
      var splitH2 = new SplitType(h2, { types: 'words, chars' });
      var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%' } });
      tl.from(splitH2.chars, { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
      if (h3wrap && h3wrap.querySelector('h3')) {
        var splitH3 = new SplitType(h3wrap.querySelector('h3'), { types: 'words' });
        tl.from(splitH3.words, { y: 15, opacity: 0, duration: 0.3, stagger: 0.1, ease: 'power2.out' }, '-=0.2');
      }
    });

    // Style Book: @usuario + botón
    if (!REDUCED) document.querySelectorAll('.gallery-container').forEach(function (container) {
      var heading = container.querySelector('.gallery-sm h2');
      if (!heading) return;
      var split = new SplitType(heading, { types: 'words, chars' });
      var button = container.querySelector('.gallery-button');
      var tl = gsap.timeline({ scrollTrigger: { trigger: container, start: 'top 80%' } });
      tl.from(split.chars, { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
      if (button) tl.from(button, { y: 20, opacity: 0, duration: 0.4, ease: 'power2.out' }, '+=0');
    });

    ScrollTrigger.refresh();
  });

  /* ----------------------------------------------------------------------
     10. SERVICIOS — Swiper + revelado secuencial de las tarjetas
     ---------------------------------------------------------------------- */
  (function carousel() {
    var el = document.querySelector('.home-carousel .swiper');
    if (!el || typeof Swiper === 'undefined') return;

    var nextBtn = document.querySelector('.car-next');
    var prevBtn = document.querySelector('.car-prev');

    var swiper = new Swiper(el, {
      loop: true,
      speed: 900,
      spaceBetween: 16,
      allowTouchMove: false,
      simulateTouch: false,
      autoplay: { delay: 4000, disableOnInteraction: false, pauseOnMouseEnter: true },
      breakpoints: {
        0:    { slidesPerView: 1, loopAdditionalSlides: 0 },
        768:  { slidesPerView: 2, loopAdditionalSlides: 0 },
        1025: { slidesPerView: 3, loopAdditionalSlides: 1 }
      },
      navigation: { nextEl: '.car-next', prevEl: '.car-prev' }
    });

    // El autoplay arranca sólo cuando termina el revelado secuencial
    if (swiper.autoplay) swiper.autoplay.stop();
    if (nextBtn) nextBtn.style.pointerEvents = 'none';
    if (prevBtn) prevBtn.style.pointerEvents = 'none';

    var carousel = document.querySelector('.home-carousel');
    var slides = gsap.utils.toArray('.swiper-slide:not(.swiper-slide-duplicate)', carousel);

    if (REDUCED) {
      if (swiper.autoplay) swiper.autoplay.start();
      if (nextBtn) nextBtn.style.pointerEvents = 'auto';
      if (prevBtn) prevBtn.style.pointerEvents = 'auto';
    }

    if (!REDUCED) slides.forEach(function (slide, i) {
      var container = slide.querySelector('.carousel-container');
      if (!container) return;
      var heading = container.querySelector('.carousel-heading h2');
      if (!heading) return;

      var split = new SplitType(heading, { types: 'words, chars' });

      var tl = gsap.timeline({
        scrollTrigger: { trigger: carousel, start: 'top 50%', once: true },
        delay: i * 0.25
      });

      tl.fromTo(container,
        { clipPath: 'polygon(0 0, 0 0, 0 0, 0 0)', scale: 1.5 },
        { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', scale: 1, duration: 0.8, ease: 'power2.out' });

      tl.from(split.chars,
        { y: 30, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }, '-=0.3');

      if (i === slides.length - 1) {
        tl.add(function () {
          if (swiper.autoplay && !swiper.el.matches(':hover')) swiper.autoplay.start();
          if (nextBtn) nextBtn.style.pointerEvents = 'auto';
          if (prevBtn) prevBtn.style.pointerEvents = 'auto';
        });
      }
    });

    el.addEventListener('mouseenter', function () { if (swiper.autoplay) swiper.autoplay.stop(); });
    el.addEventListener('mouseleave', function () { if (swiper.autoplay) swiper.autoplay.start(); });
  })();

  /* ----------------------------------------------------------------------
     11. CADA DETALLE — sección fijada, imágenes que suben, parallax de ratón
     ---------------------------------------------------------------------- */
  function pinnedFloat(containerSel, bgSel, itemSel, innerSel) {
    var container = document.querySelector(containerSel);
    if (!container || REDUCED) return;

    var bg = document.querySelector(bgSel);
    var items = document.querySelectorAll(itemSel);
    if (!items.length) return;

    var inners = Array.prototype.map.call(items, function (it) {
      return innerSel ? it.querySelector(innerSel) : it;
    }).filter(Boolean);

    var distance = window.innerWidth > 767 ? 3000 : 2200;

    if (bg) {
      gsap.fromTo(bg,
        { scale: 1, opacity: 0.32 },
        {
          scale: 1.75, opacity: 0.16, ease: 'none',
          scrollTrigger: { trigger: container, start: 'top top', end: '+=' + distance, scrub: true }
        });
    }

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: container, start: 'top top', end: '+=' + distance,
        scrub: true, pin: true, pinSpacing: true, invalidateOnRefresh: true
      }
    });

    items.forEach(function (item, i) {
      tl.fromTo(item,
        { y: window.innerHeight },
        { y: -window.innerHeight, ease: 'none' },
        i * 0.12);
    });

    if (window.innerWidth > 1024) {
      var strength = 25;
      document.addEventListener('mousemove', function (e) {
        var mx = (e.clientX / window.innerWidth - 0.5) * 2;
        var my = (e.clientY / window.innerHeight - 0.5) * 2;
        inners.forEach(function (inner) {
          gsap.to(inner, { x: -mx * strength, y: -my * strength, duration: 0.5, ease: 'power2.out' });
        });
      });
    }
  }

  window.addEventListener('load', function () {
    pinnedFloat('.home-scroll-container', '.large-bg-icon', '.move-up-img', 'img');
    pinnedFloat('.testimonial-container', '.testimonial-bg-icon', '.testimonial-wrapper', '.testimonial-card');
    ScrollTrigger.refresh();
  });

  /* ----------------------------------------------------------------------
     12. Recalcular al redimensionar
     ---------------------------------------------------------------------- */
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { ScrollTrigger.refresh(); }, 220);
  });

})();
