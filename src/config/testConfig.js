export const TEST_CONFIG = {
  durationMinutes: 20,
  maxViolations: 3,
  passPercentage: 60,
  showAnswerReview: true,
  rules: [
    "Enter your real name and surname before starting the test.",
    "The test opens in fullscreen when your browser allows it.",
    "Switching tabs, minimizing the browser, or leaving fullscreen counts as a warning.",
    "After 3 warnings, the test is submitted automatically.",
    "All progress is saved temporarily on this device until the test is submitted.",
  ],
};
