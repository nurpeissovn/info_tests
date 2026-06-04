function studentKey(record) {
  return `${record.student?.name || ""} ${record.student?.surname || ""}`.trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeQuestionMetric(question, totalTimeFallback) {
  return {
    id: question.id,
    question: question.question || "Unknown question",
    subject: question.subject || "General",
    selectedAnswer: question.selectedAnswer || "",
    correctAnswer: question.correctAnswer || "",
    isCorrect: Boolean(question.isCorrect),
    timeSpentSeconds: Math.max(0, Number(question.timeSpentSeconds ?? totalTimeFallback) || 0)
  };
}

export function normalizeAnalyticsRecord(record) {
  const review = safeArray(record.review);
  const fallbackQuestionTime = review.length > 0 ? (record.timeSpentSeconds || 0) / review.length : 0;

  return {
    ...record,
    testId: record.testId || "unknown-test",
    testTitle: record.testTitle || "Unknown Test",
    submittedAt: Number(record.submittedAt || Date.now()),
    warningCount: Number(record.warningCount ?? record.violations ?? 0),
    percentage: Number(record.percentage || 0),
    score: Number(record.score || 0),
    totalPoints: Number(record.totalPoints || 0),
    timeSpentSeconds: Number(record.timeSpentSeconds || 0),
    passed: Boolean(record.passed),
    review: review.map((question) => normalizeQuestionMetric(question, fallbackQuestionTime))
  };
}

export function buildTeacherOverview(records) {
  const normalized = records.map(normalizeAnalyticsRecord);
  const percentages = normalized.map((record) => record.percentage);
  const times = normalized.map((record) => record.timeSpentSeconds);
  const warnings = normalized.map((record) => record.warningCount);
  const passedCount = normalized.filter((record) => record.passed).length;

  return {
    totalStudents: new Set(normalized.map(studentKey)).size,
    totalAttempts: normalized.length,
    averageScore: normalized.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / normalized.length) : 0,
    highestScore: percentages.length ? Math.max(...percentages) : 0,
    lowestScore: percentages.length ? Math.min(...percentages) : 0,
    passRate: normalized.length ? Math.round((passedCount / normalized.length) * 100) : 0,
    averageTimeSpent: normalized.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / normalized.length) : 0,
    averageWarnings: normalized.length ? (warnings.reduce((sum, value) => sum + value, 0) / normalized.length).toFixed(1) : "0.0"
  };
}

export function buildStudentProfiles(records) {
  const grouped = new Map();

  for (const rawRecord of records.map(normalizeAnalyticsRecord)) {
    const key = studentKey(rawRecord);
    const current = grouped.get(key) || {
      id: key,
      name: rawRecord.student.name,
      surname: rawRecord.student.surname,
      attempts: []
    };

    current.attempts.push(rawRecord);
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((profile) => {
      const attempts = profile.attempts.sort((first, second) => first.submittedAt - second.submittedAt);
      const averageScore = attempts.length
        ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.percentage, 0) / attempts.length)
        : 0;
      const bestScore = attempts.length ? Math.max(...attempts.map((attempt) => attempt.percentage)) : 0;
      const warningHistory = attempts.map((attempt) => ({
        date: attempt.submittedAt,
        value: attempt.warningCount
      }));

      const subjectStats = {};

      for (const attempt of attempts) {
        for (const question of attempt.review) {
          const current = subjectStats[question.subject] || {
            subject: question.subject,
            correct: 0,
            wrong: 0,
            totalTime: 0
          };

          if (question.isCorrect) {
            current.correct += 1;
          } else {
            current.wrong += 1;
          }

          current.totalTime += question.timeSpentSeconds;
          subjectStats[question.subject] = current;
        }
      }

      const subjects = Object.values(subjectStats).map((subject) => ({
        ...subject,
        total: subject.correct + subject.wrong,
        accuracy: subject.correct + subject.wrong ? Math.round((subject.correct / (subject.correct + subject.wrong)) * 100) : 0,
        averageTime: subject.correct + subject.wrong ? Math.round(subject.totalTime / (subject.correct + subject.wrong)) : 0
      }));

      const strongTopics = subjects.filter((subject) => subject.accuracy >= 75);
      const weakTopics = subjects.filter((subject) => subject.accuracy < 60);
      const latestScore = attempts.length ? attempts[attempts.length - 1].percentage : 0;
      const earliestScore = attempts.length ? attempts[0].percentage : 0;
      const trendDelta = latestScore - earliestScore;

      return {
        ...profile,
        attempts,
        averageScore,
        bestScore,
        subjects,
        strongTopics,
        weakTopics,
        warningHistory,
        trendLabel: trendDelta > 8 ? "Improving" : trendDelta < -8 ? "Declining" : "Stable",
        diagnoses: buildStudentDiagnoses({ attempts, subjects, averageScore })
      };
    })
    .sort((first, second) => second.averageScore - first.averageScore);
}

