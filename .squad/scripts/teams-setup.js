#!/usr/bin/env node
'use strict';

/**
 * teams-setup.js — Interactive setup for Teams integration.
 *
 * Prompts for:
 * - Azure AD App client ID
 * - Tenant ID
 * - Teams chat ID (graph-style: group@thread.v2)
 * - Bot display names (for filtering self-messages)
 *
 * Writes:
 * - ~/.squad/teams-config.json (with chmod 600)
 * - ~/.squad/teams-auth.json (MSAL token cache, with chmod 600)
 *
 * Usage:
 *   node .squad/scripts/teams-setup.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const msal = require('@azure/msal-node');

const SQUAD_DIR = path.join(os.homedir(), '.squad');
const CONFIG_PATH = path.join(SQUAD_DIR, 'teams-config.json');
const AUTH_PATH = path.join(SQUAD_DIR, 'teams-auth.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🔧 Teams Integration Setup');
  console.log('═══════════════════════════════════════════\n');

  // Ensure ~/.squad directory exists
  if (!fs.existsSync(SQUAD_DIR)) {
    fs.mkdirSync(SQUAD_DIR, { recursive: true });
  }

  // Prompt for configuration
  console.log('Enter your Azure AD / Microsoft Entra app details:');
  const clientId = await question('  Client ID (app registration): ');
  const tenantId = await question('  Tenant ID: ');
  const chatId = await question('  Teams Chat ID (group@thread.v2): ');

  console.log('\nEnter bot display names to filter (comma-separated, e.g. "Ralph Squad Bot, Gecho Bot"):');
  const botNamesInput = await question('  Bot display names: ');
  const botDisplayNames = botNamesInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0) || ['Ralph Squad', 'Gecho'];

  const config = {
    clientId,
    tenantId,
    chatId,
    botDisplayNames,
    triggerWords: ['/task', '@squad', '@gecho'],
  };

  // Write config file with 600 permissions
  console.log('\n📝 Writing configuration...');
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  fs.chmodSync(CONFIG_PATH, 0o600);
  console.log(`✓ Wrote ${CONFIG_PATH} (chmod 600)`);

  // Initialize MSAL auth flow
  console.log('\n🔐 Initializing Azure authentication...');
  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };

  const pca = new msal.PublicClientApplication(msalConfig);

  try {
    // Initiate device code flow
    const result = await pca.acquireTokenByDeviceCode({
      scopes: ['Chat.ReadWrite', 'User.Read'],
      deviceCodeCallback: (deviceCodeResponse) => {
        console.log(`\n📱 Complete the sign-in on another device:`);
        console.log(`   URL: ${deviceCodeResponse.verificationUri}`);
        console.log(`   Code: ${deviceCodeResponse.userCode}\n`);
      },
    });

    // Save token cache with 600 permissions
    const serialized = pca.getTokenCache().serialize();
    fs.writeFileSync(AUTH_PATH, serialized, 'utf8');
    fs.chmodSync(AUTH_PATH, 0o600);
    console.log(`✓ Authenticated and saved token cache (chmod 600)\n`);

    console.log('✅ Setup complete!');
    console.log(`\n   Config: ${CONFIG_PATH}`);
    console.log(`   Auth:   ${AUTH_PATH}`);
    console.log('\n   You can now run: node .squad/scripts/teams-watch.js\n');
  } catch (err) {
    console.error('❌ Authentication failed:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Setup error:', err);
  rl.close();
  process.exit(1);
});
