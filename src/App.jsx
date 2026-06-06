import { useEffect, useRef, useState } from "react";
import tests from "./data/tests.json";
import TeacherDashboard from "./TeacherDashboard";
import { TEST_CONFIG } from "./config";
import { deleteRemoteResult, fetchRemoteResults, fetchRemoteTests, saveRemoteResult, saveRemoteTests } from "./api";
import {
  appendAnalyticsRecord,
  buildAnalyticsSummary,
  buildResult,
  clearSession,
  formatTimer,
  getRemainingSeconds,
  getTotalPoints,
  loadAnalytics,
  mergeAnalyticsRecords,
  removeAnalyticsRecord,
  loadSession,
  saveSession
} from "./utils";

const ICONS = {
  user: "U",
  timer: "T",
  warning: "!",
  question: "Q",
  score: "S",
  pass: "P",
  analytics: "A"
};

const ORIGINAL_TESTS = JSON.parse(JSON.stringify(tests));
const TEST_CONTENT_KEY = "student-test-content-v1";

function replaceTests(nextTests) {
  tests.splice(0, tests.length, ...JSON.parse(JSON.stringify(nextTests)));
}

function loadLocalTests() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEST_CONTENT_KEY));
    return Array.isArray(saved) && saved.length ? saved : null;
  } catch {
    return null;
  }
}

function saveLocalTests(nextTests) {
  localStorage.setItem(TEST_CONTENT_KEY, JSON.stringify(nextTests));
}

function createSubmitChallenge() {
  return {
    left: Math.floor(Math.random() * 8) + 2,
    right: Math.floor(Math.random() * 8) + 2
  };
}

function attemptFullscreen() {
  const element = document.documentElement;

  if (!element.requestFullscreen || document.fullscreenElement) {
    return Promise.resolve(false);
  }

  return element.requestFullscreen().then(() => true).catch(() => false);
}

function restoreFullscreenAfterExit() {
  window.setTimeout(() => {
    attemptFullscreen().catch(() => {});
  }, 200);
}

function findTestById(testId) {
  return tests.find((test) => test.id === testId) || tests[0];
}

function shouldStackOptions(options = []) {
  return options.some((option) => option.length > 42 || option.includes("\n"));
}

function getOptionsListClass(options) {
  return `options-list ${shouldStackOptions(options) ? "options-list--stacked" : ""}`.trim();
}

function IconBadge({ value }) {
  return (
    <span className="icon-badge" aria-hidden="true">
      {value}
    </span>
  );
}

function MetricCard({ icon, label, value, tone = "default" }) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__icon">
        <IconBadge value={icon} />
      </div>
      <div>
        <p className="metric-card__label">{label}</p>
        <p className="metric-card__value">{value}</p>
      </div>
    </div>
  );
}

