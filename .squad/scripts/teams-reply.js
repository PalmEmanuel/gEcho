'use strict';

/**
 * teams-reply.js — Post or edit a message in the configured Teams group chat.
 *
 * Usage:
 *   node .squad/scripts/teams-reply.js "message text"
 *   node .squad/scripts/teams-reply.js --file /path/to/message.md
 *   node .squad/scripts/teams-reply.js --edit <messageId> "message text"
 *
 * On failure, falls back to printing the message to stdout so callers
 * (e.g. Ralph) don't crash — just lose the Teams delivery.
 */

const { sendChatMessage, editChatMessage } = require('./teams-graph-client');
const fs = require('fs');

const args = process.argv.slice(2);
let text;
let editMessageId = null;

// Parse flags: --edit only
let startIdx = 0;
while (startIdx < args.length) {
  if (args[startIdx] === '--edit') {
    editMessageId = args[startIdx + 1];
    if (!editMessageId) {
      console.error('Usage: teams-reply.js --edit <messageId> "message text"');
      process.exit(1);
    }
    startIdx += 2;
  } else {
    break;
  }
}

if (args[startIdx] === '--file') {
  const filePath = args[startIdx + 1];
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
  text = args.slice(startIdx).join(' ');
}

if (!text || !text.trim()) {
  console.error('No message text provided.');
  process.exit(1);
}

if (editMessageId) {
  editChatMessage(text, editMessageId)
    .then(() => {
      console.log('Edited');
    })
    .catch((err) => {
      console.error(`Failed to edit Teams message: ${err.message}`);
      console.log(`[Teams edit fallback] ${text}`);
      process.exit(1);
    });
} else {
  sendChatMessage(text)
    .then(({ id }) => {
      if (id) process.stdout.write(`MESSAGE_ID:${id}\n`);
      console.log('Sent');
    })
    .catch((err) => {
      // Fall back to stdout — don't crash the caller
      console.error(`Failed to send to Teams: ${err.message}`);
      console.log(`[Teams reply fallback] ${text}`);
      process.exit(1);
    });
}
