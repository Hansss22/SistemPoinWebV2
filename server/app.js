// Single-file SPA. No build step. Data model follows the Flutter version.
// Sections: CONSTANTS → UTILS → API → CACHE → SESSION → SELECTORS →
//           DOM HELPERS → TOAST → MODALS → RENDERERS → ROUTING → AUTH → INIT

// ===== CONSTANTS =====

const StorageKeys = { session: "sp_session_v1" };

const Roles  = { teacher: "teacher", student: "student" };
const Status = { pending: "pending", applied: "applied", reviewed: "reviewed" };

const JenisPelanggaran = [
  { key: "membuangSampahSembarangan",  label: "Membuang Sampah Sembarangan",   poin: 2  },
  { key: "tidakMembawaBuku",           label: "Tidak Membawa Buku",             poin: 5  },
  { key: "tidakMemakaiSeragamLengkap", label: "Tidak Memakai Seragam Lengkap",  poin: 5  },
  { key: "tidakIkutUpacara",           label: "Tidak Ikut Upacara",             poin: 10 },
  { key: "terlambatMasuk",             label: "Terlambat Masuk",                poin: 10 },
  { key: "keluarLingkunganSekolah",    label: "Keluar Lingkungan Sekolah",      poin: 10 },
  { key: "membolosTanpaAlasan",        label: "Membolos Tanpa Alasan",          poin: 15 },
  { key: "merokok",                    label: "Merokok",                        poin: 20 },
  { key: "membawaSenjataTajam",        label: "Membawa Senjata Tajam",          poin: 20 },
  { key: "berkelahiDenganSiswaLain",   label: "Berkelahi Dengan Siswa Lain",    poin: 25 },
  { key: "merusakFasilitasSekolah",    label: "Merusak Fasilitas Sekolah",      poin: 25 },
  { key: "mengonsumsiNarkotika",       label: "Mengonsumsi Narkotika",          poin: 30 },
  { key: "melakukanTindakanAsusila",   label: "Melakukan Tindakan Asusila",     poin: 30 },
];

// ===== UTILITIES =====

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function readStore(key, fallback) { return safeJsonParse(localStorage.getItem(key), fallback); }
function writeStore(key, value)   { localStorage.setItem(key, JSON.stringify(value)); }

function fmtDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Escape HTML entities for safe injection into innerHTML templates (e.g. print)
function sanitizeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== API SERVICE =====

