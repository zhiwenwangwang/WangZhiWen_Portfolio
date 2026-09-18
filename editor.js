(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const editor = $(".site-editor");
  const status = $("#editor-status");
  const fields = [];
  const groups = new Map();
  const urls = new Map();
  const templates = all('template[id^="panel-"]');
  const archive = window.portfolioArchive;
  const seriesCover = category => window.portfolioMedia[archive.items.find(item => item.category === category && item.kind === "video").id];
  const mediaSlots = [
    ["background", "首页背景", "image/*,video/*"],
    ["revealBackground", "首页拖尾底层（可选）", "image/*,video/*"],
    ["logo", "导航标记", "image/*"],
    ["portrait", "个人头像", "image/*"],
    ["about-cover", "个人介绍封面", "image/*,video/*"],
    ["about-resonance", "繁花共振 · 介绍配图", "image/*,video/*"],
    ["about-rebirth", "碎花与重生 · 介绍配图", "image/*,video/*"],
    ["avatar1", "标语图标一", "image/*"],
    ["avatar2", "标语图标二", "image/*"],
    ["avatar3", "标语图标三", "image/*"],
    ["work1", "交互系列封面", "image/*,video/*"],
    ["work2", "舞台系列封面", "image/*,video/*"],
    ["work3", "异形系列封面", "image/*,video/*"],
    ...archive.items.flatMap((item) => [
      [item.id, item.title, "image/*,video/*"],
      [`${item.id}-foreground`, `${item.title} · 前景透明图`, "image/png,image/webp"],
    ]),
  ];
  const defaultMedia = {
    background: { kind: "video", url: "assets/background-clear.mp4", name: "TDMovieOut · 原分辨率清晰版" },
    revealBackground: null,
    logo: { kind: "image", url: "assets/logo.webp", name: "默认标记" },
    portrait: { kind: "image", url: "assets/portfolio/about-image1.webp", name: "王治文头像" },
    "about-cover": { kind: "image", url: "assets/portfolio/about-image1.webp", name: "王治文头像" },
    "about-resonance": { kind: "image", url: "assets/portfolio/about-image3.webp", name: "繁花共振" },
    "about-rebirth": { kind: "image", url: "assets/portfolio/about-image4.webp", name: "碎花与重生" },
    avatar1: null, avatar2: null, avatar3: null,
    work1: { ...seriesCover("interaction"), name: "交互系列封面" },
    work2: { ...seriesCover("stage"), name: "舞台系列封面" },
    work3: { ...window.portfolioMedia[archive.items.filter(item => item.category === "experimental")[3].id], name: "异形系列封面" },
    ...Object.fromEntries(archive.items.flatMap((item) => [[item.id, window.portfolioMedia[item.id] || null], [`${item.id}-foreground`, null]])),
  };
  const defaultStyle = { titleStyle: "dots", scale: 100, density: "medium", shade: 48, position: 50, fit: "cover", motion: true, reveal: true, brush: 72, brightness: 140, life: 1240, trailBubbles: true, ambientBubbles: true };
  const defaultIcons = all(".avatar > span").map((el) => el.cloneNode(true));
  let state;
  let saved;
  let dirty = false;
  let busy = false;
  let revision = 0;
  let db;
  let appliedBackground = null;
  let ready = false;
  let unlocked = false;
  let pendingMedia = null;
  const auth = $(".editor-auth");
  const password = $("#editor-password");
  const authError = $("#auth-error");

  function textOf(node) {
    return [...node.childNodes].map((child) => child.nodeName === "BR" ? "\n" : child.textContent).join("").trim();
  }
  function register(key, label, group, nodes, max = 60, multiline = false, attribute = null) {
    const value = attribute ? nodes[0].getAttribute(attribute) : textOf(nodes[0]);
    const field = { key, label, group, nodes, max, multiline, attribute, value };
    fields.push(field);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(field);
    if (!attribute) nodes.forEach((node) => node.dataset.editKey = key);
  }
  register("pageTitle", "浏览器标题", "首页文案", [$("title")], 60);
  register("description", "页面简介", "首页文案", [$('meta[name="description"]')], 240, true, "content");
  register("title1", "主标题 · 第一行", "首页文案", [$(".headline span:first-child")], 24);
  register("title2", "主标题 · 第二行", "首页文案", [$(".headline span:last-child")], 24);
  register("tagline", "顶部标语", "首页文案", [$(".trust-pill")], 60);
  register("subtitle", "副标题", "首页文案", [$(".subhead")], 240, true);
  register("cta", "主要按钮", "首页文案", [$(".cta")], 16);
  all(".nav-link").forEach((node, i) => register(`nav${i}`, `导航 ${i + 1}`, "导航与底部", [node, all(".mobile-link")[i]], 12));
  register("contactButton", "合作按钮", "导航与底部", all(".sign-in"), 12);
  all(".stat").forEach((node, i) => {
    register(`stat${i}title`, `领域 ${i + 1} · 名称`, "导航与底部", [$(".stat-value", node)], 20);
    register(`stat${i}label`, `领域 ${i + 1} · 说明`, "导航与底部", [$(".stat-label", node)], 40);
  });
  register("archiveHeading", "第二屏标题", "第二屏文案", [$("#portfolio-title")], 60, true);
  register("archiveIntro", "第二屏简介", "第二屏文案", [$(".portfolio-description")], 240, true);
  register("archiveEnding", "第二屏结语", "第二屏文案", [$(".portfolio-ending")], 120);
  all("[data-copy]").forEach(node => register(node.dataset.copy, node.textContent.slice(0, 20), node.dataset.copy.startsWith("directory-") ? "第二屏文案" : "个人介绍屏", [node], node.matches("h2, h3, dt, span") ? 60 : 500, true));
  archive.items.forEach((item) => register(`title-${item.id}`, item.title, `作品名称 · ${item.categoryTitle}`, [$(`[data-archive-title="${item.id}"]`)], 60));
  const panelNames = { works: "作品弹窗", practice: "方向弹窗", about: "个人介绍", contact: "合作弹窗", resonance: "繁花共振介绍", rebirth: "碎花与重生介绍" };
  templates.forEach((template) => {
    const name = template.id.replace("panel-", "");
    all(".eyebrow, h2, .dialog-intro, dt, dd, .dialog-primary", template.content).forEach((node, i) => {
      const prefix = { H2: "标题", DT: "系列名称", DD: "系列描述", BUTTON: "按钮" }[node.tagName] || "文案";
      register(`${name}-${i}`, `${prefix} · ${i + 1}`, panelNames[name], [node], node.matches("h2, dt, button") ? 40 : 400, node.matches("p, dd"));
    });
    all(".project-form label", template.content).forEach((label, i) => {
      const span = document.createElement("span");
      span.textContent = label.firstChild.textContent;
      label.firstChild.replaceWith(span);
      register(`formLabel${i}`, `表单字段 ${i + 1}`, panelNames[name], [span], 20);
    });
    const textarea = $("textarea", template.content);
    if (textarea) register("formPlaceholder", "合作想法占位文案", panelNames[name], [textarea], 120, false, "placeholder");
  });
  const defaults = Object.fromEntries(fields.map((field) => [field.key, field.value]));
  const blank = () => ({ version: 1, text: { ...defaults }, media: {}, style: { ...defaultStyle } });
  state = blank();
  saved = structuredClone(state);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function iconButton(icon, label) {
    const button = element("button", "icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const symbol = element("i", `fa-solid ${icon}`);
    symbol.setAttribute("aria-hidden", "true");
    button.append(symbol);
    return button;
  }
  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function updateButtons() {
    $("#save-config").disabled = !unlocked || !ready || busy || !dirty;
    $("#revert-config").disabled = !unlocked || !ready || busy || !dirty;
    all("#export-config, #import-config, #reset-config, .editor-lock, .media-slot input, .media-slot button").forEach((node) => node.disabled = !unlocked || busy || !ready);
  }
  function changed() {
    dirty = true;
    revision++;
    report("未保存的更改");
    updateButtons();
    document.dispatchEvent(new Event("portfolio:change"));
  }
  function setText(field) {
    const value = state.text[field.key];
    const targets = new Set([...field.nodes, ...all(`[data-edit-key="${field.key}"]`)]);
    if (field.attribute) {
      field.nodes.forEach((node) => node.setAttribute(field.attribute, value));
      if (field.key === "formPlaceholder") all(".detail-dialog textarea").forEach((node) => node.placeholder = value);
    } else {
      targets.forEach((node) => {
        const icons = all(":scope > i", node).map((icon) => icon.cloneNode(true));
        node.textContent = value;
        icons.forEach((icon) => node.append(" ", icon));
      });
    }
  }
  function buildTextEditor() {
    groups.forEach((items, name) => {
      const section = element("details", "editor-section");
      section.open = name === "首页文案";
      section.append(element("summary", null, name));
      items.forEach((field) => {
        const label = element("label", "editor-field", field.label);
        const input = element(field.multiline ? "textarea" : "input");
        input.id = `edit-${field.key}`;
        input.maxLength = field.max;
        if (!field.multiline) input.type = "text";
        else input.rows = 3;
        input.value = state.text[field.key];
        input.addEventListener("input", () => {
          state.text[field.key] = input.value;
          setText(field);
          if (field.group === "作品弹窗") renderPanelMedia();
          if (field.key.startsWith("title-archive-")) archive.refresh();
          changed();
        });
        label.append(input);
        section.append(label);
      });
      $("#editor-text").append(section);
    });
  }
  const mediaSource = (key) => Object.hasOwn(state.media, key) ? state.media[key] : defaultMedia[key];
  function mediaURL(key) {
    const media = mediaSource(key);
    if (!media) return "";
    if (!media.blob) return media.url;
    if (urls.get(key)?.blob !== media.blob) {
      if (urls.has(key)) URL.revokeObjectURL(urls.get(key).url);
      urls.set(key, { blob: media.blob, url: URL.createObjectURL(media.blob) });
    }
    return urls.get(key).url;
  }
  function applyMedia() {
    const background = mediaSource("background");
    const source = mediaURL("background");
    const video = $(".bg-video");
    const image = $(".bg-image");
    document.body.dataset.backgroundMode = background?.kind || "image";
    if (appliedBackground !== source) {
      if (background?.kind === "video") {
        video.src = source;
        video.load();
      } else if (source) image.src = source;
      appliedBackground = source;
    }
    video.hidden = background?.kind !== "video";
    image.hidden = background?.kind !== "image";
    const reveal = mediaSource("revealBackground");
    window.heroReveal.setMedia(reveal ? { ...reveal, url: mediaURL("revealBackground") } : null);
    $(".logo img").src = mediaURL("logo") || defaultMedia.logo.url;
    all(".archive-home img").forEach(img => { img.src = $(".logo img").src; });
    $('link[rel="icon"]').href = $(".logo img").src;
    all(".avatar").forEach((avatar, i) => {
      const url = mediaURL(`avatar${i + 1}`);
      const inner = defaultIcons[i].cloneNode(true);
      if (url) {
        const img = element("img");
        img.alt = "";
        img.src = url;
        inner.replaceChildren(img);
      }
      avatar.replaceChildren(inner);
    });
    renderPanelMedia();
    archive.connect(
      (key) => {
        const media = mediaSource(key);
        return media ? { ...media, url: mediaURL(key) } : null;
      },
      (item) => state.text[`title-${item.id}`] || item.title,
    );
  }
  function renderPanelMedia() {
    all(".detail-dialog .story-media").forEach(host => {
      const media = mediaSource(host.dataset.mediaKey);
      all("video", host).forEach(video => video.pause());
      host.replaceChildren();
      if (!media) return;
      const node = element(media.kind === "video" ? "video" : "img");
      node.src = mediaURL(host.dataset.mediaKey);
      if (media.kind === "video") { node.controls = true; node.playsInline = true; node.preload = "metadata"; }
      else node.alt = media.name;
      host.append(node);
    });
    const gallery = $(".detail-dialog .work-gallery");
    if (gallery) {
      gallery.replaceChildren();
      ["work1", "work2", "work3"].forEach((key, i) => {
        const media = mediaSource(key);
        if (!media) return;
        const figure = element("figure");
        const visual = element(media.kind === "video" ? "video" : "img");
        visual.src = mediaURL(key);
        const caption = state.text[`works-${3 + i * 2}`] || media.name;
        if (media.kind === "video") {
          visual.controls = true;
          visual.playsInline = true;
          visual.preload = "metadata";
          visual.setAttribute("aria-label", caption);
        } else {
          visual.alt = caption;
          visual.loading = "lazy";
        }
        figure.append(visual, element("figcaption", null, caption));
        gallery.append(figure);
      });
    }
    const portrait = $(".detail-dialog .about-portrait");
    if (portrait) {
      portrait.hidden = !mediaSource("portrait");
      if (!portrait.hidden) portrait.src = mediaURL("portrait");
    }
  }
  function buildMediaEditor() {
    const section = element("div", "editor-section");
    section.append(element("h3", null, "图片与视频"));
    const categories = new Map();
    archive.groups.forEach((group) => {
      const details = element("details", "media-category");
      details.dataset.mediaGroup = group.id;
      details.append(element("summary", null, `${group.title} · ${group.files.length} 份`));
      categories.set(group.id, details);
    });
    mediaSlots.forEach(([key, label, accept]) => {
      const slot = element("div", "media-slot");
      slot.dataset.slot = key;
      slot.append(element("h4", null, label));
      const archiveItem = archive.items.find((item) => item.id === key || `${item.id}-foreground` === key);
      if (archiveItem) slot.append(element("p", "media-source-path", archiveItem.source));
      const preview = element("div", "media-preview-host");
      const input = element("input");
      input.type = "file";
      input.accept = accept;
      input.id = `media-${key}`;
      input.setAttribute("aria-label", label);
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        busy = true;
        updateButtons();
        report("正在检查媒体…");
        try {
          const media = await validateFile(file, accept.includes("video"));
          state.media[key] = media;
          applyMedia();
          renderMediaPreviews();
          changed();
        } catch (error) {
          report(error.message, true);
        } finally {
          busy = false;
          input.value = "";
          updateButtons();
        }
      });
      const actions = element("div", "editor-actions");
      const filename = element("span", "media-name");
      const reset = iconButton("fa-rotate-left", `还原${label}`);
      reset.addEventListener("click", () => {
        delete state.media[key];
        applyMedia();
        renderMediaPreviews();
        changed();
      });
      actions.append(filename, reset);
      if (!["background", "logo"].includes(key)) {
        const remove = iconButton("fa-trash-can", `移除${label}`);
        remove.addEventListener("click", () => {
          state.media[key] = null;
          applyMedia();
          renderMediaPreviews();
          changed();
        });
        actions.append(remove);
      }
      slot.append(preview, input, actions);
      (archiveItem ? categories.get(archiveItem.category) : section).append(slot);
    });
    $("#editor-media").append(section, ...categories.values());
  }
  function renderMediaPreviews() {
    mediaSlots.forEach(([key]) => {
      const slot = $(`[data-slot="${key}"]`);
      const host = $(".media-preview-host", slot);
      const media = mediaSource(key);
      host.replaceChildren();
      $(".media-name", slot).textContent = media?.name || "未设置";
      if (!media) return;
      const preview = element(media.kind === "video" && !media.poster ? "video" : "img", "media-preview");
      preview.src = media.thumb || media.poster || mediaURL(key);
      if (preview.tagName === "VIDEO") {
        preview.muted = true;
        preview.preload = "metadata";
        preview.playsInline = true;
      } else { preview.alt = ""; preview.loading = "lazy"; }
      host.append(preview);
    });
  }
  async function validateFile(file, allowVideo) {
    if (file.size > 512 * 1024 * 1024) throw new Error("文件超过 512 MB，请压缩后再选择。");
    const videoType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    const imageType = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name);
    if ((!videoType && !imageType) || (videoType && !allowVideo)) throw new Error("请选择支持的图片或视频文件。");
    const kind = videoType ? "video" : "image";
    const url = URL.createObjectURL(file);
    const probe = document.createElement(kind === "video" ? "video" : "img");
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("媒体读取超时，请尝试更小的文件。")), 15000);
        const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
        probe[kind === "video" ? "onloadeddata" : "onload"] = () => finish();
        probe.onerror = () => finish(new Error(kind === "video" ? "浏览器无法播放此编码，请先转为 H.264 MP4 或 WebM。原文件未修改。" : "图片无法读取，请更换文件。"));
        if (kind === "video") { probe.muted = true; probe.preload = "auto"; }
        probe.src = url;
      });
    } finally {
      if (kind === "video") { probe.pause(); probe.removeAttribute("src"); probe.load(); }
      URL.revokeObjectURL(url);
    }
    return { kind, name: file.name, blob: file };
  }
  function applyStyle() {
    const style = state.style;
    document.body.dataset.titleStyle = style.titleStyle;
    document.body.dataset.headlineScale = style.scale / 100;
    document.body.dataset.dotDensity = style.density;
    document.body.dataset.backgroundMotion = String(style.motion);
    document.body.dataset.backgroundReveal = String(style.reveal);
    document.body.dataset.trailBrush = style.brush;
    document.body.dataset.trailBrightness = style.brightness;
    document.body.dataset.trailLife = style.life;
    document.body.dataset.trailBubbles = String(style.trailBubbles);
    document.body.dataset.ambientBubbles = String(style.ambientBubbles);
    const root = document.documentElement.style;
    root.setProperty("--background-shade", style.shade / 100);
    root.setProperty("--background-position", `${style.position}%`);
    root.setProperty("--background-fit", style.fit);
    all("[data-title-style]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.titleStyle === style.titleStyle)));
    $("#headline-scale").value = style.scale;
    $("#scale-value").textContent = `${style.scale}%`;
    $("#dot-density").value = style.density;
    $("#background-shade").value = style.shade;
    $("#shade-value").textContent = `${style.shade}%`;
    $("#background-position").value = style.position;
    $("#position-value").textContent = `${style.position}%`;
    $("#background-fit").value = style.fit;
    $("#background-motion").checked = style.motion;
    $("#background-reveal").checked = style.reveal;
    $("#trail-brush").value = style.brush;
    $("#brush-value").textContent = style.brush;
    $("#trail-brightness").value = style.brightness;
    $("#brightness-value").textContent = `${style.brightness}%`;
    $("#trail-life").value = style.life;
    $("#life-value").textContent = `${(style.life / 1000).toFixed(2)}s`;
    $("#trail-bubbles").checked = style.trailBubbles;
    $("#ambient-bubbles").checked = style.ambientBubbles;
  }
  function applyAll() {
    fields.forEach((field) => {
      setText(field);
      $(`#edit-${field.key}`).value = state.text[field.key];
    });
    applyStyle();
    applyMedia();
    renderMediaPreviews();
    document.dispatchEvent(new Event("portfolio:change"));
  }
  const styleInputs = { "headline-scale": "scale", "dot-density": "density", "background-shade": "shade", "background-position": "position", "background-fit": "fit", "background-motion": "motion", "background-reveal": "reveal", "trail-brush": "brush", "trail-brightness": "brightness", "trail-life": "life", "trail-bubbles": "trailBubbles", "ambient-bubbles": "ambientBubbles" };
  Object.entries(styleInputs).forEach(([id, key]) => {
    $(`#${id}`).addEventListener("input", (event) => {
      const input = event.target;
      state.style[key] = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
      applyStyle();
      changed();
    });
  });
  all("[data-title-style]").forEach((button) => button.addEventListener("click", () => {
    state.style.titleStyle = button.dataset.titleStyle;
    applyStyle();
    changed();
  }));
  function setTab(name) {
    all("[data-tab]").forEach((tab) => {
      const selected = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(`#editor-${tab.dataset.tab}`).hidden = !selected;
    });
  }
  all("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      const tabs = all("[data-tab]");
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[index].dataset.tab);
      tabs[index].focus();
    });
  });
  function setEditor(open) {
    if (open && !unlocked) {
      if (!auth.open) {
        document.dispatchEvent(new Event("portfolio:editor-open"));
        document.body.classList.add("auth-open");
        auth.showModal();
        password.focus();
        document.dispatchEvent(new Event("portfolio:change"));
      }
      return;
    }
    if (open) document.dispatchEvent(new Event("portfolio:editor-open"));
    editor.hidden = !open;
    document.body.classList.toggle("editor-open", open);
    $(".editor-launch").setAttribute("aria-expanded", String(open));
    $(".page").inert = open && innerWidth <= 720;
    all(".content-screen").forEach(node => { node.inert = open && innerWidth <= 720; });
    if (open) $(".editor-close").focus();
    else $(".editor-launch").focus();
    document.dispatchEvent(new Event("portfolio:change"));
  }
  $(".editor-launch").addEventListener("click", () => setEditor(true));
  $(".editor-close").addEventListener("click", () => setEditor(false));
  function openMedia(key) {
    setEditor(true);
    if (!unlocked) { pendingMedia = key; return; }
    setTab("media");
    const slot = all("[data-slot]").find(node => node.dataset.slot === key);
    if (!slot) return;
    const category = slot.closest("details");
    if (category) category.open = true;
    slot.scrollIntoView({ block: "center", behavior: "instant" });
    $("input", slot).focus({ preventScroll: true });
  }
  document.addEventListener("portfolio:edit-media", event => openMedia(event.detail));
  // This is a local UI gate, not server-side authorization.
  $("#editor-auth-form").addEventListener("submit", event => {
    event.preventDefault();
    if (password.value !== "356557") {
      authError.textContent = "密码不正确，请重试。";
      password.setAttribute("aria-invalid", "true");
      password.focus(); password.select();
      return;
    }
    unlocked = true;
    document.body.dataset.editorUnlocked = "true";
    editor.inert = !ready;
    const key = pendingMedia;
    pendingMedia = null;
    password.value = "";
    auth.close();
    updateButtons();
    if (key) openMedia(key);
    else setEditor(true);
  });
  $(".auth-close").addEventListener("click", () => auth.close());
  auth.addEventListener("close", () => {
    password.value = ""; password.type = "password";
    password.removeAttribute("aria-invalid");
    authError.textContent = ""; pendingMedia = null;
    $(".auth-visibility").setAttribute("aria-pressed", "false");
    $(".auth-visibility").setAttribute("aria-label", "显示密码");
    $(".auth-visibility").title = "显示密码";
    $(".auth-visibility i").className = "fa-solid fa-eye";
    document.body.classList.remove("auth-open");
    document.dispatchEvent(new Event("portfolio:change"));
    if (!unlocked) $(".editor-launch").focus();
  });
  password.addEventListener("input", () => {
    password.removeAttribute("aria-invalid"); authError.textContent = "";
  });
  $(".auth-visibility").addEventListener("click", event => {
    const show = password.type === "password", button = event.currentTarget;
    password.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));
    button.title = show ? "隐藏密码" : "显示密码";
    button.setAttribute("aria-label", button.title);
    $("i", button).className = `fa-solid ${show ? "fa-eye-slash" : "fa-eye"}`;
    password.focus();
  });
  $(".editor-lock").addEventListener("click", () => {
    if (busy || !unlocked) return;
    if (dirty && !confirm("锁定后将撤销未保存的更改，是否继续？")) return;
    if (dirty) {
      state = structuredClone(saved); applyAll(); dirty = false; revision++;
    }
    unlocked = false;
    delete document.body.dataset.editorUnlocked;
    editor.inert = true;
    setEditor(false); updateButtons();
  });
  [editor, $(".confirm-dialog")].forEach(surface => {
    ["click", "input", "change", "submit"].forEach(type => surface.addEventListener(type, event => {
      if (!unlocked) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true));
  });
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); setEditor(false); }
    if (event.key === "Tab" && innerWidth <= 720) {
      const focusable = all("button:not(:disabled), input:not(:disabled), textarea, select, summary", editor).filter((node) => node.getClientRects().length && node.tabIndex >= 0);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  window.addEventListener("resize", () => {
    if (!editor.hidden) {
      $(".page").inert = innerWidth <= 720;
      all(".content-screen").forEach(node => { node.inert = innerWidth <= 720; });
    }
  });
  document.addEventListener("portfolio:panel", renderPanelMedia);
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("wang-zhiwen-portfolio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("settings");
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("请关闭其他正在编辑的页面后重试。"));
      request.onsuccess = () => resolve(request.result);
    });
  }
  function store(mode, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("settings", mode);
      const request = mode === "readonly" ? tx.objectStore("settings").get("portfolio") : tx.objectStore("settings").put(value, "portfolio");
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function normalize(input) {
    if (!input || input.version !== 1) throw new Error("备份格式不受支持。");
    const result = blank();
    fields.forEach((field) => {
      if (typeof input.text?.[field.key] === "string") result.text[field.key] = input.text[field.key].slice(0, field.max);
    });
    // Retain former slot edits in backups without applying them to unrelated new files.
    Object.entries(input.text || {}).forEach(([key, value]) => {
      if (/^title-archive-[a-z0-9-]{1,120}$/.test(key) && !Object.hasOwn(result.text, key) && typeof value === "string") result.text[key] = value.slice(0, 500);
    });
    const style = input.style || {};
    for (const [key, options] of Object.entries({ titleStyle: ["dots", "plain"], density: ["fine", "medium", "coarse"], fit: ["cover", "contain"] })) {
      if (options.includes(style[key])) result.style[key] = style[key];
    }
    for (const [key, min, max] of [["scale", 70, 130], ["shade", 0, 85], ["position", 0, 100], ["brush", 28, 120], ["brightness", 70, 190], ["life", 400, 2000]]) {
      if (Number.isFinite(style[key])) result.style[key] = Math.min(max, Math.max(min, style[key]));
    }
    if (typeof style.motion === "boolean") result.style.motion = style.motion;
    if (typeof style.reveal === "boolean") result.style.reveal = style.reveal;
    for (const key of ["trailBubbles", "ambientBubbles"]) if (typeof style[key] === "boolean") result.style[key] = style[key];
    const keys = new Set([...mediaSlots.map(([key]) => key), ...Object.keys(input.media || {}).filter(key => /^archive-[a-z0-9-]{1,120}$/.test(key))]);
    keys.forEach(key => {
      const value = input.media?.[key];
      if (value === null && !["background", "logo"].includes(key)) result.media[key] = null;
      else if (value?.blob instanceof Blob && ["image", "video"].includes(value.kind)) result.media[key] = { kind: value.kind, blob: value.blob, name: String(value.name || "自定义媒体").slice(0, 200) };
    });
    return result;
  }
  $("#save-config").addEventListener("click", async () => {
    busy = true;
    updateButtons();
    const snapshot = structuredClone(state);
    const version = revision;
    try {
      if (!db) db = await openDatabase();
      await store("readwrite", snapshot);
      saved = snapshot;
      dirty = revision !== version;
      report(dirty ? "已保存，更改尚未全部保存" : "已保存到当前浏览器");
    } catch {
      report("保存失败：存储空间或权限不足。可导出备份，当前预览仍保留。", true);
    } finally { busy = false; updateButtons(); }
  });
  $("#revert-config").addEventListener("click", () => {
    state = structuredClone(saved);
    applyAll();
    dirty = false;
    revision++;
    report("已恢复上次保存");
    updateButtons();
  });
  $("#reset-config").addEventListener("click", () => $(".confirm-dialog").showModal());
  all("[data-confirm]").forEach((button) => button.addEventListener("click", () => {
    $(".confirm-dialog").close();
    if (button.dataset.confirm !== "accept") return;
    state = blank();
    applyAll();
    changed();
  }));
  function blobData(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  $("#export-config").addEventListener("click", async () => {
    busy = true;
    updateButtons();
    report("正在打包备份…");
    try {
      const backup = { version: 1, text: { ...state.text }, style: { ...state.style }, media: {} };
      for (const [key, media] of Object.entries(state.media)) {
        backup.media[key] = media ? { kind: media.kind, name: media.name, data: await blobData(media.blob) } : null;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = element("a");
      link.href = url;
      link.download = "作品集备份.portfolio";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      report(dirty ? "备份已导出，当前更改尚未保存" : "备份已导出");
    } catch { report("备份打包失败，请减少媒体大小后重试。", true); }
    finally { busy = false; updateButtons(); }
  });
  $("#import-config").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    busy = true;
    updateButtons();
    report("正在读取备份…");
    try {
      if (file.size > 800 * 1024 * 1024) throw new Error("备份过大，无法导入。");
      const input = JSON.parse(await file.text());
      if (input.version !== 1) throw new Error("备份格式不受支持。");
      const media = {};
      const importSlots = [...mediaSlots];
      Object.keys(input.media || {}).forEach(key => {
        if (/^archive-[a-z0-9-]{1,120}$/.test(key) && !importSlots.some(slot => slot[0] === key)) importSlots.push([key, key, key.endsWith("-foreground") ? "image/*" : "image/*,video/*"]);
      });
      for (const [key, , accept] of importSlots) {
        const value = input.media?.[key];
        if (value === null) media[key] = null;
        else if (value) {
          if (typeof value.data !== "string" || !/^data:(image|video)\/[\w.+-]+;base64,/.test(value.data)) throw new Error("备份包含无效媒体。");
          const comma = value.data.indexOf(",");
          const mime = value.data.slice(5, value.data.indexOf(";"));
          const bytes = Uint8Array.from(atob(value.data.slice(comma + 1)), (char) => char.charCodeAt(0));
          media[key] = await validateFile(new File([bytes], String(value.name || "导入媒体"), { type: mime }), accept.includes("video"));
        }
      }
      state = normalize({ ...input, media });
      applyAll();
      changed();
      report("备份已载入，保存后生效");
    } catch (error) { report(`导入失败：${error.message}`, true); }
    finally { busy = false; event.target.value = ""; updateButtons(); }
  });

  buildTextEditor();
  buildMediaEditor();
  applyAll();
  (async () => {
    editor.inert = true;
    try {
      db = await openDatabase();
      const stored = await store("readonly");
      if (stored) state = normalize(stored);
      saved = structuredClone(state);
      applyAll();
      report(stored ? "已读取本地配置" : "默认内容 · 尚无自定义配置");
    } catch { report("本地存储不可用，可编辑并导出备份。", true); }
    finally { ready = true; editor.inert = !unlocked; editor.dataset.ready = "true"; updateButtons(); }
  })();
})();
