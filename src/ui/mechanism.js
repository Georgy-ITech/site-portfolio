/*
  Механизм — заранее отрендеренный бесшовный цикл (трассировка лучей, студийный свет,
  см. brand/preview/gear-render.html). С 2026-10 — макросъёмка: камера у ступицы большого
  колеса, малая глубина резкости, кадр 1600×900 во всю ширину первого экрана.
  За цикл (5 с, 48 к/с) колесо проходит 60° и совпадает само с собой — повтор не виден.

  Источник кадров — одно видео на все холсты, скачанное с настоящим прогрессом для заставки:
  - packed — H.264, альфа в нижней половине кадра, собирается на WebGL. H.264 декодирует
    видеокарта; VP9 с альфой Chrome декодирует программно, и под нагрузкой видео замирало
    на 0.2 с (замер на MSI, 2026-10-03).
  - poster — один кадр, если WebGL нет или видео не дало ни кадра (автозапуск запрещён и т. п.).

  Показ на <canvas>: поверх кадра рисуется свет за курсором и затемнение по прокрутке (fx),
  только по металлу — фон остаётся прозрачным.
*/
const base = import.meta.env.BASE_URL;

export function createMechanism() {
  const mode = hasWebGL() ? "packed" : "poster";
  const listeners = new Set();
  const emit = (p) => listeners.forEach((fn) => fn(p));
  const source = mode === "poster" ? posterSource(emit) : videoSource(emit);
  const clock = createClock(source, mode);
  if (/[?&]debug(&|=|$)/.test(location.search)) debugOverlay(clock, mode);
  return {
    mode,
    ready: source.ready,
    onProgress(fn) { listeners.add(fn); },
    // Один ход на все холсты: заставка, первый экран и финал показывают один и тот же кадр,
    // поэтому механизм переходит из заставки в первый экран без подмены и без рывка.
    hold() { clock.held = true; },
    still() { clock.still = true; },
    start: () => clock.start(),
    introK: () => clock.introK(),
    nudge: (v) => clock.nudge(v),
    tick: (t) => clock.tick(t),
    mount(canvas, opts = {}) { return mountPlayer(canvas, clock, opts); },
  };
}

/* ---------- общий ход механизма ---------- */