const API = {
  base: "",
  async request(method, path, body) {
    const sess = getSession();
    const res = await fetch(`${API.base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(sess?.username ? { "x-username": sess.username } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(data?.message || `Request gagal: ${method} ${path}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  login:    (u, p) => API.request("POST", "/api/login",    { username: u, password: p }),
  register: (u, p) => API.request("POST", "/api/register", { username: u, password: p }),

  listStudents:    async ()          => (await API.request("GET",  "/api/students")).students,
  createStudent:   async (n, k)      => (await API.request("POST", "/api/students", { name: n, kelas: k })).student,
  updateStudent:   (id, n, k)        => API.request("PUT",    `/api/students/${id}`, { name: n, kelas: k }),
  deleteStudent:   (id)              => API.request("DELETE", `/api/students/${id}`),

  listViolations:  async ()          => (await API.request("GET",  "/api/violations")).violations,
  createViolation: async (sid, j, p) => (await API.request("POST", "/api/violations", { studentId: sid, jenis: j, poin: p })).violation,
  deleteViolation: (id)              => API.request("DELETE", `/api/violations/${id}`),
  approveViolation:(id)              => API.request("PUT",    `/api/violations/${id}/approve`),

  listSanctions:   async ()          => (await API.request("GET",  "/api/sanctions")).sanctions,
  createSanction:  async (payload)   => (await API.request("POST", "/api/sanctions", payload)).sanction,
  updateSanction:  (id, payload)     => API.request("PUT",    `/api/sanctions/${id}`, payload),
  deleteSanction:  (id)              => API.request("DELETE", `/api/sanctions/${id}`),

  listRecords:     async ()          => (await API.request("GET",  "/api/records")).records,
  setRecord: (sanctionId, studentId, status) =>
    API.request("PUT", "/api/records", { sanctionId, studentId, status }),
};

// ===== CACHE & DATA LOADING =====

const cache = { students: [], violations: [], sanctions: [], records: [], loaded: false };

async function loadAll() {
  const [students, violations, sanctions, records] = await Promise.all([
    API.listStudents(), API.listViolations(), API.listSanctions(), API.listRecords(),
  ]);
  Object.assign(cache, { students, violations, sanctions, records, loaded: true });
}

// ===== SESSION =====

function getSession()   { return readStore(StorageKeys.session, null); }
function clearSession() { localStorage.removeItem(StorageKeys.session); }
function setSession({ username, role, studentId }) {
  writeStore(StorageKeys.session, { username, role, studentId: studentId ?? null, at: Date.now() });
}

function isTeacher()   { return getSession()?.role     === Roles.teacher; }
function isAdmin()     { return getSession()?.username === "admin"; }
function isStudent()   { return getSession()?.role     === Roles.student; }
function myStudentId() { return getSession()?.studentId ?? null; }

// ===== SELECTORS =====

const getStudents   = () => cache.students;
const getViolations = () => cache.violations;
const getSanctions  = () => cache.sanctions;
const getRecords    = () => cache.records;

function totalPointsForStudent(studentId) {
  return getViolations()
    .filter(v => v.studentId === studentId && v.status === "approved")
    .reduce((sum, v) => sum + (v.poin || 0), 0);
}

function findStudentById(id) {
  return getStudents().find(s => s.id === id) ?? null;
}

function getSanctionForPoints(pts) {
  return getSanctions().find(s => pts >= s.minPoin && pts <= s.maxPoin) ?? null;
}

function getStudentSanctionRecord(sanctionId, studentId) {
  return getRecords().find(r => r.sanctionId === sanctionId && r.studentId === studentId) ?? null;
}

// Priority: applied > reviewed > pending. Returns null when student has no records.
function effectiveStatusForStudent(studentId) {
  const recs = getRecords().filter(r => r.studentId === studentId);
  if (!recs.length) return null;
  if (recs.some(r => r.status === Status.applied))  return Status.applied;
  if (recs.some(r => r.status === Status.reviewed)) return Status.reviewed;
  return Status.pending;
}

function countsByStatusForStudent(studentId) {
  const base = { [Status.pending]: 0, [Status.applied]: 0, [Status.reviewed]: 0 };
  return getRecords()
    .filter(r => r.studentId === studentId)
    .reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, base);
}

// ===== DOM HELPERS =====

function $(sel) { return document.querySelector(sel); }

// createElement with attrs and children. Text strings become safe text nodes (no XSS).
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class")                              e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else                                            e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function pill(text, kind)   { return el("span", { class: `pill ${kind || ""}` }, [text]); }

function levelPill(tingkat) {
  const t = (tingkat || "").toLowerCase();
  if (t.includes("berat"))  return pill(tingkat, "red");
  if (t.includes("sedang")) return pill(tingkat, "orange");
  return pill(tingkat, "yellow");
}

function statusPill(status) {
  if (status === Status.applied)  return pill("applied",  "green");
  if (status === Status.reviewed) return pill("reviewed", "grey");
  return pill("pending", "blue");
}

function setActiveTab(route) {
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.route === route)
  );
}

function showError(node, msg) {
  node.textContent = msg;
  node.classList.toggle("hidden", !msg);
}

// ===== TOAST NOTIFICATIONS =====

