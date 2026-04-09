'use strict';

/**
 * ralph-agent.js — Unattended Teams→Agent→Teams processing.
 *
 * Reads task files from .squad/teams-inbox/ (repo-local), routes them to the right agent,
 * uses @github/copilot-sdk (CopilotClient + sendAndWait) to process tasks,
 * posts responses to Teams, and archives files to .squad/teams-processed/.
 *
 * Usage:
 *   node .squad/scripts/ralph-agent.js  # process all pending tasks
 *   require('./ralph-agent').processInbox()  # programmatic
 *
 * Environment:
 *   SQUAD_DEMO_MODE=true — skip Copilot, simulate responses
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SQUAD_DIR = path.join(__dirname, '..');
const INBOX_DIR = path.join(SQUAD_DIR, 'teams-inbox');
const PROCESSED_DIR = path.join(SQUAD_DIR, 'teams-processed');
const SCRIPTS_DIR = __dirname;
const AGENTS_DIR = path.join(SQUAD_DIR, 'agents');
const LOCK_FILE = path.join(INBOX_DIR, '.ralph-agent.lock');

const DEMO_MODE = process.env.SQUAD_DEMO_MODE === 'true';

// Routing table — order matters, first match wins
const ROUTING_RULES = [
  { keywords: ['test', 'bug', 'qa', 'coverage', 'spec', 'grimoire'], agent: 'grimoire', role: 'Tester' },
  { keywords: ['security', 'auth', 'warden', 'credential', 'token'], agent: 'warden', role: 'Security/Auth' },
  { keywords: ['ci', 'deploy', 'pipeline', 'chronos', 'action', 'workflow', 'github'], agent: 'chronos', role: 'DevOps/CI' },
  { keywords: ['ui', 'frontend', 'vex', 'component', 'css', 'react', 'style'], agent: 'vex', role: 'Frontend Dev' },
  { keywords: ['design', 'sigil', 'color', 'layout', 'visual'], agent: 'sigil', role: 'Designer' },
  { keywords: ['api', 'backend', 'server', 'database', 'endpoint', 'epoch'], agent: 'epoch', role: 'Backend Dev' }
];
const DEFAULT_AGENT = { agent: 'gecko', role: 'Lead' };

/**
 * Invoke Copilot via @github/copilot-sdk (the proper Squad mechanism).
 *
 * Uses CopilotClient which spawns `copilot --acp --stdio` and communicates
 * via JSON-RPC — the same protocol the Squad shell uses internally.
 */
async function invokeCopilot(fullPrompt, timeoutMs = 300_000) {
  const { CopilotClient, approveAll } = await import('@github/copilot-sdk');
  const client = new CopilotClient();
  try {
    const session = await client.createSession({ onPermissionRequest: approveAll });
    const result = await session.sendAndWait({ prompt: fullPrompt }, timeoutMs);
    await session.destroy().catch(() => {});
    return result?.data?.content?.trim() || '';
  } finally {
    await client.stop().catch(() => {});
  }
}

/**
 * Extract a human-readable 1-sentence error summary (no stack trace).
 */
function briefError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return msg.split('\n')[0].replace(/^Error:\s*/i, '').substring(0, 120);
}

/**
 * Strip prompt injection openers and truncate to safe length.
 */
function sanitizePromptInput(text) {
  const INJECTION_PREFIXES = ['SYSTEM:', '[SYSTEM]', 'Ignore previous', 'You are now', 'Forget your', 'Assistant:', 'Human:'];
  let injectionFound = false;
  const cleaned = text.split('\n').filter(line => {
    const trimmed = line.trimStart();
    const isInjection = INJECTION_PREFIXES.some(prefix => trimmed.toLowerCase().startsWith(prefix.toLowerCase()));
    if (isInjection) injectionFound = true;
    return !isInjection;
  });
  if (injectionFound) {
    console.warn('[ralph] Prompt injection attempt stripped from task content');
  }
  let result = cleaned.join('\n');
  if (result.length > 2000) {
    result = result.slice(0, 2000) + '[truncated]';
  }
  return result;
}

/**
 * Match keyword with word boundaries to avoid substring false-positives.
 */
