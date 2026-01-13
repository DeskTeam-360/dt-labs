// Main popup script

let currentScreenshot = null;

// DOM Elements
const authSection = document.getElementById('authSection');
const mainSection = document.getElementById('mainSection');
const previewContainer = document.getElementById('previewContainer');
const screenshotPreview = document.getElementById('screenshotPreview');
const apiUrlInput = document.getElementById('apiUrl');
const apiTokenInput = document.getElementById('apiToken');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const captureBtn = document.getElementById('captureBtn');
const uploadBtn = document.getElementById('uploadBtn');
const retakeBtn = document.getElementById('retakeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const configStatus = document.getElementById('configStatus');
const statusMessage = document.getElementById('statusMessage');
const autoScreenshotToggle = document.getElementById('autoScreenshotToggle');
const autoScreenshotSettings = document.getElementById('autoScreenshotSettings');
const intervalMinutesInput = document.getElementById('intervalMinutes');
const autoScreenshotStatus = document.getElementById('autoScreenshotStatus');
const tabButtons = document.querySelectorAll('.tab-btn');
const captureTab = document.getElementById('captureTab');
const galleryTab = document.getElementById('galleryTab');
const galleryContainer = document.getElementById('galleryContainer');
const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
  
  // Update auto screenshot status every 10 seconds
  if (autoScreenshotToggle && autoScreenshotToggle.checked) {
    updateAutoScreenshotStatus();
    setInterval(updateAutoScreenshotStatus, 10000);
  }
});

// Load configuration from storage
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['apiUrl', 'apiToken', 'autoScreenshotEnabled', 'autoScreenshotInterval']);
    
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
      apiTokenInput.value = result.apiToken || '';
      
      // Initialize API
      await initAPI(result.apiUrl, result.apiToken);
      
      // Load auto screenshot settings
      if (result.autoScreenshotEnabled) {
        autoScreenshotToggle.checked = true;
        autoScreenshotSettings.style.display = 'block';
      }
      
      if (result.autoScreenshotInterval) {
        intervalMinutesInput.value = result.autoScreenshotInterval;
      }
      
      updateAutoScreenshotStatus();
      
      // Show main section
      authSection.style.display = 'none';
      mainSection.style.display = 'block';
    } else {
      // Show auth section
      authSection.style.display = 'block';
      mainSection.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading config:', error);
    showStatus(configStatus, 'Error loading configuration', 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  saveConfigBtn.addEventListener('click', handleSaveConfig);
  captureBtn.addEventListener('click', handleCapture);
  uploadBtn.addEventListener('click', handleUpload);
  retakeBtn.addEventListener('click', handleRetake);
  logoutBtn.addEventListener('click', handleLogout);
  
  // Auto screenshot listeners
  autoScreenshotToggle.addEventListener('change', handleAutoScreenshotToggle);
  intervalMinutesInput.addEventListener('change', handleIntervalChange);
  
  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Gallery listeners
  refreshGalleryBtn.addEventListener('click', loadGallery);
}

// Handle save configuration
async function handleSaveConfig() {
  const url = apiUrlInput.value.trim();
  const token = apiTokenInput.value.trim();

  if (!url) {
    showStatus(configStatus, 'API URL harus diisi', 'error');
    return;
  }

  // Validate URL format
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showStatus(configStatus, 'URL harus dimulai dengan http:// atau https://', 'error');
    return;
  }

  if (!token) {
    showStatus(configStatus, 'API Token harus diisi. Dapatkan dari halaman Profile aplikasi.', 'error');
    return;
  }

  try {
    // Save to storage
    await chrome.storage.sync.set({
      apiUrl: url,
      apiToken: token
    });

    // Initialize API
    await initAPI(url, token);

    showStatus(configStatus, 'Konfigurasi berhasil disimpan!', 'success');
    
    // Switch to main section
    setTimeout(() => {
      authSection.style.display = 'none';
      mainSection.style.display = 'block';
      configStatus.style.display = 'none';
    }, 1500);
  } catch (error) {
    console.error('Error saving config:', error);
    showStatus(configStatus, 'Error: ' + error.message, 'error');
  }
}

// Handle capture screenshot
async function handleCapture() {
  try {
    captureBtn.disabled = true;
    captureBtn.textContent = 'Mengambil screenshot...';
    showStatus(statusMessage, 'Mengambil screenshot...', 'info');

    // Send message to background script
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }

      if (response.success) {
        currentScreenshot = response.dataUrl;
        screenshotPreview.src = response.dataUrl;
        previewContainer.style.display = 'block';
        showStatus(statusMessage, 'Screenshot berhasil diambil!', 'success');
      } else {
        throw new Error(response.error || 'Failed to capture screenshot');
      }

      captureBtn.disabled = false;
      captureBtn.textContent = '📷 Ambil Screenshot';
    });
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    showStatus(statusMessage, 'Error: ' + error.message, 'error');
    captureBtn.disabled = false;
    captureBtn.textContent = '📷 Ambil Screenshot';
  }
}

