import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { works } from "../data/works.js";
import { splitChars } from "./split.js";

const base = import.meta.env.BASE_URL;
const src = (w) => `${base}images/${w.img}`;
// Крупный кадр просмотрщика на ретине вдвое шире 1440 — отдаём снимок 2880 px, иначе он мылится.
const srcset = (w) => `${src(w)} 1440w, ${src(w).replace(/\.jpg$/, "@2x.webp")} 2880w`;
const SIZES = "(max-width: 767px) 100vw, 86vw";

// Снимки вокруг заголовка: позиция центра (в долях экрана), ширина (vw), наклон.
const SCATTER = [
  { i: 1, x: 0.12, y: 0.24, w: 17, r: -4 },
  { i: 2, x: 0.86, y: 0.2, w: 15, r: 3 },
  { i: 12, x: 0.08, y: 0.72, w: 19, r: 2 },
  { i: 3, x: 0.3, y: 0.86, w: 13, r: -2 },
  { i: 8, x: 0.72, y: 0.84, w: 16, r: 4 },
  { i: 13, x: 0.92, y: 0.6, w: 13, r: -3 },
  { i: 4, x: 0.62, y: 0.12, w: 11, r: -2 },
  { i: 5, x: 0.34, y: 0.1, w: 10, r: 3 },
];

// Тёмные акценты проектов на тёмном фоне не видны — осветляем к белому.
function lighten(hex, k = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `rgb(${c.join(",")})`;
}

