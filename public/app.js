// ==========================================================================
// Rural Health Worker Assistant - App Controller (Vanilla JS)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- App State ---
  let currentUser = JSON.parse(localStorage.getItem('health_worker_session')) || null;
  let apiConfigured = false;
  let currentViews = ['setup-view', 'login-view', 'dashboard-view', 'history-view', 'profile-view', 'about-view'];
  let currentReportNotes = '';
  let currentGeneratedReport = '';

  // --- DOM Elements ---
  const header = document.getElementById('app-header');
  const headerUsername = document.getElementById('header-username');
  const sidebar = document.getElementById('sidebar-drawer');
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const drawerOverlay = document.getElementById('drawer-overlay');
  
  const setupView = document.getElementById('setup-view');
  const setupForm = document.getElementById('setup-form');
  const geminiKeyInput = document.getElementById('gemini-key-input');
  
  const loginView = document.getElementById('login-view');
  const loginForm = document.getElementById('login-form');
  const loginName = document.getElementById('login-name');
  const loginId = document.getElementById('login-id');
  
  const dashboardView = document.getElementById('dashboard-view');
  const dashboardGreeting = document.getElementById('dashboard-greeting');
  const dashboardDateDisplay = document.getElementById('dashboard-date-display');
  
  // Dashboard Action cards & Modals
  const actionCheckin = document.getElementById('action-checkin');
  const actionCheckout = document.getElementById('action-checkout');
  const actionVisit = document.getElementById('action-visit');
  const actionReport = document.getElementById('action-report');
  const actionHistoryNav = document.getElementById('action-history-nav');
  const actionProfileNav = document.getElementById('action-profile-nav');

  const checkinStatusBadge = document.getElementById('checkin-status-badge');
  const checkoutStatusBadge = document.getElementById('checkout-status-badge');

  // Modals
  const checkinModal = document.getElementById('checkin-modal');
  const checkoutModal = document.getElementById('checkout-modal');
  const visitModal = document.getElementById('visit-modal');
  const reportModal = document.getElementById('report-modal');

  const checkinForm = document.getElementById('checkin-form');
  const checkinDate = document.getElementById('checkin-date');
  const checkinTime = document.getElementById('checkin-time');

  const checkoutForm = document.getElementById('checkout-form');
  const checkoutDate = document.getElementById('checkout-date');
  const checkoutTime = document.getElementById('checkout-time');

  const visitForm = document.getElementById('visit-form');
  const reportForm = document.getElementById('report-form');
  const generateReportBtn = document.getElementById('generate-report-btn');
  const reportSpinner = document.getElementById('report-spinner');
  const reportBtnText = document.getElementById('report-btn-text');
  
  const reportOutputContainer = document.getElementById('report-output-container');
  const generatedReportContent = document.getElementById('generated-report-content');
  const saveReportConfirmBtn = document.getElementById('save-report-confirm-btn');
  const saveReportCancelBtn = document.getElementById('save-report-cancel-btn');

  // Other views
  const historyView = document.getElementById('history-view');
  const profileView = document.getElementById('profile-view');
  const aboutView = document.getElementById('about-view');

  // Chatbot elements
  const chatbotContainer = document.getElementById('chatbot-container');
  const chatbotHeader = document.getElementById('chatbot-header');
  const chatbotToggleBtn = document.getElementById('chatbot-toggle-btn');
  const chatMessagesArea = document.getElementById('chat-messages-area');
  const chatInputForm = document.getElementById('chat-input-form');
  const chatMessageInput = document.getElementById('chat-message-input');

  // Toast
  const toast = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');

  // --- Initial Setup & Verification ---
  async function init() {
    // 1. Check if Gemini API key is configured in backend
    await checkApiConfig();

    // Set today's date in dashboard
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dashboardDateDisplay.textContent = new Date().toLocaleDateString('en-US', options);

    // Populate modal dates/times with defaults
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
    
    checkinDate.value = today;
    checkinTime.value = time;
    checkoutDate.value = today;
    checkoutTime.value = time;

    // 2. Resolve view based on session and config
    if (!apiConfigured) {
      showToast('System configuration missing: Gemini API key is not set. Contact Administrator.', 'error');
    }
    if (currentUser) {
      setupLoggedInSession();
    } else {
      navigateTo('login-view');
    }
  }

  // --- Routing & Navigation ---
  function navigateTo(viewId) {
    // Close sidebar on navigate
    sidebar.classList.remove('open');
    drawerOverlay.classList.add('hidden');

    currentViews.forEach(id => {
      const el = document.getElementById(id);
      if (id === viewId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    // Update active state in sidebar menu
    const menuItems = document.querySelectorAll('.drawer-menu .menu-item');
    menuItems.forEach(item => {
      if (item.getAttribute('data-target') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Refresh view content if needed
    if (viewId === 'dashboard-view') {
      refreshDashboardStatus();
    } else if (viewId === 'history-view') {
      loadHistory();
    } else if (viewId === 'profile-view') {
      loadProfile();
    }
  }

  function setupLoggedInSession() {
    header.classList.remove('hidden');
    chatbotContainer.classList.remove('hidden');
    chatMessagesArea.innerHTML = ''; // Ensure no leftover chat bubbles from a previous user
    headerUsername.textContent = currentUser.name;
    dashboardGreeting.textContent = `Welcome, ${currentUser.name}`;
    navigateTo('dashboard-view');
    showToast(`Logged in as ${currentUser.name}`, 'success');
  }

  // --- API Integrations ---

  // Check backend Gemini API config status
  async function checkApiConfig() {
    try {
      const response = await fetch('/api/check-config', { method: 'POST' });
      const data = await response.json();
      apiConfigured = data.api_key_configured;
    } catch (e) {
      showToast('Backend server connection failed.', 'error');
    }
  }

  // Save Gemini key
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = geminiKeyInput.value.trim();
    if (!key) return;

    try {
      const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: key })
      });
      const data = await response.json();
      if (data.success) {
        apiConfigured = true;
        showToast('API Key configured successfully.', 'success');
        if (currentUser) {
          setupLoggedInSession();
        } else {
          navigateTo('login-view');
        }
      } else {
        showToast(data.error || 'Failed to save config', 'error');
      }
    } catch (e) {
      showToast('Error saving configuration.', 'error');
    }
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = loginName.value.trim();
    const id = loginId.value.trim();

    if (!name || !id) return;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, worker_id: id })
      });
      const data = await response.json();
      if (data.success) {
        currentUser = data.worker;
        //localStorage.setItem('health_worker_session', JSON.stringify(currentUser));
        setupLoggedInSession();
      } else {
        showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('Login error: Check backend connectivity.', 'error');
    }
  });

  // Logout handler
  function handleLogout() {
    currentUser = null;
    header.classList.add('hidden');
    chatbotContainer.classList.add('hidden');
    chatMessagesArea.innerHTML = ''; // Clear chat bubbles so the next user starts fresh
    navigateTo('login-view');
    showToast('Logged out successfully.', 'info');
    localStorage.removeItem('health_worker_session');
  }

  // Refresh checkin status on dashboard
  async function refreshDashboardStatus() {
    if (!currentUser) return;

    try {
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id })
      });
      const data = await response.json();
      
      const todayStr = new Date().toISOString().split('T')[0];
      const todayLogs = data.attendance.filter(r => r.date === todayStr);

      if (todayLogs.length > 0) {
        const log = todayLogs[0];
        checkinStatusBadge.textContent = `Logged: ${log.check_in.substring(0, 5)}`;
        checkinStatusBadge.classList.add('logged');

        if (log.check_out) {
          checkoutStatusBadge.textContent = `Logged: ${log.check_out.substring(0, 5)}`;
          checkoutStatusBadge.classList.add('logged');
        } else {
          checkoutStatusBadge.textContent = 'Not Logged';
          checkoutStatusBadge.classList.remove('logged');
        }
      } else {
        checkinStatusBadge.textContent = 'Not Logged';
        checkinStatusBadge.classList.remove('logged');
        checkoutStatusBadge.textContent = 'Not Logged';
        checkoutStatusBadge.classList.remove('logged');
      }
    } catch (e) {
      console.error("Dashboard refresh error:", e);
    }
  }

  // Submit Check-In
  checkinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = checkinDate.value;
    const time = checkinTime.value;

    try {
      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id, date, time })
      });
      const data = await response.json();
      
      if (data.success) {
        showToast('Check-In marked successfully.', 'success');
        closeAllModals();
        refreshDashboardStatus();
      } else {
        showToast(data.error || 'Check-in failed.', 'error');
      }
    } catch (err) {
      showToast('Error recording Check-In.', 'error');
    }
  });

  // Submit Check-Out
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = checkoutDate.value;
    const time = checkoutTime.value;

    try {
      const response = await fetch('/api/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id, date, time })
      });
      const data = await response.json();
      
      if (data.success) {
        showToast('Check-Out marked successfully.', 'success');
        closeAllModals();
        refreshDashboardStatus();
      } else {
        showToast(data.error || 'Check-out failed.', 'error');
      }
    } catch (err) {
      showToast('Error recording Check-Out.', 'error');
    }
  });

  // Submit Village Visit
  visitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const village = document.getElementById('visit-village').value.trim();
    const tasks = document.getElementById('visit-tasks').value.trim();
    const remarks = document.getElementById('visit-remarks').value.trim();

    try {
      const response = await fetch('/api/field-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser.worker_id,
          village,
          tasks,
          remarks
        })
      });
      const data = await response.json();
      
      if (data.success) {
        showToast(`Logged visit to ${village}.`, 'success');
        visitForm.reset();
        closeAllModals();
      } else {
        showToast(data.error || 'Visit logging failed.', 'error');
      }
    } catch (err) {
      showToast('Error logging village visit.', 'error');
    }
  });

  // Generate Report Form Submit
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const notes = document.getElementById('report-notes').value.trim();
    if (!notes) return;

    // UI Feedback state
    reportSpinner.classList.remove('hidden');
    generateReportBtn.disabled = true;
    reportBtnText.textContent = 'Analyzing notes with Gemini 2.5 Flash...';
    reportOutputContainer.classList.add('hidden');

    try {
      const response = await fetch('/api/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id, notes })
      });
      const data = await response.json();
      
      if (data.success) {
        currentReportNotes = notes;
        currentGeneratedReport = data.report;
        
        // Render generated report (handling markdown linebreaks simply)
        generatedReportContent.innerHTML = formatMarkdown(data.report);
        
        reportOutputContainer.classList.remove('hidden');
        showToast('Report generated successfully!', 'success');
      } else {
        showToast(data.error || 'Report generation failed.', 'error');
      }
    } catch (err) {
      showToast('Gemini API Error. Ensure API Key is active.', 'error');
    } finally {
      reportSpinner.classList.add('hidden');
      generateReportBtn.disabled = false;
      reportBtnText.textContent = 'Generate Professional Report with Gemini';
    }
  });

  // Save/Confirm generated report
  saveReportConfirmBtn.addEventListener('click', () => {
    showToast('Report saved successfully.', 'success');
    reportForm.reset();
    reportOutputContainer.classList.add('hidden');
    closeAllModals();
  });

  saveReportCancelBtn.addEventListener('click', () => {
    reportOutputContainer.classList.add('hidden');
    showToast('Report discarded.', 'info');
  });

  // Fetch and display log history
  async function loadHistory() {
    if (!currentUser) return;
    const historyLogsContainer = document.getElementById('history-logs-container');
    historyLogsContainer.innerHTML = '<p class="empty-state-text">Loading activity history...</p>';

    try {
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id })
      });
      const data = await response.json();
      
      renderHistoryItems(data, 'all');
      
      // Store complete history data in element attribute for tab filtering
      historyLogsContainer.setAttribute('data-history-raw', JSON.stringify(data));
    } catch (err) {
      historyLogsContainer.innerHTML = '<p class="empty-state-text error-text">Failed to load history logs.</p>';
    }
  }

  // Render log elements based on filter selection
  function renderHistoryItems(historyData, filterType) {
    const historyLogsContainer = document.getElementById('history-logs-container');
    historyLogsContainer.innerHTML = '';

    let items = [];

    // 1. Flatten structures into single log sequence if filtering 'all'
    if (filterType === 'all' || filterType === 'attendance') {
      historyData.attendance.forEach(item => {
        items.push({
          type: 'attendance',
          date: item.date,
          sortKey: item.date + '_1',
          content: `Checked In: <strong>${item.check_in.substring(0,5)}</strong> | Checked Out: <strong>${item.check_out ? item.check_out.substring(0,5) : 'Not Logged Yet'}</strong>`,
          remarks: item.remarks
        });
      });
    }

    if (filterType === 'all' || filterType === 'visits') {
      historyData.visits.forEach(item => {
        items.push({
          type: 'visit',
          date: item.date,
          sortKey: item.date + '_2_' + item.time,
          content: `Village Visit: <strong>${item.village}</strong><br>Tasks: ${item.tasks}`,
          remarks: item.remarks
        });
      });
    }

    if (filterType === 'all' || filterType === 'reports') {
      historyData.reports.forEach(item => {
        items.push({
          type: 'report',
          date: item.date,
          sortKey: item.date + '_3',
          content: `<div class="markdown-body">${formatMarkdown(item.report)}</div>`,
          remarks: `Notes: ${item.raw_notes}`
        });
      });
    }

    // Sort descending by sortKey
    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    if (items.length === 0) {
      historyLogsContainer.innerHTML = '<p class="empty-state-text">No activity records found matching this category.</p>';
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `log-card border-${item.type}`;
      
      const badgeClass = item.type === 'attendance' ? 'badge-attendance' : item.type === 'visit' ? 'badge-visit' : 'badge-report';
      const typeLabel = item.type === 'attendance' ? 'Duty Hour' : item.type === 'visit' ? 'Village Visit' : 'Daily Report';
      
      card.innerHTML = `
        <div class="log-card-header">
          <span class="log-date">${formatDisplayDate(item.date)}</span>
          <span class="log-type-badge ${badgeClass}">${typeLabel}</span>
        </div>
        <div class="log-card-body">
          ${item.content}
        </div>
        ${item.remarks ? `
          <div class="log-meta-row">
            <div class="meta-field">
              <span class="meta-field-label">Remarks:</span>
              <span class="meta-field-value">${item.remarks}</span>
            </div>
          </div>
        ` : ''}
      `;
      historyLogsContainer.appendChild(card);
    });
  }

  // Filter click handlers
  const filterTabs = document.querySelectorAll('.filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const filter = tab.getAttribute('data-filter');
      const historyLogsContainer = document.getElementById('history-logs-container');
      const rawData = JSON.parse(historyLogsContainer.getAttribute('data-history-raw'));
      if (rawData) {
        renderHistoryItems(rawData, filter);
      }
    });
  });

  // Profile Data Loader
  async function loadProfile() {
    if (!currentUser) return;
    
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id })
      });
      const data = await response.json();
      
      // Update UI fields
      document.getElementById('profile-name').textContent = data.name;
      document.getElementById('profile-id').textContent = data.worker_id;
      document.getElementById('profile-last-active').textContent = data.last_attendance;
      
      document.getElementById('stat-working-days').textContent = data.total_working_days;
      document.getElementById('stat-reports-submitted').textContent = data.total_reports_submitted;
      
      const villagesList = document.getElementById('profile-villages-list');
      villagesList.innerHTML = '';
      
      if (data.villages_visited && data.villages_visited.length > 0) {
        data.villages_visited.forEach(v => {
          const li = document.createElement('li');
          li.className = 'village-tag';
          li.textContent = v;
          villagesList.appendChild(li);
        });
      } else {
        villagesList.innerHTML = '<li class="empty-state-text">No villages visited yet. Log a field visit from the dashboard.</li>';
      }
      
    } catch (e) {
      showToast('Failed to load profile details.', 'error');
    }
  }

  // --- AI Chatbot Interface ---
  
  // Toggle chatbot panel collapsed state
  chatbotHeader.addEventListener('click', () => {
    chatbotContainer.classList.toggle('chatbot-collapsed');
    
    // Auto-scroll chat area on expand
    if (!chatbotContainer.classList.contains('chatbot-collapsed')) {
      scrollToLatestMessage();
    }
  });

  // Submit Chat Message
  chatInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatMessageInput.value.trim();
    if (!text) return;

    // Append User Message to UI
    appendChatMessage('user', text);
    chatMessageInput.value = '';

    // Render loading indicator
    const typingIndicator = appendChatMessage('bot', '...', true);
    scrollToLatestMessage();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser.worker_id, message: text })
      });
      const data = await response.json();
      
      // Remove typing bubble
      typingIndicator.remove();
      
      if (data.reply) {
        appendChatMessage('bot', formatMarkdown(data.reply));
        scrollToLatestMessage();
        
        // If Gemini triggered a system action, refresh the UI!
        if (data.action_triggered && data.action_triggered.action) {
          refreshDashboardStatus();
          showToast(`Action Triggered: ${data.action_triggered.action.toUpperCase()}`, 'success');
        }
      } else {
        appendChatMessage('bot', 'System Error: No response received from Gemini API.');
      }
    } catch (err) {
      typingIndicator.remove();
      appendChatMessage('bot', 'Connection failed. Verify API configuration and online connectivity.');
    }
  });

  function appendChatMessage(sender, htmlContent, isTyping = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-message ${sender === 'user' ? 'user-msg' : 'bot-msg'}`;
    
    if (isTyping) {
      bubble.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px;"></span>';
    } else {
      bubble.innerHTML = htmlContent;
    }
    
    chatMessagesArea.appendChild(bubble);
    scrollToLatestMessage();
    return bubble;
  }

  function scrollToLatestMessage() {
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
  }

  // --- Modal Open/Close System ---
  actionCheckin.addEventListener('click', () => checkinModal.classList.remove('hidden'));
  actionCheckout.addEventListener('click', () => checkoutModal.classList.remove('hidden'));
  actionVisit.addEventListener('click', () => visitModal.classList.remove('hidden'));
  actionReport.addEventListener('click', () => reportModal.classList.remove('hidden'));
  
  // Quick Dashboard Navigation Cards
  actionHistoryNav.addEventListener('click', () => navigateTo('history-view'));
  actionProfileNav.addEventListener('click', () => navigateTo('profile-view'));

  // Bind close buttons
  document.querySelectorAll('.modal-close-btn, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  function closeAllModals() {
    checkinModal.classList.add('hidden');
    checkoutModal.classList.add('hidden');
    visitModal.classList.add('hidden');
    reportModal.classList.add('hidden');
    reportOutputContainer.classList.add('hidden');
  }

  // --- Sidebar/Drawer Toggles ---
  menuToggleBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    drawerOverlay.classList.remove('hidden');
  });

  drawerOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    drawerOverlay.classList.add('hidden');
  });

  // Menu item navigations
  document.querySelectorAll('.drawer-menu .menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      if (target) navigateTo(target);
    });
  });

  // Logout binding
  document.getElementById('logout-menu-btn').addEventListener('click', handleLogout);

  // --- Toast Handler ---
  let toastTimer = null;
  function showToast(message, type = 'info') {
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  // --- Helper Methods ---
  
  // Format Date cleanly for lists
  function formatDisplayDate(dateString) {
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Super simple Markdown parser (supports lists, bold, lines, headers)
  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/### (.*?)(<br>|$)/g, '<h5>$1</h5>')
      .replace(/## (.*?)(<br>|$)/g, '<h4>$1</h4>')
      .replace(/# (.*?)(<br>|$)/g, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/- (.*?)(<br>|$)/g, '<li>$1</li>')
      .replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/<\/ul><ul>/g, ''); // Join consecutive lists
  }

  // Start app
  init();
});