function buildStudentDiagnoses({ attempts, subjects, averageScore }) {
  const notes = [];
  const strongTopics = subjects.filter((subject) => subject.accuracy >= 80);
  const weakTopics = subjects.filter((subject) => subject.accuracy < 60);
  const averageTimePerQuestion =
    attempts.length && attempts.some((attempt) => attempt.review.length)
      ? Math.round(
          attempts.reduce((sum, attempt) => sum + attempt.timeSpentSeconds / Math.max(attempt.review.length, 1), 0) / attempts.length
        )
      : 0;

  if (strongTopics[0]) {
    notes.push(`Student understands ${strongTopics[0].subject.toLowerCase()} well.`);
  }

  if (weakTopics[0]) {
    notes.push(`Student needs revision on ${weakTopics[0].subject.toLowerCase()}.`);
  }

  if (averageTimePerQuestion < 20 && averageScore < 70) {
    notes.push("Student answers quickly but makes mistakes.");
  }

  if (averageScore >= 80) {
    notes.push("Student shows consistent high performance across attempts.");
  }

  return notes.slice(0, 4);
}

export function buildTopicAnalytics(records) {
  const topicMap = new Map();

  for (const record of records.map(normalizeAnalyticsRecord)) {
    for (const question of record.review) {
      const current = topicMap.get(question.subject) || {
        subject: question.subject,
        correct: 0,
        wrong: 0,
        studentsWrong: new Set(),
        studentsCorrect: new Set()
      };

      if (question.isCorrect) {
        current.correct += 1;
        current.studentsCorrect.add(studentKey(record));
      } else {
        current.wrong += 1;
        current.studentsWrong.add(studentKey(record));
      }

      topicMap.set(question.subject, current);
    }
  }

  return Array.from(topicMap.values()).map((topic) => {
    const total = topic.correct + topic.wrong;
    const accuracy = total ? Math.round((topic.correct / total) * 100) : 0;

    return {
      subject: topic.subject,
      averageAccuracy: accuracy,
      correctCount: topic.correct,
      wrongCount: topic.wrong,
      strugglingStudents: Array.from(topic.studentsWrong).slice(0, 6),
      masteringStudents: Array.from(topic.studentsCorrect).slice(0, 6),
      difficulty: accuracy >= 80 ? "Easy" : accuracy >= 55 ? "Medium" : "Hard",
      recommendedRevision: accuracy < 65 ? `Revise ${topic.subject.toLowerCase()} with the class.` : `Keep reinforcing ${topic.subject.toLowerCase()}.`
    };
  });
}

export function buildQuestionAnalytics(records) {
  const questionMap = new Map();

  for (const record of records.map(normalizeAnalyticsRecord)) {
    for (const question of record.review) {
      const key = `${record.testTitle}::${question.id}`;
      const current = questionMap.get(key) || {
        key,
        testTitle: record.testTitle,
        questionId: question.id,
        question: question.question,
        subject: question.subject,
        correctCount: 0,
        wrongCount: 0,
        totalTime: 0,
        wrongOptionCounts: {},
        wrongStudents: []
      };

      if (question.isCorrect) {
        current.correctCount += 1;
      } else {
        current.wrongCount += 1;
        current.wrongStudents.push(studentKey(record));
        if (question.selectedAnswer) {
          current.wrongOptionCounts[question.selectedAnswer] = (current.wrongOptionCounts[question.selectedAnswer] || 0) + 1;
        }
      }

      current.totalTime += question.timeSpentSeconds;
      questionMap.set(key, current);
    }
  }

  return Array.from(questionMap.values()).map((question) => {
    const total = question.correctCount + question.wrongCount;
    const accuracy = total ? Math.round((question.correctCount / total) * 100) : 0;
    const mostSelectedWrongOption = Object.entries(question.wrongOptionCounts).sort((first, second) => second[1] - first[1])[0]?.[0] || "None";

    return {
      ...question,
      accuracy,
      averageTimeSpent: total ? Math.round(question.totalTime / total) : 0,
      mostSelectedWrongOption,
      difficulty: accuracy >= 80 ? "Easy" : accuracy >= 55 ? "Medium" : "Hard"
    };
  });
}

