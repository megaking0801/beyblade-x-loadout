/**
 * 部署到 GitHub Pages 的 gh-pages 分支。
 *
 * 規格對照：第 2 節（可安裝、離線可開啟 —— 必須是 HTTPS 靜態主機）。
 *
 * 做法：用 git worktree 把 gh-pages 掛到暫存目錄，清空後放入 dist 內容再 commit / push。
 * 不碰主工作目錄，也不會把原始碼推上 gh-pages。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const BRANCH = 'gh-pages'

// 在這裡設 base 旗標，子行程會繼承：npm 在 Windows 用 cmd 跑 script，
// package.json 裡的 `GITHUB_ACTIONS=1 node ...` 前綴語法會直接失敗。
process.env.GITHUB_ACTIONS = '1'

function git(args, options = {}) {
  // stdio: 'ignore' 時 execFileSync 會回 null，所以不能直接 trim。
  const output = execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options })
  return typeof output === 'string' ? output.trim() : ''
}

function run(command, args, cwd = root) {
  // Windows 的 npm 是 npm.cmd，execFileSync 不經 shell 找不到；但 shell 會重新切詞，
  // 會把 commit 訊息裡的空白拆成多個參數，所以只有 npm 走 shell。
  const shell = process.platform === 'win32' && command === 'npm'
  execFileSync(command, args, { cwd, stdio: 'inherit', shell })
}

// 1. 用 Pages 的 base path 打包（vite.config.ts 依 GITHUB_ACTIONS 決定 base）
run('npm', ['run', 'build'], root)

// 2. 掛上 gh-pages worktree
const worktree = mkdtempSync(join(tmpdir(), 'ghpages-'))
const branchExists = git(['branch', '--list', '--remotes', `origin/${BRANCH}`]).length > 0
git(['fetch', 'origin', BRANCH], { stdio: 'ignore' })
if (branchExists) {
  git(['worktree', 'add', '--force', worktree, `origin/${BRANCH}`, '--detach'])
} else {
  git(['worktree', 'add', '--force', '--orphan', '-b', BRANCH, worktree])
}

try {
  // 3. 清空舊檔（保留 .git）後放入新的 dist
  for (const entry of readdirSync(worktree)) {
    if (entry === '.git') continue
    rmSync(join(worktree, entry), { recursive: true, force: true })
  }
  cpSync(join(root, 'dist'), worktree, { recursive: true })
  // GitHub Pages 預設會跑 Jekyll，會忽略底線開頭的檔案，關掉比較保險。
  writeFileSync(join(worktree, '.nojekyll'), '')

  // 4. commit 並推上去
  run('git', ['add', '--all'], worktree)
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: worktree,
    encoding: 'utf8',
  }).trim()
  if (status.length === 0) {
    console.log('dist 內容與線上相同，不需要重新部署。')
  } else {
    const version = new Date().toISOString().slice(0, 19).replace('T', ' ')
    run('git', ['commit', '-m', `deploy: ${version}`], worktree)
    run('git', ['push', 'origin', `HEAD:${BRANCH}`], worktree)
    console.log('已部署到 gh-pages。')
  }
} finally {
  git(['worktree', 'remove', '--force', worktree])
}
