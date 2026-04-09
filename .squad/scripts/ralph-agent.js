'use strict';

/**
 * ralph-agent.js — Unattended Teams→Agent→Teams processing.
 *
 * Reads task files from .squad/teams-inbox/ (repo-local), routes them to the right agent,
 * uses @bradygaster/squad-sdk (or demo mode fallback) to process tasks,
 * posts responses to Teams, and archives files to .squad/teams-processed/.
 *
 * Usage:
 *   node .squad/scripts/ralph-agent.js  # process all pending tasks
 *   require('./ralph-agent').processInbox()  # programmatic
 *
 * Environment:
 *   GITHUB_TOKEN — required for Copilot (unless SQUAD_DEMO_MODE=true)
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

// Squad SDK (ESM, loaded dynamically)
let squadSDK = null;

async function getSquadSDK() {
  if (squadSDK !== null) return squadSDK;
  try {
    squadSDK = await import('@bradygaster/squad-sdk/client');
    return squadSDK;
  } catch (e) {
    console.log(`[ralph-agent] squad-sdk unavailable: ${e.message}`);
    squadSDK = false;
    return false;
  }
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
 * Build system message for the Copilot session.
 */
function buildSystemMessage(agentName, agentRole, charter) {
  return `You are ${agentName.charAt(0).toUpperCase() + agentName.slice(1)}, the ${agentRole} on the gEcho project.

${charter}

You are responding to a task sent via Microsoft Teams. Keep your reply concise and actionable — it will be posted back to the Teams chat. Aim for 2-4 sentences or a short bullet list. If you need to reference code, use a small inline snippet.`;
}

/**
 * Ask Copilot via squad-sdk or fallback to demo mode.
 */
