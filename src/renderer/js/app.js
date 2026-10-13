import { toast } from './toast.js';
import { theme } from './theme.js';
import { escapeHtml, capitalizeFirst, formatTimeUntil } from './utils.js';
import {
  DAY_KEYS, DAY_NAMES_FA, toPersianDigits, formatNumber, formatDateFa,
  formatTimeUntilFa, countFa
} from './fa.js';

/**
 * School Bell App - core application shell.
 *
 * Feature-specific behaviour is mixed in by the sibling modules
 * (audio / schedule / templates / settings) from `main.js`.
 */
export class SchoolBellApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.currentDay = null; // Will be set to current day when schedule is first loaded
    this.data = null;
    this.isLoading = false;
    this.audioStatusInterval = null;
    this.nextEventInterval = null;
    this.currentModalClosable = true; // Track if current modal can be closed
    this.lastFocusedElement = null; // Element focused before a modal opened
    this.clockInterval = null;

    this.elements = {
      navTabs: document.querySelectorAll('.nav-tab'),
      tabContents: document.querySelectorAll('.tab-content'),
      dayTabs: document.querySelectorAll('.day-tab'),
      currentTime: document.getElementById('currentTime'),
      statusIndicator: document.getElementById('statusIndicator'),
      loadingOverlay: document.getElementById('loadingOverlay'),
      modalOverlay: document.getElementById('modalOverlay'),
      modal: document.getElementById('modal'),
      modalTitle: document.getElementById('modalTitle'),
      modalBody: document.getElementById('modalBody'),
      modalFooter: document.getElementById('modalFooter'),
      modalClose: document.getElementById('modalClose'),
      modalCancel: document.getElementById('modalCancel'),
      modalConfirm: document.getElementById('modalConfirm'),
      nextEventHeader: document.getElementById('nextEventHeader'),
      nextEventInfo: document.getElementById('nextEventInfo'),
      themeToggle: document.getElementById('themeToggle'),
      appVersion: document.getElementById('appVersion')
    }

    this.init();
  }

  async init() {
    try {
      toast.init();
      theme.init();
      this.setupEventListeners();
      this.startClock();
      this.renderVersion();

      await this.loadData();
      this.switchTab('dashboard');
      this.updateDashboard();
      this.setStatus('ready', 'آماده');
      this.startAudioStatusMonitoring();
      this.startNextEventMonitoring();
    } catch (error) {
      console.error('App initialization failed:', error);
      this.setStatus('error', 'خطا');
      toast.error('راه‌اندازی برنامه با خطا مواجه شد');
    }
  }

  /**
   * Display the running application version in the sidebar footer.
   */
  renderVersion() {
    const el = this.elements.appVersion;
    if (!el) return;
    const version = window.electronAPI?.appVersion || '';
    el.textContent = version ? `v${version}` : '';
  }

  setupEventListeners() {
    this.elements.navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });

      // Roving-tabindex keyboard navigation (WAI-ARIA tabs pattern)
      tab.addEventListener('keydown', (e) => this.handleTablistKeydown(e, this.elements.navTabs, 'tab'));
    });

    this.elements.dayTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const day = e.currentTarget.dataset.day;
        this.switchDay(day);
      });

      tab.addEventListener('keydown', (e) => this.handleTablistKeydown(e, this.elements.dayTabs, 'day'));
    });

    // Modal controls
    this.elements.modalClose.addEventListener('click', () => this.closeModal());
    this.elements.modalCancel.addEventListener('click', () => this.closeModal());

    this.setupButtonEventListeners();

    if (window.electronAPI) {
      window.electronAPI.onMenuAction((event, action) => {
        this.handleMenuAction(action);
      });
    }

    // Auto-update status feed -> Settings update card + toast
    if (window.electronAPI?.updater?.onStatus) {
      this.unsubscribeUpdate = window.electronAPI.updater.onStatus((payload) => {
        if (typeof this.applyUpdateStatus === 'function') {
          this.applyUpdateStatus(payload);
        }

        if (payload.status === 'error') {
          this.showNotification(payload.message, 'warning');
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      this.handleKeyboard(e);
    });
  }

  /**
   * Left/right arrow navigation across a tablist, Home/End to jump to the ends.
   * @param {KeyboardEvent} e
   * @param {NodeList} tabs
   * @param {'tab'|'day'} datasetKey
   */
  handleTablistKeydown(e, tabs, datasetKey) {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;

    const items = Array.from(tabs);
    const currentIndex = items.indexOf(e.currentTarget);
    if (currentIndex === -1) return;

    e.preventDefault();

    let nextIndex = currentIndex;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
    }

    const next = items[nextIndex];
    next.focus();

    const key = datasetKey === 'tab' ? 'tab' : 'day';
    if (key === 'tab') this.switchTab(next.dataset.tab);
    else this.switchDay(next.dataset.day);
  }

  setupButtonEventListeners() {
    const buttons = [
      { id: 'addEventBtn', action: () => this.switchTab('schedule') },
      { id: 'addScheduleEventBtn', action: () => this.showAddEventModal() },
      { id: 'addFirstEventBtn', action: () => this.showAddEventModal() },
      { id: 'applyTemplateBtn', action: () => this.showApplyTemplateModal() },
      { id: 'loadDefaultScheduleBtn', action: () => this.showLoadDefaultScheduleModal() },
      { id: 'uploadAudioBtn', action: () => this.showUploadAudioModal() },
      { id: 'uploadFirstAudioBtn', action: () => this.showUploadAudioModal() },
      { id: 'createTemplateBtn', action: () => this.showCreateTemplateModal() },
      { id: 'createFirstTemplateBtn', action: () => this.showCreateTemplateModal() },
      { id: 'clearLogsBtn', action: () => this.showClearLogsModal() },
      { id: 'exportLogsBtn', action: () => this.exportLogs() },
      { id: 'themeToggle', action: () => theme.cycle() }
    ];

    buttons.forEach(({ id, action }) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', action);
      }
    });
  }

  async loadData() {
    try {
      this.data = await window.electronAPI.getData();
    } catch (error) {
      console.error('Failed to load data:', error);
      throw error;
    }
  }

  switchTab(tabName) {
    this.elements.navTabs.forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    this.elements.tabContents.forEach(content => {
      const isActive = content.id === tabName;
      content.classList.toggle('active', isActive);
      // `hidden` keeps inactive panels out of the accessibility tree and
      // prevents tabbing into them.
      content.hidden = !isActive;
    });

    this.currentTab = tabName;

    const updateMethods = {
      'dashboard': () => this.updateDashboard(),
      'schedule': () => this.updateSchedule(),
      'audio': () => this.updateAudioLibrary(),
      'templates': () => this.updateTemplates(),
      'logs': () => this.updateLogs(),
      'settings': () => this.updateSettings()
    };

    const updateMethod = updateMethods[tabName];
    if (updateMethod) {
      updateMethod();
    }
  }

  switchDay(day) {
    this.elements.dayTabs.forEach(tab => {
      const isActive = tab.dataset.day === day;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    this.currentDay = day;
    this.updateScheduleDay();
  }

  /**
   * Start the header clock and keep it in sync with the tab content.
   */
  startClock() {
    this.updateTime();
    this.clockInterval = setInterval(() => this.updateTime(), 1000);
  }

  stopClock() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const el = this.elements.currentTime;
    if (!el) return;

    el.textContent = timeString;
    el.dateTime = now.toISOString();
    el.title = formatDateFa(now, { withTime: false });
  }

  getCurrentDayName() {
    return DAY_KEYS[new Date().getDay()];
  }

  /** Persian display name for a day key. */
  dayLabel(dayKey) {
    return DAY_NAMES_FA[dayKey] || '';
  }

  setStatus(type, message) {
    const statusElement = this.elements.statusIndicator;
    if (!statusElement) return;

    const dot = statusElement.querySelector('.status-dot');
    const text = statusElement.querySelector('.status-text');

    if (dot) {
      // Colour comes from CSS keyed off data-status - no inline styles
      dot.dataset.status = type || 'ready';
    }

    if (text) text.textContent = message;
  }

  showLoading(show) {
    this.isLoading = show;
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.toggle('active', show);
    }
  }

  /**
   * Show a modal dialog.
   * @param {string} title
   * @param {string} content - Trusted HTML markup for the dialog body
   * @param {Array<{text: string, class?: string, onclick?: Function}>} [buttons]
   * @param {boolean} [closable]
   * @param {string} [cssClass]
   */
  showModal(title, content, buttons = null, closable = true, cssClass = null) {
    if (!this.elements.modalOverlay) return;

    this.elements.modalTitle.textContent = title;
    this.elements.modalBody.innerHTML = content;

    const modal = document.getElementById('modal');
    if (modal) {
      modal.className = 'modal';
      if (cssClass) modal.classList.add(cssClass);
    }

    const closeButton = this.elements.modalClose;
    if (closeButton) {
      closeButton.style.display = closable ? 'grid' : 'none';
      closeButton.tabIndex = closable ? 0 : -1;
    }

    if (buttons) {
      this.elements.modalFooter.innerHTML = '';
      buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = button.class || 'btn btn-secondary';
        btn.textContent = button.text;
        btn.onclick = button.onclick;
        this.elements.modalFooter.appendChild(btn);
      });
    } else {
      this.elements.modalFooter.innerHTML = `
        <button class="btn btn-secondary" type="button" onclick="app.closeModal()">انصراف</button>
        <button class="btn btn-primary" type="button" onclick="app.closeModal()">OK</button>
      `;
    }

    // Remember where focus came from so it can be restored on close
    this.lastFocusedElement = document.activeElement;
    this.currentModalClosable = closable;

    this.elements.modalOverlay.classList.add('active');

    // Click outside to dismiss, only when allowed
    this.elements.modalOverlay.onclick = null;
    if (closable) {
      this.elements.modalOverlay.onclick = (e) => {
        if (e.target === this.elements.modalOverlay) {
          this.closeModal();
        }
      };
    }

    this.focusFirstModalControl();
  }

  /**
   * Focus the first meaningful control inside the dialog.
   *
   * Must not depend solely on requestAnimationFrame: Chromium does not run rAF
   * for a hidden or fully occluded window, which would leave focus stranded on
   * <body> and break keyboard use. A timer fallback covers that case.
   */
  focusFirstModalControl() {
    if (!this.elements.modal) return;

    const preferred = this.elements.modalBody.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    const closeVisible = this.elements.modalClose &&
      this.elements.modalClose.style.display !== 'none';
    const fallback = closeVisible ? this.elements.modalClose : this.elements.modal;

    const target = preferred || fallback;

    const applyFocus = () => {
      if (!target || typeof target.focus !== 'function') return;
      if (this.elements.modalOverlay?.classList.contains('active') !== true) return;
      target.focus();
      if (target.tagName === 'INPUT' && typeof target.select === 'function') {
        target.select();
      }
    };

    applyFocus();
    requestAnimationFrame(applyFocus);
    setTimeout(applyFocus, 60);
  }

  /**
   * Keep Tab focus inside the open dialog.
   */
  handleModalFocusTrap(e) {
    if (e.key !== 'Tab') return;
    if (!this.elements.modalOverlay?.classList.contains('active')) return;

    const focusables = Array.from(
      this.elements.modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  closeModal() {
    if (!this.elements.modalOverlay) return;

    // Respect dialogs that opt out of being dismissed
    if (!this.currentModalClosable) {
      return;
    }

    this.elements.modalOverlay.classList.remove('active');
    this.elements.modalOverlay.onclick = null;
    this.currentModalClosable = true;

    // Reset transient editing state
    this.editingEventId = null;
    this.audioSequence = [];

    // Return focus to whatever opened the dialog
    const previous = this.lastFocusedElement;
    this.lastFocusedElement = null;
    if (previous && typeof previous.focus === 'function' && previous.isConnected) {
      previous.focus();
    }
  }

  /**
   * Convenience wrapper - delegates to the toast manager.
   */
  showNotification(message, type = 'info') {
    return toast.show(message, type);
  }

  async updateDashboard() {
    try {
      await this.loadData();
      this.updateTodaySchedule();
      this.updateSystemStatus();
      this.updateNextEvent();
    } catch (error) {
      console.error('Dashboard update failed:', error);
      this.showNotification('به‌روزرسانی داشبورد ناموفق بود', 'error');
    }
  }

  updateTodaySchedule() {
    const today = new Date().getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayFull = dayNames[today];
    const todaySchedule = this.data?.schedules?.[todayFull] || [];
    
    const scheduleElement = document.getElementById('todaySchedule');
    const badgeElement = document.getElementById('todayBadge');
    
    if (!scheduleElement || !badgeElement) return;

    badgeElement.textContent = countFa(todaySchedule.length, 'رویداد');

    if (todaySchedule.length === 0) {
      scheduleElement.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <p>امروز رویدادی زمان‌بندی نشده است</p>
        </div>
      `;
      return;
    }

    const scheduleHTML = todaySchedule.map(event => `
      <div class="schedule-preview-item">
        <div class="preview-time">${event.time}</div>
        <div class="preview-name">${this.escapeHtml(event.name)}</div>
        <div class="preview-status ${event.enabled ? 'enabled' : 'disabled'}">
          ${event.enabled ? '●' : '○'}
        </div>
      </div>
    `).join('');

    scheduleElement.innerHTML = scheduleHTML;
  }

  updateSystemStatus() {
    const templateCount = this.data?.templates?.length || 0;
    const totalEvents = Object.values(this.data?.schedules || {})
      .reduce((total, day) => total + day.length, 0);
    const systemVolume = this.data?.settings?.volume || 80;

    const updates = [
      { id: 'templateCount', value: formatNumber(templateCount) },
      { id: 'totalEvents', value: formatNumber(totalEvents) },
      { id: 'systemVolume', value: `${toPersianDigits(systemVolume)}٪` },
      { id: 'schedulerStatus', value: 'فعال' }
    ];

    updates.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  async updateNextEvent() {
    try {
      const nextEvents = await window.electronAPI.getNextEvents(1);
      const nextEventDisplay = document.getElementById('nextEventDisplay');
      const nextEventBadge = document.getElementById('nextEventBadge');
      
      if (!nextEventDisplay || !nextEventBadge) return;

      if (!nextEvents || nextEvents.length === 0) {
        nextEventDisplay.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">⏰</span>
            <p>رویدادی در پیش نیست</p>
          </div>
        `;
        nextEventBadge.textContent = 'ندارد';
        this.updateNextEventHeader(null);
        return;
      }

      const nextEvent = nextEvents[0];
      const eventDate = new Date(nextEvent.date);
      const timeUntil = formatTimeUntilFa(nextEvent.timeUntil);
      
      nextEventDisplay.innerHTML = `
        <div class="next-event-item">
          <div class="next-event-item__header">
            <div class="next-event-name">${this.escapeHtml(nextEvent.name)}</div>
            <div class="next-event-time">${nextEvent.time}</div>
          </div>
          <div class="next-event-details">
            <div class="next-event-day">${this.dayLabel(nextEvent.day)}</div>
            <div class="next-event-countdown">${timeUntil}</div>
          </div>
          <div class="next-event-date">${formatDateFa(eventDate)}</div>
        </div>
      `;
      
      nextEventBadge.textContent = timeUntil;
      this.updateNextEventHeader(nextEvent);
      
    } catch (error) {
      console.error('Failed to update next event:', error);
    }
  }

  updateNextEventHeader(nextEvent) {
    const nextEventInfo = this.elements.nextEventInfo;
    if (!nextEventInfo) return;

    if (!nextEvent) {
      nextEventInfo.textContent = 'رویدادی در پیش نیست';
      nextEventInfo.className = 'next-event-info no-events';
      return;
    }

    const timeUntil = formatTimeUntilFa(nextEvent.timeUntil);
    nextEventInfo.innerHTML = `
      <span class="next-event-name-header">${this.escapeHtml(nextEvent.name)}</span>
      <span class="next-event-time-header">${nextEvent.time}</span>
      <span class="next-event-countdown-header">${timeUntil}</span>
    `;
    nextEventInfo.className = 'next-event-info has-event';
  }

  formatTimeUntil(seconds) {
    return formatTimeUntil(seconds);
  }

  startNextEventMonitoring() {
    if (this.nextEventInterval) {
      clearInterval(this.nextEventInterval);
    }
    
    this.nextEventInterval = setInterval(async () => {
      if (this.currentTab === 'dashboard') {
        await this.updateNextEvent();
      } else {
        try {
          const nextEvents = await window.electronAPI.getNextEvents(1);
          this.updateNextEventHeader(nextEvents?.[0] || null);
        } catch (error) {
        }
      }
    }, 30000);
  }

  stopNextEventMonitoring() {
    if (this.nextEventInterval) {
      clearInterval(this.nextEventInterval);
      this.nextEventInterval = null;
    }
  }

  async updateSchedule() {
    try {
      await this.loadData();
      
      // If no current day is set, default to current day of the week
      if (!this.currentDay) {
        this.switchDay(this.getCurrentDayName());
      } else {
        // Make sure the correct day tab is highlighted
        this.elements.dayTabs.forEach(tab => {
          tab.classList.toggle('active', tab.dataset.day === this.currentDay);
        });
        this.updateScheduleDay();
      }
    } catch (error) {
      console.error('Schedule update failed:', error);
      this.showNotification('به‌روزرسانی برنامه هفتگی ناموفق بود', 'error');
    }
  }

  updateScheduleDay() {
    const scheduleDay = document.getElementById('scheduleDay');
    if (!scheduleDay) return;

    const daySchedule = this.data?.schedules?.[this.currentDay] || [];

    // Per-day counters are refreshed on every render, including the empty case
    this.updateDayTabCounts();

    if (daySchedule.length === 0) {
      scheduleDay.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <p>No events scheduled for ${this.escapeHtml(this.capitalizeFirst(this.currentDay || ''))}</p>
          <button class="btn btn-outline" onclick="app.showAddEventModal()">افزودن نخستین رویداد</button>
        </div>
      `;
      return;
    }

    const scheduleHTML = daySchedule.map(event => `
      <article class="schedule-event ${event.enabled ? '' : 'disabled'}" data-event-id="${event.id}">
        <div class="event-info">
          <div class="event-time">${this.escapeHtml(event.time)}</div>
          <div class="event-name">${this.escapeHtml(event.name)}</div>
          <div class="event-details">
            ${event.audioSequence?.length || 0} audio file(s)
            ${event.enabled ? '' : ' &middot; <span class="disabled-text">غیرفعال</span>'}
          </div>
        </div>
        <div class="event-actions">
          <button class="btn btn-sm btn-success" onclick="app.testEvent('${event.id}')" title="آزمون رویداد">
            ▶️ Test
          </button>
          <button class="btn btn-sm btn-outline" onclick="app.editEvent('${event.id}')" title="ویرایش رویداد">
            ✏️ Edit
          </button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteEvent('${event.id}')" title="حذف رویداد">
            🗑️ Delete
          </button>
        </div>
        <div class="event-audio">
          ${event.audioSequence?.length ? `
            <div class="audio-files">
              ${event.audioSequence.map(audio => `
                <span class="audio-tag" title="${this.escapeHtml(audio.audioFile)}">
                  🎵 ${this.escapeHtml(audio.audioFile)}
                  ${audio.repeat > 1 ? `<span class="audio-repeat">${audio.repeat}&times;</span>` : ''}
                </span>
              `).join('')}
            </div>
          ` : `
            <div class="no-audio-message">
              ⚠️ هیچ فایل صوتی انتخاب نشده است &mdash; this event will not play any sound
            </div>
          `}
        </div>
      </article>
    `).join('');

    scheduleDay.innerHTML = scheduleHTML;
  }

  /**
   * Show how many events each day tab holds, and flag today.
   */
  updateDayTabCounts() {
    const schedules = this.data?.schedules || {};
    const today = this.getCurrentDayName();

    this.elements.dayTabs.forEach(tab => {
      const day = tab.dataset.day;
      const count = schedules[day]?.length || 0;

      let badge = tab.querySelector('.day-tab__count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'day-tab__count';
        tab.appendChild(badge);
      }
      badge.textContent = count > 0 ? countFa(count, 'رویداد') : 'بدون رویداد';

      if (day === today) {
        tab.dataset.today = 'true';
        tab.title = `${this.dayLabel(day)} (امروز)`;
      } else {
        delete tab.dataset.today;
      }
    });
  }

  async updateLogs() {
    try {
      const logs = await window.electronAPI.getLogs(100);
      this.renderLogs(logs);
    } catch (error) {
      console.error('Logs update failed:', error);
      this.showNotification('به‌روزرسانی گزارش‌ها ناموفق بود', 'error');
    }
  }

  renderLogs(logs) {
    const logsList = document.getElementById('logsList');
    if (!logsList) return;

    if (logs.length === 0) {
      logsList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📝</span>
          <p>هنوز فعالیتی ثبت نشده است</p>
        </div>
      `;
      return;
    }

    // Newest first, and never mutate the array returned by IPC
const logsHTML = [...logs].reverse().map(log => `
      <div class="log-item">
        <div class="log-content">
          <div class="log-type" data-type="${this.escapeHtml(log.type)}">${this.escapeHtml(log.type.replace(/_/g, ' '))}</div>
          <div class="log-message">${this.escapeHtml(log.message)}</div>
          ${log.details ? `<div class="log-details">${this.escapeHtml(log.details)}</div>` : ''}
        </div>
        <div class="log-time">${new Date(log.timestamp).toLocaleString()}</div>
      </div>
    `).join('');

    logsList.innerHTML = logsHTML;
  }

  handleMenuAction(action) {
    const actions = {
      'new-event': () => {
        this.switchTab('schedule');
        this.showAddEventModal();
      },
      'upload-audio': () => {
        this.switchTab('audio');
        this.showUploadAudioModal();
      },
      'today-schedule': () => this.switchTab('dashboard'),
      'weekly-view': () => this.switchTab('schedule'),
      'audio-library': () => this.switchTab('audio')
    };

    const actionHandler = actions[action];
    if (actionHandler) {
      actionHandler();
    }
  }

  handleKeyboard(e) {
    // A non-closable dialog must not be escaped
    if (!this.currentModalClosable && e.key === 'Escape') {
      e.preventDefault();
      return;
    }

    // Keep keyboard focus inside an open dialog
    this.handleModalFocusTrap(e);

    const modalOpen = this.elements.modalOverlay?.classList.contains('active');
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    const shortcuts = [
      { keys: ['ctrlKey', 'n'], action: () => { this.switchTab('schedule'); this.showAddEventModal(); } },
      { keys: ['ctrlKey', 'u'], action: () => { this.switchTab('audio'); this.showUploadAudioModal(); } },
      { keys: ['ctrlKey', 't'], action: () => this.switchTab('dashboard') },
      { keys: ['ctrlKey', 'w'], action: () => this.switchTab('schedule') },
      { keys: ['ctrlKey', 'l'], action: () => this.switchTab('audio') }
    ];

    // Don't hijack browser-style editing keys while the user is typing
    if (!(modalOpen || isTyping)) {
      shortcuts.forEach(({ keys, action }) => {
        const isMatch = keys.every(key => {
          if (key === 'ctrlKey') return e.ctrlKey || e.metaKey;
          return e.key === key.replace('Key', '').toLowerCase();
        });

        if (isMatch) {
          e.preventDefault();
          action();
        }
      });

      // Alt+1..6 jump straight to a section
      const tabNames = ['dashboard', 'schedule', 'audio', 'templates', 'logs', 'settings'];
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        this.switchTab(tabNames[Number(e.key) - 1]);
      }
    }

    if (e.key === 'Escape' && this.currentModalClosable) {
      this.closeModal();
    }
  }

  async testAudioFile(filename) {
    try {
      console.log('App.js: Testing audio file:', filename);
      this.showNotification(`Playing: ${filename}`, 'info');
      this.setStatus('playing', 'در حال پخش');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(false);
      }
      
      // Use HTML5 audio player for consistent behavior
      let result;
      if (window.html5AudioPlayer) {
        try {
          result = await window.html5AudioPlayer.playAudio(filename);
          console.log('HTML5 audio playback started for:', filename);
          
          // Wait for audio to complete or be stopped
          await this.waitForAudioCompletion(filename);
        } catch (html5Error) {
          console.warn('پخش داخلی ناموفق بود؛ استفاده از پخش‌کننده سامانه:', html5Error.message);
          if (this.showNotification) {
            this.showNotification(`پخش داخلی ناموفق بود؛ از پخش‌کننده سامانه استفاده می‌شود…`, 'warning');
          }
          
          // Fallback to main process audio player
          result = await window.electronAPI.testAudio(filename);
        }
      } else {
        // Fallback to main process audio player
        result = await window.electronAPI.testAudio(filename);
      }
      
      this.setStatus('ready', 'آماده');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(true);
      }
      
      if (result && result.success) {
        if (result.stopped) {
          this.showNotification(`Audio stopped: ${filename}`, 'info');
        } else {
          this.showNotification(`Audio completed: ${filename}`, 'success');
        }
      }
      
    } catch (error) {
      console.error('App.js: Audio test failed:', error);
      this.handleAudioError(error, 'audio test');
    }
  }

  waitForAudioCompletion(filename) {
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
  }

  async stopAllAudio() {
    try {
      // Stop HTML5 audio player first
      if (window.html5AudioPlayer && window.html5AudioPlayer.isAudioPlaying()) {
        await window.html5AudioPlayer.stopAudio();
        console.log('HTML5 audio stopped');
      }
      
      // Also stop main process audio for compatibility
      await window.electronAPI.stopAllAudio();
      this.setStatus('ready', 'آماده');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(true);
      }
      
      this.showNotification('همه صداها متوقف شد', 'info');
    } catch (error) {
      console.error('Failed to stop audio:', error);
      this.showNotification('توقف صدا ناموفق بود', 'error');
    }
  }

  setAudioControlsState(enabled) {
    const playButtons = document.querySelectorAll(
      '.audio-file__controls .btn-success, .event-actions .btn-success'
    );
    playButtons.forEach(button => {
      button.disabled = !enabled;
      button.classList.toggle('loading', !enabled);
    });
  }

  handleAudioError(error, context = 'audio operation') {
    console.error(`Audio error in ${context}:`, error);
    
    this.setStatus('error', 'خطای صوتی');
    if (this.setAudioControlsState) {
      this.setAudioControlsState(true);
    }
    
    let userMessage = `${context} failed`;
    
    if (error.message) {
      if (error.message.includes('not found') || error.message.includes('ENOENT')) {
        userMessage += ' - Audio file not found';
      } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
        userMessage += ' - Permission denied (check file permissions)';
      } else if (error.message.includes('format') || error.message.includes('codec')) {
        userMessage += ' - Unsupported audio format';
      } else if (error.message.includes('device') || error.message.includes('audio')) {
        userMessage += ' - Audio device issue (check speakers/headphones)';
      } else {
        userMessage += `: ${error.message}`;
      }
    }
    
    this.showNotification(userMessage, 'error');
    return userMessage;
  }

  async checkAudioSystemStatus() {
    try {
      const status = await window.electronAPI.getAudioStatus();
      
      if (status.isPlaying) {
        this.setStatus('playing', 'Audio Playing');
      } else if (status.isTesting) {
        this.setStatus('playing', 'Testing Audio');
      } else {
        this.setStatus('ready', 'آماده');
      }
      
      return status;
    } catch (error) {
      console.error('Failed to check audio status:', error);
      return null;
    }
  }

  startAudioStatusMonitoring() {
    if (this.audioStatusInterval) {
      clearInterval(this.audioStatusInterval);
    }
    
    this.audioStatusInterval = setInterval(async () => {
      await this.checkAudioSystemStatus();
    }, 2000);
  }

  stopAudioStatusMonitoring() {
    if (this.audioStatusInterval) {
      clearInterval(this.audioStatusInterval);
      this.audioStatusInterval = null;
    }
  }


  /**
   * Ask the user to confirm a destructive action, using the in-app dialog
   * rather than the blocking native `confirm()`.
   * @returns {Promise<boolean>}
   */
  confirmAction({ title, message, confirmText = 'تأیید', danger = true }) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const buttons = [
        { text: 'انصراف', class: 'btn btn-secondary', onclick: () => { settle(false); this.closeModal(); } },
        {
          text: confirmText,
          class: danger ? 'btn btn-danger' : 'btn btn-primary',
          onclick: () => { settle(true); this.closeModal(); }
        }
      ];

      this.showModal(
        title,
        `<div class="confirm-dialog">
           <div class="confirm-dialog__icon" aria-hidden="true">${danger ? '??' : '?'}</div>
           <p>${message}</p>
         </div>`,
        buttons,
        true
      );

      // Resolve false if the dialog is dismissed some other way
      const observer = new MutationObserver(() => {
        if (!this.elements.modalOverlay.classList.contains('active')) {
          observer.disconnect();
          settle(false);
        }
      });
      observer.observe(this.elements.modalOverlay, { attributes: true, attributeFilter: ['class'] });
    });
  }

  async deleteEvent(eventId) {
    try {
      const daySchedule = this.data?.schedules?.[this.currentDay] || [];
      const event = daySchedule.find(e => e.id === eventId);

      if (!event) {
        this.showNotification('رویداد یافت نشد', 'error');
        return;
      }

      const dayLabel = this.capitalizeFirst(this.currentDay || '');
      const confirmed = await this.confirmAction({
        title: 'حذف رویداد',
        message: `Delete <strong>${this.escapeHtml(event.name)}</strong> at
                  <strong>${this.escapeHtml(event.time)}</strong> on ${dayLabel}?
                  <br><br>This cannot be undone.`,
        confirmText: 'حذف رویداد'
      });

      if (!confirmed) return;

      this.showNotification('در حال حذف رویداد…', 'info');

      await window.electronAPI.deleteScheduleEvent(this.currentDay, eventId);
      
      await this.loadData();
      this.updateSchedule();
      
      this.showNotification(`Event "${event.name}" deleted successfully`, 'success');
      
    } catch (error) {
      console.error('Failed to delete event:', error);
      
      let errorMessage = 'حذف رویداد ناموفق بود';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      this.showNotification(errorMessage, 'error');
      
      try {
        await this.loadData();
        this.updateSchedule();
      } catch (reloadError) {
        console.error('Failed to reload data after delete error:', reloadError);
        this.showNotification('لطفاً برنامه را دوباره باز کنید تا داده‌ها هماهنگ شوند', 'warning');
      }
    }
  }

  /**
   * Delegates to the shared utility so escaping rules live in one place.
   */
  escapeHtml(text) {
    return escapeHtml(text);
  }

  capitalizeFirst(str) {
    return capitalizeFirst(str);
  }

  showClearLogsModal() {
    const modalContent = `
      <div class="confirm-dialog">
        <p>آیا از پاک کردن همه گزارش‌های فعالیت مطمئن هستید؟</p>
        <p><strong>این عملیات قابل بازگشت نیست.</strong></p>
      </div>
    `;

    const buttons = [
      {
        text: 'انصراف',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: 'پاک کردن گزارش‌ها',
        class: 'btn btn-danger',
        onclick: () => this.confirmClearLogs()
      }
    ];

    this.showModal('پاک کردن گزارش فعالیت‌ها', modalContent, buttons);
  }

  async confirmClearLogs() {
    try {
      await window.electronAPI.clearLogs();
      this.closeModal();
      this.updateLogs();
      this.showNotification('گزارش فعالیت‌ها با موفقیت پاک شد', 'success');
    } catch (error) {
      console.error('Failed to clear logs:', error);
      this.showNotification('پاک کردن گزارش‌ها ناموفق بود', 'error');
    }
  }

  async exportLogs() {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: 'خروجی گرفتن از گزارش‌ها',
        defaultPath: `school-bell-logs-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'فایل‌های JSON', extensions: ['json'] },
          { name: 'فایل‌های متنی', extensions: ['txt'] },
          { name: 'همه فایل‌ها', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePath) {
        const logs = await window.electronAPI.getLogs(1000);
        const logsData = JSON.stringify(logs, null, 2);
        this.showNotification('خروجی گرفتن از گزارش‌ها آغاز شد', 'info');
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      this.showNotification('خروجی گرفتن از گزارش‌ها ناموفق بود', 'error');
    }
  }

  cleanup() {
    this.stopAudioStatusMonitoring();
    this.stopNextEventMonitoring();
    this.stopClock();
    if (window.electronAPI && window.electronAPI.removeMenuActionListener) {
      window.electronAPI.removeMenuActionListener();
    }
    if (window.electronAPI && window.electronAPI.removeAudioNotificationListener) {
      window.electronAPI.removeAudioNotificationListener();
    }
  }
}