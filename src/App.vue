<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useMonitorStore } from './stores/monitor'
import { useTerminalStore } from './stores/terminal'
import { useServiceStore } from './stores/service'
import { useFileExplorerStore } from './stores/fileExplorer'
import StatusPanel from './components/StatusPanel.vue'
import StatsPanel from './components/StatsPanel.vue'
import HistoryList from './components/HistoryList.vue'
import SettingsBar from './components/SettingsBar.vue'
import TerminalTabs from './components/TerminalTabs.vue'
import TerminalPane from './components/TerminalPane.vue'
import WorkerBar from './components/WorkerBar.vue'
import ServicePanel from './components/ServicePanel.vue'
import FileExplorer from './components/FileExplorer.vue'

const monitorStore = useMonitorStore()
const terminalStore = useTerminalStore()
const serviceStore = useServiceStore()
const fileExplorerStore = useFileExplorerStore()

const SESSION_STORAGE_KEY = 'agent-monitor-last-session'

interface SavedSession {
  cwd: string
  name: string
  avatarUrl?: string
}

const MAX_RESTORE_SESSIONS = 10

// PowerShell single-quoted strings have no escapes except '' for literal '
function escapeForPowerShell(path: string): string {
  return path.replace(/'/g, "''")
}

function isValidSession(value: unknown): value is SavedSession {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.cwd === 'string' && typeof obj.name === 'string'
}

const showAgentPanel = ref(false)
const bottomTab = ref<'agent' | 'services'>('agent')
const initError = ref<string | null>(null)
const activeTerminalId = computed(() => terminalStore.activeTerminalId)
const hasTerminals = computed(() => terminalStore.terminals.length > 0)

function saveCurrentSessions(): void {
  const sessions: SavedSession[] = terminalStore.terminals
    .filter(t => !serviceStore.serviceTerminalIds.has(t.id) && t.cwd)
    .map(t => ({
      cwd: t.cwd,
      name: t.name || '',
      avatarUrl: t.avatarUrl,
    }))
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
}

function loadSavedSessions(): SavedSession[] {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isValidSession).filter(s => s.cwd)
    }
  } catch { /* ignore */ }
  return []
}

async function restoreSessions(): Promise<void> {
  const sessions = loadSavedSessions().slice(0, MAX_RESTORE_SESSIONS)
  if (sessions.length === 0) {
    // No previous sessions — create a blank terminal
    await terminalStore.createTerminal()
    return
  }

  // Clear saved sessions so crash won't loop
  localStorage.removeItem(SESSION_STORAGE_KEY)

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i]
    const term = await terminalStore.createTerminal(session.cwd, session.name)
    if (term) {
      if (session.avatarUrl) {
        terminalStore.updateTerminalAvatar(term.id, session.avatarUrl)
      }
      // Stagger: wait longer for each terminal to let PTY shells initialize
      const safeCwd = escapeForPowerShell(session.cwd)
      setTimeout(() => {
        terminalStore.writeToTerminal(term.id, `cd '${safeCwd}'; opencode\r`)
      }, 1000 + i * 500)
    }
  }
}

onMounted(async () => {
  monitorStore.connect()
  // serviceStore auto-inits on creation, no manual init needed
  try {
    await terminalStore.init()

    // Restore previous sessions or create a new terminal
    await restoreSessions()
  } catch (error: unknown) {
    console.error('Failed to initialize terminal:', error)
    initError.value = error instanceof Error ? error.message : 'Failed to initialize terminal'
  }

  // Save sessions and cleanup on window close
  const appWindow = getCurrentWindow()
  appWindow.onCloseRequested(async (event) => {
    event.preventDefault()
    saveCurrentSessions()
    try {
      await terminalStore.cleanup()
      await serviceStore.cleanup()
    } finally {
      await appWindow.close()
    }
  })

  // Ctrl+B shortcut for file explorer toggle
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  monitorStore.disconnect()
  terminalStore.cleanup()
  serviceStore.cleanup()
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault()
    fileExplorerStore.toggleVisibility()
  }
}

