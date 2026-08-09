/* ===========================================================
   VOLT — Student panel logic
   Depends on app.js (API client, auth, navbar, toast).
   =========================================================== */

const user = requireRole("student");

const VIEWS = ["dashboard", "results", "review", "result"];

const state = {
  exams: [],
  myResults: [],
  currentReview: null,
  lastResultView: null,
};

let session = null; // active exam-taking session
let timerId = null;

// ---------------- routing ----------------
function showView(name) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("active", v === name);
  });
}

function route() {
  let view = (window.location.hash || "#dashboard").replace("#", "");
  if (!VIEWS.includes(view)) view = "dashboard";
  if (view === "review" && !state.currentReview) view = "dashboard";
  if (view === "result" && !state.lastResultView) view = "dashboard";

  showView(view);
  if (view === "dashboard") loadDashboard();
  if (view === "results") loadResultsHistory();
  if (view === "review") renderReview(state.currentReview);
  if (view === "result") renderResultView(state.lastResultView);
}

window.addEventListener("hashchange", route);

// ---------------- dashboard ----------------
async function loadDashboard() {
  document.getElementById("welcomeName").textContent = user.name || "Student";

  const [examsRes, resultsRes] = await Promise.all([
    apiRequest("/exams?forStudent=true"),
    apiRequest(`/results/user/${user._id}`),
  ]);

  if (!examsRes.ok) return toast(examsRes.error, "error");
  if (!resultsRes.ok) return toast(resultsRes.error, "error");

  state.exams = examsRes.exams;
  state.myResults = resultsRes.results;

  const pcts = state.myResults.map((r) =>
    Math.round((r.score / (r.totalMarks || 1)) * 100)
  );

  const avg = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;

  const best = pcts.length ? Math.max(...pcts) : null;

  document.getElementById("dashTestsCount").textContent = state.exams.length;
  document.getElementById("dashAttempts").textContent = state.myResults.length;
  document.getElementById("dashAvg").textContent =
    avg === null ? "—" : `${avg}%`;
  document.getElementById("dashBest").textContent =
    best === null ? "—" : `${best}%`;

  const grid = document.getElementById("testGrid");

  if (!state.exams.length) {
    grid.innerHTML = emptyState(
      "📘",
      "No tests available yet",
      "Check back soon — your instructor hasn't published any tests."
    );
    return;
  }

  grid.innerHTML = state.exams
    .map((t) => {
      const attempts = state.myResults.filter(
        (r) => r.examId && r.examId._id === t._id
      ).length;

      return `
        <div class="test-card">
          <span class="subject-tag">${escapeHTML(t.subject || "General")}</span>

          <h3>${escapeHTML(t.title)}</h3>

          <div class="test-meta">
            <span>⏱ ${t.duration} min</span>
            <span>📝 ${t.questions.length} questions</span>
          </div>

          <div class="attempt-note">
            ${
              attempts
                ? `Attempted ${attempts} time${attempts === 1 ? "" : "s"}`
                : "Not attempted yet"
            }
          </div>

          <button
            class="btn btn-primary btn-block"
            data-start="${t._id}"
          >
            ${attempts ? "Retake test" : "Start test"}
          </button>
        </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => openStartModal(btn.dataset.start));
  });
}

// ---------------- start modal ----------------
let pendingStartId = null;

function openStartModal(examId) {
  pendingStartId = examId;

  const exam = state.exams.find((e) => e._id === examId);

  document.getElementById("startModalTitle").textContent =
    `Start "${exam.title}"?`;

  document.getElementById("startModalBody").textContent =
    `You'll have ${exam.duration} minute${
      exam.duration === 1 ? "" : "s"
    } to answer ${exam.questions.length} question${
      exam.questions.length === 1 ? "" : "s"
    }. The timer begins immediately and can't be paused.`;

  document.getElementById("startModalBackdrop").classList.add("active");
}

document
  .getElementById("startModalCancel")
  .addEventListener("click", () => {
    pendingStartId = null;
    document.getElementById("startModalBackdrop").classList.remove("active");
  });

document
  .getElementById("startModalConfirm")
  .addEventListener("click", () => {
    document.getElementById("startModalBackdrop").classList.remove("active");

    if (pendingStartId) {
      beginExam(pendingStartId);
    }
  });

// ---------------- exam-taking engine ----------------
async function beginExam(examId) {
  const res = await apiRequest(`/exams/${examId}?forStudent=true`);

  if (!res.ok) {
    return toast(res.error, "error");
  }

  const exam = res.exam;

  // Fisher-Yates shuffle
  function shuffle(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
  }

  /*
    Shuffle questions.

    For every question we also shuffle its options.

    originalQuestionIndex:
      Stores where the question was originally located.

    optionOriginalIndexes:
      Stores where every displayed option came from originally.

    Example:

    Original:
      A = Wrong
      B = Correct
      C = Wrong
      D = Wrong

    After shuffle:
      A = Correct
      B = Wrong
      C = Wrong
      D = Wrong

    optionOriginalIndexes will tell us that displayed A
    originally came from B.

    This allows us to convert the student's answer back
    to the original database index before submitting.

    NOTE: the `/exams/:id?forStudent=true` endpoint is expected to
    strip the real `correct` answer from each question (anti-cheat),
    so `q.correct` here is usually undefined/missing while the exam
    is being taken. Because of that, `session.questions[i].correct`
    below is NOT reliable and must never be used to grade or to
    render the post-submit review. Grading/review must use the
    backend's `res.breakdown` instead (see submitExam).
  */

  const shuffledQuestions = shuffle(
    exam.questions.map((q, originalQuestionIndex) => {
      const optionData = q.options.map((option, originalIndex) => ({
        option,
        originalIndex,
      }));

      const shuffledOptions = shuffle(optionData);

      return {
        ...q,

        // Original question position in MongoDB
        originalQuestionIndex,

        // Shuffled options shown to student
        options: shuffledOptions.map((x) => x.option),

        // Original option index for each displayed option
        optionOriginalIndexes: shuffledOptions.map(
          (x) => x.originalIndex
        ),

        // NOTE: unreliable during exam-taking — q.correct is usually
        // stripped by the backend for anti-cheat. Kept only for
        // backwards compatibility; do not use for grading/review.
        correct: shuffledOptions.findIndex(
          (x) => x.originalIndex === q.correct
        ),
      };
    })
  );

  session = {
    examId: exam._id,
    title: exam.title,
    subject: exam.subject,

    // Shuffled questions shown to the student
    questions: shuffledQuestions,

    // Student answers use the SHUFFLED/displayed indexes
    answers: new Array(shuffledQuestions.length).fill(-1),

    index: 0,
    secondsLeft: exam.duration * 60,
  };

  document.getElementById("examLogoMark").innerHTML = logoMarkSVG();
  document.getElementById("examTestTitle").textContent = exam.title;
  document.getElementById("examOverlay").style.display = "block";
  document.body.style.overflow = "hidden";

  renderQuestion();
  renderPalette();
  startTimer();
}

function startTimer() {
  clearInterval(timerId);

  updateTimerDisplay();

  timerId = setInterval(() => {
    session.secondsLeft -= 1;

    updateTimerDisplay();

    if (session.secondsLeft <= 0) {
      clearInterval(timerId);
      submitExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById("examTimer");

  const s = Math.max(0, session.secondsLeft);

  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");

  el.textContent = `${mm}:${ss}`;

  el.classList.toggle("low", s <= 60);
}

function renderQuestion() {
  const q = session.questions[session.index];

  document.getElementById("examQIndex").textContent =
    `Question ${session.index + 1} of ${session.questions.length}`;

  document.getElementById("examQText").textContent = q.text;

  const optionsWrap = document.getElementById("examOptions");

  optionsWrap.innerHTML = q.options
    .map(
      (opt, oi) => `
      <button
        type="button"
        class="option-btn ${
          session.answers[session.index] === oi ? "selected" : ""
        }"
        data-opt="${oi}"
      >
        <span class="opt-letter">
          ${String.fromCharCode(65 + oi)}
        </span>

        <span>${escapeHTML(opt)}</span>
      </button>`
    )
    .join("");

  optionsWrap.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.answers[session.index] = Number(btn.dataset.opt);

      renderQuestion();
      renderPalette();
    });
  });

  document.getElementById("examPrev").disabled =
    session.index === 0;

  document.getElementById("examNext").style.visibility =
    session.index === session.questions.length - 1
      ? "hidden"
      : "visible";
}

