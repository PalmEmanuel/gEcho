'use strict';

/**
 * teams-graph-client.js — Shared Graph API client for Teams integration.
 *
 * Exports: acquireToken(), getNewMessages(), sendChatMessage(text)
 */

const msal = require('@azure/msal-node');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SQUAD_DIR = path.join(os.homedir(), '.squad');
const CONFIG_PATH = path.join(SQUAD_DIR, 'teams-config.json');
const AUTH_PATH = path.join(SQUAD_DIR, 'teams-auth.json');
// Cursor is repo-local (gitignored) — must match the path teams-monitor.js writes to.
const LAST_READ_PATH = path.join(__dirname, '..', 'teams-last-read.json');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const FALLBACK_LOOKBACK_MINUTES = 30;
const MAX_MESSAGES_PER_PAGE = 50;

// ---------------------------------------------------------------------------
// Config / cache helpers
// ---------------------------------------------------------------------------

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadConfig() {
  return loadJson(CONFIG_PATH, null);
}

function loadTokenCache() {
  if (!fs.existsSync(AUTH_PATH)) return null;
  try {
    return fs.readFileSync(AUTH_PATH, 'utf8');
  } catch {
    return null;
  }
}

function saveTokenCache(serialized) {
  fs.writeFileSync(AUTH_PATH, serialized, 'utf8');
  fs.chmodSync(AUTH_PATH, 0o600);
}

// ---------------------------------------------------------------------------
// MSAL — acquire token silently (with refresh)
// ---------------------------------------------------------------------------