export function buildAttemptsTimeline(records) {
  const buckets = {};

  for (const record of records.map(normalizeAnalyticsRecord)) {
    const day = new Date(record.submittedAt).toLocaleDateString();
    buckets[day] = (buckets[day] || 0) + 1;
  }

  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

export function buildRecordsTable(records, options) {
  const { search, filterTest, filterPass, sortBy } = options;
  let nextRecords = records.map(normalizeAnalyticsRecord);

  if (search) {
    const query = search.toLowerCase();
    nextRecords = nextRecords.filter((record) =>
      `${record.student.name} ${record.student.surname} ${record.testTitle}`.toLowerCase().includes(query)
    );
  }

  if (filterTest !== "all") {
    nextRecords = nextRecords.filter((record) => record.testId === filterTest);
  }

  if (filterPass !== "all") {
    nextRecords = nextRecords.filter((record) => String(record.passed) === filterPass);
  }

  const sorters = {
    newest: (first, second) => second.submittedAt - first.submittedAt,
    score: (first, second) => second.percentage - first.percentage,
    warnings: (first, second) => second.warningCount - first.warningCount,
    student: (first, second) => studentKey(first).localeCompare(studentKey(second))
  };

  return nextRecords.sort(sorters[sortBy] || sorters.newest);
}

export function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportRecordsCsv(records) {
  const headers = ["Name", "Surname", "Test", "Score", "Percentage", "Time Spent (s)", "Date", "Pass", "Warnings"];
  const rows = records.map((record) => [
    record.student.name,
    record.student.surname,
    record.testTitle,
    `${record.score}/${record.totalPoints}`,
    `${record.percentage}%`,
    record.timeSpentSeconds,
    new Date(record.submittedAt).toLocaleString(),
    record.passed ? "Pass" : "Fail",
    record.warningCount
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  downloadBlob("class-results.csv", csv, "text/csv;charset=utf-8;");
}

export function exportFullAnalyticsReport(summary) {
  downloadBlob("full-analytics-report.json", JSON.stringify(summary, null, 2), "application/json;charset=utf-8;");
}

export function exportStudentReportPdf(profile) {
  if (!profile) {
    return;
  }

  const reportWindow = window.open("", "_blank", "width=980,height=720");

  if (!reportWindow) {
    return;
  }

  reportWindow.document.write(`
    <html>
      <head>
        <title>${profile.name} ${profile.surname} Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #152136; }
          h1, h2 { margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d7e0ec; padding: 10px; text-align: left; }
          .card { margin-top: 16px; padding: 16px; border: 1px solid #d7e0ec; border-radius: 12px; }
        </style>
      </head>
      <body>
        <h1>${profile.name} ${profile.surname}</h1>
        <p>Average score: ${profile.averageScore}% | Best score: ${profile.bestScore}% | Trend: ${profile.trendLabel}</p>
        <div class="card">
          <h2>Teacher comments</h2>
          <ul>${profile.diagnoses.map((note) => `<li>${note}</li>`).join("")}</ul>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Test</th>
              <th>Score</th>
              <th>Time</th>
              <th>Warnings</th>
            </tr>
          </thead>
          <tbody>
            ${profile.attempts
              .map(
                (attempt) => `
                  <tr>
                    <td>${new Date(attempt.submittedAt).toLocaleString()}</td>
                    <td>${attempt.testTitle}</td>
                    <td>${attempt.percentage}%</td>
                    <td>${attempt.timeSpentSeconds}s</td>
                    <td>${attempt.warningCount}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}
