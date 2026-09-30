# Changelog

## 0.2.0 — 2026-09-30

The first release that can update itself, and the first to carry the update feed.

### Updating

- Help → Check for Updates…: finds the latest GitHub release, downloads it on request with
  progress in the notice bar, and installs it on a second confirmation. The AppImage replaces
  itself; pacman and deb installs go through the system's password dialog. Failures name the
  reason and offer the releases page.

### Releasing

- Releases are built by the Release workflow from a `v<version>` tag and include the update feed
  (`latest-linux.yml`) for the in-app updater; the packages now carry `app-update.yml` and the
  package type electron-updater needs. 0.1.0 was built without these, so it has to be replaced by
  hand once.

### Generation data

- "Copy for Fooocus" on the generation panel: the parameters as the JSON Fooocus's prompt box
  loads with "Load Parameters". Model file names come from the Fooocus log when the image
  embeds only their stems, so the dropdowns select the right files. "Copy all" (A1111 infotext)
  is unchanged.

## 0.1.0 — first release

The first usable Genfolio: a desktop gallery for images generated with AUTOMATIC1111 and
Fooocus, for Linux (AppImage, pacman, deb).

### Library

- Add folders; each is indexed (PNG, JPEG, WebP, AVIF, GIF) and nested folders merge into one
  library. Remove a folder without touching its files.
- Live updates: images written by a running generator appear within about 3 s, deleted and
  moved files follow, and changes made while Genfolio was closed are picked up when it starts.
  A folder that can't be watched (the system's watch limit) is rescanned every 10 minutes.
- A virtualized masonry gallery that stays smooth at 100k images, sorted by date, name or
  rating, with a folder tree.

### Generation data

- Prompts, negative prompts, seeds, samplers, checkpoints, refiners and LoRAs (with weights)
  from A1111 PNG text and EXIF, `.txt` sidecars, Fooocus JSON and Fooocus `log.html`.
- A generation panel on the detail page, copying the prompt or everything in one click.

### Search

- Full-text prompt search with phrases, prefixes and exclusions; filters for checkpoints,
  LoRAs (any/all, weight range), generator, seed, same prompt, tags, favourites and minimum
  rating, with live counts; filters live in the URL.

### Organizing

- Favourites and 0–5 ratings from the card, the detail page and the keyboard (F, 0–5).
- Tags with bulk apply, rename, merge and delete.
- Multi-select (Ctrl, Shift, Ctrl+A) with a bulk bar.
- Manual albums you arrange by menu or drag, and smart albums that save a search.
- Deletion to the system trash, or permanently after a confirmation shown by the app itself;
  every path is verified against its folder, and a report lists what couldn't be deleted.
- A full-screen slideshow with shuffle, loop, a prompt overlay and saved presets.

### Look-alikes

- Exact and near-duplicate detection (SHA-256, dHash and pHash), grouped with a threshold you
  can change, an `≈ N` badge on cards, a suggested keeper and "trash all but keeper".

### Reliability

- The library runs in its own process and restarts after a crash.
- Logs in `~/.config/Genfolio/logs` (no file paths or prompts), reachable from
  Help → Open Logs Folder and from notices about unreadable files or unexpected errors.
