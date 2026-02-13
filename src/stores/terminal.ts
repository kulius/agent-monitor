import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type ClaudeStatus = 'idle' | 'working' | 'waiting' | 'completed'

export interface TerminalInfo {
  id: number
  name: string
  cwd: string
  created_at: string
  claudeStatus?: ClaudeStatus
  statusTime?: number  // timestamp when status changed
  avatarUrl?: string   // custom avatar for virtual office
}

export const useTerminalStore = defineStore('terminal', () => {
  // State
  const terminals = ref<TerminalInfo[]>([])
  const activeTerminalId = ref<number | null>(null)

  // Listeners
  let unlistenClosed: UnlistenFn | null = null

  // Computed
  const activeTerminal = computed(() =>
    terminals.value.find(t => t.id === activeTerminalId.value) || null
  )

  const terminalCount = computed(() => terminals.value.length)

  // Actions
  async function init(): Promise<void> {
    // Listen for terminal closed events
    unlistenClosed = await listen<number>('terminal-closed', (event) => {
      const id = event.payload
      removeTerminal(id)
    })

    // Load existing terminals
    await refreshTerminals()
  }

  async function cleanup(): Promise<void> {
    if (unlistenClosed) {
      unlistenClosed()
      unlistenClosed = null
    }
  }

  async function refreshTerminals(): Promise<void> {
    try {
      terminals.value = await invoke<TerminalInfo[]>('list_terminals')
    } catch (error: unknown) {
      console.error('Failed to list terminals:', error)
    }
  }

  async function createTerminal(cwd?: string, name?: string): Promise<TerminalInfo | null> {
    try {
      const info = await invoke<TerminalInfo>('create_terminal', { cwd, name })
      terminals.value = [...terminals.value, info]
      activeTerminalId.value = info.id
      return info
    } catch (error: unknown) {
      console.error('Failed to create terminal:', error)
      return null
    }
  }

  async function writeToTerminal(id: number, data: string): Promise<boolean> {
    try {
      await invoke('write_to_terminal', { id, data })
      return true
    } catch (error: unknown) {
      console.error('Failed to write to terminal:', error)
      return false
    }
  }

  async function resizeTerminal(id: number, cols: number, rows: number): Promise<boolean> {
    try {
      await invoke('resize_terminal', { id, cols, rows })
      return true
    } catch (error: unknown) {
      console.error('Failed to resize terminal:', error)
      return false
    }
  }

  async function closeTerminal(id: number): Promise<boolean> {
    try {
      await invoke('close_terminal', { id })
      removeTerminal(id)
      return true
    } catch (error: unknown) {
      console.error('Failed to close terminal:', error)
      return false
    }
  }

  function removeTerminal(id: number): void {
    const index = terminals.value.findIndex(t => t.id === id)
    if (index !== -1) {
      // Create new array for reactivity
      terminals.value = terminals.value.filter(t => t.id !== id)

      // Switch to another terminal if this was active
      if (activeTerminalId.value === id) {
        activeTerminalId.value = terminals.value.length > 0
          ? terminals.value[0].id
          : null
      }
    }
  }

  function setActiveTerminal(id: number): void {
    if (terminals.value.some(t => t.id === id)) {
      activeTerminalId.value = id
    }
  }

  async function updateTerminalCwd(id: number, cwd: string): Promise<boolean> {
    try {
      await invoke('update_terminal_cwd', { id, cwd })
      // Update local state reactively
      terminals.value = terminals.value.map(t =>
        t.id === id ? { ...t, cwd } : t
      )
      return true
    } catch (error: unknown) {
      console.error('Failed to update terminal cwd:', error)
      return false
    }
  }

  function updateTerminalName(id: number, name: string): void {
    terminals.value = terminals.value.map(t =>
      t.id === id ? { ...t, name } : t
    )
  }

  function updateClaudeStatus(id: number, status: ClaudeStatus): void {
    terminals.value = terminals.value.map(t =>
      t.id === id ? { ...t, claudeStatus: status, statusTime: Date.now() } : t
    )
  }

  function clearClaudeStatus(id: number): void {
    terminals.value = terminals.value.map(t =>
      t.id === id ? { ...t, claudeStatus: 'idle', statusTime: undefined } : t
    )
  }

  function updateTerminalAvatar(id: number, avatarUrl: string | undefined): void {
    terminals.value = terminals.value.map(t =>
      t.id === id ? { ...t, avatarUrl } : t
    )
  }

  return {
    // State
    terminals,
    activeTerminalId,
    // Computed
    activeTerminal,
    terminalCount,
    // Actions
    init,
    cleanup,
    createTerminal,
    writeToTerminal,
    resizeTerminal,
    closeTerminal,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalName,
    updateClaudeStatus,
    clearClaudeStatus,
    updateTerminalAvatar
  }
})
