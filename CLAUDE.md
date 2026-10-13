# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
- `npm start` - Build the renderer with Vite, then start Electron in production mode
- `npm run dev` - Start Vite + Electron together with hot module replacement
- `npm run build:renderer` - Bundle the renderer only (Vite)
- `npm run build` - Bundle the renderer and produce installers via electron-builder
- `npm run build:win` - Build Windows installer (NSIS)
- `npm run build:mac` - Build macOS DMG
- `npm run build:linux` - Build Linux AppImage and DEB packages

### Development Utilities
- `npm run clean` - Clean node_modules and package-lock.json, then reinstall
- `npm run pack` - Bundle renderer and package without distribution (for testing)
- `npm run dist` - Alias for build command

### Testing Audio
- Use the "Audio Library" tab in the app to test individual audio files
- Use the scheduler's test event functionality to test complete audio sequences
- Audio files are stored in the `audio/` directory

## Build System

The renderer is bundled by **Vite**; the main process runs unbundled as CommonJS.

```
src/renderer/index.html   -> Vite entry
src/renderer/js/main.js   -> renderer bootstrap (imports + composition)
src/renderer/dist/        -> build output (generated, git-ignored)
```

### Why a custom protocol
Vite emits ES modules, and Chromium blocks ES modules loaded over `file://`
(opaque origin -> CORS failure). `src/main/main.js` therefore registers a
privileged `app://` scheme and serves `src/renderer/dist` from disk via
`protocol.handle`. Files are read with `fs` (asar-aware) so the same handler
works inside a packaged `app.asar`.

In development `VITE_DEV_SERVER_URL` is set and the window loads the Vite dev
server instead.

### CSS conventions
- All styling lives in `src/renderer/css/`. Never inject `<style>` from JS.
- Colours, spacing, radii, elevation and motion come from `tokens.css`.
- Never hard-code a hex value outside `tokens.css`.
- Light and dark themes are both token sets; theme is applied via
  `<html data-theme="light|dark">` and persisted as a setting.

## Application Architecture

### Main Process (src/main/)
The application follows Electron's main/renderer process architecture:

- **main.js** - Main application entry point and orchestrator
  - Manages application lifecycle, system tray, and auto-updater
  - Implements single-instance enforcement
  - Handles window management, `app://` protocol and IPC communication
  - Integrates all core modules (DataManager, AudioPlayer, Scheduler, AuthManager)

- **preload.js** - The only bridge exposed to the renderer (`window.electronAPI`)
  - Note: IPC subscriptions (`onAudioNotification`, `onScheduledAudio`,
    `onSessionExpired`) are wired up in `src/renderer/js/main.js`, not here.

- **scheduler.js** - Cron-based scheduling system using node-cron
  - Manages weekly bell schedules with precise timing
  - Handles event execution and audio sequence playback
  - Provides next events cache and statistics

- **audio-player.js** - Cross-platform audio playback system
  - Platform-specific audio players (Windows Media Player, macOS afplay, Linux paplay)
  - Handles audio sequences with repeat functionality
  - Volume control and audio validation

- **auth-manager.js** - Security and authentication system
  - AES-256-GCM encryption with machine binding
  - bcryptjs password hashing
  - Session management with auto-logout
  - Migration support for encryption format updates

- **data-manager.js** - Data persistence and management
  - JSON-based data storage with automatic backups
  - Manages schedules, audio files, templates, settings, and logs
  - Data validation and error recovery

### Renderer Process (src/renderer/)
The renderer is composed of ES modules assembled in `js/main.js`:

- **js/main.js** - Bootstrap. Creates the app shell, then mixes in the
  feature modules in a fixed order, then subscribes to IPC events.
- **js/app.js** - `SchoolBellApp` class: shell, navigation, dashboard,
  auth, modal and toast orchestration.
- **js/audio.js** - Audio library (mixed in via `extendAppWithAudioMethods`)
- **js/schedule.js** - Weekly schedule + event form (via `extendAppWithScheduleMethods`)
- **js/templates.js** - Template CRUD and preview (via `extendAppWithTemplateMethods`)
- **js/settings.js** - Settings form and data management (via `extendAppWithSettingsMethods`)
- **js/html5-audio.js** - `HTML5AudioPlayer`, the playback engine
- **js/toast.js** - Stacking, auto-dismissing toast notifications
- **js/theme.js** - Light/dark/system theme resolution and persistence
- **js/utils.js** - Shared helpers (formatting, validation, dates)

Feature modules export a single `extendAppWithXMethods(app)` function and
attach their methods to the app instance. They must **not** self-register via
`DOMContentLoaded`/`setTimeout` - composition happens in `main.js`.

### Key Features Implementation
- **Authentication**: Machine-bound encrypted storage with bcryptjs hashing
- **Scheduling**: node-cron with timezone support and event validation
- **Audio Management**: Cross-platform audio playback with sequence support
- **System Integration**: Auto-launch, system tray, and background operation
- **Auto-Updates**: GitHub releases integration with electron-updater
- **Data Management**: Export/import functionality with JSON storage
- **Theming**: Design-token driven light/dark/system themes

### Dependencies
- **Electron 37.1.0** - Desktop application framework
- **Vite 6** - Renderer bundler and dev server
- **node-cron** - Cron-based scheduling
- **bcryptjs** - Password hashing (production-safe alternative to bcrypt)
- **auto-launch** - System startup integration
- **electron-updater** - Auto-update functionality
- **node-machine-id** - Machine fingerprinting for security

### Development Notes
- Use `npm run dev` for fast iteration with HMR and dev tools
- Audio files are managed in the `audio/` directory with metadata in JSON storage
- Authentication data is encrypted and machine-bound for security
- The application runs in system tray and supports background operation
- All IPC communication is handled through the main process with proper validation
- Add new renderer features as a module with an `extendAppWithXMethods(app)`
  export, then register it in `js/main.js`

### Security Considerations
- Authentication data uses AES-256-GCM encryption
- Machine binding prevents auth data transfer between computers
- Session management with automatic timeout
- Content Security Policy implemented for renderer process
- No plaintext password storage
- Known gap: several render paths still use inline `onclick="app.…"` handlers,
  which is why `script-src` still needs `'unsafe-inline'`. Converting those to
  `addEventListener` + data attributes would allow tightening the CSP.