import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'

// ─── Validation constants ───
const TICKER_RE = /^\d{4,6}$/
const MAX_STR_LEN = 50
const MAX_BODY_SIZE = 4096  // 4KB
const SYNC_TIMEOUT = 120_000  // 2 minutes
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])

// S-8: Single-flight lock — 同時只允許一個 sync 進程
let syncInFlight = false

export default defineConfig({
  plugins: [
    react(),
    // ─── Dev-only API middleware for portfolio sync ───
    {
      name: 'sync-portfolio-api',
      configureServer(server) {
        // POST /api/sync → 執行 sync_portfolio.py
        server.middlewares.use('/api/sync', (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          // S-1: Origin / Host 驗證 — 僅允許 localhost
          const origin = req.headers['origin']
          const host = req.headers['host']
          if (origin && !ALLOWED_ORIGINS.has(origin)) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Forbidden: invalid origin' }))
            return
          }
          if (host && !host.startsWith('localhost:') && !host.startsWith('127.0.0.1:')) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Forbidden: invalid host' }))
            return
          }

          // S-8: 防止並行 sync — 同時只允許一個進程
          if (syncInFlight) {
            res.writeHead(429, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Sync already in progress, please wait' }))
            return
          }
          syncInFlight = true

          // 收集 body（含大小限制 — S-4）
          let body = ''
          let bodySize = 0
          let aborted = false
          req.on('data', chunk => {
            bodySize += chunk.length
            if (bodySize > MAX_BODY_SIZE) {
              aborted = true
              res.writeHead(413, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Request body too large' }))
              req.destroy()
              return
            }
            body += chunk
          })
          req.on('end', () => {
            if (aborted) return

            let flags = []
            try {
              const parsed = JSON.parse(body || '{}')

              // ─── S-3: Input validation ───
              if (parsed.add) {
                if (!parsed.add.ticker || !TICKER_RE.test(parsed.add.ticker)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: 'Invalid ticker format (4-6 digits required)' }))
                  return
                }
                if (parsed.add.name && (typeof parsed.add.name !== 'string' || parsed.add.name.length > MAX_STR_LEN)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Name too long (max ${MAX_STR_LEN} chars)` }))
                  return
                }
                if (parsed.add.sector && (typeof parsed.add.sector !== 'string' || parsed.add.sector.length > MAX_STR_LEN)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: `Sector too long (max ${MAX_STR_LEN} chars)` }))
                  return
                }
                flags.push('--add', parsed.add.ticker)
                if (parsed.add.name) flags.push('--name', parsed.add.name)
                if (parsed.add.sector) flags.push('--sector', parsed.add.sector)
              } else if (parsed.remove) {
                if (typeof parsed.remove !== 'string' || !TICKER_RE.test(parsed.remove)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ error: 'Invalid ticker format for remove' }))
                  return
                }
                flags.push('--remove', parsed.remove)
              } else {
                if (parsed.refresh) flags.push('--refresh')
                if (parsed.regenOnly) flags.push('--regen-only')
              }
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              return
            }

            const args = ['sync_portfolio.py', ...flags]
            console.log(`\n🔄 [API] sync_portfolio.py ${flags.join(' ')}`)

            const proc = spawn('python3', args, {
              cwd: process.cwd(),
              env: { ...process.env, PYTHONUNBUFFERED: '1' },
            })

            let stdout = '', stderr = ''
            let responded = false

            // B-3: Process timeout
            const killTimer = setTimeout(() => {
              proc.kill('SIGTERM')
              stdout += '\n⚠️ 同步超時（120 秒），已強制終止'
            }, SYNC_TIMEOUT)

            proc.stdout.on('data', d => {
              const text = d.toString()
              stdout += text
              process.stdout.write(text) // 即時印到 terminal
            })
            proc.stderr.on('data', d => {
              stderr += d.toString()
            })

            proc.on('close', code => {
              clearTimeout(killTimer)
              syncInFlight = false  // S-8: 釋放鎖
              if (responded) return  // B-6: 防止重複回應
              responded = true
              res.writeHead(code === 0 ? 200 : 500, {
                'Content-Type': 'application/json',
              })
              res.end(JSON.stringify({
                success: code === 0,
                output: stdout,
                error: stderr || null,
              }))
            })

            proc.on('error', err => {
              clearTimeout(killTimer)
              syncInFlight = false  // S-8: 釋放鎖
              if (responded) return  // B-6: 防止重複回應
              responded = true
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: err.message }))
            })
          })
        })
      },
    },
  ],
  server: {
    port: 3000,
    open: true,
  }
})
