/* LambdaQuizzer flavor text, shown on students' phones.
 * Edit freely: each list can have as many lines as you like, and one is picked at random each time.
 * Keep each line short enough to fit on a phone. Plain text only (no HTML). */
window.LQ_MESSAGES = {
  // After a student taps an answer, while waiting for everyone else.
  locked: [
    'Answer locked in.',
    'Got it. Waiting on everyone else.',
    'Submitted. Hang tight.',
    'Sent. Let’s see how the room did.',
    'Locked in.',
    'Done. Just waiting on the others.'
  ],

  // Correct answer.
  right: [
    'Correct.',
    'Nailed it.',
    'That’s right.',
    'Good one.',
    'Right on.'
  ],

  // Wrong answer.
  wrong: [
    'Not quite.',
    'Close, but no.',
    'Not this time.',
    'That one was tricky.',
    'Missed that one. Next one’s yours.'
  ],

  // Didn't answer before time ran out.
  late: [
    'Time ran out.',
    'Too slow on that one.',
    'No answer in time.'
  ],

  // Scoreboard between questions.
  scoreboardTop3: [
    'You’re in the top three.',
    'Looking good so far.'
  ],
  scoreboardRest: [
    'Plenty of questions left.',
    'Still anyone’s game.'
  ],

  // Final results.
  endFirst: ['You won. Nicely done.'],
  endPodium: ['Top three finish. Well played.'],
  endRest: ['Good game. See you next time.']
};
