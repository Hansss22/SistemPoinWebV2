/* School Violation Point System – Frontend SPA
 * Stack: Vanilla JS, no build step.
 * State: in-memory cache synced from REST API via loadAll().
 */

// ── Constants ──────────────────────────────────────────────────────────────

const StorageKeys = { session: "sp_session_v1" };

const Roles = { teacher: "teacher", student: "student" };

const Status = { pending: "pending", applied: "applied", reviewed: "reviewed" };

const JenisPelanggaran = [
  { key: "membuangSampahSembarangan",  label: "Membuang Sampah Sembarangan",   poin: 2  },
  { key: "tidakMembawaBuku",           label: "Tidak Membawa Buku",            poin: 5  },
  { key: "tidakMemakaiSeragamLengkap", label: "Tidak Memakai Seragam Lengkap", poin: 5  },
  { key: "tidakIkutUpacara",           label: "Tidak Ikut Upacara",            poin: 10 },
  { key: "terlambatMasuk",             label: "Terlambat Masuk",               poin: 10 },
  { key: "keluarLingkunganSekolah",    label: "Keluar Lingkungan Sekolah",     poin: 10 },
  { key: "membolosTanpaAlasan",        label: "Membolos Tanpa Alasan",         poin: 15 },
  { key: "merokok",                    label: "Merokok",                       poin: 20 },
  { key: "membawaSenjataTajam",        label: "Membawa Senjata Tajam",         poin: 20 },
  { key: "berkelahiDenganSiswaLain",   label: "Berkelahi Dengan Siswa Lain",   poin: 25 },
  { key: "merusakFasilitasSekolah",    label: "Merusak Fasilitas Sekolah",     poin: 25 },
  { key: "mengonsumsiNarkotika",       label: "Mengonsumsi Narkotika",         poin: 30 },
  { key: "melakukanTindakanAsusila",   label: "Melakukan Tindakan Asusila",    poin: 30 },
];

// ── Storage helpers ────────────────────────────────────────────────────────

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
function readStore(key, fallback) { return safeJsonParse(localStorage.getItem(key), fallback); }
function writeStore(key, value)   { localStorage.setItem(key, JSON.stringify(value)); }

