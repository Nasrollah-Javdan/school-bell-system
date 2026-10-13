/**
 * School Bell System - Settings Management
 * Handles settings view, form management, and all settings-related functionality
 * Extracted from app.js to reduce complexity and improve maintainability
 */

import { theme } from './theme.js';
import { toPersianDigits } from './fa.js';

// Extend the main app with settings-specific methods
export function extendAppWithSettingsMethods(app) {

  /* ==========================================================================
     Auto-update card
     ========================================================================== */

  /** UI state for the update card. */
  app.updateState = {
    checking: false,
    available: false,
    downloaded: false,
    busy: false
  };

  /**
   * Paint the update card from a main-process status payload.
   * @param {{status: string, message: string, data?: object}} payload
   */
  app.applyUpdateStatus = function(payload) {
    const box = document.getElementById('updateStatus');
    const icon = document.getElementById('updateStatusIcon');
    const text = document.getElementById('updateStatusText');
    const progress = document.getElementById('updateProgress');
    const bar = document.getElementById('updateProgressBar');
    const progressLabel = document.getElementById('updateProgressLabel');
    const installBtn = document.getElementById('installUpdateBtn');
    const checkBtn = document.getElementById('checkUpdateBtn');
    if (!box || !icon || !text) return;

    const set = (state, iconChar, message) => {
      box.dataset.state = state;
      icon.textContent = iconChar;
      text.textContent = message;
    };

    switch (payload.status) {
      case 'checking':
        this.updateState.checking = true;
        set('checking', '🔄', payload.message);
        if (checkBtn) checkBtn.disabled = true;
        break;

      case 'available':
        this.updateState.checking = false;
        this.updateState.available = true;
        set('available', '⬆️', payload.message);
        if (checkBtn) {
          checkBtn.disabled = true;
          checkBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">⬇️</span> دانلود نسخه جدید';
        }
        break;

      case 'downloading': {
        const percent = payload.data?.percent ?? 0;
        this.updateState.busy = true;
        set('checking', '⬇️', payload.message);
        if (progress) progress.hidden = false;
        if (bar) bar.style.width = `${percent}%`;
        if (progressLabel) progressLabel.textContent = toPersianDigits(percent) + '٪';
        break;
      }

      case 'downloaded':
        this.updateState.busy = false;
        this.updateState.downloaded = true;
        set('downloaded', '✅', payload.message);
        if (progress) progress.hidden = true;
        if (installBtn) installBtn.hidden = false;
        if (checkBtn) {
          checkBtn.disabled = true;
          checkBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">✔️</span> به‌روزرسانی آماده است';
        }
        break;

      case 'not-available':
        this.updateState.checking = false;
        this.updateState.available = false;
        set('ok', '✔️', payload.message);
        if (checkBtn) {
          checkBtn.disabled = false;
          checkBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">🔄</span> بررسی نسخه جدید';
        }
        break;

      case 'error':
        this.updateState.checking = false;
        this.updateState.busy = false;
        set('error', '⚠️', payload.message);
        if (checkBtn) {
          checkBtn.disabled = false;
          checkBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">🔄</span> تلاش دوباره';
        }
        break;
    }
  };

  /** Load the installed version into the card. */
  app.refreshUpdateInfo = async function() {
    const el = document.getElementById('currentVersion');
    if (!window.electronAPI?.updater) return;

    try {
      const info = await window.electronAPI.updater.getVersion();
      if (el) el.textContent = info.current || '—';
      if (info.isDevelopment) {
        this.showNotification('به‌روزرسانی خودکار در حالت توسعه غیرفعال است.', 'info');
      }
    } catch (error) {
      console.error('Could not read version info:', error);
    }
  };

  /** Manual "check for updates". */
  app.handleCheckUpdate = async function() {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.checkForUpdates();
    } catch (error) {
      console.error('Update check failed:', error);
      this.applyUpdateStatus({ status: 'error', message: 'بررسی نسخه جدید ناموفق بود.' });
    }
  };

  /** Download the available update. */
  app.handleDownloadUpdate = async function() {
    if (!window.electronAPI?.updater) return;
    const result = await window.electronAPI.updater.downloadUpdate();
    if (result && !result.success) {
      this.applyUpdateStatus({ status: 'error', message: result.error });
    }
  };

  /** Install the downloaded update and restart. Backs up data first. */
  app.handleInstallUpdate = async function() {
    if (!window.electronAPI?.updater) return;

    const confirmed = await this.confirmAction({
      title: 'نصب نسخه جدید',
      message: 'نسخه جدید اکنون نصب می‌شود و برنامه دوباره اجرا می‌گردد.<br><br>' +
               'پیش از نصب، یک نسخه پشتیبان از برنامه‌ها و فایل‌های صوتی شما گرفته می‌شود.',
      confirmText: 'نصب و راه‌اندازی مجدد',
      danger: false
    });
    if (!confirmed) return;

    const btn = document.getElementById('installUpdateBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'در حال آماده‌سازی…';
    }

    try {
      const result = await window.electronAPI.updater.installUpdate();
      if (result?.backup?.success) {
        this.showNotification('نسخه پشتیبان از داده‌های شما گرفته شد.', 'success');
      }
    } catch (error) {
      console.error('Update install failed:', error);
      this.applyUpdateStatus({ status: 'error', message: 'نصب نسخه جدید ناموفق بود.' });
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'نصب و راه‌اندازی مجدد';
      }
    }
  };

  /** Reveal %APPDATA%\School Bell System in Explorer. */
  app.handleOpenDataFolder = async function() {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.openDataFolder();
    } catch (error) {
      console.error('Could not open data folder:', error);
    }
  };

  /* ==========================================================================
     Settings view
     ========================================================================== */

  /**
   * Update settings view and populate current values
   */
  app.updateSettings = async function() {
    try {
      await this.loadData();
      this.populateSettingsForm();
      this.setupSettingsEventListeners();
      await this.refreshUpdateInfo();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  /**
   * Populate settings form with current values
   */
  app.populateSettingsForm = function() {
    const settings = this.data?.settings || {};

    // Theme
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      // The theme manager owns the live preference; reflect it here
      themeSelect.value = settings.theme || theme.preference || 'system';
      theme.syncControls();
    }
    
    // Volume settings
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
      volumeSlider.value = settings.volume || 80;
      volumeValue.textContent = `${settings.volume || 80}%`;
    }
    
    // Audio path
    const audioPath = document.getElementById('audioPath');
    if (audioPath) {
      audioPath.value = settings.audioPath || '';
    }

    // Audio repeat interval
    const audioRepeatInterval = document.getElementById('audioRepeatInterval');
    if (audioRepeatInterval) {
      audioRepeatInterval.value = settings.audioRepeatInterval || 3;
    }
    
    // Auto start
    const autoStart = document.getElementById('autoStartCheckbox');
    if (autoStart) {
      autoStart.checked = settings.autoStart || false;
    }
    
    // Log level
    const logLevel = document.getElementById('logLevel');
    if (logLevel) {
      logLevel.value = settings.logLevel || 'info';
    }
    
    // Max log entries
    const maxLogEntries = document.getElementById('maxLogEntries');
    if (maxLogEntries) {
      maxLogEntries.value = settings.maxLogEntries || 1000;
    }
  };

  /**
   * Bind settings controls.
   *
   * Runs on every visit to the Settings tab, so binding is guarded by a flag
   * on each control. (The previous `removeEventListener` calls could never
   * match, because the handlers were freshly created arrow functions - which
   * meant every visit stacked another copy of each listener.)
   */
  app.setupSettingsEventListeners = async function() {
    const bind = (element, event, handler) => {
      if (!element) return;
      const key = `bound_${event}`;
      if (element.dataset[key] === 'true') return;
      element.dataset[key] = 'true';
      element.addEventListener(event, handler);
    };

    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    bind(volumeSlider, 'input', (e) => this.handleVolumeChange(e));
    bind(volumeSlider, 'change', (e) => this.handleVolumeChange(e));

    // Appearance
    bind(document.getElementById('themeSelect'), 'change', (e) => {
      theme.set(e.target.value);
    });

    // Auto start checkbox
    bind(document.getElementById('autoStartCheckbox'), 'change', (e) => this.handleAutoStartChange(e));

    // Log level dropdown
    bind(document.getElementById('logLevel'), 'change', (e) => this.handleLogLevelChange(e));

    // Max log entries
    bind(document.getElementById('maxLogEntries'), 'change', (e) => this.handleMaxLogEntriesChange(e));

    // Audio repeat interval
    bind(document.getElementById('audioRepeatInterval'), 'change', (e) => this.handleAudioRepeatIntervalChange(e));

    // Buttons
    bind(document.getElementById('changePathBtn'), 'click', () => this.handleChangeAudioPath());
    bind(document.getElementById('restartAppBtn'), 'click', () => this.handleRestartApp());
    bind(document.getElementById('exportDataBtn'), 'click', () => this.handleExportData());
    bind(document.getElementById('importDataBtn'), 'click', () => this.handleImportData());
    bind(document.getElementById('resetDataBtn'), 'click', () => this.handleResetData());

    // Auto-update card
    bind(document.getElementById('checkUpdateBtn'), 'click', (e) => {
      const label = e.currentTarget.textContent.includes('دانلود');
      if (label) this.handleDownloadUpdate();
      else this.handleCheckUpdate();
    });
    bind(document.getElementById('installUpdateBtn'), 'click', () => this.handleInstallUpdate());
    bind(document.getElementById('openDataFolderBtn'), 'click', () => this.handleOpenDataFolder());
  };

  /**
   * Handle volume slider changes
   */
  /**
   * Handle volume slider changes with real-time audio control
   */
  app.handleVolumeChange = async function(e) {
    const volume = parseInt(e.target.value);
    const volumeValue = document.getElementById('volumeValue');
    
    console.log('Volume change requested:', volume);
    
    // Update display immediately for responsive UI
    if (volumeValue) {
      volumeValue.textContent = `${volume}%`;
    }
    
    // Clear existing timeout to debounce rapid changes
    if (this.volumeUpdateTimeout) {
      clearTimeout(this.volumeUpdateTimeout);
    }
    
    // Apply volume immediately to HTML5 audio player (real-time)
    try {
      if (window.html5AudioPlayer) {
        window.html5AudioPlayer.setVolume(volume);
        console.log('Real-time HTML5 volume applied:', volume);
      }
      
      // Also update the main process for compatibility
      await window.electronAPI.setVolume(volume);
      console.log('Real-time volume applied:', volume);
    } catch (error) {
      console.warn('Real-time volume update failed:', error.message);
    }
    
    // Debounce the backend data save to prevent file locking conflicts  
    this.volumeUpdateTimeout = setTimeout(async () => {
      try {
        console.log('Saving volume to settings:', volume);
        
        // Update backend settings with retry mechanism
        await this.updateVolumeWithRetry(volume);
        
        this.showNotification(`Volume set to ${volume}%`, 'success');
        console.log('Volume settings saved successfully:', volume);
        
      } catch (error) {
        console.error('Failed to save volume setting after retries:', error);
        this.showNotification('ذخیره‌ی میزان صدا ناموفق بود', 'error');
        
        // Revert display to last known good value
        try {
          const settings = await window.electronAPI.getSettings();
          if (volumeValue && settings) {
            volumeValue.textContent = `${settings.volume}%`;
            e.target.value = settings.volume;
          }
        } catch (revertError) {
          console.error('Failed to revert volume display:', revertError);
        }
      }
    }, 500); // Wait 500ms after last change before saving to file
  };

  /**
   * Update volume with retry mechanism
   */
  app.updateVolumeWithRetry = async function(volume, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await window.electronAPI.updateSettings({ volume: volume });
        console.log(`Volume update succeeded on attempt ${attempt}`);
        return; // Success!
        
      } catch (error) {
        console.warn(`Volume update attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error; // Final attempt failed, throw the error
        }
        
        // Wait before retrying (exponential backoff)
        const delay = attempt * 200; // 200ms, 400ms, 600ms
        console.log(`Retrying volume update in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  /**
   * Handle auto start checkbox changes
   */
  app.handleAutoStartChange = async function(e) {
    const autoStart = e.target.checked;
    
    try {
      await window.electronAPI.updateSettings({ autoStart: autoStart });
      this.showNotification(`Auto start ${autoStart ? 'enabled' : 'disabled'}`, 'success');
      console.log('Auto start updated:', autoStart);
      
    } catch (error) {
      console.error('Failed to update auto start:', error);
      this.showNotification('به‌روزرسانی اجرای خودکار ناموفق بود', 'error');
    }
  };

  /**
   * Handle log level changes
   */
  app.handleLogLevelChange = async function(e) {
    const logLevel = e.target.value;
    
    try {
      await window.electronAPI.updateSettings({ logLevel: logLevel });
      this.showNotification(`Log level set to ${logLevel}`, 'success');
      console.log('Log level updated:', logLevel);
      
    } catch (error) {
      console.error('Failed to update log level:', error);
      this.showNotification('تغییر سطح گزارش ناموفق بود', 'error');
    }
  };

  /**
   * Handle max log entries changes
   */
  app.handleMaxLogEntriesChange = async function(e) {
    const maxEntries = parseInt(e.target.value);
    
    if (maxEntries < 100 || maxEntries > 10000) {
      this.showNotification('بیشینه تعداد گزارش‌ها باید بین ۱۰۰ تا ۱۰٬۰۰۰ باشد', 'error');
      e.target.value = this.data?.settings?.maxLogEntries || 1000;
      return;
    }
    
    try {
      await window.electronAPI.updateSettings({ maxLogEntries: maxEntries });
      this.showNotification(`Max log entries set to ${maxEntries}`, 'success');
      console.log('Max log entries updated:', maxEntries);
      
    } catch (error) {
      console.error('Failed to update max log entries:', error);
      this.showNotification('تغییر بیشینه تعداد گزارش‌ها ناموفق بود', 'error');
    }
  };

  /**
   * Handle audio repeat interval changes
   */
  app.handleAudioRepeatIntervalChange = async function(e) {
    const interval = parseFloat(e.target.value);
    
    if (isNaN(interval) || interval < 0 || interval > 30) {
      this.showNotification('فاصله تکرار باید بین ۰ تا ۳۰ ثانیه باشد', 'error');
      e.target.value = this.data?.settings?.audioRepeatInterval || 3;
      return;
    }

    try {
      await window.electronAPI.updateSettings({ audioRepeatInterval: interval });
      this.showNotification(`فاصله تکرار روی ${toPersianDigits(interval)} ثانیه تنظیم شد`, 'success');
      console.log('Audio repeat interval updated:', interval);
      
    } catch (error) {
      console.error('Failed to update audio repeat interval:', error);
      this.showNotification('تغییر فاصله تکرار ناموفق بود', 'error');
    }
  };

  /**
   * Handle restart application button
   */
  app.handleRestartApp = async function() {
    const confirmed = confirm('برنامه راه‌اندازی مجدد می‌شود و همه‌ی زنگ‌های زمان‌بندی‌شده متوقف می‌شوند. مطمئن هستید؟');
    if (!confirmed) return;
    
    try {
      this.showNotification('در حال راه‌اندازی مجدد برنامه…', 'info');
      await window.electronAPI.restartApp();
      
    } catch (error) {
      console.error('Failed to restart application:', error);
      this.showNotification('راه‌اندازی مجدد برنامه ناموفق بود', 'error');
    }
  };

  /**
   * Handle change audio path button
   */
  app.handleChangeAudioPath = async function() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'انتخاب پوشه فایل‌های صوتی',
        properties: ['openDirectory'],
        buttonLabel: 'انتخاب پوشه'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        
        await window.electronAPI.updateSettings({ audioPath: newPath });
        
        // Update the input field
        const audioPathInput = document.getElementById('audioPath');
        if (audioPathInput) {
          audioPathInput.value = newPath;
        }
        
        this.showNotification('مسیر فایل‌های صوتی به‌روزرسانی شد', 'success');
        console.log('Audio path updated:', newPath);
      }
      
    } catch (error) {
      console.error('Failed to change audio path:', error);
      this.showNotification('تغییر مسیر فایل‌های صوتی ناموفق بود', 'error');
    }
  };

  /**
   * Handle export data
   */
  app.handleExportData = async function() {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: 'خروجی گرفتن از داده‌های زنگ مدرسه',
        defaultPath: `school-bell-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'فایل‌های JSON', extensions: ['json'] },
          { name: 'همه فایل‌ها', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePath) {
        // The main process handles the actual export
        this.showNotification('خروجی گرفتن از داده‌ها آغاز شد…', 'info');
        console.log('Data export initiated');
      }
      
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showNotification('خروجی گرفتن از داده‌ها ناموفق بود', 'error');
    }
  };

  /**
   * Handle import data
   */
  app.handleImportData = async function() {
    try {
      const confirmed = confirm('همه‌ی داده‌های فعلی جایگزین می‌شوند! مطمئن هستید که می‌خواهید ادامه دهید؟');
      if (!confirmed) return;
      
      const result = await window.electronAPI.showOpenDialog({
        title: 'بازیابی داده‌های زنگ مدرسه',
        filters: [
          { name: 'فایل‌های JSON', extensions: ['json'] },
          { name: 'همه فایل‌ها', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.showNotification('بازیابی داده‌ها آغاز شد…', 'info');
        console.log('Data import initiated');
        
        // The main process handles the actual import and will reload the window
      }
      
    } catch (error) {
      console.error('Failed to import data:', error);
      this.showNotification('بازیابی داده‌ها ناموفق بود', 'error');
    }
  };

  /**
   * Handle reset data
   */
  app.handleResetData = async function() {
    const confirmed = await this.confirmAction({
      title: 'بازنشانی همه داده‌ها',
      message: 'تمام برنامه‌های هفتگی، فایل‌های صوتی، الگوها، گزارش‌ها و تنظیمات حذف می‌شوند و برنامه به حالت اولیه برمی‌گردد.<br><br>پیش از حذف، یک نسخه پشتیبان خودکار در پوشه <code>backups</code> ساخته می‌شود. این کار قابل بازگشت است.',
      confirmText: 'بله، بازنشانی کن',
      danger: true
    });
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.resetAllData();

      // Pull the freshly seeded schedule back into the UI
      await this.loadData();
      await this.updateDashboard();
      await this.updateSchedule();
      await this.updateAudioLibrary();
      await this.updateTemplates();

      const backupNote = result.backup
        ? ' نسخه پشتیبان در پوشه backups ساخته شد.'
        : ' توجه: ساخت نسخه پشتیبان ناموفق بود.';
      this.showNotification(
        `بازنشانی انجام شد؛ ${toPersianDigits(result.events)} رویداد و ${toPersianDigits(result.audio)} فایل صوتی پیش‌فرض بازگردانده شد.${backupNote}`,
        'success'
      );
    } catch (error) {
      console.error('Failed to reset data:', error);
      this.showNotification('بازنشانی داده‌ها ناموفق بود', 'error');
    }
  };

  /**
   * Show settings validation errors
   */
  app.showSettingsValidationError = function(field, message) {
    const fieldElement = document.getElementById(field);
    if (fieldElement) {
      fieldElement.classList.add('error');
      
      // Remove error class after 3 seconds
      setTimeout(() => {
        fieldElement.classList.remove('error');
      }, 3000);
    }
    
    this.showNotification(message, 'error');
  };

  /**
   * Get current settings values from form
   */
  app.getCurrentSettingsFromForm = function() {
    return {
      volume: parseInt(document.getElementById('volumeSlider')?.value || 80),
      audioPath: document.getElementById('audioPath')?.value || '', // DataManager will set to userData/audio if empty
      audioRepeatInterval: parseFloat(document.getElementById('audioRepeatInterval')?.value || 3),
      autoStart: document.getElementById('autoStartCheckbox')?.checked || false,
      logLevel: document.getElementById('logLevel')?.value || 'info',
      maxLogEntries: parseInt(document.getElementById('maxLogEntries')?.value || 1000)
    };
  };

  /**
   * Validate settings form
   */
  app.validateSettingsForm = function() {
    const errors = [];
    
    const volume = parseInt(document.getElementById('volumeSlider')?.value);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      errors.push({ field: 'volumeSlider', message: 'بلندی صدا باید بین ۰ تا ۱۰۰ باشد' });
    }

    const audioRepeatInterval = parseFloat(document.getElementById('audioRepeatInterval')?.value);
    if (isNaN(audioRepeatInterval) || audioRepeatInterval < 0 || audioRepeatInterval > 30) {
      errors.push({ field: 'audioRepeatInterval', message: 'فاصله تکرار باید بین ۰ تا ۳۰ ثانیه باشد' });
    }
    
    const maxLogEntries = parseInt(document.getElementById('maxLogEntries')?.value);
    if (isNaN(maxLogEntries) || maxLogEntries < 100 || maxLogEntries > 10000) {
      errors.push({ field: 'maxLogEntries', message: 'بیشینه تعداد گزارش‌ها باید بین ۱۰۰ تا ۱۰٬۰۰۰ باشد' });
    }
    
    return errors;
  };

  /**
   * Reset settings form to defaults
   */
  app.resetSettingsToDefaults = function() {
    const defaultSettings = {
      volume: 80,
      audioPath: '', // Will be set to userData/audio by data manager
      audioRepeatInterval: 3,
      autoStart: true,
      logLevel: 'info',
      maxLogEntries: 1000
    };
    
    // Update form fields
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
      volumeSlider.value = defaultSettings.volume;
      volumeValue.textContent = `${defaultSettings.volume}%`;
    }
    
    const audioPath = document.getElementById('audioPath');
    if (audioPath) {
      audioPath.value = defaultSettings.audioPath;
    }

    const audioRepeatInterval = document.getElementById('audioRepeatInterval');
    if (audioRepeatInterval) {
      audioRepeatInterval.value = defaultSettings.audioRepeatInterval;
    }
    
    const autoStart = document.getElementById('autoStartCheckbox');
    if (autoStart) {
      autoStart.checked = defaultSettings.autoStart;
    }
    
    const logLevel = document.getElementById('logLevel');
    if (logLevel) {
      logLevel.value = defaultSettings.logLevel;
    }
    
    const maxLogEntries = document.getElementById('maxLogEntries');
    if (maxLogEntries) {
      maxLogEntries.value = defaultSettings.maxLogEntries;
    }
    
    console.log('Settings form reset to defaults');
  };

  /**
   * Show settings help dialog
   */
  app.showSettingsHelp = function() {
    const helpContent = `
      <div class="settings-help">
        <h4>راهنمای تنظیمات</h4>
        
        <div class="help-section">
          <h5>تنظیمات صوتی</h5>
          <p><strong>بلندی صدای سامانه:</strong> بلندی پخش همه صداهای زنگ را کنترل می‌کند (۰ تا ۱۰۰٪)</p>
          <p><strong>مسیر فایل‌های صوتی:</strong> پوشه‌ای که فایل‌های صوتی در آن ذخیره می‌شوند</p>
        </div>
        
        <div class="help-section">
          <h5>تنظیمات برنامه</h5>
          <p><strong>اجرای خودکار:</strong> اجرای خودکار برنامه هنگام روشن شدن سیستم</p>
          <p><strong>سطح ثبت گزارش:</strong> میزان جزئیات ثبت‌شده را کنترل می‌کند (خطا &lt; هشدار &lt; اطلاعات &lt; جزئیات فنی)</p>
          <p><strong>بیشینه تعداد گزارش‌ها:</strong> بیشترین تعداد گزارش نگهداری‌شده (۱۰۰ تا ۱۰٬۰۰۰)</p>
        </div>
        
        <div class="help-section">
          <h5>مدیریت داده‌ها</h5>
          <p><strong>خروجی داده‌ها:</strong> یک فایل پشتیبان از برنامه‌ها، تنظیمات و داده‌های شما می‌سازد</p>
          <p><strong>بازیابی داده‌ها:</strong> بازیابی داده‌ها از یک فایل پشتیبان</p>
          <p><strong>بازنشانی داده‌ها:</strong> پاک کردن همه داده‌ها و بازگشت به حالت اولیه</p>
        </div>
      </div>
    `;

    this.showModal('راهنمای تنظیمات', helpContent);
  };

}
