import { gsap } from "gsap";

/*
  Сборка механизма на заставке: большое колесо влетает слева, второе — справа,
  малая шестерня сверху; встают в зацепление и ждут перелёта в первый экран.
  Детали — отдельные кадры того же рендера, в той же позиции, что первый кадр цикла,
  поэтому подмена на вращающийся механизм незаметна.
*/
// Детали только подъезжают, без вращения картинки: они сняты под наклоном,
// и любой поворот в плоскости экрана ломает перспективу.
const FROM = [
  { xPercent: -60, yPercent: 6 },
  { xPercent: 60, yPercent: -4 },
  { xPercent: 20, yPercent: -70 },
];

export function assemble(loader, parts) {
  const ready = Promise.all(parts.map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => { throw new Error("part"); }))));
  // Детали не пришли быстро — не держим посетителя, показываем механизм сразу.
  const timeout = new Promise((_, no) => setTimeout(() => no(new Error("slow")), 1500));
  return Promise.race([ready, timeout]).then(() => new Promise((done) => {
    loader.classList.add("is-assembling");
    const tl = gsap.timeline({ onComplete: done });
    parts.forEach((img, i) => {
      gsap.set(img, { transformOrigin: img.dataset.origin || "50% 50%" });
      tl.fromTo(img, { autoAlpha: 0, ...FROM[i] }, { autoAlpha: 1, xPercent: 0, yPercent: 0, duration: 1.5, ease: "power3.out" }, 0.15 + i * 0.3);
    });
    // Детали встали и ждут: механизм тронется вместе с перелётом в первый экран (main.js).
    })).catch(() => { loader.classList.remove("is-assembling"); });
}
