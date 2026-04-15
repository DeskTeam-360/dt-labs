# Chrome Extension — Screenshot & Upload

Chrome extension to capture the active tab and upload screenshots through your Next.js API.

## Features

- Capture a screenshot of the active tab
- Upload via the Next.js API endpoint
- Flexible backend — swap storage without changing the extension
- After upload, the screenshot URL is copied to the clipboard

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `chrome-ext` folder from this project
5. The extension installs and its icon appears in the toolbar

## Configuration

1. Make sure the Next.js app is running (development: `npm run dev`, or your production URL)
2. Click the extension icon in the Chrome toolbar
3. Enter the **Next.js API URL**:
   - Development: `http://localhost:3000`
   - Production: `https://your-app.vercel.app` (or your domain)
4. Click **Save configuration**
5. Settings are stored and the extension is ready to use

## Usage

1. Open the page you want to capture
2. Click the extension icon
3. Click **Capture screenshot**
4. A preview appears
5. Click **Upload** to send it through the API
6. The public URL is copied to the clipboard

## File layout

```
chrome-ext/
├── manifest.json          # Extension manifest
├── background.js          # Service worker (capture + auto upload)
├── popup.html             # Popup UI
├── popup.css              # Popup styles
├── popup.js               # Popup logic
├── api-client.js          # Upload helper (calls Next.js API)
├── icons/                 # Extension icons (16, 48, 128)
└── README.md              # This file
```

## API endpoint

The extension calls: `POST /api/screenshots`

The route typically:

1. Accepts the screenshot file (`FormData`)
2. Validates type and size
3. Stores the file (e.g. object storage)
4. Returns a public URL

## Backend requirements

1. `POST /api/screenshots` must exist and accept the extension’s auth header
2. Storage bucket / path must match your server configuration
3. CORS and extension permissions must allow the request from the extension context

## Troubleshooting

- **Upload errors**: Check the API URL, that the server is running, and `/api/screenshots` exists; see the browser console for details
- **No screenshot**: Ensure the extension has permission for the active tab
- **Clipboard issues**: Some environments require HTTPS for the Clipboard API
- **CORS**: Ensure the API allows requests from the extension as needed

## Why this architecture

- **Flexible**: Change storage (S3, iDrive, etc.) on the server without republishing the extension
- **Safer**: No long-lived storage secrets in the extension package
- **Centralized**: Validation, logging, and business logic live in one place
- **Easier maintenance**: Update server logic without forcing every user to update the extension

## Notes

- Manifest V3
- Captures PNG
- See `README-TOKEN.md` for API token setup if applicable