// Два видео одной сцены: заставка (сборка из деталей → разгон → пролёт камеры к ступице) и
// бесшовный цикл крупным планом. Последний кадр заставки совпадает с первым кадром цикла.
function createClock(source, mode) {
  const c = {
    held: false, still: false, video: null, intro: null, poster: null, why: "",
    rate: 1, velocity: 0, stage: mode === "packed" ? "intro" : "loop",
  };
  // Страховка: если видео не дало ни кадра (автозапуск запрещён, декодер или WebGL отказали),
  // показываем неподвижный кадр, а не пустоту.
  c.fallback = (why) => {
    if (c.poster) return;
    c.why = why;
    c.stage = "loop";
    c.poster = posterSource(() => {}).img;
    for (const v of [c.video, c.intro]) if (v) { v.pause(); v.remove(); }
    c.video = c.intro = null;
  };
  const makeVideo = (url, loop) => {
    const v = document.createElement("video");
    v.muted = true; v.loop = loop; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
    v.preload = "auto"; v.className = "mech-src"; v.src = url;
    document.body.append(v);
    return v;
  };
  if (mode === "packed") {
    // Видео лежат в углу окна прозрачными, чтобы браузер считал их видимыми и не останавливал;
    // показывают их холсты.
    source.ready.then(({ intro, loop }) => {
      const v = makeVideo(loop, true);
      c.video = v;
      try { c.unpack = createUnpacker(v); } catch { c.fallback("webgl"); return; }
      v.addEventListener("error", () => c.fallback("error"), { once: true });
      setTimeout(() => { if (c.video && c.video.readyState < 2) c.fallback("no-data"); }, 3000);
      if (intro && !c.still) {
        const iv = makeVideo(intro, false);
        c.intro = iv;
        try { c.introUnpack = createUnpacker(iv); } catch { c.intro = null; c.stage = "loop"; }
        iv.addEventListener("error", () => { c.intro = null; c.stage = "loop"; }, { once: true });
      } else c.stage = "loop";
      // Режим энергосбережения на iPhone запрещает автозапуск — тогда пускаем с первого касания.
      const kick = () => { if (!c.held && !c.still) (c.stage === "intro" && c.intro ? c.intro : v).play().catch(() => {}); };
      addEventListener("touchstart", kick, { once: true, passive: true });
      if (!c.held && !c.still) { c.stage = "loop"; v.play().catch(() => {}); }
      else if (c.held) {
        // Разогрев декодеров: коротко проигрываем и возвращаем на начало — иначе первый старт
        // после паузы стоит кадр-другой рывка.
        for (const x of [v, c.intro]) if (x) x.play().then(() => setTimeout(() => { if (c.held) { x.pause(); x.currentTime = 0; } }, 250)).catch(() => {});
      }
    });
  }
  // Маховик: прокрутка мягко раскручивает колёса (не больше чем вдвое), отпустили — они
  // дольше, чем разгонялись, возвращаются к своему ходу. Колёса не останавливаются никогда.
  // Считается по времени, а не по вызовам: tick зовут оба холста в одном кадре.
  c.tick = (t) => {
    const v = c.video;
    const dt = c.lastT == null ? 0 : t - c.lastT;
    if (dt <= 0) { c.lastT = t; return; }
    c.lastT = t;
    if (v && !c.still && !c.held && c.stage === "loop") {
      c.velocity *= Math.exp(-dt * 4);
      const target = 1 + Math.min(Math.abs(c.velocity) * 0.06, 1.1);
      c.rate += (target - c.rate) * (1 - Math.exp(-dt * (target > c.rate ? 3 : 1.4)));
      if (target === 1 && c.rate < 1.03) c.rate = 1;
      if (Math.abs(v.playbackRate - c.rate) > 0.03 || (c.rate === 1 && v.playbackRate !== 1)) v.playbackRate = c.rate;
    }
  };
  c.nudge = (v) => { c.velocity = v; };
  // Пролёт закончился — цикл стартует с нулевого кадра, а пока его кадр не пришёл,
  // на холсте остаётся последний кадр пролёта (он тот же самый).
  const toLoop = () => {
    const v = c.video;
    if (!v || c.stage === "loop") return;
    v.currentTime = 0; v.playbackRate = 1;
    v.play().catch(() => {});
    const go = () => { c.stage = "loop"; };
    if ("requestVideoFrameCallback" in v) v.requestVideoFrameCallback(go); else v.addEventListener("playing", go, { once: true });
    setTimeout(go, 400);
  };
  // Старт после загрузки: пролёт камеры. Промис — когда пролёт закончился.
  c.start = () => {
    if (!c.held) return Promise.resolve();
    c.held = false;
    c.rate = 1;
    const iv = c.intro;
    if (!iv || c.stage !== "intro") { toLoop(); return Promise.resolve(); }
    iv.currentTime = 0;
    iv.play().catch(() => {});
    setTimeout(() => { if (c.intro && c.intro.currentTime < 0.05) { c.stage = "loop"; toLoop(); } }, 1500);
    return new Promise((ok) => {
      let done = false;
      const end = () => { if (done) return; done = true; toLoop(); ok(); };
      iv.addEventListener("ended", end, { once: true });
      setTimeout(end, ((iv.duration || 2.5) + 1.5) * 1000);
    });
  };
  // Доля пролёта: 0 — общий план на заставке, 1 — крупный план (и всё время после).
  c.introK = () => {
    if (c.stage === "loop" || c.still) return 1;
    const iv = c.intro;
    return iv && iv.duration ? Math.min(1, iv.currentTime / iv.duration) : 0;
  };
  c.frame = () => {
    if (c.stage === "intro") {
      // Пока идёт загрузка — пусто: сцена начинается со сборки, первый кадр (детали за краями
      // кадра) неподвижным не показываем.
      if (c.held || !c.intro || c.intro.readyState < 2) return null;
      try { return c.introUnpack(); } catch { return null; }
    }
    if (c.video) {
      if (c.video.readyState < 2) return null;
      if (!c.unpack) return c.video;
      try { return c.unpack(); } catch { c.fallback("unpack"); return null; }
    }
    const img = c.poster || source.img;
    return img && img.complete && img.naturalWidth ? img : null;
  };
  return c;
}

/* ---------- источник: видео ---------- */

// Оба видео качаются одним потоком прогресса для счётчика заставки: сначала пролёт, потом цикл.
function videoSource(emit) {
  const files = [`${base}mech/dive.mp4`, `${base}mech/mech-macro.mp4`];
  const state = {};
  state.ready = (async () => {
    const sizes = [0, 0], got = [0, 0];
    const report = () => { const t = sizes[0] + sizes[1]; if (t) emit((got[0] + got[1]) / t); };
    const load = async (url, i) => {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(String(res.status));
        sizes[i] = Number(res.headers.get("content-length")) || 0;
        const reader = res.body.getReader();
        const chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got[i] += value.length;
          report();
        }
        return URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
      } catch {
        return i === 0 ? null : url; // пролёта нет — сразу цикл; цикл пусть браузер попробует сам
      }
    };
    const [intro, loop] = await Promise.all(files.map(load));
    emit(1);
    return { intro, loop };
  })();
  return state;
}