// type: "success" | "error" | "info"
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = el("div", { class: `toast toast-${type}` }, [message]);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(() => {
    toast.classList.remove("toast-show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3000);
}

// ===== MODAL SYSTEM =====

// Generic modal: handles alert (1 button), confirm (yes/no), prompt (input + ok/cancel)
function showModal({ message, type, defaultValue = "" }) {
  return new Promise(resolve => {
    const overlay = document.getElementById("modalOverlay");
    const msg     = document.getElementById("modalMsg");
    const wrap    = document.getElementById("modalInputWrap");
    const input   = document.getElementById("modalInput");
    const ok      = document.getElementById("modalOk");
    const cancel  = document.getElementById("modalCancel");

    msg.textContent = message;

    if (type === "prompt") {
      wrap.classList.remove("hidden");
      input.value = defaultValue;
      ok.textContent = "OK";
      cancel.classList.remove("hidden");
      cancel.textContent = "Batal";
    } else if (type === "confirm") {
      wrap.classList.add("hidden");
      ok.textContent = "Ya";
      cancel.classList.remove("hidden");
      cancel.textContent = "Tidak";
    } else {
      // alert
      wrap.classList.add("hidden");
      ok.textContent = "OK";
      cancel.classList.add("hidden");
    }

    overlay.classList.remove("hidden");
    setTimeout(() => (type === "prompt" ? input : ok).focus(), 50);

    const cleanup = () => {
      overlay.classList.add("hidden");
      ok.onclick = cancel.onclick = input.onkeydown = null;
    };

    ok.onclick = () => {
      const val = type === "prompt" ? input.value : type === "confirm" ? true : undefined;
      cleanup(); resolve(val);
    };
    cancel.onclick = () => { cleanup(); resolve(type === "prompt" ? null : false); };
    if (type === "prompt") {
      input.onkeydown = e => {
        if (e.key === "Enter")  ok.click();
        if (e.key === "Escape") cancel.click();
      };
    }
  });
}

function showAlert(message)                        { return showModal({ message, type: "alert"   }); }
function showConfirm(message)                      { return showModal({ message, type: "confirm" }); }
function showPromptModal(label, defaultValue = "") { return showModal({ message: label, type: "prompt", defaultValue }); }

// Form modal for adding/editing a sanction.
// Validates: required fields, poin ≥ 0, min ≤ max, no overlapping ranges.
function showSanksiForm(existing) {
  return new Promise(resolve => {
    const overlay = document.getElementById("sanksiModalOverlay");
    const title   = document.getElementById("sanksiModalTitle");
    const tingkat = document.getElementById("sanksiTingkat");
    const ket     = document.getElementById("sanksiKeterangan");
    const minP    = document.getElementById("sanksiMinPoin");
    const maxP    = document.getElementById("sanksiMaxPoin");
    const errDiv  = document.getElementById("sanksiModalError");
    const ok      = document.getElementById("sanksiModalOk");
    const cancel  = document.getElementById("sanksiModalCancel");

    title.textContent   = existing ? "Ubah Sanksi" : "Tambah Sanksi";
    tingkat.value       = existing?.tingkat    || "";
    ket.value           = existing?.keterangan || "";
    minP.value          = existing?.minPoin    ?? "";
    maxP.value          = existing?.maxPoin    ?? "";
    errDiv.textContent  = "";
    errDiv.classList.add("hidden");

    overlay.classList.remove("hidden");
    setTimeout(() => tingkat.focus(), 50);

    const setErr = msg => { errDiv.textContent = msg; errDiv.classList.remove("hidden"); };
    const cleanup = () => { overlay.classList.add("hidden"); ok.onclick = cancel.onclick = null; };

    ok.onclick = () => {
      const t  = tingkat.value.trim();
      const k  = ket.value.trim();
      const mn = Number(minP.value);
      const mx = Number(maxP.value);

      if (!t || !k) { setErr("Tingkat dan keterangan wajib diisi"); return; }
      if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn < 0 || mx < 0)
        { setErr("Poin harus berupa angka ≥ 0"); return; }
      if (mn > mx)
        { setErr("Min poin tidak boleh lebih besar dari max poin"); return; }

      // Reject overlapping ranges with any other sanction (excluding self on edit)
      const overlap = getSanctions().find(s =>
        (!existing || s.id !== existing.id) && mn <= s.maxPoin && mx >= s.minPoin
      );
      if (overlap)
        { setErr(`Rentang tumpang tindih dengan "${overlap.tingkat}" (${overlap.minPoin}–${overlap.maxPoin})`); return; }

      cleanup();
      resolve({ tingkat: t, keterangan: k, minPoin: mn, maxPoin: mx });
    };
    cancel.onclick = () => { cleanup(); resolve(null); };
  });
}

// Form modal for editing a student's name and class
function showMuridForm(student) {
  return new Promise(resolve => {
    const overlay = document.getElementById("muridModalOverlay");
    const nama    = document.getElementById("muridNama");
    const kelas   = document.getElementById("muridKelas");
    const errDiv  = document.getElementById("muridModalError");
    const ok      = document.getElementById("muridModalOk");
    const cancel  = document.getElementById("muridModalCancel");

    nama.value  = student?.name  || "";
    kelas.value = student?.kelas || "";
    errDiv.textContent = "";
    errDiv.classList.add("hidden");

    overlay.classList.remove("hidden");
    setTimeout(() => nama.focus(), 50);

    const cleanup = () => { overlay.classList.add("hidden"); ok.onclick = cancel.onclick = null; };

    ok.onclick = () => {
      const n = nama.value.trim();
      const k = kelas.value.trim();
      if (!n || !k) {
        errDiv.textContent = "Nama dan kelas wajib diisi";
        errDiv.classList.remove("hidden");
        return;
      }
      cleanup(); resolve({ name: n, kelas: k });
    };
    cancel.onclick = () => { cleanup(); resolve(null); };
  });
}

// ===== ROUTE: DASHBOARD =====

function renderDashboard() {
  const students   = getStudents();
  const violations = getViolations();
  const totalPoin  = students.reduce((s, st) => s + totalPointsForStudent(st.id), 0);

  // Student with most points
  const topStudent = students.reduce(
    (best, s) => (!best || totalPointsForStudent(s.id) >= totalPointsForStudent(best.id)) ? s : best,
    null
  );

  // Count effective statuses across all students that have at least one record
  let countPending = 0, countApplied = 0, countReviewed = 0;
  const seenStudents = new Set(getRecords().map(r => r.studentId));
  for (const sid of seenStudents) {
    const eff = effectiveStatusForStudent(sid);
    if (eff === Status.pending)  countPending++;
    if (eff === Status.applied)  countApplied++;
    if (eff === Status.reviewed) countReviewed++;
  }

  return el("div", {}, [
    el("div", { class: "grid3" }, [
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Murid"]),   el("div", { class: "value" }, [String(students.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Catatan"]), el("div", { class: "value" }, [String(violations.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Poin"]),    el("div", { class: "value" }, [String(totalPoin)])]),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", { class: "muted" }, ["Status Pelanggaran (ringkasan)"]),
      el("div", { class: "spacer" }),
      pill(`Pending: ${countPending}`,  "blue"),
      pill(`Applied: ${countApplied}`,  "green"),
      pill(`Reviewed: ${countReviewed}`, "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Siswa dengan Poin Terbanyak"]),
    topStudent
      ? el("div", { class: "kpi" }, [
          el("div", { class: "row" }, [
            el("div", {}, [
              el("div", { style: "font-weight:900; font-size:16px" }, [topStudent.name]),
              el("div", { class: "muted" }, [`Kelas: ${topStudent.kelas} • Poin: ${totalPointsForStudent(topStudent.id)}`]),
            ]),
            el("div", { class: "spacer" }),
            effectiveStatusForStudent(topStudent.id)
              ? statusPill(effectiveStatusForStudent(topStudent.id))
              : el("span", { class: "muted" }, ["-"]),
          ]),
        ])
      : el("div", { class: "muted" }, ["- Belum ada data -"]),
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Riwayat Terakhir"]),
    violations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [el("tr", {}, [
            el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]),
            el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"]),
          ])]),
          el("tbody", {}, violations.slice(0, 6).map(v => {
            const s = findStudentById(v.studentId) || { name: "(–)" };
            return el("tr", {}, [
              el("td", {}, [s.name]), el("td", {}, [v.jenis]),
              el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)]),
            ]);
          })),
        ]),
  ]);
}

