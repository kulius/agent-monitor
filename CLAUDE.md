# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Monitor - 桌面懸浮視窗，整合終端機與 Claude Code 狀態監控。Pixel-art styled virtual office where each terminal becomes an animated worker showing its Claude status.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Tauri 2.0 (Rust backend) |
| Frontend | Vue 3.5 + Pinia 3 + TypeScript |
| Terminal | xterm.js 6 + portable-pty 0.9 |
| IPC | Tauri Events + WebSocket (ws://localhost:9527) |
| Utilities | @vueuse/core 14 |

## Commands

```bash
# Development (full Tauri app with hot reload)
pnpm tauri dev

# Frontend only (without Tauri backend)
pnpm dev

# Type check + build frontend
pnpm build  # runs vue-tsc --noEmit && vite build

# Build release executable
pnpm tauri build
# Output: src-tauri/target/release/agent-monitor.exe
```

**No test framework, linter, or CI/CD is configured.**

## Architecture

### Data Flow

```
Vue Frontend (port 1420)
  TerminalTabs → TerminalPane → xterm.js
        ↕                ↕
  Pinia Stores ←→ invoke() / listen()
        ↕
Rust Backend (Tauri)
  TerminalManager → portable-pty → PowerShell
        ↓ emit()
  Events: terminal-output, terminal-closed

Monitor Store ←→ WebSocket (ws://localhost:9527) ←→ IPC Server
```

### Two Communication Channels

1. **Tauri IPC** (terminal ↔ PTY): `invoke()` for commands, `listen()` for events
2. **WebSocket** (agent monitoring): `monitor.ts` connects to external IPC server for agent execution tracking

### Tauri Commands (src-tauri/src/terminal.rs)

| Command | Parameters | Description |
|---------|------------|-------------|
| `create_terminal` | `cwd?, name?` | Spawn new PTY (powershell.exe) |
| `write_to_terminal` | `id, data` | Send input to PTY |
| `resize_terminal` | `id, cols, rows` | Resize PTY |
| `close_terminal` | `id` | Kill PTY |
| `list_terminals` | - | List all active terminals |
| `update_terminal_cwd` | `id, cwd` | Update stored cwd |

### Tauri Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `terminal-output` | `{id: number, data: string}` | Rust → Vue |
| `terminal-closed` | `number` (terminal id) | Rust → Vue |

### Claude Status Detection (TerminalPane.vue)

Pattern matching on ANSI-stripped terminal output with 300ms debounce:

```javascript
// Priority: waiting > completed > working
waiting:   /\?\s*$/m, /\[Y\/n\]/i, /please (choose|select)/i
completed: /completed successfully/i, /task complete/i, /已完成/
working:   /\.\.\.\s*$/m, /processing|loading/i, thinking verbs (Set, O(1) lookup)
```

**Status stability rules:**
- Minimum 2s duration for `completed` and `waiting` before allowing change
- 15s idle timeout resets to `idle` (except `waiting` is preserved)
- Output buffer: 4KB max, trimmed to 2KB when exceeded

### Worker Bar (WorkerBar.vue + MiniWorker.vue)

終端機分頁上方的「員工列」，每個 terminal 都有一個像素風格小人顯示其狀態：

| 狀態 | 動畫 | 對話泡泡 |
|------|------|---------|
| `idle` | 輕微上下浮動 | - |
| `working` | 打字動畫 + 螢幕閃爍 | - |
| `waiting` | 舉手動畫 | "Help!" |
| `completed` | 立正站好 | "報告!! 已完成" |

**功能：**
- 點擊小人切換到對應 terminal
- 雙擊小人更換頭像 (AvatarPicker)
- 當前選中的 terminal 有藍色邊框
- 可收合模式：顯示文字狀態列 `Terminal1:⏳ | Terminal2:❓`

### Performance Optimizations

**1. 延遲初始化 xterm (Lazy Initialization)**
- Terminal 只有在**被選中時**才初始化 xterm 實例
- 非活躍的 terminal 會將輸出緩衝到 `pendingOutputBuffer`（最多 50KB）
- 切換到該 terminal 時才渲染緩衝的輸出
- 狀態檢測仍然正常工作（即使未初始化也能檢測 Claude 狀態）

**2. Worker Bar 虛擬列表**
- 預設只渲染 **8 個** MiniWorker（`MAX_VISIBLE_WORKERS`）
- 活躍的 worker 總是會顯示
- 有「+N more」按鈕可以展開顯示全部
- 使用 `content-visibility: auto` 優化渲染

**3. 動畫優化**
- 非活躍 worker 的動畫會暫停（`animation-play-state: paused`）
- scrollback 從 5000 降到 1500 行

**4. Sound 系統**
- 全局單例音效（typing, help, complete）
- 組件銷毀時自動停止音效
- 支援靜音（localStorage 持久化）

### Service Store (stores/service.ts)

背景服務管理（如 Odoo server、cloudflared），獨立於一般 terminal 運行。

**核心設計：**
- Service terminals 不註冊到 `terminalStore`（不顯示 tab/worker）
- 僅在 `viewInTerminal()` 時才 lazy 註冊到 terminalStore
- TerminalTabs 和 WorkerBar 透過 `serviceTerminalIds` computed 過濾 `[svc]` terminals
- Service stop: sends `\x03` (Ctrl+C) then force close after 200ms grace period

**HMR 安全：**
- `init()` 是 idempotent：先 `cleanup()` 再 setup
- Store creation 時自動呼叫 `init()`（不依賴 App.vue onMounted）
- 確保 HMR 重建 store 時 listeners/timer 不會遺失

**Race Condition 處理（PTY output 時序）：**
三層緩衝機制解決 PTY 在 `create_terminal` resolve 前就 emit output 的問題：
1. `pendingTerminalMap`: terminalId → serviceId，instance 建立前的同步路由
2. `unmatchedBuffer`: 在 `await invoke('create_terminal')` 期間緩衝未匹配 output（5s 自動過期）
3. Instance 建立後立即 flush unmatchedBuffer

**Log 系統：**
- `pendingLogs` (非 reactive Map) 累積原始 log
- 每 300ms `flushLogs()` 批次寫入 reactive `instances[].logBuffer`
- `flushLogs` 只清除已 flush 的 entries，保留未匹配的 pending data
- `lightStrip()` 移除 ANSI escape sequences（OSC, CSI, simple escapes）
- `getLog()` 合併 `logBuffer` + 未 flush 的 `pendingLogs`

### Monitor Store (stores/monitor.ts)

WebSocket client to external IPC server (`ws://localhost:9527`) for agent execution tracking.

**Messages handled:** `initial_state`, `agent_started`, `agent_stopped`, `settings_updated`, `pong`
**Auto-reconnect:** 3s interval on disconnect
**Data:** running agents, recent executions (max 20), stats, voice/window settings

### Key Implementation Details

- **Tab persistence**: Uses `v-show` (not `v-if`) to keep xterm instances alive across tab switches
- **Lazy xterm init**: xterm only initialized when terminal becomes active
- **PTY shell**: `powershell.exe -NoLogo -NoExit -NoProfile` with TERM=xterm-256color
- **Terminal IDs**: Atomic counter with overflow protection at `u32::MAX - 1`
- **PTY reader**: Dedicated thread per terminal (4096 byte read buffer)
- **ANSI stripping**: `utils/ansi.ts` strips CSI, OSC, DCS, APC, PM sequences + carriage returns
- **Status blink**: Only for non-active tabs with `waiting` or `completed` status
- **Resize handling**: ResizeObserver + useDebounceFn (100ms) for fit addon
- **Avatar images**: Use `referrerpolicy="no-referrer"` to prevent CORS issues

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `agent-monitor-saved-tabs` | Saved tab configurations |
| `worker-bar-collapsed` | Worker bar collapse state |
| `agent-monitor-sound-muted` | Sound mute toggle |
| `agent-monitor-services` | Service definitions |

## File Structure

```
src/
├── App.vue                 # Main layout + WorkerBar + collapsible bottom panel
├── main.ts                 # Vue app entry point
├── components/
│   ├── TerminalPane.vue    # xterm.js + lazy init + status detection
│   ├── TerminalTabs.vue    # Tab bar + saved tabs modal
│   ├── WorkerBar.vue       # 員工列（水平排列 MiniWorker）
│   ├── MiniWorker.vue      # 縮小版像素員工小人 (80x90px)
│   ├── OfficeWorker.vue    # 完整版像素員工小人 (120x140px)
│   ├── AvatarPicker.vue    # 頭像選擇器 modal
│   ├── ServicePanel.vue    # Service chip UI + log viewer
│   ├── ServiceEditor.vue   # Service CRUD form
│   ├── StatusPanel.vue     # Agent execution status
│   ├── StatsPanel.vue      # Agent statistics
│   ├── HistoryList.vue     # Agent execution history
│   └── SettingsBar.vue     # Settings controls
├── stores/
│   ├── terminal.ts         # Terminal state + Tauri IPC + claudeStatus + avatarUrl
│   ├── service.ts          # Service management + log capture + race condition handling
│   ├── savedTabs.ts        # localStorage persistence for saved tabs
│   └── monitor.ts          # WebSocket IPC client for agent monitoring
└── utils/
    ├── sounds.ts           # 音效系統 (typing, help, complete)
    └── ansi.ts             # ANSI escape sequence stripping

src-tauri/
├── src/
│   ├── main.rs             # Windows entry point (windows_subsystem = "windows")
│   ├── lib.rs              # Tauri app setup + command registration + tray icon
│   └── terminal.rs         # TerminalManager + PTY handling (parking_lot::Mutex)
├── Cargo.toml              # Dependencies: tauri 2.0, portable-pty 0.9, parking_lot 0.12
└── tauri.conf.json         # Window: 600x550, min 400x400, tray icon enabled
```
