/*
  Круглое меню. Диск раскрывается из центра кнопки «Меню» (clip-path circle),
  сайт позади размыт. Фокус заперт внутри, Esc и клик по фону закрывают,
  фокус возвращается на кнопку. Прокрутка страницы на это время остановлена.
*/
export function initMenu({ onNavigate, onOpen, lockScroll, unlockScroll }) {
  const menu = document.getElementById("menu");
  const openBtn = document.getElementById("menuOpen");
  if (!menu || !openBtn) return;
  // Чертёж для фона берём из светлой части, а не дублируем разметку.
  // pathLength="1" — чтобы прорисовка шла за одно время у линий любой длины;
  // non-scaling-stroke снимаем: вместе с pathLength Chrome считает штрихи неверно.
  const src = document.querySelector(".blueprint svg");
  const slot = menu.querySelector(".menu__blueprint");
  if (src && slot) {
    const svg = src.cloneNode(true);
    svg.removeAttribute("class");
    svg.querySelectorAll("[vector-effect]").forEach((el) => el.removeAttribute("vector-effect"));
    svg.querySelectorAll("path, circle").forEach((el) => { el.setAttribute("pathLength", "1"); el.removeAttribute("stroke-dasharray"); });
    slot.append(svg);
  }
  const focusables = () => [...menu.querySelectorAll("a[href], button")];
  let closing = null;

  function origin() {
    const r = openBtn.getBoundingClientRect();
    menu.style.setProperty("--ox", `${r.left + r.width / 2}px`);
    menu.style.setProperty("--oy", `${r.top + r.height / 2}px`);
  }

  function open() {
    if (!menu.hidden) return;
    clearTimeout(closing);
    origin();
    menu.hidden = false;
    menu.classList.remove("is-closing");
    // Два кадра: сначала элемент появляется в DOM, потом запускается переход.
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-open")));
    openBtn.setAttribute("aria-expanded", "true");
    lockScroll();
    menu.querySelector(".menu__link").focus({ preventScroll: true });
    onOpen?.();
  }

  // Шапка выходит из visibility: hidden через переход; фокус на скрытую кнопку не встаёт — ждём кадры.
  function focusWhenVisible(tries = 20) {
    if (getComputedStyle(openBtn).visibility === "visible") openBtn.focus({ preventScroll: true });
    else if (tries > 0) requestAnimationFrame(() => focusWhenVisible(tries - 1));
  }

  function close(then) {
    if (menu.hidden) return;
    origin();
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    openBtn.setAttribute("aria-expanded", "false");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    closing = setTimeout(() => {
      menu.hidden = true;
      menu.classList.remove("is-closing");
      unlockScroll();
      if (then) then();
      else focusWhenVisible();
    }, reduce ? 0 : 520);
  }

  openBtn.addEventListener("click", open);
  menu.querySelectorAll("[data-menu-close]").forEach((el) => el.addEventListener("click", () => close()));
  menu.querySelectorAll(".menu__link").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = a.getAttribute("href");
    close(() => onNavigate(target));
  }));

  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const list = focusables();
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