function renderDashboardStudent() {
  const sid          = myStudentId();
  const me           = sid ? findStudentById(sid) : null;
  const myViolations = sid ? getViolations().filter(v => v.studentId === sid) : [];
  const myPoints     = sid ? totalPointsForStudent(sid) : 0;
  const sanction     = getSanctionForPoints(myPoints);
  const eff          = sid ? effectiveStatusForStudent(sid) : null;

  return el("div", {}, [
    el("div", { class: "grid3" }, [
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Nama"]),         el("div", { class: "value" }, [me?.name || "(belum dihubungkan)"])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Catatan"]),el("div", { class: "value" }, [String(myViolations.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Poin"]),   el("div", { class: "value" }, [String(myPoints)])]),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", { style: "font-weight:900" }, ["Sanksi saat ini"]),
      el("div", { class: "spacer" }),
      sanction ? levelPill(sanction.tingkat) : pill("-", "grey"),
      eff       ? statusPill(eff)            : pill("-", "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Riwayat Terakhir"]),
    myViolations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
          el("tbody", {}, myViolations.slice(0, 10).map(v =>
            el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])])
          )),
        ]),
  ]);
}

// ===== ROUTE: MURID =====

// Shared row builder — used in both initial render and live search rebuild
function buildStudentRow(s) {
  const pts      = totalPointsForStudent(s.id);
  const sanction = getSanctionForPoints(pts);
  const counts   = countsByStatusForStudent(s.id);
  const status   = effectiveStatusForStudent(s.id);

  const editBtn = isAdmin() ? el("button", { class: "btn sm", type: "button",
    onclick: async () => {
      const result = await showMuridForm(s);
      if (!result) return;
      await API.updateStudent(s.id, result.name, result.kelas);
      await loadAll(); rerender();
      showToast(`Data murid "${result.name}" berhasil diperbarui`, "success");
    },
  }, ["Ubah"]) : null;

  const delBtn = isAdmin() ? el("button", { class: "btn sm danger", type: "button",
    onclick: async () => {
      if (!await showConfirm(`Hapus murid "${s.name}"?`)) return;
      await API.deleteStudent(s.id);
      showToast(`Murid "${s.name}" berhasil dihapus`, "success");
      await loadAll(); rerender();
    },
  }, ["Hapus"]) : null;

  const statusBadges = el("div", { class: "row" }, [
    counts.pending  ? pill(`P:${counts.pending}`,  "blue")  : null,
    counts.applied  ? pill(`A:${counts.applied}`,  "green") : null,
    counts.reviewed ? pill(`R:${counts.reviewed}`, "grey")  : null,
  ]);

  return el("tr", {}, [
    el("td", {}, [el("div", { style: "font-weight:900" }, [s.name]), el("div", { class: "muted" }, [`ID: ${s.id}`])]),
    el("td", {}, [s.kelas]),
    el("td", {}, [String(pts)]),
    el("td", {}, [sanction ? levelPill(sanction.tingkat) : pill("-", "grey")]),
    el("td", {}, [status ? statusPill(status) : pill("-", "grey"), el("div", { style: "margin-top:6px" }, [statusBadges])]),
    el("td", {}, [editBtn, delBtn].filter(Boolean)),
  ]);
}

