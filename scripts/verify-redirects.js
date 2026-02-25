/**
 * verify-redirects.js
 * Repository Redirect Validator — Supply Chain Security
 * ISO 27001: A.12.6.1 - Technical Vulnerability Management
 * ISO 27001: A.14.2.5 - Secure System Engineering
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const CONFIG = {
  indexedFile: process.env.INDEXED_FILE || 'indexed_repositories.json',
  maxRedirects: 3,
  requestTimeout: 10000,
  offlineMode: process.env.OFFLINE_MODE === 'true' || process.argv.includes('--offline'),
  allowedHosts: [
    'github.com', 'raw.githubusercontent.com', 'api.github.com',
    'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
    'rubygems.org', 'crates.io', 'pkg.go.dev', 'hub.docker.com', 'ghcr.io',
  ],
  blockedPatterns: [
    /.*\.(tk|ml|ga|cf|gq)$/i,
    /.*-mirror-.*\.github\.io/i,
    /.*\/\/.*@.*\//i,
    /.*\.(ru|cn|ir)\/.*malware/i,
    /.*typosquat.*/i,
  ],
  langfuse: {
    enabled: !!process.env.LANGFUSE_PUBLIC_KEY,
    host: process.env.LANGFUSE_HOST || 'http://localhost:3030',
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
  },
};

class LangfuseReporter {
  constructor() { this.enabled = CONFIG.langfuse.enabled; this.events = []; }
  trace(event) { this.events.push({ timestamp: new Date().toISOString(), ...event }); }
  async flush() {
    if (!this.enabled || this.events.length === 0) return;
    try {
      const auth = Buffer.from(`${CONFIG.langfuse.publicKey}:${CONFIG.langfuse.secretKey}`).toString('base64');
      const resp = await fetch(`${CONFIG.langfuse.host}/api/public/ingestion`, {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: this.events }),
      });
      if (resp.ok) console.log(`Reported ${this.events.length} events to Langfuse`);
    } catch (e) { console.warn(`Langfuse unavailable: ${e.message}`); }
  }
}

const langfuse = new LangfuseReporter();

function isBlockedPattern(url) { return CONFIG.blockedPatterns.some(p => p.test(url)); }
function isAllowedHost(url) {
  try { const h = new URL(url).hostname; return CONFIG.allowedHosts.some(a => h === a || h.endsWith(`.${a}`)); }
  catch { return false; }
}

function checkRedirect(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method: 'HEAD', timeout: CONFIG.requestTimeout }, (res) => {
      resolve({ statusCode: res.statusCode, location: res.headers.location || null, headers: res.headers });
    });
    req.on('error', (e) => resolve({ statusCode: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, error: 'timeout' }); });
    req.end();
  });
}

async function validateUrl(url, depth = 0) {
  if (depth > CONFIG.maxRedirects) return { url, status: 'redirect_loop', depth };
  if (isBlockedPattern(url)) return { url, status: 'blocked', reason: 'matches blocked pattern' };
  if (!isAllowedHost(url)) return { url, status: 'suspicious', reason: 'host not in allowlist' };
  if (CONFIG.offlineMode) return { url, status: 'skipped_offline' };
  const result = await checkRedirect(url);
  if (result.statusCode >= 300 && result.statusCode < 400 && result.location) {
    langfuse.trace({ name: 'redirect-detected', level: 'WARN', metadata: { from: url, to: result.location } });
    return validateUrl(result.location, depth + 1);
  }
  return { url, status: result.statusCode >= 200 && result.statusCode < 400 ? 'valid' : 'error', code: result.statusCode };
}

async function main() {
  console.log('Starting Repository Redirect Verification...');
  langfuse.trace({ name: 'redirect-check-start', level: 'INFO' });
  const results = { total: 0, valid: 0, suspicious: 0, blocked: 0, errors: [] };
  let indexed = { repositories: [] };
  try {
    if (fs.existsSync(CONFIG.indexedFile)) {
      indexed = JSON.parse(fs.readFileSync(CONFIG.indexedFile, 'utf-8'));
    } else {
      console.log('No indexed_repositories.json found, scanning package files...');
      for (const f of ['package.json', 'backend/requirements.txt', 'packages/policy-engine/Cargo.toml']) {
        if (fs.existsSync(f)) indexed.repositories.push({ name: f, url: f, type: 'local' });
      }
    }
  } catch (e) { console.error(`Failed to load index: ${e.message}`); process.exit(1); }
  results.total = indexed.repositories.length;
  for (const repo of indexed.repositories) {
    if (!repo.url || repo.type === 'local') { results.valid++; continue; }
    const check = await validateUrl(repo.url);
    if (check.status === 'valid' || check.status === 'skipped_offline') results.valid++;
    else if (check.status === 'suspicious') { results.suspicious++; results.errors.push({ repo: repo.name, ...check }); }
    else if (check.status === 'blocked') { results.blocked++; results.errors.push({ repo: repo.name, ...check }); }
    else { results.errors.push({ repo: repo.name, ...check }); }
  }
  const report = { ...results, timestamp: new Date().toISOString(), complianceStatus: results.blocked === 0 && results.suspicious === 0 ? 'PASS' : 'FAIL' };
  fs.writeFileSync('redirect-check-results.json', JSON.stringify(report, null, 2));
  console.log(`Results: ${results.valid} valid, ${results.suspicious} suspicious, ${results.blocked} blocked`);
  console.log(`Compliance: ${report.complianceStatus}`);
  langfuse.trace({ name: 'redirect-check-complete', level: 'INFO', metadata: report });
  await langfuse.flush();
  if (report.complianceStatus === 'FAIL') process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
