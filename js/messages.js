/* LambdaQuizzer flavor text, shown on students' phones.
   Edit freely: each list can have as many lines as you like, and one is picked at random each time.
   Keep each line short enough to fit on a phone. Plain text only (no HTML). */
window.LQ_MESSAGES = {
  // After a student taps an answer, while waiting for everyone else.
  locked: [
    'Locked in. No take-backs.',
    'Speedrun complete.',
    'Submitted before the deadline, for once.',
    'Bold choice. Let’s see.',
    'Answer sent. Now act natural.',
    'Confidence: 100%. Accuracy: pending.'
  ],

  // Correct answer.
  right: [
    'Big brain energy.',
    'Dean’s list material.',
    'Your professor would be proud.',
    'Absolutely cooking.',
    'That’s going on the résumé.'
  ],

  // Wrong answer.
  wrong: [
    'That’s curve-able.',
    'Office hours exist for a reason.',
    'Shake it off. Next one’s yours.',
    'Even Turing had off days.',
    'Bold. Wrong, but bold.'
  ],

  // Didn't answer before time ran out.
  late: [
    'Too slow… like campus Wi-Fi.',
    'Snoozed through that one.',
    'The answer was in the syllabus.'
  ],

  // Scoreboard between questions.
  scoreboardTop3: ['You’re on the podium… for now.'],
  scoreboardRest: ['Plenty of time to climb.'],

  // Final results.
  endFirst: ['Absolute legend.'],
  endPodium: ['Podium finish!'],
  endRest: ['GG. Run it back next class.']
};
