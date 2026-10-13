# LambdaQuizzer λ

A free live quiz game for college classes and review sessions. It is a static site
(GitHub Pages), with no server, no accounts, and no database.

- **Make quizzes** in the browser: multiple choice (2 to 4 answers, one or more correct) or
  true/false, time limits from 5 seconds to 2 minutes, standard / double / no points, and an
  optional image per question. Quizzes autosave in your browser; export and import them as JSON.
- **Players join from their phones** by scanning the QR code on the big screen or typing the
  6-digit game PIN at the site's home page.
- **Game-show play:** get-ready countdown, question reading time, big Greek-letter answer
  buttons on phones (α β γ δ, or ⊤ / ⊥ for true/false), an answer chart, a scoreboard after
  every question, hot-streak bonuses, and a podium with confetti at the end.
- **Music and sound effects.** Background music is by Kevin MacLeod (see Credits). The sound
  effects are royalty-free files in `assets/sfx/`, one per event (`join.mp3`, `correct.mp3`,
  `drumroll.mp3`, ...). Replace a file to change a sound; open `tools/sfx-preview.html` from a local
  server to hear them all. Any effect without a file falls back to a synthesized version in
  `js/audio.js`. Music and sound each have a mute button.
- **Editable flavor text.** The quips students see after answering, on the scoreboard and at the
  end are all in `js/messages.js`. Add, remove or rewrite lines; one is picked at random each time.
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

**Music.** `tools/music.py` pulls tracks straight from the Incompetech catalog and files them
in the right place. Each download gets a tidy file name, its silent intro trimmed and its loudness
matched to the rest (needs `ffmpeg`), and the track list and the Credits below are updated:

    python3 tools/music.py search bouncy bright          # browse: title, length, bpm, mood
    python3 tools/music.py add "Run Amok" "Cipher"       # add to the question playlist
    python3 tools/music.py add "Wallpaper" --to lobby    # replace lobby music (or --to results)
    python3 tools/music.py remove "Run Amok"
    python3 tools/music.py                               # after dropping files in by hand

Dropped files into `assets/music/question/` yourself? Run `python3 tools/music.py` with no arguments:
it renames and volume-matches them, adds them to the playlist and credits them below. (Even if you
forget, the deploy workflow still adds them to the playlist; only the credits need the script.)
One track is picked at random per question.

Libraries are vendored in `vendor/` (PeerJS 1.5.4, qrcode-generator 1.4.4). The font is
Space Grotesk from Google Fonts.

## Deploying to GitHub Pages

Deployment is automatic. `.github/workflows/pages.yml` checks the JavaScript and publishes the site
on every push to `main` (you can also run it by hand from the **Actions** tab). One-time setup:

1. Push this repository to GitHub.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push again, or re-run the workflow. The site will be at
   `https://<your-username>.github.io/LambdaQuizzer/`.

Only the site files (`index.html`, `host.html`, `assets/`, `css/`, `js/`, `vendor/`) are published,
not the tests.

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

## Credits

<!-- music-credits:start -->
Music by Kevin MacLeod ([incompetech.com](https://incompetech.com)):

- Lobby: "Monkeys Spinning Monkeys"
- Questions (a random one each question):
  - "Carnivale Intrigue"
  - "Cipher"
  - "Goblin Tinker Soldier Spy"
  - "Jaunty Gumption"
  - "Local Forecast - Slower"
  - "Lord of the Rangs"
  - "Meatball Parade"
  - "Mystery Bazaar"
  - "Mystery!"
  - "Newer Wave"
  - "One-eyed Maestro"
  - "Outfoxing the Fox"
  - "Raving Energy (faster)"
  - "Run Amok"
  - "Scheming Weasel (faster version)"
  - "Sneaky Snitch"
  - "The Complex"
  - "Waltz of the Carnies"
- Scoreboard and results: "Itty Bitty 8 Bit"
<!-- music-credits:end -->

Sound effects:

- Interface sounds, jingles and hits by [Kenney](https://kenney.nl) (CC0): click, join, pop, submit,
  countdown, go, tick, correct, wrong, streak, podium hit
- Royalty-free sounds from [Pixabay](https://pixabay.com): "Timpani Roll" (freesound_community),
  "Brass Fanfare with Timpani and Winchimes" (u_ss015dykrt), "You Win Sequence 2" (floraphonic),
  "Ding" (freesound_community), "Swoosh 015" (Universfield)