// Handle upload screenshot
async function handleUpload() {
  if (!currentScreenshot) {
    showStatus(statusMessage, 'Tidak ada screenshot untuk diupload', 'error');
    return;
  }

  try {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Mengupload...';
    showStatus(statusMessage, 'Mengupload screenshot...', 'info');

    // Upload using API client
    const result = await uploadScreenshot(currentScreenshot);

    if (result.success) {
      showStatus(statusMessage, `Upload berhasil! URL disalin ke clipboard.`, 'success');
      
      // Copy URL to clipboard
      try {
        await navigator.clipboard.writeText(result.url);
      } catch (clipError) {
        // Fallback if clipboard API fails
        console.log('Clipboard copy failed:', clipError);
      }

      // Clear preview after successful upload
      setTimeout(() => {
        previewContainer.style.display = 'none';
        currentScreenshot = null;
      }, 2000);
      
      // Refresh gallery if on gallery tab
      if (galleryTab.classList.contains('active')) {
        loadGallery();
      }
    } else {
      throw new Error(result.error || 'Upload failed');
    }

    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
  } catch (error) {
    console.error('Error uploading screenshot:', error);
    showStatus(statusMessage, 'Error: ' + error.message, 'error');
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
  }
}

// Handle retake screenshot
function handleRetake() {
  previewContainer.style.display = 'none';
  currentScreenshot = null;
  statusMessage.style.display = 'none';
}

// Handle logout
async function handleLogout() {
  if (confirm('Yakin ingin logout? Konfigurasi akan dihapus.')) {
    // Stop auto screenshot
    chrome.runtime.sendMessage({ action: 'stopAutoScreenshot' });
    
    await chrome.storage.sync.remove(['apiUrl', 'apiToken', 'autoScreenshotEnabled', 'autoScreenshotInterval']);
    authSection.style.display = 'block';
    mainSection.style.display = 'none';
    apiUrlInput.value = '';
    apiTokenInput.value = '';
    autoScreenshotToggle.checked = false;
    autoScreenshotSettings.style.display = 'none';
    previewContainer.style.display = 'none';
    currentScreenshot = null;
  }
}

// Handle auto screenshot toggle
async function handleAutoScreenshotToggle() {
  const enabled = autoScreenshotToggle.checked;
  
  if (enabled) {
    autoScreenshotSettings.style.display = 'block';
    const interval = parseInt(intervalMinutesInput.value) || 5;
    
    // Validate interval
    if (interval < 1 || interval > 60) {
      showStatus(statusMessage, 'Interval harus antara 1-60 menit', 'error');
      autoScreenshotToggle.checked = false;
      autoScreenshotSettings.style.display = 'none';
      return;
    }
    
    // Start auto screenshot
    chrome.runtime.sendMessage({
      action: 'startAutoScreenshot',
      intervalMinutes: interval
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error starting auto screenshot:', chrome.runtime.lastError);
        showStatus(statusMessage, 'Error: ' + chrome.runtime.lastError.message, 'error');
        autoScreenshotToggle.checked = false;
        autoScreenshotSettings.style.display = 'none';
        return;
      }
      
      // Save settings
      chrome.storage.sync.set({
        autoScreenshotEnabled: true,
        autoScreenshotInterval: interval
      });
      
      updateAutoScreenshotStatus();
      showStatus(statusMessage, `Auto screenshot aktif: setiap ${interval} menit`, 'success');
    });
  } else {
    // Stop auto screenshot
    chrome.runtime.sendMessage({ action: 'stopAutoScreenshot' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error stopping auto screenshot:', chrome.runtime.lastError);
      }
      
      // Save settings
      chrome.storage.sync.set({ autoScreenshotEnabled: false });
      autoScreenshotSettings.style.display = 'none';
      autoScreenshotStatus.textContent = '';
      showStatus(statusMessage, 'Auto screenshot dinonaktifkan', 'info');
    });
  }
}

// Handle interval change
async function handleIntervalChange() {
  if (!autoScreenshotToggle.checked) return;
  
  const interval = parseInt(intervalMinutesInput.value) || 5;
  
  // Validate interval
  if (interval < 1 || interval > 60) {
    showStatus(statusMessage, 'Interval harus antara 1-60 menit', 'error');
    return;
  }
  
  // Restart with new interval
  chrome.runtime.sendMessage({
    action: 'startAutoScreenshot',
    intervalMinutes: interval
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error updating interval:', chrome.runtime.lastError);
      return;
    }
    
    // Save settings
    chrome.storage.sync.set({ autoScreenshotInterval: interval });
    updateAutoScreenshotStatus();
    showStatus(statusMessage, `Interval diupdate: setiap ${interval} menit`, 'success');
  });
}

