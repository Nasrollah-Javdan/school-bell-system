/**
 * School Bell System - Toast notifications
 *
 * All toasts are appended to a single stacking container so that simultaneous
 * notifications never overlap. Each toast supports hover-to-pause, manual
 * dismissal and an auto-dismiss progress bar.
 */

const TYPE_META = {
  success: { icon: '✅', duration: 3500 },
  error: { icon: '❌', duration: 6000 },
  warning: { icon: '⚠️', duration: 5000 },
  info: { icon: 'ℹ️', duration: 4000 }
};

const MAX_VISIBLE = 4;

class ToastManager {
  constructor() {
    this.container = null;
    this.liveRegion = null;
    this.active = [];
    this.timers = new WeakMap();
  }

  init() {
    this.container = document.getElementById('toastContainer');
    this.liveRegion = document.getElementById('liveRegion');
    return this;
  }

  /**
   * Show a toast.
   * @param {string} message - Plain text. Never inserted as HTML.
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {{duration?: number}} [options] - duration of 0 keeps it until dismissed
   */
  show(message, type = 'info', options = {}) {
    if (!this.container) this.init();
    if (!this.container) return null;

    const meta = TYPE_META[type] || TYPE_META.info;
    const duration = typeof options.duration === 'number' ? options.duration : meta.duration;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = meta.icon;

    const content = document.createElement('div');
    content.className = 'toast__content';

    const text = document.createElement('div');
    text.className = 'toast__message';
    text.textContent = message;
    content.appendChild(text);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast__close';
    closeBtn.setAttribute('aria-label', 'بستن پیام');
    closeBtn.innerHTML = '&times;';

    toast.append(icon, content, closeBtn);

    if (duration > 0) {
      const progress = document.createElement('span');
      progress.className = 'toast__progress';
      progress.style.animationDuration = `${duration}ms`;
      toast.appendChild(progress);
    }

    this.container.appendChild(toast);
    this.active.push(toast);

    // Announce to assistive tech
    if (this.liveRegion) this.liveRegion.textContent = message;

    closeBtn.addEventListener('click', () => this.dismiss(toast));

    // Hover / focus pauses the countdown
    const pause = () => {
      toast.classList.add('toast--paused');
      const t = this.timers.get(toast);
      if (t) t.pause();
    };
    const resume = () => {
      toast.classList.remove('toast--paused');
      const t = this.timers.get(toast);
      if (t) t.resume();
    };

    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', resume);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', resume);

    // Animate in on the next frame so the transition actually runs
    requestAnimationFrame(() => toast.classList.add('show'));

    if (duration > 0) {
      const timer = this.createPauseableTimer(duration, () => this.dismiss(toast));
      this.timers.set(toast, timer);
    }

    this.trim();

    return toast;
  }

  /**
   * Pause-aware timeout used for auto-dismiss.
   */
  createPauseableTimer(duration, onDone) {
    const state = { startedAt: Date.now(), remaining: duration, handle: null, done: false };

    const start = () => {
      state.startedAt = Date.now();
      state.handle = setTimeout(onDone, state.remaining);
    };

    start();

    return {
      pause() {
        if (state.handle) clearTimeout(state.handle);
        state.remaining -= Date.now() - state.startedAt;
      },
      resume() {
        if (state.done) return;
        if (state.remaining <= 0) {
          onDone();
          return;
        }
        start();
      },
      cancel() {
        state.done = true;
        if (state.handle) clearTimeout(state.handle);
      }
    };
  }

  /** Remove a toast with an exit animation. */
  dismiss(toast) {
    if (!toast || !toast.isConnected) return;

    const timer = this.timers.get(toast);
    if (timer) timer.cancel();

    toast.classList.add('leaving');
    toast.classList.remove('show', 'toast--paused');

    const remove = () => {
      if (toast.isConnected) toast.remove();
      this.active = this.active.filter((t) => t !== toast);
    };

    toast.addEventListener('transitionend', remove, { once: true });
    // Safety net if the transition never fires
    setTimeout(remove, 600);
  }

  /** Keep the stack from growing without bound. */
  trim() {
    while (this.active.length > MAX_VISIBLE) {
      const oldest = this.active[0];
      if (!oldest) break;
      this.dismiss(oldest);
      // dismiss() removes asynchronously, so drop it eagerly to avoid looping
      this.active.shift();
    }
  }

  dismissAll() {
    [...this.active].forEach((t) => this.dismiss(t));
  }

  success(message, options) { return this.show(message, 'success', options); }
  error(message, options) { return this.show(message, 'error', options); }
  warning(message, options) { return this.show(message, 'warning', options); }
  info(message, options) { return this.show(message, 'info', options); }
}

export const toast = new ToastManager();
export default toast;