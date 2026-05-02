/* eslint-disable no-alert */
// Single-file SPA (no build step). Data model follows the Flutter version.

const StorageKeys = {
  // session tetap disimpan di browser (simple)
  session: "sp_session_v1",
};

const Roles = {
  teacher: "teacher",
  student: "student",
};

const Status = {
  pending: "pending",
  applied: "applied",
  reviewed: "reviewed",
};

const JenisPelanggaran = [
  { key: "membuangSampahSembarangan", label: "Membuang Sampah Sembarangan", poin: 2 },
  { key: "tidakMembawaBuku", label: "Tidak Membawa Buku", poin: 5 },
  { key: "tidakMemakaiSeragamLengkap", label: "Tidak Memakai Seragam Lengkap", poin: 5 },
  { key: "tidakIkutUpacara", label: "Tidak Ikut Upacara", poin: 10 },
  { key: "terlambatMasuk", label: "Terlambat Masuk", poin: 10 },
  { key: "keluarLingkunganSekolah", label: "Keluar Lingkungan Sekolah", poin: 10 },
  { key: "membolosTanpaAlasan", label: "Membolos Tanpa Alasan", poin: 15 },
  { key: "merokok", label: "Merokok", poin: 20 },
  { key: "membawaSenjataTajam", label: "Membawa Senjata Tajam", poin: 20 },
  { key: "berkelahiDenganSiswaLain", label: "Berkelahi Dengan Siswa Lain", poin: 25 },
  { key: "merusakFasilitasSekolah", label: "Merusak Fasilitas Sekolah", poin: 25 },
  { key: "mengonsumsiNarkotika", label: "Mengonsumsi Narkotika", poin: 30 },
  { key: "melakukanTindakanAsusila", label: "Melakukan Tindakan Asusila", poin: 30 },
];

function nowId() {
  return Date.now();
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readStore(key, fallback) {
  return safeJsonParse(localStorage.getItem(key), fallback);
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

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
      err.details = data?.details;
      throw err;
    }
    return data;
  },
  // auth
  login: (username, password) => API.request("POST", "/api/login", { username, password }),
  register: (username, password) => API.request("POST", "/api/register", { username, password }),
  // data
  listStudents: async () => (await API.request("GET", "/api/students")).students,
  createStudent: async (name, kelas) => (await API.request("POST", "/api/students", { name, kelas })).student,
  deleteStudent: async (id) => API.request("DELETE", `/api/students/${id}`),

  listViolations: async () => (await API.request("GET", "/api/violations")).violations,
  createViolation: async (studentId, jenis, poin) => (await API.request("POST", "/api/violations", { studentId, jenis, poin })).violation,
  deleteViolation: async (id) => API.request("DELETE", `/api/violations/${id}`),
  approveViolation: async (id) => API.request("PUT", `/api/violations/${id}/approve`),

  listSanctions: async () => (await API.request("GET", "/api/sanctions")).sanctions,
  createSanction: async (payload) => (await API.request("POST", "/api/sanctions", payload)).sanction,
  updateSanction: async (id, payload) => API.request("PUT", `/api/sanctions/${id}`, payload),
  deleteSanction: async (id) => API.request("DELETE", `/api/sanctions/${id}`),

  listRecords: async () => (await API.request("GET", "/api/records")).records,
  setRecord: async (sanctionId, studentId, status) => API.request("PUT", "/api/records", { sanctionId, studentId, status }),
};

const cache = {
  students: [],
  violations: [],
  sanctions: [],
  records: [],
  loaded: false,
};

async function loadAll() {
  const [students, violations, sanctions, records] = await Promise.all([
    API.listStudents(),
    API.listViolations(),
    API.listSanctions(),
    API.listRecords(),
  ]);
  cache.students = students;
  cache.violations = violations;
  cache.sanctions = sanctions;
  cache.records = records;
  cache.loaded = true;
}

// -------------------- state + selectors --------------------
function getSession() {
  return readStore(StorageKeys.session, null);
}

function setSession({ username, role, studentId }) {
  writeStore(StorageKeys.session, { username, role, studentId: studentId ?? null, at: Date.now() });
}

function clearSession() {
  localStorage.removeItem(StorageKeys.session);
}

