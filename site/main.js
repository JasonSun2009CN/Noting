/* Noting marketing site */

const REPO = "JasonSun2009CN/Noting";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isZh = document.documentElement.lang.toLowerCase().startsWith("zh");

const ui = isZh
  ? {
      menuOpen: "打开菜单",
      menuClose: "关闭菜单",
      copyLabel: "复制 Docker 命令",
      copiedLabel: "Docker 命令已复制",
      copied: "命令已复制到剪贴板",
      copyFailed: "复制失败，请手动选择命令后复制",
    }
  : {
      menuOpen: "Open menu",
      menuClose: "Close menu",
      copyLabel: "Copy the Docker command",
      copiedLabel: "Docker command copied",
      copied: "Command copied to clipboard",
      copyFailed: "Copy failed. Select the command and copy it manually.",
    };

/* --------------------------------------------------------------------------
   Mobile menu
   -------------------------------------------------------------------------- */

const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menu-panel");
const menuLinks = menuPanel ? [...menuPanel.querySelectorAll("a")] : [];
let lastFocused = null;

function setMenu(open) {
  if (!menuToggle || !menuPanel) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? ui.menuClose : ui.menuOpen);
  menuPanel.setAttribute("aria-hidden", String(!open));
  menuPanel.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);

  if (open) {
    lastFocused = document.activeElement;
    window.setTimeout(() => menuLinks[0]?.focus(), 120);
  } else if (lastFocused) {
    lastFocused.focus();
  }
}

menuToggle?.addEventListener("click", () => {
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
});

menuLinks.forEach((link) => link.addEventListener("click", () => setMenu(false)));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    return;
  }

  if (event.key !== "Tab" || menuToggle?.getAttribute("aria-expanded") !== "true") return;

  const focusables = [menuToggle, ...menuLinks].filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900 && menuToggle?.getAttribute("aria-expanded") === "true") {
    setMenu(false);
  }
});

/* --------------------------------------------------------------------------
   Scroll reveals
   -------------------------------------------------------------------------- */

const reveals = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
  );

  reveals.forEach((el) => revealObserver.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("in"));
}

/* --------------------------------------------------------------------------
   Tagline: reveal one word at a time
   -------------------------------------------------------------------------- */

document.querySelectorAll("[data-tagline]").forEach((tagline) => {
  const text = tagline.textContent.trim();
  const trailing = /[，。！？；：、）》」』】…]/;
  const tokens = [];

  if (isZh) {
    Array.from(text).forEach((char) => {
      if (/\s/.test(char)) return;
      if (trailing.test(char) && tokens.length) tokens[tokens.length - 1] += char;
      else tokens.push(char);
    });
  } else {
    text.split(/\s+/).forEach((word) => tokens.push(word));
  }

  tagline.textContent = "";
  const wordEls = tokens.map((token) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = token;
    tagline.append(span);
    if (!isZh) tagline.append(document.createTextNode(" "));
    return span;
  });

  if (!("IntersectionObserver" in window) || reduceMotion) {
    wordEls.forEach((el) => el.classList.add("lit"));
    return;
  }

  const wordObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("lit");
        wordObserver.unobserve(entry.target);
      });
    },
    { threshold: 1, rootMargin: "0px 0px -20% 0px" }
  );

  wordEls.forEach((el) => wordObserver.observe(el));
});

/* --------------------------------------------------------------------------
   Copy the docker command
   -------------------------------------------------------------------------- */

const copyBtn = document.querySelector(".copy-btn");
const copyStatus = document.querySelector("[data-copy-status]");
let copyTimer;

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  return new Promise((resolve, reject) => {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    ok ? resolve() : reject(new Error("Copy failed"));
  });
}

copyBtn?.addEventListener("click", async () => {
  const text = copyBtn.dataset.copy || "";
  try {
    await copyText(text);
    copyBtn.classList.add("is-copied");
    copyBtn.setAttribute("aria-label", ui.copiedLabel);
    if (copyStatus) copyStatus.textContent = ui.copied;
  } catch {
    copyBtn.classList.remove("is-copied");
    if (copyStatus) copyStatus.textContent = ui.copyFailed;
  }

  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copyBtn.classList.remove("is-copied");
    copyBtn.setAttribute("aria-label", ui.copyLabel);
  }, 2000);
});

/* --------------------------------------------------------------------------
   Point download buttons at the latest release assets, when there is one
   -------------------------------------------------------------------------- */

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  if (ua.includes("linux")) return "linux";
  return null;
}

function pickAsset(assets, platform) {
  const names = (asset) => asset.name.toLowerCase();
  const find = (test) => assets.find((asset) => test(names(asset)));

  if (platform === "mac") {
    return (
      find((name) => name.endsWith(".dmg") && (name.includes("arm64") || name.includes("aarch64"))) ||
      find((name) => name.endsWith(".dmg"))
    );
  }
  if (platform === "win") {
    return find((name) => name.endsWith(".exe"));
  }
  if (platform === "linux") {
    return find((name) => name.endsWith(".appimage")) || find((name) => name.endsWith(".deb"));
  }
  return null;
}

async function upgradeDownloads() {
  let release;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    release = await response.json();
  } catch {
    return;
  }

  if (!release?.assets?.length) return;

  const platform = detectPlatform();
  const primary = platform ? pickAsset(release.assets, platform) : null;
  const heroTitle = release.tag_name ? `Noting ${release.tag_name}` : "Noting";

  if (primary) {
    const platformName = platform === "mac" ? "macOS" : platform === "win" ? "Windows" : "Linux";
    document.querySelectorAll("[data-download]:not([data-platform])").forEach((link) => {
      link.href = primary.browser_download_url;
      link.title = isZh ? `${heroTitle}（${platformName}）` : `${heroTitle} for ${platformName}`;
    });
  }

  document.querySelectorAll("[data-platform]").forEach((link) => {
    const asset = pickAsset(release.assets, link.dataset.platform);
    if (asset) {
      link.href = asset.browser_download_url;
      link.title = asset.name;
    }
  });
}

upgradeDownloads();
