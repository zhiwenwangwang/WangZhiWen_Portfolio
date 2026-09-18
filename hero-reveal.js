(() => {
  "use strict";
  const page = document.querySelector(".page");
  const background = document.querySelector(".bg");
  const canvas = document.querySelector(".bg-reveal");
  const context = canvas.getContext("2d");
  const bubbleCanvas = document.querySelector(".bg-bubbles"), bubbleContext = bubbleCanvas.getContext("2d");
  const mask = document.createElement("canvas"), maskContext = mask.getContext("2d");
  const layer = document.createElement("canvas"), layerContext = layer.getContext("2d");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 1, height = 1, scale = 1, radius = 72, trailBrightness = 1.4, lifetime = 1240;
  let stamps = [], bubbles = [], previous = null, seed = 1, raf = 0, visible = true, enabled = true;
  let lastEmission = 0, bubbleTravel = 0;
  let underlay = null, underlayURL = "", grain;
  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
  const smooth = value => value * value * (3 - 2 * value);
  function randomFor(value) {
    return () => {
      value = value + 0x6D2B79F5 | 0;
      let t = Math.imul(value ^ value >>> 15, 1 | value);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clear() {
    cancelAnimationFrame(raf); raf = 0; stamps = []; bubbles = []; previous = null; lastEmission = 0; bubbleTravel = 0;
    context.clearRect(0, 0, width, height);
    bubbleContext.clearRect(0, 0, width, height);
    maskContext.clearRect(0, 0, width, height);
    if (underlay?.tagName === "VIDEO") underlay.pause();
    canvas.dataset.stamps = "0";
  }
  function allowed() {
    return enabled && visible && !motion.matches && !document.hidden && !document.body.matches(".editor-open, .auth-open") && !document.querySelector("dialog[open]");
  }
  function resize() {
    const rect = background.getBoundingClientRect();
    scale = Math.min(devicePixelRatio || 1, 1.35, 1920 / Math.max(rect.width, 1), 1080 / Math.max(rect.height, 1));
    width = Math.max(1, Math.round(rect.width * scale));
    height = Math.max(1, Math.round(rect.height * scale));
    [canvas, mask, layer, bubbleCanvas].forEach(node => { node.width = width; node.height = height; });
    radius = clamp(Math.min(rect.width, rect.height) * .086, 28, Number(document.body.dataset.trailBrush || 72)) * scale;
    clear();
    const texture = document.createElement("canvas");
    texture.width = texture.height = 128;
    const g = texture.getContext("2d"), pixels = g.createImageData(128, 128), random = randomFor(94731);
    for (let i = 3; i < pixels.data.length; i += 4) {
      const n = random();
      pixels.data[i] = n > .69 ? Math.round(Math.pow((n - .69) / .31, 1.8) * 105) : 0;
    }
    g.putImageData(pixels, 0, 0);
    grain = maskContext.createPattern(texture, "repeat");
  }
  function createStamp(x, y, time, direction, speed) {
    const random = randomFor(seed++ * 7919);
    const size = radius * (.78 + random() * .4);
    const movement = clamp(speed / 1600, 0, 1);
    const outline = [], fringe = [], splatters = [];
    const phaseA = random() * Math.PI * 2, phaseB = random() * Math.PI * 2;
    for (let i = 0; i < 27; i++) {
      const angle = i / 27 * Math.PI * 2;
      outline.push(.86 + Math.sin(angle * 3 + phaseA) * .105 + Math.sin(angle * 7 + phaseB) * .055 + (random() - .5) * .11);
    }
    for (let i = 0; i < 6; i++) {
      const angle = random() * Math.PI * 2, distance = .7 + random() * .36;
      fringe.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, radius: .055 + random() * .15, alpha: .12 + random() * .25 });
    }
    for (let i = 0; i < 3; i++) {
      const angle = random() * Math.PI * 2, distance = 1 + random() * .56;
      splatters.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, radius: .014 + random() * .045, alpha: .18 + random() * .32 });
    }
    stamps.push({ x, y, born: time, major: size * (1.02 + movement * .58), minor: size * (.66 - movement * .07),
      angle: direction + (random() - .5) * .2, outline, fringe, splatters });
    if (stamps.length > 240) stamps.splice(0, stamps.length - 240);
  }
  function emitBubble(x, y, now, direction, speed) {
    if (document.body.dataset.trailBubbles === "false") return;
    const random = randomFor(seed++ * 6151);
    const spread = radius * (.25 + random() * .48), side = random() > .5 ? 1 : -1;
    bubbles.push({
      x: x + Math.cos(direction + Math.PI / 2) * spread * side,
      y: y + Math.sin(direction + Math.PI / 2) * spread * side,
      born: now + 90 + random() * 150, life: 820 + random() * 380,
      radius: radius * (.08 + random() * .16),
      vx: -Math.cos(direction) * Math.min(65, speed * .045) * scale + (random() - .5) * 24 * scale,
      vy: -(24 + random() * 46) * scale, phase: random() * Math.PI * 2,
    });
    if (bubbles.length > 65) bubbles.splice(0, bubbles.length - 65);
  }
  function input(event) {
    if (!allowed()) return;
    const rect = background.getBoundingClientRect();
    const now = performance.now();
    const point = { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height, time: now };
    // Input is sampled immediately; spacing follows brush size, not pointer event frequency.
    if (previous && now - previous.time > 180) previous = null;
    if (previous) {
      const dx = point.x - previous.x, dy = point.y - previous.y, distance = Math.hypot(dx, dy);
      if (distance < scale) return;
      const elapsed = clamp(now - previous.time, 4, 64);
      const speed = distance / scale / elapsed * 1000;
      const gap = Math.max(5 * scale, radius * .17);
      const steps = Math.min(100, Math.max(1, Math.ceil(distance / gap)));
      const angle = Math.atan2(dy, dx);
      for (let i = 1; i <= steps; i++) {
        const x = previous.x + dx * i / steps, y = previous.y + dy * i / steps;
        const born = now - elapsed * (1 - i / steps);
        createStamp(x, y, born, angle, speed);
        bubbleTravel += distance / steps;
        if (born - lastEmission > 30 || bubbleTravel >= Math.max(10 * scale, radius * .6)) {
          emitBubble(x, y, born, angle, speed); lastEmission = born; bubbleTravel = 0;
        }
      }
    } else {
      createStamp(point.x, point.y, now - 12, 0, 0);
      emitBubble(point.x, point.y, now, 0, 0); lastEmission = now; bubbleTravel = 0;
    }
    previous = point;
    if (underlay?.tagName === "VIDEO") {
      const video = underlay;
      video.play().then(() => { if (!allowed() || !stamps.length || underlay !== video) video.pause(); }).catch(() => {});
    }
    schedule();
  }
  function softCircle(dot, opacity) {
    const gradient = maskContext.createRadialGradient(dot.x, dot.y, dot.radius * .04, dot.x, dot.y, dot.radius);
    gradient.addColorStop(0, `rgba(255,255,255,${opacity * dot.alpha})`);
    gradient.addColorStop(.7, `rgba(255,255,255,${opacity * dot.alpha * .54})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    maskContext.fillStyle = gradient;
    maskContext.beginPath(); maskContext.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2); maskContext.fill();
  }
  function paintStamp(stamp, now) {
    const age = clamp((now - stamp.born) / lifetime, 0, 1);
    const opacity = smooth(clamp(age / .018, 0, 1)) * (age < .62 ? 1 : Math.pow(Math.max(0, 1 - (age - .62) / .38), 1.28));
    if (opacity < .002) return;
    const shrink = .055 + Math.pow(1 - age, .54) * .945;
    maskContext.save();
    maskContext.translate(stamp.x, stamp.y); maskContext.rotate(stamp.angle);
    maskContext.scale(stamp.major * shrink, stamp.minor * shrink);
    maskContext.save(); maskContext.beginPath();
    stamp.outline.forEach((r, i) => {
      const angle = i / stamp.outline.length * Math.PI * 2;
      if (i) maskContext.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else maskContext.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    });
    maskContext.closePath(); maskContext.clip();
    const wash = maskContext.createRadialGradient(-.12, -.06, .04, 0, 0, 1.1);
    [[0, 1], [.42, .95], [.72, .66], [.91, .22], [1, 0]].forEach(([stop, alpha]) => wash.addColorStop(stop, `rgba(255,255,255,${opacity * alpha})`));
    maskContext.fillStyle = wash; maskContext.fillRect(-1.25, -1.25, 2.5, 2.5);
    maskContext.restore();
    [...stamp.fringe, ...stamp.splatters].forEach(dot => softCircle(dot, opacity));
    maskContext.restore();
  }
  function cover(target, source) {
    const w = source.videoWidth || source.naturalWidth, h = source.videoHeight || source.naturalHeight;
    if (!w || !h) return false;
    const style = getComputedStyle(document.documentElement);
    const contain = style.getPropertyValue("--background-fit").trim() === "contain";
    const fit = (contain ? Math.min : Math.max)(width / w, height / h);
    const focus = parseFloat(style.getPropertyValue("--background-position")) / 100 || 0;
    const rect = { x: (width - w * fit) * focus, y: (height - h * fit) / 2, width: w * fit, height: h * fit };
    target.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    return rect;
  }
  function render(now) {
    raf = 0;
    if (!allowed()) { clear(); return; }
    stamps = stamps.filter(stamp => now - stamp.born < lifetime);
    bubbles = bubbles.filter(bubble => now - bubble.born < bubble.life);
    context.clearRect(0, 0, width, height);
    bubbleContext.clearRect(0, 0, width, height);
    canvas.dataset.stamps = String(stamps.length);
    if (!stamps.length && !bubbles.length) { previous = null; if (underlay?.tagName === "VIDEO") underlay.pause(); return; }
    maskContext.clearRect(0, 0, width, height);
    stamps.forEach(stamp => paintStamp(stamp, now));
    maskContext.save(); maskContext.globalCompositeOperation = "destination-out";
    maskContext.globalAlpha = .42; maskContext.fillStyle = grain; maskContext.fillRect(0, 0, width, height); maskContext.restore();
    layerContext.clearRect(0, 0, width, height);
    layerContext.globalCompositeOperation = "source-over";
    const original = document.querySelector(document.body.dataset.backgroundMode === "image" ? ".bg-image" : ".bg-video");
    const source = underlay && (underlay.naturalWidth || underlay.readyState >= 2) ? underlay : original;
    layerContext.filter = source === original
      ? `saturate(.74) brightness(${trailBrightness}) contrast(1)`
      : `brightness(${trailBrightness})`;
    const placement = cover(layerContext, source);
    layerContext.filter = "none";
    if (source === original && placement) {
      layerContext.save();
      layerContext.beginPath(); layerContext.rect(placement.x, placement.y, placement.width, placement.height); layerContext.clip();
      layerContext.globalCompositeOperation = "screen";
      layerContext.fillStyle = "rgba(130,215,250,.44)"; layerContext.fillRect(0, 0, width, height);
      layerContext.restore();
    }
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.filter = `blur(${2.2 * scale}px)`; layerContext.drawImage(mask, 0, 0); layerContext.filter = "none";
    layerContext.globalCompositeOperation = "source-over"; context.drawImage(layer, 0, 0);
    bubbles.forEach(bubble => {
      const age = (now - bubble.born) / bubble.life;
      if (age <= 0) return;
      const seconds = (now - bubble.born) / 1000;
      const opacity = Math.min(1, age / .12) * Math.pow(1 - age, .75);
      const size = bubble.radius * (1 - age * .5);
      const x = bubble.x + bubble.vx * seconds + Math.sin(age * 4 + bubble.phase) * radius * .12 * age;
      const y = bubble.y + bubble.vy * seconds;
      window.portfolioBubbles.paint(bubbleContext, x, y, size, opacity, bubble.phase + age);
    });
    schedule();
  }
  function schedule() { if (!raf && allowed()) raf = requestAnimationFrame(render); }
  function settings() {
    enabled = document.body.dataset.backgroundReveal !== "false";
    trailBrightness = clamp(Number(document.body.dataset.trailBrightness || 140) / 100, .7, 1.9);
    lifetime = clamp(Number(document.body.dataset.trailLife || 1240), 400, 2000);
    const rect = background.getBoundingClientRect();
    radius = clamp(Math.min(rect.width, rect.height) * .086, 28, Number(document.body.dataset.trailBrush || 72)) * scale;
    if (document.body.dataset.trailBubbles === "false") bubbles = [];
    if (!allowed()) clear();
  }
  page.addEventListener("pointermove", input, { passive: true });
  page.addEventListener("pointerdown", event => { previous = null; input(event); }, { passive: true });
  page.addEventListener("pointerleave", () => { previous = null; });
  page.addEventListener("pointercancel", () => { previous = null; });
  page.addEventListener("pointerup", event => { if (event.pointerType !== "mouse") previous = null; });
  document.addEventListener("portfolio:change", settings);
  document.addEventListener("visibilitychange", settings);
  motion.addEventListener("change", settings);
  new ResizeObserver(resize).observe(background);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) clear(); }).observe(page);
  window.heroReveal = {
    setMedia(media) {
      const url = media?.url || "";
      if (url === underlayURL) return;
      clear();
      if (underlay?.tagName === "VIDEO") { underlay.pause(); underlay.removeAttribute("src"); underlay.load(); }
      underlayURL = url; underlay = null;
      if (!media) return;
      underlay = document.createElement(media.kind === "video" ? "video" : "img");
      if (media.kind === "video") { underlay.muted = true; underlay.loop = true; underlay.playsInline = true; underlay.preload = "metadata"; }
      underlay.src = url;
    },
    clear,
    stats() {
      const pixels = maskContext.getImageData(0, 0, width, height).data;
      let area = 0, soft = 0;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 5) area++; if (pixels[i] > 5 && pixels[i] < 245) soft++; }
      return { width, height, radius: radius / scale, lifetime, stamps: stamps.length, bubbles: bubbles.length, running: !!raf, area, soft, custom: !!underlay };
    },
  };
  settings(); resize();
})();