// ── API layer ──────────────────────────────────────────────────────────────

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
      const msg = data?.message || `Request gagal: ${method} ${path}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  login:    (u, p) => API.request("POST", "/api/login",    { username: u, password: p }),
  register: (u, p) => API.request("POST", "/api/register", { username: u, password: p }),

  listStudents:    async ()          => (await API.request("GET",    "/api/students")).students,
  createStudent:   async (name, k)   => (await API.request("POST",   "/api/students", { name, kelas: k })).student,
  updateStudent:   async (id, n, k)  =>  API.request("PUT",    `/api/students/${id}`, { name: n, kelas: k }),
  deleteStudent:   async (id)        =>  API.request("DELETE", `/api/students/${id}`),

  listViolations:   async ()           => (await API.request("GET",    "/api/violations")).violations,
  createViolation:  async (sid, j, p)  => (await API.request("POST",   "/api/violations", { studentId: sid, jenis: j, poin: p })).violation,
  deleteViolation:  async (id)         =>  API.request("DELETE", `/api/violations/${id}`),
  approveViolation: async (id)         =>  API.request("PUT",    `/api/violations/${id}/approve`),

  listSanctions:  async ()        => (await API.request("GET",    "/api/sanctions")).sanctions,
  createSanction: async (payload) => (await API.request("POST",   "/api/sanctions", payload)).sanction,
  updateSanction: async (id, pl)  =>  API.request("PUT",    `/api/sanctions/${id}`, pl),
  deleteSanction: async (id)      =>  API.request("DELETE", `/api/sanctions/${id}`),

  listRecords: async ()                       => (await API.request("GET", "/api/records")).records,
  setRecord:   async (sanctionId, studentId, status) =>
    API.request("PUT", "/api/records", { sanctionId, studentId, status }),
};

// ── Cache / state ──────────────────────────────────────────────────────────

const cache = { students: [], violations: [], sanctions: [], records: [], loaded: false };

async function loadAll() {
  const [students, violations, sanctions, records] = await Promise.all([
    API.listStudents(), API.listViolations(), API.listSanctions(), API.listRecords(),
  ]);
  Object.assign(cache, { students, violations, sanctions, records, loaded: true });
}

// ── Session helpers ────────────────────────────────────────────────────────

function getSession() { return readStore(StorageKeys.session, null); }
function setSession({ username, role, studentId }) {
  writeStore(StorageKeys.session, { username, role, studentId: studentId ?? null, at: Date.now() });
}
function clearSession() { localStorage.removeItem(StorageKeys.session); }

function isTeacher()   { return getSession()?.role === Roles.teacher; }
function isAdmin()     { return getSession()?.username === "admin"; }
function isStudent()   { return getSession()?.role === Roles.student; }
function myStudentId() { return getSession()?.studentId ?? null; }

// ── Data selectors ─────────────────────────────────────────────────────────

function getStudents()   { return cache.students; }
function getViolations() { return cache.violations; }
function getSanctions()  { return cache.sanctions; }
function getRecords()    { return cache.records; }

function findStudentById(id) { return getStudents().find((s) => s.id === id) || null; }

function totalPointsForStudent(studentId) {
  return getViolations()
    .filter((v) => v.studentId === studentId && v.status === "approved")
    .reduce((sum, v) => sum + (v.poin || 0), 0);
}

function getSanctionForPoints(totalPoin) {
  return getSanctions().find((s) => totalPoin >= s.minPoin && totalPoin <= s.maxPoin) || null;
}

function getStudentSanctionRecord(sanctionId, studentId) {
  return getRecords().find((r) => r.sanctionId === sanctionId && r.studentId === studentId) || null;
}

function setStudentSanctionStatus(sanctionId, studentId, status) {
  const idx = cache.records.findIndex((r) => r.sanctionId === sanctionId && r.studentId === studentId);
  if (idx >= 0) cache.records[idx] = { ...cache.records[idx], status };
  else cache.records.push({ sanctionId, studentId, status });
}

// effective per-student status: applied > reviewed > pending
function effectiveStatusForStudent(studentId) {
  const recs = getRecords().filter((r) => r.studentId === studentId);
  if (!recs.length) return null;
  let effective = null;
  for (const r of recs) {
    if (!effective) effective = r.status;
    if (r.status === Status.applied) return Status.applied;
    if (r.status === Status.reviewed && effective !== Status.applied) effective = Status.reviewed;
  }
  return effective || Status.pending;
}

function countsByStatusForStudent(studentId) {
  const m = { [Status.pending]: 0, [Status.applied]: 0, [Status.reviewed]: 0 };
  for (const r of getRecords().filter((r) => r.studentId === studentId)) {
    if (m[r.status] != null) m[r.status]++;
  }
  return m;
}

// ── DOM helpers ────────────────────────────────────────────────────────────

function $(sel) { return document.querySelector(sel); }

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class")                             e.className = v;
    else if (k === "html")                         e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else                                           e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

/** Escape a value before placing it inside innerHTML to prevent XSS. */
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(ts) {
  const d  = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function pill(text, kind)  { return el("span", { class: `pill ${kind || ""}` }, [text]); }

function levelPill(tingkat) {
  const t = (tingkat || "").toLowerCase();
  if (t.includes("berat"))  return pill(tingkat, "red");
  if (t.includes("sedang")) return pill(tingkat, "orange");
  return pill(tingkat, "yellow");
}

function statusPill(status) {
  if (status === Status.applied)  return pill("Diterapkan", "green");
  if (status === Status.reviewed) return pill("Ditinjau",   "grey");
  return pill("Menunggu", "blue");
}

function setActiveTab(route) {
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route)
  );
}

function showError(node, msg) {
  node.textContent = msg;
  node.classList.toggle("hidden", !msg);
}

// ── Toast notifications ────────────────────────────────────────────────────

const Toast = {
  _container: null,
  _getContainer() {
    if (!this._container) {
      this._container = el("div", { id: "toastContainer" });
      document.body.appendChild(this._container);
    }
    return this._container;
  },
  show(msg, kind = "ok", duration = 3200) {
    const t = el("div", { class: `toast toast-${kind}` }, [msg]);
    this._getContainer().appendChild(t);
    // Double rAF ensures the element is painted before the transition fires.
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 350);
    }, duration);
  },
  ok:   (msg) => Toast.show(msg, "ok"),
  err:  (msg) => Toast.show(msg, "err"),
  info: (msg) => Toast.show(msg, "info"),
};

// ── Loading overlay ────────────────────────────────────────────────────────

const Loader = {
  _el: null,
  show() {
    if (this._el) return;
    this._el = el("div", { id: "loaderOverlay" }, [el("div", { class: "spinner" })]);
    document.body.appendChild(this._el);
  },
  hide() {
    this._el?.remove();
    this._el = null;
  },
};

// ── Generic modal builder ──────────────────────────────────────────────────

/**
 * Renders a centered modal overlay with a title, arbitrary field elements,
 * an inline error area, and Save / Cancel buttons.
 *
 * @param {string}        title   - Heading shown at the top of the modal.
 * @param {HTMLElement[]} fields  - Field elements to place inside the form area.
 * @param {function}      onSave  - Async callback invoked on Save. Throw to surface an inline error.
 */
function openModal(title, fields, onSave) {
  const errDiv    = el("div", { class: "alert hidden" });
  const saveBtn   = el("button", { class: "btn ok",  type: "button" }, ["Simpan"]);
  const cancelBtn = el("button", { class: "btn",     type: "button" }, ["Batal"]);

  const modal = el("div", { class: "modal" }, [
    el("div", { class: "modal-title" }, [title]),
    ...fields,
    errDiv,
    el("div", { class: "row", style: "margin-top:14px" }, [saveBtn, cancelBtn]),
  ]);

  const overlay = el("div", {
    class: "modal-overlay",
    onclick: (e) => { if (e.target === overlay) overlay.remove(); },
  }, [modal]);

  saveBtn.addEventListener("click", async () => {
    showError(errDiv, "");
    saveBtn.disabled = true;
    try {
      await onSave();
      overlay.remove();
    } catch (err) {
      showError(errDiv, err.message || "Gagal menyimpan");
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
  return overlay;
}

// ── Sanction modal ─────────────────────────────────────────────────────────

function openSanctionModal(existing) {
  const tingkatInput    = el("input", { value: existing?.tingkat    || "", placeholder: "Contoh: Ringan / Sedang / Berat" });
  const keteranganInput = el("input", { value: existing?.keterangan || "", placeholder: "Keterangan sanksi" });
  const minInput        = el("input", { type: "number", value: existing?.minPoin ?? "", placeholder: "0",   min: "0" });
  const maxInput        = el("input", { type: "number", value: existing?.maxPoin ?? "", placeholder: "999", min: "0" });

  const fields = [
    el("div", { class: "field" }, [el("span", {}, ["Tingkat"]),     tingkatInput]),
    el("div", { class: "field" }, [el("span", {}, ["Keterangan"]),  keteranganInput]),
    el("div", { class: "row" },   [
      el("div", { class: "field", style: "flex:1" }, [el("span", {}, ["Min Poin"]), minInput]),
      el("div", { class: "field", style: "flex:1" }, [el("span", {}, ["Max Poin"]), maxInput]),
    ]),
  ];

  openModal(
    existing ? "Edit Sanksi" : "Tambah Sanksi",
    fields,
    async () => {
      const tingkat    = tingkatInput.value.trim();
      const keterangan = keteranganInput.value.trim();
      const minPoin    = Number(minInput.value);
      const maxPoin    = Number(maxInput.value);

      if (!tingkat || !keterangan)                           throw new Error("Semua field wajib diisi");
      if (!Number.isFinite(minPoin) || !Number.isFinite(maxPoin)) throw new Error("Poin harus berupa angka");
      if (minPoin < 0 || maxPoin < 0)                        throw new Error("Poin tidak boleh negatif");
      if (minPoin > maxPoin)                                 throw new Error("Min poin tidak boleh lebih besar dari Max poin");

      if (existing) {
        await API.updateSanction(existing.id, { tingkat, keterangan, minPoin, maxPoin });
        Toast.ok("Sanksi berhasil diperbarui");
      } else {
        await API.createSanction({ tingkat, keterangan, minPoin, maxPoin });
        Toast.ok("Sanksi berhasil ditambahkan");
      }
      await loadAll();
      rerender();
    }
  );

  setTimeout(() => tingkatInput.focus(), 50);
}

// ── Student edit modal ─────────────────────────────────────────────────────

function openStudentModal(existing) {
  const nameInput  = el("input", { value: existing?.name  || "", placeholder: "Nama murid" });
  const kelasInput = el("input", { value: existing?.kelas || "", placeholder: "Kelas" });

  const fields = [
    el("div", { class: "field" }, [el("span", {}, ["Nama"]),  nameInput]),
    el("div", { class: "field" }, [el("span", {}, ["Kelas"]), kelasInput]),
  ];

  openModal(
    "Edit Murid",
    fields,
    async () => {
      const name  = nameInput.value.trim();
      const kelas = kelasInput.value.trim();
      if (!name || !kelas) throw new Error("Nama dan kelas wajib diisi");
      await API.updateStudent(existing.id, name, kelas);
      await loadAll();
      rerender();
      Toast.ok("Data murid berhasil diperbarui");
    }
  );

  setTimeout(() => nameInput.focus(), 50);
}

// ── Dashboard renderers ────────────────────────────────────────────────────

function renderDashboard() {
  const students   = getStudents();
  const violations = getViolations();
  const totalPoin  = students.reduce((sum, s) => sum + totalPointsForStudent(s.id), 0);

  const topStudent = students.reduce((best, s) =>
    (!best || totalPointsForStudent(s.id) >= totalPointsForStudent(best.id)) ? s : best
  , null);

  const effectiveByStudent = new Map();
  for (const r of getRecords()) {
    const curr = effectiveByStudent.get(r.studentId);
    if (!curr) { effectiveByStudent.set(r.studentId, r.status); continue; }
    if (curr === Status.pending  && r.status !== Status.pending)  effectiveByStudent.set(r.studentId, r.status);
    if (curr === Status.reviewed && r.status === Status.applied)  effectiveByStudent.set(r.studentId, r.status);
  }
  let countPending = 0, countApplied = 0, countReviewed = 0;
  for (const st of effectiveByStudent.values()) {
    if (st === Status.pending)  countPending++;
    if (st === Status.applied)  countApplied++;
    if (st === Status.reviewed) countReviewed++;
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
      pill(`Menunggu: ${countPending}`,    "blue"),
      pill(`Diterapkan: ${countApplied}`,  "green"),
      pill(`Ditinjau: ${countReviewed}`,   "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "section-label" }, ["Siswa dengan Poin Terbanyak"]),
    topStudent
      ? el("div", { class: "kpi" }, [
          el("div", { class: "row" }, [
            el("div", {}, [
              el("div", { class: "fw9 f16" }, [topStudent.name]),
              el("div", { class: "muted" }, [`Kelas: ${topStudent.kelas} • Poin: ${totalPointsForStudent(topStudent.id)}`]),
            ]),
            el("div", { class: "spacer" }),
            effectiveStatusForStudent(topStudent.id)
              ? statusPill(effectiveStatusForStudent(topStudent.id))
              : el("span", { class: "muted" }, ["-"]),
          ]),
        ])
      : el("div", { class: "muted" }, ["Belum ada data"]),
    el("div", { class: "hr" }),
    el("div", { class: "section-label" }, ["Riwayat Terakhir"]),
    violations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
          el("tbody", {}, violations.slice(0, 6).map((v) => {
            const s = findStudentById(v.studentId) || { name: "(–)", kelas: "-" };
            return el("tr", {}, [el("td", {}, [s.name]), el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])]);
          })),
        ]),
  ]);
}

function renderDashboardStudent() {
  const sid          = myStudentId();
  const me           = sid ? findStudentById(sid) : null;
  const violations   = getViolations();
  const myViolations = sid ? violations.filter((v) => v.studentId === sid) : [];
  const myPoints     = sid ? totalPointsForStudent(sid) : 0;
  const sanction     = getSanctionForPoints(myPoints);
  const eff          = sid ? effectiveStatusForStudent(sid) : null;

  return el("div", {}, [
    el("div", { class: "grid3" }, [
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Nama"]),          el("div", { class: "value" }, [me?.name || "(akun belum terhubung)"])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Catatan"]), el("div", { class: "value" }, [String(myViolations.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Poin"]),    el("div", { class: "value" }, [String(myPoints)])]),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", { class: "fw9" }, ["Sanksi saat ini"]),
      el("div", { class: "spacer" }),
      sanction ? levelPill(sanction.tingkat) : pill("-", "grey"),
      eff ? statusPill(eff) : pill("-", "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "section-label" }, ["Riwayat Terakhir"]),
    myViolations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
          el("tbody", {}, myViolations.slice(0, 10).map((v) =>
            el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])])
          )),
        ]),
  ]);
}

// ── Murid renderer ─────────────────────────────────────────────────────────

/** Builds a single <tr> for a student. Shared by initial render and search filter. */
function buildStudentRow(s) {
  const pts      = totalPointsForStudent(s.id);
  const sanction = getSanctionForPoints(pts);
  const counts   = countsByStatusForStudent(s.id);
  const status   = effectiveStatusForStudent(s.id);

  const editBtn = isAdmin() ? el("button", {
    class: "btn sm", type: "button",
    onclick: () => openStudentModal(s),
  }, ["Ubah"]) : null;

  const delBtn = isAdmin() ? el("button", {
    class: "btn sm danger", type: "button",
    onclick: async () => {
      if (!confirm(`Hapus murid "${s.name}"?`)) return;
      try {
        await API.deleteStudent(s.id);
        await loadAll();
        rerender();
        Toast.ok(`Murid "${s.name}" berhasil dihapus`);
      } catch (err) {
        Toast.err(err.message || "Gagal menghapus murid");
      }
    },
  }, ["Hapus"]) : null;

  const statusBadges = el("div", { class: "row" }, [
    counts.pending  ? pill(`P:${counts.pending}`,  "blue")  : null,
    counts.applied  ? pill(`A:${counts.applied}`,  "green") : null,
    counts.reviewed ? pill(`R:${counts.reviewed}`, "grey")  : null,
  ]);

  return el("tr", {}, [
    el("td", {}, [el("div", { class: "fw9" }, [s.name]), el("div", { class: "muted" }, [`ID: ${s.id}`])]),
    el("td", {}, [s.kelas]),
    el("td", {}, [String(pts)]),
    el("td", {}, [sanction ? levelPill(sanction.tingkat) : pill("-", "grey")]),
    el("td", {}, [status ? statusPill(status) : pill("-", "grey"), el("div", { style: "margin-top:6px" }, [statusBadges])]),
    el("td", {}, [editBtn, delBtn].filter(Boolean)),
  ]);
}

function renderMurid() {
  if (!isTeacher()) return el("div", { class: "muted" }, ["Akses ditolak. Halaman ini hanya untuk guru."]);

  const students    = getStudents();
  const searchInput = el("input", { id: "searchNameInput", placeholder: "Cari nama…", style: "width:220px" });

  const header = el("div", { class: "row" }, [
    el("div", { class: "fw9" }, ["Daftar Murid"]),
    el("div", { class: "spacer" }),
    searchInput,
  ]);

  let formRow = null;
  if (isAdmin()) {
    const nameInput  = el("input", { id: "studentNameInput",  placeholder: "Nama murid" });
    const kelasInput = el("input", { id: "studentKelasInput", placeholder: "Kelas" });

    formRow = el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [nameInput]),
      el("div", { style: "flex:1; min-width:160px" }, [kelasInput]),
      el("button", { class: "btn ok", type: "button", onclick: async () => {
        const name  = nameInput.value.trim();
        const kelas = kelasInput.value.trim();
        if (!name || !kelas) { Toast.err("Nama dan kelas wajib diisi"); return; }
        try {
          await API.createStudent(name, kelas);
          await loadAll();
          nameInput.value  = "";
          kelasInput.value = "";
          rerender();
          Toast.ok(`Murid "${name}" berhasil ditambahkan`);
        } catch (err) {
          Toast.err(err.message || "Gagal menambahkan murid");
        }
      }}, ["Tambah"]),
      el("button", { class: "btn", type: "button", onclick: () => {
        nameInput.value = ""; kelasInput.value = "";
      }}, ["Bersihkan"]),
    ]);
  }

  function buildTable(list) {
    return list.length
      ? el("table", {}, [
          el("thead", {}, [el("tr", {}, [
            el("th", {}, ["Nama"]), el("th", {}, ["Kelas"]), el("th", {}, ["Poin"]),
            el("th", {}, ["Sanksi"]), el("th", {}, ["Status"]), el("th", {}, ["Aksi"]),
          ])]),
          el("tbody", {}, list.map(buildStudentRow)),
        ])
      : el("div", { class: "muted", style: "margin-top:10px" }, ["Tidak ada data yang cocok"]);
  }

  let table = buildTable(students);

  searchInput.addEventListener("input", () => {
    if (window.__muridSearchRaf) cancelAnimationFrame(window.__muridSearchRaf);
    window.__muridSearchRaf = requestAnimationFrame(() => {
      const q        = searchInput.value.trim().toLowerCase();
      const filtered = q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
      const newTable = buildTable(filtered);
      table.replaceWith(newTable);
      table = newTable;
    });
  });

  return el("div", {}, [header, formRow, el("div", { class: "hr" }), table]);
}

// ── Catatan renderer ───────────────────────────────────────────────────────

function renderCatatan() {
  const students   = getStudents();
  const violations = getViolations();

  if (isStudent()) {
    const sid          = myStudentId();
    const myViolations = sid ? violations.filter((v) => v.studentId === sid) : [];
    return el("div", {}, [
      el("div", { class: "muted" }, ["Kamu hanya dapat melihat riwayat pelanggaran milikmu."]),
      el("div", { class: "hr" }),
      myViolations.length === 0
        ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
        : el("table", {}, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
            el("tbody", {}, myViolations.map((v) =>
              el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])])
            )),
          ]),
    ]);
  }

  const studentSel = el("select", {});
  studentSel.appendChild(el("option", { value: "" }, ["Pilih murid"]));
  for (const s of students) studentSel.appendChild(el("option", { value: String(s.id) }, [s.name]));

  const jenisSel = el("select", {});
  jenisSel.appendChild(el("option", { value: "" }, ["Pilih jenis pelanggaran"]));
  for (const j of JenisPelanggaran) jenisSel.appendChild(el("option", { value: j.key }, [`${j.label} (${j.poin} poin)`]));

  const poinInput = el("input", { value: "–", readonly: "readonly" });
  jenisSel.addEventListener("change", () => {
    const j = JenisPelanggaran.find((x) => x.key === jenisSel.value);
    poinInput.value = j ? String(j.poin) : "–";
  });

  const addBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    const sid   = Number(studentSel.value || 0);
    const jenis = JenisPelanggaran.find((x) => x.key === jenisSel.value);
    if (!sid || !jenis) { Toast.err("Lengkapi pilihan murid dan jenis pelanggaran"); return; }
    try {
      await API.createViolation(sid, jenis.label, jenis.poin);
      await loadAll();
      studentSel.value = "";
      jenisSel.value   = "";
      poinInput.value  = "–";
      rerender();
      Toast.ok("Catatan pelanggaran berhasil ditambahkan");
    } catch (err) {
      Toast.err(err.message || "Gagal menambahkan catatan");
    }
  }}, ["Tambah Catatan"]);

  const clearBtn = el("button", { class: "btn", type: "button", onclick: () => {
    studentSel.value = ""; jenisSel.value = ""; poinInput.value = "–";
  }}, ["Bersihkan"]);

  const printBtn = el("button", { class: "btn", type: "button",
    onclick: () => triggerPrint(violations),
  }, ["Print PDF"]);

  const form = el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [studentSel]),
      el("div", { style: "flex:1; min-width:260px" }, [jenisSel]),
      el("div", { style: "width:110px" },             [poinInput]),
    ]),
    el("div", { class: "row", style: "margin-top:10px" }, [addBtn, clearBtn]),
  ]);

  const table = violations.length === 0
    ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
    : el("table", {}, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]),
          el("th", {}, ["Tanggal"]), el("th", {}, ["Status"]), el("th", {}, ["Aksi"]),
        ])]),
        el("tbody", {}, violations.map((v) => {
          const s = findStudentById(v.studentId) || { name: "(–)" };

          const delBtn = el("button", { class: "btn sm danger", type: "button", onclick: async () => {
            if (!confirm("Hapus catatan ini?")) return;
            try {
              await API.deleteViolation(v.id);
              await loadAll();
              rerender();
              Toast.ok("Catatan berhasil dihapus");
            } catch (err) {
              Toast.err(err.message || "Gagal menghapus catatan");
            }
          }}, ["Hapus"]);

          const approveBtn = v.status === "pending" && isAdmin()
            ? el("button", { class: "btn sm primary", type: "button", onclick: async () => {
                try {
                  await API.approveViolation(v.id);
                  await loadAll();
                  rerender();
                  Toast.ok("Catatan berhasil disetujui");
                } catch (err) {
                  Toast.err(err.message || "Gagal menyetujui");
                }
              }}, ["Setujui"])
            : null;

          return el("tr", {}, [
            el("td", {}, [s.name]),
            el("td", {}, [v.jenis]),
            el("td", {}, [String(v.poin)]),
            el("td", {}, [fmtDate(v.tanggal)]),
            el("td", {}, [v.status === "approved" ? pill("Disetujui", "green") : pill("Menunggu", "blue")]),
            el("td", {}, [delBtn, approveBtn].filter(Boolean)),
          ]);
        })),
      ]);

  return el("div", {}, [
    el("div", { class: "row", style: "margin-bottom:10px" }, [
      el("div", { class: "fw9" }, ["Tambah Catatan Pelanggaran"]),
      el("div", { class: "spacer" }),
      printBtn,
    ]),
    form,
    el("div", { class: "hr" }),
    el("div", { class: "section-label" }, ["Riwayat Pelanggaran"]),
    table,
  ]);
}

/**
 * Opens a print-preview modal, then calls window.print().
 * All user-supplied values are sanitised with escHtml() before insertion.
 */
function triggerPrint(violations) {
  const sess       = getSession();
  const headerInfo = escHtml(sess?.username ? `User: ${sess.username}` : "");

  const rowsHtml = violations.map((v) => {
    const s          = findStudentById(v.studentId) || { name: "(–)", kelas: "-" };
    const statusText = v.status === "approved" ? "Disetujui" : "Menunggu";
    return `<tr>
      <td>${escHtml(s.name)}</td>
      <td>${escHtml(s.kelas)}</td>
      <td>${escHtml(v.jenis)}</td>
      <td style="text-align:right">${escHtml(String(v.poin))}</td>
      <td>${escHtml(fmtDate(v.tanggal))}</td>
      <td>${escHtml(statusText)}</td>
    </tr>`;
  }).join("");

  const existing = $("#__printModal");
  if (existing) existing.remove();

  const printWrap = document.createElement("div");
  printWrap.id = "__printModal";
  // Only static/escaped strings are interpolated here — no raw user data.
  printWrap.innerHTML = `
    <style>
      @media print {
        body * { visibility: hidden !important; }
        #__printModal, #__printModal * { visibility: visible !important; }
        #__printModal { position: static !important; inset: auto !important; width: 100% !important;
                        background: #fff !important; box-shadow: none !important; }
      }
    </style>
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px">
      <div style="background:#fff;color:#111;width:min(900px,100%);border-radius:12px;overflow:auto;padding:20px;max-height:90vh">
        <h2 style="margin:0 0 6px;font-size:16px">Riwayat Pelanggaran</h2>
        <div style="color:#475569;font-size:12px;margin-bottom:12px">${headerInfo}</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left">Nama</th>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left">Kelas</th>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left">Pelanggaran</th>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:right">Poin</th>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left">Tanggal</th>
              <th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;text-align:left">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6" style="border:1px solid #e2e8f0;padding:8px">Belum ada catatan</td></tr>`}
          </tbody>
        </table>
        <p style="margin-top:10px;color:#475569;font-size:12px">Gunakan dialog Print browser untuk menyimpan sebagai PDF.</p>
        <button onclick="document.getElementById('__printModal').remove()"
          style="margin-top:8px;padding:8px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer">
          Tutup
        </button>
      </div>
    </div>`;

  document.body.appendChild(printWrap);
  const cleanup = () => { $("#__printModal")?.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// ── Sanksi renderer ────────────────────────────────────────────────────────

function renderSanksi() {
  const sanctions = getSanctions();
  const students  = getStudents();

  if (isStudent()) {
    const sid = myStudentId();
    const me  = sid ? findStudentById(sid) : null;
    const pts = sid ? totalPointsForStudent(sid) : 0;

    return el("div", {}, [
      el("div", { class: "muted" }, [`Menampilkan status sanksi untuk ${me?.name || "akunmu"}.`]),
      el("div", { class: "hr" }),
      el("div", { class: "kpi" }, [
        el("div", { class: "row" }, [
          el("div", { class: "fw9" }, ["Poin saat ini"]),
          el("div", { class: "spacer" }),
          pill(String(pts), "blue"),
        ]),
      ]),
      el("div", { class: "hr" }),
      sanctions.length === 0
        ? el("div", { class: "muted" }, ["Belum ada sanksi"])
        : el("div", {}, sanctions.map((s) => {
            const inRange = pts >= s.minPoin && pts <= s.maxPoin;
            const rec     = sid ? getStudentSanctionRecord(s.id, sid) : null;
            const current = rec?.status || Status.pending;
            return el("div", {
              class: `kpi sanction-card${inRange ? " sanction-active" : ""}`,
              style: "margin-bottom:12px",
            }, [
              el("div", { class: "row" }, [
                el("div", { class: inRange ? "fw9" : "fw9 dim" }, [s.tingkat]),
                el("div", { class: "spacer" }),
                levelPill(s.tingkat),
                statusPill(current),
              ]),
              el("div", { class: "muted", style: "margin-top:6px" },
                [`Poin: ${s.minPoin} – ${s.maxPoin} • ${s.keterangan}`]),
            ]);
          })),
    ]);
  }

  const addBtn = isAdmin()
    ? el("button", { class: "btn ok", type: "button", onclick: () => openSanctionModal(null) }, ["Tambah Sanksi"])
    : null;

  const list = el("div", {}, sanctions.map((s) => {
    const matched = students.filter((st) => {
      const pts = totalPointsForStudent(st.id);
      return pts >= s.minPoin && pts <= s.maxPoin;
    });

    const editBtn = isAdmin()
      ? el("button", { class: "btn sm",      type: "button", onclick: () => openSanctionModal(s) }, ["Ubah"])
      : null;

    const delBtn = isAdmin()
      ? el("button", { class: "btn sm danger", type: "button", onclick: async () => {
          if (!confirm(`Hapus sanksi "${s.tingkat}"?`)) return;
          try {
            await API.deleteSanction(s.id);
            await loadAll();
            rerender();
            Toast.ok(`Sanksi "${s.tingkat}" berhasil dihapus`);
          } catch (err) {
            Toast.err(err.message || "Gagal menghapus sanksi");
          }
        }}, ["Hapus"])
      : null;

    const studentsTable = matched.length === 0
      ? el("div", { class: "muted", style: "margin-top:10px" }, ["– Tidak ada murid pada rentang ini –"])
      : el("table", { style: "margin-top:10px" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", {}, ["Murid"]), el("th", {}, ["Kelas"]), el("th", {}, ["Poin"]),
            el("th", {}, ["Status"]), el("th", {}, ["Ubah Status"]),
          ])]),
          el("tbody", {}, matched.map((st) => {
            const pts     = totalPointsForStudent(st.id);
            const rec     = getStudentSanctionRecord(s.id, st.id);
            const current = rec?.status || Status.pending;

            const sel = el("select", {});
            [Status.pending, Status.applied, Status.reviewed].forEach((v) =>
              sel.appendChild(el("option", { value: v, ...(v === current ? { selected: "selected" } : {}) }, [v]))
            );

            if (isAdmin()) {
              sel.addEventListener("change", async () => {
                const next = sel.value;
                try {
                  await API.setRecord(s.id, st.id, next);
                  setStudentSanctionStatus(s.id, st.id, next);
                  Toast.ok("Status sanksi diperbarui");
                } catch (err) {
                  Toast.err(err.message || "Gagal memperbarui status");
                  sel.value = current; // revert on failure
                }
              });
            } else {
              sel.setAttribute("disabled", "disabled");
            }

            return el("tr", {}, [
              el("td", {}, [st.name]), el("td", {}, [st.kelas]), el("td", {}, [String(pts)]),
              el("td", {}, [statusPill(current)]), el("td", {}, [sel]),
            ]);
          })),
        ]);

    return el("div", { class: "kpi sanction-card", style: "margin-bottom:14px" }, [
      el("div", { class: "row" }, [
        el("div", { class: "fw9 f16" }, [s.tingkat]),
        el("div", { class: "spacer" }),
        levelPill(s.tingkat),
      ]),
      el("div", { class: "muted", style: "margin-top:6px" },
        [`Poin: ${s.minPoin} – ${s.maxPoin} • ${s.keterangan}`]),
      ...(editBtn || delBtn
        ? [el("div", { class: "row", style: "margin-top:10px" }, [editBtn, delBtn].filter(Boolean))]
        : []),
      el("div", { class: "hr" }),
      el("div", { class: "fw9", style: "margin-bottom:6px" }, ["Murid terpengaruh"]),
      studentsTable,
    ]);
  }));

  return el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { class: "fw9" }, ["Kelola Sanksi"]),
      el("div", { class: "spacer" }),
      ...(addBtn ? [addBtn] : []),
    ]),
    el("div", { class: "hr" }),
    sanctions.length ? list : el("div", { class: "muted" }, ["Belum ada sanksi"]),
  ]);
}

