/**
 * School Bell System - renderer entry point
 *
 * Single, explicit bootstrap. Previously each feature file registered its own
 * `DOMContentLoaded` + `setTimeout` hook and guessed when `window.app` existed.
 * Now the modules are imported and composed here in a fixed order, so the
 * wiring is deterministic and failures surface immediately.
 */

import { SchoolBellApp } from './app.js';
import { HTML5AudioPlayer } from './html5-audio.js';
import { extendAppWithAudioMethods } from './audio.js';
import { extendAppWithScheduleMethods } from './schedule.js';
import { extendAppWithSettingsMethods } from './settings.js';
import { extendAppWithTemplateMethods } from './templates.js';
import { toast } from './toast.js';
import { theme } from './theme.js';

function bootstrap() {
  // Surface failures instead of silently rendering a broken shell
  window.addEventListener('error', (event) => {
    console.error('Renderer error:', event.error || event.message);
    toast.error('خطای غیرمنتظره‌ای رخ داد');
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    toast.error('خطای غیرمنتظره‌ای رخ داد');
  });

  // 1. Audio engine - available to everything else
  const audioPlayer = new HTML5AudioPlayer();
  window.html5AudioPlayer = audioPlayer;

  // 2. Core application shell
  const app = new SchoolBellApp();
  window.app = app;

  // 3. Feature modules, mixed in after the shell exists.
  //    Order matters only where two modules touch the same method name.
  extendAppWithScheduleMethods(app);
  extendAppWithAudioMethods(app);
  extendAppWithTemplateMethods(app);
  extendAppWithSettingsMethods(app);

  app.html5Audio = audioPlayer;

  // 4. Main-process notifications
  if (window.electronAPI) {
    window.electronAPI.onAudioNotification((event, notification) => {
      app.showNotification(notification.message, notification.type);
    });

    window.electronAPI.onScheduledAudio(async (event, eventData) => {
      if (!eventData?.audioSequence) {
        console.warn('رویداد زمان‌بندی‌شده ترتیب صوتی ندارد');
        return;
      }

      try {
        app.showNotification(`Playing: ${eventData.name}`, 'info');
        await audioPlayer.playAudioSequence(eventData.audioSequence);
        app.showNotification(`Completed: ${eventData.name}`, 'success');
      } catch (error) {
        console.error('پخش صدای زمان‌بندی‌شده ناموفق بود:', error);
        app.showNotification(`Scheduled audio failed: ${error.message}`, 'error');
      }
    });
  }

  // 5. Tear down cleanly
  window.addEventListener('beforeunload', () => app.cleanup());

  console.log('Renderer ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}