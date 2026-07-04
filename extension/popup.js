// FakeNewsDecter Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Status Indicator elements
  const statusIndicator = document.querySelector('.status-indicator');
  const statusModeText = document.getElementById('status-mode');
  const quickToggleBtn = document.getElementById('quick-toggle');
  const protectionStatusDesc = document.getElementById('protection-status-desc');

  // Stats elements
  const statScanned = document.getElementById('stat-scanned');
  const statFake = document.getElementById('stat-fake');
  const statDeepfake = document.getElementById('stat-deepfake');
  const barFake = document.getElementById('bar-fake');
  const barDeepfake = document.getElementById('bar-deepfake');

  // Settings elements
  const settingScan = document.getElementById('setting-scan');
  const settingHighlight = document.getElementById('setting-highlight');
  const settingBadge = document.getElementById('setting-badge');
  const btnClearStats = document.getElementById('btn-clear-stats');

  const cardFake = document.querySelector('.stat-card.flagged-fake');
  const cardDeepfake = document.querySelector('.stat-card.flagged-deepfake');

  // Logs elements
  const logList = document.getElementById('log-list');
  const logCount = document.getElementById('log-count');
  const emptyLogsView = document.getElementById('empty-logs-view');

  // Modal elements
  const logModal = document.getElementById('log-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalClose = document.getElementById('modal-close');
  const modalLogList = document.getElementById('modal-log-list');

  // --- Initialize ---
  function init() {
    loadSettings();
    loadStats();
    loadLogs();
    setupTabNavigation();
    setupEventListeners();
    setupMessageListener();
  }

  // --- Tab Navigation ---
  function setupTabNavigation() {
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        button.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });
  }

  // --- Load Data from Storage ---
  function loadSettings() {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || { realTimeScan: true, highlightBorder: true, insertBadge: true };
      
      settingScan.checked = settings.realTimeScan;
      settingHighlight.checked = settings.highlightBorder;
      settingBadge.checked = settings.insertBadge;
      
      updateStatusUI(settings.realTimeScan);
    });
  }

  function loadStats() {
    chrome.storage.local.get('stats', (result) => {
      const stats = result.stats || { scanned: 0, fakeNewsCount: 0, deepfakeCount: 0 };
      renderStats(stats);
    });
  }

  function getActiveTabUrl(callback) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        callback(tabs[0].url);
      } else {
        callback(null);
      }
    });
  }

  function cleanUrl(url) {
    if (!url) return '';
    // Strip query parameters and hash fragments
    let clean = url.split('?')[0].split('#')[0].trim().toLowerCase();
    
    // Normalize local file URLs (handles file://localhost/ vs file:///)
    if (clean.startsWith('file:')) {
      clean = clean.replace(/^file:\/\/(localhost)?\/?/, 'file:///');
    }
    return clean;
  }

  function loadLogs() {
    getActiveTabUrl((activeUrl) => {
      chrome.storage.local.get('logs', (result) => {
        const logs = result.logs || [];
        if (activeUrl) {
          const cleanedActive = cleanUrl(activeUrl);
          const filtered = logs.filter(log => cleanUrl(log.url) === cleanedActive);
          renderLogs(filtered);
        } else {
          renderLogs(logs);
        }
      });
    });
  }

  // --- Render Functions ---
  function renderStats(stats) {
    statScanned.textContent = stats.scanned;
    statFake.textContent = stats.fakeNewsCount;
    statDeepfake.textContent = stats.deepfakeCount;

    // Calculate percentage widths for progress bars
    const total = stats.scanned || 1; // Prevent division by zero
    const fakePercent = Math.min((stats.fakeNewsCount / total) * 100, 100);
    const deepfakePercent = Math.min((stats.deepfakeCount / total) * 100, 100);

    barFake.style.width = `${fakePercent}%`;
    barDeepfake.style.width = `${deepfakePercent}%`;
  }

  function renderLogs(logs) {
    // Clear old items except empty state view
    const items = logList.querySelectorAll('.log-item');
    items.forEach(item => item.remove());

    logCount.textContent = `${logs.length}개`;

    if (logs.length === 0) {
      emptyLogsView.style.display = 'flex';
      return;
    }

    emptyLogsView.style.display = 'none';

    // Sort: isMain first, then by timestamp descending
    logs.sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return b.timestamp - a.timestamp;
    });

    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = `log-item ${log.type === 'fake' ? 'log-fake' : 'log-deepfake'}`;
      
      const badgeText = log.type === 'fake' ? 'FAKE NEWS' : 'DEEPFAKE';
      
      const mainTagHtml = log.isMain 
        ? `<span class="log-main-badge">본문 콘텐츠</span>` 
        : `<span class="log-sub-badge">추천/피드</span>`;

      let counterEvidenceHtml = '';
      if (log.counterEvidence && log.counterEvidence.length > 0) {
        counterEvidenceHtml = `
          <div class="log-counter-evidence" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.08); font-size: 10px; color: #a7f3d0; line-height: 1.4;">
            <strong style="display: block; margin-bottom: 3px; color: #34d399;">대비 의견 / 신뢰 정보:</strong>
            ${log.counterEvidence.map(ce => `
              <div style="margin-bottom: 4px;">
                <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 4px; border-radius: 4px; font-weight: 700; color: #10b981; margin-right: 4px;">${escapeHTML(ce.source)}</span>
                <span>${escapeHTML(ce.content)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      item.innerHTML = `
        <div class="log-item-header">
          <div>
            ${mainTagHtml}
            <span class="log-platform">${escapeHTML(log.platform)}</span>
          </div>
          <span class="log-score-badge">${badgeText} ${log.score}%</span>
        </div>
        <div class="log-title">${escapeHTML(log.title)}</div>
        <div class="log-reason">${escapeHTML(log.reason)}</div>
        ${counterEvidenceHtml}
        <div class="log-time">${formatTime(log.timestamp)}</div>
      `;
      item.addEventListener('click', () => {
        chrome.tabs.create({ url: log.url });
      });
      logList.appendChild(item);
    });
  }

  function updateStatusUI(isActive) {
    if (isActive) {
      statusIndicator.classList.remove('disabled');
      statusModeText.textContent = '보호 중';
      quickToggleBtn.textContent = '실시간 스캔 일시 정지';
      quickToggleBtn.className = 'btn btn-gradient';
      protectionStatusDesc.textContent = '인터넷 서핑 중 실시간으로 유해/허위 피드를 추적하고 있습니다.';
    } else {
      statusIndicator.classList.add('disabled');
      statusModeText.textContent = '일시 정지';
      quickToggleBtn.textContent = '실시간 스캔 시작';
      quickToggleBtn.className = 'btn btn-gradient paused';
      protectionStatusDesc.textContent = '실시간 스캔이 중단되었습니다. 웹페이지의 가짜뉴스를 식별할 수 없습니다.';
    }
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Settings checkboxes
    settingScan.addEventListener('change', () => {
      saveSetting('realTimeScan', settingScan.checked);
      updateStatusUI(settingScan.checked);
    });

    settingHighlight.addEventListener('change', () => {
      saveSetting('highlightBorder', settingHighlight.checked);
    });

    settingBadge.addEventListener('change', () => {
      saveSetting('insertBadge', settingBadge.checked);
    });

    // Quick toggle on main tab
    quickToggleBtn.addEventListener('click', () => {
      const newState = !settingScan.checked;
      settingScan.checked = newState;
      saveSetting('realTimeScan', newState);
      updateStatusUI(newState);
    });

    // Reset statistics & logs
    btnClearStats.addEventListener('click', () => {
      if (confirm('정말로 모든 스캔 통계와 차단 기록을 초기화하시겠습니까?')) {
        const emptyStats = { scanned: 0, fakeNewsCount: 0, deepfakeCount: 0 };
        chrome.storage.local.set({ stats: emptyStats, logs: [] }, () => {
          renderStats(emptyStats);
          renderLogs([]);
          alert('초기화가 완료되었습니다.');
        });
      }
    });

    // Stat card clicks to open detail modal
    cardFake.addEventListener('click', () => {
      openModal('fake');
    });

    cardDeepfake.addEventListener('click', () => {
      openModal('deepfake');
    });

    // Modal close listeners
    modalClose.addEventListener('click', () => {
      logModal.classList.remove('active');
    });

    logModal.addEventListener('click', (e) => {
      if (e.target === logModal) {
        logModal.classList.remove('active');
      }
    });
  }

  // Save settings helper
  function saveSetting(key, value) {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || { realTimeScan: true, highlightBorder: true, insertBadge: true };
      settings[key] = value;
      chrome.storage.local.set({ settings });
    });
  }

  // Open detail logs modal
  function openModal(type) {
    chrome.storage.local.get('logs', (result) => {
      const logs = result.logs || [];
      const filteredLogs = logs.filter(log => log.type === type);
      
      modalTitle.innerHTML = `${type === 'fake' ? '감지된 가짜뉴스 내역' : '차단된 딥페이크 내역'}<span style="display:block; font-size: 10px; font-weight: normal; color: var(--text-muted); margin-top: 4px;">💡 항목을 클릭하면 해당 페이지로 이동합니다.</span>`;
      modalLogList.innerHTML = '';
      
      if (filteredLogs.length === 0) {
        modalLogList.innerHTML = `
          <div class="empty-logs" style="padding: 30px 0;">
            <div class="empty-icon">🛡️</div>
            <p>검출된 내역이 없습니다.</p>
          </div>
        `;
      } else {
        // Sort logs: isMain first, then by timestamp descending
        filteredLogs.sort((a, b) => {
          if (a.isMain && !b.isMain) return -1;
          if (!a.isMain && b.isMain) return 1;
          return b.timestamp - a.timestamp;
        });

        filteredLogs.forEach(log => {
          const item = document.createElement('div');
          item.className = `log-item ${log.type === 'fake' ? 'log-fake' : 'log-deepfake'}`;
          
          const badgeText = log.type === 'fake' ? 'FAKE NEWS' : 'DEEPFAKE';
          
          const mainTagHtml = log.isMain 
            ? `<span class="log-main-badge">본문 콘텐츠</span>` 
            : `<span class="log-sub-badge">추천/피드</span>`;
          
          let counterEvidenceHtml = '';
          if (log.counterEvidence && log.counterEvidence.length > 0) {
            counterEvidenceHtml = `
              <div class="log-counter-evidence" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.08); font-size: 10px; color: #a7f3d0; line-height: 1.4;">
                <strong style="display: block; margin-bottom: 3px; color: #34d399;">대비 의견 / 신뢰 정보:</strong>
                ${log.counterEvidence.map(ce => `
                  <div style="margin-bottom: 4px;">
                    <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 4px; border-radius: 4px; font-weight: 700; color: #10b981; margin-right: 4px;">${escapeHTML(ce.source)}</span>
                    <span>${escapeHTML(ce.content)}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }
          
          item.innerHTML = `
            <div class="log-item-header">
              <div>
                ${mainTagHtml}
                <span class="log-platform">${escapeHTML(log.platform)}</span>
              </div>
              <span class="log-score-badge">${badgeText} ${log.score}%</span>
            </div>
            <div class="log-title">${escapeHTML(log.title)}</div>
            <div class="log-reason" style="margin-bottom: 4px;">${escapeHTML(log.reason)}</div>
            ${counterEvidenceHtml}
            <div class="log-time">${formatTime(log.timestamp)}</div>
          `;
          item.addEventListener('click', () => {
            chrome.tabs.create({ url: log.url });
          });
          modalLogList.appendChild(item);
        });
      }
      
      logModal.classList.add('active');
    });
  }

  // --- Real-time Message Updates ---
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'statsUpdated') {
        renderStats(message.stats);
      }
      if (message.action === 'logsUpdated') {
        getActiveTabUrl((activeUrl) => {
          if (activeUrl) {
            const cleanedActive = cleanUrl(activeUrl);
            const filtered = message.logs.filter(log => cleanUrl(log.url) === cleanedActive);
            renderLogs(filtered);
          } else {
            renderLogs(message.logs);
          }
        });
      }
    });
  }

  // --- Utility Helpers ---
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run initial configuration
  init();
});