function renderPalette() {
  const answeredCount = session.answers.filter(
    (a) => a !== -1
  ).length;

  document.getElementById(
    "examProgressLabel"
  ).textContent =
    `${answeredCount} of ${session.questions.length} answered`;

  const grid = document.getElementById("examPalette");

  grid.innerHTML = session.questions
    .map(
      (_, i) => `
      <button
        type="button"
        class="${
          session.answers[i] !== -1 ? "answered" : ""
        } ${
          i === session.index ? "current" : ""
        }"
        data-goto="${i}"
      >
        ${i + 1}
      </button>
    `
    )
    .join("");

  grid.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.index = Number(btn.dataset.goto);

      renderQuestion();
      renderPalette();
    });
  });
}

document.getElementById("examPrev").addEventListener("click", () => {
  if (session.index > 0) {
    session.index -= 1;

    renderQuestion();
    renderPalette();
  }
});

document.getElementById("examNext").addEventListener("click", () => {
  if (session.index < session.questions.length - 1) {
    session.index += 1;

    renderQuestion();
    renderPalette();
  }
});

document.getElementById("examSubmit").addEventListener("click", () => {
  const answeredCount = session.answers.filter(
    (a) => a !== -1
  ).length;

  const remaining =
    session.questions.length - answeredCount;

  document.getElementById("submitModalBody").textContent =
    remaining > 0
      ? `You still have ${remaining} question${
          remaining === 1 ? "" : "s"
        } unanswered. Once submitted, you can't change your answers.`
      : `You've answered every question. Once submitted, you can't change your answers.`;

  document
    .getElementById("submitModalBackdrop")
    .classList.add("active");
});

