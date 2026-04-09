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

const { getNewMessages } = require('./teams-graph-client');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SQUAD_DIR = path.join(os.homedir(), '.squad');
const LAST_READ_PATH = path.join(SQUAD_DIR, 'teams-last-read.json');
const INBOX_DIR = path.join(SQUAD_DIR, 'teams-inbox');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a filesystem-safe slug from the first line of a message. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let result;
  try {
    result = await getNewMessages();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') {
      process.stderr.write('AUTH_REQUIRED\n');
      process.exit(1);
    }
    console.log('Network error — skipping Teams check');
    process.exit(0);
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
    console.log('No new tasks');
    process.exit(0);
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
      `**Raw message:** ${task.rawText}`,
      ``,
      `## Task`,
      task.text,
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
  }

  fs.writeFileSync(
    LAST_READ_PATH,
    JSON.stringify({ lastMessageId: latestProcessedId, lastReadAt: latestProcessedAt }, null, 2),
    'utf8'
  );

  const count = tasks.length;
  console.log(`Found ${count} new task${count === 1 ? '' : 's'}`);
  process.exit(0);
}

main().catch((err) => {
  if (err.code === 'AUTH_REQUIRED') {
    process.stderr.write('AUTH_REQUIRED\n');
    process.exit(1);
  }
  console.log('Network error — skipping Teams check');
  process.exit(0);
});