// Update auto screenshot status
async function updateAutoScreenshotStatus() {
  if (!autoScreenshotToggle.checked) {
    autoScreenshotStatus.textContent = '';
    return;
  }
  
  const interval = parseInt(intervalMinutesInput.value) || 5;
  
  // Check if alarm exists
  chrome.alarms.get('autoScreenshot', (alarm) => {
    if (alarm) {
      const nextTime = new Date(alarm.scheduledTime);
      const now = new Date();
      const minutesUntil = Math.ceil((nextTime - now) / 1000 / 60);
      
      autoScreenshotStatus.innerHTML = `
        <div style="color: #4CAF50;">
          ✅ Aktif - Screenshot berikutnya dalam ${minutesUntil} menit
        </div>
      `;
    } else {
      autoScreenshotStatus.innerHTML = `
        <div style="color: #666;">
          ⏳ Menunggu screenshot pertama...
        </div>
      `;
    }
  });
}

// Switch tabs
function switchTab(tabName) {
  // Update tab buttons
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update tab content
  if (tabName === 'capture') {
    captureTab.classList.add('active');
    galleryTab.classList.remove('active');
  } else if (tabName === 'gallery') {
    captureTab.classList.remove('active');
    galleryTab.classList.add('active');
    loadGallery(); // Load gallery when switching to gallery tab
  }
}

// Load gallery
async function loadGallery() {
  try {
    galleryContainer.innerHTML = '<div class="loading-gallery">Loading gallery...</div>';
    
    const config = await chrome.storage.sync.get(['apiUrl', 'apiToken']);
    
    if (!config.apiUrl || !config.apiToken) {
      galleryContainer.innerHTML = '<div class="empty-gallery">API not configured</div>';
      return;
    }
    
    const response = await fetch(`${config.apiUrl}/api/screenshots?limit=50`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load gallery');
    }
    
    const result = await response.json();
    
    if (!result.success || !result.screenshots || result.screenshots.length === 0) {
      galleryContainer.innerHTML = '<div class="empty-gallery">No screenshots yet. Start capturing!</div>';
      return;
    }
    
    // Display gallery
    galleryContainer.innerHTML = '';
    result.screenshots.forEach(screenshot => {
      const item = createGalleryItem(screenshot);
      galleryContainer.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading gallery:', error);
    galleryContainer.innerHTML = `<div class="empty-gallery">Error: ${error.message}</div>`;
  }
}

// Create gallery item
function createGalleryItem(screenshot) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  
  const img = document.createElement('img');
  img.src = screenshot.url;
  img.alt = screenshot.name;
  img.loading = 'lazy';
  
  const info = document.createElement('div');
  info.className = 'gallery-item-info';
  const date = new Date(screenshot.created_at || screenshot.updated_at);
  info.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  
  const actions = document.createElement('div');
  actions.className = 'gallery-item-actions';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'gallery-item-btn';
  copyBtn.textContent = '📋';
  copyBtn.title = 'Copy URL';
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(screenshot.url);
    showStatus(statusMessage, 'URL copied to clipboard!', 'success');
  };
  
  const openBtn = document.createElement('button');
  openBtn.className = 'gallery-item-btn';
  openBtn.textContent = '🔗';
  openBtn.title = 'Open in new tab';
  openBtn.onclick = (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: screenshot.url });
  };
  
  actions.appendChild(copyBtn);
  actions.appendChild(openBtn);
  
  item.appendChild(img);
  item.appendChild(info);
  item.appendChild(actions);
  
  // Click to view full size
  item.onclick = () => {
    showImageModal(screenshot.url);
  };
  
  return item;
}

// Show image modal
function showImageModal(imageUrl) {
  // Create modal if doesn't exist
  let modal = document.getElementById('imageModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.className = 'image-modal';
    
    const content = document.createElement('div');
    content.className = 'image-modal-content';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      modal.classList.remove('active');
    };
    
    content.appendChild(img);
    content.appendChild(closeBtn);
    modal.appendChild(content);
    
    // Close on background click
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    };
    
    document.body.appendChild(modal);
  }
  
  // Update image and show
  const img = modal.querySelector('img');
  img.src = imageUrl;
  modal.classList.add('active');
}

// Show status message
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status-message ${type}`;
  element.style.display = 'block';

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}
