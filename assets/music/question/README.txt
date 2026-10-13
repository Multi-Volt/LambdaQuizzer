Question music: one of these is picked at random for each question (never the same twice in a row),
starting from the top and looping until time runs out.

To add a song, drop the audio file (MP3 is safest; OGG, M4A, WAV and others also work) in this
folder and push. To remove one, delete it. The deploy workflow rebuilds tracks.json, the list the
site reads, every time. When testing locally with `python3 -m http.server`, new files are picked up
straight from the folder too.

Tip: songs that start loud work best, since short questions only hear the first few seconds.

Easiest way to add Incompetech songs: python3 tools/music.py add "Song Title"
(downloads, names, trims and volume-matches the file, and updates the credits).
After dropping files in by hand, run python3 tools/music.py (no arguments) to clean them up and
add them to the playlist and the README credits.