// ── Routing ────────────────────────────────────────────────────────────────

function getRoute() {
  const h       = (location.hash || "#dashboard").replace("#", "").trim();
  const allowed = isTeacher()
    ? new Set(["dashboard", "murid", "catatan", "sanksi"])
    : new Set(["dashboard", "catatan", "sanksi"]);
  return allowed.has(h) ? h : "dashboard";
}

function renderRoute(route) {
  const title = $("#routeTitle");
  const body  = $("#routeBody");
  body.innerHTML = "";
  if      (route === "dashboard") { title.textContent = "Dashboard";          body.appendChild(isStudent() ? renderDashboardStudent() : renderDashboard()); }
  else if (route === "murid")     { title.textContent = "Data Murid";         body.appendChild(renderMurid()); }
  else if (route === "catatan")   { title.textContent = "Catatan & Laporan";  body.appendChild(renderCatatan()); }
  else if (route === "sanksi")    { title.textContent = "Sanksi & Pembinaan"; body.appendChild(renderSanksi()); }
}

function rerender() {
  if (!getSession()) return;
  const route = getRoute();
  setActiveTab(route);
  renderRoute(route);
}

// ── Auth UI ────────────────────────────────────────────────────────────────

function setAuthVisible(isLoggedIn) {
  $("#authView").classList.toggle("hidden",  isLoggedIn);
  $("#appView").classList.toggle("hidden",  !isLoggedIn);
  $("#btnLogout").classList.toggle("hidden", !isLoggedIn);
  $("#sessionUser").classList.toggle("hidden", !isLoggedIn);
}

