import { ScrollTrigger } from "gsap/ScrollTrigger";

/*
  Прогресс секции → CSS-переменная --p (0…1), как string="progress" у референса.
  Всё движение по прокрутке описано в CSS формулами от --p, а не таймлайнами:
  так его легко читать и подкручивать.

  data-progress="hero"  — пока секция уходит вверх: от «верх у верха экрана» до «низ у верха»;
  data-progress="enter" — пока секция проходит экран целиком: от «верх у низа» до «низ у верха».
*/
export function initProgress({ reduce }) {
  const items = [];
  document.querySelectorAll("[data-progress]").forEach((el) => {
    const kind = el.dataset.progress;
    const set = (p) => {
      el.style.setProperty("--p", p.toFixed(4));
      items.forEach((it) => it.el === el && it.cb?.(p));
    };
    if (reduce) { set(0); return; }
    ScrollTrigger.create({
      trigger: el,
      start: kind === "hero" ? "top top" : "top bottom",
      end: "bottom top",
      onUpdate: (self) => set(self.progress),
      onRefresh: (self) => set(self.progress),
    });
    set(0);
  });
  return {
    // Подписка JS на прогресс секции (например, затемнение механизма на холсте).
    on(el, cb) { items.push({ el, cb }); },
  };
}
