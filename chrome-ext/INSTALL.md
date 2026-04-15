# Installing the Chrome extension

## Steps

1. **Open the Chrome extensions page**
   - In Chrome, go to `chrome://extensions/`
   - Or: menu (⋮) → **Extensions** → **Manage extensions**

2. **Enable Developer mode**
   - Toggle **Developer mode** in the top-right (should be on / blue)

3. **Load the extension**
   - Click **Load unpacked**
   - Choose the `chrome-ext` folder from this repository
   - The extension should appear in the list

4. **Pin the extension (optional)**
   - Click the puzzle icon in the toolbar
   - Find **Screenshot & Upload**
   - Click the pin icon to keep it on the toolbar

## First-time configuration

1. Click the extension icon
2. Enter:
   - **Next.js API URL** — base URL of the app (no `/api/screenshots` suffix), e.g. `http://localhost:3000`
   - **API Token** — create one in the app under **Profile** → API tokens (see `README-TOKEN.md` if needed)
3. Click **Save configuration**
4. You can use **Capture** and **Gallery** from the popup

## Usage

1. Open the page to capture
2. Click the extension icon
3. Click **Capture screenshot**
4. Review the preview
5. Click **Upload** to send it to the API
6. The URL is copied to the clipboard when upload succeeds

## Troubleshooting

### Extension does not appear

- Confirm Developer mode is on
- Refresh `chrome://extensions/`
- Open **service worker** on the extension card and check the console for errors

### Screenshot fails

- Grant tab permissions when prompted
- Try reloading the extension

### Upload fails

- Verify the API URL and token
- Confirm `POST /api/screenshots` works (e.g. from the app docs or Network tab)
- Check storage configuration on the server
- Inspect the console for error messages

### Icons missing

- Generate icons with `create-icons.html` or add `16`, `48`, and `128` PNGs under `icons/`
- Reload the extension

## Notes

- Manifest V3
- PNG capture
- Settings are stored in Chrome sync storage (`apiUrl`, `apiToken`, optional auto-screenshot options)
