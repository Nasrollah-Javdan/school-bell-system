const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const defaultSchedule = require('./default-schedule');

class DataManager {
  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'school-bell-data.json');
    this.backupPath = path.join(app.getPath('userData'), 'school-bell-backup.json');
    this.data = null;
    
    this.defaultData = {
      schedules: {
        sunday: [],
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: []
      },
      audioFiles: [],
      templates: [],
      settings: {
        volume: 80,
        audioPath: path.join(app.getPath('userData'), 'audio'),
        audioRepeatInterval: 3,
        logLevel: 'info',
        autoStart: true,
        maxLogEntries: 1000,
        theme: 'system'
      },
      logs: [],
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    };
  }

  async initialize() {
    try {
      await this.loadData();
      const migrationResult = await this.ensureAudioDirectorySetup();
      // The bundled bells ship with the app, so install them on every start.
      // Adding files never disturbs an existing schedule, which means an
      // upgraded install gains the bells too - not only a brand new one.
      const audioAdded = await this.installDefaultAudio();
      const seeded = await this.seedIfFirstRun();
      return { success: true, migrationResult, audioAdded, seeded };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Locate the audio files shipped with the installer.
   * process.cwd() is unreliable for a packaged app, so the resources folder
   * is checked first.
   */
  getBundledAudioPath() {
    const candidates = [
      app.isPackaged ? path.join(process.resourcesPath, 'audio') : null,
      path.join(__dirname, '../../audio')
    ].filter(Boolean);

    return candidates.find((dir) => {
      try {
        return require('fs').existsSync(dir);
      } catch {
        return false;
      }
    });
  }

  /**
   * Copy the bundled bell sounds into the user audio folder and register
   * them, so a fresh install already has working audio.
   * @returns {Promise<number>} number of files added
   */
  async installDefaultAudio() {
    const source = this.getBundledAudioPath();
    if (!source) return 0;

    const settings = this.getSettings();
    const target = settings.audioPath || path.join(app.getPath('userData'), 'audio');
    await fs.mkdir(target, { recursive: true });

    const names = Object.values(defaultSchedule.BELL_FILES);
    let added = 0;

    for (const filename of names) {
      const from = path.join(source, filename);
      const to = path.join(target, filename);
      try {
        await fs.access(from);
      } catch {
        continue;
      }

      const exists = await this.fileExists(to);
      if (!exists) {
        await fs.copyFile(from, to);
      }

      if (!this.data.audioFiles.some((f) => f.filename === filename)) {
        const stat = await fs.stat(to);
        this.data.audioFiles.push({
          id: `default-audio-${filename}`,
          filename,
          name: defaultSchedule.buildDefaultAudioFiles().find((a) => a.filename === filename)?.displayName || filename,
          displayName: defaultSchedule.buildDefaultAudioFiles().find((a) => a.filename === filename)?.displayName || filename,
          size: stat.size,
          uploadedAt: new Date().toISOString(),
          isDefault: true
        });
        added++;
      }
    }

    if (added > 0) {
      await this.saveData();
      this.logActivitySafe('default_audio_installed', `فایل‌های صوتی پیش‌فرض زنگ نصب شد (${added} فایل)`);
    }

    return added;
  }

  /**
   * Seed a fresh installation with the default school timetable.
   *
   * Only runs when the user has no events at all, so it can never overwrite
   * a schedule someone has already built.
   */
  async seedIfFirstRun() {
    const hasEvents = Object.values(this.data.schedules || {})
      .some((day) => Array.isArray(day) && day.length > 0);
    if (hasEvents) return false;

    const audioAdded = await this.installDefaultAudio();
    const schedule = defaultSchedule.buildDefaultSchedule();

    this.data.schedules = { ...this.data.schedules, ...schedule };
    await this.saveData();

    const total = Object.values(schedule).reduce((n, day) => n + day.length, 0);
    this.logActivitySafe(
      'default_schedule_seeded',
      `برنامه پیش‌فرض مدرسه ایجاد شد (${total} رویداد در ${defaultSchedule.SCHOOL_DAYS.length} روز)`
    );

    console.log(`Seeded default school schedule (${total} events, ${audioAdded} audio files)`);
    return true;
  }

  /**
   * Apply the default timetable to the given days (or all school days).
   * Existing events on those days are replaced.
   * @param {string[]} [days]
   */
  async applyDefaultSchedule(days = defaultSchedule.SCHOOL_DAYS) {
    await this.installDefaultAudio();

    const schedule = defaultSchedule.buildDefaultSchedule(days);
    for (const [day, events] of Object.entries(schedule)) {
      this.data.schedules[day] = events;
    }

    await this.saveData();
    const total = Object.values(schedule).reduce((n, d) => n + d.length, 0);
    this.logActivitySafe('default_schedule_applied', `برنامه پیش‌فرض روی ${days.length} روز اعمال شد (${total} رویداد)`);
    return { days, events: total };
  }

  /**
   * Snapshot everything into `backups/pre-reset-<stamp>/` before a destructive
   * change. Returns the folder path, or null if the snapshot failed.
   *
   * @param {string} [tag]
   * @returns {Promise<string|null>}
   */
  async createDatedBackup(tag = 'pre-reset') {
    const fsSync = require('fs');
    try {
      const userData = app.getPath('userData');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = path.join(userData, 'backups', `${tag}-${stamp}`);

      await fs.mkdir(backupDir, { recursive: true });

      for (const name of ['school-bell-data.json', 'school-bell-backup.json']) {
        const from = path.join(userData, name);
        if (fsSync.existsSync(from)) {
          await fs.copyFile(from, path.join(backupDir, name));
        }
      }

      const audioDir = path.join(userData, 'audio');
      if (fsSync.existsSync(audioDir)) {
        await fs.cp(audioDir, path.join(backupDir, 'audio'), { recursive: true });
      }

      return backupDir;
    } catch (error) {
      console.error('Dated backup failed:', error);
      return null;
    }
  }

  /**
   * Wipe every schedule, audio registration, template and log, then restore
   * the factory defaults so the app comes back the way it arrived.
   *
   * A backup is taken first - a reset that cannot be undone would be a poor
   * trade for a mis-click on a button labelled "delete everything".
   *
   * @returns {Promise<{backup: string|null, events: number, audio: number}>}
   */
  async resetAllData() {
    const backupPath = await this.createDatedBackup('pre-reset');

    this.data = this.freshDefaultData();
    await this.saveData();

    // Put the bundled bells and the school timetable back, so the app is
    // usable immediately rather than blank.
    await this.installDefaultAudio();
    await this.seedIfFirstRun();

    const events = Object.values(this.data.schedules)
      .reduce((n, day) => n + day.length, 0);

    console.log(`Data reset complete (${events} events restored, backup: ${backupPath})`);
    return { backup: backupPath, events, audio: this.data.audioFiles.length };
  }

  /**
   * Build a pristine data object.
   *
   * The result must not share any object with `this.defaultData`: updateSettings
   * mutates `data.settings` in place, and a shallow copy would let a user's
   * changes rewrite the factory defaults - making "reset" restore whatever the
   * user last set instead of the real defaults.
   *
   * @returns {object}
   */
  freshDefaultData() {
    return {
      schedules: Object.fromEntries(
        Object.keys(this.defaultData.schedules).map((day) => [day, []])
      ),
      audioFiles: [],
      templates: [],
      logs: [],
      settings: {
        ...this.defaultData.settings,
        audioPath: path.join(app.getPath('userData'), 'audio')
      },
      metadata: {
        version: this.defaultData.metadata.version,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    };
  }

  async loadData() {
    try {
      const dataExists = await this.fileExists(this.dataPath);
      
      if (dataExists) {
        const rawData = await fs.readFile(this.dataPath, 'utf8');
        this.data = JSON.parse(rawData);
        this.data = this.validateAndMigrateData(this.data);
      } else {
        this.data = this.freshDefaultData();
        await this.saveData();
      }
      
      return this.data;
    } catch (error) {
      if (await this.recoverFromBackup()) {
        return this.data;
      }
      
      this.data = this.freshDefaultData();
      return this.data;
    }
  }

  async saveData() {
    try {
      this.data.metadata.lastModified = new Date().toISOString();
      
      if (await this.fileExists(this.dataPath)) {
        await this.createBackupSafely();
      }
      
      await this.writeDataSafely();
      return true;
      
    } catch (error) {
      throw error;
    }
  }

  async writeDataSafely() {
    const dataJson = JSON.stringify(this.data, null, 2);
    
    try {
      const tempPath = this.dataPath + '.tmp';
      await fs.writeFile(tempPath, dataJson, 'utf8');
      await this.atomicRenameWithRetry(tempPath, this.dataPath);
      return;
    } catch (atomicError) {
      try {
        await this.directWriteWithLock(dataJson);
        return;
      } catch (directError) {
        try {
          await this.backupWrite(dataJson);
          return;
        } catch (backupError) {
          throw new Error(`Failed to save data: ${backupError.message}`);
        }
      }
    }
  }

  async backupWrite(dataJson) {
    try {
      const backupTempPath = this.backupPath + '.tmp';
      await fs.writeFile(backupTempPath, dataJson, 'utf8');
      
      if (await this.fileExists(this.backupPath)) {
        await fs.unlink(this.backupPath);
      }
      await fs.rename(backupTempPath, this.backupPath);
      await fs.copyFile(this.backupPath, this.dataPath);
    } catch (error) {
      throw error;
    }
  }

  async atomicRenameWithRetry(tempPath, finalPath, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (await this.fileExists(finalPath)) {
          await fs.unlink(finalPath);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        await fs.rename(tempPath, finalPath);
        return;
        
      } catch (error) {
        if (attempt === maxRetries) {
          try {
            await fs.unlink(tempPath);
          } catch (cleanupError) {
            // Silent cleanup failure
          }
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, attempt * 100));
      }
    }
  }

  async directWriteWithLock(dataJson, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const options = { 
          encoding: 'utf8',
          flag: process.platform === 'win32' ? 'w' : 'w'
        };
        
        await fs.writeFile(this.dataPath, dataJson, options);
        return;
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = Math.min(attempt * 100, 500);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async createBackupSafely() {
    try {
      if (!(await this.fileExists(this.dataPath))) {
        return;
      }

      if (await this.fileExists(this.backupPath)) {
        await fs.unlink(this.backupPath);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await fs.copyFile(this.dataPath, this.backupPath);
    } catch (error) {
      // Silent backup failure
    }
  }

  getData(section = null) {
    if (!this.data) {
      throw new Error('Data not initialized. Call initialize() first.');
    }
    
    if (section) {
      return this.data[section] || null;
    }
    
    return this.data;
  }

  getSchedule(day) {
    return this.getData('schedules')[day] || [];
  }
  
  getAllSchedules() {
    return this.getData('schedules');
  }
  
  async addScheduleEvent(day, event) {
    const schedules = this.getData('schedules');
    
    if (!event.id) {
      event.id = this.generateId();
    }
    
    event.createdAt = new Date().toISOString();
    event.updatedAt = new Date().toISOString();
    
    if (!schedules[day]) {
      schedules[day] = [];
    }
    
    schedules[day].push(event);
    schedules[day].sort((a, b) => a.time.localeCompare(b.time));
    
    await this.saveData();
    this.logActivitySafe('schedule_event_added', `Added event "${event.name}" to ${day}`);
    
    return event;
  }
  
  async updateScheduleEvent(day, eventId, updates) {
    const schedules = this.getData('schedules');
    const daySchedule = schedules[day];
    
    if (!daySchedule) {
      throw new Error(`No schedule found for ${day}`);
    }
    
    const eventIndex = daySchedule.findIndex(e => e.id === eventId);
    if (eventIndex === -1) {
      throw new Error(`Event ${eventId} not found in ${day} schedule`);
    }
    
    const updatedEvent = {
      ...daySchedule[eventIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    daySchedule[eventIndex] = updatedEvent;
    daySchedule.sort((a, b) => a.time.localeCompare(b.time));
    
    await this.saveData();
    this.logActivitySafe('schedule_event_updated', `Updated event "${updatedEvent.name}" on ${day}`);
    
    return updatedEvent;
  }
  
  async deleteScheduleEvent(day, eventId) {
    const schedules = this.getData('schedules');
    const daySchedule = schedules[day];
    
    if (!daySchedule) {
      throw new Error(`No schedule found for ${day}`);
    }
    
    const eventIndex = daySchedule.findIndex(e => e.id === eventId);
    if (eventIndex === -1) {
      throw new Error(`Event ${eventId} not found in ${day} schedule`);
    }
    
    const deletedEvent = daySchedule.splice(eventIndex, 1)[0];
    
    await this.saveData();
    this.logActivitySafe('schedule_event_deleted', `Deleted event "${deletedEvent.name}" from ${day}`);
    
    return deletedEvent;
  }

  getAudioFiles() {
    return this.getData('audioFiles');
  }
  
  async addAudioFile(audioFile) {
    const audioFiles = this.getData('audioFiles');
    
    if (!audioFile.id) {
      audioFile.id = this.generateId();
    }
    
    audioFile.uploadedAt = new Date().toISOString();
    audioFiles.push(audioFile);
    
    await this.saveData();
    this.logActivitySafe('audio_file_added', `Added audio file "${audioFile.name}"`);
    
    return audioFile;
  }
  
  async updateAudioFile(audioId, updates) {
    const audioFiles = this.getData('audioFiles');
    const audioIndex = audioFiles.findIndex(a => a.id === audioId);
    
    if (audioIndex === -1) {
      throw new Error(`Audio file ${audioId} not found`);
    }
    
    // Keep the original ID and creation timestamp
    const originalId = audioFiles[audioIndex].id;
    const originalCreatedAt = audioFiles[audioIndex].createdAt || audioFiles[audioIndex].uploadedAt;
    
    // Update the audio file data
    audioFiles[audioIndex] = {
      ...audioFiles[audioIndex],
      ...updates,
      id: originalId,
      createdAt: originalCreatedAt,
      updatedAt: new Date().toISOString()
    };
    
    await this.saveData();
    this.logActivitySafe('audio_file_updated', `Updated audio file "${audioFiles[audioIndex].name}"`);
    
    return audioFiles[audioIndex];
  }

  async deleteAudioFile(audioId) {
    const audioFiles = this.getData('audioFiles');
    const audioIndex = audioFiles.findIndex(a => a.id === audioId);
    
    if (audioIndex === -1) {
      throw new Error(`Audio file ${audioId} not found`);
    }
    
    const deletedAudio = audioFiles.splice(audioIndex, 1)[0];
    
    await this.saveData();
    this.logActivitySafe('audio_file_deleted', `Deleted audio file "${deletedAudio.name}"`);
    
    return deletedAudio;
  }

  getTemplates() {
    return this.getData('templates');
  }
  
  async addTemplate(template) {
    const templates = this.getData('templates');
    
    if (!template.id) {
      template.id = this.generateId();
    }
    
    template.createdAt = new Date().toISOString();
    templates.push(template);
    
    await this.saveData();
    this.logActivitySafe('template_added', `Added template "${template.name}"`);
    
    return template;
  }
  
  async deleteTemplate(templateId) {
    const templates = this.getData('templates');
    const templateIndex = templates.findIndex(t => t.id === templateId);
    
    if (templateIndex === -1) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const deletedTemplate = templates.splice(templateIndex, 1)[0];
    
    await this.saveData();
    this.logActivitySafe('template_deleted', `Deleted template "${deletedTemplate.name}"`);
    
    return deletedTemplate;
  }

  /**
   * Template Management Methods
   */
  
  // Get all templates
  getTemplates() {
    return this.getData('templates');
  }
  
  // Add template
  async addTemplate(template) {
    const templates = this.getData('templates');
    
    if (!template.id) {
      template.id = this.generateId();
    }
    
    template.createdAt = new Date().toISOString();
    
    templates.push(template);
    
    await this.saveData();
    this.logActivitySafe('template_added', `Added template "${template.name}"`);
    
    return template;
  }
  
  // Update template
  async updateTemplate(templateId, updates) {
    const templates = this.getData('templates');
    const templateIndex = templates.findIndex(t => t.id === templateId);
    
    if (templateIndex === -1) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Update template
    const updatedTemplate = {
      ...templates[templateIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    templates[templateIndex] = updatedTemplate;
    
    await this.saveData();
    this.logActivitySafe('template_updated', `Updated template "${updatedTemplate.name}"`);
    
    return updatedTemplate;
  }
  
  // Delete template
  async deleteTemplate(templateId) {
    const templates = this.getData('templates');
    const templateIndex = templates.findIndex(t => t.id === templateId);
    
    if (templateIndex === -1) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    const deletedTemplate = templates.splice(templateIndex, 1)[0];
    
    await this.saveData();
    this.logActivitySafe('template_deleted', `Deleted template "${deletedTemplate.name}"`);
    
    return deletedTemplate;
  }

  getSettings() {
    return this.getData('settings');
  }
  
  async updateSettings(updates) {
    const settings = this.getData('settings');
    Object.assign(settings, updates);
    
    await this.saveData();
    this.logActivitySafe('settings_updated', 'تنظیمات برنامه به‌روزرسانی شد');
    
    return settings;
  }

  getLogs(limit = 100) {
    const logs = this.getData('logs');
    return logs.slice(-limit);
  }
  
  logActivitySafe(type, message, details = null) {
    const logs = this.getData('logs');
    const settings = this.getSettings();
    
    const logEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    
    logs.push(logEntry);
    
    if (logs.length > settings.maxLogEntries) {
      logs.splice(0, logs.length - settings.maxLogEntries);
    }
  }
  
  async logActivity(type, message, details = null) {
    this.logActivitySafe(type, message, details);
    
    setImmediate(async () => {
      try {
        await this.saveData();
      } catch (error) {
        // Silent logging failure
      }
    });
  }
  
  async clearLogs() {
    this.data.logs = [];
    await this.saveData();
    this.logActivitySafe('logs_cleared', 'گزارش فعالیت‌ها پاک شد');
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async recoverFromBackup() {
    try {
      if (await this.fileExists(this.backupPath)) {
        const backupData = await fs.readFile(this.backupPath, 'utf8');
        this.data = JSON.parse(backupData);
        await this.saveData();
        this.logActivitySafe('data_recovered', 'داده‌ها از فایل پشتیبان بازیابی شد');
        return true;
      }
    } catch (error) {
      // Silent recovery failure
    }
    return false;
  }
  
  validateAndMigrateData(data) {
    // Start from a pristine copy, then layer the stored data on top. Building
    // it this way guarantees nothing shares an object with defaultData, which
    // would let in-place writes corrupt the factory defaults.
    const validatedData = this.freshDefaultData();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    days.forEach(day => {
      if (!Array.isArray(data?.schedules?.[day])) {
        validatedData.schedules[day] = [];
      } else {
        validatedData.schedules[day] = data.schedules[day];
      }
    });

    validatedData.settings = { ...this.defaultData.settings, ...(data?.settings || {}) };

    validatedData.audioFiles = Array.isArray(data?.audioFiles) ? data.audioFiles : [];
    validatedData.templates = Array.isArray(data?.templates) ? data.templates : [];
    validatedData.logs = Array.isArray(data?.logs) ? data.logs : [];

    validatedData.metadata = {
      version: data?.metadata?.version || this.defaultData.metadata.version,
      created: data?.metadata?.created || new Date().toISOString(),
      lastModified: data?.metadata?.lastModified || new Date().toISOString()
    };

    return validatedData;
  }
  
  async exportData() {
    return JSON.stringify(this.data, null, 2);
  }
  
  async importData(jsonData) {
    try {
      const importedData = JSON.parse(jsonData);
      this.data = this.validateAndMigrateData(importedData);
      await this.saveData();
      this.logActivitySafe('data_imported', 'داده‌ها از یک منبع بیرونی بازیابی شد');
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Ensure audio directory is properly set up in userData and migrate existing files
   */
  async ensureAudioDirectorySetup() {
    try {
      const settings = this.getSettings();
      const userDataAudioPath = path.join(app.getPath('userData'), 'audio');
      const installAudioPath = path.join(process.cwd(), 'audio');
      let migrationInfo = { migrated: false, fileCount: 0 };
      
      // Create userData audio directory if it doesn't exist
      await fs.mkdir(userDataAudioPath, { recursive: true });
      
      // Check if settings still point to installation directory
      if (settings.audioPath && settings.audioPath.includes(process.cwd())) {
        console.log('🔄 Migrating audio path from installation directory to userData');
        
        // Update settings to use userData directory
        await this.updateSettings({ audioPath: userDataAudioPath });
        
        // Migrate audio files from installation directory if they exist
        const migratedCount = await this.migrateAudioFiles(installAudioPath, userDataAudioPath);
        
        migrationInfo = { migrated: true, fileCount: migratedCount };
        this.logActivitySafe('audio_migration', 'فایل‌های صوتی به پوشه داده کاربر منتقل شد');
      } else if (!settings.audioPath || settings.audioPath === '') {
        // Set default path if not set
        await this.updateSettings({ audioPath: userDataAudioPath });
        console.log('📁 Set default audio path to userData directory');
      }

      // Ensure the current audio path exists
      if (settings.audioPath && !(await this.fileExists(settings.audioPath))) {
        await fs.mkdir(settings.audioPath, { recursive: true });
      }
      
      return migrationInfo;
    } catch (error) {
      console.error('Failed to setup audio directory:', error);
      // Don't throw - this is not critical for app startup
      return { migrated: false, fileCount: 0, error: error.message };
    }
  }

  /**
   * Migrate audio files from old location to new location
   */
  async migrateAudioFiles(sourcePath, targetPath) {
    try {
      // Check if source directory exists
      if (!(await this.fileExists(sourcePath))) {
        console.log('📂 No installation audio directory to migrate from');
        return;
      }

      const sourceFiles = await fs.readdir(sourcePath, { withFileTypes: true });
      let migratedCount = 0;

      for (const file of sourceFiles) {
        if (file.isFile()) {
          const sourceFile = path.join(sourcePath, file.name);
          const targetFile = path.join(targetPath, file.name);
          
          try {
            // Check if file already exists in target
            if (await this.fileExists(targetFile)) {
              console.log(`⏭️  Skipping ${file.name} - already exists in userData`);
              continue;
            }

            // Copy file to userData directory
            await fs.copyFile(sourceFile, targetFile);
            migratedCount++;
            console.log(`✅ Migrated: ${file.name}`);
            
          } catch (fileError) {
            console.warn(`⚠️  Failed to migrate ${file.name}:`, fileError.message);
          }
        }
      }

      if (migratedCount > 0) {
        console.log(`🎵 Successfully migrated ${migratedCount} audio files to userData directory`);
        this.logActivitySafe('audio_files_migrated', `Migrated ${migratedCount} audio files from installation directory`);
      }

      return migratedCount;
    } catch (error) {
      console.warn('Audio migration failed:', error.message);
      // Non-critical error - don't throw
      return 0;
    }
  }
}

module.exports = DataManager;