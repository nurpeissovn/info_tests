import { useMemo, useRef, useState } from "react";
import tests from "./data/tests.json";
import {
  buildAttemptsTimeline,
  buildQuestionAnalytics,
  buildRecordsTable,
  buildStudentProfiles,
  buildTeacherOverview,
  buildTopicAnalytics,
  exportFullAnalyticsReport,
  exportRecordsCsv,
  exportStudentReportPdf,
  normalizeAnalyticsRecord
} from "./analytics";
import { formatDuration } from "./utils";

function LineChart({ data }) {
  if (!data.length) {
    return <p className="analytics-empty">Not enough data for a chart yet.</p>;
  }

  const maxValue = Math.max(...data.map((point) => point.value), 1);
  const points = data
    .map((point, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - (point.value / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <svg viewBox="0 0 100 100" className="line-chart" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="url(#chartStroke)" strokeWidth="3" points={points} />
        <defs>
          <linearGradient id="chartStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0f7dff" />
            <stop offset="100%" stopColor="#76beff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="chart-card__labels">
        {data.map((point) => (
          <span key={point.label}>
            {point.label}: {point.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ value, label }) {
  const clamped = Math.max(0, Math.min(100, value));
  const dashOffset = 314 - (314 * clamped) / 100;

  return (
    <div className="donut-card">
      <svg viewBox="0 0 120 120" className="donut-chart" aria-hidden="true">
        <circle cx="60" cy="60" r="50" className="donut-chart__track" />
        <circle
          cx="60"
          cy="60"
          r="50"
          className="donut-chart__value"
          style={{ strokeDasharray: 314, strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="donut-card__value">
        <strong>{clamped}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="progress-bar">
      <span className="progress-bar__fill" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

function QuestionDetailModal({ question, onClose }) {
  if (!question) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="question-detail-title">
      <div className="card modal-card">
        <div className="card__header">
          <div>
            <p className="section-label">Question Detail</p>
            <h2 id="question-detail-title">
              {question.testTitle} • Q{question.questionId}
            </h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="analytics-note-grid">
          <article className="analytics-note-card">
            <h3>Question</h3>
            <p>{question.question}</p>
          </article>

          <article className="analytics-note-card">
            <h3>Performance</h3>
            <p>Accuracy: {question.accuracy}%</p>
            <p>Difficulty: {question.difficulty}</p>
            <p>
              Correct: {question.correctCount} • Wrong: {question.wrongCount}
            </p>
          </article>

          <article className="analytics-note-card">
            <h3>Answer Pattern</h3>
            <p>Most selected wrong option: {question.mostSelectedWrongOption}</p>
            <p>Average time: {question.averageTimeSpent}s</p>
            <p>Answered wrong by: {question.wrongStudents.join(", ") || "None"}</p>
          </article>
        </div>
      </div>
    </div>
  );
}

function formatSourceLabel(sourceLabel) {
  if (sourceLabel === "postgres") {
    return "PostgreSQL";
  }

  if (sourceLabel === "server-memory") {
    return "Shared server memory";
  }

  return "Local browser storage";
}

function TeacherPencilCanvas() {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const point = getPoint(event);

    isDrawingRef.current = true;
    context.lineWidth = 4;
    context.lineCap = "round";
    context.strokeStyle = "#1b84ff";
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function draw(event) {
    if (!isDrawingRef.current) {
      return;
    }

    event.preventDefault();
    const context = canvasRef.current.getContext("2d");
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing() {
    isDrawingRef.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div className="teacher-pencil">
      <div className="teacher-pencil__toolbar">
        <span>Pencil Board</span>
        <button className="secondary-button" type="button" onClick={clearCanvas}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width="960"
        height="420"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
}

function AttemptReviewModal({ attempt, questionId, onSelectQuestion, onClose }) {
  if (!attempt) {
    return null;
  }

  const selectedItem = attempt.review.find((item) => item.id === questionId) || attempt.review[0];
  const selectedTest = tests.find((test) => test.id === attempt.testId);
  const question = selectedTest?.questions.find((item) => item.id === selectedItem?.id);
  const selectedAnswer = selectedItem?.selectedAnswer || "No answer selected";
  const correctAnswer = selectedItem?.correctAnswer || "No correct answer";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="attempt-review-title">
      <div className="card modal-card modal-card--wide">
        <div className="card__header">
          <div>
            <p className="section-label">Teacher Review</p>
            <h2 id="attempt-review-title">
              {attempt.student.name} {attempt.student.surname} • {attempt.testTitle}
            </h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="review-number-grid">
          {attempt.review.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`review-number ${item.id === selectedItem?.id ? "is-current" : ""} ${item.isCorrect ? "is-correct" : "is-wrong"}`}
              onClick={() => onSelectQuestion(item.id)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="teacher-review-layout">
          <section className="teacher-question-panel">
            <div className="question-card__meta">
              <span>Question {attempt.review.findIndex((item) => item.id === selectedItem?.id) + 1}</span>
              <span>{selectedItem?.isCorrect ? "Correct" : "Mistake"}</span>
            </div>
            <h3>{question?.question || selectedItem?.question}</h3>
            {question?.supportText ? <pre className="question-card__support-text">{question.supportText}</pre> : null}
            {question?.supportImage ? (
              <div className="question-media">
                <img className="question-media__support" src={question.supportImage} alt={`${question.question} supporting figure`} />
              </div>
            ) : null}

            <div className="answer-compare-grid">
              <div className={`answer-compare-card ${selectedItem?.isCorrect ? "is-correct" : "is-wrong"}`}>
                <span>Student Answer</span>
                <strong>{selectedAnswer}</strong>
              </div>
              <div className="answer-compare-card is-correct">
                <span>Correct Answer</span>
                <strong>{correctAnswer}</strong>
              </div>
            </div>
          </section>

          <TeacherPencilCanvas />
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ records, onBack, onLock, onDeleteRecord, resultCode, sourceLabel = "local", statusMessage = "" }) {
  const [search, setSearch] = useState("");
  const [filterTest, setFilterTest] = useState("all");
  const [filterPass, setFilterPass] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedQuestionKey, setSelectedQuestionKey] = useState("");
  const [selectedQuestionTestId, setSelectedQuestionTestId] = useState(tests[0]?.id || "");
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [selectedAttemptQuestionId, setSelectedAttemptQuestionId] = useState(null);

  const normalizedRecords = useMemo(() => records.map(normalizeAnalyticsRecord), [records]);
  const overview = useMemo(() => buildTeacherOverview(normalizedRecords), [normalizedRecords]);
  const profiles = useMemo(() => buildStudentProfiles(normalizedRecords), [normalizedRecords]);
  const topicAnalytics = useMemo(() => buildTopicAnalytics(normalizedRecords), [normalizedRecords]);
  const questionAnalytics = useMemo(() => buildQuestionAnalytics(normalizedRecords), [normalizedRecords]);
  const attemptsTimeline = useMemo(() => buildAttemptsTimeline(normalizedRecords), [normalizedRecords]);
  const tableRecords = useMemo(
    () => buildRecordsTable(normalizedRecords, { search, filterTest, filterPass, sortBy }),
    [normalizedRecords, search, filterTest, filterPass, sortBy]
  );

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedStudentId) || profiles[0] || null;
  const selectedQuestion =
    questionAnalytics.find((question) => question.key === selectedQuestionKey) || null;
  const visibleQuestionAnalytics = questionAnalytics.filter(
    (question) => question.testTitle === (tests.find((test) => test.id === selectedQuestionTestId)?.title || tests[0]?.title)
  );

  const fullReportPayload = {
    generatedAt: new Date().toISOString(),
    overview,
    records: normalizedRecords,
    profiles,
    topics: topicAnalytics,
    questions: questionAnalytics
  };

  return (
    <main className="page-shell">
      <section className="dashboard-layout">
        <header className="card dashboard-hero">
          <div>
            <p className="section-label">Teacher Dashboard</p>
            <h1>Class Analytics</h1>
            <p className="dashboard-hero__text">
              Completed attempts. Current source: {formatSourceLabel(sourceLabel)}.
            </p>
            {statusMessage ? <p className="dashboard-hero__text">{statusMessage}</p> : null}
          </div>

          <div className="dashboard-actions">
            <div className="teacher-code-card">
              <span>Result Code</span>
              <strong>{resultCode}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={onBack}>
              Back To Student Mode
            </button>
            <button className="secondary-button" type="button" onClick={onLock}>
              Lock Dashboard
            </button>
            <button className="secondary-button" type="button" onClick={() => exportRecordsCsv(tableRecords)}>
              Export CSV / Excel
            </button>
          </div>
        </header>

        <section className="metrics-grid metrics-grid--dashboard">
          <div className="metric-card"><div><p className="metric-card__label">Total Students</p><p className="metric-card__value">{overview.totalStudents}</p></div></div>
          <div className="metric-card"><div><p className="metric-card__label">Total Attempts</p><p className="metric-card__value">{overview.totalAttempts}</p></div></div>
          <div className="metric-card metric-card--accent"><div><p className="metric-card__label">Average Score</p><p className="metric-card__value">{overview.averageScore}%</p></div></div>
          <div className="metric-card metric-card--accent"><div><p className="metric-card__label">Pass Rate</p><p className="metric-card__value">{overview.passRate}%</p></div></div>
        </section>

        <section className="card analytics-section">
          <div className="card__header">
            <div>
              <p className="section-label">Student Records</p>
              <h2>Attempts Table</h2>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="toolbar__search"
              type="search"
              placeholder="Search student or test"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="toolbar__select" value={filterTest} onChange={(event) => setFilterTest(event.target.value)}>
              <option value="all">All Tests</option>
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.title}
                </option>
              ))}
            </select>
            <select className="toolbar__select" value={filterPass} onChange={(event) => setFilterPass(event.target.value)}>
              <option value="all">All Results</option>
              <option value="true">Pass</option>
              <option value="false">Fail</option>
            </select>
            <select className="toolbar__select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="score">Highest Score</option>
              <option value="warnings">Most Warnings</option>
              <option value="student">Student Name</option>
            </select>
          </div>

          <div className="records-table-wrapper">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Surname</th>
                  <th>Test</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Time</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Warnings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRecords.map((record, index) => (
                  <tr
                    key={`${record.testId}-${record.submittedAt}-${index}`}
                    onClick={() => setSelectedStudentId(`${record.student.name} ${record.student.surname}`.trim())}
                  >
                    <td>{record.student.name}</td>
                    <td>{record.student.surname}</td>
                    <td>{record.testTitle}</td>
                    <td>
                      {record.score}/{record.totalPoints}
                    </td>
                    <td>{record.percentage}%</td>
                    <td>{formatDuration(record.timeSpentSeconds)}</td>
                    <td>{new Date(record.submittedAt).toLocaleDateString()}</td>
                    <td>{record.passed ? "Pass" : "Fail"}</td>
                    <td>{record.warningCount}</td>
                    <td>
                      <div className="record-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedAttempt(record);
                            setSelectedAttemptQuestionId(record.review[0]?.id || null);
                          }}
                        >
                          Review
                        </button>
                        <button
                          className="secondary-button secondary-button--danger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteRecord(record);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <AttemptReviewModal
          attempt={selectedAttempt}
          questionId={selectedAttemptQuestionId}
          onSelectQuestion={setSelectedAttemptQuestionId}
          onClose={() => {
            setSelectedAttempt(null);
            setSelectedAttemptQuestionId(null);
          }}
        />
      </section>
    </main>
  );
}

export default TeacherDashboard;