function DashboardPasswordModal({ password, error, onChange, onSubmit, onCancel }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dashboard-password-title">
      <div className="card modal-card">
        <div className="card__header">
          <div>
            <p className="section-label">Protected Area</p>
            <h2 id="dashboard-password-title">Teacher Access</h2>
          </div>
        </div>

        <p className="modal-card__text">
          Enter the teacher password to open protected teacher tools. You can change this password later in [src/config.js].
        </p>

        <div className="form-grid">
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => onChange(event.target.value)} placeholder="Enter password" />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={onSubmit}>
              Open Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitConfirmationModal({ challenge, answer, error, onAnswerChange, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-confirm-title">
      <div className="card modal-card">
        <div className="card__header">
          <div>
            <p className="section-label">Confirm Submission</p>
            <h2 id="submit-confirm-title">Answer Before Submitting</h2>
          </div>
        </div>

        <p className="modal-card__text">
          To avoid accidental submit clicks, solve this: {challenge.left} + {challenge.right} =
        </p>

        <form className="form-grid" onSubmit={onConfirm}>
          <label className="field">
            <span>Answer</span>
            <input
              type="number"
              inputMode="numeric"
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Enter answer"
              autoFocus
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Submit Test
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestPicker({ selectedTestId, onSelectTest }) {
  return (
    <div className="test-picker">
      {tests.map((test) => {
        const isSelected = selectedTestId === test.id;

        return (
          <button
            key={test.id}
            type="button"
            className={`test-choice ${isSelected ? "is-selected" : ""}`}
            onClick={() => onSelectTest(test.id)}
          >
            <strong>{test.title}</strong>
          </button>
        );
      })}
    </div>
  );
}

function AnalyticsPreview({ records, onOpenDashboard }) {
  const summary = buildAnalyticsSummary(records);

  return (
    <section className="card analytics-card">
      <div className="card__header">
        <div>
          <p className="section-label">Teacher Analytics</p>
          <h2>Dashboard Preview</h2>
        </div>
        <div className="toolbar toolbar--compact">
          <button className="secondary-button" type="button" onClick={onOpenDashboard}>
            Open Dashboard
          </button>
        </div>
      </div>

      <div className="metrics-grid metrics-grid--results">
        <MetricCard icon={ICONS.analytics} label="Attempts" value={summary.totalAttempts} />
        <MetricCard icon={ICONS.user} label="Students" value={summary.uniqueStudents} />
        <MetricCard icon={ICONS.score} label="Avg. Score" value={`${summary.averagePercentage}%`} tone="accent" />
      </div>
    </section>
  );
}

function IntroScreen({ studentDraft, onDraftChange, onStart, analyticsRecords, onOpenDashboard, onOpenPresentation, onOpenEditor }) {
  const selectedTest = findTestById(studentDraft.testId);
  const totalPoints = getTotalPoints(selectedTest.questions);

  return (
    <main className="page-shell">
      <section className="hero-layout">
        <div className="hero-panel">
          <span className="eyebrow">Student Test Website</span>
          <div className="hero-panel__intro">
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-orb hero-orb--large" />
              <div className="hero-orb hero-orb--small" />
              <div className="hero-device">
                <div className="hero-device__top">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="hero-device__screen">
                  <div className="hero-device__badge">{selectedTest.title}</div>
                  <div className="hero-device__line hero-device__line--wide" />
                  <div className="hero-device__line" />
                  <div className="hero-device__choices">
                    <span className="hero-choice is-active" />
                    <span className="hero-choice" />
                    <span className="hero-choice" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard icon={ICONS.question} label="Questions" value={selectedTest.questions.length} />
            <MetricCard icon={ICONS.score} label="Total Points" value={totalPoints} />
            <MetricCard icon={ICONS.timer} label="Time Limit" value={`${selectedTest.durationMinutes} min`} tone="accent" />
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <p className="section-label">Start Test</p>
              <h2>Student Information</h2>
            </div>
            <div className="soft-badge">
              <IconBadge value={ICONS.user} />
            </div>
          </div>

          <form className="form-grid" onSubmit={onStart}>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                placeholder="Enter name"
                value={studentDraft.name}
                onChange={(event) => onDraftChange("name", event.target.value)}
                autoComplete="given-name"
                required
              />
            </label>

            <label className="field">
              <span>Surname</span>
              <input
                type="text"
                placeholder="Enter surname"
                value={studentDraft.surname}
                onChange={(event) => onDraftChange("surname", event.target.value)}
                autoComplete="family-name"
                required
              />
            </label>

            <div className="field">
              <span>Choose Test</span>
              <TestPicker selectedTestId={studentDraft.testId} onSelectTest={(testId) => onDraftChange("testId", testId)} />
            </div>

            <div className="button-row">
              <button className="primary-button" type="submit">
                Start {selectedTest.title}
              </button>
              <button className="secondary-button" type="button" onClick={onOpenDashboard}>
                Teacher Dashboard
              </button>
              <button className="secondary-button" type="button" onClick={onOpenPresentation}>
                Teacher Presentation
              </button>
              <button className="secondary-button" type="button" onClick={onOpenEditor}>
                Teacher Test Editor
              </button>
            </div>
          </form>

          <div className="rules-box">
            <div className="rules-box__title">
              <IconBadge value={ICONS.warning} />
              <strong>Test Rules</strong>
            </div>

            <ul>
              {TEST_CONFIG.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <AnalyticsPreview records={analyticsRecords} onOpenDashboard={onOpenDashboard} />
    </main>
  );
}

function QuestionNavigation({ questions, answers, currentQuestionId, statusByQuestionId = {}, onSelectQuestion }) {
  return (
    <nav className="question-nav" aria-label="Question navigation">
      {questions.map((question, index) => {
        const isCurrent = question.id === currentQuestionId;
        const isAnswered = Boolean(answers[question.id]);
        const status = statusByQuestionId[question.id] || "";

        return (
          <button
            key={question.id}
            type="button"
            className={["question-nav__item", isCurrent ? "is-current" : "", isAnswered ? "is-answered" : "", status ? `is-${status}` : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelectQuestion(index)}
          >
            {index + 1}
          </button>
        );
      })}
    </nav>
  );
}

function TestScreen({
  student,
  selectedTest,
  currentIndex,
  answers,
  remainingSeconds,
  warningMessage,
  violations,
  onSelectQuestion,
  onAnswer,
  onPrevious,
  onNext,
  onSubmit
}) {
  const currentQuestion = selectedTest.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  return (
    <main className="page-shell page-shell--compact">
      <section className="test-layout">
        <header className="topbar">
          <div>
            <span className="eyebrow">Active Session</span>
            <h1>
              {student.name} {student.surname}
            </h1>
            <p className="topbar__subline">
              {selectedTest.title} • {selectedTest.subject}
            </p>
          </div>

          <div className="metrics-grid metrics-grid--top">
            <MetricCard icon={ICONS.timer} label="Time Left" value={formatTimer(remainingSeconds)} tone="accent" />
            <MetricCard icon={ICONS.question} label="Answered" value={`${answeredCount}/${selectedTest.questions.length}`} />
            <MetricCard
              icon={ICONS.warning}
              label="Warnings"
              value={`${violations}/${TEST_CONFIG.maxViolations}`}
              tone="danger"
            />
          </div>
        </header>

        {warningMessage ? (
          <div className="warning-banner" role="alert">
            <IconBadge value={ICONS.warning} />
            <span>{warningMessage}</span>
          </div>
        ) : null}

        <QuestionNavigation
          questions={selectedTest.questions}
          answers={answers}
          currentQuestionId={currentQuestion.id}
          onSelectQuestion={onSelectQuestion}
        />

        <article className="card question-card">
          <div className="question-card__meta">
            <span>
              Question {currentIndex + 1} of {selectedTest.questions.length}
            </span>
            <span>{selectedTest.title}</span>
          </div>

          <div className="question-card__prompt">
            <h2>{currentQuestion.question}</h2>
            {currentQuestion.supportText ? <pre className="question-card__support-text">{currentQuestion.supportText}</pre> : null}
          </div>

          {currentQuestion.supportImage ? (
            <div className="question-media">
              <img
                className="question-media__support"
                src={currentQuestion.supportImage}
                alt={`${currentQuestion.question} supporting figure`}
              />
            </div>
          ) : null}

          <div className={getOptionsListClass(currentQuestion.options)} role="radiogroup" aria-label={`Question ${currentIndex + 1}`}>
            {currentQuestion.options.map((option) => {
              const selected = answers[currentQuestion.id] === option;

              return (
                <button
                  key={option}
                  type="button"
                  className={`option-card ${selected ? "is-selected" : ""}`}
                  onClick={() => onAnswer(currentQuestion.id, option)}
                  aria-pressed={selected}
                >
                  <span className="option-card__indicator" />
                  <span className="option-card__text">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="question-card__actions">
            <button className="secondary-button" type="button" onClick={onPrevious} disabled={currentIndex === 0}>
              Previous
            </button>

            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={onNext}
                disabled={currentIndex === selectedTest.questions.length - 1}
              >
                Next
              </button>
              <button className="primary-button" type="button" onClick={onSubmit}>
                Submit Test
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function ResultScreen({ result, onRestart, onAnalyze }) {
  return (
    <main className="page-shell">
      <section className="results-layout">
        <div className="hero-panel hero-panel--result">
          <div>
            <span className="eyebrow">Completed</span>
            <h1>
              {result.student.name} {result.student.surname}
            </h1>
            <p>{result.testTitle} finished successfully. Your answers were saved.</p>
          </div>

          <div className="status-pill is-pass">
            <IconBadge value={ICONS.pass} />
            <div>
              <strong>Submitted</strong>
              <p>Wait for teacher analysis.</p>
            </div>
          </div>
        </div>

        <div className="button-row">
          <button className="primary-button primary-button--centered" type="button" onClick={onAnalyze}>
            Go To Analyze
          </button>
          <button className="primary-button primary-button--centered" type="button" onClick={onRestart}>
            Return To Test Selection
          </button>
        </div>
      </section>
    </main>
  );
}

function AnalysisPencilLayer() {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const scrollYRef = useRef(null);
  const wasScrollingRef = useRef(false);
  const strokeGestureRef = useRef(null);
  const lastCompletedTapRef = useRef(null);
  const [tool, setTool] = useState("pencil");

  function getPoint(source) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function configureContext(context) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.lineWidth = tool === "eraser" ? 34 : 4;
    context.strokeStyle = "#1b84ff";
  }

  function beginStroke(source, pointerType) {
    const context = canvasRef.current.getContext("2d");
    const point = getPoint(source);

    configureContext(context);
    isDrawingRef.current = true;
    strokeGestureRef.current = {
      pointerType,
      startedAt: Date.now(),
      startX: point.x,
      startY: point.y,
      moved: false
    };
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function continueStroke(source) {
    if (!isDrawingRef.current) {
      return;
    }

    const context = canvasRef.current.getContext("2d");
    const point = getPoint(source);

    if (strokeGestureRef.current) {
      const distance = Math.hypot(point.x - strokeGestureRef.current.startX, point.y - strokeGestureRef.current.startY);

      if (distance > 5) {
        strokeGestureRef.current.moved = true;
      }
    }

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function toggleTool() {
    setTool((current) => (current === "pencil" ? "eraser" : "pencil"));
    isDrawingRef.current = false;
  }

  function finishStroke(pointerType) {
    const gesture = strokeGestureRef.current;
    isDrawingRef.current = false;
    strokeGestureRef.current = null;

    if (
      !gesture ||
      gesture.pointerType !== pointerType ||
      pointerType === "mouse" ||
      gesture.moved ||
      Date.now() - gesture.startedAt > 180
    ) {
      lastCompletedTapRef.current = null;
      return;
    }

    const previousTap = lastCompletedTapRef.current;
    const now = Date.now();

    const tapDistance = previousTap ? Math.hypot(gesture.startX - previousTap.x, gesture.startY - previousTap.y) : Infinity;

    if (previousTap?.pointerType === pointerType && now - previousTap.completedAt < 300 && tapDistance < 40) {
      toggleTool();
      lastCompletedTapRef.current = null;
      return;
    }

    lastCompletedTapRef.current = { pointerType, completedAt: now, x: gesture.startX, y: gesture.startY };
  }

  function handlePointerDown(event) {
    if (event.pointerType === "touch") {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginStroke(event, event.pointerType);
  }

  function handlePointerMove(event) {
    if (event.pointerType === "touch" || !isDrawingRef.current) {
      return;
    }

    event.preventDefault();
    continueStroke(event);
  }

  function stopDrawing(event) {
    if (event?.pointerType && event.pointerType !== "touch") {
      finishStroke(event.pointerType);
    } else {
      isDrawingRef.current = false;
    }

    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
  }

  function handleTouchStart(event) {
    if (event.touches.length >= 2) {
      isDrawingRef.current = false;
      strokeGestureRef.current = null;
      wasScrollingRef.current = true;
      scrollYRef.current = Array.from(event.touches).reduce((sum, touch) => sum + touch.clientY, 0) / event.touches.length;
      return;
    }

    wasScrollingRef.current = false;
    event.preventDefault();
    beginStroke(event.touches[0], "touch");
  }

  function handleTouchMove(event) {
    if (event.touches.length >= 2) {
      event.preventDefault();
      const nextY = Array.from(event.touches).reduce((sum, touch) => sum + touch.clientY, 0) / event.touches.length;

      if (scrollYRef.current !== null) {
        window.scrollBy(0, scrollYRef.current - nextY);
      }

      scrollYRef.current = nextY;
      return;
    }

    event.preventDefault();
    continueStroke(event.touches[0]);
  }

  function handleTouchEnd() {
    if (!wasScrollingRef.current) {
      finishStroke("touch");
    } else {
      isDrawingRef.current = false;
      strokeGestureRef.current = null;
      lastCompletedTapRef.current = null;
    }

    wasScrollingRef.current = false;
    scrollYRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div className="analysis-pencil">
      <div className="analysis-pencil__toolbar" role="toolbar" aria-label="Drawing tools">
        <button
          className={`analysis-pencil__tool ${tool === "pencil" ? "is-active" : ""}`}
          type="button"
          aria-pressed={tool === "pencil"}
          onClick={() => setTool("pencil")}
        >
          Pencil
        </button>
        <button
          className={`analysis-pencil__tool ${tool === "eraser" ? "is-active" : ""}`}
          type="button"
          aria-pressed={tool === "eraser"}
          onClick={() => setTool("eraser")}
        >
          Eraser
        </button>
        <button className="analysis-pencil__tool" type="button" onClick={clearCanvas}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width="1200"
        height="760"
        onDoubleClick={toggleTool}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />
    </div>
  );
}

function StudentAnalysisScreen({ result, currentIndex, onSelectQuestion, onPrevious, onNext, onFinish }) {
  const selectedTest = findTestById(result.testId);
  const reviewItem = result.review[currentIndex];
  const question = selectedTest.questions.find((item) => item.id === reviewItem?.id) || selectedTest.questions[currentIndex];
  const selectedAnswer = reviewItem?.selectedAnswer || "";
  const correctAnswer = reviewItem?.correctAnswer || "";
  const reviewStatusByQuestionId = Object.fromEntries(
    result.review.map((item) => [item.id, item.isCorrect ? "correct" : item.selectedAnswer ? "wrong" : "empty"])
  );

  return (
    <main className="page-shell page-shell--compact">
      <section className="test-layout">
        <header className="topbar">
          <div>
            <span className="eyebrow">Student Analysis</span>
            <h1>
              {result.student.name} {result.student.surname}
            </h1>
            <p className="topbar__subline">
              {result.testTitle} • Question {currentIndex + 1} of {result.review.length}
            </p>
          </div>
        </header>

        <QuestionNavigation
          questions={result.review}
          answers={Object.fromEntries(result.review.filter((item) => item.selectedAnswer).map((item) => [item.id, item.selectedAnswer]))}
          currentQuestionId={reviewItem?.id}
          statusByQuestionId={reviewStatusByQuestionId}
          onSelectQuestion={onSelectQuestion}
        />

        <article className="card question-card">
          <div className="student-analysis-content">
            <div className="question-card__meta">
              <span>
                Question {currentIndex + 1} of {result.review.length}
              </span>
              <span>{question?.subject || "Analysis"}</span>
            </div>

            <div className="question-card__prompt">
              <h2>{question?.question || reviewItem?.question}</h2>
              {question?.supportText ? <pre className="question-card__support-text">{question.supportText}</pre> : null}
            </div>

            {question?.supportImage ? (
              <div className="question-media">
                <img
                  className="question-media__support"
                  src={question.supportImage}
                  alt={`${question.question} supporting figure`}
                />
              </div>
            ) : null}

            <div className={getOptionsListClass(question?.options)} role="list" aria-label={`Question ${currentIndex + 1} answer choices`}>
              {(question?.options || []).map((option) => {
                const isStudentAnswer = selectedAnswer === option;
                const isCorrectAnswer = correctAnswer === option;

                return (
                  <div
                    key={option}
                    className={[
                      "option-card",
                      isCorrectAnswer ? "is-correct-answer" : "",
                      isStudentAnswer && !isCorrectAnswer ? "is-student-wrong" : "",
                      isStudentAnswer ? "is-selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role="listitem"
                  >
                    <span className="option-card__indicator" />
                    <span className="option-card__text">{option}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="question-card__actions">
            <button className="secondary-button" type="button" onClick={onPrevious} disabled={currentIndex === 0}>
              Previous
            </button>

            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={onNext}
                disabled={currentIndex === result.review.length - 1}
              >
                Next
              </button>
              <button className="primary-button" type="button" onClick={onFinish}>
                Finish Analysis
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function TeacherTestEditor({ onSaveTests, onExit }) {
  const [selectedTestId, setSelectedTestId] = useState(tests[0].id);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(tests[0].questions[0])));
  const [status, setStatus] = useState("");
  const selectedTest = findTestById(selectedTestId);

  function selectQuestion(index) {
    setSelectedQuestionIndex(index);
    setDraft(JSON.parse(JSON.stringify(selectedTest.questions[index])));
    setStatus("");
  }

  function selectTest(testId) {
    const nextTest = findTestById(testId);
    setSelectedTestId(testId);
    setSelectedQuestionIndex(0);
    setDraft(JSON.parse(JSON.stringify(nextTest.questions[0])));
    setStatus("");
  }

  function updateOption(index, value) {
    setDraft((current) => {
      const options = [...current.options];
      const previousValue = options[index];
      options[index] = value;

      return {
        ...current,
        options,
        correctAnswer: current.correctAnswer === previousValue ? value : current.correctAnswer
      };
    });
  }

  function addOption() {
    setDraft((current) => ({ ...current, options: [...current.options, `Answer ${current.options.length + 1}`] }));
  }

  function removeOption(index) {
    setDraft((current) => {
      if (current.options.length <= 2) {
        return current;
      }

      const removed = current.options[index];
      const options = current.options.filter((_, optionIndex) => optionIndex !== index);
      return {
        ...current,
        options,
        correctAnswer: current.correctAnswer === removed ? options[0] : current.correctAnswer
      };
    });
  }

  async function saveQuestion() {
    if (!draft.question.trim() || draft.options.some((option) => !option.trim()) || !draft.correctAnswer) {
      setStatus("Question, answers, and correct answer are required.");
      return;
    }

    const nextTests = JSON.parse(JSON.stringify(tests));
    const test = nextTests.find((item) => item.id === selectedTestId);
    test.questions[selectedQuestionIndex] = { ...draft, points: Math.max(1, Number(draft.points) || 1) };
    await onSaveTests(nextTests);
    setStatus("Question saved.");
  }

  async function addQuestion() {
    const nextTests = JSON.parse(JSON.stringify(tests));
    const test = nextTests.find((item) => item.id === selectedTestId);
    const nextId = Math.max(0, ...test.questions.map((question) => Number(question.id) || 0)) + 1;
    const question = {
      id: nextId,
      question: "New question",
      supportText: "",
      options: ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
      correctAnswer: "Answer 1",
      points: 1,
      subject: test.subject,
      topic: "General"
    };
    test.questions.push(question);
    await onSaveTests(nextTests);
    setSelectedQuestionIndex(test.questions.length - 1);
    setDraft(question);
    setStatus("New question added.");
  }

  async function duplicateQuestion() {
    const nextTests = JSON.parse(JSON.stringify(tests));
    const test = nextTests.find((item) => item.id === selectedTestId);
    const nextId = Math.max(0, ...test.questions.map((question) => Number(question.id) || 0)) + 1;
    const duplicate = { ...JSON.parse(JSON.stringify(draft)), id: nextId, question: `${draft.question} (copy)` };
    test.questions.splice(selectedQuestionIndex + 1, 0, duplicate);
    await onSaveTests(nextTests);
    setSelectedQuestionIndex(selectedQuestionIndex + 1);
    setDraft(duplicate);
    setStatus("Question duplicated.");
  }

  async function deleteQuestion() {
    if (selectedTest.questions.length <= 1 || !window.confirm("Delete this question?")) {
      return;
    }

    const nextTests = JSON.parse(JSON.stringify(tests));
    const test = nextTests.find((item) => item.id === selectedTestId);
    test.questions.splice(selectedQuestionIndex, 1);
    await onSaveTests(nextTests);
    const nextIndex = Math.min(selectedQuestionIndex, test.questions.length - 1);
    setSelectedQuestionIndex(nextIndex);
    setDraft(JSON.parse(JSON.stringify(test.questions[nextIndex])));
    setStatus("Question deleted.");
  }

  async function resetTests() {
    if (!window.confirm("Reset every edited test and question to the original version?")) {
      return;
    }

    await onSaveTests(ORIGINAL_TESTS);
    setSelectedTestId(ORIGINAL_TESTS[0].id);
    setSelectedQuestionIndex(0);
    setDraft(JSON.parse(JSON.stringify(ORIGINAL_TESTS[0].questions[0])));
    setStatus("All tests reset to original content.");
  }

  return (
    <main className="page-shell page-shell--compact teacher-editor-page">
      <header className="topbar teacher-editor-header">
        <div>
          <span className="eyebrow">Teacher Workspace</span>
          <h1>Test Editor</h1>
          <p className="topbar__subline">Edit questions, answers, correct choices, topics, and points.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={resetTests}>Reset Original</button>
          <button className="secondary-button" type="button" onClick={onExit}>Exit Editor</button>
        </div>
      </header>

      <div className="teacher-test-switcher" role="group" aria-label="Choose test to edit">
        {tests.map((test) => (
          <button
            key={test.id}
            className={`teacher-test-switcher__item ${test.id === selectedTestId ? "is-selected" : ""}`}
            type="button"
            onClick={() => selectTest(test.id)}
          >
            <strong>{test.title}</strong>
            <span>{test.questions.length} questions</span>
          </button>
        ))}
      </div>

      <section className="teacher-editor-layout">
        <aside className="card teacher-editor-sidebar">
          <div className="card__header">
            <div>
              <p className="section-label">{selectedTest.title}</p>
              <h2>Questions</h2>
            </div>
            <button className="primary-button teacher-editor-add" type="button" onClick={addQuestion}>Add</button>
          </div>
          <div className="teacher-editor-question-list">
            {selectedTest.questions.map((question, index) => (
              <button
                key={question.id}
                className={`teacher-editor-question ${index === selectedQuestionIndex ? "is-selected" : ""}`}
                type="button"
                onClick={() => selectQuestion(index)}
              >
                <strong>{index + 1}</strong>
                <span>{question.question}</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="card teacher-editor-form">
          <div className="teacher-editor-form__actions">
            <button className="secondary-button" type="button" onClick={duplicateQuestion}>Duplicate</button>
            <button className="danger-button" type="button" onClick={deleteQuestion}>Delete</button>
          </div>

          <label className="field">
            <span>Question</span>
            <textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows="3" />
          </label>

          <label className="field">
            <span>Support text or code (optional)</span>
            <textarea value={draft.supportText || ""} onChange={(event) => setDraft({ ...draft, supportText: event.target.value })} rows="5" />
          </label>

          <div className="teacher-editor-meta">
            <label className="field">
              <span>Topic</span>
              <input value={draft.topic || ""} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} />
            </label>
            <label className="field">
              <span>Points</span>
              <input type="number" min="1" value={draft.points || 1} onChange={(event) => setDraft({ ...draft, points: event.target.value })} />
            </label>
          </div>

          <div className="teacher-editor-answers">
            <div className="card__header">
              <div>
                <p className="section-label">Answers</p>
                <h2>Choose the correct answer</h2>
              </div>
              <button className="secondary-button" type="button" onClick={addOption}>Add Answer</button>
            </div>
            {draft.options.map((option, index) => (
              <div className={`teacher-editor-answer ${draft.correctAnswer === option ? "is-correct" : ""}`} key={index}>
                <input
                  type="radio"
                  name="correct-answer"
                  checked={draft.correctAnswer === option}
                  onChange={() => setDraft({ ...draft, correctAnswer: option })}
                  aria-label={`Mark answer ${index + 1} correct`}
                />
                <textarea value={option} onChange={(event) => updateOption(index, event.target.value)} rows="2" />
                <button className="teacher-editor-remove" type="button" onClick={() => removeOption(index)} aria-label={`Remove answer ${index + 1}`}>×</button>
              </div>
            ))}
          </div>

          {status ? <p className="teacher-editor-status">{status}</p> : null}
          <button className="primary-button teacher-editor-save" type="button" onClick={saveQuestion}>Save Question</button>
        </article>
      </section>
    </main>
  );
}

function TeacherPresentationScreen({ selectedTestId, currentIndex, onSelectTest, onSelectQuestion, onExit }) {
  const selectedTest = findTestById(selectedTestId);
  const question = selectedTest.questions[currentIndex] || selectedTest.questions[0];

  return (
    <main className="page-shell page-shell--compact teacher-presentation-page">
      <section className="test-layout">
        <header className="topbar teacher-presentation-header">
          <div>
            <span className="eyebrow">Teacher Presentation</span>
            <h1>{selectedTest.title}</h1>
            <p className="topbar__subline">
              Question {currentIndex + 1} of {selectedTest.questions.length}
            </p>
          </div>

          <div className="teacher-presentation-toolbar">
            <div className="teacher-test-switcher" role="group" aria-label="Choose presentation test">
              {tests.map((test) => {
                const isSelected = test.id === selectedTestId;

                return (
                  <button
                    key={test.id}
                    className={`teacher-test-switcher__item ${isSelected ? "is-selected" : ""}`}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectTest(test.id)}
                  >
                    <strong>{test.title}</strong>
                    <span>{test.questions.length} questions</span>
                  </button>
                );
              })}
            </div>
            <button className="secondary-button" type="button" onClick={onExit}>
              Exit Presentation
            </button>
          </div>
        </header>

        <QuestionNavigation
          questions={selectedTest.questions}
          answers={{}}
          currentQuestionId={question.id}
          onSelectQuestion={onSelectQuestion}
        />

        <article className="card question-card teacher-presentation-card">
          <div className="analysis-write-zone">
            <div className="question-card__meta">
              <span>
                Question {currentIndex + 1} of {selectedTest.questions.length}
              </span>
              <span>{question.subject || "Teacher Presentation"}</span>
            </div>

            <div className="question-card__prompt">
              <h2>{question.question}</h2>
              {question.supportText ? <pre className="question-card__support-text">{question.supportText}</pre> : null}
            </div>

            {question.supportImage ? (
              <div className="question-media">
                <img className="question-media__support" src={question.supportImage} alt={`${question.question} supporting figure`} />
              </div>
            ) : null}

            <div className={getOptionsListClass(question.options)} role="list" aria-label={`Question ${currentIndex + 1} answer choices`}>
              {question.options.map((option) => (
                <div
                  key={option}
                  className={`option-card ${option === question.correctAnswer ? "is-correct-answer" : ""}`}
                  role="listitem"
                >
                  <span className="option-card__indicator" />
                  <span className="option-card__text">{option}</span>
                </div>
              ))}
            </div>

            <AnalysisPencilLayer key={`${selectedTest.id}-${question.id}`} />
          </div>
        </article>
      </section>
    </main>
  );
}

function ScoreRevealScreen({ result, onRestart, onAnalyzeAgain }) {
  const scoreStyle = {
    "--score-percentage": `${Math.max(0, Math.min(100, result.percentage))}%`
  };

  return (
    <main className="page-shell">
      <section className="score-reveal" aria-labelledby="score-reveal-title">
        <div className="score-reveal__content">
          <div className="score-reveal__eyebrow">Analysis Complete</div>
          <h1 id="score-reveal-title">
            {result.student.name} {result.student.surname}
          </h1>
          <p className="score-reveal__subtitle">{result.testTitle}</p>

          <div className="score-reveal__meter" style={scoreStyle} aria-label={`${result.percentage}% score`}>
            <div className="score-reveal__meter-inner">
              <span>{result.score}</span>
              <small>/ {result.totalPoints}</small>
            </div>
          </div>

          <div className="score-reveal__stats">
            <div>
              <span>Points</span>
              <strong>
                {result.score}/{result.totalPoints}
              </strong>
            </div>
            <div>
              <span>Percentage</span>
              <strong>{result.percentage}%</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{result.passed ? "Passed" : "Keep Practicing"}</strong>
            </div>
          </div>

          <div className="score-reveal__emoji-row" aria-hidden="true">
            <span>🎯</span>
            <span>📚</span>
            <span>✨</span>
          </div>

          <div className="button-row score-reveal__actions">
            <button className="primary-button primary-button--centered" type="button" onClick={onRestart}>
              Return To Test Selection
            </button>
            <button className="secondary-button primary-button--centered" type="button" onClick={onAnalyzeAgain}>
              Review Answers Again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function ScoreUnlockScreen({ input, error, onInputChange, onSubmit, onBackToAnalyze }) {
  return (
    <main className="page-shell">
      <section className="score-unlock" aria-labelledby="score-unlock-title">
        <div className="score-unlock__panel">
          <div className="score-unlock__content">
            <span className="eyebrow">Teacher Confirmation</span>
            <h1 id="score-unlock-title">Enter teacher code</h1>
            <p>Results open after your teacher gives the confirmation number.</p>

            <form className="score-unlock__form" onSubmit={onSubmit}>
              <label className="field">
                <span>Confirmation Code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={input}
                  onChange={(event) => onInputChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4-digit code"
                  autoFocus
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}

              <div className="button-row score-unlock__actions">
                <button className="primary-button primary-button--centered" type="submit">
                  Show Results
                </button>
                <button className="secondary-button primary-button--centered" type="button" onClick={onBackToAnalyze}>
                  Back To Analyze
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [, setTestContentVersion] = useState(0);
  const [studentDraft, setStudentDraft] = useState({ name: "", surname: "", testId: tests[0].id });
  const [student, setStudent] = useState(null);
  const [selectedTestId, setSelectedTestId] = useState(tests[0].id);
  const [stage, setStage] = useState("intro");
  const [viewMode, setViewMode] = useState("student");
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [analysisIndex, setAnalysisIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(findTestById(tests[0].id).durationMinutes * 60);
  const [violations, setViolations] = useState(0);
  const [warningMessage, setWarningMessage] = useState("");
  const [result, setResult] = useState(null);
  const [analyticsRecords, setAnalyticsRecords] = useState([]);
  const [dashboardPasswordInput, setDashboardPasswordInput] = useState("");
  const [dashboardPasswordError, setDashboardPasswordError] = useState("");
  const [isDashboardUnlocked, setIsDashboardUnlocked] = useState(false);
  const [showDashboardPasswordModal, setShowDashboardPasswordModal] = useState(false);
  const [teacherAccessTarget, setTeacherAccessTarget] = useState("teacher");
  const [presentationTestId, setPresentationTestId] = useState(tests[0].id);
  const [presentationQuestionIndex, setPresentationQuestionIndex] = useState(0);
  const [submitChallenge, setSubmitChallenge] = useState(createSubmitChallenge);
  const [submitChallengeAnswer, setSubmitChallengeAnswer] = useState("");
  const [submitChallengeError, setSubmitChallengeError] = useState("");
  const [showSubmitConfirmationModal, setShowSubmitConfirmationModal] = useState(false);
  const [scoreUnlockInput, setScoreUnlockInput] = useState("");
  const [scoreUnlockError, setScoreUnlockError] = useState("");
  const [analyticsSource, setAnalyticsSource] = useState("local");
  const [apiStatusMessage, setApiStatusMessage] = useState("");
  const sessionRef = useRef(null);
  const lastViolationAtRef = useRef(0);
  const hadFullscreenRef = useRef(false);
  const questionStartedAtRef = useRef(Date.now());
  const questionTimingsRef = useRef({});

  const selectedTest = findTestById(selectedTestId);

  useEffect(() => {
    const localTests = loadLocalTests();

    if (localTests) {
      replaceTests(localTests);
      setTestContentVersion((version) => version + 1);
    }

    fetchRemoteTests()
      .then((remoteTests) => {
        if (!remoteTests) {
          return;
        }

        replaceTests(remoteTests);
        saveLocalTests(remoteTests);
        setTestContentVersion((version) => version + 1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const localRecords = loadAnalytics();
    setAnalyticsRecords(localRecords);

    let isMounted = true;

    fetchRemoteResults()
      .then(({ records: remoteRecords, source }) => {
        if (!isMounted) {
          return;
        }

        setAnalyticsRecords(mergeAnalyticsRecords(remoteRecords, localRecords));
        setAnalyticsSource(source);
        setApiStatusMessage(remoteRecords.length ? "Results loaded from the shared server." : "Shared server has no records yet.");

        return syncLocalAnalyticsToRemote(localRecords).then((syncedCount) => {
          if (!isMounted || !syncedCount) {
            return;
          }

          return refreshRemoteAnalytics(localRecords);
        });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setAnalyticsSource("local");
        setApiStatusMessage("Backend unavailable. Using local browser records.");
      });

    const saved = loadSession();

    if (!saved) {
      return;
    }

    if (saved.stage === "active") {
      const resumedTest = findTestById(saved.testId);
      const nextRemaining = getRemainingSeconds(saved.expiresAt);

      if (nextRemaining <= 0) {
        const expiredResult = buildResult({
          testId: resumedTest.id,
          testTitle: resumedTest.title,
          questions: resumedTest.questions,
          answers: saved.answers || {},
          student: saved.student,
          startedAt: saved.startedAt,
          submittedAt: saved.expiresAt,
          passPercentage: resumedTest.passPercentage || TEST_CONFIG.passPercentage,
          warningCount: saved.violations || 0,
          questionTimings: saved.questionTimings || {},
          note: "Time limit reached."
        });

        setResult(expiredResult);
        setStudent(saved.student);
        setSelectedTestId(resumedTest.id);
        setStudentDraft({ ...saved.student, testId: resumedTest.id });
        setStage("result");
        setAnalysisIndex(0);
        clearSession();
        const nextLocalRecords = appendAnalyticsRecord(expiredResult);
        setAnalyticsRecords(nextLocalRecords);
        saveRemoteResult(expiredResult)
          .then(() => refreshRemoteAnalytics(nextLocalRecords))
          .catch(() => {
            if (!isMounted) {
              return;
            }

            setApiStatusMessage("Timed-out result saved locally. Backend sync is currently unavailable.");
            setAnalyticsSource("local");
          });
        return;
      }

      setStudent(saved.student);
      setSelectedTestId(resumedTest.id);
      setStudentDraft({ ...saved.student, testId: resumedTest.id });
      setAnswers(saved.answers || {});
      setCurrentIndex(saved.currentIndex || 0);
      setViolations(saved.violations || 0);
      setRemainingSeconds(nextRemaining);
      setStage("active");
      sessionRef.current = saved;
      questionTimingsRef.current = saved.questionTimings || {};
      questionStartedAtRef.current = Date.now();
      return;
    }

    if (saved.stage === "result" && saved.result) {
      setStudent(saved.student);
      setSelectedTestId(saved.result.testId || tests[0].id);
      setStudentDraft({ ...saved.student, testId: saved.result.testId || tests[0].id });
      setResult(saved.result);
      setStage("result");
      setAnalysisIndex(0);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (stage !== "active") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      const activeSession = sessionRef.current;

      if (!activeSession) {
        return;
      }

      const nextRemaining = getRemainingSeconds(activeSession.expiresAt);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        submitTest("Time limit reached.");
      }
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [stage]);

  useEffect(() => {
    if (stage !== "active") {
      return undefined;
    }

    // Use multiple browser signals so warnings behave reliably across desktop and mobile browsers.
    const registerViolation = (reason) => {
      const now = Date.now();

      if (now - lastViolationAtRef.current < 1500) {
        return;
      }

      lastViolationAtRef.current = now;

      setViolations((current) => {
        const next = current + 1;
        const nextMessage = `You left the test page. Warning ${next}/${TEST_CONFIG.maxViolations}`;
        setWarningMessage(nextMessage);

        const nextSession = {
          ...sessionRef.current,
          violations: next,
          violationReason: reason
        };

        sessionRef.current = nextSession;
        saveSession(nextSession);

        if (next >= TEST_CONFIG.maxViolations) {
          window.setTimeout(() => submitTest("Maximum violations reached."), 250);
        }

        return next;
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        registerViolation("visibility-change");
      }
    };

    const onBlur = () => {
      if (!document.hidden) {
        registerViolation("window-blur");
      }
    };

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        hadFullscreenRef.current = true;
        return;
      }

      if (hadFullscreenRef.current) {
        registerViolation("fullscreen-exit");
        restoreFullscreenAfterExit();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [stage, currentIndex, selectedTestId]);

  useEffect(() => {
    if (!warningMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setWarningMessage(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [warningMessage]);

  function commitCurrentQuestionTime(nextIndex = currentIndex) {
    if (stage !== "active" || !selectedTest.questions[currentIndex]) {
      return questionTimingsRef.current;
    }

    const currentQuestionId = selectedTest.questions[currentIndex].id;
    const elapsedSeconds = Math.max(0, (Date.now() - questionStartedAtRef.current) / 1000);
    const nextTimings = {
      ...questionTimingsRef.current,
      [currentQuestionId]: (questionTimingsRef.current[currentQuestionId] || 0) + elapsedSeconds
    };

    questionTimingsRef.current = nextTimings;
    questionStartedAtRef.current = Date.now();

    if (sessionRef.current) {
      persistSession({
        ...sessionRef.current,
        currentIndex: nextIndex,
        questionTimings: nextTimings
      });
    }

    return nextTimings;
  }

  function persistSession(nextSession) {
    sessionRef.current = nextSession;
    saveSession(nextSession);
  }

  function updateDraft(field, value) {
    setStudentDraft((current) => ({
      ...current,
      [field]: value
    }));

    if (field === "testId") {
      setSelectedTestId(value);
      setRemainingSeconds(findTestById(value).durationMinutes * 60);
    }
  }

  function startTest(event) {
    event.preventDefault();

    const nextStudent = {
      name: studentDraft.name.trim(),
      surname: studentDraft.surname.trim()
    };

    if (!nextStudent.name || !nextStudent.surname) {
      return;
    }

    const chosenTest = findTestById(studentDraft.testId);
    const startedAt = Date.now();
    const expiresAt = startedAt + chosenTest.durationMinutes * 60 * 1000;

    const nextSession = {
      stage: "active",
      student: nextStudent,
      testId: chosenTest.id,
      answers: {},
      currentIndex: 0,
      violations: 0,
      questionTimings: {},
      startedAt,
      expiresAt
    };

    setViewMode("student");
    setStudent(nextStudent);
    setSelectedTestId(chosenTest.id);
    setAnswers({});
    setCurrentIndex(0);
    setViolations(0);
    setWarningMessage("");
    setRemainingSeconds(chosenTest.durationMinutes * 60);
    setResult(null);
    setStage("active");
    questionTimingsRef.current = {};
    questionStartedAtRef.current = Date.now();
    persistSession(nextSession);

    attemptFullscreen().then((entered) => {
      if (entered) {
        hadFullscreenRef.current = true;
      }
    });
  }

  function requestTeacherDashboard() {
    if (isDashboardUnlocked) {
      setViewMode("teacher");
      return;
    }

    setTeacherAccessTarget("teacher");
    setDashboardPasswordInput("");
    setDashboardPasswordError("");
    setShowDashboardPasswordModal(true);
  }

  function requestTeacherPresentation() {
    if (isDashboardUnlocked) {
      setViewMode("teacherPresentation");
      return;
    }

    setTeacherAccessTarget("teacherPresentation");
    setDashboardPasswordInput("");
    setDashboardPasswordError("");
    setShowDashboardPasswordModal(true);
  }

  function requestTeacherEditor() {
    if (isDashboardUnlocked) {
      setViewMode("teacherEditor");
      return;
    }

    setTeacherAccessTarget("teacherEditor");
    setDashboardPasswordInput("");
    setDashboardPasswordError("");
    setShowDashboardPasswordModal(true);
  }

  async function handleSaveTests(nextTests) {
    replaceTests(nextTests);
    saveLocalTests(nextTests);
    setTestContentVersion((version) => version + 1);

    try {
      await saveRemoteTests(nextTests);
    } catch {
      setApiStatusMessage("Test edits saved on this browser. Backend sync is currently unavailable.");
    }
  }

  function openTeacherDashboard() {
    if (dashboardPasswordInput === TEST_CONFIG.teacherDashboardPassword) {
      setIsDashboardUnlocked(true);
      setDashboardPasswordError("");
      setShowDashboardPasswordModal(false);
      setViewMode(teacherAccessTarget);
      return;
    }

    setDashboardPasswordError("Incorrect password.");
  }

  function lockTeacherDashboard() {
    setIsDashboardUnlocked(false);
    setViewMode("student");
    setShowDashboardPasswordModal(false);
    setDashboardPasswordInput("");
    setDashboardPasswordError("");
  }

  function selectPresentationTest(testId) {
    setPresentationTestId(testId);
    setPresentationQuestionIndex(0);
  }

  async function handleDeleteRecord(record) {
    if (!record?.attemptId) {
      return;
    }

    const studentName = `${record.student?.name || ""} ${record.student?.surname || ""}`.trim();
    const confirmed = window.confirm(`Remove ${studentName}'s ${record.testTitle} result?`);

    if (!confirmed) {
      return;
    }

    const nextLocalRecords = removeAnalyticsRecord(record.attemptId);
    const nextMergedRecords = analyticsRecords.filter((item) => item.attemptId !== record.attemptId);

    setAnalyticsRecords(nextMergedRecords);

    try {
      await deleteRemoteResult(record.attemptId);
      await refreshRemoteAnalytics(nextLocalRecords);
    } catch {
      setAnalyticsRecords(mergeAnalyticsRecords(nextMergedRecords, nextLocalRecords));
      setApiStatusMessage("Result removed locally. Backend delete is currently unavailable.");
      setAnalyticsSource("local");
    }
  }

  function requestSubmitConfirmation() {
    setSubmitChallenge(createSubmitChallenge());
    setSubmitChallengeAnswer("");
    setSubmitChallengeError("");
    setShowSubmitConfirmationModal(true);
  }

  function confirmSubmitTest(event) {
    event.preventDefault();

    const expected = submitChallenge.left + submitChallenge.right;

    if (Number(submitChallengeAnswer) !== expected) {
      setSubmitChallengeError("Wrong answer. Try again before submitting.");
      return;
    }

    setShowSubmitConfirmationModal(false);
    submitTest("Submitted by student.");
  }

  function openStudentAnalysis() {
    setAnalysisIndex(0);
    setStage("analysis");
  }

  function requestScoreUnlock() {
    setScoreUnlockInput("");
    setScoreUnlockError("");
    setStage("scoreGate");
  }

  function confirmScoreUnlock(event) {
    event.preventDefault();

    if (scoreUnlockInput !== TEST_CONFIG.teacherResultCode) {
      setScoreUnlockError("Incorrect code. Ask the teacher for the confirmation code.");
      return;
    }

    setScoreUnlockError("");
    setStage("score");
  }

  function handleAnalysisPrevious() {
    setAnalysisIndex((current) => Math.max(0, current - 1));
  }

  function handleAnalysisNext() {
    setAnalysisIndex((current) => Math.min((result?.review.length || 1) - 1, current + 1));
  }

  function handleAnswer(questionId, answer) {
    setAnswers((current) => {
      const nextAnswers = {
        ...current,
        [questionId]: answer
      };

      persistSession({
        ...sessionRef.current,
        answers: nextAnswers
      });

      return nextAnswers;
    });
  }

  function handleSelectQuestion(index) {
    commitCurrentQuestionTime(index);
    setCurrentIndex(index);
  }

  function handlePrevious() {
    if (currentIndex === 0) {
      return;
    }

    handleSelectQuestion(currentIndex - 1);
  }

  function handleNext() {
    if (currentIndex === selectedTest.questions.length - 1) {
      return;
    }

    handleSelectQuestion(currentIndex + 1);
  }

  async function refreshRemoteAnalytics(localRecords) {
    try {
      const { records: remoteRecords, source } = await fetchRemoteResults();
      setAnalyticsRecords(mergeAnalyticsRecords(remoteRecords, localRecords));
      setAnalyticsSource(source);
      setApiStatusMessage("Results synced to the shared server.");
    } catch {
      setAnalyticsRecords(localRecords);
      setAnalyticsSource("local");
      setApiStatusMessage("Result saved locally. Backend sync is currently unavailable.");
    }
  }

  async function syncLocalAnalyticsToRemote(localRecords) {
    const recordsToSync = (localRecords || []).filter((record) => record?.attemptId);

    if (!recordsToSync.length) {
      return 0;
    }

    const results = await Promise.allSettled(recordsToSync.map((record) => saveRemoteResult(record)));
    return results.filter((result) => result.status === "fulfilled").length;
  }

  async function submitTest(note = "Submitted by student.") {
    const activeSession = sessionRef.current;

    if (!activeSession || stage === "result") {
      return;
    }

    const activeTest = findTestById(activeSession.testId);
    const finalQuestionTimings = commitCurrentQuestionTime(activeSession.currentIndex || currentIndex);
    const submittedAt = Date.now();
    const nextResult = buildResult({
      testId: activeTest.id,
      testTitle: activeTest.title,
      questions: activeTest.questions,
      answers: activeSession.answers || {},
      student: activeSession.student,
      startedAt: activeSession.startedAt,
      submittedAt,
      passPercentage: activeTest.passPercentage || TEST_CONFIG.passPercentage,
      warningCount: activeSession.violations || 0,
      questionTimings: finalQuestionTimings,
      note
    });

    setResult(nextResult);
    setStage("result");
    setAnalysisIndex(0);
    setWarningMessage("");
    const nextLocalRecords = appendAnalyticsRecord(nextResult);
    setAnalyticsRecords(nextLocalRecords);

    clearSession();
    saveSession({
      stage: "result",
      student: activeSession.student,
      result: nextResult
    });

    sessionRef.current = null;

    try {
      await saveRemoteResult(nextResult);
      await refreshRemoteAnalytics(nextLocalRecords);
    } catch {
      setApiStatusMessage("Result saved locally. Backend sync is currently unavailable.");
      setAnalyticsSource("local");
    }
  }

  function restart() {
    clearSession();
    sessionRef.current = null;
    hadFullscreenRef.current = false;
    questionTimingsRef.current = {};
    setStudent(null);
    setStage("intro");
    setViewMode("student");
    setShowSubmitConfirmationModal(false);
    setSubmitChallengeAnswer("");
    setSubmitChallengeError("");
    setScoreUnlockInput("");
    setScoreUnlockError("");
    setAnswers({});
    setCurrentIndex(0);
    setAnalysisIndex(0);
    setRemainingSeconds(findTestById(studentDraft.testId).durationMinutes * 60);
    setViolations(0);
    setWarningMessage("");
    setResult(null);
  }

  if (stage === "active" && student) {
    return (
      <>
        <TestScreen
          student={student}
          selectedTest={selectedTest}
          currentIndex={currentIndex}
          answers={answers}
          remainingSeconds={remainingSeconds}
          warningMessage={warningMessage}
          violations={violations}
          onSelectQuestion={handleSelectQuestion}
          onAnswer={handleAnswer}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onSubmit={requestSubmitConfirmation}
        />
        {showSubmitConfirmationModal ? (
          <SubmitConfirmationModal
            challenge={submitChallenge}
            answer={submitChallengeAnswer}
            error={submitChallengeError}
            onAnswerChange={setSubmitChallengeAnswer}
            onConfirm={confirmSubmitTest}
            onCancel={() => setShowSubmitConfirmationModal(false)}
          />
        ) : null}
      </>
    );
  }

  if (viewMode === "teacherPresentation" && stage !== "active") {
    return (
      <TeacherPresentationScreen
        selectedTestId={presentationTestId}
        currentIndex={presentationQuestionIndex}
        onSelectTest={selectPresentationTest}
        onSelectQuestion={setPresentationQuestionIndex}
        onExit={() => setViewMode("student")}
      />
    );
  }

  if (viewMode === "teacherEditor" && stage !== "active") {
    return <TeacherTestEditor onSaveTests={handleSaveTests} onExit={() => setViewMode("student")} />;
  }

  if (viewMode === "teacher" && stage !== "active") {
    return (
      <TeacherDashboard
        records={analyticsRecords}
        onBack={() => setViewMode("student")}
        onLock={lockTeacherDashboard}
        onDeleteRecord={handleDeleteRecord}
        resultCode={TEST_CONFIG.teacherResultCode}
        sourceLabel={analyticsSource}
        statusMessage={apiStatusMessage}
      />
    );
  }

  if (stage === "result" && result) {
    return <ResultScreen result={result} onRestart={restart} onAnalyze={openStudentAnalysis} />;
  }

  if (stage === "analysis" && result) {
    return (
      <StudentAnalysisScreen
        result={result}
        currentIndex={analysisIndex}
        onSelectQuestion={setAnalysisIndex}
        onPrevious={handleAnalysisPrevious}
        onNext={handleAnalysisNext}
        onFinish={requestScoreUnlock}
      />
    );
  }

  if (stage === "scoreGate" && result) {
    return (
      <ScoreUnlockScreen
        input={scoreUnlockInput}
        error={scoreUnlockError}
        onInputChange={setScoreUnlockInput}
        onSubmit={confirmScoreUnlock}
        onBackToAnalyze={openStudentAnalysis}
      />
    );
  }

  if (stage === "score" && result) {
    return <ScoreRevealScreen result={result} onRestart={restart} onAnalyzeAgain={openStudentAnalysis} />;
  }

  return (
    <>
      <IntroScreen
        studentDraft={studentDraft}
        onDraftChange={updateDraft}
        onStart={startTest}
        analyticsRecords={analyticsRecords}
        onOpenDashboard={requestTeacherDashboard}
        onOpenPresentation={requestTeacherPresentation}
        onOpenEditor={requestTeacherEditor}
      />
      {showDashboardPasswordModal ? (
        <DashboardPasswordModal
          password={dashboardPasswordInput}
          error={dashboardPasswordError}
          onChange={setDashboardPasswordInput}
          onSubmit={openTeacherDashboard}
          onCancel={() => setShowDashboardPasswordModal(false)}
        />
      ) : null}
    </>
  );
}
