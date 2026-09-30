/*
  Фон первого экрана: редкие звёзды в стальной дымке и тёплые пылинки,
  всплывающие в латунном отсвете за механизмом. Всё едва заметно —
  фон должен ощущаться, а не читаться. Кадры идут, только пока экран виден.
*/
const STARS = 70;
const DUST = 26;

export function initSky(canvas, { reduce }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let w = 0, h = 0, dpr = 1, visible = true, raf = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  const stars = Array.from({ length: STARS }, () => ({
    x: Math.random(),
    // Выше арки: к низу звёзды гаснут, их всё равно накрывает тёмная дуга.
    y: Math.pow(Math.random(), 1.4) * 0.62,
    r: 0.4 + Math.random() * 0.9,
    a: 0.25 + Math.random() * 0.55,
    period: 8 + Math.random() * 12,
    phase: Math.random() * Math.PI * 2,
    depth: 0.3 + Math.random() * 0.7,
    warm: Math.random() < 0.2,
  }));
  const spawn = (d, fresh) => {
    d.x = 0.5 + (Math.random() - 0.5) * 0.36;
    d.y = fresh ? 0.45 + Math.random() * 0.35 : 0.8;
    d.r = 0.6 + Math.random() * 1.1;
    d.v = 5 + Math.random() * 9;
    d.sway = 6 + Math.random() * 10;
    d.phase = Math.random() * Math.PI * 2;
    d.life = 0;
    d.max = 7 + Math.random() * 8;
    return d;
  };
  const dust = Array.from({ length: DUST }, () => {
    const d = spawn({}, true);
    d.life = Math.random() * d.max;
    return d;
  });

  // Пылинка — один раз нарисованный мягкий кружок: градиент на каждую частицу в каждом кадре
  // заметно грузил видеокарту как раз тогда, когда механизм перелетает из заставки.
  const mote = document.createElement("canvas");
  mote.width = mote.height = 32;
  {
    const m = mote.getContext("2d");
    const g = m.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(240, 206, 140, 1)");
    g.addColorStop(1, "rgba(240, 206, 140, 0)");
    m.fillStyle = g;
    m.fillRect(0, 0, 32, 32);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, w, h);
    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin((t / s.period) * Math.PI * 2 + s.phase);
      const fade = 1 - Math.min(1, s.y / 0.62);
      const alpha = s.a * tw * (0.35 + 0.65 * fade);
      if (alpha < 0.02) continue;
      ctx.fillStyle = s.warm ? `rgba(236, 214, 170, ${alpha})` : `rgba(222, 231, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x * w - pointer.sx * 6 * s.depth, s.y * h - pointer.sy * 4 * s.depth, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of dust) {
      d.life += dt;
      if (d.life > d.max) spawn(d, false);
      d.y -= (d.v * dt) / h;
      const k = d.life / d.max;
      // Появляется и гаснет плавно — без вспышек.
      const alpha = Math.sin(k * Math.PI) * 0.5;
      if (alpha < 0.02) continue;
      const x = d.x * w + Math.sin(t * 0.4 + d.phase) * d.sway;
      const r = d.r * 3;
      ctx.globalAlpha = alpha;
      ctx.drawImage(mote, x - r, d.y * h - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(now / 1000, dt);
    if (visible && enabled) raf = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener("resize", () => { resize(); if (reduce) draw(0, 0); });
  if (reduce) { draw(0, 0); return { start() {} }; }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  // Небо оживает, только когда разрешили (после посадки механизма, см. main.js).
  let enabled = false;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (enabled && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }).observe(canvas);
  draw(0, 0);
  return {
    start() {
      enabled = true;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    },
  };
}