document
  .getElementById("submitModalCancel")
  .addEventListener("click", () => {
    document
      .getElementById("submitModalBackdrop")
      .classList.remove("active");
  });

document
  .getElementById("submitModalConfirm")
  .addEventListener("click", () => {
    document
      .getElementById("submitModalBackdrop")
      .classList.remove("active");

    submitExam(false);
  });

// ---------------- submit exam ----------------
async function submitExam(auto) {
  clearInterval(timerId);

  const {
    examId,
    title,
    subject,
    questions,
    answers,
  } = session;

  /*
    IMPORTANT:

    The student answered the SHUFFLED questions.

    The backend expects:
      - original question order
      - original option indexes

    Therefore we convert the shuffled answers back
    before sending them to the server.
  */

  const originalAnswers = new Array(
    questions.length
  ).fill(-1);

  questions.forEach((q, shuffledQuestionIndex) => {
    const selectedOption =
      answers[shuffledQuestionIndex];

    // Student skipped this question
    if (
      selectedOption === -1 ||
      selectedOption === undefined
    ) {
      originalAnswers[q.originalQuestionIndex] = -1;
      return;
    }

    /*
      Convert displayed/shuffled option index
      back to the original database option index.
    */
    originalAnswers[q.originalQuestionIndex] =
      q.optionOriginalIndexes[selectedOption];
  });

  const res = await apiRequest(
    `/exams/${examId}/submit`,
    {
      method: "POST",

      body: JSON.stringify({
        userId: user._id,

        // IMPORTANT:
        // Send ORIGINAL indexes to backend
        answers: originalAnswers,
      }),
    }
  );

  document.getElementById("examOverlay").style.display =
    "none";

  document.body.style.overflow = "";

  if (!res.ok) {
    toast(res.error, "error");

    session = null;

    window.location.hash = "dashboard";

    return;
  }

  if (auto) {
    toast(
      "Time's up — your test was submitted automatically."
    );
  }

  /*
    FIX: build the review items from the backend's `res.breakdown`
    instead of the client-side shuffled `q.correct`.

    Why: `/exams/:id?forStudent=true` (used in beginExam) strips the
    real answer key for anti-cheat purposes, so every `q.correct` on
    the client was ending up as -1. That made the post-submit review
    unable to highlight the correct option or mark anything as
    correct, even when the student actually got it right — even
    though score/percentage (which comes straight from res.result)
    was always accurate.

    `res.breakdown` is returned AFTER submission and is in ORIGINAL
    question order, so we look each question up by
    `q.originalQuestionIndex`, then convert the original correct
    option index back into the SHUFFLED/displayed option index using
    `q.optionOriginalIndexes` (the same map used to convert answers
    when submitting).
  */

  const items = questions.map((q, shuffledQuestionIndex) => {
    const given = answers[shuffledQuestionIndex];

    const backendEntry =
      res.breakdown[q.originalQuestionIndex];

    // Map the ORIGINAL correct option index -> SHUFFLED/displayed index
    const correctDisplayIndex = q.optionOriginalIndexes.findIndex(
      (originalIdx) => originalIdx === backendEntry.correct
    );

    return {
      text: q.text,
      options: q.options,
      given,
      correct: correctDisplayIndex,
      isCorrect: backendEntry.isCorrect,
    };
  });

  const correctCount = res.breakdown.filter(
    (b) => b.isCorrect
  ).length;

  const wrongCount = res.breakdown.filter(
    (b) => !b.isCorrect && b.given !== -1
  ).length;

  const skippedCount = res.breakdown.filter(
    (b) => b.given === -1
  ).length;

  const pct = Math.round(
    (res.result.score /
      (res.result.totalMarks || 1)) *
      100
  );

  state.lastResultView = {
    title,
    subject,
    pct,
    correctCount,
    wrongCount,
    skippedCount,
    items,
  };

  session = null;

  window.location.hash = "result";
}