export function initGallery({ reduce, onGoal }) {
  const section = document.getElementById("works");
  const pin = section.querySelector(".works__pin");
  const scatter = document.getElementById("scatter");
  const viewer = document.getElementById("viewer");
  const frame = document.getElementById("viewerFrame");
  const imgs = document.getElementById("viewerImgs");
  const nameEl = document.getElementById("viewerName");
  const textEl = document.getElementById("viewerText");
  const stackEl = document.getElementById("viewerStack");
  const lhEl = document.getElementById("viewerLh");
  const openEl = document.getElementById("viewerOpen");
  const curEl = document.getElementById("viewerCur");
  const indexEl = document.getElementById("viewerIndex");
  document.getElementById("viewerTotal").textContent = works.length;

  let index = 0;
  let busy = false;
  let pending = null;
  let st = null;

  /* разброс */
  SCATTER.forEach((s) => {
    const li = document.createElement("li");
    li.className = "works__shot";
    li.style.setProperty("--x", s.x);
    li.style.setProperty("--y", s.y);
    li.style.setProperty("--w", `${s.w}vw`);
    // Центровка и наклон — через GSAP, чтобы они складывались со смещением анимации, а не затирались.
    gsap.set(li, { xPercent: -50, yPercent: -50, rotate: s.r });
    const img = document.createElement("img");
    img.src = src(works[s.i]);
    img.alt = "";
    img.width = 1440;
    img.height = 900;
    img.loading = "lazy";
    img.decoding = "async";
    li.append(img);
    scatter.append(li);
  });

  /* список всех работ */
  const indexBtns = works.map((w, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "viewer__pick";
    b.textContent = w.title;
    b.addEventListener("click", () => show(i, i > index ? 1 : -1));
    li.append(b);
    indexEl.append(li);
    return b;
  });

  function makeImg(w) {
    // Работы, которые живут движением (курсор, 3D), показываем короткой бесшовной петлёй:
    // неподвижный кадр их недопродаёт. Снимок — постер, пока видео не пошло.
    if (w.video && !reduce) {
      const v = document.createElement("video");
      v.className = "viewer__img";
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute("playsinline", ""); v.setAttribute("aria-label", w.alt);
      v.preload = "auto";
      v.poster = src(w);
      v.src = `${base}images/${w.video}`;
      v.width = 1440; v.height = 900;
      return v;
    }
    const img = document.createElement("img");
    img.className = "viewer__img";
    img.src = src(w);
    img.srcset = srcset(w);
    img.sizes = SIZES;
    img.alt = w.alt;
    img.width = 1440;
    img.height = 900;
    img.decoding = "async";
    return img;
  }

  function preload(i) {
    const w = works[(i + works.length) % works.length];
    const im = new Image();
    im.sizes = SIZES;
    im.srcset = srcset(w);
    im.src = src(w);
  }

  // Старое название уходит буквами вверх-влево, пока новое входит.
  function leaveName() {
    if (reduce || !nameEl.querySelector(".ch")) return;
    const ghost = nameEl.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.classList.add("viewer__name--ghost");
    ghost.setAttribute("aria-hidden", "true");
    nameEl.after(ghost);
    const em = parseFloat(getComputedStyle(nameEl).fontSize);
    gsap.to(ghost.querySelectorAll(".ch"), {
      opacity: 0, x: (i) => -i * em * 0.1, y: -em * 0.5, scale: 1.5,
      duration: 0.5, ease: "power3.in", stagger: 0.025, onComplete: () => ghost.remove(),
    });
  }

  // Размытие под подписью начинается над названием: считаем по раскладке (offsetTop не зависит
  // от масштаба кадра, пока он растёт из разброса), а не по экранным координатам.
  const metaEl = nameEl.closest(".viewer__meta");
  function placeBlur() {
    frame.style.setProperty("--blur-top", `${Math.max(0, metaEl.offsetTop - 14)}px`);
  }
  window.addEventListener("resize", placeBlur);

  function fillMeta(w, animate) {
    if (animate) leaveName();
    // Название меняется — снимаем отметку о разбивке, иначе splitChars вернёт буквы прошлой работы.
    delete nameEl.dataset.splitDone;
    nameEl.textContent = w.title;
    textEl.textContent = w.text;
    stackEl.textContent = w.stack;
    // Замер Lighthouse — как объективная отметка качества; у работ без замера строка пустая.
    lhEl.textContent = w.lh ? `Lighthouse · скорость ${w.lh.p} · доступность ${w.lh.a} · SEO ${w.lh.s}` : "";
    lhEl.hidden = !w.lh;
    openEl.href = w.url;
    // Имя ссылки — из скрытой подписи, которую создаёт splitButton: так оно начинается с видимого
    // «Открыть сайт», и озвучка совпадает с тем, что на кнопке (WCAG 2.5.3).
    const sr = openEl.querySelector(".sr-only");
    if (sr) sr.textContent = `Открыть сайт «${w.title}», в новой вкладке`;
    curEl.textContent = String(index + 1);
    viewer.style.setProperty("--work-accent", lighten(w.accent));
    indexBtns.forEach((b, k) => b.toggleAttribute("aria-current", k === index));
    indexBtns[index].setAttribute("aria-current", "true");
    const chars = splitChars(nameEl);
    placeBlur();
    if (animate && !reduce) {
      // Как у референса: буквы входят со сдвигом вправо-вниз и с увеличения, 75 мс на букву.
      const em = parseFloat(getComputedStyle(nameEl).fontSize);
      gsap.fromTo(chars,
        { opacity: 0, x: (i) => i * em * 0.1, y: em * 0.5, scale: 1.5 },
        { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.9, ease: "power3.out", stagger: 0.06, delay: 0.2 });
      gsap.fromTo([textEl, stackEl, lhEl], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.2 });
    }
  }

  function show(next, dir = 1) {
    next = (next + works.length) % works.length;
    if (next === index) return;
    if (busy) { pending = [next, dir]; return; }
    busy = true;
    const prevImg = imgs.lastElementChild;
    index = next;
    const w = works[index];
    const img = makeImg(w);
    imgs.append(img);
    fillMeta(w, true);
    preload(index + 1);
    preload(index - 1);
    const done = () => {
      imgs.querySelectorAll(".viewer__img").forEach((el) => { if (el !== img) el.remove(); });
      busy = false;
      if (pending) { const [n, d] = pending; pending = null; show(n, d); }
    };
    if (reduce) { done(); return; }
    // Новый кадр въезжает шторкой со стороны движения, старый уходит вглубь.
    // Как у референса: шторка за 0.9 с, новый кадр входит с растяжения 1.5×1.2 до нормы за 1.5 с.
    const from = dir > 0 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
    gsap.timeline({ onComplete: done })
      .fromTo(img, { clipPath: from }, { clipPath: "inset(0 0% 0 0%)", duration: 0.9, ease: "expo.inOut" }, 0)
      .fromTo(img, { scaleX: 1.5, scaleY: 1.2, transformOrigin: dir > 0 ? "100% 50%" : "0% 50%" }, { scaleX: 1, scaleY: 1, duration: 1.5, ease: "expo.out" }, 0)
      .to(prevImg, { filter: "brightness(0.5)", duration: 0.9, ease: "expo.inOut" }, 0);
  }

  // первичное заполнение
  imgs.append(makeImg(works[0]));
  fillMeta(works[0], false);
  preload(1);

  document.getElementById("viewerPrev").addEventListener("click", () => { show(index - 1, -1); onGoal("viewer_next"); });
  document.getElementById("viewerNext").addEventListener("click", () => { show(index + 1, 1); onGoal("viewer_next"); });
  openEl.addEventListener("click", () => onGoal("work_open", { work: works[index].title }));

  // Клавиши ← → работают, пока просмотрщик на экране и фокус не в поле ввода.
  let inView = false;
  new IntersectionObserver(([e]) => { inView = e.intersectionRatio > 0.5; }, { threshold: [0, 0.5, 1] }).observe(frame);
  window.addEventListener("keydown", (e) => {
    if (!inView || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
    if (!document.getElementById("menu").hidden) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1, 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1, -1); }
  });

  // Свайп на телефоне.
  let sx = null, sy = null;
  frame.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { sx = e.clientX; sy = e.clientY; } });
  frame.addEventListener("pointerup", (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });

  /* закреплённая сцена: разброс слетается, центральный снимок вырастает в просмотрщик */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
    section.classList.add("is-pinned");
    const shots = [...scatter.children];
    const tl = gsap.timeline({ defaults: { ease: "none" } });
    tl.fromTo(".works__intro", { autoAlpha: 1, scale: 1, y: 0 }, { autoAlpha: 0, scale: 0.86, y: "-8vh", duration: 0.32 }, 0);
    // Смещение к центру — функциями: при смене размера окна ScrollTrigger пересчитает их заново.
    // Позиция берётся из CSS-переменных, а не из getBoundingClientRect, — на неё не влияет сама анимация.
    // Как у референса: снимки разлетаются наружу, освобождая место растущему кадру.
    shots.forEach((el) => {
      const dx = () => (Number(el.style.getPropertyValue("--x")) - 0.5) * window.innerWidth * 0.7;
      const dy = () => (Number(el.style.getPropertyValue("--y")) - 0.5) * window.innerHeight * 0.7;
      tl.to(el, { x: dx, y: dy, autoAlpha: 0, duration: 0.45, ease: "power1.in" }, 0.04);
    });
    // Снимок проявляется, пока заголовок уходит, — иначе в начале он разрывает слово «Работы».
    tl.fromTo(frame, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14 }, 0.14)
      .fromTo(frame, { scale: 0.22, borderRadius: "10px" }, { scale: 1, borderRadius: "2px", duration: 0.55, ease: "power2.inOut" }, 0.12)
      .fromTo(".viewer__ui", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, 0.62)
      .fromTo(indexEl, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.14 }, 0.66)
      .to({}, { duration: 0.2 });

    st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=190%",
      pin,
      scrub: 0.6,
      animation: tl,
      invalidateOnRefresh: true,
    });
    return () => { section.classList.remove("is-pinned"); st = null; };
  });

  return {
    // Открыть работу из первого экрана: выставить её и докрутить до готового просмотрщика.
    open(i, scrollTo, { instant = false } = {}) {
      show(i, i > index ? 1 : -1);
      const y = st ? st.start + (st.end - st.start) * 0.8 : section.getBoundingClientRect().top + window.scrollY;
      scrollTo(y);
      // После мгновенного переноса сцена не должна «догонять» прокрутку на глазах:
      // сразу ставим её в то состояние, которое соответствует новой позиции.
      if (instant && st) {
        ScrollTrigger.update();
        st.getTween()?.progress(1);
        st.animation.progress(st.progress);
      }
    },
  };
}
