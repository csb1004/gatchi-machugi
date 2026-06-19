# Gatchi Machugi

Small-group room play for machugi.io. The Railway app hosts the lobby, room UI, Socket.io state, chat, and scoring. The host installs a Chrome/Chromium extension that pairs with a room and mirrors the real machugi.io tab.

## Development

```powershell
npm exec --yes pnpm@9.15.0 -- install
npm exec --yes pnpm@9.15.0 -- build
npm exec --yes pnpm@9.15.0 -- test
npm exec --yes pnpm@9.15.0 -- typecheck
npm exec --yes pnpm@9.15.0 -- dev
```

## Environment

Copy `.env.example` to `.env` and set:

- `HOST_TOKEN_PEPPER`
- `DATABASE_URL`
- `PUBLIC_APP_URL`
- `GITHUB_EXTENSION_RELEASE_URL`

## Host Extension Install

1. Download `gatchi-machugi-extension.zip` from GitHub Releases.
2. Extract the zip.
3. Open `chrome://extensions`.
4. Enable Developer Mode.
5. Click Load unpacked.
6. Select the extracted extension folder.
7. Open the Railway app and enter a host nickname.
8. Create a room from the right-side Create room panel.
9. Keep the shown host token private. It is only shown immediately after room creation.
10. Open machugi.io in the tab that will run the quiz.
11. Open the extension popup.
12. Enter the server URL, room code, and one-time host token.
13. Participants can join with the room code after the extension shows connected.

## Railway

Create one Railway service for this repository and attach Railway Postgres if you want room metadata persistence later. Set the environment variables above. Railway runs `pnpm build` and starts the single Express/Socket.io server with `pnpm start`; the server also serves the built web client.