function refreshSessionBadge() {
  const s = getSession();
  $("#sessionUser").textContent = s ? `${s.username} • ${s.role || "-"}` : "";
}

function applyRoleTabs() {
  const sess = getSession();
  document.querySelectorAll(".tab").forEach((t) => {
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
  $("#toLogin").addEventListener("click",    showLogin);

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    showError(loginErr, "");
    API.login(loginU.value, loginP.value)
      .then(async (data) => {
        setSession({ username: data.username, role: data.role, studentId: data.studentId });
        loginP.value = "";
        location.hash = "#dashboard";
        setAuthVisible(true);
        refreshSessionBadge();
        applyRoleTabs();
        Loader.show();
        await loadAll();
        Loader.hide();
        rerender();
        Toast.ok(`Selamat datang, ${data.username}!`);
      })
      .catch((err) => showError(loginErr, err.message || "Username atau password salah"));
  });

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(regErr, "");
    if (regC.value !== regP.value) { showError(regErr, "Konfirmasi password tidak sama"); return; }
    API.register(regU.value, regP.value)
      .then(() => {
        Toast.ok("Pendaftaran berhasil, silakan masuk");
        regP.value = ""; regC.value = "";
        showLogin();
      })
      .catch((err) => showError(regErr, err.message || "Pendaftaran gagal"));
  });

  $("#btnLogout").addEventListener("click", () => {
    clearSession();
    setAuthVisible(false);
    refreshSessionBadge();
    applyRoleTabs();
    Toast.info("Anda telah keluar");
  });
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => { location.hash = `#${b.dataset.route}`; })
  );
  window.addEventListener("hashchange", rerender);
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function main() {
  initAuthUI();
  initTabs();

  const session = getSession();
  setAuthVisible(!!session);
  refreshSessionBadge();
  applyRoleTabs();

  if (session) {
    Loader.show();
    try {
      await loadAll();
      rerender();
    } catch {
      Toast.err("Server belum jalan. Jalankan: npm run dev di folder server/");
      clearSession();
      setAuthVisible(false);
      refreshSessionBadge();
      applyRoleTabs();
    } finally {
      Loader.hide();
    }
  }
}

document.addEventListener("DOMContentLoaded", main);