function matchesKeyword(text, keyword) {
  const re = new RegExp(`\\b${keyword}\\b`, 'i');
  return re.test(text);
}

/**
 * Route a task to the appropriate agent based on keyword matching.
 */
function routeTask(taskContent) {
  const lowerTask = taskContent.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(kw => matchesKeyword(lowerTask, kw))) {
      return rule;
    }
  }
  return DEFAULT_AGENT;
}

/**
 * Load agent charter from disk.
 */
function loadCharter(agentName) {
  const charterPath = path.join(AGENTS_DIR, agentName, 'charter.md');
  try {
    return fs.readFileSync(charterPath, 'utf8');
  } catch (err) {
    console.warn(`[ralph-agent] Warning: Could not read charter for ${agentName}: ${err.message}`);
    return `You are ${agentName}, a member of the gEcho squad.`;
  }
}

/**
 * Parse task content from the markdown file.
 */
function parseTaskContent(fileContent) {
  // Expected format:
  // # Teams Task
  // **From:** Emanuel Palm
  // **Received:** 2026-04-09T14:00:00.000Z
  // **Message ID:** abc123...
  // **Raw message:** @squad fix the broken test
  //
  // ## Task
  // fix the broken test
  
  const taskMatch = fileContent.match(/## Task\s+([\s\S]+)/);
  if (taskMatch) {
    return taskMatch[1].trim();
  }
  // Fallback: return full content
  return fileContent;
}

/**
 * Parse the user's original message ID from the task file.
 */
function parseMessageId(fileContent) {
  const msgIdMatch = fileContent.match(/\*\*User Message ID:\*\*\s+(.+)/);
  return msgIdMatch ? msgIdMatch[1].trim() : null;
}

/**
 * Post response to Teams using teams-reply.js.
 * Returns { success, messageId } — messageId parsed from stdout MESSAGE_ID line.
 */
function postToTeams(responseText) {
  const args = [path.join(SCRIPTS_DIR, 'teams-reply.js'), responseText];
    
  const result = spawnSync('node', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit']
  });

  if (result.status !== 0) {
    console.error(`[ralph-agent] teams-reply.js exited with code ${result.status}`);
    return { success: false, messageId: null };
  }

  const match = (result.stdout || '').match(/^MESSAGE_ID:(.+)$/m);
  return { success: true, messageId: match ? match[1].trim() : null };
}

/**
 * Archive a task file to the processed directory.
 */
function archiveTask(filename) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  const sourcePath = path.join(INBOX_DIR, filename);
  const destPath = path.join(PROCESSED_DIR, filename);
  fs.renameSync(sourcePath, destPath);
  console.log(`[ralph-agent] Archived: ${filename}`);
}

/**
 * Process a single task file using inline Copilot CLI interaction.
 */
