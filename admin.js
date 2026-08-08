/* ===========================================================
   VOLT — Admin panel logic
   Depends on app.js (API client, auth, navbar, toast) which is
   loaded first. `user` is set in the inline script in admin.html.
   =========================================================== */

const VIEWS = ["overview", "tests", "testform", "students", "results"];

const state = {
  exams: [],
  students: [],
  results: [],
  overview: null,
  editingExamId: null,
  formQuestions: [], // [{id,text,options:[...4],correct,marks}]
};

let qCounter = 0;
function nextQId() {
  qCounter += 1;
  return `q${Date.now()}_${qCounter}`;
}

// ---------------- routing ----------------
function showView(name) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("active", v === name);
  });
}

function route() {
  let view = (window.location.hash || "#overview").replace("#", "");
  if (!VIEWS.includes(view)) view = "overview";
  showView(view);
  if (view === "overview") loadOverview();
  if (view === "tests") loadTests();
  if (view === "students") loadStudents();
  if (view === "results") loadResults();
}

window.addEventListener("hashchange", route);

// ---------------- overview ----------------
async function loadOverview() {
  const res = await apiRequest("/overview");
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  state.overview = res;

  document.getElementById("ovTests").textContent = res.tests;
  document.getElementById("ovStudents").textContent = res.students;
  document.getElementById("ovAttempts").textContent = res.attempts;
  document.getElementById("ovAvg").textContent = res.average === null ? "—" : `${res.average}%`;

  const recentWrap = document.getElementById("ovRecentWrap");
  if (!res.recent.length) {
    recentWrap.innerHTML = emptyState("📝", "No attempts yet", "Results will show up here once students start taking tests.");
  } else {
    recentWrap.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Submitted</th></tr></thead>
      <tbody>
        ${res.recent.map((r) => `
          <tr>
            <td>${escapeHTML(r.userId?.name || "Unknown")}</td>
            <td>${escapeHTML(r.examId?.title || "Deleted test")}</td>
            <td>${pctBadge(Math.round((r.score / (r.totalMarks || 1)) * 100))}</td>
            <td>${formatDate(r.submittedAt)}</td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
  }

  const perfWrap = document.getElementById("ovTestPerfWrap");
  if (!res.perTest.length) {
    perfWrap.innerHTML = emptyState("📘", "No tests yet", "Create your first test to see performance here.");
  } else {
    perfWrap.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Test</th><th>Subject</th><th>Attempts</th><th>Average</th></tr></thead>
      <tbody>
        ${res.perTest.map((t) => `
          <tr>
            <td>${escapeHTML(t.title)}</td>
            <td>${escapeHTML(t.subject || "—")}</td>
            <td>${t.attempts}</td>
            <td>${pctBadge(t.average)}</td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
  }
}

document.getElementById("ovNewTestBtn").addEventListener("click", () => openTestForm());

// ---------------- tests list ----------------
async function loadTests() {
  const wrap = document.getElementById("testsListWrap");
  wrap.innerHTML = `<div class="empty-state"><div class="glyph">⏳</div><p>Loading tests…</p></div>`;
  const res = await apiRequest("/exams");
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  state.exams = res.exams;

  if (!state.exams.length) {
    wrap.innerHTML = emptyState("📘", "No tests yet", "Click \"New test\" to build your first one.");
    return;
  }

  wrap.innerHTML = `<div class="test-grid">
    ${state.exams.map((t) => `
      <div class="test-card">
        <span class="subject-tag">${escapeHTML(t.subject || "General")}</span>
        <h3>${escapeHTML(t.title)}</h3>
        <div class="test-meta">
          <span>⏱ ${t.duration} min</span>
          <span>📝 ${t.questions.length} questions</span>
        </div>
        <div style="display:flex; gap:10px; margin-top:auto;">
          <button class="btn btn-outline btn-sm" data-edit="${t._id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${t._id}">Delete</button>
        </div>
      </div>`).join("")}
  </div>`;

  wrap.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openTestForm(btn.dataset.edit));
  });
  wrap.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteTest(btn.dataset.delete));
  });
}

