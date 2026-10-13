"""Manage LambdaQuizzer's music from the Incompetech catalog (Kevin MacLeod).

    python3 tools/music.py search fun bouncy        find tracks (title, mood, bpm, length)
    python3 tools/music.py add "Run Amok" "Cipher"  download into the question playlist
    python3 tools/music.py add "Wallpaper" --to lobby      replace the lobby music
    python3 tools/music.py add "Local Forecast" --to results
    python3 tools/music.py remove "Run Amok"        take a track out of the question playlist
    python3 tools/music.py                          sync: add files dropped into assets/music/question/
                                                    to the playlist and the README credits

Every downloaded track gets a tidy file name, its silent intro trimmed and its loudness matched to
the others (needs ffmpeg; without it the file is copied as-is). Every command also picks up files
dropped into the question folder by hand, and updates the question track list
(assets/music/question/tracks.json) and the Credits section of README.md.
No third-party Python packages are needed.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC = os.path.join(ROOT, 'assets', 'music')
QUESTION = os.path.join(MUSIC, 'question')
CREDITS = os.path.join(MUSIC, 'credits.json')
AUDIO_JS = os.path.join(ROOT, 'js', 'audio.js')
README = os.path.join(ROOT, 'README.md')
CACHE = os.path.join(ROOT, 'tools', '.cache')
CATALOG_URL = 'https://incompetech.com/music/royalty-free/pieces.json'
MP3_URL = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'
AUDIO = ('.mp3', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.wav', '.flac', '.webm')
UA = {'User-Agent': 'Mozilla/5.0 (LambdaQuizzer music tool)'}
START, END = '<!-- music-credits:start -->', '<!-- music-credits:end -->'


def kebab(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def fetch(url, dest=None):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if dest:
        with open(dest, 'wb') as f:
            f.write(data)
    return data


def catalog():
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, 'pieces.json')
    if not os.path.exists(path):
        print('Downloading the Incompetech catalog…')
        fetch(CATALOG_URL, path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def find(pieces, name):
    """Exact title match, else a unique partial match. Returns (piece, alternatives)."""
    n = name.strip().lower()
    exact = [p for p in pieces if p['title'].lower() == n]
    if exact:
        return exact[0], []
    part = [p for p in pieces if n in p['title'].lower()]
    if len(part) == 1:
        return part[0], []
    return None, part


def from_filename(pieces, filename):
    """Match a downloaded file back to the catalog (handles 'Run%20Amok.mp3', 'Run_20Amok.mp3')."""
    stem = urllib.parse.unquote(filename).replace('_20', ' ')
    stem = os.path.splitext(stem)[0].lower()
    for p in pieces:
        if os.path.splitext(p['filename'])[0].lower() == stem or p['title'].lower() == stem or kebab(p['title']) == kebab(stem):
            return p
    return None


def load_credits():
    try:
        with open(CREDITS, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_credits(c):
    with open(CREDITS, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(c.items())), f, indent=1, ensure_ascii=False)
        f.write('\n')


def process(src, dest):
    """Trim leading silence, match loudness, re-encode to 128 kbps MP3. Falls back to a plain copy."""
    if not shutil.which('ffmpeg'):
        print('  (ffmpeg not found: copying without loudness matching)')
        shutil.copy(src, dest)
        return
    af = 'silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.05,loudnorm=I=-16:TP=-1.5:LRA=11'
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map_metadata', '-1', '-vn',
           '-af', af, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', dest]
    if subprocess.run(cmd).returncode != 0:
        print('  (ffmpeg failed: copying the original)')
        shutil.copy(src, dest)


def js_track(slot):
    with open(AUDIO_JS, encoding='utf-8') as f:
        m = re.search(r"%s: \{ files: \['([^']*)'\] \}" % slot, f.read())
    return m.group(1) if m else None


def set_js_track(slot, filename):
    with open(AUDIO_JS, encoding='utf-8') as f:
        s = f.read()
    s2, n = re.subn(r"(%s: \{ files: \[)'[^']*'(\] \})" % slot, r"\1'%s'\2" % filename, s)
    if not n:
        sys.exit(f'Could not find the {slot} entry in js/audio.js')
    with open(AUDIO_JS, 'w', encoding='utf-8') as f:
        f.write(s2)


def question_files():
    return sorted((f for f in os.listdir(QUESTION) if f.lower().endswith(AUDIO) and not f.startswith('.')), key=str.lower)


def rebuild(pieces=None):
    """Write tracks.json and the README credits from what is actually on disk."""
    files = question_files()
    with open(os.path.join(QUESTION, 'tracks.json'), 'w', encoding='utf-8') as f:
        json.dump(files, f, indent=1, ensure_ascii=False)
        f.write('\n')

    credits = load_credits()
    def title(rel):
        if rel in credits:
            return credits[rel]
        p = from_filename(pieces or catalog(), os.path.basename(rel))
        if p:
            credits[rel] = p['title']
            return p['title']
        return os.path.splitext(os.path.basename(rel))[0]
    lobby, results = js_track('lobby'), js_track('results')
    q_titles = [title('question/' + f) for f in files]
    lobby_title = title(lobby) if lobby else None
    results_title = title(results) if results else None
    # Forget credits for files that are gone.
    keep = {'question/' + f for f in files} | {lobby, results}
    credits = {k: v for k, v in credits.items() if k in keep}
    save_credits(credits)

    quote = lambda t: f'"{t}"'
    block = '\n'.join([
        START,
        'Music by Kevin MacLeod ([incompetech.com](https://incompetech.com)):',
        '',
        f'- Lobby: {quote(lobby_title)}' if lobby else '',
        '- Questions (a random one each question):' + ('' if q_titles else ' none'),
        *[f'  - {quote(t)}' for t in q_titles],
        f'- Scoreboard and results: {quote(results_title)}' if results else '',
        END,
    ])
    with open(README, encoding='utf-8') as f:
        readme = f.read()
    if START in readme and END in readme:
        readme = readme[:readme.index(START)] + block + readme[readme.index(END) + len(END):]
    elif '## Credits' in readme:
        readme = readme[:readme.index('## Credits')] + '## Credits\n\n' + block + '\n'
    else:
        readme = readme.rstrip() + '\n\n## Credits\n\n' + block + '\n'
    with open(README, 'w', encoding='utf-8') as f:
        f.write(readme)
    print(f'Question playlist: {len(files)} tracks. tracks.json and README credits updated.')


def cmd_search(args):
    words = [w.lower() for w in args.words]
    hits = [p for p in catalog() if all(w in ' '.join([p['title'], p.get('feel') or '', p.get('description') or '']).lower() for w in words)]
    for p in hits[:args.limit]:
        print(f"{p['title'][:38]:38}  {p['length'][3:]}  {str(p.get('bpm') or ''):>4} bpm  {p.get('feel') or ''}")
    print(f'{len(hits)} match{"es" if len(hits) != 1 else ""}' + (f' (showing {args.limit})' if len(hits) > args.limit else ''))


def cmd_add(args):
    pieces = catalog()
    tidy(pieces)
    credits = load_credits()
    if args.to != 'question' and len(args.titles) != 1:
        sys.exit(f'--to {args.to} takes exactly one track')
    for name in args.titles:
        p, alts = find(pieces, name)
        if not p:
            print(f'✗ "{name}": ' + ('no match. Try: python3 tools/music.py search ' + name.split()[0] if not alts
                                   else 'several matches: ' + ', '.join(a['title'] for a in alts[:8])))
            continue
        out_name = kebab(p['title']) + '.mp3'
        folder = QUESTION if args.to == 'question' else MUSIC
        dest = os.path.join(folder, out_name)
        if os.path.exists(dest) and not args.force:
            print(f'• "{p["title"]}" is already there ({os.path.relpath(dest, ROOT)})')
        else:
            print(f'↓ {p["title"]} ({p["length"][3:]}, {p.get("feel")})')
            with tempfile.TemporaryDirectory() as tmp:
                raw = os.path.join(tmp, 'raw' + os.path.splitext(p['filename'])[1])
                fetch(MP3_URL + urllib.parse.quote(p['filename']), raw)
                process(raw, dest)
        rel = ('question/' if args.to == 'question' else '') + out_name
        credits[rel] = p['title']
        save_credits(credits)
        if args.to != 'question':
            old = js_track(args.to)
            set_js_track(args.to, out_name)
            print(f'  {args.to} music is now {out_name}' + (f' (the old file {old} is unused; delete it if you like)' if old and old != out_name else ''))
    rebuild(pieces)


def cmd_remove(args):
    credits = load_credits()
    for name in args.titles:
        target = kebab(name)
        match = [f for f in question_files() if kebab(os.path.splitext(f)[0]) == target
                 or kebab(credits.get('question/' + f, '')) == target]
        if not match:
            print(f'✗ "{name}" is not in the question playlist')
            continue
        for f in match:
            os.remove(os.path.join(QUESTION, f))
            print(f'− removed {f}')
    rebuild()


def tidy(pieces):
    """Rename and loudness-match files that were dropped into the question folder by hand."""
    credits = load_credits()
    for f in question_files():
        stem, ext = os.path.splitext(f)
        if re.fullmatch(r'[a-z0-9-]+', stem) and ext == '.mp3':
            continue  # already managed
        p = from_filename(pieces, f)
        title = p['title'] if p else urllib.parse.unquote(stem).replace('_20', ' ')
        out = kebab(title) + '.mp3'
        src, dest = os.path.join(QUESTION, f), os.path.join(QUESTION, out)
        print(f'~ {f} → {out}' + ('' if p else ' (not in the Incompetech catalog; credited by file name)'))
        if os.path.exists(dest) and dest != src:
            print(f'  {out} already exists; removing the duplicate')
            os.remove(src)
        else:
            tmp = dest + '.tmp.mp3'
            process(src, tmp)
            os.remove(src)
            os.replace(tmp, dest)
        credits['question/' + out] = title
    save_credits(credits)


def cmd_sync(args):
    pieces = catalog()
    tidy(pieces)
    rebuild(pieces)


def main():
    ap = argparse.ArgumentParser(description='Manage LambdaQuizzer music from incompetech.com')
    sub = ap.add_subparsers(dest='cmd')
    s = sub.add_parser('search', help='search the catalog')
    s.add_argument('words', nargs='+')
    s.add_argument('--limit', type=int, default=30)
    s.set_defaults(fn=cmd_search)
    a = sub.add_parser('add', help='download tracks by title')
    a.add_argument('titles', nargs='+')
    a.add_argument('--to', choices=['question', 'lobby', 'results'], default='question')
    a.add_argument('--force', action='store_true', help='download again even if the file exists')
    a.set_defaults(fn=cmd_add)
    r = sub.add_parser('remove', help='remove question tracks by title or file name')
    r.add_argument('titles', nargs='+')
    r.set_defaults(fn=cmd_remove)
    sub.add_parser('sync', help='(default) tidy hand-added files, rebuild playlist and credits').set_defaults(fn=cmd_sync)
    args = ap.parse_args()
    (getattr(args, 'fn', None) or cmd_sync)(args)


if __name__ == '__main__':
    main()
