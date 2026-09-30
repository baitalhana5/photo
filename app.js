(() => {
  const { CLIENT_ID, API_URL } = window.CONFIG;
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle("hidden", !on);

  const MSG = {
    forbidden: "هذا الحساب غير مصرح له بالدخول.",
    expired: "انتهت جلسة تسجيل الدخول. الرجاء تسجيل الدخول مرة أخرى.",
    login: "تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.",
    net: "تعذّر تحميل الصور حاليًا. تأكد من الاتصال ثم حاول مرة أخرى.",
    empty: "لا توجد صور بعد. أضف صورًا إلى مجلد Google Drive وستظهر هنا.",
  };

  let token = sessionStorage.getItem("t");
  let photos = [];
  let cur = 0;

  // ---------- الاتصال بالخادم (Apps Script) ----------
  // نرسل POST بنوع text/plain لتجنب preflight (Apps Script لا يدعم OPTIONS).
  async function api(body) {
    let res;
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token, ...body }),
      });
      res = await r.json();
    } catch {
      throw "net";
    }
    if (res.error === "auth") throw "expired";
    if (res.error === "forbidden") throw "forbidden";
    if (res.error) throw "net";
    return res;
  }

  // ---------- الجلسة ----------
  function tokenExp(t) { // للتجربة فقط (UX)؛ القرار الحقيقي يتخذه الخادم
    try {
      return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000;
    } catch { return 0; }
  }

  function showLogin(msg = "") {
    token = null;
    sessionStorage.removeItem("t");
    photos = [];
    queue.length = 0;
    clearGrid();
    show("app", false);
    show("lb", false);
    show("login", true);
    $("loginMsg").textContent = msg;
  }

  function onCredential(resp) {
    token = resp.credential;
    sessionStorage.setItem("t", token);
    start();
  }

  function setStatus(text, retry) {
    const s = $("status");
    s.textContent = text;
    if (text.endsWith("…")) { const d = document.createElement("i"); d.className = "dot"; s.prepend(d); }
    if (retry) {
      const b = document.createElement("button");
      b.textContent = "إعادة المحاولة";
      b.onclick = start;
      s.append(" ", b);
    }
  }

  // ---------- تحميل القائمة ----------
  async function start() {
    show("login", false);
    show("app", true);
    clearGrid();
    setStatus("جارٍ التحميل…");
    try {
      const r = await api({ action: "list" });
      $("uname").textContent = r.user.name;
      $("avatar").hidden = !r.user.picture;
      if (r.user.picture) $("avatar").src = r.user.picture;
      photos = r.photos;
      render();
    } catch (e) {
      if (e === "net") setStatus(MSG.net, true);
      else showLogin(MSG[e]); // لا تُعرض أي صور لغير المصرح لهم
    }
  }

  // ---------- الشبكة + Lazy loading ----------
  // الصور تأتي عبر API (وليست روابط مباشرة) لذلك نستخدم IntersectionObserver بدل loading="lazy".
  const queue = [];
  let active = 0;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target); pump(); }
    }),
    { rootMargin: "300px" }
  );

  function pump() {
    while (active < 4 && queue.length) {
      active++;
      loadThumb(queue.shift()).finally(() => { active--; pump(); });
    }
  }

  async function loadThumb(img) {
    try {
      const r = await api({ action: "thumb", id: img.dataset.id });
      img.onload = () => {
        img.parentElement.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
        img.classList.add("ok");
      };
      img.src = r.src;
    } catch (e) {
      if (e === "expired" || e === "forbidden") return showLogin(MSG[e]);
      img.closest(".cell").classList.add("bad");
    }
  }

  let cells = [];
  let nCols = 0;
  const colCount = () => (innerWidth >= 1000 ? 4 : innerWidth >= 700 ? 3 : 2);

  function clearGrid() { cells = []; nCols = 0; $("grid").innerHTML = ""; }

  // كل صورة تُوضع في أقصر عمود، وتحتفظ بنسبتها الأصلية (بدون قص)
  function layout() {
    const n = colCount();
    if (n === nCols) return;
    nCols = n;
    const g = $("grid");
    g.innerHTML = "";
    const cols = [], hs = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "col";
      g.append(c); cols.push(c); hs.push(0);
    }
    cells.forEach((c) => {
      const k = hs.indexOf(Math.min(...hs));
      cols[k].append(c.el);
      hs[k] += 1 / c.r;
    });
  }

  function render() {
    clearGrid();
    if (!photos.length) return setStatus(MSG.empty);
    setStatus("");
    photos.forEach((p, i) => {
      const r = p.w && p.h ? p.w / p.h : 4 / 3;
      const b = document.createElement("button");
      b.className = "cell";
      b.type = "button";
      b.setAttribute("aria-label", "صورة " + (i + 1));
      const ph = document.createElement("span");
      ph.className = "ph";
      ph.style.aspectRatio = r;
      const im = document.createElement("img");
      im.dataset.id = p.id;
      im.alt = "";
      ph.append(im);
      b.append(ph);
      b.onclick = () => openLb(i);
      cells.push({ el: b, r });
      io.observe(im);
    });
    layout();
  }

  // ---------- Lightbox ----------
  async function openLb(i) {
    cur = i;
    $("lbCount").textContent = (i + 1) + " / " + photos.length;
    show("lb", true);
    document.body.style.overflow = "hidden";
    const im = $("lbImg");
    im.removeAttribute("src");
    show("lbErr", false);
    show("lbSpin", true);
    try {
      const r = await api({ action: "full", id: photos[i].id });
      if (cur === i) im.src = r.src;
    } catch (e) {
      if (cur !== i) return;
      if (e === "net") show("lbErr", true);
      else { closeLb(); showLogin(MSG[e]); return; }
    }
    if (cur === i) show("lbSpin", false);
  }

  function closeLb() {
    show("lb", false);
    document.body.style.overflow = "";
    $("lbImg").removeAttribute("src");
  }

  const go = (d) => openLb((cur + d + photos.length) % photos.length);

  // ---------- الوضع الداكن ----------
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelectorAll(".theme-btn").forEach((b) => { b.textContent = t === "dark" ? "فاتح" : "داكن"; });
  }
  function toggleTheme() {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", t); } catch {}
    applyTheme(t);
  }

  // ---------- تهيئة ----------
  function init() {
    $("logout").onclick = () => { window.google?.accounts.id.disableAutoSelect(); showLogin(); };
    document.querySelectorAll(".theme-btn").forEach((b) => { b.onclick = toggleTheme; });
    applyTheme(document.documentElement.dataset.theme || "light");
    window.addEventListener("resize", layout);
    $("lbClose").onclick = closeLb;
    $("prev").onclick = () => go(-1);
    $("next").onclick = () => go(1);
    $("lb").onclick = (e) => { if (e.target.id === "lb") closeLb(); };
    document.addEventListener("keydown", (e) => {
      if ($("lb").classList.contains("hidden")) return;
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowLeft") go(1);   // الواجهة RTL: اليسار = التالية
      if (e.key === "ArrowRight") go(-1);
    });

    let x0 = 0; // السحب على الهاتف: يسارًا = التالية
    $("lb").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    $("lb").addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });

    if (!window.google) return showLogin(MSG.login);
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: onCredential,
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    google.accounts.id.renderButton($("gbtn"), {
      theme: "outline", size: "large", text: "signin_with", locale: "en",
    });

    if (token && tokenExp(token) > Date.now()) start();
    else showLogin(token ? MSG.expired : "");
  }

  window.addEventListener("load", init);
})();