document.getElementById("testsNewBtn").addEventListener("click", () => openTestForm());

// ---------------- delete modal ----------------
let pendingDeleteId = null;
function confirmDeleteTest(examId) {
  pendingDeleteId = examId;
  document.getElementById("deleteModalBackdrop").classList.add("active");
}
document.getElementById("deleteModalCancel").addEventListener("click", () => {
  pendingDeleteId = null;
  document.getElementById("deleteModalBackdrop").classList.remove("active");
});
document.getElementById("deleteModalConfirm").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  const res = await apiRequest(`/exams/${pendingDeleteId}`, { method: "DELETE" });
  document.getElementById("deleteModalBackdrop").classList.remove("active");
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  toast("Test deleted.");
  pendingDeleteId = null;
  loadTests();
});

// ---------------- test form (create / edit) ----------------
function openTestForm(examId) {
  state.editingExamId = examId || null;
  document.getElementById("tfError").style.display = "none";
  document.getElementById("tfImportStatus").style.display = "none";

  if (examId) {
    const exam = state.exams.find((e) => e._id === examId);
    document.getElementById("testFormEyebrow").textContent = "Edit test";
    document.getElementById("testFormTitle").textContent = "Edit test";
    document.getElementById("tfTitle").value = exam.title;
    document.getElementById("tfSubject").value = exam.subject || "";
    document.getElementById("tfDuration").value = exam.duration;
    state.formQuestions = exam.questions.map((q) => ({ ...q }));
  } else {
    document.getElementById("testFormEyebrow").textContent = "New test";
    document.getElementById("testFormTitle").textContent = "Create a test";
    document.getElementById("tfTitle").value = "";
    document.getElementById("tfSubject").value = "";
    document.getElementById("tfDuration").value = 15;
    state.formQuestions = [];
    addQuestionRow();
  }

  renderQuestions();
  window.location.hash = "testform";
}

function addQuestionRow() {
  state.formQuestions.push({
    id: nextQId(),
    text: "",
    options: ["", "", "", ""],
    correct: 0,
    marks: 1,
  });
  renderQuestions();
}