function isTeacher() {
  return getSession()?.role === Roles.teacher;
}
function isAdmin() {
  return getSession()?.username === "admin";
}
function isStudent() {
  return getSession()?.role === Roles.student;
}
function myStudentId() {
  return getSession()?.studentId ?? null;
}

function getStudents() {
  return cache.students;
}
function getViolations() {
  return cache.violations;
}
function getSanctions() {
  return cache.sanctions;
}
function getRecords() {
  return cache.records;
}

function totalPointsForStudent(studentId) {
  const violations = getViolations();
  return violations.filter((v) => v.studentId === studentId && v.status === "approved").reduce((a, b) => a + (b.poin || 0), 0);
}

function findStudentById(id) {
  return getStudents().find((s) => s.id === id) || null;
}

function getSanctionForPoints(totalPoin) {
  const sanctions = getSanctions();
  return sanctions.find((s) => totalPoin >= s.minPoin && totalPoin <= s.maxPoin) || null;
}

function getStudentSanctionRecord(sanctionId, studentId) {
  return getRecords().find((r) => r.sanctionId === sanctionId && r.studentId === studentId) || null;
}

function setStudentSanctionStatus(sanctionId, studentId, status) {
  // in-memory update; persist done via API in UI handlers
  const records = cache.records;
  const idx = records.findIndex((r) => r.sanctionId === sanctionId && r.studentId === studentId);
  if (idx >= 0) records[idx] = { ...records[idx], status };
  else records.push({ sanctionId, studentId, status });
}

// effective per-student status: applied > reviewed > pending
function effectiveStatusForStudent(studentId) {
  const recs = getRecords().filter((r) => r.studentId === studentId);
  if (recs.length === 0) return null;
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
  const recs = getRecords().filter((r) => r.studentId === studentId);
  for (const r of recs) {
    if (m[r.status] == null) m[r.status] = 0;
    m[r.status] += 1;
  }
  return m;
}

// -------------------- DOM helpers --------------------
function $(sel) {
  return document.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, String(v));
  });
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function fmtDate(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function pill(text, kind) {
  return el("span", { class: `pill ${kind || ""}` }, [text]);
}

function levelPill(tingkat) {
  const t = (tingkat || "").toLowerCase();
  if (t.includes("berat")) return pill(tingkat, "red");
  if (t.includes("sedang")) return pill(tingkat, "orange");
  return pill(tingkat, "yellow");
}

function statusPill(status) {
  if (status === Status.applied) return pill("applied", "green");
  if (status === Status.reviewed) return pill("reviewed", "grey");
  return pill("pending", "blue");
}

function setActiveTab(route) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === route);
  });
}

function showError(node, msg) {
  node.textContent = msg;
  node.classList.toggle("hidden", !msg);
}

// -------------------- auth --------------------
function tryLogin(username, password) {
  // client-side check is replaced by server call
  return false;
}

async function registerUser(username, password) {
  // handled by server call
  return null;
}

