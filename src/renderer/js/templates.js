/**
 * Templates Management for School Bell System
 * Complete template creation, management, and application system
 */

// Extend the main app with template methods
export function extendAppWithTemplateMethods(app) {

  /**
   * Update templates view
   */
  app.updateTemplates = async function() {
    try {
      await this.loadData();
      this.renderTemplates();
    } catch (error) {
      console.error('Templates update failed:', error);
      this.showNotification('Failed to update templates', 'error');
    }
  };

  /**
   * Render templates grid
   */
  app.renderTemplates = function() {
    const templatesGrid = document.getElementById('templatesGrid');
    if (!templatesGrid) return;

    const templates = this.data?.templates || [];

    if (templates.length === 0) {
      templatesGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>هنوز الگویی ساخته نشده است</p>
          <p>Templates let you save common schedule patterns and reuse them across different days</p>
          <div class="empty-actions">
            <button class="btn btn-primary" onclick="app.showCreateTemplateModal()">
              ➕ Create Template
            </button>
            <button class="btn btn-outline" onclick="app.showImportTemplateModal()">
              📁 Import Template
            </button>
          </div>
        </div>
      `;
      return;
    }

    const templatesHTML = templates.map(template => {
      const eventCount = template.events?.length || 0;
      const lastUsed = template.lastUsed ? new Date(template.lastUsed).toLocaleDateString() : 'هرگز';
      
      return `
        <div class="template-card" data-id="${template.id}">
          <div class="template-header">
            <div class="template-info">
              <div class="template-name">${this.escapeHtml(template.name)}</div>
              <div class="template-description">${this.escapeHtml(template.description || '')}</div>
            </div>
            <div class="template-badge">${eventCount} events</div>
          </div>
          
          <div class="template-body">
            <div class="template-stats">
              <div class="stat-item">
                <span class="stat-label">ساخته‌شده:</span>
                <span class="stat-value">${new Date(template.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">آخرین استفاده:</span>
                <span class="stat-value">${lastUsed}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">دفعات استفاده:</span>
                <span class="stat-value">${template.useCount || 0}</span>
              </div>
            </div>
            
            ${eventCount > 0 ? `
              <div class="template-preview">
                <div class="preview-header">پیش‌نمایش برنامه:</div>
                <div class="preview-events">
                  ${template.events.slice(0, 3).map(event => `
                    <div class="preview-event">
                      <span class="preview-time">${event.time}</span>
                      <span class="preview-name">${this.escapeHtml(event.name)}</span>
                    </div>
                  `).join('')}
                  ${eventCount > 3 ? `
                    <div class="preview-more">+${eventCount - 3} more events</div>
                  ` : ''}
                </div>
              </div>
            ` : `
              <div class="template-empty">
                <span class="empty-text">این الگو رویدادی ندارد</span>
              </div>
            `}
          </div>
          
          <div class="template-actions">
            <button class="btn btn-sm btn-primary" 
                    onclick="app.showApplyTemplateModal('${template.id}')" 
                    title="اعمال در برنامه">
              📋 Apply
            </button>
            <button class="btn btn-sm btn-outline" 
                    onclick="app.previewTemplate('${template.id}')" 
                    title="پیش‌نمایش الگو">
              👁️ Preview
            </button>
            <button class="btn btn-sm btn-secondary" 
                    onclick="app.duplicateTemplate('${template.id}')" 
                    title="تکثیر الگو">
              📄 Duplicate
            </button>
            <button class="btn btn-sm btn-warning" 
                    onclick="app.exportTemplate('${template.id}')" 
                    title="خروجی گرفتن از الگو">
              💾 Export
            </button>
            <button class="btn btn-sm btn-danger" 
                    onclick="app.deleteTemplate('${template.id}')" 
                    title="حذف الگو">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    templatesGrid.innerHTML = templatesHTML;
  };

  /**
   * Show create template modal
   */
  app.showCreateTemplateModal = function() {
    const schedules = this.data?.schedules || {};
    const dayOptions = Object.keys(schedules)
      .filter(day => schedules[day].length > 0)
      .map(day => `
        <option value="${day}">${this.capitalizeFirst(day)} (${schedules[day].length} events)</option>
      `).join('');

    if (!dayOptions) {
      this.showNotification('برنامه‌ای برای ساخت الگو وجود ندارد. ابتدا چند رویداد بسازید!', 'warning');
      return;
    }

    const modalContent = `
      <div class="template-form-container">
        <form id="templateForm" class="template-form">
          
          <!-- Template Info -->
          <div class="form-group">
            <label for="templateName">نام الگو *</label>
            <input type="text" id="templateName" placeholder="مثلاً: روز عادی مدرسه" required>
            <div class="form-help">نامی گویا برای الگو بنویسید</div>
          </div>
          
          <div class="form-group">
            <label for="templateتوضیحات">توضیحات</label>
            <textarea id="templateتوضیحات" rows="3" placeholder="توضیح دهید این الگو چه زمانی و چگونه استفاده می‌شود…"></textarea>
            <div class="form-help">توضیح اختیاری برای شناسایی بهتر الگو</div>
          </div>
          
          <!-- Source Selection -->
          <div class="form-group">
            <label for="sourceDay">ساخت از برنامه موجود *</label>
            <select id="sourceDay" required>
              <option value="">روز مبدأ را انتخاب کنید…</option>
              ${dayOptions}
            </select>
            <div class="form-help">برنامه کدام روز به‌عنوان پایه الگو استفاده شود</div>
          </div>
          
          <!-- Preview Section -->
          <div class="form-group" id="previewSection" style="display: none;">
            <label>رویدادهای مورد نظر را انتخاب کنید:</label>
            <div class="events-preview" id="eventsPreview">
              <!-- Dynamic content -->
            </div>
            <div class="form-help">مشخص کنید کدام رویدادها در الگو قرار بگیرند</div>
          </div>
          
        </form>
      </div>
    `;

    const buttons = [
      { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: 'ساخت الگو', class: 'btn btn-primary', onclick: () => this.createTemplate() }
    ];

    this.showModal('ساخت الگوی زمان‌بندی', modalContent, buttons);
    
    setTimeout(() => this.initCreateTemplateForm(), 100);
  };

  /**
   * Initialize create template form
   */
  app.initCreateTemplateForm = function() {
    const sourceDay = document.getElementById('sourceDay');
    const previewSection = document.getElementById('previewSection');
    const eventsPreview = document.getElementById('eventsPreview');

    sourceDay.addEventListener('change', () => {
      const selectedDay = sourceDay.value;
      if (selectedDay) {
        const daySchedule = this.data.schedules[selectedDay] || [];
        
        previewSection.style.display = 'block';
        
        const eventsHTML = daySchedule.map(event => `
          <div class="event-preview-item">
            <label class="event-checkbox">
              <input type="checkbox" value="${event.id}" checked>
              <div class="event-preview-info">
                <div class="event-preview-time">${event.time}</div>
                <div class="event-preview-name">${this.escapeHtml(event.name)}</div>
                <div class="event-preview-details">
                  ${event.audioSequence?.length || 0} audio file(s)
                  ${event.enabled === false ? ' • Disabled' : ' • Enabled'}
                  ${event.notes ? ` • ${this.escapeHtml(event.notes)}` : ''}
                </div>
              </div>
            </label>
          </div>
        `).join('');
        
        eventsPreview.innerHTML = eventsHTML || '<div class="no-events">رویدادی یافت نشد</div>';
      } else {
        previewSection.style.display = 'none';
      }
    });
  };

  /**
   * Create template
   */
  app.createTemplate = async function() {
    try {
      const name = document.getElementById('templateName').value.trim();
      const description = document.getElementById('templateتوضیحات').value.trim();
      const sourceDay = document.getElementById('sourceDay').value;

      if (!name) {
        this.showNotification('وارد کردن نام الگو الزامی است', 'error');
        document.getElementById('templateName').focus();
        return;
      }

      if (!sourceDay) {
        this.showNotification('لطفاً یک روز مبدأ انتخاب کنید', 'error');
        return;
      }

      // Get selected events
      const checkboxes = document.querySelectorAll('#eventsPreview input[type="checkbox"]:checked');
      const selectedEventIds = Array.from(checkboxes).map(cb => cb.value);

      if (selectedEventIds.length === 0) {
        this.showNotification('دست‌کم یک رویداد را انتخاب کنید', 'error');
        return;
      }

      // Get source events
      const sourceEvents = this.data.schedules[sourceDay] || [];
      const selectedEvents = sourceEvents.filter(event => selectedEventIds.includes(event.id));

      // Create template data
      const templateData = {
        name,
        description,
        events: selectedEvents.map(event => {
          // Remove day-specific data but keep all event properties
          const templateEvent = { ...event };
          delete templateEvent.id; // Will get new IDs when applied
          return templateEvent;
        }),
        sourceDay,
        createdAt: new Date().toISOString(),
        useCount: 0
      };

      // Save template
      await window.electronAPI.addTemplate(templateData);
      
      this.closeModal();
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${name}" created successfully!`, 'success');
      
    } catch (error) {
      console.error('Failed to create template:', error);
      this.showNotification(`Failed to create template: ${error.message}`, 'error');
    }
  };

  /**
   * Show apply template modal
   */
  app.showApplyTemplateModal = async function(templateId = null) {
    try {
      const templates = this.data?.templates || [];
      
      if (templates.length === 0) {
        this.showNotification('الگویی در دسترس نیست', 'warning');
        return;
      }

      const selectedTemplate = templateId ? templates.find(t => t.id === templateId) : null;

      const templateOptions = templates.map(template => `
        <option value="${template.id}" ${template.id === templateId ? 'selected' : ''}>
          ${this.escapeHtml(template.name)} (${template.events?.length || 0} events)
        </option>
      `).join('');

      const modalContent = `
        <div class="apply-template-container">
          
          <!-- Template Selection -->
          <div class="form-group">
            <label for="templateSelect">انتخاب الگو</label>
            <select id="templateSelect">
              <option value="">یک الگو انتخاب کنید…</option>
              ${templateOptions}
            </select>
          </div>
          
          <!-- Template Preview -->
          <div class="template-preview-section" id="templatePreviewSection" style="display: none;">
            <div class="preview-header">پیش‌نمایش الگو:</div>
            <div class="template-preview-content" id="templatePreviewContent">
              <!-- Dynamic content -->
            </div>
          </div>
          
          <!-- Day Selection -->
          <div class="form-group">
            <label>اعمال در روزهای:</label>
            <div class="day-selection">
              <label class="day-checkbox"><input type="checkbox" value="monday"> دوشنبه</label>
              <label class="day-checkbox"><input type="checkbox" value="tuesday"> سه‌شنبه</label>
              <label class="day-checkbox"><input type="checkbox" value="wednesday"> چهارشنبه</label>
              <label class="day-checkbox"><input type="checkbox" value="thursday"> پنج‌شنبه</label>
              <label class="day-checkbox"><input type="checkbox" value="friday"> جمعه</label>
              <label class="day-checkbox"><input type="checkbox" value="saturday"> شنبه</label>
              <label class="day-checkbox"><input type="checkbox" value="sunday"> یکشنبه</label>
            </div>
            <div class="day-selection-helpers">
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectWeekdays()">روزهای کاری</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectWeekends()">روزهای تعطیل</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectAllDays()">همه روزها</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.clearDaySelection()">پاک کردن</button>
            </div>
          </div>
          
          <!-- Options -->
          <div class="form-group">
            <div class="apply-options">
              <label class="option-checkbox">
                <input type="checkbox" id="replaceExisting" checked>
                Replace existing events on selected days
              </label>
              <label class="option-checkbox">
                <input type="checkbox" id="enableEvents" checked>
                Enable all events when applying
              </label>
            </div>
          </div>
          
          <!-- Warning -->
          <div class="apply-warning">
            <strong>⚠️ هشدار:</strong> This will modify the selected day schedules. 
            If "Replace existing events" is checked, all current events on those days will be removed.
          </div>
          
        </div>
      `;

      const buttons = [
        { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'اعمال الگو', class: 'btn btn-primary', onclick: () => this.applySelectedTemplate() }
      ];

      this.showModal('اعمال الگوی زمان‌بندی', modalContent, buttons);
      
      setTimeout(() => {
        this.initApplyTemplateForm();
        if (selectedTemplate) {
          this.showTemplatePreview(selectedTemplate);
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to show apply template modal:', error);
      this.showNotification('Failed to load apply template form', 'error');
    }
  };

  /**
   * Initialize apply template form
   */
  app.initApplyTemplateForm = function() {
    const templateSelect = document.getElementById('templateSelect');
    
    templateSelect.addEventListener('change', () => {
      const templateId = templateSelect.value;
      if (templateId) {
        const template = this.data.templates.find(t => t.id === templateId);
        if (template) {
          this.showTemplatePreview(template);
        }
      } else {
        document.getElementById('templatePreviewSection').style.display = 'none';
      }
    });
  };

  /**
   * Show template preview
   */
  app.showTemplatePreview = function(template) {
    const previewSection = document.getElementById('templatePreviewSection');
    const previewContent = document.getElementById('templatePreviewContent');
    
    if (!template.events || template.events.length === 0) {
      previewContent.innerHTML = '<div class="no-events">این الگو رویدادی ندارد</div>';
    } else {
      const eventsHTML = template.events.map(event => `
        <div class="preview-event-item">
          <div class="preview-event-time">${event.time}</div>
          <div class="preview-event-name">${this.escapeHtml(event.name)}</div>
          <div class="preview-event-details">
            ${event.audioSequence?.length || 0} audio file(s)
            ${event.enabled === false ? ' • Will be disabled' : ' • Will be enabled'}
          </div>
        </div>
      `).join('');
      
      previewContent.innerHTML = eventsHTML;
    }
    
    previewSection.style.display = 'block';
  };

  /**
   * Day selection helpers
   */
  app.selectWeekdays = function() {
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    this.setDaySelection(weekdays);
  };

  app.selectWeekends = function() {
    const weekends = ['saturday', 'sunday'];
    this.setDaySelection(weekends);
  };

  app.selectAllDays = function() {
    const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    this.setDaySelection(allDays);
  };

  app.clearDaySelection = function() {
    this.setDaySelection([]);
  };

  app.setDaySelection = function(days) {
    const checkboxes = document.querySelectorAll('.day-checkbox input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = days.includes(checkbox.value);
    });
  };

  /**
   * Apply selected template
   */
  app.applySelectedTemplate = async function() {
    try {
      const templateId = document.getElementById('templateSelect').value;
      const replaceExisting = document.getElementById('replaceExisting').checked;
      const enableEvents = document.getElementById('enableEvents').checked;
      
      if (!templateId) {
        this.showNotification('لطفاً یک الگو انتخاب کنید', 'error');
        return;
      }

      // Get selected days
      const selectedDays = Array.from(document.querySelectorAll('.day-checkbox input[type="checkbox"]:checked'))
        .map(cb => cb.value);

      if (selectedDays.length === 0) {
        this.showNotification('دست‌کم یک روز را انتخاب کنید', 'error');
        return;
      }

      const template = this.data.templates.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('الگو یافت نشد', 'error');
        return;
      }

      // Confirm application
      const daysList = selectedDays.map(d => this.capitalizeFirst(d)).join(', ');
      const eventCount = template.events?.length || 0;
      
      const confirmMessage = `Apply "${template.name}" to ${daysList}?\n\n` +
        `This will ${replaceExisting ? 'replace all existing events' : 'add ' + eventCount + ' events'} ` +
        `on the selected days.\n\n` +
        `این عملیات قابل بازگشت نیست.`;

      if (!confirm(confirmMessage)) return;

      this.showLoading(true);
      let successCount = 0;

      for (const day of selectedDays) {
        try {
          // Clear existing events if requested
          if (replaceExisting) {
            const currentEvents = this.data.schedules[day] || [];
            for (const event of currentEvents) {
              await window.electronAPI.deleteScheduleEvent(day, event.id);
            }
          }

          // Add template events
          if (template.events) {
            for (const templateEvent of template.events) {
              const newEvent = {
                ...templateEvent,
                enabled: enableEvents ? true : (templateEvent.enabled !== false)
              };
              delete newEvent.id; // Remove ID so new one is generated
              
              await window.electronAPI.addScheduleEvent(day, newEvent);
            }
          }

          successCount++;
        } catch (error) {
          console.error(`Failed to apply template to ${day}:`, error);
          this.showNotification(`Failed to apply template to ${day}: ${error.message}`, 'error');
        }
      }

      this.closeModal();
      this.showLoading(false);

      // Refresh data and UI
      await this.loadData();
      this.updateSchedule();
      this.updateTemplates();

      if (successCount === selectedDays.length) {
        this.showNotification(`Template "${template.name}" applied successfully to ${successCount} day(s)!`, 'success');
      } else {
        this.showNotification(`Template applied to ${successCount} of ${selectedDays.length} days`, 'warning');
      }
      
    } catch (error) {
      console.error('Failed to apply template:', error);
      this.showLoading(false);
      this.showNotification(`Failed to apply template: ${error.message}`, 'error');
    }
  };

  /**
   * Preview template in modal
   */
  app.previewTemplate = function(templateId) {
    const template = this.data?.templates?.find(t => t.id === templateId);
    if (!template) {
      this.showNotification('الگو یافت نشد', 'error');
      return;
    }

    const eventCount = template.events?.length || 0;
    const eventsHTML = eventCount > 0 ? template.events.map(event => `
      <div class="preview-detail-item">
        <div class="preview-detail-time">${event.time}</div>
        <div class="preview-detail-content">
          <div class="preview-detail-name">${this.escapeHtml(event.name)}</div>
          <div class="preview-detail-info">
            ${event.audioSequence?.length || 0} audio file(s)
            ${event.enabled === false ? ' • Disabled' : ' • Enabled'}
            ${event.notes ? ` • ${this.escapeHtml(event.notes)}` : ''}
          </div>
          ${event.audioSequence?.length ? `
            <div class="preview-audio-list">
              ${event.audioSequence.map(audio => `
                <span class="audio-chip">${this.escapeHtml(audio.audioFile)}${audio.repeat > 1 ? ` ×${audio.repeat}` : ''}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('') : '<div class="no-events">این الگو رویدادی ندارد</div>';

    const modalContent = `
      <div class="template-preview-modal">
        
        <div class="preview-header-section">
          <h4>${this.escapeHtml(template.name)}</h4>
          ${template.description ? `<p class="preview-description">${this.escapeHtml(template.description)}</p>` : ''}
        </div>
        
        <div class="preview-stats-section">
          <div class="preview-stat">
            <span class="stat-label">رویدادها:</span>
            <span class="stat-value">${eventCount}</span>
          </div>
          <div class="preview-stat">
            <span class="stat-label">ساخته‌شده:</span>
            <span class="stat-value">${new Date(template.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="preview-stat">
            <span class="stat-label">استفاده‌شده در:</span>
            <span class="stat-value">${template.useCount || 0} times</span>
          </div>
          ${template.lastUsed ? `
            <div class="preview-stat">
              <span class="stat-label">آخرین استفاده:</span>
              <span class="stat-value">${new Date(template.lastUsed).toLocaleDateString()}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="preview-events-section">
          <h5>رویدادهای زمان‌بندی:</h5>
          <div class="preview-events-list">
            ${eventsHTML}
          </div>
        </div>
        
      </div>
    `;

    const buttons = [
      { text: 'بستن', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: 'اعمال الگو', class: 'btn btn-primary', onclick: () => { this.closeModal(); this.showApplyTemplateModal(templateId); } }
    ];

    this.showModal(`Template Preview - ${template.name}`, modalContent, buttons);
  };

  /**
   * Duplicate template
   */
  app.duplicateTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('الگو یافت نشد', 'error');
        return;
      }

      const duplicateData = {
        name: `${template.name} (Copy)`,
        description: template.description,
        events: template.events ? [...template.events] : [],
        sourceDay: template.sourceDay,
        createdAt: new Date().toISOString(),
        useCount: 0
      };

      await window.electronAPI.addTemplate(duplicateData);
      
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template duplicated as "${duplicateData.name}"`, 'success');
      
    } catch (error) {
      console.error('Failed to duplicate template:', error);
      this.showNotification('Failed to duplicate template', 'error');
    }
  };

  /**
   * Export template
   */
  app.exportTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('الگو یافت نشد', 'error');
        return;
      }

      const exportData = {
        name: template.name,
        description: template.description,
        events: template.events,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `template-${template.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(link.href);
      
      this.showNotification(`Template "${template.name}" exported successfully`, 'success');
      
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('خروجی گرفتن از الگو ناموفق بود', 'error');
    }
  };

  /**
   * Show import template modal
   */
  app.showImportTemplateModal = function() {
    const modalContent = `
      <div class="import-template-container">
        
        <div class="import-header">
          <h4>📁 بازیابی الگوی زمان‌بندی</h4>
          <p>یک فایل الگوی خروجی‌گرفته‌شده را بازیابی کنید</p>
        </div>
        
        <div class="import-area" id="importDragArea">
          <div class="import-icon">📋</div>
          <div class="import-text">فایل الگو را اینجا رها کنید یا برای انتخاب کلیک کنید</div>
          <div class="import-subtext">تنها فایل‌های JSON</div>
          <input type="file" id="templateFileInput" accept=".json" style="display: none;">
        </div>
        
        <div class="import-info">
          <strong>📋 فایل‌های پشتیبانی‌شده:</strong>
          <ul>
            <li>فایل‌های JSON خروجی‌گرفته‌شده از الگو</li>
            <li>الگوهای سایر نصب‌های سامانه زنگ مدرسه</li>
          </ul>
        </div>
        
      </div>
    `;

    const buttons = [
      { text: 'انصراف', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: '📁 Browse Files', class: 'btn btn-primary', onclick: () => document.getElementById('templateFileInput').click() }
    ];

    this.showModal('بازیابی الگو', modalContent, buttons);
    
    setTimeout(() => this.setupTemplateImport(), 100);
  };

  /**
   * Setup template import functionality
   */
  app.setupTemplateImport = function() {
    const dragArea = document.getElementById('importDragArea');
    const fileInput = document.getElementById('templateFileInput');
    
    if (!dragArea || !fileInput) return;

    dragArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleTemplateFile(e.target.files[0]));

    ['dragenter', 'dragover'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dragArea.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dragArea.classList.remove('drag-over');
      });
    });

    dragArea.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) this.handleTemplateFile(file);
    });
  };

  /**
   * Handle template file import
   */
  app.handleTemplateFile = async function(file) {
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      this.showNotification('لطفاً یک فایل JSON انتخاب کنید', 'error');
      return;
    }

    try {
      const text = await this.readFileAsText(file);
      const templateData = JSON.parse(text);

      // Validate template data
      if (!templateData.name || !Array.isArray(templateData.events)) {
        throw new Error('قالب فایل الگو نامعتبر است');
      }

      // Create template
      const newTemplate = {
        name: templateData.name,
        description: templateData.description || '',
        events: templateData.events,
        importedAt: new Date().toISOString(),
        useCount: 0
      };

      await window.electronAPI.addTemplate(newTemplate);
      
      this.closeModal();
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${templateData.name}" imported successfully!`, 'success');
      
    } catch (error) {
      console.error('Import failed:', error);
      this.showNotification(`Failed to import template: ${error.message}`, 'error');
    }
  };

  /**
   * Delete template with confirmation
   */
  app.deleteTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('الگو یافت نشد', 'error');
        return;
      }

      const confirmMessage = `Delete template "${template.name}"?\n\n` +
        `This template has been used ${template.useCount || 0} times.\n\n` +
        `این عملیات قابل بازگشت نیست.`;

      if (!confirm(confirmMessage)) return;

      await window.electronAPI.deleteTemplate(templateId);
      
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${template.name}" deleted successfully`, 'success');
      
    } catch (error) {
      console.error('Failed to delete template:', error);
      this.showNotification(`Failed to delete template: ${error.message}`, 'error');
    }
  };

  /**
   * Utility functions
   */
  
  app.readFileAsText = function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

}
