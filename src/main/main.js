const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, Notification, protocol } = require('electron');

// Optional auto-updater - gracefully handle if not available
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  console.log('Auto-updater loaded successfully');
} catch (error) {
  console.warn('Auto-updater not available:', error.message);
  autoUpdater = {
    checkForUpdatesAndNotify: () => Promise.resolve(),
    on: () => {},
    setFeedURL: () => {},
    checkForUpdates: () => Promise.resolve()
  };
}
const path = require('path');
const fsSync = require('fs');
const fs = require('fs').promises;
const DataManager = require('./data-manager');
const AudioPlayer = require('./audio-player');
const Scheduler = require('./scheduler');
const defaultSchedule = require('./default-schedule');

// Disable hardware acceleration for better compatibility
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--no-sandbox');

// Expose the version to the renderer via preload
process.env.APP_VERSION = app.getVersion();

// ---------------------------------------------------------------------------
// Lock the user-data folder.
//
// By default Electron derives %APPDATA%\<name> from the `name` field in
// package.json. If that field ever changed, every existing installation would
// silently "lose" its schedules, audio library and settings after an update.
// Pinning the folder name makes the data path stable across releases.
//
// NOTE: 'school-bell-system' is the folder existing installs already use, so
// this preserves current data rather than moving it.
// ---------------------------------------------------------------------------
app.setPath('userData', path.join(app.getPath('appData'), 'school-bell-system'));

/**
 * Turns an electron-updater error into something a teacher can act on.
 * The raw messages are English and often mention GitHub internals.
 */
function describeUpdaterError(err) {
  const code = err?.code || '';
  const message = String(err?.message || '');

  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message) || code === 'ENOTFOUND') {
    return 'اتصال به سرور به‌روزرسانی برقرار نشد. اتصال اینترنت را بررسی کنید.';
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET/i.test(message)) {
    return 'پاسخی از سرور به‌روزرسانی دریافت نشد. بعداً دوباره تلاش کنید.';
  }
  if (/No published versions|no published versions/i.test(message)) {
    return 'هنوز نسخه‌ای در مخزن منتشر نشده است. برای دریافت به‌روزرسانی باید یک Release منتشر شود.';
  }
  if (/ECONNREFUSED|403|404|401/i.test(message)) {
    return 'دسترسی به مخزن به‌روزرسانی ممکن نشد. اتصال شبکه را بررسی کنید.';
  }
  if (/checksum|Signature|signature/i.test(message)) {
    return 'اعتبارسنجی فایل به‌روزرسانی ناموفق بود.';
  }
  if (/ENOSPC|disk|space/i.test(message)) {
    return 'فضای کافی برای دانلود نسخه جدید وجود ندارد.';
  }
  return `به‌روزرسانی ناموفق بود: ${message}`;
}

// ---------------------------------------------------------------------------
// Renderer delivery scheme
//
// The renderer is bundled by Vite into ES modules. Chromium refuses to load
// ES modules over `file://` (opaque origin => CORS failure), so the production
// bundle is served through a privileged custom scheme instead of loadFile().
// ---------------------------------------------------------------------------
const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://bundle`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

// Must run before the `ready` event.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

/**
 * School Bell System - Production Main Process
 * 
 * Features:
 * - Single instance enforcement
 * - System tray with background operation
 * - Auto-startup with Windows
 * - Auto-updater with GitHub releases
 * - Secure authentication system
 * - Audio scheduling and playback
 * - Cross-platform compatibility
 */
