'use strict';

/**
 * teams-watch.js — Ralph's persistent Teams watch loop.
 *
 * Polls the Teams chat on an interval, auto-acknowledges new tasks,
 * and writes them to ~/.squad/teams-inbox/ for the squad to process.
 *
 * Usage:
 *   node .squad/scripts/ralph-watch.js              # polls every 30s (default)
 *   node .squad/scripts/ralph-watch.js --interval 60  # polls every 60s
 *
 * Stop with Ctrl+C.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { poll } = require('./teams-monitor');

const SQUAD_DIR = path.join(__dirname, '..');
const INBOX_DIR = path.join(SQUAD_DIR, 'teams-inbox');
const PID_FILE = path.join(SQUAD_DIR, 'ralph-watch.pid');
const LOCK_FILE = path.join(INBOX_DIR, '.ralph-agent.lock');

// Prevent macOS idle sleep while the watch loop runs (display can still lock freely).
// caffeinate -i: inhibit idle system sleep only. No-op on non-macOS.
if (process.platform === 'darwin') {
  spawn('caffeinate', ['-i', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
}

// Parse --interval N (seconds), default 30
const intervalArg = process.argv.indexOf('--interval');
const INTERVAL_SECONDS = intervalArg !== -1 ? parseInt(process.argv[intervalArg + 1], 10) || 30 : 30;
const INTERVAL_MS = INTERVAL_SECONDS * 1000;

let round = 0;
let totalFound = 0;

function banner() {
  console.log('');
  console.log('🔄 Ralph — Teams Watch');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Polling every ${INTERVAL_SECONDS}s`);
  console.log(`   Inbox: ${INBOX_DIR}`);
  console.log('   Press Ctrl+C to stop');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

async function tick() {
  round++;
  try {
    const result = await poll({ autoReply: true });
    if (result.found > 0) {
      totalFound += result.found;
      console.log(`📬 Round ${round}: ${result.found} task(s) queued (${totalFound} total this session)`);
      
      // Concurrency guard: skip if a previous ralph-agent is still alive
      if (fs.existsSync(LOCK_FILE)) {
        try {
          const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
          try {
            process.kill(pid, 0);
            console.log(`[ralph-agent] Already running (PID ${pid}), skipping this poll`);
            return;
          } catch {
            // Stale lockfile — process is dead, remove and proceed
            fs.unlinkSync(LOCK_FILE);
          }
        } catch { /* couldn't read lockfile — proceed */ }
      }

      // Spawn ralph-agent to process the tasks (fire-and-forget)
      const agent = spawn('node', [path.join(__dirname, 'ralph-agent.js')], {
        stdio: 'inherit',
        env: { ...process.env }
      });
      agent.on('exit', (code) => {
        if (code !== 0) {
          console.log(`[ralph-agent] exited with code ${code}`);
        }
      });
    }
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') {
      console.error('❌ AUTH_REQUIRED — run: node .squad/scripts/teams-setup.js');
      cleanup();
      process.exit(1);
    }
    // Network blip — log and continue
    console.log(`[${new Date().toISOString()}] Error: ${err.message} — will retry`);
  }
}

function cleanup() {
  try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
}

// Write PID file so other tools know Ralph is running
fs.mkdirSync(SQUAD_DIR, { recursive: true });
fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');

process.on('SIGINT', () => {
  console.log(`\n\n🔄 Ralph stopping after ${round} rounds, ${totalFound} tasks queued.`);
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

banner();

// Run immediately, then on interval
tick().then(() => {
  setInterval(tick, INTERVAL_MS);
});