function buildStudentTable(students) {
  if (!students.length) return el("div", { class: "muted", style: "margin-top:10px" }, ["Belum ada data murid"]);
  return el("table", {}, [
    el("thead", {}, [el("tr", {}, [
      el("th", {}, ["Nama"]), el("th", {}, ["Kelas"]),  el("th", {}, ["Poin"]),
      el("th", {}, ["Sanksi"]), el("th", {}, ["Status"]), el("th", {}, ["Aksi"]),
    ])]),
    el("tbody", {}, students.map(buildStudentRow)),
  ]);
}

function renderMurid() {
  if (!isTeacher()) return el("div", { class: "muted" }, ["Akses ditolak. Halaman ini hanya untuk guru."]);

  const students    = getStudents();
  const searchInput = el("input", { id: "searchNameInput", placeholder: "Cari nama...", style: "width:200px" });

  let formRow = null;
  if (isAdmin()) {
    const nameInput  = el("input", { id: "studentNameInput",  placeholder: "Nama murid" });
    const kelasInput = el("input", { id: "studentKelasInput", placeholder: "Kelas" });

    formRow = el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [nameInput]),
      el("div", { style: "flex:1; min-width:160px" }, [kelasInput]),
      el("button", { class: "btn ok", type: "button",
        onclick: async () => {
          const name  = nameInput.value.trim();
          const kelas = kelasInput.value.trim();
          if (!name || !kelas) { showToast("Nama dan kelas wajib diisi", "error"); return; }
          await API.createStudent(name, kelas);
          await loadAll();
          nameInput.value = kelasInput.value = "";
          rerender();
          showToast(`Murid "${name}" berhasil ditambahkan`, "success");
        },
      }, ["Tambah"]),
      el("button", { class: "btn", type: "button",
        onclick: () => { nameInput.value = kelasInput.value = ""; },
      }, ["Bersihkan"]),
    ]);
  }

  let table = buildStudentTable(students);

  // Live search with rAF debounce — rebuilds table in-place without full rerender
  searchInput.addEventListener("input", () => {
    if (window.__muridSearchRaf) cancelAnimationFrame(window.__muridSearchRaf);
    window.__muridSearchRaf = requestAnimationFrame(() => {
      const q        = searchInput.value.trim().toLowerCase();
      const filtered = q ? students.filter(s => s.name.toLowerCase().includes(q)) : students;
      const newTable = buildStudentTable(filtered);
      table.replaceWith(newTable);
      table = newTable;
    });
  });

  return el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { style: "font-weight:900" }, ["Daftar Murid"]),
      el("div", { class: "spacer" }),
      searchInput,
    ]),
    formRow,
    el("div", { class: "hr" }),
    table,
  ]);
}

// ===== ROUTE: CATATAN =====

