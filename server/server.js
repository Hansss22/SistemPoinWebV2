import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = await openDb();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve the front-end
app.use(express.static(path.join(__dirname, ".")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function badRequest(res, message, details) {
  return res.status(400).json({ ok: false, message, details });
}

function ok(res, data = {}) {
  return res.json({ ok: true, ...data });
}

function normalizeUsername(u) {
  return String(u || "").trim();
}

function ensureInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function getCaller(req) {
  const headerUser = normalizeUsername(req.header("x-username"));
  // admin is always teacher
  if (headerUser === "admin") return { username: "admin", role: "teacher", studentId: null };
  if (!headerUser) return null;
  const row = db.get("SELECT username, role, student_id as studentId FROM users WHERE username = ?", [headerUser]);
  if (!row) return null;
  return {
    username: row.username,
    role: row.role || "student",
    studentId: row.studentId ?? null,
  };
}

function requireAdmin(req, res) {
  const caller = getCaller(req);
  if (!caller) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  if (caller.username !== "admin") {
    res.status(403).json({ ok: false, message: "Akses ditolak (khusus admin)" });
    return null;
  }
  return caller;
}

function requireTeacher(req, res) {
  const caller = getCaller(req);
  if (!caller) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  if (caller.role !== "teacher") {
    res.status(403).json({ ok: false, message: "Akses ditolak (khusus guru)" });
    return null;
  }
  return caller;
}

function requireLogin(req, res) {
  const caller = getCaller(req);
  if (!caller) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }
  return caller;
}

// ---------- Auth ----------
app.post("/api/login", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || "");
  if (!username || !password) return badRequest(res, "Username dan password wajib diisi");

  if (username === "admin" && password === "12345") return ok(res, { username, role: "teacher", studentId: null });

  const row = db.get("SELECT username, password, role, student_id as studentId FROM users WHERE username = ?", [username]);
  if (!row || row.password !== password) return res.status(401).json({ ok: false, message: "Username atau password salah" });
  return ok(res, { username: row.username, role: row.role || "student", studentId: row.studentId ?? null });
});

app.post("/api/register", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || "");
  if (!username) return badRequest(res, "Username wajib diisi");
  if (!password) return badRequest(res, "Password wajib diisi");
  if (password.length < 5) return badRequest(res, "Password minimal 5 karakter");
  if (username.toLowerCase() === "admin") return badRequest(res, 'Username "admin" tidak boleh digunakan');

  const exists2 = db.get("SELECT 1 as ok FROM users WHERE username = ?", [username]);
  if (exists2) return badRequest(res, "Username sudah terdaftar");

  // default register = student (no student_id unless teacher links it later)
  db.run("INSERT INTO users (username, password, role, student_id, created_at) VALUES (?, ?, ?, ?, ?)", [username, password, "student", null, Date.now()]);
  return ok(res);
});

// ---------- Students ----------
app.get("/api/students", (_req, res) => {
  // teacher sees all; student sees only himself (if linked)
  const caller = requireLogin(_req, res);
  if (!caller) return;
  if (caller.role === "teacher") {
    const rows = db.all("SELECT id, name, kelas FROM students ORDER BY id DESC");
    return ok(res, { students: rows });
  }
  if (!caller.studentId) return ok(res, { students: [] });
  const row = db.get("SELECT id, name, kelas FROM students WHERE id = ?", [caller.studentId]);
  return ok(res, { students: row ? [row] : [] });
});

app.post("/api/students", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = String(req.body?.name || "").trim();
  const kelas = String(req.body?.kelas || "").trim();
  if (!name || !kelas) return badRequest(res, "Nama dan kelas wajib diisi");

  const id = Date.now();
  db.run("INSERT INTO students (id, name, kelas, created_at) VALUES (?, ?, ?, ?)", [id, name, kelas, Date.now()]);
  return ok(res, { student: { id, name, kelas } });
});

app.delete("/api/students/:id", (req, res) => {
  if (!requireTeacher(req, res)) return;
  const id = ensureInt(req.params.id);
  if (id == null) return badRequest(res, "ID tidak valid");
  db.run("DELETE FROM students WHERE id = ?", [id]);
  return ok(res);
});

// ---------- Violations ----------
app.get("/api/violations", (_req, res) => {
  const caller = requireLogin(_req, res);
  if (!caller) return;
  if (caller.role === "teacher") {
    const rows = db.all("SELECT id, student_id as studentId, jenis, poin, tanggal, status FROM violations ORDER BY id DESC");
    return ok(res, { violations: rows });
  }
  if (!caller.studentId) return ok(res, { violations: [] });
  const rows = db.all("SELECT id, student_id as studentId, jenis, poin, tanggal, status FROM violations WHERE student_id = ? ORDER BY id DESC", [caller.studentId]);
  return ok(res, { violations: rows });
});