function renderQuestions() {
  const wrap = document.getElementById("tfQuestionsWrap");
  document.getElementById("tfQCount").textContent = `(${state.formQuestions.length})`;

  wrap.innerHTML = state.formQuestions.map((q, qi) => `
    <div class="q-block" data-qi="${qi}">
      <div class="q-block-head">
        <span>QUESTION ${qi + 1}</span>
        <button type="button" data-remove-q="${qi}">Remove</button>
      </div>
      <div class="field">
        <label>Question text</label>
        <input type="text" data-q-text="${qi}" value="${attr(q.text)}" placeholder="Type the question…">
      </div>
      ${q.options.map((opt, oi) => `
        <div class="opt-row">
          <input type="radio" name="correct-${qi}" data-q-correct="${qi}" value="${oi}" ${q.correct === oi ? "checked" : ""}>
          <input type="text" data-q-opt="${qi}:${oi}" value="${attr(opt)}" placeholder="Option ${String.fromCharCode(65 + oi)}">
        </div>`).join("")}
      <div class="field" style="max-width:140px; margin-top:6px;">
        <label>Marks</label>
        <input type="number" min="1" data-q-marks="${qi}" value="${q.marks}">
      </div>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-remove-q]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.formQuestions.splice(Number(btn.dataset.removeQ), 1);
      renderQuestions();
    });
  });
  wrap.querySelectorAll("[data-q-text]").forEach((el) => {
    el.addEventListener("input", () => { state.formQuestions[el.dataset.qText].text = el.value; });
  });
  wrap.querySelectorAll("[data-q-opt]").forEach((el) => {
    el.addEventListener("input", () => {
      const [qi, oi] = el.dataset.qOpt.split(":").map(Number);
      state.formQuestions[qi].options[oi] = el.value;
    });
  });
  wrap.querySelectorAll("[data-q-correct]").forEach((el) => {
    el.addEventListener("change", () => { state.formQuestions[el.dataset.qCorrect].correct = Number(el.value); });
  });
  wrap.querySelectorAll("[data-q-marks]").forEach((el) => {
    el.addEventListener("input", () => { state.formQuestions[el.dataset.qMarks].marks = Number(el.value) || 1; });
  });
}

function attr(str) {
  return escapeHTML(str).replace(/"/g, "&quot;");
}

document.getElementById("tfAddQ").addEventListener("click", addQuestionRow);
document.getElementById("tfAddQ2").addEventListener("click", addQuestionRow);
document.getElementById("testFormBack").addEventListener("click", () => { window.location.hash = "tests"; });
document.getElementById("tfCancel").addEventListener("click", () => { window.location.hash = "tests"; });

document.getElementById("tfSave").addEventListener("click", async () => {
  const errEl = document.getElementById("tfError");
  errEl.style.display = "none";

  const title = document.getElementById("tfTitle").value.trim();
  const subject = document.getElementById("tfSubject").value.trim();
  const duration = Number(document.getElementById("tfDuration").value);

  if (!title) return showFormError("Give the test a title.");
  if (!duration || duration < 1) return showFormError("Duration must be at least 1 minute.");
  if (!state.formQuestions.length) return showFormError("Add at least one question.");

  for (const [i, q] of state.formQuestions.entries()) {
    if (!q.text.trim()) return showFormError(`Question ${i + 1} needs its text filled in.`);
    if (q.options.some((o) => !o.trim())) return showFormError(`Question ${i + 1} needs all four options filled in.`);
  }

  const payload = {
    title,
    subject,
    duration,
    questions: state.formQuestions.map((q) => ({
      id: q.id,
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correct: q.correct,
      marks: q.marks || 1,
    })),
  };

  const res = state.editingExamId
    ? await apiRequest(`/exams/${state.editingExamId}`, { method: "PUT", body: JSON.stringify(payload) })
    : await apiRequest("/exams", { method: "POST", body: JSON.stringify(payload) });

  if (!res.ok) return showFormError(res.error);

  toast(state.editingExamId ? "Test updated." : "Test created.");
  window.location.hash = "tests";
});

function showFormError(msg) {
  const errEl = document.getElementById("tfError");
  errEl.textContent = msg;
  errEl.style.display = "block";
}

// ---------------- excel/csv import ----------------
document.getElementById("tfImportBtn").addEventListener("click", () => {
  document.getElementById("tfImportInput").click();
});

document.getElementById("tfImportInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("tfImportStatus");
  statusEl.style.display = "block";
  statusEl.innerHTML = `<span class="text-faint">Reading ${escapeHTML(file.name)}…</span>`;

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    let added = 0;
    const skipped = [];

    rows.forEach((row, idx) => {
      const parsed = parseImportRow(row);
      if (parsed.error) {
        skipped.push(`Row ${idx + 2}: ${parsed.error}`);
        return;
      }
      state.formQuestions.push(parsed.question);
      added += 1;
    });

    renderQuestions();

    if (added > 0) {
      statusEl.innerHTML = `<span style="color:#6fe0a8;">Imported ${added} question${added === 1 ? "" : "s"}.</span>` +
        (skipped.length ? `<div class="text-faint" style="margin-top:6px; font-size:12px;">Skipped ${skipped.length}: ${skipped.map(escapeHTML).join("; ")}</div>` : "");
      toast(`Imported ${added} question${added === 1 ? "" : "s"}.`);
    } else {
      statusEl.innerHTML = `<span style="color:#ff8f8f;">No valid rows found.</span>` +
        (skipped.length ? `<div class="text-faint" style="margin-top:6px; font-size:12px;">${skipped.map(escapeHTML).join("; ")}</div>` : "");
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color:#ff8f8f;">Couldn't read that file. Make sure it's a valid .xlsx, .xls, or .csv.</span>`;
  } finally {
    e.target.value = "";
  }
});