function renderCatatan() {
  const students   = getStudents();
  const violations = getViolations();

  // Student view: read-only personal history
  if (isStudent()) {
    const sid = myStudentId();
    const myV = sid ? violations.filter(v => v.studentId === sid) : [];
    return el("div", {}, [
      el("div", { class: "muted" }, ["Mode murid: kamu hanya bisa melihat riwayat pelanggaran milikmu."]),
      el("div", { class: "hr" }),
      myV.length === 0
        ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
        : el("table", {}, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
            el("tbody", {}, myV.map(v =>
              el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])])
            )),
          ]),
    ]);
  }

  // Violation entry form
  const studentSel = el("select", {});
  studentSel.appendChild(el("option", { value: "" }, ["Pilih murid"]));
  for (const s of students) studentSel.appendChild(el("option", { value: String(s.id) }, [s.name]));

  const jenisSel = el("select", {});
  jenisSel.appendChild(el("option", { value: "" }, ["Pilih jenis pelanggaran"]));
  for (const j of JenisPelanggaran)
    jenisSel.appendChild(el("option", { value: j.key }, [`${j.label} (${j.poin} poin)`]));

  const poinInput = el("input", { value: "1", readonly: "readonly" });
  jenisSel.addEventListener("change", () => {
    const j = JenisPelanggaran.find(x => x.key === jenisSel.value);
    poinInput.value = j ? String(j.poin) : "1";
  });

  const form = el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [studentSel]),
      el("div", { style: "flex:1; min-width:260px" }, [jenisSel]),
      el("div", { style: "width:110px" }, [poinInput]),
    ]),
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("button", { class: "btn primary", type: "button",
        onclick: async () => {
          const sid   = Number(studentSel.value || 0);
          const jenis = JenisPelanggaran.find(x => x.key === jenisSel.value);
          if (!sid || !jenis) { await showAlert("Lengkapi pilihan murid dan jenis pelanggaran"); return; }
          await API.createViolation(sid, jenis.label, jenis.poin);
          await loadAll();
          studentSel.value = jenisSel.value = "";
          poinInput.value  = "1";
          rerender();
          showToast("Catatan pelanggaran berhasil ditambahkan", "success");
        },
      }, ["Tambah Catatan"]),
      el("button", { class: "btn", type: "button",
        onclick: () => { studentSel.value = jenisSel.value = ""; poinInput.value = "1"; },
      }, ["Bersihkan"]),
    ]),
  ]);

  // Print / PDF export via browser print
  const printBtn = el("button", { class: "btn", type: "button",
    onclick: () => {
      const headerInfo = getSession()?.username ? `User: ${getSession().username}` : "";
      const rowsHtml   = violations.map(v => {
        const s = findStudentById(v.studentId) || { name: "(–)", kelas: "-" };
        return `<tr>
          <td>${sanitizeHtml(s.name)}</td><td>${sanitizeHtml(s.kelas)}</td>
          <td>${sanitizeHtml(v.jenis)}</td>
          <td style="text-align:right">${sanitizeHtml(v.poin)}</td>
          <td>${fmtDate(v.tanggal)}</td>
          <td>${v.status === "approved" ? "Disetujui" : "Menunggu"}</td>
        </tr>`;
      }).join("");

      const existing = $("#__printModal");
      if (existing) existing.remove();

      const wrap = el("div", { id: "__printModal" }, []);
      wrap.innerHTML = `
        <style>@media print{body *{visibility:hidden!important}#__printModal,#__printModal *{visibility:visible!important}#__printModal{position:static!important;inset:auto!important;width:100%!important;background:#fff!important;box-shadow:none!important}}</style>
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">
          <div style="background:#fff;color:#111;width:min(900px,100%);border-radius:12px;overflow:auto;padding:16px;">
            <h2 style="margin:0 0 8px;font-size:16px;">Riwayat Pelanggaran</h2>
            <div style="color:#475569;font-size:12px;margin-bottom:12px;">${sanitizeHtml(headerInfo)}</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Nama</th>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Kelas</th>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Pelanggaran</th>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:right;">Poin</th>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Tanggal</th>
                <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left;">Status</th>
              </tr></thead>
              <tbody>${rowsHtml || '<tr><td colspan="6" style="border:1px solid #e2e8f0;padding:8px;">Belum ada catatan pelanggaran</td></tr>'}</tbody>
            </table>
            <div style="margin-top:10px;color:#475569;font-size:12px;">(Gunakan dialog Print dari browser)</div>
          </div>
        </div>`;

      document.body.appendChild(wrap);
      window.addEventListener("afterprint", () => { const x = $("#__printModal"); if (x) x.remove(); }, { once: true });
      window.print();
    },
  }, ["Print PDF"]);

  const table = violations.length === 0
    ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
    : el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]),
          el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"]),
          el("th", {}, ["Status"]), el("th", {}, ["Aksi"]),
        ])]),
        el("tbody", {}, violations.map(v => {
          const s = findStudentById(v.studentId) || { name: "(–)" };

          const delBtn = el("button", { class: "btn sm danger", type: "button",
            onclick: async () => {
              if (!await showConfirm("Hapus catatan ini?")) return;
              await API.deleteViolation(v.id);
              showToast("Catatan berhasil dihapus", "success");
              await loadAll(); rerender();
            },
          }, ["Hapus"]);

          const approveBtn = (v.status === "pending" && isAdmin())
            ? el("button", { class: "btn sm primary", type: "button",
                onclick: async () => {
                  await API.approveViolation(v.id);
                  showToast("Catatan berhasil disetujui", "success");
                  await loadAll(); rerender();
                },
              }, ["Setujui"])
            : null;

          return el("tr", {}, [
            el("td", {}, [s.name]),
            el("td", {}, [v.jenis]),
            el("td", {}, [String(v.poin)]),
            el("td", {}, [fmtDate(v.tanggal)]),
            el("td", {}, [v.status === "approved" ? "Disetujui" : "Menunggu"]),
            el("td", {}, [delBtn, approveBtn].filter(Boolean)),
          ]);
        })),
      ]);

  return el("div", {}, [
    el("div", { class: "row", style: "margin-bottom:10px" }, [
      el("div", { style: "font-weight:900" }, ["Tambah Catatan Pelanggaran"]),
      el("div", { class: "spacer" }),
      printBtn,
    ]),
    form,
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:10px" }, ["Riwayat Pelanggaran"]),
    table,
  ]);
}

// ===== ROUTE: SANKSI =====

