"use strict";

(function () {
  var root = document.documentElement;
  root.classList.add("js-motion");

  function initTheme() {
    var storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      root.setAttribute("data-theme", storedTheme);
      return;
    }

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.setAttribute("data-theme", "dark");
    }
  }

  function setupThemeToggle() {
    var toggle = document.querySelector(".theme-toggle");

    if (!toggle) {
      return;
    }

    function applyToggleState() {
      var isDark = root.getAttribute("data-theme") === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.querySelector(".theme-toggle__text").textContent = isDark ? "Light" : "Dark";
    }

    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      var nextTheme = current === "dark" ? "light" : "dark";

      root.setAttribute("data-theme", nextTheme);
      localStorage.setItem("theme", nextTheme);
      applyToggleState();
    });

    applyToggleState();
  }

  function setupMobileMenu() {
    var menuToggle = document.querySelector(".header__menu-toggle");
    var menu = document.querySelector(".header-nav");

    if (!menuToggle || !menu) {
      return;
    }

    var closeButton = menu.querySelector(".header-nav__close");
    var menuLinks = menu.querySelectorAll(".header__link");
    var desktopMedia = window.matchMedia("(min-width: 768px)");

    function setExpanded(isExpanded) {
      menuToggle.setAttribute("aria-expanded", String(isExpanded));
    }

    function openMenu() {
      document.body.classList.add("menu-open");
      setExpanded(true);
    }

    function closeMenu() {
      document.body.classList.remove("menu-open");
      setExpanded(false);
    }

    function toggleMenu() {
      if (document.body.classList.contains("menu-open")) {
        closeMenu();
        return;
      }

      openMenu();
    }

    menuToggle.addEventListener("click", toggleMenu);

    if (closeButton) {
      closeButton.addEventListener("click", closeMenu);
      closeButton.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        closeMenu();
      });
    }

    menu.addEventListener("click", function (event) {
      if (event.target.closest(".header-nav__close")) {
        closeMenu();
        return;
      }

      if (event.target === menu) {
        closeMenu();
      }
    });

    menuLinks.forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
        closeMenu();
      }
    });

    function handleDesktopChange(event) {
      if (event.matches) {
        closeMenu();
      }
    }

    if (typeof desktopMedia.addEventListener === "function") {
      desktopMedia.addEventListener("change", handleDesktopChange);
    } else if (typeof desktopMedia.addListener === "function") {
      desktopMedia.addListener(handleDesktopChange);
    }
  }

  function setupRevealAnimations() {
    if (!("IntersectionObserver" in window)) {
      return;
    }

    var groups = [
      ".intro__content",
      ".intro__visual",
      ".benefit__content",
      ".benefit__panel",
      ".connect__card",
      ".subscriptions__tag",
      ".promotion__card",
      ".faq__content",
      ".faq__form"
    ];

    var revealElements = [];

    groups.forEach(function (selector) {
      var items = document.querySelectorAll(selector);
      items.forEach(function (item, index) {
        item.classList.add("reveal");
        item.style.setProperty("--reveal-delay", Math.min(index * 80, 360) + "ms");
        revealElements.push(item);
      });
    });

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    }, {
      threshold: 0.15,
      rootMargin: "0px 0px -8% 0px"
    });

    revealElements.forEach(function (item) {
      observer.observe(item);
    });
  }

  function setupMagneticHover() {
    if (!window.matchMedia || window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    var targets = document.querySelectorAll(".btn--primary, .theme-toggle");

    targets.forEach(function (element) {
      var rect = null;
      var frame = null;

      function updateRect() {
        rect = element.getBoundingClientRect();
      }

      function move(event) {
        if (!rect) {
          updateRect();
        }

        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var offsetX = (event.clientX - centerX) / (rect.width / 2);
        var offsetY = (event.clientY - centerY) / (rect.height / 2);
        var maxShift = 6;

        if (frame) {
          cancelAnimationFrame(frame);
        }

        frame = requestAnimationFrame(function () {
          element.style.setProperty("--mx", (offsetX * maxShift).toFixed(2) + "px");
          element.style.setProperty("--my", (offsetY * maxShift).toFixed(2) + "px");
          frame = null;
        });
      }

      function reset() {
        rect = null;
        element.style.setProperty("--mx", "0px");
        element.style.setProperty("--my", "0px");
      }

      element.addEventListener("pointerenter", updateRect);
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerleave", reset);
      element.addEventListener("blur", reset);
      window.addEventListener("resize", function () {
        rect = null;
      }, { passive: true });
      window.addEventListener("scroll", function () {
        rect = null;
      }, { passive: true });
    });
  }

  function setupIntroSpotlight() {
    if (!window.matchMedia || window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    var visual = document.querySelector(".intro__visual");
    if (!visual) {
      return;
    }

    var rect = null;
    var frame = null;

    function updateRect() {
      rect = visual.getBoundingClientRect();
    }

    function handleMove(event) {
      if (!rect) {
        updateRect();
      }

      var x = ((event.clientX - rect.left) / rect.width) * 100;
      var y = ((event.clientY - rect.top) / rect.height) * 100;

      if (frame) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(function () {
        visual.style.setProperty("--pointer-x", x.toFixed(2) + "%");
        visual.style.setProperty("--pointer-y", y.toFixed(2) + "%");
        visual.classList.add("is-spotlight");
        frame = null;
      });
    }

    function resetSpotlight() {
      rect = null;
      visual.classList.remove("is-spotlight");
      visual.style.setProperty("--pointer-x", "50%");
      visual.style.setProperty("--pointer-y", "50%");
    }

    visual.addEventListener("pointerenter", updateRect);
    visual.addEventListener("pointermove", handleMove);
    visual.addEventListener("pointerleave", resetSpotlight);
    window.addEventListener("resize", function () {
      rect = null;
    }, { passive: true });
    window.addEventListener("scroll", function () {
      rect = null;
    }, { passive: true });
  }

  function setupBackToTop() {
    var topLink = document.querySelector(".footer__top-link");
    if (!topLink) {
      return;
    }

    topLink.addEventListener("click", function (event) {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }

  function setupScrollProgress() {
    var bar = document.querySelector(".scroll-progress__bar");
    if (!bar) {
      return;
    }

    var maxScroll = 0;
    var ticking = false;

    function calculateMaxScroll() {
      maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
    }

    function update() {
      var scrollTop = window.scrollY || window.pageYOffset;
      var progress = maxScroll > 0 ? Math.min((scrollTop / maxScroll) * 100, 100) : 0;
      bar.style.transform = "scaleX(" + (progress / 100).toFixed(4) + ")";
      ticking = false;
    }

    function requestUpdate() {
      if (ticking) {
        return;
      }

      ticking = true;
      requestAnimationFrame(update);
    }

    calculateMaxScroll();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", function () {
      calculateMaxScroll();
      requestUpdate();
    }, { passive: true });
  }


  initTheme();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setupMobileMenu();
      setupThemeToggle();
      setupRevealAnimations();
      setupMagneticHover();
      setupIntroSpotlight();
      setupBackToTop();
      setupScrollProgress();
    });
  } else {
    setupMobileMenu();
    setupThemeToggle();
    setupRevealAnimations();
    setupMagneticHover();
    setupIntroSpotlight();
    setupBackToTop();
    setupScrollProgress();
  }
})();
