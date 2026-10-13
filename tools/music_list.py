"""Write assets/music/question/tracks.json, the list of question-music files.

The site is static, so the browser can't list a folder by itself. The deploy workflow runs this
script automatically; run it yourself (python3 tools/music_list.py) only if you host the site
some other way.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
FOLDER = os.path.join(os.path.dirname(HERE), 'assets', 'music', 'question')
AUDIO = ('.mp3', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.wav', '.flac', '.webm')

files = sorted((f for f in os.listdir(FOLDER) if f.lower().endswith(AUDIO) and not f.startswith('.')), key=str.lower)
with open(os.path.join(FOLDER, 'tracks.json'), 'w', encoding='utf-8') as out:
    json.dump(files, out, indent=1, ensure_ascii=False)
    out.write('\n')
print(f'{len(files)} question tracks:', ', '.join(files) or '(none)')
