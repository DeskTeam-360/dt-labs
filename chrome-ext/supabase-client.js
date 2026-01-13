// API client untuk Chrome extension
// Menggunakan Next.js API endpoint untuk upload screenshot

let apiUrl = "http://localhost:3000";

// Initialize API configuration
async function initAPI(url) {
  apiUrl = url;
  
  // Validate URL format
  if (!apiUrl || !apiUrl.startsWith('http')) {
    throw new Error('Invalid API URL');
  }
  
  // Remove trailing slash
  apiUrl = apiUrl.replace(/\/$/, '');
  
  return true;
}

// Upload screenshot via Next.js API
async function uploadScreenshot(dataUrl, fileName = null) {
  try {
    if (!apiUrl) {
      throw new Error('API URL not configured');
    }

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', blob, fileName || 'screenshot.png');

    // Upload via Next.js API
    const uploadResponse = await fetch(`${apiUrl}/api/screenshots`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed: ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return {
      success: true,
      url: result.url,
      path: result.path
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload screenshot'
    };
  }
}
