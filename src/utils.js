export const STORAGE_KEY = "student-test-session-v1";
export const ANALYTICS_KEY = "student-test-analytics-v1";

function createAttemptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getTotalPoints(questions) {
  return questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
}

export function getRemainingSeconds(expiresAt) {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const remaining = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function saveSession(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAnalytics(records) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(records));
}

export function appendAnalyticsRecord(record) {
  const current = loadAnalytics();
  const next = [record, ...current].slice(0, 250);
  saveAnalytics(next);
  return next;
}

export function removeAnalyticsRecord(attemptId) {
  const current = loadAnalytics();
  const next = current.filter((record) => record.attemptId !== attemptId);
  saveAnalytics(next);
  return next;
}

export function mergeAnalyticsRecords(...recordGroups) {
  const seen = new Map();

  for (const group of recordGroups) {
    for (const record of group || []) {
      const key =
        record.attemptId ||
        `${record.testId || "test"}-${record.submittedAt || 0}-${record.student?.name || ""}-${record.student?.surname || ""}`;

      if (!seen.has(key)) {
        seen.set(key, record);
      }
    }
  }

  return Array.from(seen.values()).sort((first, second) => Number(second.submittedAt || 0) - Number(first.submittedAt || 0));
}

export function buildResult({
  testId,
  testTitle,
  questions,
  answers,
  student,
  startedAt,
  submittedAt,
  passPercentage,
  warningCount = 0,
  questionTimings = {},
  note = ""
}) {
  const totalPoints = getTotalPoints(questions);
  let score = 0;
  let correctCount = 0;

  const review = questions.map((question) => {
    const selectedAnswer = answers[question.id] || "";
    const isCorrect = selectedAnswer === question.correctAnswer;

    if (isCorrect) {
      score += Number(question.points || 0);
      correctCount += 1;
    }

    return {
      id: question.id,
      question: question.question,
      selectedAnswer,
      correctAnswer: question.correctAnswer,
      subject: question.subject || "",
      isCorrect,
      timeSpentSeconds: Math.max(0, Math.round(questionTimings[question.id] || 0))
    };
  });

  const wrongCount = questions.length - correctCount;
  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

  return {
    attemptId: createAttemptId(),
    testId,
    testTitle,
    student,
    score,
    totalPoints,
    percentage,
    correctCount,
    wrongCount,
    warningCount,
    submittedAt,
    timeSpentSeconds: Math.max(0, Math.round((submittedAt - startedAt) / 1000)),
    passed: percentage >= passPercentage,
    note,
    review
  };
}

export function buildAnalyticsSummary(records) {
  const normalized = records.map((record) => ({
    ...record,
    warningCount: Number(record.warningCount ?? record.violations ?? 0),
    percentage: Number(record.percentage || 0),
    score: Number(record.score || 0),
    totalPoints: Number(record.totalPoints || 0)
  }));
  const totalAttempts = normalized.length;
  const uniqueStudents = new Set(normalized.map((record) => `${record.student.name} ${record.student.surname}`.trim())).size;
  const averagePercentage =
    totalAttempts > 0
      ? Math.round(normalized.reduce((sum, record) => sum + record.percentage, 0) / totalAttempts)
      : 0;

  const leaderboardMap = new Map();

  for (const record of normalized) {
    const key = `${record.student.name} ${record.student.surname}`.trim();
    const current = leaderboardMap.get(key) || {
      studentName: key,
      attempts: 0,
      totalScore: 0,
      totalPoints: 0,
      averagePercentage: 0
    };

    current.attempts += 1;
    current.totalScore += record.score;
    current.totalPoints += record.totalPoints;
    current.averagePercentage = Math.round(
      (current.averagePercentage * (current.attempts - 1) + record.percentage) / current.attempts
    );

    leaderboardMap.set(key, current);
  }

  const leaderboard = Array.from(leaderboardMap.values())
    .sort((first, second) => second.averagePercentage - first.averagePercentage)
    .slice(0, 6);

  const testBreakdown = normalized.reduce((accumulator, record) => {
    const current = accumulator[record.testTitle] || {
      title: record.testTitle,
      attempts: 0,
      averagePercentage: 0
    };

    current.attempts += 1;
    current.averagePercentage = Math.round(
      (current.averagePercentage * (current.attempts - 1) + record.percentage) / current.attempts
    );
    accumulator[record.testTitle] = current;
    return accumulator;
  }, {});

  return {
    totalAttempts,
    uniqueStudents,
    averagePercentage,
    leaderboard,
    testBreakdown: Object.values(testBreakdown)
  };
}