function renderSanksi() {
  const sanctions = getSanctions();
  const students  = getStudents();

  // Student view: read-only sanction status
  if (isStudent()) {
    const sid = myStudentId();
    const me  = sid ? findStudentById(sid) : null;
    const pts = sid ? totalPointsForStudent(sid) : 0;
    return el("div", {}, [
      el("div", { class: "muted" }, [`Mode murid: menampilkan status sanksi untuk ${me?.name || "akunmu"}.`]),
      el("div", { class: "hr" }),
      el("div", { class: "kpi" }, [
        el("div", { class: "row" }, [
          el("div", { style: "font-weight:900" }, ["Poin saat ini"]),
          el("div", { class: "spacer" }),
          pill(String(pts), "blue"),
        ]),
      ]),
      el("div", { class: "hr" }),
      sanctions.length === 0
        ? el("div", { class: "muted" }, ["Belum ada sanksi"])
        : el("div", {}, sanctions.map(s => {
            const inRange = pts >= s.minPoin && pts <= s.maxPoin;
            const rec     = sid ? getStudentSanctionRecord(s.id, sid) : null;
            const current = rec?.status || Status.pending;
            return el("div", { class: "kpi sanksi-card", style: "margin-bottom:12px" }, [
              el("div", { class: "row" }, [
                el("div", { style: `font-weight:900;${inRange ? "" : "opacity:.75"}` }, [s.tingkat]),
                el("div", { class: "spacer" }),
                levelPill(s.tingkat), statusPill(current),
              ]),
              el("div", { class: "muted", style: "margin-top:6px" }, [`Poin: ${s.minPoin}–${s.maxPoin} • ${s.keterangan}`]),
            ]);
          })),
    ]);
  }

  // Admin/teacher view with CRUD
  async function openForm(existing) {
    const data = await showSanksiForm(existing);
    if (!data) return;
    try {
      if (existing) {
        await API.updateSanction(existing.id, data);
        showToast(`Sanksi "${data.tingkat}" berhasil diperbarui`, "success");
      } else {
        await API.createSanction(data);
        showToast(`Sanksi "${data.tingkat}" berhasil ditambahkan`, "success");
      }
      await loadAll(); rerender();
    } catch (err) {
      showToast(err.message || "Gagal menyimpan sanksi", "error");
    }
  }

  const addBtn = isAdmin()
    ? el("button", { class: "btn ok", type: "button", onclick: () => openForm(null) }, ["Tambah Sanksi"])
    : null;

  const list = el("div", {}, sanctions.map(s => {
    const matched = students.filter(st => {
      const pts = totalPointsForStudent(st.id);
      return pts >= s.minPoin && pts <= s.maxPoin;
    });

    const editBtn = isAdmin()
      ? el("button", { class: "btn sm", type: "button", onclick: () => openForm(s) }, ["Ubah"])
      : null;

    const delBtn = isAdmin()
      ? el("button", { class: "btn sm danger", type: "button",
          onclick: async () => {
            if (!await showConfirm(`Hapus sanksi "${s.tingkat}"?`)) return;
            await API.deleteSanction(s.id);
            showToast(`Sanksi "${s.tingkat}" berhasil dihapus`, "success");
            await loadAll(); rerender();
          },
        }, ["Hapus"])
      : null;

    const actionsRow = (editBtn || delBtn)
      ? el("div", { class: "row", style: "margin-top:10px" }, [editBtn, delBtn].filter(Boolean))
      : null;

    const studentsTable = matched.length === 0
      ? el("div", { class: "muted", style: "margin-top:10px" }, ["- Tidak ada murid pada rentang ini -"])
      : el("table", { style: "margin-top:10px" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", {}, ["Murid"]), el("th", {}, ["Kelas"]),
            el("th", {}, ["Poin"]), el("th", {}, ["Status"]), el("th", {}, ["Ubah status"]),
          ])]),
          el("tbody", {}, matched.map(st => {
            const pts     = totalPointsForStudent(st.id);
            const rec     = getStudentSanctionRecord(s.id, st.id);
            const current = rec?.status || Status.pending;

            const sel = el("select", isAdmin() ? {
              onchange: async () => {
                await API.setRecord(s.id, st.id, sel.value);
                showToast("Status sanksi murid diperbarui", "success");
                await loadAll(); rerender();
              },
            } : { disabled: "disabled" });

            [Status.pending, Status.applied, Status.reviewed].forEach(v =>
              sel.appendChild(el("option", { value: v, ...(v === current ? { selected: "selected" } : {}) }, [v]))
            );

            return el("tr", {}, [
              el("td", {}, [st.name]), el("td", {}, [st.kelas]),
              el("td", {}, [String(pts)]), el("td", {}, [statusPill(current)]), el("td", {}, [sel]),
            ]);
          })),
        ]);

    return el("div", { class: "kpi sanksi-card", style: "margin-bottom:12px" }, [
      el("div", { class: "row" }, [
        el("div", { style: "font-weight:900; font-size:16px" }, [s.tingkat]),
        el("div", { class: "spacer" }),
        levelPill(s.tingkat),
      ]),
      el("div", { class: "muted", style: "margin-top:6px" }, [`Poin: ${s.minPoin}–${s.maxPoin} • ${s.keterangan}`]),
      ...(actionsRow ? [actionsRow] : []),
      el("div", { class: "hr" }),
      el("div", { style: "font-weight:900; margin-bottom:6px" }, ["Murid terpengaruh"]),
      studentsTable,
    ]);
  }));

  return el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { style: "font-weight:900" }, ["Kelola Sanksi"]),
      el("div", { class: "spacer" }),
      ...(addBtn ? [addBtn] : []),
    ]),
    el("div", { class: "hr" }),
    sanctions.length ? list : el("div", { class: "muted" }, ["Belum ada sanksi"]),
  ]);
}