function toggleAgentPanel() {
  showAgentPanel.value = !showAgentPanel.value
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <span class="app-icon">🤖</span>
      <span class="app-title">Agent Monitor</span>
      <div class="header-spacer"></div>
      <button
        class="toggle-btn"
        :class="{ active: fileExplorerStore.isVisible }"
        @click="fileExplorerStore.toggleVisibility()"
        title="Toggle File Explorer (Ctrl+B)"
      >
        <span class="toggle-icon">📁</span>
      </button>
      <button
        class="toggle-btn"
        :class="{ active: showAgentPanel }"
        @click="toggleAgentPanel"
        title="Toggle Agent Panel"
      >
        <span class="toggle-icon">📊</span>
      </button>
    </header>

    <!-- Main Content Area -->
    <div class="main-content">
      <div class="main-body">
        <!-- File Explorer Sidebar -->
        <FileExplorer v-show="fileExplorerStore.isVisible" />

        <!-- Terminal Section with Worker Bar -->
        <div class="terminal-section">
          <WorkerBar />
          <TerminalTabs />
          <div class="terminal-content">
            <!-- Render all terminals, show only active one -->
            <TerminalPane
              v-for="term in terminalStore.terminals"
              :key="term.id"
              v-show="term.id === activeTerminalId"
              :terminal-id="term.id"
            />
            <div v-if="!hasTerminals" class="no-terminal">
              <p>No terminal open</p>
              <button @click="terminalStore.createTerminal()">Create Terminal</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent Panel (collapsible) -->
    <div class="agent-panel" :class="{ expanded: showAgentPanel }">
      <div class="agent-panel-header">
        <div class="panel-tabs">
          <button
            class="panel-tab"
            :class="{ active: bottomTab === 'agent' }"
            @click="bottomTab = 'agent'; showAgentPanel = true"
          >Agent Status</button>
          <button
            class="panel-tab"
            :class="{ active: bottomTab === 'services' }"
            @click="bottomTab = 'services'; showAgentPanel = true"
          >
            Services
            <span v-if="serviceStore.runningCount > 0" class="svc-badge">
              {{ serviceStore.runningCount }}
            </span>
          </button>
        </div>
        <span class="expand-icon" @click="toggleAgentPanel">
          {{ showAgentPanel ? '▼' : '▲' }}
        </span>
      </div>
      <div v-if="showAgentPanel" class="agent-panel-content">
        <template v-if="bottomTab === 'agent'">
          <StatusPanel />
          <StatsPanel />
          <HistoryList />
        </template>
        <ServicePanel v-else />
      </div>
    </div>

    <footer class="app-footer">
      <SettingsBar />
    </footer>
  </div>
</template>

<style>
:root {
  --primary-color: #4f46e5;
  --success-color: #22c55e;
  --error-color: #ef4444;
  --warning-color: #f59e0b;
  --text-primary: #1f2937;
  --text-muted: #6b7280;
  --bg-color: #ffffff;
  --panel-bg: #f9fafb;
  --border-color: #e5e7eb;
  --border-light: #f3f4f6;
  --hover-bg: #f3f4f6;
  --active-bg: #e5e7eb;

  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--bg-color);
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #f3f4f6;
    --text-muted: #9ca3af;
    --bg-color: #1f2937;
    --panel-bg: #374151;
    --border-color: #4b5563;
    --border-light: #374151;
    --hover-bg: #4b5563;
    --active-bg: #6b7280;
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  overflow: hidden;
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  user-select: none;
}

.app-icon {
  font-size: 16px;
}

.app-title {
  font-size: 14px;
  font-weight: 600;
}

.header-spacer {
  flex: 1;
}

.toggle-btn {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-btn:hover {
  background: var(--hover-bg);
}

.toggle-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.toggle-icon {
  font-size: 14px;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.main-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
}

.terminal-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.terminal-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.no-terminal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-muted);
}

.no-terminal button {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.no-terminal button:hover {
  opacity: 0.9;
}

.agent-panel {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--panel-bg);
  max-height: 36px;
  overflow: hidden;
  transition: max-height 0.2s ease;
}

.agent-panel.expanded {
  max-height: 300px;
  overflow-y: auto;
}

.agent-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 500;
  user-select: none;
}

.panel-tabs {
  display: flex;
  gap: 0;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.panel-tab:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.panel-tab.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.svc-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--success-color);
  color: white;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.expand-icon {
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 7px 4px;
}

.expand-icon:hover {
  color: var(--text-primary);
}

.agent-panel-content {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
}

.app-footer {
  flex-shrink: 0;
}
</style>
