// Background service worker for the Chrome extension

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    captureScreenshot()
      .then((dataUrl) => {
        sendResponse({ success: true, dataUrl });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'startAutoScreenshot') {
    startAutoScreenshot(request.intervalMinutes);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'stopAutoScreenshot') {
    stopAutoScreenshot();
    sendResponse({ success: true });
    return true;
  }
});

// Capture a screenshot of the active tab
async function captureScreenshot() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }

    // Capture visible area of the tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    return dataUrl;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  }
}

// Auto-capture and upload (scheduled)
async function autoCaptureAndUpload() {
  try {
    console.log('Auto screenshot triggered');
    
    // Get config
    const config = await chrome.storage.sync.get(['apiUrl', 'apiToken']);
    
    if (!config.apiUrl || !config.apiToken) {
      console.error('API not configured');
      return;
    }

    // Capture screenshot
    const dataUrl = await captureScreenshot();
    
    // Convert to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', blob, 'auto-screenshot.png');

    // Upload
    const uploadResponse = await fetch(`${config.apiUrl}/api/screenshots`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      },
      body: formData
    });

    if (uploadResponse.ok) {
      const result = await uploadResponse.json();
      console.log('Auto screenshot uploaded:', result.url);
      
      // Send notification (only if permission granted)
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Auto Screenshot',
          message: 'Screenshot uploaded automatically'
        });
      } catch (error) {
        // Notification permission might not be granted, ignore
        console.log('Notification not available:', error);
      }
    } else {
      console.error('Upload failed:', await uploadResponse.text());
    }
  } catch (error) {
    console.error('Auto screenshot error:', error);
  }
}

// Start auto screenshot
function startAutoScreenshot(intervalMinutes) {
  // Clear existing alarm
  chrome.alarms.clear('autoScreenshot');
  
  // Create new alarm
  const intervalMs = intervalMinutes * 60 * 1000;
  chrome.alarms.create('autoScreenshot', {
    periodInMinutes: intervalMinutes
  });
  
  console.log(`Auto screenshot started: every ${intervalMinutes} minutes`);
}

// Stop auto screenshot
function stopAutoScreenshot() {
  chrome.alarms.clear('autoScreenshot');
  console.log('Auto screenshot stopped');
}

// Listen untuk alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoScreenshot') {
    autoCaptureAndUpload();
  }
});

// Install hook
chrome.runtime.onInstalled.addListener(() => {
  console.log('Screenshot & Upload extension installed');
});
