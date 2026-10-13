"""End-to-end test: a host and three phone players play a full game over the real PeerJS
broker. Checks the music files load, the join flow (QR link and PIN), duplicate nicknames, kicking, answering,
scoring, a refresh mid-game (rejoin keeps the score), and the podium. Screenshots go to tests/out.

    pip install playwright && playwright install chromium
    python tests/e2e.py
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
SITE = os.path.dirname(HERE)
PORT = 8766
BASE = f'http://localhost:{PORT}/'

QUIZ = {
    'id': 'e2etest', 'title': 'E2E Quiz', 'description': 'test', 'updated': 9e12,
    'questions': [
        {'id': 'q1', 'type': 'quiz', 'text': 'What does λ stand for?', 'image': 'tests/fixtures/checker.png', 'time': 20, 'points': 1,
         'answers': ['A loop', 'A function', 'A type', ''], 'correct': [1]},
        {'id': 'q2', 'type': 'tf', 'text': 'Arrays start at 0.', 'image': '', 'time': 10, 'points': 2,
         'answers': ['True', 'False', '', ''], 'correct': [0]},
        {'id': 'q3', 'type': 'quiz', 'text': 'Pick green', 'image': '', 'time': 5, 'points': 1,
         'answers': ['red', 'blue', 'yellow', 'green'], 'correct': [3]},
    ]
}
# Answer slots per player per question (None = do not answer).
PLAN = {
    'Ada':   [1, 0, 3],
    'Alan':  [0, 0, None],
    'Grace': [1, 1, 3],
}

errors = []


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('  ok:', msg)


DROPPED = os.path.join(SITE, 'assets', 'music', 'question', 'zz-dropped-in.mp3')


def main():
    import shutil
    shutil.copy(os.path.join(SITE, 'assets', 'music', 'question', 'cipher.mp3'), DROPPED)
    try:
        serve_and_run()
    finally:
        os.remove(DROPPED)


def serve_and_run():
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=SITE,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
            run(browser)
            browser.close()
    finally:
        server.terminate()
    real = [e for e in errors if 'fonts.g' not in e]
    if real:
        print('Console errors:\n  ' + '\n  '.join(real))
        sys.exit(1)
    print('PASS')


def watch(page, who):
    page.on('pageerror', lambda e: errors.append(f'{who}: {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{who}: {m.text}'))


def run(browser):
    hctx = browser.new_context(viewport={'width': 2557, 'height': 1355})
    hctx.add_init_script(f"localStorage.setItem('lq-quizzes-v1', JSON.stringify([{json.dumps(QUIZ)}]))")
    host = hctx.new_page()
    watch(host, 'host')
    music = {}
    host.on('response', lambda r: '/assets/music/' in r.url and music.__setitem__(r.url.rsplit('/', 1)[1], r.status))
    host.goto(BASE + 'host.html')
    host.screenshot(path=f'{OUT}/library.png')
    host.click('.quiz-card [data-act=edit]')
    host.wait_for_selector('.q-card')
    host.screenshot(path=f'{OUT}/editor.png', full_page=True)
    host.click('#editor .topbar [data-act=host]')
    host.wait_for_selector('.pin-box strong', timeout=20000)
    pin = host.inner_text('.pin-box strong').replace(' ', '')
    check(len(pin) == 6, f'host got PIN {pin}')
    qr_href = host.get_attribute('.qr', 'href')
    # A track dropped into the folder (not in tracks.json) is found via the server's folder listing.
    found = host.evaluate("fetch('assets/music/question/').then(r => r.text()).then(t => t.includes('zz-dropped-in.mp3'))")
    check(found, 'new question track visible in folder listing')
    host.wait_for_function("LQAudio.playing === 'lobby'")
    host.wait_for_timeout(1500)
    check(music.get('monkeys-spinning-monkeys.mp3') in (200, 206), 'lobby music file loads')
    check(qr_href.endswith('index.html?pin=' + pin), 'QR link points at the join page with the PIN')

    players = {}
    for i, name in enumerate(PLAN):
        ctx = browser.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        watch(pg, name)
        if i == 0:
            pg.goto(qr_href)                     # scanned the QR code
        else:
            pg.goto(BASE)                        # typed the PIN
            pg.fill('#pinIn', pin)
            pg.click('#pinForm button')
        pg.wait_for_selector('#nameIn', timeout=20000)
        if i == 0:
            pg.screenshot(path=f'{OUT}/player_name.png')
        players[name] = pg

    # Duplicate nickname is rejected.
    players['Alan'].fill('#nameIn', 'ada')
    players['Ada'].fill('#nameIn', 'Ada')
    players['Ada'].click('#nameForm button')
    players['Ada'].wait_for_selector('.youre-in')
    players['Alan'].click('#nameForm button')
    players['Alan'].wait_for_selector('.form-error')
    check('taken' in players['Alan'].inner_text('.form-error'), 'duplicate nickname rejected')
    players['Alan'].fill('#nameIn', 'Alan')
    players['Alan'].click('#nameForm button')
    players['Grace'].fill('#nameIn', 'Grace')
    players['Grace'].click('#nameForm button')
    for pg in players.values():
        pg.wait_for_selector('.youre-in')
    players['Ada'].screenshot(path=f'{OUT}/player_lobby.png')

    # A troll joins and gets kicked.
    tctx = browser.new_context(viewport={'width': 390, 'height': 760})
    troll = tctx.new_page()
    troll.goto(qr_href)
    troll.wait_for_selector('#nameIn', timeout=20000)
    troll.fill('#nameIn', 'xX_troll_Xx')
    troll.click('#nameForm button')
    host.wait_for_function("document.querySelectorAll('.chip').length === 4", timeout=10000)
    host.screenshot(path=f'{OUT}/lobby.png')
    host.click('.chip:has-text("xX_troll_Xx")')
    troll.wait_for_selector('text=removed you', timeout=10000)
    host.wait_for_function("document.querySelectorAll('.chip').length === 3")
    check(True, 'kicked player removed and told')
    tctx.close()

    host.click('#startBtn')
    for qi in range(len(QUIZ['questions'])):
        host.wait_for_selector('.getready')
        if qi == 0:
            host.screenshot(path=f'{OUT}/getready.png')
            players['Ada'].wait_for_selector('.loader-shapes')
            players['Ada'].screenshot(path=f'{OUT}/player_getready.png')
        host.wait_for_selector('.reading', timeout=8000)
        if qi == 0:
            host.screenshot(path=f'{OUT}/reading.png')
        host.wait_for_selector('.answering', timeout=10000)
        if qi == 0:
            host.screenshot(path=f'{OUT}/answering.png')
            box = host.locator('.q-image img').bounding_box()
            check(box and box['height'] > 400, f'question image fills the free space ({box and int(box["height"])}px tall)')
            tiles = host.locator('.tiles').bounding_box()
            check(tiles['y'] + tiles['height'] <= 1355, 'answer tiles fit on screen')
            host.set_viewport_size({'width': 1366, 'height': 768})
            host.wait_for_timeout(200)
            host.screenshot(path=f'{OUT}/answering_laptop.png')
            tiles = host.locator('.tiles').bounding_box()
            check(tiles['y'] + tiles['height'] <= 768, 'answer tiles fit on a laptop screen')
            host.set_viewport_size({'width': 2557, 'height': 1355})
        if qi == 1:
            # Grace refreshes her phone mid-question and should land back on the answer screen.
            players['Grace'].reload()
            players['Grace'].wait_for_selector('.answer-btn', timeout=20000)
            check(players['Grace'].inner_text('#pbName') == 'Grace', 'refresh rejoins with the same nickname')
        for name, pg in players.items():
            slot = PLAN[name][qi]
            pg.wait_for_selector('.answer-btn', timeout=10000)
            if qi == 1 and name == 'Ada':
                pg.screenshot(path=f'{OUT}/player_tf.png')
            if qi == 0 and name == 'Ada':
                pg.screenshot(path=f'{OUT}/player_answer.png')
            if slot is not None:
                pg.click(f'.answer-btn[data-slot="{slot}"]')
        host.wait_for_selector('.reveal', timeout=12000)
        host.wait_for_timeout(800)
        host.screenshot(path=f'{OUT}/reveal{qi + 1}.png')
        for name, pg in players.items():
            pg.wait_for_selector('.result-title', timeout=8000)
            title = pg.inner_text('.result-title')
            slot = PLAN[name][qi]
            want = 'Time' if slot is None else ('Correct' if slot in QUIZ['questions'][qi]['correct'] else 'Incorrect')
            check(want.lower() in title.lower(), f'Q{qi + 1} {name} sees "{title}"')
        if qi == 0:
            players['Ada'].screenshot(path=f'{OUT}/player_correct.png')
            players['Alan'].screenshot(path=f'{OUT}/player_wrong.png')
        host.click('#nextBtn')
        if qi < len(QUIZ['questions']) - 1:
            host.wait_for_selector('.scoreboard')
            host.wait_for_timeout(700)
            if qi == 0:
                host.screenshot(path=f'{OUT}/scoreboard.png')
            host.click('#nextBtn')

    check(music.get('itty-bitty-8-bit.mp3') in (200, 206), 'results music file loads')
    q_tracks = [f for f, st in music.items() if st in (200, 206) and f.endswith('.mp3') and f not in ('monkeys-spinning-monkeys.mp3', 'itty-bitty-8-bit.mp3')]
    check(len(q_tracks) >= 2, f'question music shuffles between tracks ({", ".join(sorted(q_tracks))})')
    host.wait_for_selector('#pod1.show', timeout=10000)
    host.wait_for_timeout(1200)
    host.screenshot(path=f'{OUT}/podium.png')
    first = host.inner_text('#pod1 .pod-name')
    check(first in ('Ada', 'Grace'), f'winner is {first}')
    scores = {n: int(players[n].inner_text('#pbScore').replace(',', '')) for n in players}
    print('  scores:', scores)
    check(scores['Alan'] > 0 and scores['Ada'] > scores['Alan'] and scores['Grace'] > scores['Alan'], 'scores make sense')
    players['Ada'].wait_for_selector('.rank-big')
    players['Ada'].screenshot(path=f'{OUT}/player_end.png')
    with host.expect_download() as dl:
        host.click('#csvBtn')
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    check(csv.startswith('Rank,Nickname,Score') and 'Grace' in csv, 'CSV results download')


if __name__ == '__main__':
    main()
