# Release Checklist

Use this before committing or pushing Context Engine changes.

## Code Checks

- Run `node --check` on changed JavaScript and CommonJS files.
- Run `npm run smoke`.
- Run `npm run check` after dependencies are installed.
- Confirm `git diff --check` passes.

## Scope Checks

- Confirm no source file exceeds the 700-line hard limit.
- Prefer splitting files before they exceed the 500-line soft limit.
- Confirm runtime data is not staged unless intentionally changing seed data.
- Confirm generated output files are not staged.

## App Checks

- Confirm `http://127.0.0.1:3847/` loads.
- Confirm Dashboard, Skills, Modes, Memory, Rules, and Connections tabs load.
- Confirm Connections detection separates detected hosts from unavailable targets.
- Confirm Update Available only writes to available global or registered workspace targets.

## Desktop Checks

- Run `npm run desktop` after Electron dependencies are installed.
- Confirm the Electron window opens the local dashboard.
- Confirm closing the Electron app stops its owned server.

## Build & Distribution

Outputs land in `app/dist/`. `dist/` is build output — never commit it.

| Command                       | Produces                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| `npm run build:win`           | Both NSIS installer and portable .exe for Windows.                     |
| `npm run build:win:installer` | Only the NSIS installer (`Context Engine-<v>-setup-x64.exe`).          |
| `npm run build:win:portable`  | Only the portable single-file (`Context Engine-<v>-portable-x64.exe`). |
| `npm run build:mac`           | DMG and ZIP for macOS using `icon.icns`.                               |
| `npm run build:linux`         | AppImage and .deb for Linux using the generated icon set.              |
| `npm run build`               | All targets enabled for the current host platform.                     |

### Installer behaviour

- App ID: `com.datacert.context-engine` (also set via `app.setAppUserModelId` at runtime so dev-mode and packaged-mode share one Windows taskbar identity).
- Per-user install (no UAC elevation needed).
- Allows changing install directory.
- Creates Desktop and Start Menu shortcuts named "Context Engine".
- Uninstall preserves user data by default (`deleteAppDataOnUninstall: false`).
- Portable variant runs from any location; writes runtime data alongside the .exe.
- Brand icon source: `ui/assets/brand/icon.svg`. Regenerate Windows `.ico`, macOS `.icns`, Linux icon set, and 512px PNG with `npm run assets:icons` after changing the SVG.
- Code signing: not configured. NSIS and portable .exe ship unsigned — Windows SmartScreen will warn on first run until a code-signing certificate is added (then set `CSC_LINK` and `CSC_KEY_PASSWORD` env vars before building).
- Auto-update channel: GitHub releases (`Jeremy8776/context-engine`). `latest.yml` and `.blockmap` files in `dist/` go up with the release for `electron-updater` to consume.

### Pre-release smoke

Before publishing a build:

1. Close any running Context Engine instance (locked .exe blocks the build).
2. Bump `version` in `app/package.json`.
3. `rm -rf app/dist` to ensure a clean output.
4. Run the appropriate `build:*` script.
5. Install the produced setup .exe on a clean profile.
6. Confirm the taskbar/start-menu/window icons all show the C-mark, not the Electron default.
7. Confirm the app launches, the local server boots, and the Dashboard renders.
