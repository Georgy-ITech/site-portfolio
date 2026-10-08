import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/geist";
import "@fontsource/martian-mono/400.css";
import "./styles/main.scss";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { splitChars, splitButton, splitLines } from "./ui/split.js";
import { createMechanism } from "./ui/mechanism.js";
import { initProgress } from "./ui/progress.js";
import { initMenu } from "./ui/menu.js";
import { initGallery } from "./ui/gallery.js";
import { initRelief } from "./ui/relief.js";
import { initSky } from "./ui/sky.js";
import { initConsent, goal } from "./ui/consent.js";

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- плавная прокрутка ---------- */

let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
// Мгновенный переход — для «Работ»: без пролёта через первый экран и разброс снимков.
const jumpToY = (y) => (lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : window.scrollTo({ top: y, behavior: "auto" }));
function scrollToTarget(hash) {
  // «Работы» ведут сразу в раскрытый просмотрщик на первой работе, минуя разброс снимков.
  if (hash === "#works") {
    // Страница мягко гаснет, под затемнением переносимся к открытой первой работе,
    // и просмотрщик проявляется с лёгкого приближения — без пролёта через весь первый экран.
    const frame = $("#viewerFrame");
    const veil = $("#veil");
    if (reduce) { gallery.open(0, jumpToY); frame.focus({ preventScroll: true }); return; }
    const cols = veil.querySelectorAll(".veil__cols span");
    const dim = veil.querySelector(".veil__dim");
    const mark = veil.querySelector(".veil__mark");
    const meta = [".viewer__text", ".viewer__stack", ".viewer__lh", ".viewer__ui .viewer__nav", ".viewer__count", ".viewer__open", "#viewerIndex"];
    gsap.timeline()
      .set(veil, { visibility: "visible" })
      .set(cols, { scaleY: 0, transformOrigin: "50% 100%" })
      .set(mark, { opacity: 0, y: 14 })
      // Старая страница притемняется, колонки поднимаются лесенкой слева направо.
      .to(dim, { opacity: 0.6, duration: 0.6, ease: "power1.inOut" }, 0)
      .to(cols, { scaleY: 1, duration: 0.75, ease: "power3.inOut", stagger: 0.05 }, 0.1)
      .to(mark, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.7)
      .add(() => {
        gallery.open(0, jumpToY, { instant: true });
        // Под шторкой прячем подписи работы: они соберутся уже на открытой странице.
        gsap.set(meta, { autoAlpha: 0, y: 16 });
        gsap.set("#viewerName .ch", { opacity: 0 });
        gsap.set(dim, { opacity: 0 });
        frame.setAttribute("tabindex", "-1");
        frame.focus({ preventScroll: true });
      }, 1.3)
      // Знак гаснет, колонки уходят вверх той же лесенкой.
      .to(mark, { opacity: 0, y: -14, duration: 0.4, ease: "power2.in" }, 1.4)
      .set(cols, { transformOrigin: "50% 0%" }, 1.55)
      .to(cols, { scaleY: 0, duration: 0.85, ease: "power3.inOut", stagger: 0.05 }, 1.55)
      .fromTo(".viewer__img", { scale: 1.08 }, { scale: 1, duration: 1.8, ease: "power3.out", clearProps: "scale" }, 1.6)
      // На открытой странице по буквам собирается название работы, потом всё остальное.
      .add(() => {
        const name = $("#viewerName");
        const chars = name.querySelectorAll(".ch");
        const em = parseFloat(getComputedStyle(name).fontSize);
        gsap.fromTo(chars, { opacity: 0, x: (i) => i * em * 0.1, y: em * 0.5, scale: 1.5 },
          { opacity: 1, x: 0, y: 0, scale: 1, duration: 1, ease: "power3.out", stagger: 0.06 });
      }, 2.0)
      .to(meta, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08, clearProps: "transform" }, 2.3)
      .set(veil, { visibility: "hidden" });
    return;
  }
  const el = hash === "#top" ? document.body : $(hash);
  if (!el) return;
  if (lenis) lenis.scrollTo(hash === "#top" ? 0 : el, { duration: 1.4 });
  else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  // Фокус переносим туда, куда прокрутили, — иначе клавиатура останется в шапке.
  const focusable = hash === "#top" ? $("#heroTitle") : el;
  focusable.setAttribute("tabindex", "-1");
  focusable.focus({ preventScroll: true });
}

/* ---------- текст: кнопки, заголовки, абзацы, пункты меню ---------- */

