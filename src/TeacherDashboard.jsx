import { useMemo, useState } from "react";
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

function TeacherDashboard({ records, onBack, onLock, sourceLabel = "local", statusMessage = "" }) {
  const [search, setSearch] = useState("");
  const [filterTest, setFilterTest] = useState("all");
  const [filterPass, setFilterPass] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedQuestionKey, setSelectedQuestionKey] = useState("");
  const [selectedQuestionTestId, setSelectedQuestionTestId] = useState(tests[0]?.id || "");

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
              Deep analytics from completed test attempts. Current source: {formatSourceLabel(sourceLabel)}.
            </p>
            {statusMessage ? <p className="dashboard-hero__text">{statusMessage}</p> : null}
          </div>

          <div className="dashboard-actions">
            <button className="secondary-button" type="button" onClick={onBack}>
              Back To Student Mode
            </button>
            <button className="secondary-button" type="button" onClick={onLock}>
              Lock Dashboard
            </button>
            <button className="secondary-button" type="button" onClick={() => exportRecordsCsv(tableRecords)}>
              Export CSV / Excel
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => exportStudentReportPdf(selectedProfile)}
              disabled={!selectedProfile}
            >
              Export Student PDF
            </button>
            <button className="primary-button" type="button" onClick={() => exportFullAnalyticsReport(fullReportPayload)}>
              Export Full Report
            </button>
          </div>
        </header>

        <section className="metrics-grid metrics-grid--dashboard">
          <div className="metric-card"><div><p className="metric-card__label">Total Students</p><p className="metric-card__value">{overview.totalStudents}</p></div></div>
          <div className="metric-card"><div><p className="metric-card__label">Total Attempts</p><p className="metric-card__value">{overview.totalAttempts}</p></div></div>
          <div className="metric-card metric-card--accent"><div><p className="metric-card__label">Average Score</p><p className="metric-card__value">{overview.averageScore}%</p></div></div>
          <div className="metric-card"><div><p className="metric-card__label">Highest Score</p><p className="metric-card__value">{overview.highestScore}%</p></div></div>
          <div className="metric-card"><div><p className="metric-card__label">Lowest Score</p><p className="metric-card__value">{overview.lowestScore}%</p></div></div>
          <div className="metric-card metric-card--accent"><div><p className="metric-card__label">Pass Rate</p><p className="metric-card__value">{overview.passRate}%</p></div></div>
          <div className="metric-card"><div><p className="metric-card__label">Avg. Time</p><p className="metric-card__value">{formatDuration(overview.averageTimeSpent)}</p></div></div>
          <div className="metric-card metric-card--danger"><div><p className="metric-card__label">Avg. Warnings</p><p className="metric-card__value">{overview.averageWarnings}</p></div></div>
        </section>

        <section className="dashboard-charts">
          <article className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Overview Chart</p>
                <h2>Attempts Over Time</h2>
              </div>
            </div>
            <LineChart data={attemptsTimeline} />
          </article>

          <article className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Pass / Fail</p>
                <h2>Class Pass Rate</h2>
              </div>
            </div>
            <DonutChart value={overview.passRate} label="Pass Rate" />
          </article>

          <article className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Topic Heatmap</p>
                <h2>Accuracy By Topic</h2>
              </div>
            </div>
            <div className="heatmap-grid">
              {topicAnalytics.map((topic) => (
                <div
                  key={topic.subject}
                  className="heatmap-cell"
                  style={{ background: `rgba(15, 125, 255, ${Math.max(0.15, topic.averageAccuracy / 100)})` }}
                >
                  <strong>{topic.subject}</strong>
                  <span>{topic.averageAccuracy}%</span>
                </div>
              ))}
            </div>
          </article>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedProfile ? (
          <section className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Student Profile</p>
                <h2>
                  {selectedProfile.name} {selectedProfile.surname}
                </h2>
              </div>
            </div>

            <div className="student-profile-grid">
              <div className="student-profile-main">
                <div className="metrics-grid metrics-grid--results">
                  <div className="metric-card"><div><p className="metric-card__label">Attempts</p><p className="metric-card__value">{selectedProfile.attempts.length}</p></div></div>
                  <div className="metric-card"><div><p className="metric-card__label">Average Score</p><p className="metric-card__value">{selectedProfile.averageScore}%</p></div></div>
                  <div className="metric-card"><div><p className="metric-card__label">Best Score</p><p className="metric-card__value">{selectedProfile.bestScore}%</p></div></div>
                  <div className="metric-card"><div><p className="metric-card__label">Trend</p><p className="metric-card__value">{selectedProfile.trendLabel}</p></div></div>
                </div>

                <div className="analytics-note-grid">
                  <article className="analytics-note-card">
                    <h3>Teacher Comments</h3>
                    <ul className="diagnosis-list">
                      {selectedProfile.diagnoses.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="analytics-note-card">
                    <h3>Strong Topics</h3>
                    {selectedProfile.strongTopics.length ? (
                      selectedProfile.strongTopics.map((topic) => (
                        <div key={topic.subject} className="topic-bar">
                          <div>
                            <strong>{topic.subject}</strong>
                            <span>{topic.accuracy}% accuracy</span>
                          </div>
                          <ProgressBar value={topic.accuracy} />
                        </div>
                      ))
                    ) : (
                      <p className="analytics-empty">No strong topics detected yet.</p>
                    )}
                  </article>

                  <article className="analytics-note-card">
                    <h3>Weak Topics</h3>
                    {selectedProfile.weakTopics.length ? (
                      selectedProfile.weakTopics.map((topic) => (
                        <div key={topic.subject} className="topic-bar">
                          <div>
                            <strong>{topic.subject}</strong>
                            <span>{topic.accuracy}% accuracy</span>
                          </div>
                          <ProgressBar value={topic.accuracy} />
                        </div>
                      ))
                    ) : (
                      <p className="analytics-empty">No weak topics detected yet.</p>
                    )}
                  </article>
                </div>

                <article className="analytics-note-card">
                  <h3>All Attempts</h3>
                  <div className="analytics-list">
                    {selectedProfile.attempts.map((attempt) => (
                      <article key={`${attempt.testId}-${attempt.submittedAt}`} className="analytics-item">
                        <div>
                          <strong>{attempt.testTitle}</strong>
                          <p>{new Date(attempt.submittedAt).toLocaleString()}</p>
                        </div>
                        <span>{attempt.percentage}%</span>
                      </article>
                    ))}
                  </div>
                </article>
              </div>

              <aside className="student-profile-side">
                <article className="analytics-note-card">
                  <h3>Score History</h3>
                  <LineChart
                    data={selectedProfile.attempts.map((attempt, index) => ({
                      label: `Try ${index + 1}`,
                      value: attempt.percentage
                    }))}
                  />
                </article>

                <article className="analytics-note-card">
                  <h3>Warning History</h3>
                  <LineChart
                    data={selectedProfile.warningHistory.map((warning, index) => ({
                      label: `Try ${index + 1}`,
                      value: warning.value
                    }))}
                  />
                </article>

                <article className="analytics-note-card">
                  <h3>Accuracy By Subject</h3>
                  {selectedProfile.subjects.map((subject) => (
                    <div key={subject.subject} className="topic-bar">
                      <div>
                        <strong>{subject.subject}</strong>
                        <span>{subject.averageTime}s avg. time</span>
                      </div>
                      <ProgressBar value={subject.accuracy} />
                    </div>
                  ))}
                </article>
              </aside>
            </div>
          </section>
        ) : null}

        <section className="dashboard-two-column">
          <section className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Topic Analytics</p>
                <h2>Topic Performance</h2>
              </div>
            </div>

            <div className="analytics-list">
              {topicAnalytics.map((topic) => (
                <article key={topic.subject} className="topic-analytics-card">
                  <div className="analytics-item">
                    <div>
                      <strong>{topic.subject}</strong>
                      <p>{topic.difficulty} difficulty</p>
                    </div>
                    <span>{topic.averageAccuracy}%</span>
                  </div>
                  <ProgressBar value={topic.averageAccuracy} />
                  <p>
                    Correct: {topic.correctCount} • Wrong: {topic.wrongCount}
                  </p>
                  <p>Struggling: {topic.strugglingStudents.join(", ") || "None"}</p>
                  <p>Mastering: {topic.masteringStudents.join(", ") || "None"}</p>
                  <p>{topic.recommendedRevision}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card analytics-section">
            <div className="card__header">
              <div>
                <p className="section-label">Question Analytics</p>
                <h2>Question Difficulty</h2>
              </div>
            </div>

            <div className="question-test-tabs">
              {tests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  className={`question-test-tab ${selectedQuestionTestId === test.id ? "is-active" : ""}`}
                  onClick={() => setSelectedQuestionTestId(test.id)}
                >
                  {test.title}
                </button>
              ))}
            </div>

            <div className="question-picker-grid">
              {visibleQuestionAnalytics.map((question) => (
                <button
                  key={question.key}
                  type="button"
                  className={`question-pill ${
                    question.accuracy >= 80 ? "is-good" : question.accuracy >= 55 ? "is-medium" : "is-bad"
                  }`}
                  onClick={() => setSelectedQuestionKey(question.key)}
                  title={`Q${question.questionId}`}
                >
                  <span className="question-pill__number">{question.questionId}</span>
                  <span className="question-pill__meta">
                    <small>{question.accuracy}%</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </section>

        <QuestionDetailModal question={selectedQuestion} onClose={() => setSelectedQuestionKey("")} />
      </section>
    </main>
  );
}

export default TeacherDashboard;