async function processTask(filename) {
  console.log(`[ralph-agent] Processing: ${filename}`);
  
  const filePath = path.join(INBOX_DIR, filename);

  let fileContent;
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } catch (readErr) {
    console.error(`[ralph-agent] Cannot read task file ${filename}: ${readErr.message}`);
    try {
      postToTeams(`⚠️ Couldn't process your request — task file unreadable. Try again?`);
    } catch { /* Teams unreachable */ }
    try { archiveTask(filename); } catch { /* file may not exist */ }
    return { success: false, agent: DEFAULT_AGENT.agent, error: readErr.message };
  }

  const taskContent = parseTaskContent(fileContent);
  const userMessageId = parseMessageId(fileContent);

  const { agent, role } = routeTask(taskContent);
  console.log(`[ralph-agent] Routed to: ${agent.charAt(0).toUpperCase() + agent.slice(1)} (${role})`);

  // Auth check
  if (!process.env.GITHUB_TOKEN) {
    console.error('[ralph-agent] GITHUB_TOKEN not set');
    postToTeams('⚠️ Ralph agent can\'t process this task — GITHUB_TOKEN not set on the Mac. Please set it in your shell environment.');
    archiveTask(filename);
    return { success: false, agent, error: 'GITHUB_TOKEN not set' };
  }

  // Demo mode fallback
  if (process.env.SQUAD_DEMO_MODE === 'true') {
    console.log('[ralph-agent] DEMO MODE — simulating response');
    const demoResponse = `[DEMO] ${agent.charAt(0).toUpperCase() + agent.slice(1)} would process: "${taskContent.substring(0, 50)}${taskContent.length > 50 ? '...' : ''}"`;
    postToTeams(demoResponse);
    archiveTask(filename);
    return { success: true, agent, demo: true };
  }

  const charter = loadCharter(agent);
  const agentName = agent.charAt(0).toUpperCase() + agent.slice(1);
  const sanitizedTask = sanitizePromptInput(taskContent);
  const systemContext = `You are ${agentName}, the ${role} on the gEcho project.\n\n${charter ? `YOUR CHARTER:\n${charter}\n\n` : ''}This task came via Teams chat - respond in 2-4 sentences.`;
  const fullPrompt = `${systemContext}\n\nTASK:\n${sanitizedTask}`;

  console.log('[ralph-agent] Invoking Copilot SDK...');

  let responseText;
  let sdkError = null;

  try {
    const raw = await invokeCopilot(fullPrompt, 300_000);
    if (!raw) throw new Error('Got empty response from Copilot SDK');
    responseText = raw;
  } catch (err) {
    sdkError = err;
  }

  // Retry once for transient network errors
  if (sdkError && (sdkError.code === 'ENOTFOUND' || sdkError.code === 'ETIMEDOUT' || sdkError.code === 'ECONNRESET')) {
    console.log('[ralph-agent] Network error, retrying in 5s...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      return await processTask(filename);
    } catch (retryErr) {
      console.error(`[ralph-agent] Retry failed: ${retryErr.message}`);
      sdkError = retryErr;
    }
  }

  if (sdkError) {
    console.error(`[ralph-agent] SDK error processing ${filename}: ${sdkError.message}`);
    try {
      const isTimeout = sdkError.message && sdkError.message.toLowerCase().includes('timeout');
      const userMsg = isTimeout
        ? `Ran out of time on that one — the task was too complex for one round. Try breaking it into smaller steps.`
        : `Couldn't process your request — ${briefError(sdkError)}. Try again?`;
      postToTeams(userMsg);
    } catch (postErr) {
      console.error('[ralph] Final Teams post failed:', postErr.message);
    }
    archiveTask(filename);
    return { success: false, agent, error: sdkError.message };
  }

  console.log(`[ralph-agent] Got response (${responseText.length} chars)`);
  if (userMessageId) {
    console.log(`[ralph-agent] Replying in context of user message: ${userMessageId}`);
  }

  // Post result as a new message (Teams 1:1 chats don't support threaded replies)
  const posted = postToTeams(`${agentName}: ${responseText}`);
  if (!posted.success) {
    console.error('[ralph-agent] Failed to post result to Teams — Teams may be unreachable');
  } else {
    console.log('[ralph-agent] Posted response to Teams');
  }

  archiveTask(filename);
  return { success: true, agent, responseLength: responseText.length };
}

/**
 * Process all pending inbox files.
 */
async function processInbox() {
  // Ensure directories exist
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(INBOX_DIR)) {
    console.log('[ralph-agent] Inbox directory does not exist — nothing to process');
    return { processed: 0 };
  }
  
  const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('[ralph-agent] No tasks in inbox');
    return { processed: 0 };
  }
  
  console.log(`[ralph-agent] Found ${files.length} task(s) in inbox`);
  
  const results = [];
  for (const file of files) {
    try {
      const result = await processTask(file);
      results.push(result);
    } catch (err) {
      console.error(`[ralph-agent] Unexpected error with ${file}: ${err.message}`);
      results.push({ success: false, error: err.message });
    }
  }
  
  const summary = {
    processed: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  };
  
  return summary;
}

// Programmatic mode
module.exports = { processInbox };

// CLI mode
if (require.main === module) {
  // Concurrency guard: write lockfile so teams-watch.js can detect a running agent
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  process.on('exit', () => {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ }
  });

  processInbox()
    .then(({ processed }) => {
      console.log(`[ralph-agent] Done. Processed ${processed} task(s).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[ralph-agent] Fatal:`, err.message);
      process.exit(1);
    });
}
