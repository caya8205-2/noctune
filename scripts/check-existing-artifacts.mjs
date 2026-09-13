import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const version = (process.argv[2] || '').replace(/^v/, '').trim();
if (!version) {
  console.error('❌ Version argument is required (e.g. node scripts/check-existing-artifacts.mjs 4.4.1)');
  process.exit(1);
}

function gh(cmd) {
  try {
    return execSync(`gh ${cmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

let windowsRunId = '';
let linuxRunId = '';

const runsRaw = gh('api "repos/caya8205-2/noctune/actions/runs?event=push&branch=main&status=completed&per_page=10"');
if (runsRaw) {
  try {
    const runs = JSON.parse(runsRaw).workflow_runs || [];
    for (const run of runs) {
      if (!run.id) continue;
      const artRaw = gh(`api "repos/caya8205-2/noctune/actions/runs/${run.id}/artifacts"`);
      if (!artRaw) continue;
      const artifacts = JSON.parse(artRaw).artifacts || [];

      // Check if package.json on that commit matches this version
      let runVersion = '';
      const pkgRaw = gh(`api "repos/caya8205-2/noctune/contents/package.json?ref=${run.head_sha}" --jq .content`);
      if (pkgRaw) {
        try {
          const pkg = JSON.parse(Buffer.from(pkgRaw, 'base64').toString('utf-8'));
          runVersion = pkg.version;
        } catch {}
      }

      if (runVersion !== version) continue;

      if (!windowsRunId) {
        const win = artifacts.find((a) => a.name === 'windows-installer' && !a.expired);
        if (win) {
          windowsRunId = String(run.id);
          console.log(`✅ Found reusable Windows artifact from run ${run.id} (${(win.size_in_bytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      }

      if (!linuxRunId) {
        const lin = artifacts.find((a) => a.name === 'linux-packages' && !a.expired);
        if (lin) {
          linuxRunId = String(run.id);
          console.log(`✅ Found reusable Linux artifact from run ${run.id} (${(lin.size_in_bytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      }

      if (windowsRunId && linuxRunId) break;
    }
  } catch (err) {
    console.error('Error scanning artifacts:', err.message);
  }
}

console.log(`Summary for v${version} -> windows_run_id: "${windowsRunId}", linux_run_id: "${linuxRunId}"`);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  appendFileSync(outputFile, `windows_run_id=${windowsRunId}\nlinux_run_id=${linuxRunId}\n`);
}
