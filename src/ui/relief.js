/*
  Рельеф под курсором — по принципу референса (relief-bg на obsidianassembly.com):
  курсор «поднимает» карту высот, она расплывается и гаснет; по следу проступает
  узор и освещается как рельеф — лампа висит над курсором.

  Узор свой — гильоше, как на часовых циферблатах (в тему механизма), рисуется
  на canvas при запуске, без внешних картинок. Нет WebGL — просто не включается.
*/
const SIM_SCALE = 0.4;
const OPT = {
  radius: 240, rise: 0.22, decay: 0.012, spread: 0.3,
  relief: 16, ambient: 0.1, diffuse: 1.9, specular: 1.5, shininess: 30, lightHeight: 380,
};

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Шаг симуляции: сглаживание, затухание и подъём у курсора (сильнее там, где узор светлее).
const SIM = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_prev, u_tex;
uniform vec2 u_simRes, u_mouse, u_cover;
uniform float u_radius, u_rise, u_decay, u_spread;
float H(vec2 uv) { return texture2D(u_prev, uv).r; }
void main() {
  vec2 t = 1.0 / u_simRes;
  float h = H(v_uv);
  float avg = (H(v_uv + vec2(-t.x, 0.0)) + H(v_uv + vec2(t.x, 0.0)) + H(v_uv + vec2(0.0, -t.y)) + H(v_uv + vec2(0.0, t.y))) * 0.25;
  h = max(mix(h, avg, u_spread) - u_decay, 0.0);
  float d = distance(v_uv * u_simRes, u_mouse);
  if (d < u_radius) {
    float k = 1.0 - smoothstep(0.0, u_radius, d);
    k = k * k * k;
    float lum = texture2D(u_tex, (v_uv - 0.5) * u_cover + 0.5).r;
    h = clamp(h + u_rise * k * mix(0.35, 1.0, lum), 0.0, 1.0);
  }
  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}`;

// Вывод: нормаль из высоты, диффуз и блик от лампы над курсором, латунный оттенок.
const DRAW = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_height, u_tex;
uniform vec2 u_simRes, u_res, u_mouseRes, u_cover;
uniform float u_relief, u_ambient, u_diffuse, u_specular, u_shininess, u_lightH;
void main() {
  vec2 t = 1.0 / u_simRes;
  float h = texture2D(u_height, v_uv).r;
  float hL = texture2D(u_height, v_uv - vec2(t.x, 0.0)).r;
  float hR = texture2D(u_height, v_uv + vec2(t.x, 0.0)).r;
  float hD = texture2D(u_height, v_uv - vec2(0.0, t.y)).r;
  float hU = texture2D(u_height, v_uv + vec2(0.0, t.y)).r;
  float lum = texture2D(u_tex, (v_uv - 0.5) * u_cover + 0.5).r;
  float height = h * (0.4 + 0.6 * lum);
  vec3 n = normalize(vec3((hL - hR) * u_relief * (0.4 + lum), (hD - hU) * u_relief * (0.4 + lum), 1.0));
  vec3 p = vec3(v_uv * u_res, height * 40.0);
  vec3 l = normalize(vec3(u_mouseRes, u_lightH) - p);
  float diff = max(dot(n, l), 0.0);
  vec3 r = reflect(-l, n);
  float spec = pow(max(r.z, 0.0), u_shininess);
  vec3 brass = vec3(0.78, 0.64, 0.35);
  vec3 steel = vec3(0.55, 0.62, 0.7);
  vec3 base = mix(steel * 0.35, brass, lum);
  vec3 col = base * (u_ambient + u_diffuse * diff) + spec * u_specular * vec3(1.0, 0.93, 0.8);
  float a = clamp(h * 1.6, 0.0, 1.0) * (0.25 + 0.75 * lum);
  gl_FragColor = vec4(col * a, a);
}`;