// ---------------- result (just submitted) ----------------
function renderResultView(data) {
  document.getElementById("resultPct").textContent =
    `${data.pct}%`;

  document.getElementById("resultHeadline").textContent =
    data.pct >= 40
      ? "Nice work!"
      : "Test submitted";

  document.getElementById("resultTestName").textContent =
    data.title;

  document.getElementById("rbCorrect").textContent =
    data.correctCount;

  document.getElementById("rbWrong").textContent =
    data.wrongCount;

  document.getElementById("rbSkipped").textContent =
    data.skippedCount;

  const ring =
    document.getElementById("resultRing");

  const color =
    data.pct >= 75
      ? "#2fbf76"
      : data.pct >= 40
      ? "#ffb238"
      : "#ef4444";

  ring.style.borderColor = color;
}

document
  .getElementById("resultReviewBtn")
  .addEventListener("click", () => {
    const data = state.lastResultView;

    state.currentReview = {
      title: data.title,
      subject: data.subject,

      meta:
        `${data.correctCount} correct · ` +
        `${data.wrongCount} wrong · ` +
        `${data.skippedCount} skipped`,

      items: data.items,
    };

    window.location.hash = "review";
  });

document
  .getElementById("resultDoneBtn")
  .addEventListener("click", () => {
    state.lastResultView = null;

    window.location.hash = "dashboard";
  });