/* ---------- ?debug — состояние механизма на телефоне, где нет консоли ---------- */

function debugOverlay(c, mode) {
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:99999;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#0f0;background:rgb(0 0 0 / .8);pointer-events:none;white-space:pre-wrap;max-width:96vw";
  document.body.append(el);
  const errs = [];
  addEventListener("error", (e) => errs.push(String(e.message).slice(0, 80)));
  setInterval(() => {
    const v = c.video;
    el.textContent = [
      `mode=${mode} fallback=${c.why || "-"} held=${c.held}`,
      v ? `rs=${v.readyState} ns=${v.networkState} paused=${v.paused} t=${v.currentTime.toFixed(2)} ${v.videoWidth}x${v.videoHeight} err=${v.error ? v.error.code : "-"}` : "video=none",
      c.poster ? "poster" : "",
      `ua=${navigator.userAgent.slice(0, 90)}`,
      errs.length ? "js: " + errs.slice(-2).join(" | ") : "",
    ].filter(Boolean).join("\n");
  }, 400);
}

/* ---------- сборка прозрачности из H.264 (WebKit) ---------- */

function hasWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
}

// Цвет в верхней половине уже умножен на альфу, поэтому края чистые и без ореола.
function createUnpacker(video) {
  const cv = document.createElement("canvas");
  const gl = cv.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){vec3 c=texture2D(t,vec2(uv.x,uv.y*.5)).rgb;float a=texture2D(t,vec2(uv.x,uv.y*.5+.5)).r;gl_FragColor=vec4(min(c,vec3(a)),a);}"));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Перезаливаем текстуру, только когда видео действительно сменило кадр, — холстов три, а кадр один.
  let dirty = true, lastTime = -1;
  if ("requestVideoFrameCallback" in video) {
    const onFrame = () => { dirty = true; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }
  return () => {
    if (!dirty && video.currentTime === lastTime) return cv;
    dirty = false; lastTime = video.currentTime;
    const w = video.videoWidth, h = video.videoHeight >> 1;
    if (!w || !h) return null;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  };
}

/* ---------- источник: один кадр ---------- */

function posterSource(emit) {
  const img = new Image();
  img.decoding = "async";
  const ready = new Promise((ok) => { img.onload = img.onerror = () => { emit(1); ok(); }; });
  img.src = `${base}mech/macro-poster.webp`;
  return { img, ready };
}

/* ---------- проигрыватель ---------- */

// fit: "contain" — весь кадр внутри холста; "cover" — заполнить холст (фон первого экрана).
// При cover точка кадра focus (ступица колеса) ставится в точку холста anchor, насколько
// позволяют края: на узком экране телефона ступица не уходит за край.
// Во время пролёта на заставке (clock.introK() < 1) вид плавно идёт от «кадр целиком, по центру»
// к «cover со ступицей в anchor» — на узком экране общий план иначе не влез бы.
function mountPlayer(canvas, clock, { fx = null, fit = "contain", focus = [0.5, 0.5], anchor = () => [0.5, 0.5] } = {}) {
  const ctx = canvas.getContext("2d");
  let visible = true, w = 0, h = 0, res = 1, active = true;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * res;
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);
  resize();

  return {
    canvas,
    draw(t) {
      clock.tick(t);
      if (!visible || !active) return;
      const img = clock.frame();
      if (!img) return;
      const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
      if (!iw || !ih) return;
      const sc = Math.min(w / iw, h / ih);
      let dw = iw * sc, dh = ih * sc, dx = (w - dw) / 2, dy = (h - dh) / 2;
      if (fit === "cover") {
        const sv = Math.max(w / iw, h / ih), vw = iw * sv, vh = ih * sv;
        const [ax, ay] = anchor(w, h);
        const vx = Math.min(0, Math.max(w - vw, w * ax - focus[0] * vw));
        const vy = Math.min(0, Math.max(h - vh, h * ay - focus[1] * vh));
        const k0 = clock.introK(), k = k0 * k0 * (3 - 2 * k0);
        dw += (vw - dw) * k; dh += (vh - dh) * k; dx += (vx - dx) * k; dy += (vy - dy) * k;
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, dx, dy, dw, dh);
      if (fx) {
        // Всё, что рисует fx, ложится только на уже нарисованный металл.
        ctx.globalCompositeOperation = "source-atop";
        fx(ctx, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    },
    // Холст, который растягивают трансформацией (перелёт из заставки), рисуем сразу в
    // конечном разрешении — иначе в полёте механизм мылится, а на месте резко становится чётким.
    setResolution(k) { res = k; resize(); },
    // Невидимый холст не рисуем: во время перелёта заставки видеокарта нужна летящему механизму.
    setActive(on) { active = on; },
    destroy() { ro.disconnect(); io.disconnect(); },
  };
}