// Гильоше: десятки концентрических волнистых колец — как на циферблате.
function guilloche(size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size * 0.49;
  g.lineWidth = 1.2;
  for (let k = 0; k < 70; k++) {
    const base = R * (0.08 + 0.92 * (k / 70));
    const amp = base * 0.035;
    g.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * ((k % 3) / 2)})`;
    g.beginPath();
    for (let s = 0; s <= 720; s++) {
      const a = (s / 720) * Math.PI * 2;
      const r = base + amp * Math.sin(a * 24 + k * 0.45) + amp * 0.5 * Math.sin(a * 7 - k * 0.2);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (s === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Лучи от центра — второй слой узора, как «солнечная» шлифовка.
  g.lineWidth = 0.8;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.1, cy + Math.sin(a) * R * 0.1);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }
  return c;
}

export function initRelief(canvas) {
  if (!canvas) return;
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  };
  let simP, drawP;
  try { simP = program(SIM); drawP = program(DRAW); } catch { return; }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const texFrom = (src) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const pattern = texFrom(guilloche());

  let W = 0, H = 0, SW = 0, SH = 0, targets = [];
  const makeTarget = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SW, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb };
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W;
    canvas.height = H;
    SW = Math.max(1, Math.round(W * SIM_SCALE));
    SH = Math.max(1, Math.round(H * SIM_SCALE));
    targets.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
    targets = [makeTarget(), makeTarget()];
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const mouse = { x: -9999, y: -9999 };
  let energy = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width;
    mouse.y = 1 - (e.clientY - r.top) / r.height;
    energy = 1;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) tick(); }).observe(canvas);

  const bindQuad = (p) => {
    const loc = gl.getAttribLocation(p, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };
  const u = (p, name) => gl.getUniformLocation(p, name);

  // Узор вписан «по обложке»: круг остаётся кругом при любых пропорциях окна.
  const cover = () => (W > H ? [1, H / W] : [W / H, 1]);

  let src = 0, running = false;
  function tick() {
    if (running) return;
    running = true;
    requestAnimationFrame(step);
  }
  function step() {
    running = false;
    if (!visible) return;
    const [a, b] = [targets[src], targets[1 - src]];
    const [cx, cy] = cover();

    gl.useProgram(simP);
    bindQuad(simP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
    gl.viewport(0, 0, SW, SH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(u(simP, "u_prev"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pattern); gl.uniform1i(u(simP, "u_tex"), 1);
    gl.uniform2f(u(simP, "u_simRes"), SW, SH);
    gl.uniform2f(u(simP, "u_mouse"), mouse.x * SW, mouse.y * SH);
    gl.uniform2f(u(simP, "u_cover"), cx, cy);
    gl.uniform1f(u(simP, "u_radius"), OPT.radius * SIM_SCALE);
    gl.uniform1f(u(simP, "u_rise"), OPT.rise * energy);
    gl.uniform1f(u(simP, "u_decay"), OPT.decay);
    gl.uniform1f(u(simP, "u_spread"), OPT.spread);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(drawP);
    bindQuad(drawP);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex); gl.uniform1i(u(drawP, "u_height"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pattern); gl.uniform1i(u(drawP, "u_tex"), 1);
    gl.uniform2f(u(drawP, "u_simRes"), SW, SH);
    gl.uniform2f(u(drawP, "u_res"), W, H);
    gl.uniform2f(u(drawP, "u_mouseRes"), mouse.x * W, mouse.y * H);
    gl.uniform2f(u(drawP, "u_cover"), cx, cy);
    gl.uniform1f(u(drawP, "u_relief"), OPT.relief);
    gl.uniform1f(u(drawP, "u_ambient"), OPT.ambient);
    gl.uniform1f(u(drawP, "u_diffuse"), OPT.diffuse);
    gl.uniform1f(u(drawP, "u_specular"), OPT.specular);
    gl.uniform1f(u(drawP, "u_shininess"), OPT.shininess);
    gl.uniform1f(u(drawP, "u_lightH"), OPT.lightHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    src = 1 - src;
    // Курсор замер — подъём стихает, след гаснет сам.
    energy *= 0.92;
    tick();
  }
}
