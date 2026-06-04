import { useEffect, useRef, useState } from "react";
import tests from "./data/tests.json";
import TeacherDashboard from "./TeacherDashboard";
import { TEST_CONFIG } from "./config";
import { fetchRemoteResults, saveRemoteResult } from "./api";
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
            <h2 id="dashboard-password-title">Teacher Dashboard Access</h2>
          </div>
        </div>

        <p className="modal-card__text">
          Enter the teacher password to view analytics. You can change this password later in [src/config.js].
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

function IntroScreen({ studentDraft, onDraftChange, onStart, analyticsRecords, onOpenDashboard }) {
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

function QuestionNavigation({ questions, answers, currentQuestionId, onSelectQuestion }) {
  return (
    <nav className="question-nav" aria-label="Question navigation">
      {questions.map((question, index) => {
        const isCurrent = question.id === currentQuestionId;
        const isAnswered = Boolean(answers[question.id]);

        return (
          <button
            key={question.id}
            type="button"
            className={["question-nav__item", isCurrent ? "is-current" : "", isAnswered ? "is-answered" : ""]
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

          <div className="options-list" role="radiogroup" aria-label={`Question ${currentIndex + 1}`}>
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

function StudentAnalysisScreen({ result, currentIndex, onSelectQuestion, onPrevious, onNext, onFinish }) {
  const selectedTest = findTestById(result.testId);
  const reviewItem = result.review[currentIndex];
  const question = selectedTest.questions.find((item) => item.id === reviewItem?.id) || selectedTest.questions[currentIndex];
  const selectedAnswer = reviewItem?.selectedAnswer || "";

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

          <div className="metrics-grid metrics-grid--top">
            <MetricCard icon={ICONS.question} label="Questions" value={result.review.length} />
            <MetricCard icon={ICONS.analytics} label="Mode" value="Discuss" tone="accent" />
          </div>
        </header>

        <QuestionNavigation
          questions={result.review}
          answers={Object.fromEntries(result.review.filter((item) => item.selectedAnswer).map((item) => [item.id, item.selectedAnswer]))}
          currentQuestionId={reviewItem?.id}
          onSelectQuestion={onSelectQuestion}
        />

        <article className="card question-card">
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

          <div className="options-list" role="list" aria-label={`Question ${currentIndex + 1} selected answer`}>
            {(question?.options || []).map((option) => {
              const selected = selectedAnswer === option;

              return (
                <div key={option} className={`option-card ${selected ? "is-selected" : ""}`} role="listitem">
                  <span className="option-card__indicator" />
                  <span className="option-card__text">{option}</span>
                </div>
              );
            })}
          </div>

          <div className="review-list">
            <div className="review-item">
              <div className="review-item__heading">
                <strong>Student Answer</strong>
                <span>{selectedAnswer ? "Selected" : "Empty"}</span>
              </div>
              <p>{selectedAnswer || "No answer selected"}</p>
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

export default function App() {
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
  const [submitChallenge, setSubmitChallenge] = useState(createSubmitChallenge);
  const [submitChallengeAnswer, setSubmitChallengeAnswer] = useState("");
  const [submitChallengeError, setSubmitChallengeError] = useState("");
  const [showSubmitConfirmationModal, setShowSubmitConfirmationModal] = useState(false);
  const [analyticsSource, setAnalyticsSource] = useState("local");
  const [apiStatusMessage, setApiStatusMessage] = useState("");
  const sessionRef = useRef(null);
  const lastViolationAtRef = useRef(0);
  const hadFullscreenRef = useRef(false);
  const questionStartedAtRef = useRef(Date.now());
  const questionTimingsRef = useRef({});

  const selectedTest = findTestById(selectedTestId);

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

    setDashboardPasswordInput("");
    setDashboardPasswordError("");
    setShowDashboardPasswordModal(true);
  }

  function openTeacherDashboard() {
    if (dashboardPasswordInput === TEST_CONFIG.teacherDashboardPassword) {
      setIsDashboardUnlocked(true);
      setDashboardPasswordError("");
      setShowDashboardPasswordModal(false);
      setViewMode("teacher");
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

  if (viewMode === "teacher" && stage !== "active") {
    return (
      <TeacherDashboard
        records={analyticsRecords}
        onBack={() => setViewMode("student")}
        onLock={lockTeacherDashboard}
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
        onFinish={() => setStage("result")}
      />
    );
  }

  return (
    <>
      <IntroScreen
        studentDraft={studentDraft}
        onDraftChange={updateDraft}
        onStart={startTest}
        analyticsRecords={analyticsRecords}
        onOpenDashboard={requestTeacherDashboard}
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