function parseImportRow(row) {
  const get = (...keys) => {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.trim().toLowerCase())) return String(row[k]).trim();
    }
    return "";
  };

  const text = get("question");
  const a = get("option a", "a");
  const b = get("option b", "b");
  const c = get("option c", "c");
  const d = get("option d", "d");
  const answerRaw = get("correct answer (a/b/c/d)", "correct answer", "correct", "answer");
  const marksRaw = get("marks");

  if (!text) return { error: "missing question text" };
  if (!a || !b || !c || !d) return { error: "missing one or more options" };

  const letter = answerRaw.trim().toUpperCase().charAt(0);
  const map = { A: 0, B: 1, C: 2, D: 3 };
  if (!(letter in map)) return { error: "missing/invalid correct answer" };

  const marks = Number(marksRaw);

  return {
    question: {
      id: nextQId(),
      text,
      options: [a, b, c, d],
      correct: map[letter],
      marks: Number.isFinite(marks) && marks > 0 ? marks : 1,
    },
  };
}

// ---------------- students ----------------
async function loadStudents() {
  const wrap = document.getElementById("studentsWrap");
  wrap.innerHTML = `<div class="empty-state"><div class="glyph">⏳</div><p>Loading students…</p></div>`;
  const res = await apiRequest("/students");
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  state.students = res.students;

  if (!state.students.length) {
    wrap.innerHTML = emptyState("🎓", "No students yet", "Students appear here once they register.");
    return;
  }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Email</th><th>Attempts</th><th>Average</th><th>Joined</th></tr></thead>
    <tbody>
      ${state.students.map((s) => `
        <tr>
          <td>${escapeHTML(s.name)}</td>
          <td>${escapeHTML(s.email)}</td>
          <td>${s.attempts}</td>
          <td>${pctBadge(s.average)}</td>
          <td>${formatDate(s.createdAt)}</td>
        </tr>`).join("")}
    </tbody>
  </table></div>`;
}

// ---------------- results ----------------
async function loadResults(examFilter) {
  const wrap = document.getElementById("resultsWrap");
  wrap.innerHTML = `<div class="empty-state"><div class="glyph">⏳</div><p>Loading results…</p></div>`;

  const filterSelect = document.getElementById("resultsFilter");
  if (!filterSelect.dataset.populated) {
    if (!state.exams.length) {
      const examsRes = await apiRequest("/exams");
      if (examsRes.ok) state.exams = examsRes.exams;
    }
    state.exams.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t._id;
      opt.textContent = t.title;
      filterSelect.appendChild(opt);
    });
    filterSelect.dataset.populated = "true";
  }

  const query = examFilter ? `?examId=${examFilter}` : "";
  const res = await apiRequest(`/results${query}`);
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  state.results = res.results;

  if (!state.results.length) {
    wrap.innerHTML = emptyState("📊", "No results yet", "Submitted attempts will appear here.");
    return;
  }

  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Marks</th><th>Submitted</th></tr></thead>
    <tbody>
      ${state.results.map((r) => `
        <tr>
          <td>${escapeHTML(r.userId?.name || "Unknown")}</td>
          <td>${escapeHTML(r.examId?.title || "Deleted test")}</td>
          <td>${pctBadge(Math.round((r.score / (r.totalMarks || 1)) * 100))}</td>
          <td>${r.score} / ${r.totalMarks}</td>
          <td>${formatDate(r.submittedAt)}</td>
        </tr>`).join("")}
    </tbody>
  </table></div>`;
}

document.getElementById("resultsFilter").addEventListener("change", (e) => {
  loadResults(e.target.value || undefined);
});

// ---------------- shared markup helper ----------------
function emptyState(glyph, title, body) {
  return `<div class="empty-state">
    <div class="glyph">${glyph}</div>
    <h4>${escapeHTML(title)}</h4>
    <p>${escapeHTML(body)}</p>
  </div>`;
}

// ---------------- boot ----------------
route();
