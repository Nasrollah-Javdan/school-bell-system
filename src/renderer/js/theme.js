/**
 * School Bell System - Theme management
 *
 * Resolves the effective theme from the user's preference ('light' | 'dark' |
 * 'system'), reflects it onto <html data-theme> and keeps the Settings
 * selector, the sidebar toggle button and the OS in sync.
 */

const STORAGE_KEY = 'sbs.theme';
const VALID = new Set(['light', 'dark', 'system']);

const ICONS = {
  light: '☀️',
  dark: '🌙',
  system: '🖥️'
};

const LABELS = {
  light: 'پوسته روشن',
  dark: 'پوسته تیره',
  system: 'پوسته سیستم‌عامل'
};

class ThemeManager {
  constructor() {
    this.preference = 'system';
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    this.onChange = null;
  }

  init() {
    // 1. Stored preference (renderer-local cache)
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }

    // 2. Fall back to the persisted app setting
    if (!VALID.has(stored)) {
      stored = this.readSettingFromStore();
    }

    this.preference = VALID.has(stored) ? stored : 'system';

    // Paint before anything else can flash
    this.apply();

    // React to OS changes while the preference is 'system'
    this.mql.addEventListener('change', () => {
      if (this.preference === 'system') this.apply();
    });

    this.bindControls();
    return this;
  }

  readSettingFromStore() {
    if (!window.electronAPI) return null;
    try {
      const settings = window.electronAPI.getCachedSettings?.();
      return settings?.theme ?? null;
    } catch {
      return null;
    }
  }

  /** Resolve preference -> concrete theme name. */
  resolve() {
    if (this.preference !== 'system') return this.preference;
    return this.mql.matches ? 'dark' : 'light';
  }

  apply() {
    const resolved = this.resolve();
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
    this.syncControls();
    if (typeof this.onChange === 'function') this.onChange(resolved);
  }

  /**
   * Set the theme preference.
   * @param {'light'|'dark'|'system'} value
   * @param {{persist?: boolean}} [options]
   */
  set(value, options = {}) {
    const next = VALID.has(value) ? value : 'system';
    this.preference = next;

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* storage may be unavailable */ }

    this.apply();

    if (options.persist !== false) this.persist(next);
    return next;
  }

  async persist(value) {
    if (!window.electronAPI?.updateSettings) return;
    try {
      await window.electronAPI.updateSettings({ theme: value });
    } catch (error) {
      console.warn('Could not persist theme preference:', error);
    }
  }

  /** Cycle light -> dark -> system. */
  cycle() {
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.preference) + 1) % order.length];
    return this.set(next);
  }

  bindControls() {
    const select = document.getElementById('themeSelect');
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeToggleIcon');

    if (select) {
      select.value = this.preference;
      select.addEventListener('change', (event) => this.set(event.target.value));
    }

    if (toggle) {
      toggle.addEventListener('click', () => this.cycle());
    }

    this.toggleButton = toggle;
    this.toggleIcon = icon;
    this.syncControls();
  }

  syncControls() {
    const resolved = this.resolve();

    if (this.toggleIcon) {
      this.toggleIcon.textContent = ICONS[this.preference];
    }

    if (this.toggleButton) {
      // Label reflects the theme that is actually in effect right now
      this.toggleButton.title = `${LABELS[this.preference]} (active: ${resolved})`;
      this.toggleButton.setAttribute(
        'aria-label',
        `Theme: ${this.preference}. Click to switch.`
      );
    }

    const select = document.getElementById('themeSelect');
    if (select && select.value !== this.preference) select.value = this.preference;
  }
}

export const theme = new ThemeManager();
export default theme;