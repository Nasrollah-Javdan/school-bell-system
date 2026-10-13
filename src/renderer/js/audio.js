/**
 * Audio library behaviour for the School Bell System.
 * Mixed into the application object by `main.js`.
 */
import { formatFileSize, getFileTypeDisplay, formatUploadDate } from './utils.js';

export function extendAppWithAudioMethods(app) {
  app.updateAudioLibrary = async function() {
    try {
      this.showNotification('در حال بارگذاری کتابخانه صوتی…', 'info');
      await this.loadData();
      await this.renderAudioFiles();
      this.setupAudioDragDrop();
      
      // Refresh audio playing state from HTML5 player
      this.refreshAudioPlayingState();
    } catch (error) {
      this.showNotification('بارگذاری کتابخانه صوتی ناموفق بود', 'error');
    }
  };

  app.renderAudioFiles = async function() {
    const audioGrid = document.getElementById('audioGrid');
    if (!audioGrid) return;

    const audioFiles = this.data?.audioFiles || [];
    
    try {
      const availableFiles = await window.electronAPI.getAvailableAudioFiles();
      
      if (audioFiles.length === 0) {
        audioGrid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🎵</span>
            <p>هنوز هیچ فایل صوتی بارگذاری نشده است</p>
            <p>فایل صوتی بارگذاری کنید تا در برنامه زنگ‌ها قابل استفاده باشد</p>
            <button class="btn btn-outline" onclick="app.showUploadAudioModal()">
              📁 بارگذاری فایل صوتی
            </button>
          </div>
        `;
        return;
      }

      const audioHTML = audioFiles.map(audioFile => {
        const isAvailable = availableFiles.includes(audioFile.filename);
        const statusClass = isAvailable ? 'available' : 'missing';
        const statusText = isAvailable ? 'موجود' : 'در حافظه موجود نیست';
        const statusIcon = isAvailable ? '✅' : '⚠️';
        
        return `
          <div class="audio-file ${statusClass}" data-id="${audioFile.id}" data-filename="${audioFile.filename}">
            <div class="audio-file__header">
              <div class="audio-file__checkbox">
                <input type="checkbox" class="audio-select" data-id="${audioFile.id}"
                       onchange="app.updateBulkActions()"
                       aria-label="Select ${this.escapeHtml(audioFile.name)}">
              </div>
              <div class="audio-file__info">
                <div class="audio-file__name">${this.escapeHtml(audioFile.name)}</div>
                <div class="audio-file__filename" title="${this.escapeHtml(audioFile.filename)}">${this.escapeHtml(audioFile.filename)}</div>
                <div class="audio-file__meta">
                  <span class="audio-file__status" data-available="${isAvailable}">${statusIcon} ${statusText}</span>
                  <span class="audio-file__size">${this.formatFileSize(audioFile.size)}</span>
                  <span class="audio-file__type">${this.getFileTypeDisplay(audioFile.filename)}</span>
                  <span class="audio-file__uploaded">${this.formatUploadDate(audioFile.uploadedAt)}</span>
                </div>
              </div>
            </div>
            <div class="audio-file__controls">
              <button class="btn btn-sm btn-success play-btn" 
                      onclick="app.testAudio('${audioFile.filename}')" 
                      title="پخش این فایل صوتی"
                      ${!isAvailable ? 'disabled' : ''}>
                ▶️ Play
              </button>
              <button class="btn btn-sm btn-secondary stop-btn" 
                      onclick="app.stopAudio()" 
                      title="توقف همه صداها">
                ⏹️ Stop
              </button>
              <button class="btn btn-sm btn-info" 
                      onclick="app.showAudioDetails('${audioFile.id}')" 
                      title="مشاهده جزئیات">
                ℹ️ Details
              </button>
              <button class="btn btn-sm btn-danger" 
                      onclick="app.deleteAudio('${audioFile.id}', '${this.escapeHtml(audioFile.name)}')" 
                      title="حذف این فایل صوتی">
                🗑️ Delete
              </button>
            </div>
          </div>
        `;
      }).join('');

      audioGrid.innerHTML = audioHTML;
      
      // Attach bulk action event listeners after rendering
      this.attachBulkActionListeners();
      
      // Initialize bulk actions state
      this.updateBulkActions();
      
      // Log missing files to console but don't show user notification
      const totalFiles = audioFiles.length;
      const availableCount = audioFiles.filter(af => availableFiles.includes(af.filename)).length;
      const missingCount = totalFiles - availableCount;
      
      if (missingCount > 0) {
        console.warn(`${missingCount} of ${totalFiles} audio file(s) are missing from disk`);
      }
      
    } catch (error) {
      const audioHTML = audioFiles.map(audioFile => `
        <div class="audio-file unknown" data-id="${audioFile.id}" data-filename="${audioFile.filename}">
          <div class="audio-file__header">
            <div class="audio-file__checkbox">
              <input type="checkbox" class="audio-select" data-id="${audioFile.id}"
                     onchange="app.updateBulkActions()"
                     aria-label="Select ${this.escapeHtml(audioFile.name)}">
            </div>
            <div class="audio-file__info">
              <div class="audio-file__name">${this.escapeHtml(audioFile.name)}</div>
              <div class="audio-file__filename" title="${this.escapeHtml(audioFile.filename)}">${this.escapeHtml(audioFile.filename)}</div>
              <div class="audio-file__meta">
                <span class="audio-file__status" data-available="false">⚠️ وضعیت نامشخص</span>
                <span class="audio-file__size">${this.formatFileSize(audioFile.size)}</span>
              </div>
            </div>
          </div>
          <div class="audio-file__controls">
            <button class="btn btn-sm btn-success play-btn" onclick="app.testAudio('${audioFile.filename}')">
              ▶️ Play
            </button>
            <button class="btn btn-sm btn-secondary stop-btn" onclick="app.stopAudio()">
              ⏹️ Stop
            </button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteAudio('${audioFile.id}', '${this.escapeHtml(audioFile.name)}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `).join('');

      audioGrid.innerHTML = audioHTML;
      
      // Attach bulk action event listeners after rendering
      this.attachBulkActionListeners();
      
      // Initialize bulk actions state
      this.updateBulkActions();
      
      console.warn('وضعیت فایل‌های صوتی قابل بررسی نبود');
    }
  };

  app.testAudio = async function(filename) {
    try {
      // If audio is already playing, stop it first
      if (this.currentlyPlaying) {
        await this.stopAudio();
      }

      this.setStatus('playing', 'در حال پخش');
      this.showNotification(`Playing: ${filename}`, 'info');
      
      // Update UI to show which audio is playing
      this.updateAudioPlayingState(filename, true);
      
      // Use HTML5 audio player for real-time volume control
      let result;
      if (window.html5AudioPlayer) {
        try {
          result = await window.html5AudioPlayer.playAudio(filename);
          console.log('HTML5 audio started successfully');
          
          // Wait for audio to complete or be stopped
          await this.waitForAudioCompletion(filename);
        } catch (html5Error) {
          console.warn('پخش داخلی ناموفق بود؛ استفاده از پخش‌کننده سامانه:', html5Error.message);
          this.showNotification(`پخش داخلی ناموفق بود؛ از پخش‌کننده سامانه استفاده می‌شود…`, 'warning');
          
          // Fallback to main process audio player
          result = await window.electronAPI.testAudio(filename);
        }
      } else {
        // Fallback to main process audio player
        result = await window.electronAPI.testAudio(filename);
      }
      
      // Reset status when done
      this.setStatus('ready', 'آماده');
      this.updateAudioPlayingState(filename, false);
      
      if (result && result.success) {
        this.showNotification(`Audio completed: ${filename}`, 'success');
      }
      
    } catch (error) {
      this.setStatus('error', 'خطای صوتی');
      this.updateAudioPlayingState(filename, false);
      
      let errorMessage = `Failed to play: ${filename}`;
      if (error.message.includes('not found') || error.message.includes('ENOENT')) {
        errorMessage += ' - File not found';
      } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
        errorMessage += ' - Permission denied';
      } else if (error.message.includes('format')) {
        errorMessage += ' - Unsupported format';
      }
      
      this.showNotification(errorMessage, 'error');
    }
  };

  app.waitForAudioCompletion = function(filename) {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        if (window.html5AudioPlayer && 
            (!window.html5AudioPlayer.isAudioPlaying() || 
             window.html5AudioPlayer.getCurrentFile() !== filename)) {
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };
      checkCompletion();
    });
  };

  app.stopAudio = async function() {
    try {
      let stopped = false;
      
      // Stop HTML5 audio player first
      if (window.html5AudioPlayer && window.html5AudioPlayer.isAudioPlaying()) {
        window.html5AudioPlayer.stopAudio();
        stopped = true;
        console.log('HTML5 audio stopped');
      }
      
      // Also stop main process audio for compatibility
      try {
        const result = await window.electronAPI.stopTestAudio();
        if (result && result.stopped) {
          stopped = true;
        }
      } catch (error) {
        console.warn('Main process audio stop failed:', error.message);
      }
      
      this.setStatus('ready', 'آماده');
      
      // Reset all audio UI states
      this.updateAudioPlayingState(null, false);
      
      if (stopped) {
        this.showNotification('پخش صوت متوقف شد', 'info');
      } else {
        this.showNotification('هیچ صدایی در حال پخش نبود', 'info');
      }
    } catch (error) {
      console.error('Failed to stop audio:', error);
      this.showNotification('توقف صدا ناموفق بود', 'error');
    }
  };

  // NEW: Update audio playing state in UI
  app.updateAudioPlayingState = function(playingFilename, isPlaying) {
    // Store currently playing filename
    this.currentlyPlaying = isPlaying ? playingFilename : null;
    
    // Update all audio file cards
    const audioFiles = document.querySelectorAll('.audio-file');
    audioFiles.forEach(audioFile => {
      const filename = audioFile.dataset.filename;
      const playBtn = audioFile.querySelector('.play-btn');
      const stopBtn = audioFile.querySelector('.stop-btn');
      
      if (isPlaying && filename === playingFilename) {
        // This file is playing
        audioFile.classList.add('playing');
        if (playBtn) {
          playBtn.textContent = '⏸️ Playing...';
          playBtn.disabled = true;
          playBtn.classList.add('playing');
        }
        if (stopBtn) {
          stopBtn.classList.add('active');
        }
      } else {
        // This file is not playing
        audioFile.classList.remove('playing');
        if (playBtn) {
          playBtn.textContent = '▶️ Play';
          playBtn.disabled = false;
          playBtn.classList.remove('playing');
        }
        if (stopBtn) {
          stopBtn.classList.remove('active');
        }
      }
    });
  };

  // NEW: Refresh audio playing state from HTML5 player when switching tabs
  app.refreshAudioPlayingState = function() {
    if (window.html5AudioPlayer) {
      const isPlaying = window.html5AudioPlayer.isAudioPlaying();
      const currentFile = window.html5AudioPlayer.getCurrentFile();
      
      if (isPlaying && currentFile) {
        console.log('Refreshing audio state - currently playing:', currentFile);
        this.updateAudioPlayingState(currentFile, true);
      } else {
        console.log('Refreshing audio state - no audio playing');
        this.updateAudioPlayingState(null, false);
      }
    } else {
      // Fallback: clear all playing states if HTML5 player not available
      this.updateAudioPlayingState(null, false);
    }
  };

  // REMOVED: setAudioControlsState function - no longer needed

  app.showAudioDetails = function(audioId) {
    const audioFile = this.data?.audioFiles?.find(af => af.id === audioId);
    if (!audioFile) {
      this.showNotification('فایل صوتی یافت نشد', 'error');
      return;
    }

    const modalContent = `
      <div class="audio-details">
        <div class="detail-section">
          <h4>📋 اطلاعات پایه</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <strong>نام:</strong>
              <span>${this.escapeHtml(audioFile.name)}</span>
            </div>
            <div class="detail-item">
              <strong>نام فایل:</strong>
              <span class="monospace">${this.escapeHtml(audioFile.filename)}</span>
            </div>
            <div class="detail-item">
              <strong>حجم فایل:</strong>
              <span>${this.formatFileSize(audioFile.size)}</span>
            </div>
            <div class="detail-item">
              <strong>نوع فایل:</strong>
              <span>${this.getFileTypeDisplay(audioFile.filename)}</span>
            </div>
            <div class="detail-item">
              <strong>زمان بارگذاری:</strong>
              <span>${this.formatUploadDate(audioFile.uploadedAt)}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>🎵 پخش و کنترل</h4>
          <div class="detail-controls">
            <button class="btn btn-success" onclick="app.testAudio('${audioFile.filename}')">
              ▶️ Play Audio
            </button>
            <button class="btn btn-secondary" onclick="app.stopAudio()">
              ⏹️ Stop Audio
            </button>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>📊 اطلاعات استفاده</h4>
          <div class="usage-info">
            <p>This audio file can be used in schedule events. Once added to an event's audio sequence, it will play automatically when the event triggers.</p>
            <p><strong>تعداد استفاده در رویدادها:</strong> ${this.getAudioUsageCount(audioFile.filename)} event(s)</p>
          </div>
        </div>
      </div>
    `;

    const buttons = [
      {
        text: 'بستن',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: 'حذف فایل',
        class: 'btn btn-danger',
        onclick: () => {
          this.closeModal();
          this.deleteAudio(audioFile.id, audioFile.name);
        }
      }
    ];

    this.showModal(`Audio Details - ${audioFile.name}`, modalContent, buttons);
  };

  app.getAudioUsageCount = function(filename) {
    if (!this.data?.schedules) return 0;
    
    let count = 0;
    Object.values(this.data.schedules).forEach(daySchedule => {
      daySchedule.forEach(event => {
        if (event.audioSequence) {
          event.audioSequence.forEach(audio => {
            if (audio.audioFile === filename) {
              count++;
            }
          });
        }
      });
    });
    
    return count;
  };

  app.testSystemAudio = async function() {
    try {
      this.showNotification('در حال آزمون صدا (باید بوقی بشنوید)…', 'info');
      
      const result = await window.electronAPI.testSystemAudio();
      
      if (result.success) {
        this.showNotification('آزمون صدا انجام شد. آیا بوقی شنیدید؟', 'success');
      } else {
        this.showNotification('آزمون صدا ناموفق بود؛ بوقی شنیده نشد', 'error');
      }
      
    } catch (error) {
      this.showNotification('آزمون صدا ناموفق بود؛ درایورها و بلندگوها را بررسی کنید', 'error');
    }
  };

  app.showUploadAudioModal = function() {
    const modalContent = `
      <div class="upload-container">
        <div class="upload-header">
          <h4>📁 بارگذاری فایل صوتی</h4>
          <p>فایل صوتی بارگذاری کنید تا در برنامه زنگ‌ها قابل استفاده باشد</p>
        </div>
        
        <div class="drag-area" id="audioDragArea">
          <div class="drag-icon">🎵</div>
          <div class="drag-text">فایل‌های صوتی را اینجا رها کنید یا برای انتخاب کلیک کنید</div>
          <div class="drag-subtext">امکان انتخاب چند فایل</div>
          <input type="file" id="audioFileInput" multiple accept=".mp3,.wav,.m4a,.ogg,.aac" style="display: none;">
        </div>
        
        <div class="upload-info">
          <div class="supported-formats">
            <strong>📋 قالب‌های پشتیبانی‌شده:</strong>
            <div class="format-list">
              <span class="format-tag">MP3</span>
              <span class="format-tag">WAV</span>
              <span class="format-tag">M4A</span>
              <span class="format-tag">OGG</span>
              <span class="format-tag">AAC</span>
            </div>
          </div>
          
          <div class="upload-limits">
            <strong>📏 محدودیت‌ها:</strong>
            <ul>
              <li>بیشینه حجم هر فایل: ۵۰ مگابایت</li>
              <li>توصیه می‌شود برای کارایی بهتر، حجم فایل‌ها زیر ۱۰ مگابایت باشد</li>
              <li>کیفیت صوتی ۴۴٫۱ کیلوهرتز یا بالاتر توصیه می‌شود</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const buttons = [
      {
        text: 'انصراف',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: '📁 Browse Files',
        class: 'btn btn-primary',
        onclick: () => document.getElementById('audioFileInput').click()
      }
    ];

    this.showModal('بارگذاری فایل صوتی', modalContent, buttons);
    
    setTimeout(() => this.setupUploadModal(), 100);
  };

  app.setupUploadModal = function() {
    const dragArea = document.getElementById('audioDragArea');
    const fileInput = document.getElementById('audioFileInput');
    
    if (!dragArea || !fileInput) return;

    dragArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragArea.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragArea.classList.remove('drag-over');
      });
    });

    dragArea.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      this.handleFiles(files);
    });
  };

  app.handleFiles = async function(files) {
    if (!files || files.length === 0) return;

    const validFiles = [];
    const invalidFiles = [];
    const maxSize = 50 * 1024 * 1024;
    const validExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];

    Array.from(files).forEach(file => {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!validExtensions.includes(extension)) {
        invalidFiles.push({ file, reason: 'قالب نامعتبر' });
      } else if (file.size > maxSize) {
        invalidFiles.push({ file, reason: 'حجم بیش از حد (حداکثر ۵۰ مگابایت)' });
      } else if (file.size === 0) {
        invalidFiles.push({ file, reason: 'فایل خالی' });
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      const invalidList = invalidFiles.map(item => 
        `• ${item.file.name} - ${item.reason}`
      ).join('\n');
      
      this.showNotification(
        `${invalidFiles.length} file(s) skipped:\n${invalidList}`, 
        'warning'
      );
    }

    if (validFiles.length === 0) {
      this.showNotification('فایل معتبری انتخاب نشده است', 'error');
      return;
    }

    this.showNotification(`Uploading ${validFiles.length} file(s)...`, 'info');
    this.closeModal();

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      
      try {
        this.showNotification(
          `Uploading ${i + 1}/${validFiles.length}: ${file.name}`, 
          'info'
        );

        const buffer = await window.electronAPI.readFileAsBuffer(file);
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');

        await window.electronAPI.uploadAudioFile({
          filename: safeName,
          buffer: buffer,
          displayنام: file.name
        });

        successCount++;
        
      } catch (error) {
        errorCount++;
        this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
      }
    }

    if (successCount > 0) {
      await this.loadData();
      this.updateAudioLibrary();
      this.showNotification(
        `Upload completed! ${successCount} file(s) uploaded successfully` +
        (errorCount > 0 ? `, ${errorCount} failed` : ''),
        successCount > errorCount ? 'success' : 'warning'
      );
    } else {
      this.showNotification('همه بارگذاری‌ها ناموفق بود', 'error');
    }
  };

  app.deleteAudio = async function(audioId, audioName) {
    try {
      const usageCount = this.getAudioUsageCount(
        this.data?.audioFiles?.find(af => af.id === audioId)?.filename
      );
      
      let confirmMessage = `Delete "${audioName}"?`;
      if (usageCount > 0) {
        confirmMessage += `\n\nWarning: This audio file is used in ${usageCount} event(s). ` +
                         `Deleting it will cause those events to fail when they try to play audio.`;
      }
      confirmMessage += '\n\nThis action cannot be undone.';
      
      if (!confirm(confirmMessage)) {
        return;
      }

      this.showNotification(`Deleting ${audioName}...`, 'info');

      await window.electronAPI.deleteAudioFile(audioId);
      
      await this.loadData();
      this.updateAudioLibrary();
      
      this.showNotification(`Deleted: ${audioName}`, 'success');
      
      if (usageCount > 0) {
        this.showNotification(
          `Warning: ${usageCount} event(s) may now fail to play audio`, 
          'warning'
        );
      }
      
    } catch (error) {
      this.showNotification(`Failed to delete: ${error.message}`, 'error');
    }
  };

  app.setupAudioDragDrop = function() {
    const audioGrid = document.getElementById('audioGrid');
    if (!audioGrid) return;

    audioGrid.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFiles(files);
      }
    });

    audioGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
  };

  /**
   * Formatting helpers - thin delegates to the shared utilities so the
   * formatting rules are defined exactly once.
   */
  app.formatFileSize = function(bytes) {
    return formatFileSize(bytes);
  };

  app.getFileTypeDisplay = function(filename) {
    return getFileTypeDisplay(filename);
  };

  app.formatUploadDate = function(dateString) {
    return formatUploadDate(dateString);
  };

  // Bulk selection functionality
  app.updateBulkActions = function() {
    const checkboxes = document.querySelectorAll('.audio-select');
    const checkedBoxes = document.querySelectorAll('.audio-select:checked');
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');

    if (!bulkActions || !selectedCount) return;

    const hasSelection = checkedBoxes.length > 0;

    // Use the `hidden` attribute rather than inline styles so the toolbar
    // cannot end up stuck on screen or stuck hidden.
    bulkActions.hidden = !hasSelection;
    selectedCount.textContent = `${checkedBoxes.length} selected`;

    const deleteBtn = document.getElementById('bulkDeleteBtn');
    if (deleteBtn) deleteBtn.disabled = !hasSelection;

    // Reflect selection on the card
    checkboxes.forEach(checkbox => {
      checkbox.closest('.audio-file')?.classList.toggle('selected', checkbox.checked);
    });
  };

  app.selectAllAudio = function() {
    const checkboxes = document.querySelectorAll('.audio-select');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    this.updateBulkActions();
  };

  app.selectNoneAudio = function() {
    const checkboxes = document.querySelectorAll('.audio-select');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    this.updateBulkActions();
  };

  app.bulkDeleteAudio = async function() {
    const checkedBoxes = document.querySelectorAll('.audio-select:checked');
    if (checkedBoxes.length === 0) {
      this.showNotification('هیچ فایل صوتی انتخاب نشده است', 'warning');
      return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
    const selectedFiles = selectedIds.map(id => {
      const audioFile = this.data?.audioFiles?.find(af => af.id === id);
      return audioFile ? audioFile.name : id;
    }).join(', ');

    const confirmed = confirm(
      `Are you sure you want to delete ${checkedBoxes.length} audio file${checkedBoxes.length > 1 ? 's' : ''}?\n\n${selectedFiles}\n\nThis action cannot be undone.`
    );

    if (confirmed) {
      try {
        this.showNotification('در حال حذف فایل‌های صوتی…', 'info');

        const result = await window.electronAPI.bulkDeleteAudioFiles(selectedIds);
        
        if (result.success) {
          this.showNotification(
            `Successfully deleted ${result.deletedCount} audio file${result.deletedCount > 1 ? 's' : ''}`, 
            'success'
          );
          
          if (result.errors && result.errors.length > 0) {
            this.showNotification(`Failed to delete ${result.errors.length} files`, 'warning');
          }

          await this.loadData();
          await this.renderAudioFiles();
          this.updateBulkActions();
        } else {
          throw new Error(result.message || 'حذف گروهی ناموفق بود');
        }
      } catch (error) {
        console.error('Bulk delete failed:', error);
        this.showNotification(`Failed to delete audio files: ${error.message}`, 'error');
      }
    }
  };

  // Attach bulk action event listeners
  app.attachBulkActionListeners = function() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const selectNoneBtn = document.getElementById('selectNoneBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

    // Remove existing listeners to prevent duplicates
    if (selectAllBtn) {
      selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
      const newSelectAllBtn = document.getElementById('selectAllBtn');
      newSelectAllBtn.addEventListener('click', () => this.selectAllAudio());
    }
    if (selectNoneBtn) {
      selectNoneBtn.replaceWith(selectNoneBtn.cloneNode(true));
      const newSelectNoneBtn = document.getElementById('selectNoneBtn');
      newSelectNoneBtn.addEventListener('click', () => this.selectNoneAudio());
    }
    if (bulkDeleteBtn) {
      bulkDeleteBtn.replaceWith(bulkDeleteBtn.cloneNode(true));
      const newBulkDeleteBtn = document.getElementById('bulkDeleteBtn');
      newBulkDeleteBtn.addEventListener('click', () => this.bulkDeleteAudio());
    }
  };
}
