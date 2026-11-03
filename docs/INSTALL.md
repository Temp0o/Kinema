# Installing Kinema

This guide covers the ready-made downloads for Windows, macOS and Linux, building Kinema
from source, and fixes for common problems.

- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Where your files live](#where-your-files-live)
- [Building from source](#building-from-source)
- [Running the tests](#running-the-tests)
- [Troubleshooting](#troubleshooting)

Kinema's AI features also need Ollama. Set that up afterwards with the
[local AI guide](OLLAMA.md). Everything else works without it.

---

## Windows

Windows 10 or 11, 64-bit. Download from the
[Releases page](https://github.com/Temp0o/Kinema/releases). Each release has two Windows
files:

| File | Choose it when |
|---|---|
| `Kinema-Setup-<version>.exe`: **installer** | You want Kinema installed like any other app, with Start menu and desktop shortcuts, double-click to open `.kinema` files, and an entry in *Installed apps* for uninstalling. |
| `Kinema-<version>-Portable.exe`: **portable** | You can't or don't want to install software. It is a single file that runs from anywhere, such as your Downloads folder or a USB stick. It starts a little slower because it unpacks itself on every launch, and it doesn't register the `.kinema` file type. |

Both use the same projects folder, so you can switch between them at any time.

### Install with the installer

1. Run `Kinema-Setup-<version>.exe`.
2. If SmartScreen appears, see [the next section](#windows-smartscreen-warning).
3. Choose whether to install for your user only (the default, no admin rights needed) and
   pick a folder if you want to change it.
4. Finish. Kinema starts from the Start menu or the desktop shortcut.

### Windows SmartScreen warning

Kinema's builds are not code-signed yet, so Windows may say **"Windows protected your PC"**
the first time you run the installer or the portable `.exe`.

1. Click **More info**.
2. Check that the file name is the one you downloaded from the official Releases page.
3. Click **Run anyway**.

You only see this once per downloaded file. Some antivirus products quarantine unsigned
files. If the file disappears after downloading, restore it from your antivirus quarantine
or add an exception.

### Update

Download the newer release and run its installer. It replaces the old version in place. Your
projects and library are kept because they live in your *Documents* folder, not in the
install folder. For the portable build, just replace the `.exe`.

### Uninstall

- **Installer build:** *Settings → Apps → Installed apps → Kinema → Uninstall* (Windows 11),
  or *Control Panel → Programs and Features* (Windows 10).
- **Portable build:** delete the `.exe`.

Uninstalling **does not delete your projects**. To remove everything, also delete
`%USERPROFILE%\Documents\Kinema` after making sure you don't need anything in it.

---

## macOS

1. Download `Kinema-<version>-<arch>.dmg` from the
   [Releases page](https://github.com/Temp0o/Kinema/releases). Builds are produced on Apple
   silicon (`arm64`).
2. Open the `.dmg` and drag **Kinema** into **Applications**.
3. The first time, **right-click (or Control-click) Kinema in Applications and choose Open**,
   then confirm **Open**. Gatekeeper requires this because builds are not notarized yet.
   - If macOS only offers *Move to Trash*, open **System Settings → Privacy & Security**,
     scroll down and click **Open Anyway** next to the Kinema message.

To update, replace the app in *Applications*. To uninstall, move it to the Trash. Your
projects in `~/Documents/Kinema` are not touched.

## Linux

1. Download `Kinema-<version>-<arch>.AppImage` from the
   [Releases page](https://github.com/Temp0o/Kinema/releases).
2. Make it executable and run it:
   ```bash
   chmod +x Kinema-*.AppImage
   ./Kinema-*.AppImage
   ```
3. If it fails with an error about **FUSE**, install the FUSE 2 library (for example
   `sudo apt install libfuse2` on Ubuntu 22.04, or `libfuse2t64` on Ubuntu 24.04 and later),
   or run it with `--appimage-extract-and-run`.

To update, replace the file. To uninstall, delete it.

---

## Where your files live

| What | Windows | macOS / Linux |
|---|---|---|
| Projects | `%USERPROFILE%\Documents\Kinema\Projects` | `~/Documents/Kinema/Projects` |
| Personal library | `%USERPROFILE%\Documents\Kinema\Library` | `~/Documents/Kinema/Library` |
| Deleted projects (recoverable) | `%USERPROFILE%\Documents\Kinema\.trash` | `~/Documents/Kinema/.trash` |

- If your *Documents* folder is redirected (for example to OneDrive), Kinema uses the
  redirected location. **Settings** in the app shows the exact folder.
- To store data somewhere else, set the `KINEMA_DATA_DIR` environment variable before
  starting Kinema. It replaces the whole `Documents/Kinema` folder:
  ```powershell
  # PowerShell, for the current session
  $env:KINEMA_DATA_DIR = "D:\KinemaData"; & "$env:LOCALAPPDATA\Programs\Kinema\Kinema.exe"
  ```
  ```bash
  KINEMA_DATA_DIR=~/kinema-data ./Kinema-*.AppImage
  ```
  The PowerShell example assumes the default per-user install folder. Adjust the path if you
  installed elsewhere.
- **Backups:** copy the whole `Kinema` folder. Individual projects can also be exported as
  `.kinema` files from the project browser.

---

## Building from source

### Prerequisites

| Tool | Version |
|---|---|
| [Node.js](https://nodejs.org) | **22.12 or newer** (or 20.19+). The LTS release is recommended. |
| npm | Comes with Node.js |
| [Git](https://git-scm.com) | Any recent version |

### Step by step on Windows

1. **Install Node.js LTS**, either with the official installer from
   [nodejs.org](https://nodejs.org) (keep the defaults) or with winget in a terminal:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
2. **Install Git:**
   ```powershell
   winget install Git.Git
   ```
3. **Close and reopen your terminal** (PowerShell or Windows Terminal) so the new `PATH` is
   picked up, then check the versions:
   ```powershell
   node --version   # v22.12.0 or newer
   npm --version
   git --version
   ```
4. **Get the code and install dependencies.** Use a short path such as `C:\dev` (see
   [long paths](#long-path-errors-on-windows)):
   ```powershell
   mkdir C:\dev; cd C:\dev
   git clone https://github.com/Temp0o/Kinema.git
   cd Kinema
   npm install
   ```
   `npm install` also downloads the Electron binary (about 100 MB) the first time.
5. **Run it:**
   ```powershell
   npm run dev
   ```
   Vite starts and the Kinema window opens with hot reload. Press **F12** for DevTools.
6. **Build installers (optional):**
   ```powershell
   npm run dist
   ```
   This runs the type-check, builds the app, and writes the NSIS installer and the portable
   `.exe` to `release\`. `release\win-unpacked\Kinema.exe` is an unpacked copy you can run
   directly.

On macOS and Linux the steps are the same: install Node.js (for example with
[nvm](https://github.com/nvm-sh/nvm), using `nvm install` to pick up `.nvmrc`) and Git,
then run the same `git clone`, `npm install` and `npm run dev` commands.

### All scripts

| Command | What it does |
|---|---|
| `npm run dev` | Electron app with hot reload |
| `npm run dev:web` | Editor in the browser at `http://localhost:5173`. Projects are stored in the browser's IndexedDB, not on disk. |
| `npm run typecheck` | TypeScript type-check (`tsc --noEmit`) |
| `npm test` / `npm run test:watch` | Unit tests once / in watch mode |
| `npm run build` | Type-check, build the renderer to `dist/` and the Electron main and preload scripts to `dist-electron/` |
| `npm run build:web` | Build only the renderer |
| `npm run build:electron` | Bundle only the Electron main and preload scripts |
| `npm start` | Run the last build in Electron (after `npm run build`) |
| `npm run dist` | Windows x64 installer + portable `.exe` in `release/` |
| `npm run dist:dir` | Unpacked app in `release/` without an installer, which is quicker for testing packaging |
| `npm run dist:all` | Every configured package for the current OS (`.dmg` on macOS, AppImage on Linux) |
| `npm run icons` | Regenerate the app icons in `build/` from the logo (needs Playwright, see below) |

Installers are built for the operating system you run the command on. Building the macOS
`.dmg` requires a Mac. The [release workflow](../.github/workflows/release.yml) builds all
three platforms on GitHub Actions when a `v*` tag is pushed.

---

## Running the tests

```bash
npm test            # unit tests (Vitest + jsdom)
npm run typecheck   # types
```

The browser and Electron smoke tests use [Playwright](https://playwright.dev), which is not
a project dependency. Install it without changing `package.json`:

```bash
npm install --no-save playwright
npx playwright install chromium
```

Then:

```bash
# Browser smoke test: start the web build in one terminal…
npm run dev:web
# …and run the script in another. Screenshots are written to $OUT.
OUT=./test-results node tests/e2e/smoke.mjs

# Electron smoke test against a production build (Linux CI needs xvfb-run)
npm run build:web && npm run build:electron
node tests/electron/smoke.mjs
```

The Electron smoke test uses a temporary `KINEMA_DATA_DIR`, so it never touches your real
projects. Create the `test-results` folder first if it doesn't exist.

---

## Troubleshooting

### `npm install` fails behind a corporate proxy

Point npm at your proxy, and at your company's root certificate if it inspects TLS:

```bash
npm config set proxy http://proxy.example.com:8080
npm config set https-proxy http://proxy.example.com:8080
npm config set cafile "C:\path\to\corporate-root-ca.pem"
```

The Electron download in the next section also honours the `HTTPS_PROXY` environment
variable.

### Electron binary download fails or times out

`npm install` downloads Electron from GitHub. If that is blocked or slow, use a mirror and
reinstall:

```powershell
# PowerShell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
```
```bash
# macOS / Linux
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
```

If a previous download was interrupted, delete the Electron cache and try again. It lives in
`%LOCALAPPDATA%\electron\Cache` on Windows, `~/Library/Caches/electron` on macOS and
`~/.cache/electron` on Linux. `npm run dist` downloads further packaging tools (NSIS and
others) the same way. Set `ELECTRON_BUILDER_BINARIES_MIRROR` if those downloads are blocked
too.

### `npm run dist` fails with "file is locked" or "EBUSY" in `release/`

Windows Defender or another antivirus is often still scanning the previous build, or an old
Kinema window is still running from `release\win-unpacked`.

1. Close every Kinema window, including any started from `release\`.
2. Delete the `release` folder and run `npm run dist` again.
3. If it keeps happening, add the project folder to your antivirus exclusions.

### Long-path errors on Windows

Errors like `ENAMETOOLONG` or `path too long` during `npm install` or `git clone` come from
Windows' 260-character path limit.

- Clone into a short folder such as `C:\dev\Kinema`.
- Enable long paths for Git: `git config --global core.longpaths true`
- Enable long paths in Windows (PowerShell as administrator, then restart):
  ```powershell
  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  ```

### `npm run dev` says port 5173 is in use

The dev server always uses port 5173. Close the other process using it, which is often a
second `npm run dev` or `npm run dev:web`, and try again.

### The app opens with a blank window

Press **F12** in a development build (`npm run dev`) to open DevTools and check the console.
For a packaged build, start it with the `KINEMA_DEVTOOLS=1` environment variable to enable
F12. Then [open an issue](https://github.com/Temp0o/Kinema/issues/new/choose) and include the
error.