// ===== ROUTING =====

function getRoute() {
  const h = (location.hash || "#dashboard").replace("#", "").trim();
  const allowed = isTeacher()
    ? new Set(["dashboard", "murid", "catatan", "sanksi"])
    : new Set(["dashboard", "catatan", "sanksi"]);
  return allowed.has(h) ? h : "dashboard";
}

function renderRoute(route) {
  const title = $("#routeTitle");
  const body  = $("#routeBody");
  body.innerHTML = "";

  const routeMap = {
    dashboard: () => { title.textContent = "Dashboard";          body.appendChild(isStudent() ? renderDashboardStudent() : renderDashboard()); },
    murid:     () => { title.textContent = "Data Murid";         body.appendChild(renderMurid()); },
    catatan:   () => { title.textContent = "Catatan & Laporan";  body.appendChild(renderCatatan()); },
    sanksi:    () => { title.textContent = "Sanksi & Pembinaan"; body.appendChild(renderSanksi()); },
  };
  routeMap[route]?.();
}

function rerender() {
  if (!getSession()) return;
  const route = getRoute();
  setActiveTab(route);
  renderRoute(route);
}

// ===== APP SHELL =====

function setAuthVisible(isLoggedIn) {
  $("#authView").classList.toggle("hidden",  isLoggedIn);
  $("#appView").classList.toggle("hidden",  !isLoggedIn);
  $("#btnLogout").classList.toggle("hidden", !isLoggedIn);
  $("#sessionUser").classList.toggle("hidden", !isLoggedIn);
}

function refreshSessionBadge() {
  const s = getSession();
  $("#sessionUser").textContent = s ? `login: ${s.username} • role: ${s.role || "-"}` : "";
}

function applyRoleTabs() {
  const sess = getSession();
  document.querySelectorAll(".tab").forEach(t => {
    if (t.dataset.route === "murid") t.classList.toggle("hidden", sess?.role !== Roles.teacher);
  });
}

function initAuthUI() {
  const loginForm = $("#loginForm");
  const loginU    = $("#loginUsername");
  const loginP    = $("#loginPassword");
  const loginErr  = $("#loginError");
  const regForm   = $("#registerForm");
  const regU      = $("#regUsername");
  const regP      = $("#regPassword");
  const regC      = $("#regConfirm");
  const regErr    = $("#regError");

  const showRegister = () => { regForm.classList.remove("hidden"); $("#registerHint").classList.add("hidden");    regU.focus(); };
  const showLogin    = () => { regForm.classList.add("hidden");    $("#registerHint").classList.remove("hidden"); loginU.focus(); };

  $("#toRegister").addEventListener("click", showRegister);
  $("#toLogin").addEventListener("click", showLogin);

  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    showError(loginErr, "");
    API.login(loginU.value, loginP.value)
      .then(async data => {
        setSession({ username: data.username, role: data.role, studentId: data.studentId });
        loginP.value = "";
        location.hash = "#dashboard";
        setAuthVisible(true);
        refreshSessionBadge();
        applyRoleTabs();
        await loadAll();
        rerender();
      })
      .catch(err => showError(loginErr, err.message || "Username atau password salah"));
  });

  regForm.addEventListener("submit", async e => {
    e.preventDefault();
    showError(regErr, "");
    if (regC.value !== regP.value) { showError(regErr, "Konfirmasi password tidak sama"); return; }
    API.register(regU.value, regP.value)
      .then(async () => {
        await showAlert("Pendaftaran berhasil, silakan masuk");
        regP.value = regC.value = "";
        showLogin();
      })
      .catch(err => showError(regErr, err.message || "Pendaftaran gagal"));
  });

  $("#btnLogout").addEventListener("click", () => {
    clearSession();
    setAuthVisible(false);
    refreshSessionBadge();
    applyRoleTabs();
  });
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(b =>
    b.addEventListener("click", () => { location.hash = `#${b.dataset.route}`; })
  );
  window.addEventListener("hashchange", () => rerender());
}

function main() {
  initAuthUI();
  initTabs();

  const session = getSession();
  setAuthVisible(!!session);
  refreshSessionBadge();
  applyRoleTabs();

  if (session) {
    loadAll()
      .then(() => rerender())
      .catch(async () => {
        await showAlert("Server database belum jalan. Jalankan: cd server → npm install → npm run dev");
        clearSession();
        setAuthVisible(false);
        refreshSessionBadge();
        applyRoleTabs();
      });
  }
}

document.addEventListener("DOMContentLoaded", main);
