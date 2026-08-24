import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const workspace = process.cwd()
const supabaseCli = path.join(workspace, 'node_modules', 'supabase', 'dist', 'supabase.js')
const playwrightCli = path.join(workspace, 'node_modules', '@playwright', 'test', 'cli.js')
const requestedTests = process.argv.slice(2)

const status = spawnSync(
  process.execPath,
  [supabaseCli, 'status', '-o', 'env'],
  { cwd: workspace, encoding: 'utf8', windowsHide: true },
)

if (status.status !== 0) {
  process.stderr.write(
    'Online E2E requires the repo-local Supabase stack. Run `npm run supabase:start` first.\n',
  )
  process.exit(status.status ?? 1)
}

function readStatusValue(name) {
  const match = status.stdout.match(new RegExp(`^${name}="([^"]+)"$`, 'mu'))
  return match?.[1] ?? null
}

const apiUrl = readStatusValue('API_URL')
const publishableKey = readStatusValue('PUBLISHABLE_KEY') ?? readStatusValue('ANON_KEY')

if (!apiUrl || !publishableKey) {
  process.stderr.write('Local Supabase status did not provide browser-safe API credentials.\n')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [playwrightCli, 'test', ...requestedTests],
  {
    cwd: workspace,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      PLAYWRIGHT_REUSE_SERVER: '0',
      VITE_SUPABASE_URL: apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  },
)

process.exit(result.status ?? 1)
