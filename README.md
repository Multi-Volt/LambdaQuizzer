# LambdaQuizzer λ

A free, Kahoot-style live quiz game for college classes and review sessions. It is a static site
(GitHub Pages), with no server, no accounts, and no database.

- **Make quizzes** in the browser: multiple choice (2 to 4 answers, one or more correct) or
  true/false, time limits from 5 seconds to 2 minutes, standard / double / no points, and an
  optional image per question. Quizzes autosave in your browser; export and import them as JSON.
- **Players join from their phones** by scanning the QR code on the big screen or typing the
  6-digit game PIN at the site's home page.
- **Kahoot-style play:** get-ready countdown, question reading time, colored shape buttons on
  phones, answer chart, scoreboard after every question, answer streak bonuses, and a podium with
  confetti at the end.
- **Original music and sound effects.** A bouncy lobby loop and a tense countdown loop are written
  as MIDI note sequences and synthesized live with the Web Audio API (`js/audio.js`), so there are no
  audio files. There are effects for players joining, ticking clock, gong, correct, wrong,
  drumroll and fanfare. Music and sound each have a mute button.
- **Host tools:** remove a player by clicking their name in the lobby, lock the lobby, skip a
  question, and download a CSV of results.
- Players who refresh or lose Wi-Fi can rejoin and keep their score.

## Hosting a game

1. Open `host.html` (the **Create and host a quiz** link on the home page) on the computer that is
   connected to the projector.
2. Edit one of the sample quizzes or make a new one, then click **Host**.
3. Students go to the site on their phones and scan the QR code or enter the PIN.
4. Click **Start**. Press **Next** (or Enter / Space) to move through the game.

Keep the host tab open and in front during the game. The host's browser *is* the game server.

## How it works

Players connect directly to the host's browser over WebRTC using [PeerJS](https://peerjs.com/).
The free public PeerJS service only introduces the browsers to each other (the game PIN is the
host's peer name); game traffic then goes peer-to-peer, through PeerJS's public TURN relay when a
network blocks direct connections. Some locked-down campus networks block WebRTC entirely; if
students can't join, have them switch to mobile data.

Libraries are vendored in `vendor/` (PeerJS 1.5.4, qrcode-generator 1.4.4). The font is
Montserrat from Google Fonts.

## Deploying to GitHub Pages

Push this repository to GitHub, then go to **Settings → Pages**, set **Source** to
*Deploy from a branch*, pick `main` and `/ (root)`, and save. The site will be at
`https://<your-username>.github.io/LambdaQuizzer/`.

## Running locally

Serve the folder with any static server, for example `python3 -m http.server`, and open
`http://localhost:8000/host.html`. Phones on the same network can join with your computer's IP
address instead of `localhost`.

## Tests

`tests/e2e.py` plays a full game in headless Chromium with a host and three phone players over the
real PeerJS service: QR and PIN joins, duplicate nicknames, kicking, scoring, a mid-game refresh,
the podium, and the CSV download.

    pip install playwright && playwright install chromium
    python tests/e2e.py
