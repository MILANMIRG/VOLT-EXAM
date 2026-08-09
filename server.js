require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const User = require("./modules/user");
const Exam = require("./modules/exam");
const Result = require("./modules/result");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function publicUser(userDoc) {
  const u = userDoc.toObject ? userDoc.toObject() : userDoc;
  delete u.password;
  return u;
}

function stripAnswers(examDoc) {
  const e = examDoc.toObject ? examDoc.toObject() : examDoc;
  e.questions = (e.questions || []).map((q) => {
    const { correct, ...rest } = q;
    return rest;
  });
  return e;
}

function asyncHandler(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
}

// ------------------------------------------------------------------
// Auth routes
// ------------------------------------------------------------------
app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Full name is required." });
  if (!email || !email.trim()) return res.status(400).json({ error: "Email is required." });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const existing = await User.findOne({ email: email.trim().toLowerCase() });
  if (existing) return res.status(409).json({ error: "An account with that email already exists." });

  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role: "student",
  });

  res.status(201).json({ user: publicUser(user) });
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (role && user.role !== role) {
    return res.status(401).json({ error: `No ${role} account found with that email.` });
  }

  res.json({ user: publicUser(user) });
}));

// ------------------------------------------------------------------
// Exam routes
// ------------------------------------------------------------------
app.get("/api/exams", asyncHandler(async (req, res) => {
  const exams = await Exam.find().sort({ createdAt: -1 });
  const forStudent = req.query.forStudent === "true";
  res.json({ exams: exams.map((e) => (forStudent ? stripAnswers(e) : e)) });
}));

app.get("/api/exams/:id", asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ error: "Test not found." });
  const forStudent = req.query.forStudent === "true";
  res.json({ exam: forStudent ? stripAnswers(exam) : exam });
}));

app.post("/api/exams", asyncHandler(async (req, res) => {
  const { title, subject, duration, questions } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Test title is required." });
  if (!duration || duration < 1) return res.status(400).json({ error: "Duration must be at least 1 minute." });
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Add at least one question." });
  }

  const exam = await Exam.create({
    title: title.trim(),
    subject: (subject || "").trim(),
    duration,
    questions,
  });
  res.status(201).json({ exam });
}));

app.put("/api/exams/:id", asyncHandler(async (req, res) => {
  const { title, subject, duration, questions } = req.body || {};
  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ error: "Test not found." });

  if (title !== undefined) exam.title = title.trim();
  if (subject !== undefined) exam.subject = subject.trim();
  if (duration !== undefined) exam.duration = duration;
  if (questions !== undefined) exam.questions = questions;

  await exam.save();
  res.json({ exam });
}));

app.delete("/api/exams/:id", asyncHandler(async (req, res) => {
  const exam = await Exam.findByIdAndDelete(req.params.id);
  if (!exam) return res.status(404).json({ error: "Test not found." });
  res.json({ ok: true });
}));

// Submit an attempt — grading happens server-side so the correct
// answers never need to be trusted from the client.
app.post("/api/exams/:id/submit", asyncHandler(async (req, res) => {
  const { userId, answers } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Missing user." });

  const exam = await Exam.findById(req.params.id);
  if (!exam) return res.status(404).json({ error: "Test not found." });

  const submittedAnswers = Array.isArray(answers) ? answers : [];
  let score = 0;
  let totalMarks = 0;
  const breakdown = exam.questions.map((q, i) => {
    const marks = q.marks || 1;
    totalMarks += marks;
    const given = submittedAnswers[i] !== undefined ? submittedAnswers[i] : -1;
    const isCorrect = given === q.correct;
    if (isCorrect) score += marks;
    return { given, correct: q.correct, isCorrect };
  });

  const result = await Result.create({
    userId,
    examId: exam._id,
    score,
    totalMarks,
    answers: submittedAnswers,
  });

  res.status(201).json({ result, breakdown });
}));

// ------------------------------------------------------------------
// Result routes
// ------------------------------------------------------------------
app.get("/api/results", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.examId) filter.examId = req.query.examId;
  const results = await Result.find(filter)
    .populate("userId", "name email")
    .populate("examId", "title subject")
    .sort({ submittedAt: -1 });
  res.json({ results });
}));

