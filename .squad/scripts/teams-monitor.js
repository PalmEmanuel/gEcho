'use strict';

/**
 * teams-monitor.js — Poll a Teams group chat for squad task messages.
 *
 * Usage: node .squad/scripts/teams-monitor.js
 *
 * Reads:  ~/.squad/teams-config.json   (chatId, clientId, tenantId, triggerWords)
 *         ~/.squad/teams-auth.json     (MSAL token cache)
 *         ~/.squad/teams-last-read.json (dedup cursor)
 *
 * Writes: ~/.squad/teams-inbox/{timestamp}-{slug}.md  (one file per task)
 *         ~/.squad/teams-last-read.json               (updated cursor)
 *
 * Exits:
 *   0 — success (prints "Found N new task(s)" or "No new tasks")
 *   1 — AUTH_REQUIRED printed to stderr (user must re-run teams-setup.js)
 */

const msal = require('@azure/msal-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SQUAD_DIR = path.join(os.homedir(), '.squad');
const CONFIG_PATH = path.join(SQUAD_DIR, 'teams-config.json');
const AUTH_PATH = path.join(SQUAD_DIR, 'teams-auth.json');
const LAST_READ_PATH = path.join(SQUAD_DIR, 'teams-last-read.json');
const INBOX_DIR = path.join(SQUAD_DIR, 'teams-inbox');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const DEFAULT_TRIGGER_WORDS = ['/task', '@squad', '@gecho'];
const FALLBACK_LOOKBACK_MINUTES = 30;
const MAX_MESSAGES = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function graphGet(accessToken, apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(GRAPH_BASE + apiPath);
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
          const err = new Error('401 Unauthorized');
          err.code = 'AUTH_REQUIRED';
          reject(err);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Graph API ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Failed to parse Graph response: ${body}`));
        }
      });
    });
    req.on('error', (err) => {
      err.code = 'NETWORK_ERROR';
      reject(err);
    });
    req.end();
  });
}

/** Strip HTML tags from Graph message body (content type may be html). */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

/** Produce a filesystem-safe slug from the first line of a message. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Return the trigger word that prefixes this text, or null. */
function matchTriggerWord(text, triggerWords) {
  const lower = text.toLowerCase();
  for (const word of triggerWords) {
    if (lower.startsWith(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

/** Return true if the sender appears to be a bot / the squad itself. */
function isBotSender(displayName) {
  if (!displayName) return false;
  const lower = displayName.toLowerCase();
  return lower.includes('squad') || lower.includes('bot') || lower.includes('gecho');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load config
  const config = loadJson(CONFIG_PATH, null);
  if (!config || !config.chatId || !config.clientId || !config.tenantId) {
    console.error('AUTH_REQUIRED: Missing teams-config.json or required fields (chatId, clientId, tenantId). Run teams-setup.js.');
    process.exit(1);
  }

  const triggerWords = Array.isArray(config.triggerWords) && config.triggerWords.length > 0
    ? config.triggerWords
    : DEFAULT_TRIGGER_WORDS;

  // Build MSAL PCA and restore cache
  const msalConfig = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  };
  const pca = new msal.PublicClientApplication(msalConfig);

  if (!fs.existsSync(AUTH_PATH)) {
    process.stderr.write('AUTH_REQUIRED\n');
    process.exit(1);
  }

  try {
    const serialized = fs.readFileSync(AUTH_PATH, 'utf8');
    pca.getTokenCache().deserialize(serialized);
  } catch {
    process.stderr.write('AUTH_REQUIRED\n');
    process.exit(1);
  }

  // Acquire token silently
  let accessToken;
  try {
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (!accounts || accounts.length === 0) {
      process.stderr.write('AUTH_REQUIRED\n');
      process.exit(1);
    }
    const silentRequest = {
      scopes: ['Chat.Read', 'User.Read'],
      account: accounts[0],
    };
    const result = await pca.acquireTokenSilent(silentRequest);
    accessToken = result.accessToken;

    // Persist refreshed cache
    const updated = pca.getTokenCache().serialize();
    fs.writeFileSync(AUTH_PATH, updated, 'utf8');
  } catch (err) {
    process.stderr.write('AUTH_REQUIRED\n');
    process.exit(1);
  }

  // Determine cutoff time
  const lastRead = loadJson(LAST_READ_PATH, { lastMessageId: null, lastReadAt: null });
  let cutoffDate;
  if (lastRead.lastReadAt) {
    cutoffDate = new Date(lastRead.lastReadAt);
  } else {
    cutoffDate = new Date(Date.now() - FALLBACK_LOOKBACK_MINUTES * 60 * 1000);
  }

  // Fetch recent messages
  let messagesData;
  const encodedFilter = encodeURIComponent(`createdDateTime gt '${cutoffDate.toISOString()}'`);
  try {
    messagesData = await graphGet(
      accessToken,
      `/chats/${config.chatId}/messages?$top=${MAX_MESSAGES}&$orderby=createdDateTime desc`
    );
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') {
      process.stderr.write('AUTH_REQUIRED\n');
      process.exit(1);
    }
    if (err.code === 'NETWORK_ERROR') {
      console.log('Network error — skipping Teams check');
      process.exit(0);
    }
    console.log(`Network error — skipping Teams check`);
    process.exit(0);
  }

  const messages = messagesData.value || [];

  if (messages.length >= MAX_MESSAGES) {
    console.error(`Warning: received ${MAX_MESSAGES} messages (the maximum). Some messages may have been missed.`);
  }

  // Filter to messages after cutoff, with trigger word, not from bot
  const newMessages = messages.filter((msg) => {
    if (!msg.createdDateTime) return false;
    if (new Date(msg.createdDateTime) <= cutoffDate) return false;

    const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || '';
    if (isBotSender(senderName)) return false;

    const rawBody = msg.body?.content || '';
    const text = msg.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody;
    return matchTriggerWord(text, triggerWords) !== null;
  });

  // Reverse so oldest first (messages came back newest-first)
  newMessages.reverse();

  if (newMessages.length === 0) {
    // Update lastReadAt so next run doesn't re-scan old window
    const latestMsg = messages[0];
    if (latestMsg) {
      fs.writeFileSync(
        LAST_READ_PATH,
        JSON.stringify({ lastMessageId: latestMsg.id, lastReadAt: latestMsg.createdDateTime }, null, 2),
        'utf8'
      );
    }
    console.log('No new tasks');
    process.exit(0);
  }

  // Ensure inbox dir exists
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }

  // Write task files
  for (const msg of newMessages) {
    const rawBody = msg.body?.content || '';
    const text = msg.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody;
    const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || 'Unknown';
    const receivedAt = msg.createdDateTime || new Date().toISOString();

    const triggerWord = matchTriggerWord(text, triggerWords);
    const taskBody = triggerWord
      ? text.slice(triggerWord.length).trimStart()
      : text;

    const firstLine = taskBody.split('\n')[0].trim();
    const slug = slugify(firstLine) || 'task';
    const ts = receivedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `${ts}-${slug}.md`;
    const filePath = path.join(INBOX_DIR, filename);

    const content = [
      `# Teams Task`,
      `**From:** ${senderName}`,
      `**Received:** ${receivedAt}`,
      `**Chat:** ${config.chatId}`,
      `**Raw message:** ${text}`,
      ``,
      `## Task`,
      taskBody,
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // Update last-read cursor to the latest message processed
  const latestProcessed = newMessages[newMessages.length - 1];
  fs.writeFileSync(
    LAST_READ_PATH,
    JSON.stringify(
      { lastMessageId: latestProcessed.id, lastReadAt: latestProcessed.createdDateTime },
      null,
      2
    ),
    'utf8'
  );

  const count = newMessages.length;
  console.log(`Found ${count} new task${count === 1 ? '' : 's'}`);
  process.exit(0);
}

main().catch((err) => {
  if (err.code === 'AUTH_REQUIRED') {
    process.stderr.write('AUTH_REQUIRED\n');
    process.exit(1);
  }
  // Network / unexpected
  console.log(`Network error — skipping Teams check`);
  process.exit(0);
});
