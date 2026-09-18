(() => {
  "use strict";

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const video = document.querySelector(".bg-video");
  const toggle = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");
  const overlay = document.querySelector(".mobile-overlay");
  const hero = document.querySelector(".hero");
  const stats = document.querySelector(".stats");
  const dialog = document.querySelector(".detail-dialog");
  const dialogContent = document.querySelector("#dialog-content");
  const page = document.querySelector(".page");
  const headline = document.querySelector(".headline");
  let dialogTrigger;
  let layoutFrame;
  let firstScreenVisible = true;

  function setMenu(open, restoreFocus = false) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    mobileMenu.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    hero.inert = open;
    stats.inert = open;
    document.querySelector(".logo").inert = open;
    document.querySelector(".editor-launch").inert = open;
    document.querySelectorAll(".content-screen").forEach(node => { node.inert = open; });
    if (open) mobileMenu.querySelector("a").focus();
    else if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  overlay.addEventListener("click", () => setMenu(false, true));
  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) setMenu(false, true);
  });
  document.addEventListener("keydown", (event) => {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (event.key === "Escape") setMenu(false, true);
    if (event.key === "Tab") {
      const focusable = [toggle, ...mobileMenu.querySelectorAll("a, button")];
      const current = focusable.indexOf(document.activeElement);
      const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[next].focus();
    }
  });
  window.addEventListener("resize", () => {
    if (innerWidth > 720 && !mobileMenu.hidden) setMenu(false);
    queueLayout();
  });

  function queueLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(fitHeadline);
  }

  function fitHeadline() {
    headline.style.removeProperty("font-size");
    const style = getComputedStyle(headline);
    const size = parseFloat(style.fontSize) * Number(document.body.dataset.headlineScale || 1);
    const lines = [...headline.children];
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    const widest = Math.max(1, ...lines.map((line) => measure.measureText(line.textContent).width));
    headline.style.fontSize = `${Math.min(size, Math.floor(size * (headline.clientWidth - 4) / widest))}px`;
    lines.forEach(renderDots);
    page.classList.remove("content-overflow");
    if (document.querySelector(".hero-content").scrollHeight > hero.clientHeight) page.classList.add("content-overflow");
  }

  // Sample real glyphs so the dot-matrix treatment supports Chinese and Latin text.
  function renderDots(line) {
    line.querySelector("canvas")?.remove();
    line.classList.remove("dots-ready");
    if (document.body.dataset.titleStyle === "plain" || !line.textContent.trim()) return;
    const style = getComputedStyle(line);
    const width = Math.ceil(line.clientWidth);
    const height = Math.ceil(line.clientHeight);
    if (!width || !height) return;
    const source = document.createElement("canvas");
    source.width = width * 2;
    source.height = height * 2;
    const context = source.getContext("2d", { willReadFrequently: true });
    context.scale(2, 2);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(line.textContent, width / 2, height / 2);
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    const canvas = document.createElement("canvas");
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.setAttribute("aria-hidden", "true");
    const dots = canvas.getContext("2d");
    dots.scale(ratio, ratio);
    dots.fillStyle = "#fff";
    const density = { fine: 0.028, medium: 0.036, coarse: 0.045 }[document.body.dataset.dotDensity || "medium"];
    const step = Math.max(1.7, parseFloat(style.fontSize) * density);
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        const alpha = pixels[(Math.floor(y * 2) * source.width + Math.floor(x * 2)) * 4 + 3];
        if (alpha < 80) continue;
        dots.beginPath();
        dots.arc(x, y, step * 0.39, 0, Math.PI * 2);
        dots.fill();
      }
    }
    line.append(canvas);
    line.classList.add("dots-ready");
  }
  queueLayout();
  document.fonts.ready.then(queueLayout);
  new ResizeObserver(queueLayout).observe(page);
  document.addEventListener("portfolio:change", () => {
    queueLayout();
    updatePlayback();
  });
  document.addEventListener("portfolio:editor-open", () => setMenu(false));
  document.addEventListener("portfolio:navigate", () => { setMenu(false); dialogTrigger = null; });

  function updatePlayback() {
    if (!firstScreenVisible || motion.matches || document.hidden || document.body.dataset.backgroundMode === "image" || document.body.dataset.backgroundMotion === "false") video.pause();
    else video.play().catch(() => {
      // The poster remains visible when autoplay is denied.
    });
  }
  motion.addEventListener("change", () => {
    updatePlayback();
  });
  document.addEventListener("visibilitychange", updatePlayback);
  new IntersectionObserver(([entry]) => { firstScreenVisible = entry.isIntersecting; updatePlayback(); }).observe(page);
  updatePlayback();
  document.addEventListener("pointerdown", () => {
    updatePlayback();
  }, { once: true });

  function openPanel(name, trigger) {
    const template = document.getElementById(`panel-${name}`);
    if (!template) return;
    if (!dialog.open) dialogTrigger = trigger;
    dialogContent.replaceChildren(template.content.cloneNode(true));
    dialog.dataset.view = name;
    document.dispatchEvent(new CustomEvent("portfolio:panel", { detail: name }));
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(".dialog-close").focus();
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-panel]");
    if (!trigger) return;
    event.preventDefault();
    openPanel(trigger.dataset.panel, trigger);
  });
  document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.querySelectorAll("video").forEach((media) => media.pause());
    if (dialogTrigger?.closest(".mobile-menu")) toggle.focus({ preventScroll: true });
    else dialogTrigger?.focus({ preventScroll: true });
  });
  dialog.addEventListener("submit", (event) => {
    if (!event.target.matches(".project-form")) return;
    event.preventDefault();
    const data = new FormData(event.target);
    const brief = [
      `${document.title} · 合作意向书`,
      "",
      `称呼：${data.get("name").trim()}`,
      `联系邮箱：${data.get("email").trim()}`,
      "",
      "合作想法",
      data.get("project").trim(),
      "",
      "此意向书仅在本地生成，尚未发送给作品集作者。",
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", brief], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "合作意向书.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    event.target.querySelector(".form-note").textContent = "合作意向书已下载到你的设备，尚未发送给作品集作者。";
  });
})();