app.get("/api/results/user/:userId", asyncHandler(async (req, res) => {
  const results = await Result.find({ userId: req.params.userId })
    .populate("examId", "title subject duration questions")
    .sort({ submittedAt: -1 });
  res.json({ results });
}));

// Remove a single result from the results log.
app.delete("/api/results/:id", asyncHandler(async (req, res) => {
  const result = await Result.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: "Result not found." });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------
// Student / admin directory + overview
// ------------------------------------------------------------------
app.get("/api/students", asyncHandler(async (req, res) => {
  const students = await User.find({ role: "student" }).sort({ createdAt: -1 });
  const results = await Result.find();

  const rows = students.map((s) => {
    const own = results.filter((r) => String(r.userId) === String(s._id));
    const avg = own.length
      ? Math.round((own.reduce((sum, r) => sum + (r.score / (r.totalMarks || 1)) * 100, 0) / own.length))
      : null;
    return {
      ...publicUser(s),
      attempts: own.length,
      average: avg,
    };
  });

  res.json({ students: rows });
}));

// Remove a student account. Their past results are left in place (same
// "keep history, drop the source" behaviour as deleting an exam) so the
// results log still shows something sensible in place of the account,
// the same way it already handles a deleted exam via "Deleted test".
app.delete("/api/students/:id", asyncHandler(async (req, res) => {
  const student = await User.findOneAndDelete({ _id: req.params.id, role: "student" });
  if (!student) return res.status(404).json({ error: "Student not found." });
  res.json({ ok: true });
}));

app.get("/api/overview", asyncHandler(async (req, res) => {
  const [examCount, studentCount, results, exams] = await Promise.all([
    Exam.countDocuments(),
    User.countDocuments({ role: "student" }),
    Result.find().populate("userId", "name email").populate("examId", "title subject").sort({ submittedAt: -1 }),
    Exam.find(),
  ]);

  const avgScore = results.length
    ? Math.round(results.reduce((sum, r) => sum + (r.score / (r.totalMarks || 1)) * 100, 0) / results.length)
    : null;

  const perTest = exams.map((e) => {
    const own = results.filter((r) => r.examId && String(r.examId._id) === String(e._id));
    const avg = own.length
      ? Math.round(own.reduce((sum, r) => sum + (r.score / (r.totalMarks || 1)) * 100, 0) / own.length)
      : null;
    return { examId: e._id, title: e.title, subject: e.subject, attempts: own.length, average: avg };
  });

  res.json({
    tests: examCount,
    students: studentCount,
    attempts: results.length,
    average: avgScore,
    recent: results.slice(0, 8),
    perTest,
  });
}));

// ------------------------------------------------------------------
// Fallback + seed + startup
// ------------------------------------------------------------------
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

async function seedIfEmpty() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    await User.create([
      { name: "Admin", email: "admin@volt.com", password: "admin123", role: "admin" },
      { name: "Demo Student", email: "student@volt.com", password: "student123", role: "student" },
    ]);
    console.log("Seeded default admin and student accounts.");
  }

  const examCount = await Exam.countDocuments();
  if (examCount === 0) {
    await Exam.create({
      title: "General Knowledge — Sample Test",
      subject: "General Knowledge",
      duration: 10,
      questions: [
        {
          id: "q1",
          text: "What is the capital of France?",
          options: ["Berlin", "Madrid", "Paris", "Rome"],
          correct: 2,
          marks: 1,
        },
        {
          id: "q2",
          text: "Which planet is known as the Red Planet?",
          options: ["Venus", "Mars", "Jupiter", "Saturn"],
          correct: 1,
          marks: 1,
        },
        {
          id: "q3",
          text: "2 + 2 * 2 equals?",
          options: ["6", "8", "4", "2"],
          correct: 0,
          marks: 1,
        },
      ],
    });
    console.log("Seeded a sample test.");
  }
}

async function start() {
  if (!MONGO_URI) {
    console.error("MONGO_URI is not set. Add it to your .env file.");
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");
    await seedIfEmpty();
    app.listen(PORT, () => console.log(`VOLT server running at http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

start();