$$("[data-roll]").forEach(splitButton);
$$(".head__brand > span").forEach(splitButton);
// Иконка в кнопке перекатывается вместе с буквами: исходная уходит вверх, копия поднимается снизу.
$$(".btn__icon").forEach((icon) => {
  const box = document.createElement("span");
  box.className = "btn__ico";
  box.setAttribute("aria-hidden", "true");
  icon.replaceWith(box);
  const copy = icon.cloneNode(true);
  copy.classList.add("btn__icon--copy");
  box.append(icon, copy);
});
$$("[data-split]").forEach(splitChars);
$$(".menu__link").forEach((a) => {
  const text = a.textContent.trim();
  a.setAttribute("aria-label", text);
  a.innerHTML = [...text].map((ch, i) => `<span class="mch" aria-hidden="true" style="--i:${i}" data-ch="${ch === " " ? " " : ch}">${ch === " " ? " " : ch}</span>`).join("");
});
const lineEls = $$("[data-lines]");
lineEls.forEach(splitLines);
// Строки считаются по фактическому переносу — при смене ширины разбивка пересобирается.
let lineTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => lineEls.forEach(splitLines), 200);
});

/* ---------- статистика ---------- */

const consent = initConsent();
document.addEventListener("click", (e) => {
  const g = e.target.closest?.("[data-goal]");
  if (g) goal(g.dataset.goal);
});

/* ---------- шапка: сжатие при прокрутке, тёмная над бумагой ---------- */

