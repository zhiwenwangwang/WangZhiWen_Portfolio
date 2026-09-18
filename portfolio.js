(() => {
  "use strict";
  const { groups, items } = window.portfolioCatalog;
  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const touch = matchMedia("(hover: none)");
  const viewer = $(".project-viewer");
  let getMedia = key => window.portfolioMedia?.[key] || null;
  let getTitle = item => item.title;
  let selected = null;
  let lastTrigger;
  const scenes = [];
  const coverVideos = new Map();
  function pauseVideo(video) {
    video.dataset.playRequested = "false";
    video.pause();
  }
  function playVideo(video) {
    if (!video.src && video.dataset.src) video.src = video.dataset.src;
    video.dataset.playRequested = "true";
    video.play().then(() => { if (video.dataset.playRequested !== "true") video.pause(); }).catch(() => {});
  }
  function syncCovers() {
    coverVideos.forEach((state, host) => {
      if (!host.isConnected) { pauseVideo(state.video); coverObserver.unobserve(host); coverVideos.delete(host); return; }
      const active = state.hover || state.focus || (touch.matches && state.mode === "cover");
      if (state.visible && active && !document.hidden && !motion.matches && !viewer.open && !document.body.matches(".editor-open, .auth-open")) playVideo(state.video);
      else pauseVideo(state.video);
    });
  }
  const coverObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { const state = coverVideos.get(entry.target); if (state) state.visible = entry.isIntersecting; });
    syncCovers();
  }, { threshold: 0.25 });
  function bindHover(host, video, mode) {
    const old = coverVideos.get(host);
    if (old) { pauseVideo(old.video); coverObserver.unobserve(host); }
    if (!video) {
      coverVideos.delete(host); coverObserver.unobserve(host);
      host.onpointerenter = host.onpointerleave = host.onfocusin = host.onfocusout = null;
      return;
    }
    const state = { video, mode, hover: false, focus: false, visible: false };
    coverVideos.set(host, state);
    host.onpointerenter = event => { if (event.pointerType !== "touch") { state.hover = true; syncCovers(); } };
    host.onpointerleave = () => { state.hover = false; syncCovers(); };
    host.onfocusin = () => { state.focus = true; syncCovers(); };
    host.onfocusout = () => { state.focus = false; syncCovers(); };
    coverObserver.observe(host);
  }
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const editMedia = id => document.dispatchEvent(new CustomEvent("portfolio:edit-media", { detail: id }));
  function visual(item, mode = "stage") {
    const media = getMedia(item.id);
    if (!media) return make("span", "project-number", item.number);
    const thumbnail = mode === "thumb";
    const video = media.kind === "video";
    const node = make(video ? "video" : "img");
    if (video) {
      if (mode === "viewer") node.src = media.url;
      else node.dataset.src = thumbnail ? media.preview || media.url : media.url;
      node.controls = mode === "viewer";
      node.muted = mode !== "viewer";
      node.loop = mode !== "viewer";
      node.playsInline = true;
      node.preload = "none";
      if (media.poster) node.poster = thumbnail ? media.thumb || media.poster : media.poster;
      node.setAttribute("aria-label", getTitle(item));
    } else {
      node.src = thumbnail ? media.thumb || media.url : media.url;
      node.alt = getTitle(item);
      node.loading = mode === "thumb" ? "lazy" : "eager";
    }
    return node;
  }
  function sceneFor(group, index) {
    const section = $("#archive-screen-template").content.firstElementChild.cloneNode(true);
    section.id = group.id;
    section.dataset.series = group.id;
    section.setAttribute("aria-label", group.title);
    $(".archive-stage", section).setAttribute("aria-label", group.title);
    $(".portfolio-eyebrow", section).textContent = `0${index + 1} / ${group.title}`;
    $(".series-footer-label", section).textContent = `0${index + 3} / 06 · ${group.title}`;
    $(".next-screen", section).href = `#${groups[index + 1]?.id || "about-profile"}`;
    $(`.series-nav a[href="#${group.id}"]`, section).setAttribute("aria-current", "page");
    $("#series-screens").append(section);
    const stage = $(".archive-stage", section), grid = $(".portfolio-grid", section);
    const rail = $(".archive-rail", section), art = $(".archive-art", section);
    const copy = $(".archive-copy", section), title = $(".archive-active-title", section);
    const list = items.filter(item => item.category === group.id);
    let active = list[0], activeLayer, inView = false, auto = false, timer, pointer, hover = false, mainHovered = false, manualPlay = null;
    const animations = new Set();
    const animate = (node, frames, options) => {
      const animation = node.animate(frames, options);
      animations.add(animation);
      animation.finished.finally(() => animations.delete(animation)).catch(() => {});
      return animation;
    };
    const stop = () => {
      animations.forEach(animation => animation.cancel());
      animations.clear();
      all(".archive-layer", art).forEach(layer => {
        if (layer !== activeLayer) { all("video", layer).forEach(pauseVideo); layer.remove(); }
      });
      all(".archive-outgoing-copy", art).forEach(node => node.remove());
      section.dataset.transitioning = "false";
    };
    function fitTitle() {
      title.style.removeProperty("font-size");
      const style = getComputedStyle(title), size = parseFloat(style.fontSize);
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      const width = context.measureText(title.textContent).width;
      if (width > title.clientWidth * 1.8) title.style.fontSize = `${Math.max(28, size * title.clientWidth * 1.8 / width)}px`;
      const available = $(".archive-strip", section).offsetTop - copy.offsetTop
        - $(".portfolio-eyebrow", section).offsetHeight - $(".archive-meta", section).offsetHeight - 36;
      let fitted = parseFloat(getComputedStyle(title).fontSize);
      while (title.offsetHeight > available && fitted > 12) {
        fitted -= 1;
        title.style.fontSize = `${fitted}px`;
      }
    }
    function sync() {
      const playing = inView && !document.hidden && !motion.matches && !viewer.open && !document.body.matches(".editor-open, .auth-open");
      const requested = manualPlay ?? (touch.matches || mainHovered);
      all("video", art).forEach(video => {
        if (playing && requested && video.closest(".archive-layer") === activeLayer) playVideo(video);
        else pauseVideo(video);
      });
      const toggle = $(".archive-video-toggle", section);
      toggle.setAttribute("aria-pressed", String(playing && requested));
      toggle.title = playing && requested ? "暂停当前视频" : "播放当前视频";
      toggle.setAttribute("aria-label", toggle.title);
      $("i", toggle).className = playing && requested ? "fa-solid fa-pause" : "fa-solid fa-play";
      clearTimeout(timer);
      if (auto && playing && !hover) timer = setTimeout(() => step(1), 4400);
    }
    function paint(transition = false) {
      stop();
      const old = activeLayer;
      if (old && transition && !motion.matches) {
        const ghost = copy.cloneNode(true);
        ghost.className = "archive-outgoing-copy";
        const a = old.getBoundingClientRect(), b = copy.getBoundingClientRect();
        Object.assign(ghost.style, { left: `${b.left - a.left}px`, top: `${b.top - a.top}px`, width: `${b.width}px` });
        old.append(ghost);
      }
      activeLayer = make("div", "archive-layer");
      activeLayer.dataset.project = active.id;
      const picture = make("div", "archive-picture");
      const mediaNode = visual(active);
      const currentId = active.id;
      const orientation = getMedia(active.id);
      if (orientation?.width) section.dataset.orientation = orientation.width >= orientation.height ? "landscape" : "portrait";
      picture.append(mediaNode);
      const updateOrientation = () => {
        const width = mediaNode.naturalWidth || mediaNode.videoWidth;
        const height = mediaNode.naturalHeight || mediaNode.videoHeight;
        if (activeLayer?.dataset.project === currentId && width && height) section.dataset.orientation = width >= height ? "landscape" : "portrait";
      };
      mediaNode.addEventListener("load", updateOrientation);
      mediaNode.addEventListener("loadedmetadata", updateOrientation);
      const poster = getMedia(active.id)?.poster;
      if (poster && mediaNode.tagName === "VIDEO") {
        const probe = new Image();
        probe.onload = () => { if (activeLayer?.dataset.project === currentId) section.dataset.orientation = probe.naturalWidth >= probe.naturalHeight ? "landscape" : "portrait"; };
        probe.src = poster;
      }
      activeLayer.append(picture);
      const foreground = getMedia(`${active.id}-foreground`);
      if (foreground) {
        const frame = make("div", "archive-foreground"), image = make("img");
        image.src = foreground.url; image.alt = "";
        frame.append(image); activeLayer.append(frame);
      }
      art.append(activeLayer);
      updateOrientation();
      const name = getTitle(active);
      const split = name === active.title ? ["交互流体", "泡泡墙", "Kinect", "空间展览", "演唱会"].map(word => name.indexOf(word)).find(index => index > 0) : -1;
      const letters = Array.from(name).flatMap((letter, index) => index === split ? [make("br", "archive-title-break"), make("span", "archive-title-char", letter)] : [make("span", "archive-title-char", letter)]);
      title.replaceChildren(...letters);
      title.setAttribute("aria-label", name);
      fitTitle();
      $(".archive-active-category", section).textContent = group.title;
      $(".archive-active-kind", section).textContent = getMedia(active.id)?.kind === "video" ? "动态影像" : "视觉作品";
      $(".archive-active-index", section).textContent = `${active.assetNumber} / ${String(active.assetTotal).padStart(2, "0")}`;
      $(".portfolio-count", section).textContent = `${active.number} / ${String(list.length).padStart(2, "0")}`;
      $(".archive-announcement", section).textContent = `${getTitle(active)}，${active.number} / ${list.length}`;
      section.dataset.active = active.id;
      const isVideo = getMedia(active.id)?.kind === "video";
      $(".archive-video-toggle", section).hidden = !isVideo;
      section.dataset.kind = isVideo ? "video" : "image";
      $(".archive-video-toggle", section).setAttribute("aria-pressed", String(manualPlay));
      all(".project-item", grid).forEach(article => {
        const chosen = article.dataset.project === active.id;
        article.classList.toggle("is-active", chosen);
        $(".project-open", article).setAttribute("aria-pressed", String(chosen));
      });
      if (old && transition && !motion.matches) {
        section.dataset.transitioning = "true";
        old.style.zIndex = "3";
        activeLayer.style.zIndex = "1";
        // In the recording the title rises through the image, not a fixed mask.
        animate(old, [
          { transform: "translateY(0) scale(1)", opacity: 1 },
          { transform: "translateY(16%) scale(1.14)", opacity: 1, offset: 0.4 },
          { transform: "translateY(105%) scale(1.65)", opacity: 0 },
        ], { duration: 600, easing: "cubic-bezier(.55,.02,.78,.42)", fill: "forwards" }).finished.then(() => {
          all("video", old).forEach(pauseVideo); old.remove();
        }).catch(() => {});
        const arriving = animate(activeLayer, [
          { transform: "translateY(-5%) scale(.79)", opacity: 1 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ], { duration: 1000, easing: "cubic-bezier(.16,.8,.18,1)", fill: "both" });
        animate(copy, [
          { transform: `translateY(${stage.clientHeight * 0.25}px)`, opacity: 0 },
          { opacity: 1, offset: 0.16 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: 1150, delay: 240, easing: "cubic-bezier(.18,.65,.24,1)", fill: "both" });
        const letters = all(".archive-title-char", title);
        letters.forEach((letter, i) => animate(letter, [
          { transform: "translateY(.6em)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: 850, delay: 220 + Math.min(420, (letters.length - i - 1) * 25), easing: "cubic-bezier(.18,.65,.24,1)", fill: "both" }));
        arriving.finished.then(() => { section.dataset.transitioning = "false"; }).catch(() => {});
      } else if (old) {
        all("video", old).forEach(pauseVideo); old.remove();
      }
      sync();
    }
    function select(id) {
      if (active.id === id) return;
      active = list.find(item => item.id === id);
      manualPlay = null;
      paint(true);
      const article = $(`[data-project="${id}"]`, grid);
      const left = article.offsetLeft;
      if (left < rail.scrollLeft || left + article.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollTo({ left: Math.max(0, left - rail.clientWidth / 2 + article.offsetWidth / 2), behavior: motion.matches ? "instant" : "smooth" });
    }
    function step(direction) { select(list[(list.indexOf(active) + direction + list.length) % list.length].id); }
    list.forEach(item => {
      const article = make("article", "project-item");
      article.dataset.project = item.id; article.dataset.category = item.category;
      const frame = make("div", "project-media"), button = make("button", "project-open");
      button.type = "button"; button.addEventListener("click", () => select(item.id));
      const upload = make("button", "project-upload");
      upload.type = "button"; upload.title = `替换${item.title}素材`; upload.setAttribute("aria-label", upload.title);
      upload.append(make("i", "fa-solid fa-plus")); upload.addEventListener("click", () => editMedia(item.id));
      const caption = make("h3", "project-caption", item.title); caption.dataset.archiveTitle = item.id;
      frame.append(button, upload); article.append(frame, caption); grid.append(article);
    });
    function refresh() {
      list.forEach(item => {
        const article = $(`[data-project="${item.id}"]`, grid), button = $(".project-open", article);
        const media = visual(item, "thumb");
        button.replaceChildren(media, make("span", "project-number", item.number));
        if (getMedia(item.id)?.kind === "video") button.append(make("i", "fa-solid fa-play project-video-mark"));
        bindHover(button, media.tagName === "VIDEO" ? media : null, "thumb");
        button.setAttribute("aria-label", `展示${getTitle(item)}`);
        button.title = `${getTitle(item)} / ${item.assetNumber}`;
        $(".project-caption", article).textContent = getTitle(item);
      });
      paint();
    }
    $(".archive-next", section).addEventListener("click", () => step(1));
    $(".archive-prev", section).addEventListener("click", () => step(-1));
    $(".archive-upload", section).addEventListener("click", () => editMedia(active.id));
    $(".archive-expand", section).addEventListener("click", event => openViewer(active, event.currentTarget));
    $(".archive-video-toggle", section).addEventListener("click", event => {
      manualPlay = !(manualPlay ?? !activeLayer.querySelector("video")?.paused);
      event.currentTarget.setAttribute("aria-pressed", String(manualPlay));
      $("i", event.currentTarget).className = manualPlay ? "fa-solid fa-pause" : "fa-solid fa-play";
      sync();
    });
    $(".archive-play", section).addEventListener("click", event => {
      auto = !auto;
      const button = event.currentTarget;
      button.setAttribute("aria-pressed", String(auto));
      button.title = auto ? "暂停自动切换" : "自动切换作品";
      button.setAttribute("aria-label", button.title);
      $("i", button).className = auto ? "fa-solid fa-pause" : "fa-solid fa-play";
      sync();
    });
    stage.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1);
      $(`[data-project="${active.id}"] .project-open`, grid).focus({ preventScroll: true });
    });
    stage.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" || event.target.closest("button, .archive-strip")) return;
      pointer = { x: event.clientX, y: event.clientY };
    });
    stage.addEventListener("pointerup", event => {
      if (!pointer) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
      pointer = null;
    });
    stage.addEventListener("pointercancel", () => { pointer = null; });
    stage.addEventListener("mouseenter", () => { hover = true; sync(); });
    stage.addEventListener("pointermove", event => {
      if (event.pointerType === "touch" || !activeLayer) return;
      const rect = activeLayer.getBoundingClientRect();
      const value = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom && !event.target.closest(".archive-strip");
      if (value !== mainHovered) { mainHovered = value; sync(); }
    });
    stage.addEventListener("mouseleave", () => { hover = false; mainHovered = false; sync(); });
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.3; sync();
    }, { threshold: [0, 0.3, 0.6] }).observe(section);
    new ResizeObserver(fitTitle).observe(stage);
    motion.addEventListener("change", () => { stop(); sync(); });
    return { refresh, sync };
  }
  groups.forEach((group, index) => scenes.push(sceneFor(group, index)));
  groups.forEach(group => {
    const count = $(`.directory-link[href="#${group.id}"] .directory-label > span`);
    if (count) count.textContent = `${String(group.projects.length).padStart(2, "0")} PROJECTS / ${String(group.files.length).padStart(2, "0")} MEDIA`;
  });
  function refreshCovers() {
    all("[data-cover]").forEach(host => {
      const media = getMedia(host.dataset.cover);
      const owner = host.closest(".directory-link") || host;
      all("video", host).forEach(v => v.pause());
      host.replaceChildren();
      if (!media) { bindHover(owner, null); return; }
      const isVideo = media.kind === "video";
      const image = make(isVideo ? "video" : "img");
      if (isVideo) {
        image.dataset.src = media.preview || media.url;
        if (media.poster) image.poster = media.poster;
        image.muted = true; image.playsInline = true; image.loop = true; image.preload = "none";
      } else { image.src = media.url; image.alt = ""; image.loading = "lazy"; }
      host.append(image);
      if (isVideo) host.append(make("i", "fa-solid fa-play cover-video-mark"));
      bindHover(owner, isVideo ? image : null, "cover");
    });
  }
  function refresh() { scenes.forEach(scene => scene.refresh()); refreshCovers(); if (viewer.open) paintViewer(); }
  function paintViewer() {
    all("video", viewer).forEach(v => v.pause());
    $("#project-viewer-title").textContent = getTitle(selected);
    $(".viewer-category", viewer).textContent = selected.categoryTitle;
    $(".viewer-media", viewer).replaceChildren(visual(selected, "viewer"));
    $(".viewer-position", viewer).textContent = `${selected.number} / ${String(items.filter(item => item.category === selected.category).length).padStart(2, "0")}`;
  }
  function openViewer(item, trigger) {
    selected = item; lastTrigger = trigger; paintViewer(); viewer.showModal();
    scenes.forEach(scene => scene.sync()); syncCovers(); $(".viewer-close", viewer).focus();
  }
  function stepViewer(direction) {
    const list = items.filter(item => item.category === selected.category);
    selected = list[(list.indexOf(selected) + direction + list.length) % list.length]; paintViewer();
  }
  $(".viewer-prev", viewer).addEventListener("click", () => stepViewer(-1));
  $(".viewer-next", viewer).addEventListener("click", () => stepViewer(1));
  $(".viewer-close", viewer).addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", event => {
    const rect = viewer.getBoundingClientRect();
    if (event.target === viewer && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) viewer.close();
  });
  viewer.addEventListener("keydown", event => {
    if (event.target.matches("video")) return;
    if (event.key === "ArrowLeft") stepViewer(-1);
    if (event.key === "ArrowRight") stepViewer(1);
  });
  viewer.addEventListener("close", () => { all("video", viewer).forEach(v => v.pause()); lastTrigger?.focus({ preventScroll: true }); scenes.forEach(scene => scene.sync()); syncCovers(); });
  all("[data-media-edit]").forEach(button => button.addEventListener("click", () => editMedia(button.dataset.mediaEdit)));
  document.addEventListener("click", event => {
    const trigger = event.target.closest('[data-panel="works"], [data-panel="about"], a[href^="#"]');
    if (!trigger || trigger.matches('[data-panel="practice"]')) return;
    const hash = trigger.dataset.panel === "works" ? "#works" : trigger.dataset.panel === "about" ? "#about-profile" : trigger.getAttribute("href");
    const target = hash === "#home" ? $(".page") : document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    $(".detail-dialog").close();
    document.dispatchEvent(new Event("portfolio:navigate"));
    target.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
    target.tabIndex = -1; target.focus({ preventScroll: true });
  }, true);
  ["visibilitychange", "portfolio:change"].forEach(name => document.addEventListener(name, () => { scenes.forEach(scene => scene.sync()); syncCovers(); }));
  motion.addEventListener("change", syncCovers);
  window.portfolioArchive = { groups, items, connect(media, title) { getMedia = media; getTitle = title; refresh(); }, refresh };
  refresh();
})();