async function askCopilot(agentName, agentRole, charter, taskText) {
  const systemMessage = buildSystemMessage(agentName, agentRole, charter);

  if (DEMO_MODE) {
    console.log('[ralph-agent] [DEMO MODE] Simulating Copilot response');
    return `[${agentName}] Got it! I'll look into: "${taskText.slice(0, 60)}${taskText.length > 60 ? '...' : ''}" (demo mode — no real work done)`;
  }

  const sdk = await getSquadSDK();
  if (!sdk) {
    console.log('[ralph-agent] Falling back to demo mode (SDK unavailable)');
    return `[${agentName}] Task received: "${taskText.slice(0, 60)}${taskText.length > 60 ? '...' : ''}" — Squad SDK unavailable, integration pending.`;
  }

  try {
    // SDK integration placeholder — refined once SDK dependency issue is resolved
    console.log('[ralph-agent] SDK loaded but full integration pending');
    return `[${agentName}] Task queued: "${taskText.slice(0, 60)}${taskText.length > 60 ? '...' : ''}" — SDK integration in progress.`;
  } catch (err) {
    console.error(`[ralph-agent] Copilot session error: ${err.message}`);
    return `[${agentName}] Error processing task — please retry or contact the team.`;
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
 * Parse the original message ID from the task file.
 */
function parseMessageId(fileContent) {
  const msgIdMatch = fileContent.match(/\*\*Message ID:\*\*\s+(.+)/);
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
 * Edit an existing Teams message using teams-reply.js --edit.
 */
function editTeamsMessage(text, editMessageId) {
  const args = [path.join(SCRIPTS_DIR, 'teams-reply.js'), '--edit', editMessageId, text];

  const result = spawnSync('node', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit']
  });
  if (result.status !== 0) {
    console.error(`[ralph-agent] editTeamsMessage failed with code ${result.status}`);
  }
  return result.status === 0;
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
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const taskContent = parseTaskContent(fileContent);
  const originalMessageId = parseMessageId(fileContent);
  
  const { agent, role } = routeTask(taskContent);
  console.log(`[ralph-agent] Routed to: ${agent.charAt(0).toUpperCase() + agent.slice(1)} (${role})`);
  
  // Auth check
  if (!process.env.GITHUB_TOKEN) {
    console.error('[ralph-agent] GITHUB_TOKEN not set');
    postToTeams('⚠️ Ralph agent can\'t process this task — GITHUB_TOKEN not set on the Mac. Please set it in your shell environment.', originalMessageId);
    archiveTask(filename);
    return { success: false, agent, error: 'GITHUB_TOKEN not set' };
  }
  
  // Demo mode fallback
  if (process.env.SQUAD_DEMO_MODE === 'true') {
    console.log('[ralph-agent] DEMO MODE — simulating response');
    const demoResponse = `[DEMO] ${agent.charAt(0).toUpperCase() + agent.slice(1)} would process: "${taskContent.substring(0, 50)}${taskContent.length > 50 ? '...' : ''}"`;
    postToTeams(demoResponse, originalMessageId);
    archiveTask(filename);
    return { success: true, agent, demo: true };
  }
  
  try {
    // Load agent charter
    const charter = loadCharter(agent);
    const agentName = agent.charAt(0).toUpperCase() + agent.slice(1);

    // Phase 1 — post ack immediately so user knows it's being worked on
    const ackText = `⏳ ${agentName} is working on it…`;
    const ackResult = postToTeams(ackText);
    const ackMessageId = ackResult.messageId;
    console.log(`[ralph-agent] Posted ack (${ackMessageId || 'no id'})`);
    
    // Build a concise summary prompt for the agent
    const prompt = `You are ${agentName}, the ${role} on the gEcho project. This task came via Teams chat - respond in 2-4 sentences:\n\n${taskContent}`;
    
    console.log('[ralph-agent] Invoking GitHub Copilot CLI...');
    
    // Use gh copilot -p for non-interactive mode
    const result = spawnSync('gh', ['copilot', '-p', prompt], {
      env: { ...process.env },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 120_000 // 2 minute timeout
    });
    
    if (result.error) {
      throw new Error(`Failed to spawn GitHub Copilot CLI: ${result.error.message}`);
    }
    
    if (result.status !== 0) {
      throw new Error(`GitHub Copilot CLI exited with code ${result.status}: ${result.stderr || result.stdout}`);
    }
    
    let responseText = result.stdout.trim();
    if (!responseText) {
      throw new Error('Got empty response from GitHub Copilot CLI');
    }
    
    // Clean up the response (gh copilot adds formatting we don't want)
    // Extract the actual response, removing any CLI noise
    const lines = responseText.split('\n');
    const contentLines = lines.filter(line => 
      !line.startsWith('Explanation:') && 
      !line.includes('GitHub Copilot') &&
      line.trim().length > 0
    );
    responseText = contentLines.join('\n').trim();
    
    console.log(`[ralph-agent] Got response (${responseText.length} chars)`);
    
    // Phase 2 — edit the ack with the real response, or fall back to new message
    if (ackMessageId) {
      const edited = editTeamsMessage(`${agentName}: ${responseText}`, ackMessageId);
      if (edited) {
        console.log('[ralph-agent] Edited ack with response');
      } else {
        console.warn('[ralph-agent] Edit failed — posting new message');
        const fallback = postToTeams(`${agentName}: ${responseText}`);
        console.log(`[ralph-agent] Fallback post: ${fallback.success ? 'ok' : 'FAILED'}`);
      }
    } else {
      const posted = postToTeams(`${agentName}: ${responseText}`);
      console.log(`[ralph-agent] Posted response to Teams: ${posted.success ? 'ok' : 'FAILED'}`);
    }
    
    // Archive
    archiveTask(filename);
    
    return { success: true, agent, responseLength: responseText.length };
    
  } catch (err) {
    console.error(`[ralph-agent] Error processing ${filename}: ${err.message}`);
    
    // Retry once after 5s for network errors
    if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      console.log('[ralph-agent] Network error, retrying in 5s...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        return await processTask(filename);
      } catch (retryErr) {
        console.error(`[ralph-agent] Retry failed: ${retryErr.message}`);
      }
    }
    
    // Post error to Teams — edit ack if available, else new reply
    const agentName = agent.charAt(0).toUpperCase() + agent.slice(1);
    const errorMsg = `❌ ${agentName} hit an error: ${err.message}`;
    if (typeof ackMessageId !== 'undefined' && ackMessageId) {
      editTeamsMessage(errorMsg, ackMessageId, originalMessageId) || postToTeams(errorMsg, originalMessageId);
    } else {
      postToTeams(errorMsg, originalMessageId);
    }
    
    // Archive anyway
    archiveTask(filename);
    
    return { success: false, agent, error: err.message };
  }
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
