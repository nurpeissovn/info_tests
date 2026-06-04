export function getTotalPoints(questions) {
  return questions.reduce((total, question) => total + question.points, 0);
}

export function getRemainingSeconds(expiresAt) {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getPassStatus(passed, passPercentage) {
  return passed ? `Reached the ${passPercentage}% pass mark.` : `Below the ${passPercentage}% pass mark.`;
}

export function buildResult({ questions, answers, student, startedAt, submittedAt, passPercentage, note = "" }) {
  const totalPoints = getTotalPoints(questions);
  let score = 0;
  let correctCount = 0;

  const review = questions.map((question) => {
    const selectedAnswer = answers[question.id] || "";
    const isCorrect = selectedAnswer === question.correctAnswer;

    if (isCorrect) {
      score += question.points;
      correctCount += 1;
    }

    return {
      id: question.id,
      question: question.question,
      selectedAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      points: question.points,
    };
  });

  const percentage = totalPoints === 0 ? 0 : Math.round((score / totalPoints) * 100);
  const wrongCount = questions.length - correctCount;
  const timeSpentSeconds = Math.max(0, Math.round((submittedAt - startedAt) / 1000));

  return {
    student,
    score,
    totalPoints,
    percentage,
    correctCount,
    wrongCount,
    timeSpentSeconds,
    passed: percentage >= passPercentage,
    review,
    note,
  };
}
