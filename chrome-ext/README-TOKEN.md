# Chrome extension: token authentication setup

## How to use token authentication

### 1. Sign in to the app
- Sign in to your Next.js app in the browser
- Use a valid account

### 2. Generate an API token
1. Open **Profile** (sidebar menu)
2. Scroll to **“API Tokens for Chrome Extension”**
3. Click **“Generate New Token”**
4. **Important:** Copy the token when it appears (it is only shown once)
5. The token expires after 30 days

### 3. Configure the extension
1. Open the Chrome extension popup
2. Enter:
   - **Next.js API URL:** your app URL (e.g. `http://localhost:3000` or `https://your-app.vercel.app`)
   - **API Token:** the token you copied from Profile
3. Click **“Save configuration”**
4. The extension is ready to use

## Why use token authentication

- **Safer:** No service role key in the extension  
- **Per user:** Each user has their own token  
- **Traceable:** You can see who uploaded screenshots  
- **Revocable:** Tokens can be removed at any time  
- **Expiring:** Tokens expire automatically after 30 days  

## Troubleshooting

### “Token is required” error
- Make sure the token was copied correctly
- Trim any leading or trailing spaces
- Generate a new token if needed

### “Invalid or expired token” error
- The token may have expired (30 days)
- The token may have been deleted
- Generate a new token on the Profile page

### “Unauthorized” error
- Ensure you are signed in to the app
- Confirm the token is still active (check on Profile)

## Notes

- The token is only shown once when generated
- Store it securely (do not share it)
- Delete tokens you no longer use
- New tokens expire 30 days after creation