async function acquireToken() {
  const config = loadConfig();
  if (!config || !config.clientId || !config.tenantId) {
    const err = new Error('Missing teams-config.json or required fields. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const serialized = loadTokenCache();
  if (!serialized) {
    const err = new Error('No token cache found. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const msalConfig = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  };
  const pca = new msal.PublicClientApplication(msalConfig);

  try {
    pca.getTokenCache().deserialize(serialized);
  } catch {
    const err = new Error('Failed to deserialize token cache. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const accounts = await pca.getTokenCache().getAllAccounts();
  if (!accounts || accounts.length === 0) {
    const err = new Error('No accounts in token cache. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const result = await pca.acquireTokenSilent({
    scopes: ['Chat.ReadWrite', 'User.Read'],
    account: accounts[0],
  });

  saveTokenCache(pca.getTokenCache().serialize());
  return result.accessToken;
}

// ---------------------------------------------------------------------------
// Graph HTTP helpers
// ---------------------------------------------------------------------------

function graphRequest(method, apiPath, accessToken, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(GRAPH_BASE + apiPath);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 401) {
          const err = new Error('401 Unauthorized');
          err.code = 'AUTH_REQUIRED';
          reject(err);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Graph API ${res.statusCode}: ${data}`));
          return;
        }
        if (!data.trim()) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse Graph response: ${data}`));
        }
      });
    });
    req.on('error', (err) => {
      err.code = 'NETWORK_ERROR';
      reject(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Strip HTML tags for plain-text extraction
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Convert plain text to simple Teams-renderable HTML
// ---------------------------------------------------------------------------

// Teams Fluent emoji tags: <emoji id="SHORTNAME" alt="ASCII_LABEL"></emoji>
// alt must be ASCII — raw Unicode in alt causes Graph API 400 errors.
const TEAMS_EMOJI = {
  '👋': { id: 'wavinghand',      label: 'wave'     },
  '✅': { id: 'checkmarkbutton', label: 'check'    },
  '⚡': { id: 'highvoltage',     label: 'zap'      },
  '⏳': { id: 'hourglassnotdone',label: 'hourglass'},
  '❌': { id: 'crossmark',       label: 'x'        },
  '⚠️': { id: 'warning',         label: 'warning'  },
};

function textToHtml(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  // Replace unicode emoji with Teams Fluent emoji tags.
  // unicode chars survive HTML escaping unchanged, so we replace after escaping.
  for (const [char, { id, label }] of Object.entries(TEAMS_EMOJI)) {
    html = html.split(char).join(`<emoji id="${id}" alt="${label}"></emoji>`);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch new trigger-word messages from the configured chat.
 * Returns { tasks: Array<{text, senderName, receivedAt, msgId}>, latestMsgId, latestMsgAt }
 */
async function getNewMessages() {
  const config = loadConfig();
  if (!config || !config.chatId) {
    const err = new Error('Missing chatId in teams-config.json. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const DEFAULT_TRIGGER_WORDS = ['/task', '@squad', '@gecho'];
  const triggerWords = Array.isArray(config.triggerWords) && config.triggerWords.length > 0
    ? config.triggerWords
    : DEFAULT_TRIGGER_WORDS;

  const accessToken = await acquireToken();

  const lastRead = loadJson(LAST_READ_PATH, { lastMessageId: null, lastReadAt: null });
  const cutoffDate = lastRead.lastReadAt
    ? new Date(lastRead.lastReadAt)
    : new Date(Date.now() - FALLBACK_LOOKBACK_MINUTES * 60 * 1000);

  // Filter server-side so we only receive messages newer than the last poll.
  // This avoids the "hit the page limit" problem entirely for normal usage.
  const isoFilter = cutoffDate.toISOString();
  let url = `/chats/${config.chatId}/messages?$top=${MAX_MESSAGES_PER_PAGE}&$filter=createdDateTime gt ${isoFilter}`;
  const messages = [];
  while (url) {
    const page = await graphRequest('GET', url, accessToken);
    const items = page?.value || [];
    messages.push(...items);
    // Follow @odata.nextLink if the page was full (strip the base URL prefix)
    const next = page?.['@odata.nextLink'];
    url = next ? next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '') : null;
  }

  const newMessages = messages.filter((msg) => {
    if (!msg.createdDateTime) return false;
    const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || '';
    if (isBotSender(senderName, config)) return false;
    const rawBody = msg.body?.content || '';
    const text = msg.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody;
    return matchTriggerWord(text, triggerWords) !== null;
  });

  newMessages.reverse(); // oldest first

  const latestMsg = messages[0] || null;
  const latestProcessed = newMessages.length > 0 ? newMessages[newMessages.length - 1] : null;

  const tasks = newMessages.map((msg) => {
    const rawBody = msg.body?.content || '';
    const text = msg.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody;
    const senderName = msg.from?.user?.displayName || msg.from?.application?.displayName || 'Unknown';
    const triggerWord = matchTriggerWord(text, triggerWords);
    const taskBody = triggerWord ? text.slice(triggerWord.length).trimStart() : text;
    return { text: taskBody, rawText: text, senderName, receivedAt: msg.createdDateTime, msgId: msg.id };
  });

  return {
    tasks,
    latestMsgId: latestMsg?.id || null,
    latestMsgAt: latestMsg?.createdDateTime || null,
    latestProcessedId: latestProcessed?.id || null,
    latestProcessedAt: latestProcessed?.createdDateTime || null,
  };
}

/**
 * Post a message to the configured chat.
 * @param {string} text - Plain text or HTML content to send.
 */
async function sendChatMessage(text) {
  const config = loadConfig();
  if (!config || !config.chatId) {
    const err = new Error('Missing chatId in teams-config.json. Run teams-setup.js.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const accessToken = await acquireToken();
  const html = textToHtml(text);

  // Always post as a new top-level chat message.
  // The /replies sub-path returns 405 on group chats via Graph API.
  const result = await graphRequest(
    'POST',
    `/chats/${config.chatId}/messages`,
    accessToken,
    { body: { contentType: 'html', content: html } }
  );

  let id = result?.id || null;

  // Fallback: if POST didn't return a body, GET the latest message in the chat.
  if (!id) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const latest = await graphRequest(
        'GET',
        `/chats/${config.chatId}/messages?$top=5`,
        accessToken
      );
      const msgs = (latest?.value || []).sort(
        (a, b) => new Date(b.createdDateTime) - new Date(a.createdDateTime)
      );
      id = msgs[0]?.id || null;
    } catch {
      // GET failed — id stays null
    }
  }

  return { id };
}

/**
 * Edit an existing top-level message in the configured chat.
 * @param {string} text - New plain text content.
 * @param {string} messageId - ID of the message to edit.
 */
async function editChatMessage(text, messageId) {
  const config = loadConfig();
  if (!config || !config.chatId) {
    const err = new Error('Missing chatId in teams-config.json.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  const accessToken = await acquireToken();
  const html = textToHtml(text);
  await graphRequest('PATCH', `/chats/${config.chatId}/messages/${messageId}`, accessToken, {
    body: { contentType: 'html', content: html }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers (also used by getNewMessages)
// ---------------------------------------------------------------------------

function matchTriggerWord(text, triggerWords) {
  const lower = text.toLowerCase();
  for (const word of triggerWords) {
    if (lower.startsWith(word.toLowerCase())) return word;
  }
  return null;
}

let _botHeuristicWarnShown = false;

function isBotSender(displayName, config) {
  if (!displayName) return false;
  const lower = displayName.toLowerCase();
  if (config && Array.isArray(config.botDisplayNames) && config.botDisplayNames.length > 0) {
    return config.botDisplayNames.some(name => name.toLowerCase() === lower);
  }
  if (!_botHeuristicWarnShown) {
    console.warn('[teams] botDisplayNames not configured — using heuristic bot detection');
    _botHeuristicWarnShown = true;
  }
  return lower.includes('squad') || lower.includes('bot') || lower.includes('gecho');
}

module.exports = { acquireToken, getNewMessages, sendChatMessage, editChatMessage };