// -------------------- routes renderers --------------------
function renderDashboard() {
  const students = getStudents();
  const violations = getViolations();
  const totalPoin = students.reduce((sum, s) => sum + totalPointsForStudent(s.id), 0);

  let topStudent = null;
  for (const s of students) {
    if (!topStudent) topStudent = s;
    else if (totalPointsForStudent(s.id) >= totalPointsForStudent(topStudent.id)) topStudent = s;
  }

  // summary status counts per student (effective)
  const effectiveByStudent = new Map();
  for (const r of getRecords()) {
    const curr = effectiveByStudent.get(r.studentId);
    if (!curr) effectiveByStudent.set(r.studentId, r.status);
    else {
      if (curr === Status.pending && r.status !== Status.pending) effectiveByStudent.set(r.studentId, r.status);
      else if (curr === Status.reviewed && r.status === Status.applied) effectiveByStudent.set(r.studentId, r.status);
    }
  }
  let countPending = 0;
  let countApplied = 0;
  let countReviewed = 0;
  for (const st of effectiveByStudent.values()) {
    if (st === Status.pending) countPending += 1;
    if (st === Status.applied) countApplied += 1;
    if (st === Status.reviewed) countReviewed += 1;
  }

  const body = el("div", {}, [
    el("div", { class: "grid3" }, [
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Murid"]), el("div", { class: "value" }, [String(students.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Catatan"]), el("div", { class: "value" }, [String(violations.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Poin"]), el("div", { class: "value" }, [String(totalPoin)])]),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", { class: "muted" }, ["Status Pelanggaran (ringkasan)"]),
      el("div", { class: "spacer" }),
      pill(`Pending: ${countPending}`, "blue"),
      pill(`Applied: ${countApplied}`, "green"),
      pill(`Reviewed: ${countReviewed}`, "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", {}, [
        el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Siswa dengan Poin Terbanyak"]),
        topStudent
          ? el("div", { class: "kpi" }, [
              el("div", { class: "row" }, [
                el("div", {}, [
                  el("div", { style: "font-weight:900; font-size:16px" }, [topStudent.name]),
                  el("div", { class: "muted" }, [`Kelas: ${topStudent.kelas} • Poin: ${totalPointsForStudent(topStudent.id)}`]),
                ]),
                el("div", { class: "spacer" }),
                effectiveStatusForStudent(topStudent.id) ? statusPill(effectiveStatusForStudent(topStudent.id)) : el("span", { class: "muted" }, ["-"]),
              ]),
            ])
          : el("div", { class: "muted" }, ["- Belum ada data -"]),
      ]),
    ]),
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Riwayat Terakhir"]),
    violations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el(
          "table",
          {},
          [
            el("thead", {}, [
              el("tr", {}, [el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])]),
            ]),
            el(
              "tbody",
              {},
              violations
                .slice(0, 6)
                .map((v) => {
                  const s = findStudentById(v.studentId) || { name: "(–)", kelas: "-" };
                  return el("tr", {}, [el("td", {}, [s.name]), el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])]);
                }),
            ),
          ],
        ),
  ]);

  return body;
}

function renderDashboardStudent() {
  const sid = myStudentId();
  const me = sid ? findStudentById(sid) : null;
  const violations = getViolations();
  const myViolations = sid ? violations.filter((v) => v.studentId === sid) : [];
  const myPoints = sid ? totalPointsForStudent(sid) : 0;
  const sanction = getSanctionForPoints(myPoints);
  const eff = sid ? effectiveStatusForStudent(sid) : null;

  return el("div", {}, [
    el("div", { class: "grid3" }, [
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Nama"]), el("div", { class: "value" }, [me?.name || "(akun murid belum dihubungkan)"])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Catatan"]), el("div", { class: "value" }, [String(myViolations.length)])]),
      el("div", { class: "kpi" }, [el("div", { class: "label" }, ["Total Poin"]), el("div", { class: "value" }, [String(myPoints)])]),
    ]),
    el("div", { class: "hr" }),
    el("div", { class: "row" }, [
      el("div", { style: "font-weight:900" }, ["Sanksi saat ini"]),
      el("div", { class: "spacer" }),
      sanction ? levelPill(sanction.tingkat) : pill("-", "grey"),
      eff ? statusPill(eff) : pill("-", "grey"),
    ]),
    el("div", { class: "hr" }),
    el("div", { style: "font-weight:900; margin-bottom:8px" }, ["Riwayat Terakhir"]),
    myViolations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
          el("tbody", {}, myViolations.slice(0, 10).map((v) => el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])]))),
        ]),
  ]);
}

