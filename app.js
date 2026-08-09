

const API_BASE = "https://YOUR-RENDER-SERVICE.onrender.com/api";
const CURRENT_USER_KEY = "volt_current_user";

// ---------------- low-level API helper ----------------
async function apiRequest(path, options = {}) {
  let res, data;
  try {
    res = await fetch(API_BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    return { ok: false, error: "Can't reach the server. Is it running?" };
  }
  try {
    data = await res.json();
  } catch (err) {
    data = {};
  }
  if (!res.ok) {
    return { ok: false, error: data.error || "Something went wrong. Please try again." };
  }
  return { ok: true, ...data };
}

// ---------------- session (client-side cache of the logged-in user) ----------------
function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  } catch (err) {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function logoutUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  window.location.href = "index.html";
}

function requireRole(role) {
  const u = currentUser();
  if (!u || u.role !== role) {
    window.location.href = "index.html";
    return null;
  }
  renderNavbar(u);
  return u;
}

// ---------------- auth actions ----------------
async function login(email, password, role) {
  const res = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  setCurrentUser(res.user);
  return { ok: true, user: res.user };
}

async function registerStudent(name, email, password) {
  const res = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  setCurrentUser(res.user);
  return { ok: true, user: res.user };
}

// ---------------- navbar ----------------
const NAV_ITEMS = {
  admin: [
    { view: "overview", label: "Overview", href: "admin.html#overview" },
    { view: "tests", label: "Tests", href: "admin.html#tests" },
    { view: "students", label: "Students", href: "admin.html#students" },
    { view: "results", label: "Results", href: "admin.html#results" },
  ],
  student: [
    { view: "dashboard", label: "Dashboard", href: "student.html#dashboard" },
    { view: "results", label: "My results", href: "student.html#results" },
  ],
};

function renderNavbar(user) {
  const mount = document.getElementById("navbarMount");
  if (!mount) return;

  const items = NAV_ITEMS[user.role] || [];
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  mount.innerHTML = `
    <div class="navbar">
      <div class="navbar-inner">
        <div class="logo">
          <div class="logo-mark" id="navLogoMark"></div>
          <div>
            <div class="logo-word">VOLT</div>
            <div class="logo-sub">${user.role === "admin" ? "Admin panel" : "Student panel"}</div>
          </div>
        </div>
        <div class="nav-links" id="navLinks">
          ${items.map((item) => `<button type="button" data-view="${item.view}" data-href="${item.href}">${item.label}</button>`).join("")}
        </div>
        <div class="nav-right">
          <div class="user-chip">
            <span class="avatar-dot">${initial}</span>
            <span>${escapeHTML(user.name || user.email)}</span>
          </div>
          <button class="btn-logout" id="navLogoutBtn">Log out</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("navLogoMark").innerHTML = logoMarkSVG();
  document.getElementById("navLogoutBtn").addEventListener("click", logoutUser);

  document.getElementById("navLinks").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    window.location.hash = btn.dataset.view;
  });

  syncNavActive();
  window.addEventListener("hashchange", syncNavActive);
}

function syncNavActive() {
  const navLinks = document.getElementById("navLinks");
  if (!navLinks) return;
  const currentView = (window.location.hash || "").replace("#", "");
  [...navLinks.children].forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
}

// ---------------- toasts ----------------
function toast(message, type = "success") {
  let el = document.getElementById("voltToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "voltToast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast ${type} show`;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ---------------- misc helpers ----------------
function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function pctBadge(pct) {
  if (pct === null || pct === undefined) return `<span class="badge badge-mid">—</span>`;
  const cls = pct >= 75 ? "badge-good" : pct >= 40 ? "badge-mid" : "badge-bad";
  return `<span class="badge ${cls}">${pct}%</span>`;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function logoMarkSVG() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 2 L4 14 H11 L9 22 L20 9 H13 L13 2Z" fill="#fff"/>
  </svg>`;
}
