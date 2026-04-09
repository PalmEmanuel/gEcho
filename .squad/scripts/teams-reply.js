'use strict';

/**
 * teams-reply.js — Post a message to the configured Teams group chat.
 *
 * Usage:
 *   node .squad/scripts/teams-reply.js "message text"
 *   node .squad/scripts/teams-reply.js --file /path/to/message.md
 *
 * On failure, falls back to printing the message to stdout so callers
 * (e.g. Ralph) don't crash — just lose the Teams delivery.
 */

const { sendChatMessage } = require('./teams-graph-client');
const fs = require('fs');

const args = process.argv.slice(2);
let text;

if (args[0] === '--file') {
  const filePath = args[1];
  if (!filePath) {
    console.error('Usage: teams-reply.js --file /path/to/message.md');
    process.exit(1);
  }
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`Failed to read file: ${err.message}`);
    process.exit(1);
  }
} else {
  text = args.join(' ');
}

if (!text || !text.trim()) {
  console.error('No message text provided.');
  process.exit(1);
}

sendChatMessage(text)
  .then(() => {
    console.log('Sent');
  })
  .catch((err) => {
    // Fall back to stdout — don't crash the caller
    console.error(`Failed to send to Teams: ${err.message}`);
    console.log(`[Teams reply fallback] ${text}`);
    process.exit(1);
  });