const head = $("#head");
const onScrollHead = () => head.classList.toggle("is-scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScrollHead, { passive: true });
onScrollHead();
// Тема шапки — по тому, что под ней сейчас, а не по заранее посчитанным границам: высота страницы
// меняется уже после их расчёта (разбивка строк, картинки, закрепление работ), и шапка ошибалась
// на десятки пикселей — светлела над тёмным и темнела над бумагой.
const darkZones = $$("[data-header='dark']");
let headTicking = false;
const syncHeadTheme = () => {
  headTicking = false;
  const mid = head.offsetHeight / 2;
  head.classList.toggle("is-dark", darkZones.some((z) => {
    const r = z.getBoundingClientRect();
    return r.top <= mid && r.bottom >= mid;
  }));
};
const queueHeadTheme = () => {
  if (headTicking) return;
  headTicking = true;
  requestAnimationFrame(syncHeadTheme);
};
window.addEventListener("scroll", queueHeadTheme, { passive: true });
window.addEventListener("resize", queueHeadTheme);
syncHeadTheme();

/* ---------- часы Сахалина в углу первого экрана ---------- */

// Время, которое сейчас у меня: часовой механизм на экране и живые часы рядом — одно и то же.
// Пока скрипт не отработал, в разметке остаётся «МСК+8».
const clockEl = $("#heroClock");
const clockFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Sakhalin", hour: "2-digit", minute: "2-digit" });
const tickClock = () => {
  const now = new Date();
  const text = clockFmt.format(now);
  if (clockEl.textContent !== text) {
    clockEl.textContent = text;
    clockEl.dateTime = now.toISOString();
  }
  setTimeout(tickClock, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
};
try { tickClock(); clockEl.setAttribute("aria-label", "Время на Сахалине"); } catch { /* старый браузер без часовых поясов — остаётся МСК+8 */ }

/* ---------- прогресс секций → --p ---------- */

// Сами триггеры создаются после закрепления работ (ниже): иначе их границы считаются без его отступа.
const hero = $(".hero");
let heroP = 0;

/* ---------- курсор: свет на механизме, сдвиг орбит ---------- */

const cursor = { x: -9999, y: -9999, sx: 0 };
if (finePointer && !reduce) {
  window.addEventListener("pointermove", (e) => { cursor.x = e.clientX; cursor.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { cursor.x = cursor.y = -9999; });
}
const sky = initSky($("#heroSky"), { reduce });

const orbits = $$(".orbit");
gsap.ticker.add(() => {
  if (!finePointer || reduce) return;
  const target = cursor.x < -1000 ? 0 : (cursor.x / window.innerWidth - 0.5) * 40;
  cursor.sx += (target - cursor.sx) * 0.06;
  orbits.forEach((o) => o.style.setProperty("--ox", cursor.sx.toFixed(2)));
});

/* ---------- механизм ---------- */

const mech = createMechanism();
root.dataset.mech = mech.mode;
const heroCanvas = $("#heroMech");

// Прожектор (как string="spotlight" у референса) и затемнение по прокрутке — только по металлу.
// Свет за курсором включается плавно после посадки механизма, а не вспышкой в момент подмены.
let spotIn = reduce ? 1 : 0;
function heroFx(ctx, w, h) {
  const r = heroCanvas.getBoundingClientRect();
  if (cursor.x > -1000 && r.width) {
    const x = ((cursor.x - r.left) / r.width) * w;
    const y = ((cursor.y - r.top) / r.height) * h;
    const near = Math.max(0, 1 - Math.hypot(x / w - 0.5, y / h - 0.5) / 0.9);
    const k = 0.42 * near * Math.max(0, 1 - heroP * 2) * spotIn;
    if (k > 0.01) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, w * 0.32);
      g.addColorStop(0, `rgba(255, 238, 205, ${k})`);
      g.addColorStop(0.45, `rgba(255, 226, 170, ${k * 0.35})`);
      g.addColorStop(1, "rgba(255, 226, 170, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // Темнеет только в конце: на отъезде механизм должен быть виден целиком.
  const dark = Math.min(1, Math.max(0, (heroP - 0.6) * 3));
  if (dark > 0) {
    ctx.fillStyle = `rgba(12, 17, 22, ${dark})`;
    ctx.fillRect(0, 0, w, h);
  }
}

if (reduce) mech.still(); else mech.hold();
// Макро во весь первый экран: ступица колеса (точка 0.736/0.584 кадра, считается при рендере) — справа и ниже заголовка
// на широком экране, ниже заголовка на узком.
const HUB = [0.736, 0.584];
const heroMech = mech.mount(heroCanvas, { fx: heroFx, fit: "cover", focus: HUB, anchor: (w, h) => (w / h > 1.1 ? [0.74, 0.6] : [0.5, 0.66]) });
const finalMech = mech.mount($("#finalMech"), { fit: "cover", focus: HUB, anchor: () => [0.5, 0.5] });
const players = [heroMech, finalMech];
gsap.ticker.add((t) => players.forEach((p) => p.draw(t)));
// Прокрутка докручивает колёса: быстрее листаешь — быстрее крутятся.
if (lenis) lenis.on("scroll", ({ velocity }) => mech.nudge(velocity));

/* ---------- заставка ---------- */

const loader = $("#loader");
const countEl = $("#loaderCount");
// Счётчик идёт плавно от 0 до 100: не быстрее реальной загрузки и не быстрее 1.6 с —
// чтобы общий план механизма успели рассмотреть.
const barEl = $("#loaderBar");
const LOADER_TIME = reduce ? 0 : 1.6;
let loadStart = reduce ? performance.now() : Infinity;
let real = 0, shown = 0;
mech.onProgress((p) => { real = Math.min(1, p); });
let countDone = null;
const counted = new Promise((r) => { countDone = r; });
const tickCount = () => {
  const byTime = LOADER_TIME ? Math.min(1, Math.max(0, (performance.now() - loadStart) / 1000 / LOADER_TIME)) : 1;
  const target = Math.min(real, byTime);
  shown += (target - shown) * 0.2;
  if (target - shown < 0.004) shown = target;
  countEl.textContent = String(Math.round(shown * 100));
  barEl.style.setProperty("--k", shown.toFixed(4));
  if (shown >= 1) { gsap.ticker.remove(tickCount); countDone(); }
};
gsap.ticker.add(tickCount);

// Подпись заставки — короткие фразы о работе, в случайном порядке, сменяются снизу вверх.
const PHRASES = [
  "Разрабатываю ваш сайт", "Думаю над структурой", "Подбираю шрифты", "Пишу код",
  "Сверяю отступы", "Настраиваю анимацию", "Проверяю формы", "Затягиваю винты",
  "Смазываю шестерни", "Собираю первый экран",
];
const labelEl = $("#loaderLabel");
const queue = [...PHRASES].sort(() => Math.random() - 0.5);
labelEl.firstElementChild.textContent = queue.shift();
let phraseTimer = 0;
if (!reduce) {
  phraseTimer = setInterval(() => {
    if (!queue.length) queue.push(...[...PHRASES].sort(() => Math.random() - 0.5));
    const old = labelEl.firstElementChild;
    const next = document.createElement("span");
    next.textContent = queue.shift();
    next.className = "is-next";
    labelEl.append(next);
    old.classList.add("is-gone");
    requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove("is-next")));
    setTimeout(() => old.remove(), 600);
  }, 2200);
}

const minShow = new Promise((r) => setTimeout(r, reduce ? 0 : 1100));
// Первый экран собирается сразу, под заставкой: его первая отрисовка — тяжёлая разовая работа
// видеокарты. Интерфейс при этом скрыт (is-intro), виден только механизм.
if (!reduce) root.classList.add("is-loaded", "is-intro", "is-waiting");
const calmStart = reduce ? Promise.resolve() : whenCalm(10, 2000).then(() => { loadStart = performance.now(); });
// Страховка: если механизм не пришёл (сеть, блокировщик), сайт всё равно открывается.
const giveUp = new Promise((r) => setTimeout(r, 9000));
let finished = false;
Promise.race([Promise.all([mech.ready, document.fonts.ready, minShow, calmStart, counted]), giveUp]).then(() => {
  if (!finished) { finished = true; finishLoading(); }
});

function finishLoading() {
  clearInterval(phraseTimer);
  gsap.ticker.remove(tickCount);
  countEl.textContent = "100";
  barEl.style.setProperty("--k", "1");
  if (reduce) { root.classList.add("is-loaded", "mech-landed"); root.classList.remove("is-intro"); loader.remove(); revealHero(); sky.start(); afterLoad(); return; }
  // Одна отрендеренная сцена (5.6 с): детали влетают из-за краёв кадра и садятся на место,
  // механизм разгоняется, камера подлетает к ступице — последний кадр сцены это первый кадр
  // цикла крупным планом. Интерфейс первого экрана проступает во время пролёта (с 4.2 с).
  root.classList.remove("is-waiting");
  gsap.to(".loader__count, .loader__label, .loader__bar", { autoAlpha: 0, y: 10, duration: 0.45, ease: "power2.in", onComplete: () => loader.remove() });
  const ui = gsap.delayedCall(4.2, () => { root.classList.remove("is-intro"); revealHero(); });
  mech.start().then(() => {
    ui.progress(1);
    root.classList.add("mech-landed");
    gsap.to({ v: 0 }, { v: 1, duration: 1.2, ease: "power1.inOut", onUpdate() { spotIn = this.targets()[0].v; } });
    sky.start();
    setTimeout(() => {
      (window.requestIdleCallback || ((f) => setTimeout(f, 0)))(afterLoad, { timeout: 800 });
    }, 2400);
  });
}
// Ждём, пока браузер переварит запуск первого экрана: 12 ровных кадров подряд (не дольше 22 мс).
// Время отрисовки зависит от машины — на слабой видеокарте оно дольше, и фиксированная пауза
// там не спасала: тяжёлый кадр попадал на начало полёта механизма. Не дольше 2.5 с в любом случае.
function whenCalm(need = 12, limit = 2500) {
  return new Promise((done) => {
    const start = performance.now();
    let last = start, calm = 0;
    const step = (now) => {
      calm = now - last < 22 ? calm + 1 : 0;
      last = now;
      if (calm >= need || now - start > limit) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function revealHero() { $$(".hero [data-split]").forEach((el) => el.classList.add("is-in")); }
function afterLoad() {
  consent.ready();
  ScrollTrigger.refresh();
}

/* ---------- работы ---------- */

// Снимки работ — после механизма первого экрана (или через 20 с, если сеть совсем плохая).
const gallery = initGallery({ reduce, onGoal: goal, after: Promise.race([mech.ready, new Promise((r) => setTimeout(r, 20000))]) });
const progress = initProgress({ reduce });
progress.on(hero, (p) => { heroP = p; });
if (!reduce) initRelief($("#relief"));

/* ---------- меню и якоря ---------- */

initMenu({
  onNavigate: scrollToTarget,
  onOpen: () => goal("menu_open"),
  lockScroll: () => { lenis?.stop(); root.classList.add("is-locked"); },
  unlockScroll: () => { lenis?.start(); root.classList.remove("is-locked"); },
});

document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || a.closest("#menu")) return;
  const hash = a.getAttribute("href");
  if (hash.length < 2) return;
  e.preventDefault();
  scrollToTarget(hash);
});

/* ---------- вопросы ---------- */

// Вопросы уже в HTML (их отрисовывает сборка, см. vite.config.js) — здесь только раскрытие.
$("#faq").addEventListener("click", (e) => {
  const b = e.target.closest(".qa__q");
  if (!b) return;
  const open = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", String(!open));
  b.closest(".qa").classList.toggle("is-open", !open);
});

/* ---------- появление при прокрутке ---------- */

const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add("is-in");
    io.unobserve(en.target);
  });
}, { rootMargin: "0px 0px -12% 0px" });
// Двойной кадр: сначала браузер рисует исходное состояние, потом начинаем наблюдать.
requestAnimationFrame(() => requestAnimationFrame(() => {
  $$("[data-reveal], [data-lines], .a-up, [data-split]").filter((el) => !el.closest(".hero")).forEach((el) => io.observe(el));
}));

let priceSeen = false;
new IntersectionObserver(([en]) => {
  if (en.isIntersecting && !priceSeen) { priceSeen = true; goal("price_view"); }
}, { threshold: 0.3 }).observe($("#prices"));

window.addEventListener("load", () => ScrollTrigger.refresh());
