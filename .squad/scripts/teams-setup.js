'use strict';

/**
 * teams-setup.js — One-time auth + chat discovery for Teams inbound integration.
 *
 * Usage: node .squad/scripts/teams-setup.js
 *
 * Reads:  ~/.squad/teams-config.json  (clientId, tenantId — optional pre-seed)
 * Writes: ~/.squad/teams-config.json  (adds chatId + triggerWords)
 *         ~/.squad/teams-auth.json    (serialized MSAL token cache)
 */

const msal = require('@azure/msal-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const SQUAD_DIR = path.join(os.homedir(), '.squad');
const CONFIG_PATH = path.join(SQUAD_DIR, 'teams-config.json');
const AUTH_PATH = path.join(SQUAD_DIR, 'teams-auth.json');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureSquadDir() {
  if (!fs.existsSync(SQUAD_DIR)) {
    fs.mkdirSync(SQUAD_DIR, { recursive: true });
  }
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(data) {
  ensureSquadDir();
  // Merge with existing to avoid wiping triggerWords etc.
  const existing = loadConfig();
  const merged = { ...existing, ...data };
  // Remove template-only keys
  delete merged._comment;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function graphGet(accessToken, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(GRAPH_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 401) {
          reject(new Error('AUTH_REQUIRED: Token rejected by Graph API'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Graph API error ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse Graph response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  ensureSquadDir();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let config = loadConfig();

  // Prompt for clientId / tenantId if not already present
  if (!config.clientId) {
    config.clientId = (await prompt(rl, 'Enter Azure AD Application (client) ID: ')).trim();
  }
  if (!config.tenantId) {
    config.tenantId = (await prompt(rl, 'Enter Azure AD Directory (tenant) ID: ')).trim();
  }

  if (!config.clientId || !config.tenantId) {
    console.error('❌ clientId and tenantId are required.');
    rl.close();
    process.exit(1);
  }

  // Build MSAL PCA with optional persisted cache
  const msalConfig = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  };

  const pca = new msal.PublicClientApplication(msalConfig);

  // Restore serialized cache if it exists
  if (fs.existsSync(AUTH_PATH)) {
    try {
      const serialized = fs.readFileSync(AUTH_PATH, 'utf8');
      pca.getTokenCache().deserialize(serialized);
    } catch {
      // Cache unreadable — proceed with fresh auth
    }
  }

  const scopes = ['Chat.ReadWrite', 'User.Read'];

  // Try silent token acquisition first (uses cached token if available)
  let authResult;
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    try {
      authResult = await pca.acquireTokenSilent({ scopes, account: accounts[0] });
      console.log('\n✅ Using cached credentials.\n');
    } catch {
      // Silent failed — fall through to device code
    }
  }

  // Fall back to device code flow if silent auth failed or no cached account
  if (!authResult) {
    console.log('\nStarting device code authentication…\n');
    try {
      authResult = await pca.acquireTokenByDeviceCode({
        scopes,
        deviceCodeCallback: (response) => { console.log(response.message); },
      });
    } catch (err) {
      console.error(`❌ Authentication failed: ${err.message}`);
      rl.close();
      process.exit(1);
    }

    // Persist updated token cache
    const serialized = pca.getTokenCache().serialize();
    fs.writeFileSync(AUTH_PATH, serialized, 'utf8');
    console.log('\n✅ Authenticated. Token cache saved.\n');
  }

  const accessToken = authResult.accessToken;

  // Fetch 1:1 chats, falling back to all chat types if none found
  console.log('Fetching your 1:1 chats…');
  let chatsData;
  let chatTypeLabel = '1:1';
  try {
    chatsData = await graphGet(accessToken, `/me/chats?$filter=chatType eq 'oneOnOne'`);
  } catch (err) {
    console.error(`❌ Failed to fetch chats: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  let chats = chatsData.value || [];
  if (chats.length === 0) {
    console.log('No 1:1 chats found. Fetching all available chats…');
    chatTypeLabel = 'all';
    try {
      const allChatsData = await graphGet(accessToken, `/me/chats`);
      chats = allChatsData.value || [];
    } catch (err) {
      console.error(`❌ Failed to fetch chats: ${err.message}`);
      rl.close();
      process.exit(1);
    }
  }

  if (chats.length === 0) {
    console.log('No chats found on this account. Please start a chat in Teams first, then re-run this script.');
    rl.close();
    process.exit(0);
  }
  console.log(`Found ${chats.length} ${chatTypeLabel} chat(s).`);

  // Fetch member names for each chat
  console.log('Fetching member lists…\n');
  const chatDetails = [];
  for (const chat of chats) {
    let memberNames = [];
    try {
      const membersData = await graphGet(accessToken, `/chats/${chat.id}/members`);
      memberNames = (membersData.value || []).map((m) => m.displayName || m.email || '(unknown)');
    } catch {
      memberNames = ['(members unavailable)'];
    }
    chatDetails.push({ id: chat.id, topic: chat.topic || `Chat with ${memberNames.join(', ')}`, members: memberNames });
  }

  // Print numbered list
  chatDetails.forEach((c, i) => {
    console.log(`[${i + 1}] ${c.topic}`);
    console.log(`     Members: ${c.members.join(', ')}`);
    console.log(`     ID: ${c.id}\n`);
  });

  // Prompt for selection
  let selectedIndex = -1;
  while (selectedIndex < 0 || selectedIndex >= chatDetails.length) {
    const answer = (await prompt(rl, `Enter the number of the chat to monitor (1–${chatDetails.length}): `)).trim();
    const parsed = parseInt(answer, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= chatDetails.length) {
      selectedIndex = parsed - 1;
    } else {
      console.log('Invalid selection. Please try again.');
    }
  }

  rl.close();

  const selected = chatDetails[selectedIndex];

  // Save config
  const triggerWords = config.triggerWords || ['/task', '@squad', '@gecho'];
  saveConfig({
    clientId: config.clientId,
    tenantId: config.tenantId,
    chatId: selected.id,
    chatType: 'oneOnOne',
    triggerWords,
  });

  console.log(`\n✅ Configured.`);
  console.log(`   Chat: ${selected.topic || '(1:1 chat)'}`);
  console.log(`   Trigger words: ${triggerWords.join(', ')}`);
  console.log(`   Config saved to: ${CONFIG_PATH}`);
  console.log('\nRun `node .squad/scripts/teams-monitor.js` to start monitoring.');
}

main().catch((err) => {
  console.error(`❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