function renderMurid() {
  if (!isTeacher()) return el("div", { class: "muted" }, ["Akses ditolak. Halaman ini hanya untuk guru."]);
  const students = getStudents();

  // Jika bukan admin, nurtyboard hanya bisa lihat daftar murid
  const header = el("div", { class: "row" }, [
    el("div", { style: "font-weight:900" }, ["Daftar Murid"]),
    el("div", { class: "spacer" }),
  ]);

  let formRow = null;
  if (isAdmin()) {
    const nameInput = el("input", { placeholder: "Nama murid" });
    const kelasInput = el("input", { placeholder: "Kelas" });

    const addBtn = el(
      "button",
      {
        class: "btn ok",
        type: "button",
        onclick: async () => {
          const name = nameInput.value.trim();
          const kelas = kelasInput.value.trim();
          if (!name || !kelas) return;
          await API.createStudent(name, kelas);
          await loadAll();
          nameInput.value = "";
          kelasInput.value = "";
          rerender();
        },
      },
      ["Tambah"]
    );

formRow = el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [nameInput]),
      el("div", { style: "flex:1; min-width:160px" }, [kelasInput]),
      addBtn,
    ]);
  }

  // Student list table (for both admin and teacher)
  const table = students.length
    ? el("table", {}, [
        el("thead", {}, [
          el("tr", {}, [el("th", {}, ["Nama"]), el("th", {}, ["Kelas"]), el("th", {}, ["Poin"]), el("th", {}, ["Sanksi"]), el("th", {}, ["Status"]), el("th", {}, ["Aksi"])]),
        ]),
        el(
          "tbody",
          {},
          students.map((s) => {
            const pts = totalPointsForStudent(s.id);
            const sanction = getSanctionForPoints(pts);
            const counts = countsByStatusForStudent(s.id);
            const status = effectiveStatusForStudent(s.id);
            const del = el(
              "button",
              {
                class: "btn sm danger",
                type: "button",
                onclick: async () => {
                  if (!confirm(`Hapus murid "${s.name}"?`)) return;
                  await API.deleteStudent(s.id);
                  await loadAll();
                  rerender();
                },
              },
              ["Hapus"]
            );
            const statusBadges = el("div", { class: "row" }, [
              counts.pending ? pill(`P:${counts.pending}`, "blue") : null,
              counts.applied ? pill(`A:${counts.applied}`, "green") : null,
              counts.reviewed ? pill(`R:${counts.reviewed}`, "grey") : null,
            ]);
            return el("tr", {}, [
              el("td", {}, [el("div", { style: "font-weight:900" }, [s.name]), el("div", { class: "muted" }, [`ID: ${s.id}`])]),
              el("td", {}, [s.kelas]),
              el("td", {}, [String(pts)]),
              el("td", {}, [sanction ? levelPill(sanction.tingkat) : pill("-", "grey")]),
              el("td", {}, [status ? statusPill(status) : pill("-", "grey"), el("div", { style: "margin-top:6px" }, [statusBadges])]),
              el("td", {}, [del]),
            ]);
          }),
        ),
      ])
    : el("div", { class: "muted", style: "margin-top:10px" }, ["Belum ada data murid"]);

  return el("div", {}, [header, formRow, el("div", { class: "hr" }), table]);
}

