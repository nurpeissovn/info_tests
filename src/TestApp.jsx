import { useEffect, useRef, useState } from "react";
import questions from "./data/questions.json";
import { TEST_CONFIG } from "./config/testConfig";
import {
  buildResult,
  formatDuration,
  formatTimer,
  getPassStatus,
  getRemainingSeconds,
  getTotalPoints,
} from "./utils/testUtils";

const STORAGE_KEY = "student-test-session-v1";

const ICONS = {
  alert: "!",
  check: "✓",
  clock: "○",
  file: "Q",
  shield: "S",
  trophy: "★",
  user: "U",
};

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function attemptFullscreen() {
  const root = document.documentElement;

  if (document.fullscreenElement || !root.requestFullscreen) {
    return Promise.resolve(false);
  }

  return root.requestFullscreen().then(() => true).catch(() => false);
}

function IconToken({ symbol }) {
  return <span className="icon-token" aria-hidden="true">{symbol}</span>;
}

function StatCard({ symbol, label, value, tone = "default" }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__icon">
        <IconToken symbol={symbol} />
      </div>
      <div>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
      </div>
    </div>
  );
}

function IntroScreen({ draft, onDraftChange, onStart, totalQuestions, totalPoints }) {
  return (
    <main className="shell">
      <section className="hero-card">
        <div className="hero-card__copy">
          <span className="eyebrow">Online Assessment</span>
          <h1>Focused testing for students, built for calm exam conditions.</h1>
          <p>
            Students enter their details, complete the test one question at a time, and receive an instant result at the
            end.
          </p>

          <div className="hero-stats">
            <StatCard symbol={ICONS.file} label="Questions" value={totalQuestions} />
            <StatCard symbol={ICONS.trophy} label="Total Points" value={totalPoints} />
            <StatCard symbol={ICONS.clock} label="Time Limit" value={`${TEST_CONFIG.durationMinutes} min`} />
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Student Entry</p>
              <h2>Start the test</h2>
            </div>
            <div className="glass-badge">
              <IconToken symbol={ICONS.user} />
            </div>
          </div>

          <form className="form-grid" onSubmit={onStart}>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => onDraftChange("name", event.target.value)}
                placeholder="Enter first name"
                autoComplete="given-name"
                required
              />
            </label>

            <label className="field">
              <span>Surname</span>
              <input
                type="text"
                value={draft.surname}
                onChange={(event) => onDraftChange("surname", event.target.value)}
                placeholder="Enter surname"
                autoComplete="family-name"
                required
              />
            </label>

            <button className="primary-button" type="submit">
              Start Test
            </button>
          </form>

          <div className="rules">
            <div className="rules__header">
              <IconToken symbol={ICONS.shield} />
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
    </main>
  );
}

