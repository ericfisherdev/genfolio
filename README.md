# Genfolio

Desktop gallery for organizing AI-generated images from AUTOMATIC1111 and Fooocus.
Reads generation metadata (prompts, checkpoints, LoRAs) from the images and Fooocus logs,
stores it in SQLite, and lets you search, group similar images, build albums and run slideshows.

> Status: 0.1 (pre-release). Linux only.

## Features

- Add folders of generated images; Genfolio indexes them and follows them live (new images from a running generator appear within seconds).
- Reads prompts, seeds, checkpoints and LoRAs from AUTOMATIC1111 and Fooocus images, their `.txt` sidecars and Fooocus `log.html`.
- Search prompts, filter by checkpoint, LoRA, generator, seed, tags, favourites and ratings, with counts.
- Favourites, 0–5 ratings, tags, manual and smart albums, bulk actions, a slideshow.
- Look-alikes: exact and near duplicates grouped, with a suggested keeper and "trash all but keeper".
- Delete to the system trash, with every path verified; nothing leaves your disk without a confirmation.

## Stack

Electron 44 · Svelte 5 · TypeScript · electron-vite · better-sqlite3 · @napi-rs/image · electron-builder

## Development

Requires Node 24.

```bash
npm install
npm run dev          # app with hot reload
npm run lint
npm run format:check
npm run typecheck
npm test             # unit tests (Vitest)
npm run test:e2e     # builds, then drives the app with Playwright
npm run package:linux  # AppImage, pacman, deb in release/<version>/
```

Run the e2e suite against a packaged build with `npm run test:e2e:packaged`.

## Packaging

`npm run package:linux` builds an AppImage, a pacman package and a deb in `release/<version>/`,
with the third-party licences in `resources/THIRD_PARTY_LICENSES.txt`. The icon is drawn in
`build/icon.svg`; `npm run icons` renders its PNG sizes. `genfolio --version` prints the version.

Logs (no file paths or prompts) are in `~/.config/Genfolio/logs`, also reachable from
Help → Open Logs Folder.

## License

[MIT](LICENSE)
