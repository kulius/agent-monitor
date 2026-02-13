import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AgentExecution {
  id: number
  session_id: string
  agent_name: string
  started_at: string
  ended_at?: string
  duration_ms?: number
  exit_status: 'running' | 'success' | 'error'
  error_message?: string
  prompt_preview?: string
}

export interface Stats {
  total: number
  success: number
  errors: number
  avgDuration: number
}

export interface Settings {
  voice: {
    enabled: boolean
    onStart: boolean
    onComplete: boolean
  }
  window: {
    alwaysOnTop: boolean
    opacity: number
  }
}

const IPC_URL = 'ws://localhost:9527'

export const useMonitorStore = defineStore('monitor', () => {
  // State
  const running = ref<AgentExecution[]>([])
  const recent = ref<AgentExecution[]>([])
  const stats = ref<Stats>({ total: 0, success: 0, errors: 0, avgDuration: 0 })
  const settings = ref<Settings>({
    voice: { enabled: true, onStart: false, onComplete: true },
    window: { alwaysOnTop: true, opacity: 0.95 }
  })
  const connected = ref(false)
  const ws = ref<WebSocket | null>(null)
  const reconnectTimer = ref<number | null>(null)

  // Computed
  const successRate = computed(() => {
    if (stats.value.total === 0) return 0
    return Math.round((stats.value.success / stats.value.total) * 100)
  })

  const currentAgent = computed(() => running.value[0] || null)

  // Actions
  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) return

    try {
      ws.value = new WebSocket(IPC_URL)

      ws.value.onopen = () => {
        connected.value = true
        console.log('[Monitor] Connected to IPC server')
        if (reconnectTimer.value) {
          clearInterval(reconnectTimer.value)
          reconnectTimer.value = null
        }
      }

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('[Monitor] Failed to parse message:', error)
        }
      }

      ws.value.onclose = () => {
        connected.value = false
        console.log('[Monitor] Disconnected from IPC server')
        scheduleReconnect()
      }

      ws.value.onerror = (error) => {
        console.error('[Monitor] WebSocket error:', error)
      }
    } catch (error) {
      console.error('[Monitor] Failed to connect:', error)
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer.value) return
    reconnectTimer.value = window.setInterval(() => {
      console.log('[Monitor] Attempting to reconnect...')
      connect()
    }, 3000)
  }

  function handleMessage(message: { type: string; data: unknown }) {
    switch (message.type) {
      case 'initial_state': {
        const data = message.data as {
          running: AgentExecution[]
          recent: AgentExecution[]
          stats: Stats
          settings: Settings
        }
        running.value = data.running
        recent.value = data.recent
        stats.value = data.stats
        settings.value = data.settings
        break
      }

      case 'agent_started': {
        const execution = message.data as AgentExecution
        running.value.unshift(execution)
        break
      }

      case 'agent_stopped': {
        const data = message.data as { execution: AgentExecution; stats: Stats }
        // Remove from running
        running.value = running.value.filter(
          (e) => e.session_id !== data.execution.session_id
        )
        // Add to recent
        recent.value.unshift(data.execution)
        if (recent.value.length > 20) {
          recent.value = recent.value.slice(0, 20)
        }
        // Update stats
        stats.value = data.stats
        break
      }

      case 'settings_updated': {
        const data = message.data as { key: string; value: unknown }
        if (data.key === 'voice') {
          settings.value.voice = data.value as Settings['voice']
        } else if (data.key === 'window') {
          settings.value.window = data.value as Settings['window']
        }
        break
      }

      case 'pong':
        break

      default:
        console.log('[Monitor] Unknown message type:', message.type)
    }
  }

  function send(message: object) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    }
  }

  function updateSetting(key: string, value: unknown) {
    send({ type: 'update_settings', key, value })
  }

  function toggleVoice() {
    const newSettings = { ...settings.value.voice, enabled: !settings.value.voice.enabled }
    updateSetting('voice', newSettings)
    settings.value.voice = newSettings
  }

  function toggleAlwaysOnTop() {
    const newSettings = { ...settings.value.window, alwaysOnTop: !settings.value.window.alwaysOnTop }
    updateSetting('window', newSettings)
    settings.value.window = newSettings
  }

  function disconnect() {
    if (reconnectTimer.value) {
      clearInterval(reconnectTimer.value)
      reconnectTimer.value = null
    }
    ws.value?.close()
  }

  return {
    // State
    running,
    recent,
    stats,
    settings,
    connected,
    // Computed
    successRate,
    currentAgent,
    // Actions
    connect,
    disconnect,
    updateSetting,
    toggleVoice,
    toggleAlwaysOnTop
  }
})