// ---------------- results history ----------------
async function loadResultsHistory() {
  const wrap =
    document.getElementById(
      "resultsHistoryWrap"
    );

  wrap.innerHTML =
    `<div class="empty-state">
      <div class="glyph">⏳</div>
      <p>Loading results…</p>
    </div>`;

  const res =
    await apiRequest(
      `/results/user/${user._id}`
    );

  if (!res.ok) {
    return toast(res.error, "error");
  }

  state.myResults = res.results;

  if (!state.myResults.length) {
    wrap.innerHTML = emptyState(
      "📊",
      "No attempts yet",
      "Take a test from your dashboard to see results here."
    );

    return;
  }

  wrap.innerHTML =
    `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Test</th>
            <th>Subject</th>
            <th>Score</th>
            <th>Submitted</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${state.myResults
            .map((r, i) => {
              const pct =
                Math.round(
                  (r.score /
                    (r.totalMarks || 1)) *
                    100
                );

              return `
                <tr>
                  <td>
                    ${escapeHTML(
                      r.examId?.title ||
                        "Deleted test"
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      r.examId?.subject || "—"
                    )}
                  </td>

                  <td>
                    ${pctBadge(pct)}
                  </td>

                  <td>
                    ${formatDate(
                      r.submittedAt
                    )}
                  </td>

                  <td>
                    <button
                      class="btn btn-ghost btn-sm"
                      data-review="${i}"
                    >
                      Review
                    </button>
                  </td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;

  wrap
    .querySelectorAll("[data-review]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        openHistoryReview(
          Number(btn.dataset.review)
        );
      });
    });
}

function openHistoryReview(idx) {
  const r = state.myResults[idx];

  if (!r.examId || !r.examId.questions) {
    toast(
      "This test has been deleted, so a full review isn't available.",
      "error"
    );

    return;
  }

  const pct = Math.round(
    (r.score /
      (r.totalMarks || 1)) *
      100
  );

  const items =
    r.examId.questions.map((q, i) => ({
      text: q.text,

      options: q.options,

      given:
        r.answers[i] !== undefined
          ? r.answers[i]
          : -1,

      correct: q.correct,
    }));

  state.currentReview = {
    title: r.examId.title,
    subject: r.examId.subject,

    meta:
      `${pct}% · Submitted ` +
      `${formatDate(r.submittedAt)}`,

    items,
  };

  window.location.hash = "review";
}

// ---------------- review ----------------
function renderReview(data) {
  document.getElementById(
    "reviewSubject"
  ).textContent =
    data.subject || "Review";

  document.getElementById(
    "reviewTitle"
  ).textContent = data.title;

  document.getElementById(
    "reviewMeta"
  ).textContent = data.meta;

  document.getElementById(
    "reviewList"
  ).innerHTML = data.items
    .map((item, i) => `
      <div class="review-item">

        <div class="q-index">
          Question ${i + 1}
        </div>

        <div class="q-text">
          ${escapeHTML(item.text)}
        </div>

        ${item.options
          .map((opt, oi) => {
            let cls = "";

            if (oi === item.correct) {
              cls = "correct";
            } else if (oi === item.given && oi !== item.correct) {
              cls = "wrong";
            }

            const tag =
              oi === item.correct
                ? " ✓ correct answer"
                : oi === item.given
                ? " ✗ your answer"
                : "";

            return `
              <div class="review-opt ${cls}">
                ${String.fromCharCode(
                  65 + oi
                )}. ${escapeHTML(opt)}${tag}
              </div>
            `;
          })
          .join("")}

        ${
          item.given === -1
            ? `
              <div
                class="text-faint"
                style="font-size:12.5px; margin-top:4px;"
              >
                You skipped this question.
              </div>
            `
            : ""
        }

      </div>
    `)
    .join("");
}

document
  .getElementById("backToResults")
  .addEventListener("click", () => {
    window.location.hash = "results";
  });

// ---------------- shared markup helper ----------------
function emptyState(glyph, title, body) {
  return `
    <div class="empty-state">
      <div class="glyph">${glyph}</div>

      <h4>
        ${escapeHTML(title)}
      </h4>

      <p>
        ${escapeHTML(body)}
      </p>
    </div>
  `;
}

// ---------------- boot ----------------
route();