(() => {
  "use strict";
  const canvas = document.querySelector(".ambient-bubbles");
  const ctx = canvas.getContext("2d");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 1, height = 1, ratio = 1, raf = 0, time = 0, last = 0, frames = 0;
  let visible = false, bubbles = [], pointer = { x: 0, y: 0 }, drift = { x: 0, y: 0 };

  // Thin-film rim, opposing reflections and a transparent center, shared by both effects.
  function paint(context, x, y, radius, opacity, phase = 0) {
    if (radius < .2 || opacity < .002) return;
    context.save();
    context.translate(x, y);
    context.scale(radius, radius);
    context.globalAlpha *= opacity;
    const skin = context.createRadialGradient(-.26, -.32, .06, 0, 0, 1);
    skin.addColorStop(0, "rgba(219,248,255,.05)");
    skin.addColorStop(.62, "rgba(173,222,250,.015)");
    skin.addColorStop(.86, "rgba(153,224,255,.10)");
    skin.addColorStop(.965, "rgba(230,249,255,.32)");
    skin.addColorStop(1, "rgba(174,211,255,0)");
    context.fillStyle = skin;
    context.beginPath(); context.arc(0, 0, 1, 0, Math.PI * 2); context.fill();
    const rim = context.createLinearGradient(-.8, -1, .6, 1);
    rim.addColorStop(0, "rgba(250,255,255,.92)");
    rim.addColorStop(.34, "rgba(102,192,255,.20)");
    rim.addColorStop(.58, "rgba(220,191,241,.42)");
    rim.addColorStop(.8, "rgba(201,246,255,.70)");
    rim.addColorStop(1, "rgba(100,169,228,.24)");
    context.strokeStyle = "rgba(18,63,105,.22)";
    context.lineWidth = Math.min(.13, Math.max(.025, 1.8 / radius));
    context.beginPath(); context.arc(0, 0, .982, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = rim;
    context.lineWidth = Math.min(.10, Math.max(.018, 1.1 / radius));
    context.beginPath(); context.arc(0, 0, .967, 0, Math.PI * 2); context.stroke();
    context.rotate(Math.sin(phase) * .12);
    context.lineCap = "round";
    context.strokeStyle = "rgba(255,255,255,.86)"; context.lineWidth = .047;
    context.beginPath(); context.ellipse(-.10, -.08, .74, .76, -.18, Math.PI * 1.05, Math.PI * 1.54); context.stroke();
    context.strokeStyle = "rgba(203,241,255,.40)"; context.lineWidth = .018;
    context.beginPath(); context.ellipse(.03, .05, .84, .84, 0, .22, 1.36); context.stroke();
    const reflection = context.createRadialGradient(-.42, -.46, 0, -.42, -.46, .27);
    reflection.addColorStop(0, "rgba(255,255,255,.60)");
    reflection.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = reflection;
    context.beginPath(); context.ellipse(-.42, -.46, .23, .11, -.64, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  function allowed() {
    return visible && scrollY > innerHeight * .5 && document.body.dataset.ambientBubbles !== "false" && !document.hidden && !motion.matches && !document.body.matches(".editor-open, .auth-open") && !document.querySelector("dialog[open]");
  }
  function tick(now) {
    raf = 0;
    if (!allowed()) { stop(); return; }
    const dt = Math.min((now - (last || now)) / 1000, .05);
    last = now; time += dt; frames++;
    drift.x += (pointer.x - drift.x) * Math.min(1, dt * 2);
    drift.y += (pointer.y - drift.y) * Math.min(1, dt * 2);
    ctx.clearRect(0, 0, width, height);
    const pageFade = Math.min(1, Math.max(0, (scrollY - innerHeight * .50) / (innerHeight * .35)));
    bubbles.forEach(bubble => {
      const progress = (bubble.start + time * bubble.speed / height) % 1;
      const x = bubble.x * width + Math.sin(time * .42 + bubble.phase) * bubble.radius * .55 + drift.x * bubble.radius * .3;
      const y = height + bubble.radius * 2 - progress * (height + bubble.radius * 4) + drift.y * bubble.radius * .3;
      const fade = Math.min(1, progress * 8, (1 - progress) * 8) * pageFade;
      paint(ctx, x, y, bubble.radius, bubble.opacity * fade, time + bubble.phase);
      bubble.current = { x, y };
    });
    raf = requestAnimationFrame(tick);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; ctx.clearRect(0, 0, width, height); }
  function sync() { if (!allowed()) stop(); else if (!raf) raf = requestAnimationFrame(tick); }
  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    width = Math.round(innerWidth * ratio); height = Math.round(innerHeight * ratio);
    canvas.width = width; canvas.height = height;
    const small = innerWidth < 720, count = small ? 5 : 9;
    bubbles = Array.from({ length: count }, (_, i) => ({
      x: i % 2 ? .84 + (i % 3) * .046 : .04 + (i % 3) * .039,
      radius: (small ? 12 + (i * 7 % 15) : 24 + (i * 17 % 39)) * ratio,
      start: (i * .173 + .14) % 1, speed: (small ? 15 : 20) * (1 + i % 3 * .17) * ratio,
      opacity: small ? .38 : .46, phase: i * 1.92,
    }));
    sync();
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { entry.target.dataset.bubbleVisible = String(entry.isIntersecting); });
    visible = !!document.querySelector('.content-screen[data-bubble-visible="true"]');
    sync();
  });
  document.querySelectorAll(".content-screen").forEach(section => observer.observe(section));
  document.addEventListener("pointermove", event => {
    pointer = { x: (event.clientX / innerWidth - .5) * 2, y: (event.clientY / innerHeight - .5) * 2 };
  }, { passive: true });
  ["visibilitychange", "portfolio:change", "portfolio:navigate", "portfolio:panel"].forEach(name => document.addEventListener(name, sync));
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", sync, { passive: true });
  motion.addEventListener("change", sync);
  window.portfolioBubbles = { paint, stats: () => ({ running: !!raf, count: bubbles.length, frames, width, height, positions: bubbles.map(b => b.current) }) };
  resize();
})();
