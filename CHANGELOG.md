# Changelog

## 0.4.1 — 2026-10-03

A faster gallery and a lighter live refresh while a generator is writing to your library.

### Gallery

- Every card is a small WebP (400, 600 or 800 px wide, chosen from the column width and the
  screen's pixel ratio) instead of the full original, so scrolling a library of 1024-px images
  moves tens of KB per card instead of up to a megabyte or more, and an image narrower than the target is
  never upscaled. The copies live in memory only, and nothing derived from your images is
  written to disk. The detail view still shows the original.
- Several requests for one card share a single read and resize, and originals are read only once
  a resize slot is free.
- When a scan finishes, only the cards on screen are loaded again, the cache of cards is
  bounded, and scans that end close together reload the library once; only the scanned
  folder's tree is fetched again.

### Scanning

- Each image is opened once for its size and its metadata, a folder's files are checked 32 at a
  time, and metadata and the generation are stored without checking every row twice. A scan of a
  large folder of small files takes about 40% less time in a synthetic test.
- A refresh of one folder reads only that folder's rows, not the whole root. An unchanged
  Fooocus `log.html` is no longer read and parsed again for every new image, and the stored log
  records of a folder are fetched in one query.
- At startup the folders are walked one pass at a time: file watching first, then the scan.
  Looking for look-alikes and hashing run on the thread pool beside the image decode, so the
  library service answers requests meanwhile.

### Look-alikes

- Groups are rebuilt only when something changed, and only the images whose group changed are
  written. A group left stale by a scan that stopped half-way, or by deleting an image, is now
  repaired the next time the app runs or a scan ends; on the first start of this version
  every group is rebuilt once.

## 0.4.0 — 2026-10-02

Know your models, and get new ones from Civitai.

### Settings

- A Settings page (sidebar) with one download folder for checkpoints and one for LoRAs, chosen
  with a folder dialog.
- An optional Civitai API key for downloads that ask for a login. It is kept encrypted by the
  system keyring and sent only to civitai.com; without a working keyring it is refused rather
  than stored under a fixed password.

### Models

- A Models page listing the checkpoints and LoRAs your images use, and any you add by hand, with
  what you record about each: base model, trigger words, strength, description and notes. Search by
  name, base model, trigger words or notes; filter by type, base model, or "no info yet"; copy the
  trigger words.
- Link a model to its Civitai page: **Look up on Civitai** matches by the file hashes already seen
  for the model (an exact match), or search Civitai by name and choose a version. It fills in base
  model, trigger words, descriptions, creator and download counts, and you can open the page,
  refresh, change or unlink. What Civitai says is kept apart from what you wrote: your base model
  and strength win, and trigger words from both are listed, yours first.

### Get models

- A page to search Civitai by name, type (LoRA or checkpoint) and base model, and download a
  version into the folder chosen in Settings, in a subfolder for its base model: an SDXL LoRA goes
  to `<LoRAs folder>/sdxl`. SDXL variants share `sdxl`, SD 1.x is `sd15`, and other base models get a
  lowercase folder of their own; an existing folder named alike (such as `SDXL`) is reused.
- Downloads show progress, can be cancelled, and run two at a time. A file is checked against the
  size and SHA-256 Civitai gives before it is put in place, an existing file is never overwritten,
  and a failed or cancelled download leaves nothing behind. A finished download is added to Models,
  linked to its Civitai version.
- Searching and downloading contact civitai.com, and only when you ask.

### Fixed

- Opening Settings no longer freezes the app while the system keyring answers.
- Get models cards no longer overflow, show one slash in paths, and list trigger words without
  trailing commas.

## 0.3.0 — 2026-10-01

Two filters for working through the library.

### Filters

- **Not Tagged**: images that carry no tags, to tag the library over time until every image has
  one.
- **No Album**: images that are in no manual album (smart albums are saved searches and hold no
  images), to leave out what is already filed.
- Both combine with every other filter, such as a LoRA, show as removable chips, are kept in the
  address and in saved smart albums, and update as you tag or file: an image leaves the view once
  it is tagged or added to an album.

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