function renderCatatan() {
  const students = getStudents();
  const violations = getViolations();
  if (isStudent()) {
    const sid = myStudentId();
    const myViolations = sid ? violations.filter((v) => v.studentId === sid) : [];
    return el("div", {}, [
      el("div", { class: "muted" }, ["Mode murid: kamu hanya bisa melihat riwayat pelanggaran milikmu."]),
      el("div", { class: "hr" }),
      myViolations.length === 0
        ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
        : el("table", {}, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"])])]),
            el("tbody", {}, myViolations.map((v) => el("tr", {}, [el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)])]))),
          ]),
    ]);
  }

  const studentSel = el("select", {});
  studentSel.appendChild(el("option", { value: "" }, ["Pilih murid"]));
  for (const s of students) studentSel.appendChild(el("option", { value: String(s.id) }, [s.name]));

  const jenisSel = el("select", {});
  jenisSel.appendChild(el("option", { value: "" }, ["Pilih jenis pelanggaran"]));
  for (const j of JenisPelanggaran) jenisSel.appendChild(el("option", { value: j.key }, [`${j.label} (${j.poin} poin)`]));

  const poinInput = el("input", { value: "1", readonly: "readonly" });
  jenisSel.addEventListener("change", () => {
    const j = JenisPelanggaran.find((x) => x.key === jenisSel.value);
    poinInput.value = j ? String(j.poin) : "1";
  });

  const addBtn = el(
    "button",
    {
      class: "btn primary",
      type: "button",
      onclick: async () => {
        const sid = Number(studentSel.value || 0);
        const jenis = JenisPelanggaran.find((x) => x.key === jenisSel.value);
        if (!sid || !jenis) {
          alert("Lengkapi pilihan murid dan jenis pelanggaran");
          return;
        }
        await API.createViolation(sid, jenis.label, jenis.poin);
        await loadAll();
        studentSel.value = "";
        jenisSel.value = "";
        poinInput.value = "1";
        rerender();
      },
    },
    ["Tambah Catatan"]
  );

  const clearBtn = el(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: () => {
        studentSel.value = "";
        jenisSel.value = "";
        poinInput.value = "1";
      },
    },
    ["Bersihkan"]
  );

  const form = el("div", {}, [
    el("div", { class: "row" }, [
      el("div", { style: "flex:1; min-width:220px" }, [studentSel]),
      el("div", { style: "flex:1; min-width:260px" }, [jenisSel]),
      el("div", { style: "width:110px" }, [poinInput]),
    ]),
    el("div", { class: "row", style: "margin-top:10px" }, [addBtn, clearBtn]),
  ]);

  const table =
    violations.length === 0
      ? el("div", { class: "muted" }, ["Belum ada catatan pelanggaran"])
      : el("table", {}, [
          el("thead", {}, [
            el("tr", {}, [el("th", {}, ["Nama"]), el("th", {}, ["Pelanggaran"]), el("th", {}, ["Poin"]), el("th", {}, ["Tanggal"]), el("th", {}, ["Status"]), el("th", {}, ["Aksi"])]),
          ]),
          el(
            "tbody",
            {},
            violations.map((v) => {
              const s = findStudentById(v.studentId) || { name: "(–)" };
              const del = el(
                "button",
                {
                  class: "btn sm danger",
                  type: "button",
                  onclick: async () => {
                    if (!confirm("Hapus catatan ini?")) return;
                    await API.deleteViolation(v.id);
                    await loadAll();
                    rerender();
                  },
                },
                ["Hapus"]
              );
              const approve = v.status === "pending" && getSession()?.username === "admin" ? el(
                "button",
                {
                  class: "btn sm primary",
                  type: "button",
                  onclick: async () => {
                    await API.approveViolation(v.id);
                    await loadAll();
                    rerender();
                  },
                },
                ["Setujui"]
              ) : null;
              const actions = [del];
              if (approve) actions.push(approve);
              return el("tr", {}, [el("td", {}, [s.name]), el("td", {}, [v.jenis]), el("td", {}, [String(v.poin)]), el("td", {}, [fmtDate(v.tanggal)]), el("td", {}, [v.status === "approved" ? "Disetujui" : "Menunggu"]), el("td", {}, actions)]);
            }),
          ),
        ]);

  return el("div", {}, [el("div", { style: "font-weight:900; margin-bottom:10px" }, ["Tambah Catatan Pelanggaran"]), form, el("div", { class: "hr" }), el("div", { style: "font-weight:900; margin-bottom:10px" }, ["Riwayat Pelanggaran"]), table]);
}

