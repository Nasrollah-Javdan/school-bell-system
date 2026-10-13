# 🏗️ Build Instructions

This document describes how to build and release the School Bell System.

## 📋 Prerequisites

- **Node.js** (≥18.0.0)
- **npm** (≥9.0.0)
- **Git**
- **GitHub CLI** (optional, for manual releases)

## 🛠️ Development Setup

```bash
# Clone the repository
git clone https://github.com/AtizaD/school-bell-system.git
cd school-bell-system

# Install dependencies
npm install

# Run in development mode (Vite dev server + Electron with HMR)
npm run dev

# Bundle the renderer only
npm run build:renderer

# Test build (package without installer)
npm run pack
```

### How the two processes fit together

```
npm run dev
  ├── vite                 serves src/renderer on http://localhost:5173
  └── electron             waits for the port, then loads VITE_DEV_SERVER_URL
```

In production the renderer is bundled to `src/renderer/dist/` and served to
Electron through the custom `app://` scheme registered in `src/main/main.js`.
This is required because Chromium refuses to load ES modules over `file://`.

If you change `src/main/*.js`, no renderer rebuild is needed — only
`npm run build:renderer` rebuilds the frontend.

## 🚀 Building Installers

### **Local Build**
```bash
# Build for all platforms
npm run build

# Platform-specific builds
npm run build:win     # Windows .exe
npm run build:mac     # macOS .dmg  
npm run build:linux   # Linux .AppImage and .deb
```

Each `build:*` script runs `vite build` first, so the renderer is always fresh.

Build outputs go to the `dist/` directory.

### **Clean Build** (if issues)
```bash
npm run clean         # Remove node_modules and reinstall
npm run build         # Build again
```

## 🎯 Creating Releases

### **Automated Release (Recommended)**

Use the release helper script:

```bash
# Patch version (1.0.1 → 1.0.2)
npm run release:patch

# Minor version (1.0.1 → 1.1.0)  
npm run release:minor

# Major version (1.0.1 → 2.0.0)
npm run release:major
```

This script will:
1. ✅ Check git status
2. 📈 Bump version in package.json
3. 📝 Update README.md
4. 💾 Commit changes
5. 🏷️ Create git tag
6. 🚀 Push to GitHub
7. 🔧 Trigger GitHub Actions to build and release

### **Manual Release**

1. **Update version** in `package.json`
2. **Update version** in `README.md`
3. **Commit changes**:
   ```bash
   git add package.json README.md
   git commit -m "Version bump to v1.0.2"
   git tag -a v1.0.2 -m "Release v1.0.2"
   git push origin main
   git push origin v1.0.2
   ```
4. **GitHub Actions will automatically build and create the release**

## 🔄 GitHub Actions Workflows

### **Release Workflow** (`.github/workflows/build-release.yml`)
- **Trigger**: When a tag `v*` is pushed
- **Builds**: Windows, macOS, and Linux installers
- **Creates**: GitHub release with all installers
- **Enables**: Auto-updater functionality

### **Test Build Workflow** (`.github/workflows/test-build.yml`)
- **Trigger**: Push to main/develop or pull requests
- **Tests**: Build process on all platforms
- **Validates**: Code builds successfully

## 📦 Build Outputs

| Platform | File | Description |
|----------|------|-------------|
| Windows | `*.exe` | NSIS installer with auto-updater |
| macOS | `*.dmg` | DMG installer (Intel + Apple Silicon) |
| Linux | `*.AppImage` | Portable executable |
| Linux | `*.deb` | Debian/Ubuntu package |

## 🔧 Build Configuration

Build settings live in `package.json`:

- **`build.files`** - ships `src/main`, the bundled `src/renderer/dist` and
  the app icons. Renderer sources are deliberately excluded from the package.
- **`build.extraResources`** - audio files and the tray icon
- **Vite** (`vite.config.mjs`) - renderer root, output directory and dev port
- **App ID**: `com.atizad.school-bell-system`
- **Auto-updater**: GitHub releases integration
- **Code Signing**: Disabled for open source

## 🐛 Troubleshooting

### **Common Issues**

1. **"electron-builder not found"**
   ```bash
   npm install
   # or
   npx electron-builder --version
   ```

2. **"rimraf not found"**
   ```bash
   npm install --save-dev rimraf
   ```

3. **Blank window, console shows a CORS error**
   
   The renderer was loaded over `file://`. Make sure `src/main/main.js` is
   loading `app://bundle/index.html` rather than calling `loadFile()`, and that
   `npm run build:renderer` has been run.

4. **Blank window and `src/renderer/dist` is missing**
   ```bash
   npm run build:renderer
   ```

5. **Build fails with EBUSY error**
   ```bash
   # Kill electron processes
   taskkill /F /IM electron.exe  # Windows
   pkill electron               # macOS/Linux
   npm run clean
   ```

6. **Missing native dependencies**
   ```bash
   npm run postinstall
   ```

### **Platform-Specific Notes**

- **Windows**: Requires Windows 10/11, builds NSIS installer
- **macOS**: Requires macOS 10.13+, creates universal DMG (Intel + ARM)
- **Linux**: Creates AppImage (portable) and DEB package

## 🔄 Auto-Updater

The built apps include auto-updater functionality:
- **Checks**: GitHub releases every 4 hours
- **Downloads**: Updates in background
- **Installs**: On app restart
- **Preserves**: User data (schedules, audio files, settings)

## 📊 Release Checklist

- [ ] All features tested locally
- [ ] Version bumped in package.json and README.md
- [ ] Changelog/release notes prepared
- [ ] Git tag created and pushed
- [ ] GitHub Actions build successful
- [ ] Installers tested on target platforms
- [ ] Auto-updater functionality verified

---

*For questions about the build process, check the [GitHub Issues](https://github.com/AtizaD/school-bell-system/issues) or create a new issue.*