app.post("/api/violations", (req, res) => {
  const caller = requireTeacher(req, res);
  if (!caller) return;
  const studentId = ensureInt(req.body?.studentId);
  const jenis = String(req.body?.jenis || "").trim();
  const poin = ensureInt(req.body?.poin);
  if (studentId == null) return badRequest(res, "studentId tidak valid");
  if (!jenis) return badRequest(res, "jenis wajib diisi");
  if (poin == null) return badRequest(res, "poin tidak valid");

  const s = db.get("SELECT id FROM students WHERE id = ?", [studentId]);
  if (!s) return badRequest(res, "Murid tidak ditemukan");

  const status = caller.username === "admin" ? "approved" : "pending";
  const id = Date.now();
  const tanggal = Date.now();
  db.run("INSERT INTO violations (id, student_id, jenis, poin, tanggal, status) VALUES (?, ?, ?, ?, ?, ?)", [id, studentId, jenis, poin, tanggal, status]);
  return ok(res, { violation: { id, studentId, jenis, poin, tanggal, status } });
});

app.delete("/api/violations/:id", (req, res) => {
  if (!requireTeacher(req, res)) return;
  const id = ensureInt(req.params.id);
  if (id == null) return badRequest(res, "ID tidak valid");
  db.run("DELETE FROM violations WHERE id = ?", [id]);
  return ok(res);
});

app.put("/api/violations/:id/approve", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = ensureInt(req.params.id);
  if (id == null) return badRequest(res, "ID tidak valid");
  db.run("UPDATE violations SET status = 'approved' WHERE id = ?", [id]);
  return ok(res);
});

// ---------- Sanctions ----------
app.get("/api/sanctions", (_req, res) => {
  const rows = db.all("SELECT id, tingkat, keterangan, min_poin as minPoin, max_poin as maxPoin FROM sanctions ORDER BY min_poin ASC");
  return ok(res, { sanctions: rows });
});

app.post("/api/sanctions", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const tingkat = String(req.body?.tingkat || "").trim();
  const keterangan = String(req.body?.keterangan || "").trim();
  const minPoin = ensureInt(req.body?.minPoin);
  const maxPoin = ensureInt(req.body?.maxPoin);
  if (!tingkat || !keterangan) return badRequest(res, "Tingkat dan keterangan wajib diisi");
  if (minPoin == null || maxPoin == null || minPoin < 0 || maxPoin < 0 || minPoin > maxPoin) return badRequest(res, "Rentang poin tidak valid");

  const id = Date.now();
  db.run("INSERT INTO sanctions (id, tingkat, keterangan, min_poin, max_poin) VALUES (?, ?, ?, ?, ?)", [id, tingkat, keterangan, minPoin, maxPoin]);
  return ok(res, { sanction: { id, tingkat, keterangan, minPoin, maxPoin } });
});

app.put("/api/sanctions/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = ensureInt(req.params.id);
  if (id == null) return badRequest(res, "ID tidak valid");
  const tingkat = String(req.body?.tingkat || "").trim();
  const keterangan = String(req.body?.keterangan || "").trim();
  const minPoin = ensureInt(req.body?.minPoin);
  const maxPoin = ensureInt(req.body?.maxPoin);
  if (!tingkat || !keterangan) return badRequest(res, "Tingkat dan keterangan wajib diisi");
  if (minPoin == null || maxPoin == null || minPoin < 0 || maxPoin < 0 || minPoin > maxPoin) return badRequest(res, "Rentang poin tidak valid");

  db.run("UPDATE sanctions SET tingkat=?, keterangan=?, min_poin=?, max_poin=? WHERE id=?", [tingkat, keterangan, minPoin, maxPoin, id]);
  return ok(res);
});

app.delete("/api/sanctions/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = ensureInt(req.params.id);
  if (id == null) return badRequest(res, "ID tidak valid");
  db.run("DELETE FROM sanctions WHERE id = ?", [id]);
  return ok(res);
});

// ---------- Records (status per murid per sanksi) ----------
app.get("/api/records", (_req, res) => {
  const caller = requireLogin(_req, res);
  if (!caller) return;
  if (caller.role === "teacher") {
    const rows = db.all("SELECT sanction_id as sanctionId, student_id as studentId, status, updated_at as updatedAt FROM student_sanction_records");
    return ok(res, { records: rows });
  }
  if (!caller.studentId) return ok(res, { records: [] });
  const rows = db.all("SELECT sanction_id as sanctionId, student_id as studentId, status, updated_at as updatedAt FROM student_sanction_records WHERE student_id = ?", [caller.studentId]);
  return ok(res, { records: rows });
});

app.put("/api/records", (req, res) => {
  if (!requireTeacher(req, res)) return;
  const sanctionId = ensureInt(req.body?.sanctionId);
  const studentId = ensureInt(req.body?.studentId);
  const status = String(req.body?.status || "").trim();
  const allowed = new Set(["pending", "applied", "reviewed"]);
  if (sanctionId == null || studentId == null) return badRequest(res, "sanctionId/studentId tidak valid");
  if (!allowed.has(status)) return badRequest(res, "status tidak valid");

  const exists = db.get("SELECT 1 as ok FROM student_sanction_records WHERE sanction_id = ? AND student_id = ?", [sanctionId, studentId]);
  if (exists) {
    db.run("UPDATE student_sanction_records SET status=?, updated_at=? WHERE sanction_id=? AND student_id=?", [status, Date.now(), sanctionId, studentId]);
  } else {
    db.run("INSERT INTO student_sanction_records (sanction_id, student_id, status, updated_at) VALUES (?, ?, ?, ?)", [sanctionId, studentId, status, Date.now()]);
  }
  return ok(res);
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`cobaWeb server running on http://localhost:${PORT}`);
});

