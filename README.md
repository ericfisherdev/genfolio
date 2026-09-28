# Genfolio

Desktop gallery for organizing AI-generated images from AUTOMATIC1111 and Fooocus.
Reads generation metadata (prompts, checkpoints, LoRAs) from the images and Fooocus logs,
stores it in SQLite, and lets you search, group similar images, build albums and run slideshows.

> Status: Phase 0 (scaffold). Not usable yet.

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

Run the e2e suite against a packaged build with
`GENFOLIO_E2E_EXECUTABLE=release/<version>/linux-unpacked/genfolio npx playwright test`.

## License

[MIT](LICENSE)