function QuestionNav({ questionsList, answers, currentQuestionId, onSelect }) {
  return (
    <div className="question-nav" aria-label="Question navigation">
      {questionsList.map((question, index) => {
        const isActive = question.id === currentQuestionId;
        const isAnswered = Boolean(answers[question.id]);

        return (
          <button
            key={question.id}
            type="button"
            className={[
              "question-nav__item",
              isActive ? "is-active" : "",
              isAnswered ? "is-answered" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(index)}
            aria-label={`Go to question ${index + 1}`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function TestScreen({
  student,
  answers,
  currentIndex,
  remainingSeconds,
  violationCount,
  warningMessage,
  onSelectQuestion,
  onSelectAnswer,
  onPrev,
  onNext,
  onSubmit,
}) {
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  return (
    <main className="shell shell--test">
      <section className="test-layout">
        <header className="test-topbar">
          <div>
            <span className="eyebrow">Student Session</span>
            <h1>
              {student.name} {student.surname}
            </h1>
          </div>

          <div className="topbar-metrics">
            <StatCard symbol={ICONS.clock} label="Time Left" value={formatTimer(remainingSeconds)} tone="accent" />
            <StatCard symbol={ICONS.file} label="Answered" value={`${answeredCount}/${questions.length}`} />
            <StatCard
              symbol={ICONS.shield}
              label="Warnings"
              value={`${violationCount}/${TEST_CONFIG.maxViolations}`}
              tone={violationCount > 0 ? "danger" : "default"}
            />
          </div>
        </header>

        {warningMessage ? (
          <div className="warning-banner" role="alert">
            <IconToken symbol={ICONS.alert} />
            <span>{warningMessage}</span>
          </div>
        ) : null}

        <QuestionNav
          questionsList={questions}
          answers={answers}
          currentQuestionId={currentQuestion.id}
          onSelect={onSelectQuestion}
        />

        <article className="question-card">
          <div className="question-card__meta">
            <span>
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span>{currentQuestion.subject || "General"}</span>
          </div>

          <h2>{currentQuestion.question}</h2>

          <div className="options-list" role="radiogroup" aria-label={`Question ${currentIndex + 1}`}>
            {currentQuestion.options.map((option) => {
              const selected = answers[currentQuestion.id] === option;

              return (
                <button
                  key={option}
                  type="button"
                  className={`option-card ${selected ? "is-selected" : ""}`}
                  onClick={() => onSelectAnswer(currentQuestion.id, option)}
                  aria-pressed={selected}
                >
                  <span className="option-card__dot" />
                  <span className="option-card__text">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="question-card__footer">
            <button className="secondary-button" type="button" onClick={onPrev} disabled={currentIndex === 0}>
              Previous
            </button>

            <div className="question-card__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={onNext}
                disabled={currentIndex === questions.length - 1}
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

function ResultScreen({ result, onRestart }) {
  const reviewEnabled = TEST_CONFIG.showAnswerReview;

  return (
    <main className="shell">
      <section className="results-layout">
        <article className="hero-card hero-card--results">
          <div className="hero-card__copy">
            <span className="eyebrow">Result Summary</span>
            <h1>
              {result.student.name} {result.student.surname}
            </h1>
            <p>
              Score: {result.score}/{result.totalPoints} points with {result.percentage}% completed accuracy.
            </p>
          </div>

          <div className={`result-status ${result.passed ? "is-passed" : "is-failed"}`}>
            <IconToken symbol={ICONS.check} />
            <div>
              <strong>{result.passed ? "Passed" : "Needs Improvement"}</strong>
              <p>{getPassStatus(result.passed, TEST_CONFIG.passPercentage)}</p>
            </div>
          </div>
        </article>

        <section className="results-grid">
          <StatCard symbol={ICONS.trophy} label="Total Score" value={`${result.score}/${result.totalPoints}`} tone="accent" />
          <StatCard symbol={ICONS.file} label="Correct" value={result.correctCount} />
          <StatCard symbol={ICONS.alert} label="Wrong" value={result.wrongCount} tone="danger" />
          <StatCard symbol={ICONS.clock} label="Time Spent" value={formatDuration(result.timeSpentSeconds)} />
        </section>

        {reviewEnabled ? (
          <section className="review-panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Answer Review</p>
                <h2>Detailed breakdown</h2>
              </div>
            </div>

            <div className="review-list">
              {result.review.map((item, index) => (
                <article key={item.id} className={`review-item ${item.isCorrect ? "is-correct" : "is-wrong"}`}>
                  <div className="review-item__heading">
                    <span>Q{index + 1}</span>
                    <strong>{item.question}</strong>
                  </div>
                  <p>Your answer: {item.selectedAnswer || "No answer selected"}</p>
                  <p>Correct answer: {item.correctAnswer}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <button className="primary-button primary-button--wide" type="button" onClick={onRestart}>
          Start New Attempt
        </button>
      </section>
    </main>
  );
}

export default function TestApp() {
  const [draft, setDraft] = useState({ name: "", surname: "" });
  const [student, setStudent] = useState(null);
  const [stage, setStage] = useState("intro");
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(TEST_CONFIG.durationMinutes * 60);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMessage, setWarningMessage] = useState("");
  const [result, setResult] = useState(null);
  const sessionRef = useRef(null);
  const lastViolationAtRef = useRef(0);
  const hasFullscreenRef = useRef(false);

  useEffect(() => {
    const saved = loadSession();

    if (!saved) {
      return;
    }

    if (saved.stage === "active") {
      const nextRemainingSeconds = getRemainingSeconds(saved.expiresAt);

      if (nextRemainingSeconds <= 0) {
        const expiredResult = buildResult({
          questions,
          answers: saved.answers || {},
          student: saved.student,
          startedAt: saved.startedAt,
          submittedAt: saved.expiresAt,
          passPercentage: TEST_CONFIG.passPercentage,
        });

        setResult(expiredResult);
        setStudent(saved.student);
        setStage("result");
        clearSession();
        return;
      }

      setStudent(saved.student);
      setDraft(saved.student);
      setAnswers(saved.answers || {});
      setCurrentIndex(saved.currentIndex || 0);
      setViolationCount(saved.violationCount || 0);
      setRemainingSeconds(nextRemainingSeconds);
      setStage("active");
      sessionRef.current = { ...saved, expiresAt: saved.expiresAt };
      return;
    }

    if (saved.stage === "result" && saved.result) {
      setStudent(saved.student);
      setDraft(saved.student);
      setResult(saved.result);
      setStage("result");
    }
  }, []);

  useEffect(() => {
    if (stage !== "active") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      const currentSession = sessionRef.current;

      if (!currentSession) {
        return;
      }

      const nextRemainingSeconds = getRemainingSeconds(currentSession.expiresAt);
      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds <= 0) {
        submitTest("Time limit reached.");
      }
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [stage]);

  useEffect(() => {
    if (stage !== "active") {
      return undefined;
    }

    const registerViolation = (reason) => {
      const now = Date.now();

      if (now - lastViolationAtRef.current < 1500) {
        return;
      }

      lastViolationAtRef.current = now;

      setViolationCount((currentCount) => {
        const nextCount = currentCount + 1;
        const message = `You left the test page. Warning ${nextCount}/${TEST_CONFIG.maxViolations}`;

        setWarningMessage(message);

        const nextSession = {
          ...sessionRef.current,
          violationCount: nextCount,
          violationReason: reason,
        };

        sessionRef.current = nextSession;
        saveSession(nextSession);

        if (nextCount >= TEST_CONFIG.maxViolations) {
          window.setTimeout(() => submitTest("Maximum violations reached."), 250);
        }

        return nextCount;
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        registerViolation("visibility");
      }
    };

    const handleBlur = () => {
      if (!document.hidden) {
        registerViolation("blur");
      }
    };

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        hasFullscreenRef.current = true;
        return;
      }

      if (hasFullscreenRef.current) {
        registerViolation("fullscreen-exit");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [stage]);

  useEffect(() => {
    if (!warningMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setWarningMessage(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [warningMessage]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startTest(event) {
    event.preventDefault();

    const trimmedStudent = {
      name: draft.name.trim(),
      surname: draft.surname.trim(),
    };

    if (!trimmedStudent.name || !trimmedStudent.surname) {
      return;
    }

    const startedAt = Date.now();
    const expiresAt = startedAt + TEST_CONFIG.durationMinutes * 60 * 1000;
    const nextSession = {
      stage: "active",
      student: trimmedStudent,
      answers: {},
      currentIndex: 0,
      violationCount: 0,
      startedAt,
      expiresAt,
    };

    setStudent(trimmedStudent);
    setAnswers({});
    setCurrentIndex(0);
    setViolationCount(0);
    setRemainingSeconds(TEST_CONFIG.durationMinutes * 60);
    setStage("active");
    setResult(null);
    sessionRef.current = nextSession;
    saveSession(nextSession);

    attemptFullscreen().then((entered) => {
      if (entered) {
        hasFullscreenRef.current = true;
      }
    });
  }

  function persistActiveSession(nextSession) {
    sessionRef.current = nextSession;
    saveSession(nextSession);
  }

  function selectAnswer(questionId, option) {
    setAnswers((currentAnswers) => {
      const nextAnswers = {
        ...currentAnswers,
        [questionId]: option,
      };

      persistActiveSession({
        ...sessionRef.current,
        answers: nextAnswers,
      });

      return nextAnswers;
    });
  }

  function selectQuestion(index) {
    setCurrentIndex(index);
    persistActiveSession({
      ...sessionRef.current,
      currentIndex: index,
    });
  }

  function goPrev() {
    if (currentIndex === 0) {
      return;
    }

    selectQuestion(currentIndex - 1);
  }

  function goNext() {
    if (currentIndex === questions.length - 1) {
      return;
    }

    selectQuestion(currentIndex + 1);
  }

  function submitTest(reason = "") {
    const activeSession = sessionRef.current;

    if (!activeSession || stage === "result") {
      return;
    }

    const submittedAt = Date.now();
    const nextResult = buildResult({
      questions,
      answers: activeSession.answers || {},
      student: activeSession.student,
      startedAt: activeSession.startedAt,
      submittedAt,
      passPercentage: TEST_CONFIG.passPercentage,
      note: reason,
    });

    setResult(nextResult);
    setStage("result");
    setWarningMessage("");
    clearSession();
    saveSession({
      stage: "result",
      student: activeSession.student,
      result: nextResult,
    });
    sessionRef.current = null;
  }

  function restartTest() {
    clearSession();
    setStage("intro");
    setAnswers({});
    setCurrentIndex(0);
    setViolationCount(0);
    setWarningMessage("");
    setResult(null);
    setRemainingSeconds(TEST_CONFIG.durationMinutes * 60);
    sessionRef.current = null;
    hasFullscreenRef.current = false;
  }

  const totalPoints = getTotalPoints(questions);

  if (stage === "active" && student) {
    return (
      <TestScreen
        student={student}
        answers={answers}
        currentIndex={currentIndex}
        remainingSeconds={remainingSeconds}
        violationCount={violationCount}
        warningMessage={warningMessage}
        onSelectQuestion={selectQuestion}
        onSelectAnswer={selectAnswer}
        onPrev={goPrev}
        onNext={goNext}
        onSubmit={() => submitTest("Submitted by student.")}
      />
    );
  }

  if (stage === "result" && result) {
    return <ResultScreen result={result} onRestart={restartTest} />;
  }

  return (
    <IntroScreen
      draft={draft}
      onDraftChange={updateDraft}
      onStart={startTest}
      totalQuestions={questions.length}
      totalPoints={totalPoints}
    />
  );
}
