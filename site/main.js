/* Noting marketing site */

const REPO = "JasonSun2009CN/Noting";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
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
  const words = text.split(/\s+/);

  tagline.textContent = "";
  const wordEls = words.map((word) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = word;
    tagline.append(span, document.createTextNode(" "));
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
    copyBtn.setAttribute("aria-label", "Docker command copied");
    if (copyStatus) copyStatus.textContent = "Command copied to clipboard";
  } catch {
    copyBtn.classList.remove("is-copied");
    if (copyStatus) copyStatus.textContent = "Copy failed. Select the command and copy it manually.";
  }

  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copyBtn.classList.remove("is-copied");
    copyBtn.setAttribute("aria-label", "Copy the Docker command");
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
    document.querySelectorAll("[data-download]:not([data-platform])").forEach((link) => {
      link.href = primary.browser_download_url;
      link.title = `${heroTitle} for ${platform === "mac" ? "macOS" : platform === "win" ? "Windows" : "Linux"}`;
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