function renderSanksi() {
  const sanctions = getSanctions();
  const students = getStudents();
  if (isStudent()) {
    const sid = myStudentId();
    const me = sid ? findStudentById(sid) : null;
    const pts = sid ? totalPointsForStudent(sid) : 0;
    return el("div", {}, [
      el("div", { class: "muted" }, [`Mode murid: menampilkan status sanksi untuk ${me?.name || "akunmu"}.`]),
      el("div", { class: "hr" }),
      el("div", { class: "kpi" }, [
        el("div", { class: "row" }, [el("div", { style: "font-weight:900" }, ["Poin saat ini"]), el("div", { class: "spacer" }), pill(String(pts), "blue")]),
      ]),
      el("div", { class: "hr" }),
      sanctions.length === 0
        ? el("div", { class: "muted" }, ["Belum ada sanksi"])
        : el(
            "div",
            {},
            sanctions.map((s) => {
              const inRange = pts >= s.minPoin && pts <= s.maxPoin;
              const rec = sid ? getStudentSanctionRecord(s.id, sid) : null;
              const current = rec?.status || Status.pending;
              return el("div", { class: "kpi", style: "margin-bottom:12px" }, [
                el("div", { class: "row" }, [
                  el("div", { style: `font-weight:900; ${inRange ? "" : "opacity:.75"}` }, [s.tingkat]),
                  el("div", { class: "spacer" }),
                  levelPill(s.tingkat),
                  statusPill(current),
                ]),
                el("div", { class: "muted", style: "margin-top:6px" }, [`Poin: ${s.minPoin} - ${s.maxPoin} • ${s.keterangan}`]),
              ]);
            }),
          ),
    ]);
  }

  async function openForm(existing) {
    const tingkat = prompt(existing ? "Tingkat" : "Tingkat (contoh: Ringan/Sedang/Berat)", existing?.tingkat || "");
    if (tingkat == null) return;
    const keterangan = prompt("Keterangan", existing?.keterangan || "");
    if (keterangan == null) return;
    const minPoin = Number(prompt("Min poin", existing?.minPoin ?? ""));
    const maxPoin = Number(prompt("Max poin", existing?.maxPoin ?? ""));
    if (!tingkat.trim() || !keterangan.trim() || !Number.isFinite(minPoin) || !Number.isFinite(maxPoin) || minPoin < 0 || maxPoin < 0 || minPoin > maxPoin) {
      alert("Periksa input sanksi");
      return;
    }

    if (existing) {
      await API.updateSanction(existing.id, { tingkat: tingkat.trim(), keterangan: keterangan.trim(), minPoin, maxPoin });
    } else {
      await API.createSanction({ tingkat: tingkat.trim(), keterangan: keterangan.trim(), minPoin, maxPoin });
    }
    await loadAll();
    rerender();
  }

  const addBtn = isAdmin() ? el("button", { class: "btn ok", type: "button", onclick: () => openForm(null) }, ["Tambah Sanksi"]) : null;

  const list = el(
    "div",
    {},
    sanctions.map((s) => {
      const matched = students.filter((st) => {
        const pts = totalPointsForStudent(st.id);
        return pts >= s.minPoin && pts <= s.maxPoin;
      });

      const header = el("div", { class: "row" }, [
        el("div", { style: "font-weight:900; font-size:16px" }, [s.tingkat]),
        el("div", { class: "spacer" }),
        levelPill(s.tingkat),
      ]);

      const desc = el("div", { class: "muted", style: "margin-top:6px" }, [`Poin: ${s.minPoin} - ${s.maxPoin} • ${s.keterangan}`]);

      const editBtn = isAdmin() ? el("button", { class: "btn sm", type: "button", onclick: () => openForm(s) }, ["Ubah"]) : null;
      const delBtn = isAdmin() ? el(
        "button",
        {
          class: "btn sm danger",
          type: "button",
          onclick: async () => {
            if (!confirm(`Hapus sanksi "${s.tingkat}"?`)) return;
            await API.deleteSanction(s.id);
            await loadAll();
            rerender();
          },
        },
        ["Hapus"]
      ) : null;

      const actionsRow = (editBtn || delBtn) ? el("div", { class: "row", style: "margin-top:10px" }, [editBtn, delBtn].filter(Boolean)) : null;
      const studentsTable =
        matched.length === 0
          ? el("div", { class: "muted", style: "margin-top:10px" }, ["- Tidak ada murid pada rentang ini -"])
          : el("table", { style: "margin-top:10px" }, [
              el("thead", {}, [
                el("tr", {}, [el("th", {}, ["Murid"]), el("th", {}, ["Kelas"]), el("th", {}, ["Poin"]), el("th", {}, ["Status"]), el("th", {}, ["Ubah status"])]),
              ]),
              el(
                "tbody",
                {},
                matched.map((st) => {
                  const pts = totalPointsForStudent(st.id);
                  const rec = getStudentSanctionRecord(s.id, st.id);
                  const current = rec?.status || Status.pending;

                  const sel = el("select", {
                    ...(isAdmin() ? {
                      onchange: async () => {
                        await API.setRecord(s.id, st.id, sel.value);
                        await loadAll();
                        rerender();
                      },
                    } : { disabled: "disabled" }),
                  });
                  [Status.pending, Status.applied, Status.reviewed].forEach((v) => {
                    sel.appendChild(el("option", { value: v, ...(v === current ? { selected: "selected" } : {}) }, [v]));
                  });

                  return el("tr", {}, [el("td", {}, [st.name]), el("td", {}, [st.kelas]), el("td", {}, [String(pts)]), el("td", {}, [statusPill(current)]), el("td", {}, [sel])]);
                }),
              ),
            ]);

      return el("div", { class: "kpi", style: "margin-bottom:12px" }, [
        header,
        desc,
        ...(actionsRow ? [actionsRow] : []),
        el("div", { class: "hr" }),
        el("div", { style: "font-weight:900; margin-bottom:6px" }, ["Murid terpengaruh"]),
        studentsTable,
      ]);
    }),
  );

  const headerRow = el("div", { class: "row" }, [el("div", { style: "font-weight:900" }, ["Kelola Sanksi"]), el("div", { class: "spacer" }), ...(addBtn ? [addBtn] : [])]);

  return el("div", {}, [headerRow, el("div", { class: "hr" }), sanctions.length ? list : el("div", { class: "muted" }, ["Belum ada sanksi"])]);
}

