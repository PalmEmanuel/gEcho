# Teams Inbound Setup — Azure AD App Registration

## 1. Register the app

1. Go to https://portal.azure.com → Azure Active Directory → App registrations → New registration
2. Name: "gEcho Squad Monitor"
3. Supported account type: "Accounts in this organizational directory only" (single-tenant)
4. Redirect URI: leave blank (device code flow doesn't need it)
5. Click Register
6. Note the **Application (client) ID** and **Directory (tenant) ID** — you'll need these

## 2. Add API permissions

In the app registration:
1. Click "API permissions" → "Add a permission" → Microsoft Graph → Delegated
2. Add: `Chat.ReadWrite` and `User.Read`
3. Click "Grant admin consent" if your org requires it (or ask your IT admin)

## 3. Enable public client flow

1. Click "Authentication" → "Advanced settings"
2. Set "Allow public client flows" to **Yes**
3. Save

## 4. Configure and authenticate

```bash
# Create the config file
cat > ~/.squad/teams-config.json << 'EOF'
{
  "clientId": "YOUR_CLIENT_ID_HERE",
  "tenantId": "YOUR_TENANT_ID_HERE",
  "triggerWords": ["/task", "@squad", "@gecho"],
  "chatType": "group"
}
EOF

# Install dependencies and run setup (from the repository root)
cd .squad/scripts
npm install
cd ../..
node .squad/scripts/teams-setup.js
```

Follow the device code prompt — open the URL, enter the code, sign in.
After signing in, teams-setup.js will list your group chats and ask you to select one.

## 5. Verify

After setup completes, run the monitor once to confirm it works:

```bash
node .squad/scripts/teams-monitor.js
# Expected output: "No new tasks"
```

Send a message starting with `/task` in the configured group chat, then run again:

```bash
node .squad/scripts/teams-monitor.js
# Expected output: "Found 1 new task"
# Task file will appear in .squad/teams-inbox/
```

## Re-authentication

If `teams-monitor.js` outputs `AUTH_REQUIRED` on stderr, your token has expired. Re-run:

```bash
node .squad/scripts/teams-setup.js
```

The setup script will re-authenticate and update `~/.squad/teams-auth.json`. You don't need to re-select the chat — if `~/.squad/teams-config.json` already has `chatId`, the script will skip the chat selection step.

## Security notes

- `~/.squad/teams-config.json` and `~/.squad/teams-auth.json` live in your home directory — **never commit these**
- The repo's `~/.squad/teams-config.json` template contains no secrets
- The MSAL token cache uses delegated permissions only — it cannot act on your behalf beyond `Chat.ReadWrite` and `User.Read`