class SchoolBellApp {
  constructor() {
    // Core window and tray
    this.mainWindow = null;
    this.tray = null;
    
    // Application modules
    this.dataManager = null;
    this.audioPlayer = null;
    this.scheduler = null;
    this.autoLauncher = null;
    
    // Application state
    this.isDevelopment = process.argv.includes('--dev');
    this.isInitialized = false;
    this.isQuitting = false;
    this.hasShownTrayNotification = false;
    
    // Auto-updater state
    this.updateCheckInterval = null;
    this.updateAvailable = false;
    this.updateInfo = null;
    this.updateDownloadedVersion = null;
    
    // Error handling
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🔔 Initializing School Bell System...');
      
      if (this.isInitialized) {
        console.log('Already initialized, skipping...');
        return;
      }

      // Enforce single instance
      if (!this.setupSingleInstance()) {
        return; // Another instance is running
      }

      // Initialize core modules
      await this.initializeModules();
      
      // Setup application
      this.setupApp();
      this.setupIPC();
      this.configureAutoUpdater();
      
      this.isInitialized = true;
      console.log('✅ School Bell System initialized successfully');
      
      // Start update checking after initialization
      this.scheduleUpdateCheck();
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.showFatalError('خطا در راه‌اندازی', error.message);
      app.quit();
    }
  }

  /**
   * Setup single instance lock
   */
  setupSingleInstance() {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      console.log('Another instance is already running. Exiting...');
      app.quit();
      return false;
    }

    // Handle second instance attempt
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      console.log('Second instance detected, showing main window');
      this.showMainWindow();
      
      // Show notification about already running
      this.showTrayNotification(
        'زنگ مدرسه', 
        'برنامه هم‌اکنون در سینی سیستم در حال اجراست'
      );
    });

    return true;
  }

  /**
   * Initialize application modules
   */
  async initializeModules() {
    console.log('Initializing application modules...');

    // Data Manager
    this.dataManager = new DataManager();
    const initResult = await this.dataManager.initialize();
    
    // Show migration notification if files were migrated
    if (initResult.migrationResult && initResult.migrationResult.migrated && initResult.migrationResult.fileCount > 0) {
      console.log(`🎵 Audio migration completed: ${initResult.migrationResult.fileCount} files moved to persistent storage`);
      
      // Show notification after tray is set up
      setTimeout(() => {
        this.showMigrationNotification(initResult.migrationResult.fileCount);
      }, 2000);
    }

    // Audio Player
    this.audioPlayer = new AudioPlayer(this.dataManager);
    await this.audioPlayer.init();

    // Scheduler
    this.scheduler = new Scheduler(this.dataManager, this.audioPlayer);
    await this.scheduler.init();

    console.log('✅ All modules initialized');
  }

  /**
   * Setup main application
   */
  setupApp() {
    app.whenReady().then(async () => {
      console.log('App ready, setting up UI...');

      // Serve the bundled renderer over the custom app:// scheme
      this.registerRendererProtocol();

      // Create system tray first (for background operation)
      this.createSystemTray();
      
      // Create main window
      this.createMainWindow();
      
      // Setup application menu
      this.createAppMenu();
      
      // Setup auto-launch
      await this.setupAutoLaunch();
      
      console.log('✅ UI setup complete');
    });

    // Handle window events
    app.on('window-all-closed', () => {
      // Don't quit - keep running in system tray
      console.log('All windows closed, continuing in background...');
    });

    app.on('activate', () => {
      // macOS: Re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    // Handle application quit
    app.on('before-quit', async (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.showQuitConfirmation();
        return;
      }
      
      console.log('Application quitting, cleaning up...');
      await this.cleanup();
    });

    app.on('will-quit', () => {
      console.log('Application will quit');
      this.cleanup();
    });
  }

  /**
   * Create system tray
   */
  createSystemTray() {
    try {
      // Prevent duplicate tray creation
      if (this.tray) {
        console.log('System tray already exists');
        return;
      }

      console.log('Creating system tray...');

      // Load tray icon
      const trayIcon = this.loadTrayIcon();
      this.tray = new Tray(trayIcon);
      
      // Configure tray
      this.tray.setToolTip('School Bell System - Click to open');
      this.updateTrayMenu();
      
      // Handle tray events
      this.tray.on('double-click', () => {
        this.toggleMainWindow();
      });

      this.tray.on('click', () => {
        if (process.platform === 'win32') {
          this.toggleMainWindow();
        }
      });
      
      console.log('✅ System tray created');
      
    } catch (error) {
      console.warn('⚠️ Failed to create system tray:', error.message);
      // App can still function without tray
    }
  }

  /**
   * Load tray icon
   */
  loadTrayIcon() {
    const trayIconPath = this.isDevelopment 
      ? path.join(__dirname, '../../build/tray-icon.png')
      : path.join(process.resourcesPath, 'tray-icon.png');
    
    try {
      const trayIcon = nativeImage.createFromPath(trayIconPath);
      if (!trayIcon.isEmpty()) {
        return trayIcon;
      }
    } catch (error) {
      console.warn('Custom tray icon not found, using fallback');
    }
    
    // Fallback: Create simple icon programmatically
    return this.createFallbackTrayIcon();
  }

  /**
   * Create fallback tray icon
   */
  createFallbackTrayIcon() {
    // Simple 16x16 PNG icon data (bell shape)
    const iconData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0xF3, 0xFF,
      0x61, 0x00, 0x00, 0x00, 0x4A, 0x49, 0x44, 0x41, 0x54, 0x38, 0x8D, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x03, 0x3A, 0x00, 0xE4, 0xFF, 0xFF, 0xFF, 0x87, 0x01, 0x08, 0x18, 0x19, 0x19, 0xF9, 0x87, 0x81,
      0x81, 0x81, 0x09, 0x03, 0x03, 0x03, 0x7F, 0x86, 0x86, 0x86, 0x06, 0x06, 0x06, 0x06, 0x86, 0x87,
      0x87, 0x87, 0x97, 0x91, 0x91, 0x91, 0x1F, 0x1C, 0x1C, 0x1C, 0xFC, 0x1D, 0x1D, 0x1D, 0x1D, 0x00,
      0x44, 0x32, 0x32, 0x32, 0x72, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60,
      0x82
    ]);
    
    return nativeImage.createFromBuffer(iconData);
  }

  /**
   * Update tray context menu
   */
  updateTrayMenu() {
    if (!this.tray) return;
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🔔 School Bell System',
        type: 'normal',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '📖 Show Window',
        click: () => this.showMainWindow()
      },
      {
        label: '🙈 Hide Window', 
        click: () => this.hideMainWindow(),
        enabled: this.mainWindow && this.mainWindow.isVisible()
      },
      { type: 'separator' },
      {
        label: '⏰ Next Events',
        submenu: this.createNextEventsSubmenu()
      },
      { type: 'separator' },
      {
        label: '🎵 Stop All Audio',
        click: async () => {
          try {
            await this.audioPlayer.stop();
            this.showTrayNotification('Audio Stopped', 'All audio playback stopped');
          } catch (error) {
            console.error('Failed to stop audio:', error);
          }
        }
      },
      {
        label: '🔄 Reload Schedules',
        click: async () => {
          try {
            await this.scheduler.reloadSchedules();
            this.showTrayNotification('Schedules Reloaded', 'All schedules have been reloaded');
          } catch (error) {
            console.error('Failed to reload schedules:', error);
          }
        }
      },
      { type: 'separator' },
      {
        label: '⚙️ Settings',
        submenu: [
          {
            label: 'اجرا با شروع ویندوز',
            type: 'checkbox',
            checked: this.getAutoLaunchStatus(),
            click: (menuItem) => this.toggleAutoLaunch(menuItem.checked)
          },
          {
            label: 'اجرا در پس‌زمینه',
            type: 'checkbox',
            checked: true,
            enabled: false
          }
        ]
      },
      { type: 'separator' },
      {
        label: '❌ Quit School Bell System',
        click: () => this.confirmQuit()
      }
    ]);
    
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Create next events submenu
   */
  createNextEventsSubmenu() {
    try {
      if (!this.scheduler) {
        return [{ label: 'زمان‌بند آماده نیست', enabled: false }];
      }
      
      const nextEvents = this.scheduler.getNextEvents(3);
      
      if (nextEvents.length === 0) {
        return [{ label: 'رویدادی در پیش نیست', enabled: false }];
      }
      
      return nextEvents.map(event => ({
        label: `${event.name} - ${event.time} (${this.formatTimeUntil(event.timeUntil)})`,
        enabled: false
      }));
      
    } catch (error) {
      return [{ label: 'خطا در بارگذاری رویدادها', enabled: false }];
    }
  }

  /**
   * Format time until next event
   */
  formatTimeUntil(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  /**
   * Show tray notifications
   */
  showTrayNotification(title, body) {
    try {
      if (process.platform === 'win32' && this.tray) {
        // Windows: Use tray balloon
        this.tray.displayBalloon({
          title: title,
          content: body
        });
      } else if (Notification.isSupported()) {
        // Other platforms: Use system notifications
        const notification = new Notification({
          title: title,
          body: body
        });
        notification.show();
      }
    } catch (error) {
      console.warn('Failed to show notification:', error.message);
    }
  }

  /**
   * Show migration notification to user
   */
  showMigrationNotification(fileCount) {
    try {
      const title = '🎵 Audio Files Migrated';
      const body = `${fileCount} audio files have been moved to persistent storage. They will now survive app updates!`;
      
      this.showTrayNotification(title, body);
      console.log(`Migration notification shown: ${fileCount} files migrated`);
      
    } catch (error) {
      console.warn('Failed to show migration notification:', error.message);
    }
  }

  /**
   * Window management
   */
  createMainWindow() {
    if (this.mainWindow) {
      this.showMainWindow();
      return;
    }

    console.log('Creating main window...');

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false
      },
      show: false,
      autoHideMenuBar: false
    });

    // Load application (Vite dev server in development, app:// bundle otherwise)
    const rendererUrl = this.getRendererUrl();
    console.log(`Loading renderer from ${rendererUrl}`);
    this.mainWindow.loadURL(rendererUrl);

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      
      // Set window title with version
      const currentVersion = app.getVersion();
      this.mainWindow.setTitle(`سامانه زنگ مدرسه - نسخه ${currentVersion}`);
      
      console.log('✅ Main window ready');
    });

    // Handle window close - minimize to tray instead of quitting
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideMainWindow();
        
        // Show tray notification on first minimize
        if (!this.hasShownTrayNotification) {
          this.showTrayNotification(
            'زنگ مدرسه', 
            'برنامه در سینی سیستم قرار گرفت. برای بازگرداندن، روی نماد آن دوبار کلیک کنید.'
          );
          this.hasShownTrayNotification = true;
        }
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * URL of the Vite dev server, when running `npm run dev`.
   * @returns {string|null}
   */
  getDevServerUrl() {
    const url = process.env.VITE_DEV_SERVER_URL;
    return url && /^https?:\/\//.test(url) ? url : null;
  }

  /**
   * Absolute path to the built renderer bundle.
   * Resolves identically when packaged, because the bundle is shipped inside
   * app.asar at the same relative location.
   * @returns {string}
   */
  getRendererDistPath() {
    return path.join(__dirname, '../renderer/dist');
  }

  /**
   * Register the privileged `app://` scheme handler used to serve the built
   * renderer. Files are read through fs (asar-aware) rather than net.fetch so
   * the handler also works when the bundle lives inside the app.asar archive.
   */
  registerRendererProtocol() {
    const distPath = this.getRendererDistPath();

    protocol.handle(APP_SCHEME, async (request) => {
      const { host, pathname } = new URL(request.url);

      if (host !== 'bundle') {
        return new Response('Not found', { status: 404 });
      }

      // Resolve inside dist and reject anything that escapes it.
      const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
      const targetPath = path.join(distPath, relativePath);
      const resolvedPath = path.resolve(targetPath);

      if (resolvedPath !== path.resolve(distPath) &&
          !resolvedPath.startsWith(path.resolve(distPath) + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      // Directory requests resolve to index.html
      const filePath = fsSync.existsSync(resolvedPath) && fsSync.statSync(resolvedPath).isDirectory()
        ? path.join(resolvedPath, 'index.html')
        : resolvedPath;

      if (!fsSync.existsSync(filePath)) {
        console.warn(`[protocol] 404 for ${request.url}`);
        return new Response('Not found', { status: 404 });
      }

      const body = await fsSync.promises.readFile(filePath);
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

      return new Response(body, {
        status: 200,
        headers: { 'content-type': contentType }
      });
    });

    console.log(`Renderer protocol registered from ${distPath}`);
  }

  /**
   * Resolve the URL the main window should load.
   * @returns {string}
   */
  getRendererUrl() {
    return this.getDevServerUrl() || `${APP_ORIGIN}/index.html`;
  }

  /**
   * Application icon for the window and taskbar.
   * Tries the packaged asset first; the build/ copy is only a dev fallback.
   */
  getAppIcon() {
    const candidates = [
      path.join(__dirname, '../renderer/assets/icons/icon.png'),
      path.join(__dirname, '../../build/icon.png'),
      path.join(__dirname, '../renderer/assets/icons/icon.ico')
    ];

    for (const iconPath of candidates) {
      try {
        const image = nativeImage.createFromPath(iconPath);
        if (!image.isEmpty()) return image;
      } catch (error) {
        // try the next candidate
      }
    }

    console.warn('App icon not found, using default');
    return undefined;
  }

  /**
   * Window visibility controls
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
      this.updateTrayMenu();
    } else {
      this.createMainWindow();
    }
  }

  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      this.updateTrayMenu();
    }
  }

  toggleMainWindow() {
    if (this.mainWindow && this.mainWindow.isVisible()) {
      this.hideMainWindow();
    } else {
      this.showMainWindow();
    }
  }

  /**
   * Auto-launch setup
   */
  async setupAutoLaunch() {
    try {
      const AutoLaunch = require('auto-launch');
      
      this.autoLauncher = new AutoLaunch({
        name: 'زنگ مدرسه',
        path: app.getPath('exe'),
        isHidden: false
      });
      
      // Enable auto-launch by default for school bell system
      const settings = this.dataManager?.getSettings();
      const isEnabled = await this.autoLauncher.isEnabled();
      
      if (settings?.autoStart !== false && !isEnabled) {
        await this.enableAutoLaunch();
      }
      
      console.log('✅ Auto-launch configured');
      
    } catch (error) {
      console.warn('⚠️ Auto-launch setup failed:', error.message);
    }
  }

  async enableAutoLaunch() {
    try {
      if (this.autoLauncher) {
        await this.autoLauncher.enable();
        console.log('Auto-launch enabled');
        this.showTrayNotification('Auto-Start Enabled', 'School Bell System will start with Windows');
      }
    } catch (error) {
      console.error('Failed to enable auto-launch:', error);
    }
  }

  async disableAutoLaunch() {
    try {
      if (this.autoLauncher) {
        await this.autoLauncher.disable();
        console.log('Auto-launch disabled');
        this.showTrayNotification('Auto-Start Disabled', 'School Bell System will not start with Windows');
      }
    } catch (error) {
      console.error('Failed to disable auto-launch:', error);
    }
  }

  getAutoLaunchStatus() {
    try {
      return this.autoLauncher ? this.autoLauncher.isEnabled() : false;
    } catch (error) {
      return false;
    }
  }

  async toggleAutoLaunch(enable) {
    if (enable) {
      await this.enableAutoLaunch();
    } else {
      await this.disableAutoLaunch();
    }
    
    // Update settings
    if (this.dataManager) {
      await this.dataManager.updateSettings({ autoStart: enable });
    }
    
    this.updateTrayMenu();
  }

  /**
   * Auto-updater configuration
   */
  configureAutoUpdater() {
    if (this.isDevelopment) {
      console.log('Auto-updater disabled in development mode');
      return;
    }

    console.log('Configuring auto-updater...');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    // Windows-only app: silent differential download works without a signature
    // because verifyUpdateCodeSignature is disabled in the build config.
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      this.sendUpdateStatus('checking', 'در حال بررسی نسخه جدید…');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      this.updateAvailable = true;
      this.updateInfo = info;
      this.sendUpdateStatus(
        'available',
        `نسخه ${info.version} آماده دانلود است.`,
        { version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes }
      );
      this.showUpdateAvailableDialog(info);
    });

    autoUpdater.on('update-not-available', () => {
      console.log('No updates available');
      this.updateAvailable = false;
      this.updateInfo = null;
      this.sendUpdateStatus('not-available', 'برنامه شما به‌روز است.');
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.updateAvailable = false;
      this.sendUpdateStatus('error', describeUpdaterError(err));
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const { percent, bytesPerSecond, transferred, total } = progressObj;
      const speed = bytesPerSecond > 1024 * 1024
        ? `${(bytesPerSecond / 1024 / 1024).toFixed(1)} مگابایت بر ثانیه`
        : `${Math.round(bytesPerSecond / 1024)} کیلوبایت بر ثانیه`;
      this.sendUpdateStatus('downloading', 'در حال دانلود نسخه جدید…', {
        percent: Math.round(percent),
        transferred,
        total,
        speed
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      this.updateDownloadedVersion = info.version;
      this.sendUpdateStatus('downloaded', `نسخه ${info.version} دانلود شد و آماده نصب است.`, {
        version: info.version
      });
      this.showUpdateReadyDialog(info);
    });
  }

  scheduleUpdateCheck() {
    if (this.isDevelopment) return;
    
    // Check on startup (after 10 seconds)
    setTimeout(() => this.checkForUpdates(false), 10000);
    
    // Check every 4 hours
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates(false);
    }, 4 * 60 * 60 * 1000);
  }

  async checkForUpdates(showDialog = false) {
    if (this.isDevelopment) {
      if (showDialog) {
        this.showUpdateDialog('Development Mode', 'Update checking is disabled in development mode.');
      }
      return;
    }

    try {
      console.log('Checking for updates...');
      this.sendUpdateStatus('checking', 'Checking for updates...');
      
      const result = await autoUpdater.checkForUpdates();
      
      if (showDialog && !this.updateAvailable) {
        setTimeout(() => {
          if (!this.updateAvailable) {
            this.showUpdateDialog('No Updates', 'You are using the latest version.');
          }
        }, 3000);
      }
      
      return result;
    } catch (error) {
      console.error('Update check failed:', error);
      this.sendUpdateStatus('error', `Update check failed: ${error.message}`);
      
      if (showDialog) {
        this.showUpdateDialog('Update Check Failed', `Failed to check for updates: ${error.message}`);
      }
    }
  }

  showUpdateAvailableDialog(info) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const options = {
      type: 'info',
      title: 'به‌روزرسانی موجود است',
      message: `نسخه ${info.version} از سامانه زنگ مدرسه موجود است`,
      detail: `نسخه فعلی: ${app.getVersion()}\nنسخه جدید: ${info.version}\n\nآیا این به‌روزرسانی را دانلود و نصب می‌کنید؟`,
      buttons: ['همین حالا دانلود کن', 'بعداً', 'یادداشت‌های انتشار'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 0:
          autoUpdater.downloadUpdate();
          break;
        case 2:
          shell.openExternal(`https://github.com/AtizaD/school-bell-system/releases/tag/v${info.version}`);
          break;
      }
    });
  }

  showUpdateReadyDialog(info) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const options = {
      type: 'info',
      title: 'به‌روزرسانی آماده نصب است',
      message: `نسخه ${info.version} آماده نصب است`,
      detail: 'به‌روزرسانی هنگام راه‌اندازی مجدد برنامه نصب می‌شود.',
      buttons: ['همین حالا راه‌اندازی مجدد', 'بعداً'],
      defaultId: 0
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }

  showUpdateDialog(title, message) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: title,
      message: message,
      buttons: ['تأیید']
    });
  }

  sendUpdateStatus(status, message, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, message, data });
    }
  }

  /**
   * Snapshot the user's data into %APPDATA%/School Bell System/backups/
   * before an update is installed.
   *
   * The NSIS installer never touches %APPDATA%, so this is a belt-and-braces
   * safety net: if an update ever goes wrong (or a schema change needs to be
   * rolled back) there is a dated copy to restore from.
   *
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  async createPreUpdateBackup() {
    try {
      const userData = app.getPath('userData');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = path.join(userData, 'backups', `pre-update-${stamp}`);

      await fs.mkdir(backupDir, { recursive: true });

      // Main data file + its rolling backup
      for (const name of ['school-bell-data.json', 'school-bell-backup.json']) {
        const from = path.join(userData, name);
        if (fsSync.existsSync(from)) {
          await fs.copyFile(from, path.join(backupDir, name));
        }
      }

      // Audio library
      const audioDir = path.join(userData, 'audio');
      if (fsSync.existsSync(audioDir)) {
        await fs.cp(audioDir, path.join(backupDir, 'audio'), { recursive: true });
      }

      // Keep only the five most recent snapshots
      const snapshots = (await fs.readdir(path.join(userData, 'backups')))
        .filter((n) => n.startsWith('pre-update-'))
        .sort()
        .reverse();
      for (const old of snapshots.slice(5)) {
        await fs.rm(path.join(userData, 'backups', old), { recursive: true, force: true });
      }

      console.log(`Pre-update backup created: ${backupDir}`);
      return { success: true, path: backupDir };
    } catch (error) {
      // Never block the update because a backup failed.
      console.error('Pre-update backup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * List the available pre-update snapshots, newest first.
   */
  async listPreUpdateBackups() {
    try {
      const dir = path.join(app.getPath('userData'), 'backups');
      if (!fsSync.existsSync(dir)) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && e.name.startsWith('pre-update-'))
        .map((e) => e.name)
        .sort()
        .reverse()
        .map((name) => {
          const full = path.join(dir, name);
          const stamp = name.replace('pre-update-', '');
          return { name, path: full, createdAt: stamp };
        });
    } catch (error) {
      console.error('Could not list backups:', error.message);
      return [];
    }
  }

  /**
   * Application menu
   */
  createAppMenu() {
    const template = [
      {
        label: 'فایل',
        submenu: [
          {
            label: 'رویداد جدید',
            accelerator: 'Ctrl+N',
            click: () => this.sendMenuAction('new-event')
          },
          { type: 'separator' },
          {
            label: 'بارگذاری صوت',
            accelerator: 'Ctrl+U',
            click: () => this.sendMenuAction('upload-audio')
          },
          { type: 'separator' },
          {
            label: 'خروجی داده‌ها',
            click: () => this.exportData()
          },
          {
            label: 'بازیابی داده‌ها',
            click: () => this.importData()
          },
          { type: 'separator' },
          {
            label: 'پنهان کردن در سینی سیستم',
            accelerator: 'Ctrl+H',
            click: () => this.hideMainWindow()
          },
          {
            label: 'خروج',
            accelerator: 'Ctrl+Q',
            click: () => this.showQuitConfirmation()
          }
        ]
      },
      {
        label: 'صدا',
        submenu: [
          {
            label: 'توقف همه صداها',
            accelerator: 'Ctrl+Shift+S',
            click: async () => {
              await this.audioPlayer.stop();
              this.showAudioNotification('All audio stopped');
            }
          },
          { type: 'separator' },
          {
            label: 'کتابخانه صوتی',
            accelerator: 'Ctrl+L',
            click: () => this.sendMenuAction('audio-library')
          }
        ]
      },
      {
        label: 'برنامه',
        submenu: [
          {
            label: 'Today\'s Schedule',
            accelerator: 'Ctrl+T',
            click: () => this.sendMenuAction('today-schedule')
          },
          {
            label: 'نمای هفتگی',
            accelerator: 'Ctrl+W',
            click: () => this.sendMenuAction('weekly-view')
          }
        ]
      },
      {
        label: 'سامانه',
        submenu: [
          {
            label: 'اجرا با شروع ویندوز',
            type: 'checkbox',
            checked: this.getAutoLaunchStatus(),
            click: (menuItem) => this.toggleAutoLaunch(menuItem.checked)
          },
          {
            label: 'اجرا در پس‌زمینه',
            type: 'checkbox',
            checked: true,
            enabled: false
          }
        ]
      },
      {
        label: 'راهنما',
        submenu: [
          {
            label: 'بررسی به‌روزرسانی',
            click: () => this.checkForUpdates(true)
          },
          { type: 'separator' },
          {
            label: 'راهنمای کاربر',
            click: () => shell.openExternal('https://github.com/AtizaD/school-bell-system#readme')
          },
          {
            label: 'گزارش مشکل',
            click: () => shell.openExternal('https://github.com/AtizaD/school-bell-system/issues')
          },
          { type: 'separator' },
          {
            label: 'درباره',
            click: () => this.showAboutDialog()
          }
        ]
      }
    ];

    // Development menu
    if (this.isDevelopment) {
      template.push({
        label: 'توسعه',
        submenu: [
          {
            label: 'ابزار توسعه',
            accelerator: 'F12',
            click: () => this.mainWindow?.webContents.toggleDevTools()
          },
          {
            label: 'بارگذاری مجدد',
            accelerator: 'Ctrl+R',
            click: () => this.mainWindow?.webContents.reload()
          },
          { type: 'separator' },
          {
            label: 'راه‌اندازی مجدد برنامه',
            accelerator: 'Ctrl+Alt+R',
            click: () => {
              app.relaunch();
              app.quit();
            }
          }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  showAboutDialog() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const appVersion = app.getVersion();
    const electronVersion = process.versions.electron;
    const nodeVersion = process.versions.node;
    const platform = process.platform;
    const arch = process.arch;

    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'درباره سامانه زنگ مدرسه',
      message: 'School Bell Management System',
      detail: `Version: ${appVersion}\n` +
             `Platform: ${platform} (${arch})\n` +
             `Electron: ${electronVersion}\n` +
             `Node.js: ${nodeVersion}\n\n` +
             `Automated school bell scheduling with audio playback.\n\n` +
             `© 2025 AtizaD\n` +
             `Licensed under MIT License`,
      buttons: ['تأیید', 'GitHub'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 1) {
        shell.openExternal('https://github.com/AtizaD/school-bell-system');
      }
    });
  }

  /**
   * Quit confirmation and cleanup
   */
  showQuitConfirmation() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.confirmQuit();
      return;
    }

    const options = {
      type: 'question',
      title: 'خروج از سامانه زنگ مدرسه',
      message: 'آیا از خروج مطمئن هستید؟',
      detail: 'This will stop all scheduled bell events until you restart the application.',
      buttons: ['انصراف', 'Minimize to Tray', 'خروج'],
      defaultId: 1,
      cancelId: 0
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 1: // Minimize to Tray
          this.hideMainWindow();
          this.showTrayNotification('Running in Background', 'School Bell System continues in the system tray');
          break;
        case 2: // Quit
          this.confirmQuit();
          break;
      }
    });
  }

  confirmQuit() {
    console.log('Confirming quit...');
    this.isQuitting = true;
    app.quit();
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up application resources...');

    try {
      // Clear intervals
      if (this.updateCheckInterval) {
        clearInterval(this.updateCheckInterval);
        this.updateCheckInterval = null;
      }

      // Cleanup modules
      if (this.audioPlayer) {
        await this.audioPlayer.cleanup();
      }

      if (this.scheduler) {
        this.scheduler.stop();
      }

      // Log shutdown
      if (this.dataManager) {
        this.dataManager.logActivitySafe('app_shutdown', 'Application shutdown');
      }

      // Destroy tray
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }

      console.log('✅ Cleanup complete');

    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }

  /**
   * Error handlers
   */
  handleUncaughtException(error) {
    console.error('💥 Uncaught Exception:', error);
    
    if (this.dataManager) {
      this.dataManager.logActivitySafe('uncaught_exception', error.message, error.stack);
    }
    
    // Don't quit in production - try to recover
    if (!this.isDevelopment) {
      this.showTrayNotification('Error Detected', 'An error occurred but the app continues running');
    }
  }

  handleUnhandledRejection(reason, promise) {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    
    if (this.dataManager) {
      this.dataManager.logActivitySafe('unhandled_rejection', String(reason));
    }
  }

  showFatalError(title, message) {
    console.error(`💀 Fatal Error - ${title}: ${message}`);
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      dialog.showErrorBox(title, `${message}\n\nThe application will now close.`);
    }
  }

  /**
   * IPC Communication
   */
  sendMenuAction(action) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('menu-action', action);
    }
  }

  showAudioNotification(message, isError = false) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-notification', {
        message,
        type: isError ? 'error' : 'info'
      });
    }
  }

  /**
   * Data management
   */
  async exportData() {
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

      const result = await dialog.showSaveDialog(this.mainWindow, {
        title: 'Export School Bell Data',
        defaultPath: `school-bell-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        const data = await this.dataManager.exportData();
        await fs.writeFile(result.filePath, data);
        
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'Export Successful',
          message: 'Data exported successfully!',
          detail: `Data saved to: ${result.filePath}`
        });

        this.dataManager.logActivitySafe('data_exported', `Data exported to ${result.filePath}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      if (!this.mainWindow?.isDestroyed()) {
        dialog.showErrorBox('Export Failed', `Failed to export data: ${error.message}`);
      }
    }
  }

  async importData() {
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Import School Bell Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const confirmResult = await dialog.showMessageBox(this.mainWindow, {
          type: 'warning',
          title: 'Confirm Import',
          message: 'This will replace all current data!',
          detail: 'Are you sure? This action cannot be undone.',
          buttons: ['انصراف', 'Import'],
          defaultId: 0
        });

        if (confirmResult.response === 1) {
          const data = await fs.readFile(result.filePaths[0], 'utf8');
          await this.dataManager.importData(data);
          
          dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Import Successful',
            message: 'Data imported successfully!',
            detail: 'The application will reload.'
          });

          await this.scheduler.reloadSchedules();
          this.mainWindow.reload();
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      if (!this.mainWindow?.isDestroyed()) {
        dialog.showErrorBox('Import Failed', `Failed to import data: ${error.message}`);
      }
    }
  }

  /**
   * Setup IPC handlers
   */
  setupIPC() {
    console.log('Setting up IPC handlers...');

    // Data operations
    ipcMain.handle('data-get', async (event, section) => {
      return this.dataManager.getData(section);
    });

    // Wipe everything and restore the factory defaults
    ipcMain.handle('data-reset-all', async () => {
      const result = await this.dataManager.resetAllData();
      await this.scheduler.reloadSchedules();
      this.showAudioNotification('همه داده‌ها بازنشانی شد');
      return result;
    });

    ipcMain.handle('is-development-mode', () => {
      return this.isDevelopment;
    });

    // Schedule operations
    ipcMain.handle('schedule-get', async (event, day) => {
      return this.dataManager.getSchedule(day);
    });

    // Apply the built-in Iranian elementary timetable
    ipcMain.handle('schedule-apply-default', async (event, days) => {
      const result = await this.dataManager.applyDefaultSchedule(days);
      await this.scheduler.reloadSchedules();
      this.showAudioNotification('برنامه پیش‌فرض مدرسه اعمال شد');
      return result;
    });

    ipcMain.handle('schedule-get-default', async () => {
      return {
        periods: defaultSchedule.DEFAULT_PERIODS,
        days: defaultSchedule.ALL_SELECTABLE_DAYS,
        seedDays: defaultSchedule.SCHOOL_DAYS
      };
    });

    ipcMain.handle('schedule-add-event', async (event, day, eventData) => {
      const result = await this.dataManager.addScheduleEvent(day, eventData);
      await this.scheduler.addEvent(day, result);
      return result;
    });

    ipcMain.handle('schedule-update-event', async (event, day, eventId, updates) => {
      const result = await this.dataManager.updateScheduleEvent(day, eventId, updates);
      await this.scheduler.updateEvent(day, eventId, result);
      return result;
    });

    ipcMain.handle('schedule-delete-event', async (event, day, eventId) => {
      const result = await this.dataManager.deleteScheduleEvent(day, eventId);
      this.scheduler.removeEvent(day, eventId);
      return result;
    });

    // Audio operations
    ipcMain.handle('audio-get-files', async () => {
      return this.dataManager.getAudioFiles();
    });

    ipcMain.handle('audio-add-file', async (event, audioData) => {
      return await this.dataManager.addAudioFile(audioData);
    });

    ipcMain.handle('audio-delete-file', async (event, audioId) => {
      const audioFile = this.dataManager.getAudioFiles().find(a => a.id === audioId);
      if (audioFile) {
        try {
          const settings = this.dataManager.getSettings();
          const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
          const filePath = path.join(audioPath, audioFile.filename);
          await fs.unlink(filePath);
        } catch (fileError) {
          console.warn('Failed to delete audio file:', fileError.message);
        }
      }
      return await this.dataManager.deleteAudioFile(audioId);
    });

    ipcMain.handle('audio-bulk-delete', async (event, audioIds) => {
      const audioFiles = this.dataManager.getAudioFiles();
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      
      let deletedCount = 0;
      let errors = [];

      for (const audioId of audioIds) {
        try {
          const audioFile = audioFiles.find(a => a.id === audioId);
          
          if (audioFile) {
            // Try to delete the physical file
            try {
              const filePath = path.join(audioPath, audioFile.filename);
              await fs.unlink(filePath);
            } catch (fileError) {
              console.warn(`Failed to delete audio file ${audioFile.filename}:`, fileError.message);
              errors.push({
                id: audioId,
                filename: audioFile.filename,
                error: fileError.message
              });
            }

            // Remove from database
            await this.dataManager.deleteAudioFile(audioId);
            deletedCount++;
            
            this.dataManager.logActivitySafe('audio_file_deleted', `Bulk deleted: ${audioFile.name}`);
          } else {
            errors.push({
              id: audioId,
              error: 'Audio file not found in database'
            });
          }
        } catch (error) {
          console.error(`Failed to delete audio file ${audioId}:`, error);
          errors.push({
            id: audioId,
            error: error.message
          });
        }
      }

      const result = {
        success: true,
        deletedCount,
        totalRequested: audioIds.length,
        errors: errors.length > 0 ? errors : null
      };

      this.dataManager.logActivitySafe('audio_bulk_delete', 
        `Bulk delete completed: ${deletedCount}/${audioIds.length} files deleted`
      );

      return result;
    });

    ipcMain.handle('upload-audio-file', async (event, fileData) => {
      const { filename, buffer, displayName } = fileData;
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      
      await fs.mkdir(audioPath, { recursive: true });
      
      const filePath = path.join(audioPath, filename);
      
      // Check if file exists and handle overwrite
      let fileExists = false;
      try {
        await fs.access(filePath);
        fileExists = true;
        const overwrite = await this.confirmOverwrite(filename);
        
        if (!overwrite) {
          throw new Error('Upload cancelled - file already exists');
        }
      } catch (accessError) {
        // File doesn't exist, continue
        if (accessError.code !== 'ENOENT') {
          throw new Error(`Cannot access file location: ${accessError.message}`);
        }
      }
      
      // If file exists and we're overwriting, stop any audio that might be using it
      if (fileExists) {
        try {
          await this.audioPlayer.stop();
        } catch (stopError) {
          console.warn('Failed to stop audio player before overwrite:', stopError.message);
        }
      }
      
      // Try to write the file with better error handling
      try {
        await fs.writeFile(filePath, buffer);
      } catch (writeError) {
        if (writeError.code === 'EPERM') {
          throw new Error(`Permission denied. The file "${filename}" may be in use by another application or you don't have write permissions to this location.`);
        } else if (writeError.code === 'EACCES') {
          throw new Error(`Access denied. Check file permissions for "${filename}".`);
        } else if (writeError.code === 'EBUSY') {
          throw new Error(`File "${filename}" is currently in use. Please close any applications using this file and try again.`);
        } else {
          throw new Error(`Failed to write file "${filename}": ${writeError.message}`);
        }
      }
      const stats = await fs.stat(filePath);
      
      const audioData = {
        name: displayName,
        filename: filename,
        size: stats.size,
        type: this.getFileType(filename),
        duration: 0,
        uploadedAt: new Date().toISOString()
      };
      
      // Check if we're replacing an existing file
      let result;
      if (fileExists) {
        // Find existing audio file record and update it
        const existingAudio = this.dataManager.getAudioFiles().find(af => af.filename === filename);
        if (existingAudio) {
          // Update existing record
          result = await this.dataManager.updateAudioFile(existingAudio.id, audioData);
          this.dataManager.logActivitySafe('audio_file_replaced', `Replaced audio file "${displayName}"`);
        } else {
          // File exists on disk but not in database, add new record
          result = await this.dataManager.addAudioFile(audioData);
        }
      } else {
        // New file, add to database
        result = await this.dataManager.addAudioFile(audioData);
      }
      this.dataManager.logActivitySafe('audio_file_uploaded', `Uploaded: ${displayName}`);
      
      return result;
    });

    // Template operations
    ipcMain.handle('template-get-all', async () => {
      return this.dataManager.getTemplates();
    });

    ipcMain.handle('template-add', async (event, templateData) => {
      return await this.dataManager.addTemplate(templateData);
    });

    ipcMain.handle('template-delete', async (event, templateId) => {
      return await this.dataManager.deleteTemplate(templateId);
    });

    // Settings operations
    ipcMain.handle('settings-get', async () => {
      return this.dataManager.getSettings();
    });

    ipcMain.handle('settings-update', async (event, updates) => {
      const result = await this.dataManager.updateSettings(updates);
      this.audioPlayer.updateSettings(updates);
      return result;
    });

    // Log operations
    ipcMain.handle('logs-get', async (event, limit) => {
      return this.dataManager.getLogs(limit);
    });

    ipcMain.handle('logs-clear', async () => {
      return await this.dataManager.clearLogs();
    });

    // Dialog operations
    ipcMain.handle('show-save-dialog', async (event, options) => {
      return await dialog.showSaveDialog(this.mainWindow, options);
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      return await dialog.showOpenDialog(this.mainWindow, options);
    });

    // Audio player operations
    ipcMain.handle('audio-test', async (event, filename) => {
      return await this.audioPlayer.testAudio(filename);
    });

    ipcMain.handle('audio-stop-test', async () => {
      return await this.audioPlayer.stopTestAudio();
    });

    ipcMain.handle('audio-stop-all', async () => {
      return await this.audioPlayer.stop();
    });

    ipcMain.handle('audio-set-volume', async (event, volume) => {
      await this.audioPlayer.setVolume(volume);
      await this.dataManager.updateSettings({ volume: volume });
      return this.audioPlayer.getVolume();
    });

    ipcMain.handle('audio-get-available-files', async () => {
      return await this.audioPlayer.getAvailableAudioFiles();
    });

    ipcMain.handle('audio-get-status', async () => {
      return this.audioPlayer.getPlayingStatus();
    });

    ipcMain.handle('audio-test-system', async () => {
      return await this.audioPlayer.testSystemAudio();
    });

    ipcMain.handle('audio-get-file-url', async (event, filename) => {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      try {
        await fs.access(filePath);
        
        // Read the file as base64 and create a data URL
        const fileBuffer = await fs.readFile(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        // Map file extensions to MIME types
        const mimeTypes = {
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
          '.ogg': 'audio/ogg',
          '.aac': 'audio/aac'
        };
        
        const mimeType = mimeTypes[fileExtension] || 'audio/mpeg';
        const base64Data = fileBuffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        
        return { url: dataUrl };
      } catch (error) {
        throw new Error(`Audio file not found: ${filename}`);
      }
    });

    ipcMain.handle('audio-get-file-path', async (event, filename) => {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      try {
        await fs.access(filePath);
        return filePath;
      } catch (error) {
        throw new Error(`Audio file not found: ${filename}`);
      }
    });

    ipcMain.handle('audio-play-scheduled', async (event, eventData) => {
      // This handler triggers HTML5 audio playback in the renderer process
      // Send event to renderer to play the scheduled audio using HTML5
      this.mainWindow.webContents.send('scheduled-audio', eventData);
      return { success: true };
    });

    // Scheduler operations
    ipcMain.handle('scheduler-get-status', async () => {
      return this.scheduler.getStatus();
    });

    ipcMain.handle('scheduler-test-event', async (event, day, eventData) => {
      return await this.scheduler.testEvent(day, eventData);
    });

    ipcMain.handle('scheduler-reload', async () => {
      await this.scheduler.reloadSchedules();
      return true;
    });

    ipcMain.handle('scheduler-start', async () => {
      this.scheduler.start();
      return true;
    });

    ipcMain.handle('scheduler-stop', async () => {
      this.scheduler.stop();
      return true;
    });

    ipcMain.handle('scheduler-get-next-events', async (event, limit) => {
      return this.scheduler.getNextEvents(limit || 5);
    });

    ipcMain.handle('scheduler-get-today-events', async () => {
      return this.scheduler.getTodayEvents();
    });

    // System operations
    ipcMain.handle('system-get-auto-launch-status', async () => {
      return this.getAutoLaunchStatus();
    });

    ipcMain.handle('system-toggle-auto-launch', async (event, enable) => {
      await this.toggleAutoLaunch(enable);
      return { success: true, enabled: enable };
    });

    ipcMain.handle('system-show-main-window', async () => {
      this.showMainWindow();
      return { success: true };
    });

    ipcMain.handle('system-hide-main-window', async () => {
      this.hideMainWindow();
      return { success: true };
    });

    ipcMain.handle('system-quit-app', async () => {
      this.confirmQuit();
      return { success: true };
    });

    // Updater operations
    ipcMain.handle('updater-get-version', async () => {
      return {
        current: app.getVersion(),
        isDevelopment: this.isDevelopment,
        updateAvailable: this.updateAvailable,
        downloadedVersion: this.updateDownloadedVersion,
        lastBackup: await this.listPreUpdateBackups().then((b) => b[0] || null)
      };
    });

    ipcMain.handle('updater-check-for-updates', async () => {
      return await this.checkForUpdates(true);
    });

    ipcMain.handle('updater-download-update', async () => {
      if (!autoUpdater || this.isDevelopment) {
        return { success: false, error: 'به‌روزرسانی در این حالت فعال نیست.' };
      }
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        return { success: false, error: describeUpdaterError(error) };
      }
    });

    ipcMain.handle('updater-install-update', async () => {
      // Snapshot the user's data first - cheap insurance before any upgrade
      const backup = await this.createPreUpdateBackup();
      console.log('Pre-update backup result:', backup.success ? backup.path : backup.error);
      autoUpdater.quitAndInstall(false, true);
      return { success: true, backup };
    });

    ipcMain.handle('updater-create-backup', async () => {
      return await this.createPreUpdateBackup();
    });

    ipcMain.handle('updater-list-backups', async () => {
      return await this.listPreUpdateBackups();
    });

    ipcMain.handle('updater-open-data-folder', async () => {
      await shell.openPath(app.getPath('userData'));
      return { success: true, path: app.getPath('userData') };
    });

    ipcMain.handle('updater-restart-app', async () => {
      app.relaunch();
      app.quit();
      return { success: true };
    });

    console.log('✅ IPC handlers configured');
  }

  /**
   * Utility methods
   */
  getFileType(filename) {
    const extension = path.extname(filename).toLowerCase();
    const typeMap = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/m4a',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac'
    };
    return typeMap[extension] || 'audio/mpeg';
  }

  async confirmOverwrite(filename) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        // Bring main window to front first
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
        
        const result = await dialog.showMessageBox(this.mainWindow, {
          type: 'warning',
          title: 'Replace Existing File?',
          message: `The file "${filename}" already exists.`,
          detail: 'Do you want to replace the existing file with the new one? This action cannot be undone.',
          buttons: ['انصراف', 'Replace File'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        
        return result.response === 1;
      }
      return false;
    } catch (error) {
      console.error('Error showing overwrite confirmation:', error);
      return false;
    }
  }
}

// Initialize application
const schoolBellApp = new SchoolBellApp();

// Start the application
schoolBellApp.initialize();

// Handle macOS activation
app.on('activate', () => {
  if (schoolBellApp.mainWindow === null) {
    schoolBellApp.createMainWindow();
  }
});

// Graceful shutdown
process.on('exit', () => {
  console.log('🔔 School Bell System shutting down...');
  schoolBellApp.cleanup();
});

console.log('🔔 School Bell System - Production Main Process Started');