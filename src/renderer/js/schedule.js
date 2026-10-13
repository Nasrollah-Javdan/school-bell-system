/**
 * Schedule Management for School Bell System - CLEAN REWRITE
 * Simple, efficient schedule management with time picker and audio dropdown
 */

import { toPersianDigits } from './fa.js';

// Extend the main app with schedule methods
export function extendAppWithScheduleMethods(app) {

  /* ==========================================================================
     Built-in default timetable
     ========================================================================== */

  /**
   * Show a day picker, then replace those days with the built-in school
   * timetable. The schedule is the same one seeded on a fresh install, so
   * this doubles as "undo my changes".
   */
  app.showLoadDefaultScheduleModal = async function() {
    const info = await window.electronAPI.getDefaultSchedule();

    const periodRows = info.periods.map((p) =>
      `<tr>
         <td class="mono-cell" dir="ltr">${this.escapeHtml(p.time)}</td>
         <td>${this.escapeHtml(p.name)}</td>
       </tr>`).join('');

    const dayBoxes = info.days.map((day) => {
      // School days start ticked; optional days (پنج‌شنبه) start unticked
      const isSeedDay = (info.seedDays || []).includes(day);
      return `<label class="day-checkbox">
         <input type="checkbox" value="${day}" ${isSeedDay ? 'checked' : ''}>
         ${this.escapeHtml(this.dayLabel(day))}
       </label>`;
    }).join('');

    const modalContent = `
      <div class="template-form-container">
        <div class="warning">
          رویدادهای فعلی روزهای انتخاب‌شده <strong>جایگزین</strong> می‌شوند.
        </div>

        <div class="form-group">
          <label class="form-label">روزهایی که برنامه پیش‌فرض روی آن‌ها اعمال شود</label>
          <div class="day-selection" id="defaultDaySelection">${dayBoxes}</div>
        </div>

        <div class="form-group">
          <label class="form-label">پیش‌نمایش برنامه</label>
          <div class="detail-section">
            <table class="preview-table">
              <thead><tr><th>ساعت</th><th>رویداد</th></tr></thead>
              <tbody>${periodRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    const buttons = [
      { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      {
        text: 'اعمال برنامه پیش‌فرض',
        class: 'btn btn-primary',
        onclick: () => this.applyDefaultSchedule(info.days)
      }
    ];

    this.showModal('برنامه پیش‌فرض مدرسه', modalContent, buttons);
  };

  /** Replace the ticked days with the default timetable. */
  app.applyDefaultSchedule = async function(allDays) {
    const checked = Array.from(
      document.querySelectorAll('#defaultDaySelection input:checked')
    ).map((i) => i.value);

    if (checked.length === 0) {
      this.showNotification('دست‌کم یک روز را انتخاب کنید', 'warning');
      return;
    }

    try {
      await window.electronAPI.applyDefaultSchedule(checked);
      this.closeModal();
      await this.loadData();
      this.updateSchedule();
      this.showNotification(
        `برنامه پیش‌فرض روی ${toPersianDigits(checked.length)} روز اعمال شد`,
        'success'
      );
    } catch (error) {
      console.error('Failed to apply default schedule:', error);
      this.showNotification('اعمال برنامه پیش‌فرض ناموفق بود', 'error');
    }
  };

  /* ==========================================================================
     Event editing
     ========================================================================== */

  /**
   * Show add event modal
   */
  app.showAddEventModal = async function() {
    try {
      // Get available audio files
      const audioFiles = await window.electronAPI.getAvailableAudioFiles();
      
      const modalContent = `
        <div class="event-form-container">
          <form id="eventForm" class="event-form">
            
            <!-- Event Name -->
            <div class="form-group">
              <label for="eventName">نام رویداد *</label>
              <input type="text" id="eventName" placeholder="مثلاً: زنگ شروع کلاس" required>
            </div>
            
            <!-- Time Picker -->
            <div class="form-group">
              <label for="eventTime">ساعت *</label>
              <input type="time" id="eventTime" required>
            </div>
            
            <!-- Audio Selection -->
            <div class="form-group">
              <label>فایل‌های صوتی</label>
              <div class="audio-section">
                <div class="audio-selector">
                  <select id="audioDropdown">
                    <option value="">یک فایل صوتی انتخاب کنید…</option>
                    ${audioFiles.map(file => `<option value="${file}">${file}</option>`).join('')}
                  </select>
                  <button type="button" id="addAudioBtn" disabled>افزودن</button>
                </div>
                
                <!-- Selected Audio Display -->
                <div class="selected-audio" id="selectedAudio">
                  <div class="no-audio">هیچ فایل صوتی انتخاب نشده است</div>
                </div>
              </div>
            </div>
            
            <!-- Options -->
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="eventEnabled" checked>
                Enable this event
              </label>
            </div>
            
            <!-- Notes -->
            <div class="form-group">
              <label for="eventNotes">یادداشت (اختیاری)</label>
              <textarea id="eventNotes" rows="3" placeholder="یادداشت تکمیلی…"></textarea>
            </div>
            
          </form>
        </div>
      `;

      const buttons = [
        { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'آزمون رویداد', class: 'btn btn-warning', onclick: () => this.testEvent() },
        { text: 'ذخیره رویداد', class: 'btn btn-primary', onclick: () => this.saveEvent() }
      ];

      this.showModal('افزودن رویداد زمان‌بندی', modalContent, buttons);
      
      // Initialize form
      setTimeout(() => this.initEventForm(), 100);

    } catch (error) {
      console.error('Failed to show event modal:', error);
      this.showNotification('Failed to load event form', 'error');
    }
  };

  /**
   * Initialize event form
   */
  app.initEventForm = function() {
    this.audioSequence = [];
    
    const dropdown = document.getElementById('audioDropdown');
    const addBtn = document.getElementById('addAudioBtn');
    const eventNameInput = document.getElementById('eventName');
    
    // Focus the event name field for better UX
    if (eventNameInput) {
      eventNameInput.focus();
      eventNameInput.select(); // Select any existing text for easy replacement
    }
    
    // Enable/disable add button based on selection
    dropdown.addEventListener('change', () => {
      addBtn.disabled = !dropdown.value;
    });
    
    // Add audio to sequence
    addBtn.addEventListener('click', () => {
      this.addAudioToSequence();
    });
    
    console.log('Event form initialized');
  };

  /**
   * Add audio file to sequence
   */
  app.addAudioToSequence = function() {
    const dropdown = document.getElementById('audioDropdown');
    const selectedFile = dropdown.value;
    
    if (!selectedFile) return;
    
    // Check if already exists
    const existing = this.audioSequence.find(item => item.audioFile === selectedFile);
    
    if (existing) {
      existing.repeat++;
      this.showNotification(`Increased repeat count to ${existing.repeat}`, 'info');
    } else {
      this.audioSequence.push({
        audioFile: selectedFile,
        repeat: 1
      });
      this.showNotification(`Added ${selectedFile}`, 'success');
    }
    
    this.updateAudioDisplay();
    dropdown.value = '';
    document.getElementById('addAudioBtn').disabled = true;
  };

  /**
   * Update audio sequence display
   */
  app.updateAudioDisplay = function() {
    const container = document.getElementById('selectedAudio');
    
    if (this.audioSequence.length === 0) {
      container.innerHTML = '<div class="no-audio">هیچ فایل صوتی انتخاب نشده است</div>';
      return;
    }
    
    const html = this.audioSequence.map((item, index) => `
      <div class="sequence-item" draggable="true" data-index="${index}">
        <div class="drag-handle" title="برای تغییر ترتیب بکشید" aria-hidden="true">⋮⋮</div>
        <div class="sequence-item__info">
          <span class="sequence-item__name" title="${this.escapeHtml(item.audioFile)}">${this.escapeHtml(item.audioFile)}</span>
          <span class="sequence-item__repeat">Plays ${item.repeat}×</span>
        </div>
        <div class="sequence-item__controls">
          <button type="button" onclick="app.moveAudio(${index}, -1)" title="انتقال به بالا" aria-label="Move ${this.escapeHtml(item.audioFile)} up">↑</button>
          <button type="button" onclick="app.moveAudio(${index}, 1)" title="انتقال به پایین" aria-label="Move ${this.escapeHtml(item.audioFile)} down">↓</button>
          <button type="button" onclick="app.changeRepeat(${index}, -1)" title="یک بار کمتر پخش شود" aria-label="کاهش تعداد تکرار">−</button>
          <button type="button" onclick="app.changeRepeat(${index}, 1)" title="یک بار بیشتر پخش شود" aria-label="افزایش تعداد تکرار">+</button>
          <button type="button" onclick="app.previewAudio('${item.audioFile}')" title="پیش‌نمایش" aria-label="Preview ${this.escapeHtml(item.audioFile)}">▶</button>
          <button type="button" data-action="remove" onclick="app.removeAudio(${index})" title="حذف" aria-label="Remove ${this.escapeHtml(item.audioFile)}">×</button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
    this.setupAudioDragAndDrop();
  };

  /**
   * Move audio item up or down
   */
  app.moveAudio = function(index, direction) {
    const newIndex = index + direction;
    
    if (newIndex < 0 || newIndex >= this.audioSequence.length) return;
    
    // Swap items
    const temp = this.audioSequence[index];
    this.audioSequence[index] = this.audioSequence[newIndex];
    this.audioSequence[newIndex] = temp;
    
    this.updateAudioDisplay();
    this.showNotification('ترتیب پخش صدا به‌روزرسانی شد', 'info');
  };

  /**
   * Set up drag and drop for audio reordering
   */
  app.setupAudioDragAndDrop = function() {
    const container = document.getElementById('selectedAudio');
    if (!container || container.dataset.dragBound === 'true') return;

    // Bind once - the list is re-rendered in place, so rebinding on every
    // update would stack duplicate listeners and fire reorders many times.
    container.dataset.dragBound = 'true';
    let draggedIndex = null;
    
    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('sequence-item')) {
        draggedIndex = parseInt(e.target.dataset.index);
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    container.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('sequence-item')) {
        e.target.style.opacity = '1';
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();

      const dropTarget = e.target.closest('.sequence-item');
      if (dropTarget && draggedIndex !== null) {
        const dropIndex = parseInt(dropTarget.dataset.index);
        
        if (draggedIndex !== dropIndex) {
          // Move the dragged item to the drop position
          const draggedItem = this.audioSequence.splice(draggedIndex, 1)[0];
          this.audioSequence.splice(dropIndex, 0, draggedItem);
          
          this.updateAudioDisplay();
          this.showNotification('ترتیب پخش صدا به‌روزرسانی شد', 'success');
        }
      }
      
      draggedIndex = null;
    });
  };

  /**
   * Change repeat count
   */
  app.changeRepeat = function(index, delta) {
    const item = this.audioSequence[index];
    if (!item) return;
    
    item.repeat = Math.max(1, Math.min(10, item.repeat + delta));
    this.updateAudioDisplay();
  };

  /**
   * Remove audio from sequence
   */
  app.removeAudio = function(index) {
    if (this.audioSequence[index]) {
      this.audioSequence.splice(index, 1);
      this.updateAudioDisplay();
      this.showNotification('فایل صوتی حذف شد', 'info');
    }
  };

  /**
   * Preview audio file
   */
  app.previewAudio = function(filename) {
    this.testAudioFile(filename);
  };

  /**
   * Get form data
   */
  app.getEventData = function() {
    const name = document.getElementById('eventName').value.trim();
    const time = document.getElementById('eventTime').value;
    const enabled = document.getElementById('eventEnabled').checked;
    const notes = document.getElementById('eventNotes').value.trim();
    
    // Convert time to HH:MM:SS format
    const timeParts = time.split(':');
    const formattedTime = timeParts.length === 2 ? `${time}:00` : time;
    
    return {
      name,
      time: formattedTime,
      enabled,
      notes,
      audioSequence: [...this.audioSequence]
    };
  };

  /**
   * Validate event data
   */
  app.validateEvent = function(data) {
    if (!data.name) {
      this.showNotification('وارد کردن نام رویداد الزامی است', 'error');
      document.getElementById('eventName').focus();
      return false;
    }
    
    if (!data.time) {
      this.showNotification('تعیین ساعت رویداد الزامی است', 'error');
      document.getElementById('eventTime').focus();
      return false;
    }
    
    return true;
  };

  /**
   * Test event
   */
  app.testEvent = async function(eventId = null) {
    try {
      let eventData;
      let context;
      
      if (eventId) {
        // Testing an existing event from the schedule
        const daySchedule = this.data?.schedules?.[this.currentDay] || [];
        const event = daySchedule.find(e => e.id === eventId);
        
        if (!event) {
          this.showNotification('رویداد یافت نشد', 'error');
          return;
        }

        if (!event.audioSequence || event.audioSequence.length === 0) {
          this.showNotification('این رویداد ترتیب صوتی برای آزمون ندارد', 'warning');
          return;
        }

        eventData = event;
        context = `Testing event: ${event.name}`;
      } else {
        // Testing event from form (during creation/editing)
        const data = this.getEventData();
        
        if (!this.validateEvent(data)) return;
        
        if (data.audioSequence.length === 0) {
          this.showNotification('برای آزمون، دست‌کم یک فایل صوتی بیفزایید', 'warning');
          return;
        }
        
        eventData = data;
        context = 'در حال آزمون رویداد…';
      }
      
      this.showNotification(context, 'info');
      this.setStatus('playing', 'در حال آزمون رویداد');
      
      await window.electronAPI.testEvent(this.currentDay, eventData);
      
      this.setStatus('ready', 'آماده');
      this.showNotification('آزمون انجام شد!', 'success');
      
    } catch (error) {
      console.error('آزمون ناموفق بود:', error);
      this.setStatus('error', 'آزمون ناموفق');
      this.showNotification(`Test failed: ${error.message}`, 'error');
    }
  };

  /**
   * Save event
   */
  app.saveEvent = async function() {
    try {
      const data = this.getEventData();
      
      if (!this.validateEvent(data)) return;
      
      this.showLoading(true);
      
      if (this.editingEventId) {
        await window.electronAPI.updateScheduleEvent(this.currentDay, this.editingEventId, data);
        this.showNotification('رویداد با موفقیت به‌روزرسانی شد!', 'success');
      } else {
        await window.electronAPI.addScheduleEvent(this.currentDay, data);
        this.showNotification('رویداد با موفقیت ذخیره شد!', 'success');
      }
      
      this.closeModal();
      this.showLoading(false);
      
      // Refresh schedule
      await this.loadData();
      this.updateSchedule();
      
    } catch (error) {
      console.error('ذخیره ناموفق بود:', error);
      this.showLoading(false);
      this.showNotification(`Save failed: ${error.message}`, 'error');
    }
  };

  /**
   * Edit event
   */
  app.editEvent = async function(eventId) {
    try {
      const daySchedule = this.data?.schedules?.[this.currentDay] || [];
      const event = daySchedule.find(e => e.id === eventId);
      
      if (!event) {
        this.showNotification('رویداد یافت نشد', 'error');
        return;
      }
      
      // Show form
      await this.showAddEventModal();
      
      // Populate with event data
      setTimeout(() => {
        document.getElementById('modalTitle').textContent = 'ویرایش رویداد';
        const eventNameInput = document.getElementById('eventName');
        eventNameInput.value = event.name;
        document.getElementById('eventTime').value = event.time.substring(0, 5); // HH:MM:SS to HH:MM
        document.getElementById('eventEnabled').checked = event.enabled !== false;
        document.getElementById('eventNotes').value = event.notes || '';
        
        // Focus and select the event name for easy editing
        eventNameInput.focus();
        eventNameInput.select();
        
        // Set audio sequence
        this.audioSequence = event.audioSequence ? [...event.audioSequence] : [];
        this.updateAudioDisplay();
        
        // Update button
        const saveBtn = document.querySelector('.btn-primary');
        saveBtn.textContent = 'به‌روزرسانی رویداد';
        
        this.editingEventId = eventId;
      }, 200);
      
    } catch (error) {
      console.error('Edit failed:', error);
      this.showNotification('Failed to load event', 'error');
    }
  };

  /**
   * Apply template modal
   */
  app.showApplyTemplateModal = async function() {
    try {
      const templates = await window.electronAPI.getTemplates();
      
      if (templates.length === 0) {
        this.showNotification('الگویی در دسترس نیست', 'warning');
        return;
      }
      
      const templatesList = templates.map(template => `
        <div class="template-option">
          <label>
            <input type="radio" name="template" value="${template.id}">
            <div class="template-info">
              <strong>${template.name}</strong>
              <span>${template.events?.length || 0} events</span>
            </div>
          </label>
        </div>
      `).join('');
      
      const content = `
        <div class="template-selector">
          <p><strong>Apply template to ${this.currentDay}:</strong></p>
          <div class="warning">⚠️ با این کار همه رویدادهای موجود جایگزین می‌شوند</div>
          <div class="templates-list">
            ${templatesList}
          </div>
        </div>
      `;
      
      const buttons = [
        { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'اعمال', class: 'btn btn-warning', onclick: () => this.applyTemplate() }
      ];
      
      this.showModal('اعمال الگو', content, buttons);
      
    } catch (error) {
      console.error('Template modal failed:', error);
      this.showNotification('بارگذاری الگوها ناموفق بود', 'error');
    }
  };

  /**
   * Apply selected template
   */
  app.applyTemplate = async function() {
    try {
      const selected = document.querySelector('input[name="template"]:checked');
      
      if (!selected) {
        this.showNotification('لطفاً یک الگو انتخاب کنید', 'warning');
        return;
      }
      
      const templates = await window.electronAPI.getTemplates();
      const template = templates.find(t => t.id === selected.value);
      
      if (!template) {
        this.showNotification('الگو یافت نشد', 'error');
        return;
      }
      
      const confirmed = confirm(`Apply "${template.name}" to ${this.currentDay}? This will replace all existing events.`);
      if (!confirmed) return;
      
      this.showLoading(true);
      
      // Clear existing events
      const currentEvents = this.data?.schedules?.[this.currentDay] || [];
      for (const event of currentEvents) {
        await window.electronAPI.deleteScheduleEvent(this.currentDay, event.id);
      }
      
      // Add template events
      if (template.events) {
        for (const event of template.events) {
          const newEvent = { ...event };
          delete newEvent.id; // Remove ID so new one is generated
          await window.electronAPI.addScheduleEvent(this.currentDay, newEvent);
        }
      }
      
      this.closeModal();
      this.showLoading(false);
      
      // Refresh
      await this.loadData();
      this.updateSchedule();
      
      this.showNotification(`Template "${template.name}" applied!`, 'success');
      
    } catch (error) {
      console.error('Apply template failed:', error);
      this.showLoading(false);
      this.showNotification('اعمال الگو ناموفق بود', 'error');
    }
  };

}