// -------------------- routing --------------------
function getRoute() {
  const h = (location.hash || "#dashboard").replace("#", "").trim();
  const allowed = isTeacher() ? new Set(["dashboard", "murid", "catatan", "sanksi"]) : new Set(["dashboard", "catatan", "sanksi"]);
  return allowed.has(h) ? h : "dashboard";
}

function renderRoute(route) {
  const title = $("#routeTitle");
  const body = $("#routeBody");
  body.innerHTML = "";

  if (route === "dashboard") {
    title.textContent = "Dashboard";
    body.appendChild(isStudent() ? renderDashboardStudent() : renderDashboard());
  } else if (route === "murid") {
    title.textContent = "Data Murid";
    body.appendChild(renderMurid());
  } else if (route === "catatan") {
    title.textContent = "Catatan & Laporan";
    body.appendChild(renderCatatan());
  } else if (route === "sanksi") {
    title.textContent = "Sanksi & Pembinaan";
    body.appendChild(renderSanksi());
  }
}

function rerender() {
  if (!getSession()) return;
  const route = getRoute();
  setActiveTab(route);
  renderRoute(route);
}

function setAuthVisible(isLoggedIn) {
  $("#authView").classList.toggle("hidden", isLoggedIn);
  $("#appView").classList.toggle("hidden", !isLoggedIn);
  $("#btnLogout").classList.toggle("hidden", !isLoggedIn);
  $("#sessionUser").classList.toggle("hidden", !isLoggedIn);
}

function refreshSessionBadge() {
  const s = getSession();
  const b = $("#sessionUser");
  if (!s) {
    b.textContent = "";
    return;
  }
  b.textContent = `login: ${s.username} • role: ${s.role || "-"}`;
}

function applyRoleTabs() {
  const sess = getSession();
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.route === "murid") t.classList.toggle("hidden", sess?.role !== Roles.teacher);
  });
}

function initAuthUI() {
  const loginForm = $("#loginForm");
  const loginU = $("#loginUsername");
  const loginP = $("#loginPassword");
  const loginErr = $("#loginError");

  const regForm = $("#registerForm");
  const regU = $("#regUsername");
  const regP = $("#regPassword");
  const regC = $("#regConfirm");
  const regErr = $("#regError");

  const toRegister = $("#toRegister");
  const toLogin = $("#toLogin");
  const registerHint = $("#registerHint");

  function showRegister() {
    regForm.classList.remove("hidden");
    registerHint.classList.add("hidden");
    regU.focus();
  }
  function showLogin() {
    regForm.classList.add("hidden");
    registerHint.classList.remove("hidden");
    loginU.focus();
  }

  toRegister.addEventListener("click", showRegister);
  toLogin.addEventListener("click", showLogin);

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
        await loadAll();
        rerender();
      })
      .catch((err) => {
        showError(loginErr, err.message || "Username atau password salah");
      });
  });

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(regErr, "");
    if (regC.value !== regP.value) {
      showError(regErr, "Konfirmasi password tidak sama");
      return;
    }
    API.register(regU.value, regP.value)
      .then(() => {
        alert("Pendaftaran berhasil, silakan masuk");
        regP.value = "";
        regC.value = "";
        showLogin();
      })
      .catch((err) => {
        showError(regErr, err.message || "Pendaftaran gagal");
      });
  });

  $("#btnLogout").addEventListener("click", () => {
    clearSession();
    setAuthVisible(false);
    refreshSessionBadge();
    applyRoleTabs();
  });
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      location.hash = `#${b.dataset.route}`;
    });
  });
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
      .catch(() => {
        alert("Server database belum jalan. Jalankan: cobaWeb/server -> npm install -> npm run dev");
        clearSession();
        setAuthVisible(false);
        refreshSessionBadge();
        applyRoleTabs();
      });
  }
}

document.addEventListener("DOMContentLoaded", main);
