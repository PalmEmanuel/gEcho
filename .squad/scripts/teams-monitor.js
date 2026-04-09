'use strict';

/**
 * teams-monitor.js — Poll a Teams chat for squad task messages.
 *
 * Usage (one-shot):  node .squad/scripts/teams-monitor.js
 * Usage (with ack):  node .squad/scripts/teams-monitor.js --reply
 *
 * Reads:  ~/.squad/teams-config.json    (chatId, clientId, tenantId, triggerWords)
 *         ~/.squad/teams-auth.json      (MSAL token cache)
 *         ~/.squad/teams-last-read.json (dedup cursor)
 *
 * Writes: ~/.squad/teams-inbox/{timestamp}-{slug}.md  (one file per task)
 *         ~/.squad/teams-last-read.json               (updated cursor)
 *
 * Exits:
 *   0 — success (prints "Found N new task(s)" or "No new tasks")
 *   1 — AUTH_REQUIRED printed to stderr (user must re-run teams-setup.js)
 */

const { getNewMessages, sendChatMessage } = require('./teams-graph-client');
const fs = require('fs');
const path = require('path');

const SQUAD_DIR = path.join(__dirname, '..');
const LAST_READ_PATH = path.join(SQUAD_DIR, 'teams-last-read.json');
const INBOX_DIR = path.join(SQUAD_DIR, 'teams-inbox');

const autoReply = process.argv.includes('--reply');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Core poll — exported for ralph-watch.js to call in a loop
// ---------------------------------------------------------------------------

async function poll() {
  let result;
  try {
    result = await getNewMessages();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') throw err;
    console.log(`[${new Date().toISOString()}] Network error — skipping Teams check`);
    return { found: 0 };
  }

  const { tasks, latestMsgId, latestMsgAt, latestProcessedId, latestProcessedAt } = result;

  if (tasks.length === 0) {
    if (latestMsgId) {
      fs.writeFileSync(
        LAST_READ_PATH,
        JSON.stringify({ lastMessageId: latestMsgId, lastReadAt: latestMsgAt }, null, 2),
        'utf8'
      );
    }
    console.log(`[${new Date().toISOString()}] No new tasks`);
    return { found: 0 };
  }

  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }

  for (const task of tasks) {
    const firstLine = task.text.split('\n')[0].trim();
    const slug = slugify(firstLine) || 'task';
    const ts = task.receivedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `${ts}-${slug}.md`;
    const filePath = path.join(INBOX_DIR, filename);

    const content = [
      `# Teams Task`,
      `**From:** ${task.senderName}`,
      `**Received:** ${task.receivedAt}`,
      `**Message ID:** ${task.msgId}`,
      `**Raw message:** ${task.rawText}`,
      ``,
      `## Task`,
      task.text,
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[${new Date().toISOString()}] Task queued: ${filename}`);

    // Auto-acknowledge in Teams if --reply flag is set
    if (autoReply) {
      try {
        const preview = task.text.length > 80 ? task.text.slice(0, 77) + '…' : task.text;
        await sendChatMessage(`👋 Got it, ${task.senderName}! I've queued your task:\n> ${preview}\n\nThe squad will pick this up shortly.`);
        console.log(`[${new Date().toISOString()}] Acknowledged in Teams`);
      } catch {
        console.log(`[${new Date().toISOString()}] Could not send Teams ack (non-fatal)`);
      }
    }
  }

  fs.writeFileSync(
    LAST_READ_PATH,
    JSON.stringify({ lastMessageId: latestProcessedId, lastReadAt: latestProcessedAt }, null, 2),
    'utf8'
  );

  const count = tasks.length;
  console.log(`[${new Date().toISOString()}] Found ${count} new task${count === 1 ? '' : 's'}`);
  return { found: count, tasks };
}

module.exports = { poll };

// ---------------------------------------------------------------------------
// CLI entry point (one-shot)
// ---------------------------------------------------------------------------

if (require.main === module) {
  poll()
    .then(({ found }) => process.exit(found >= 0 ? 0 : 0))
    .catch((err) => {
      if (err.code === 'AUTH_REQUIRED') {
        process.stderr.write('AUTH_REQUIRED\n');
        process.exit(1);
      }
      console.error(err.message);
      process.exit(0);
    });
}
