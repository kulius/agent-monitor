import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useTerminalStore } from './terminal'
import { stripAnsi } from '../utils/ansi'

export interface ServiceDefinition {
  id: string
  name: string
  command: string
  cwd: string
  color: string
  linkedTerminalName?: string  // auto-link restart button to terminal with this name
  createdAt: string
}

export interface ServiceInstance {
  serviceId: string
  terminalId: number
  status: 'running' | 'stopped' | 'error'
  logBuffer: string
  startedAt: string
}

const STORAGE_KEY = 'agent-monitor-services'
const LOG_BUFFER_MAX = 50 * 1024 // 50KB
const LOG_FLUSH_INTERVAL = 300 // ms

export const useServiceStore = defineStore('service', () => {
  // Persistent state
  const services = ref<ServiceDefinition[]>([])

  // Runtime state
  const instances = ref<ServiceInstance[]>([])

  // Non-reactive log buffers (accumulated between flushes)
  const pendingLogs = new Map<string, string>()
  let flushTimer: ReturnType<typeof setInterval> | null = null

  // Listeners (registered lazily — Tauri IPC bridge not ready during store init)
  let unlistenOutput: UnlistenFn | null = null
  let unlistenClosed: UnlistenFn | null = null
  let listenersReady = false

  // Pending terminal map: terminalId → serviceId (for race condition)
  // PTY may emit output before create_terminal resolves and instance is created
  const pendingTerminalMap = new Map<number, string>()

  // Buffer for unmatched terminal output (PTY output arriving during create_terminal await)
  // Keyed by terminalId, auto-expires after 5s
  const unmatchedBuffer = new Map<number, string[]>()

  // Computed
  const runningCount = computed(() =>
    instances.value.filter(i => i.status === 'running').length
  )

  const serviceTerminalIds = computed(() =>
    new Set(instances.value.map(i => i.terminalId))
  )

  // Persistence
  function loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        services.value = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to load services:', error)
    }
  }

  function saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(services.value))
    } catch (error) {
      console.error('Failed to save services:', error)
    }
  }

  // CRUD
  function addService(data: Omit<ServiceDefinition, 'id' | 'createdAt'>): ServiceDefinition {
    const service: ServiceDefinition = {
      ...data,
      id: `svc-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    }
    services.value = [...services.value, service]
    return service
  }

  function updateService(id: string, updates: Partial<Pick<ServiceDefinition, 'name' | 'command' | 'cwd' | 'color' | 'linkedTerminalName'>>): void {
    services.value = services.value.map(s =>
      s.id === id ? { ...s, ...updates } : s
    )
  }

  async function removeService(id: string): Promise<void> {
    const instance = instances.value.find(i => i.serviceId === id)
    if (instance && instance.status === 'running') {
      await stopService(id)
    }
    services.value = services.value.filter(s => s.id !== id)
    instances.value = instances.value.filter(i => i.serviceId !== id)
    pendingLogs.delete(id)
  }

  // Log management - non-reactive accumulation + periodic flush
  function accumulateLog(serviceId: string, data: string): void {
    const cleaned = stripAnsi(data)
    const existing = pendingLogs.get(serviceId) ?? ''
    pendingLogs.set(serviceId, existing + cleaned)
  }

  function flushLogs(): void {
    if (pendingLogs.size === 0) return

    let changed = false
    const flushedIds: string[] = []
    const updated = instances.value.map(i => {
      const pending = pendingLogs.get(i.serviceId)
      if (!pending) return i
      changed = true
      flushedIds.push(i.serviceId)
      let newBuffer = i.logBuffer + pending
      if (newBuffer.length > LOG_BUFFER_MAX) {
        newBuffer = newBuffer.slice(newBuffer.length - LOG_BUFFER_MAX)
      }
      return { ...i, logBuffer: newBuffer }
    })

    if (changed) {
      instances.value = updated
    }
    // Only clear entries that were flushed to an instance;
    // preserve pending data for serviceIds not yet in instances (race condition path)
    for (const id of flushedIds) {
      pendingLogs.delete(id)
    }
  }

  function startFlushTimer(): void {
    if (flushTimer) return
    flushTimer = setInterval(flushLogs, LOG_FLUSH_INTERVAL)
  }

  function stopFlushTimer(): void {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
  }

  // Lazy listener registration — Tauri IPC bridge is not ready during store init,
  // so we register listeners on first use (when user triggers a service operation).
  async function ensureListeners(): Promise<void> {
    if (listenersReady) return
    listenersReady = true

    unlistenOutput = await listen<{ id: number; data: string }>('terminal-output', (event) => {
      const { id, data } = event.payload
      const instance = instances.value.find(i => i.terminalId === id)
      if (instance) {
        accumulateLog(instance.serviceId, data)
        return
      }
      // Race condition: PTY output arrived before instance was created
      const pendingServiceId = pendingTerminalMap.get(id)
      if (pendingServiceId) {
        accumulateLog(pendingServiceId, data)
        return
      }
      // Buffer unmatched output briefly — PTY may emit during create_terminal await
      const buf = unmatchedBuffer.get(id) ?? []
      buf.push(data)
      unmatchedBuffer.set(id, buf)
      // Auto-expire after 5s to prevent memory leaks
      if (buf.length === 1) {
        setTimeout(() => unmatchedBuffer.delete(id), 5000)
      }
    })

    unlistenClosed = await listen<number>('terminal-closed', (event) => {
      const terminalId = event.payload
      const instance = instances.value.find(i => i.terminalId === terminalId)
      if (instance && instance.status === 'running') {
        instances.value = instances.value.map(i =>
          i.terminalId === terminalId ? { ...i, status: 'stopped' as const } : i
        )
      }
    })
  }

  // Service lifecycle
  async function startService(id: string): Promise<boolean> {
    const service = services.value.find(s => s.id === id)
    if (!service) return false

    const existing = instances.value.find(i => i.serviceId === id)
    if (existing && existing.status === 'running') return true

    // Ensure event listeners are registered (lazy — first call triggers registration)
    await ensureListeners()

    let terminalId: number | null = null
    try {
      const info = await invoke<{ id: number }>('create_terminal', {
        cwd: service.cwd || undefined,
        name: `[svc] ${service.name}`
      })
      terminalId = info.id

      // Register pending mapping so listener can route output to this service
      pendingTerminalMap.set(terminalId, id)

      const now = new Date().toISOString()
      const instance: ServiceInstance = {
        serviceId: id,
        terminalId,
        status: 'running',
        logBuffer: '',
        startedAt: now
      }

      instances.value = [
        ...instances.value.filter(i => i.serviceId !== id),
        instance
      ]

      // Clean up pending mapping now that instance exists
      pendingTerminalMap.delete(terminalId)

      // Flush any output that arrived during the create_terminal await
      const buffered = unmatchedBuffer.get(terminalId)
      if (buffered) {
        for (const chunk of buffered) {
          accumulateLog(id, chunk)
        }
        unmatchedBuffer.delete(terminalId)
      }

      // Write startup log entry (not from PTY, always visible)
      const timestamp = new Date().toLocaleTimeString()
      accumulateLog(id, `[${timestamp}] Starting: ${service.command}\n`)
      accumulateLog(id, `[${timestamp}] CWD: ${service.cwd || '(default)'}\n`)
      accumulateLog(id, `[${timestamp}] Terminal ID: ${terminalId}\n---\n`)

      // cd to working directory first, then execute the command
      if (service.cwd) {
        await invoke('write_to_terminal', {
          id: terminalId,
          data: `cd "${service.cwd}"\r`
        })
      }
      await invoke('write_to_terminal', {
        id: terminalId,
        data: service.command + '\r'
      })

      return true
    } catch (error) {
      if (terminalId !== null) {
        pendingTerminalMap.delete(terminalId)
        unmatchedBuffer.delete(terminalId)
      }
      console.error(`Failed to start service ${service.name}:`, error)
      return false
    }
  }

  async function stopService(id: string): Promise<void> {
    const instance = instances.value.find(i => i.serviceId === id)
    if (!instance || instance.status !== 'running') return

    // Mark stopped immediately (prevent double-stop)
    instances.value = instances.value.map(i =>
      i.serviceId === id ? { ...i, status: 'stopped' as const } : i
    )

    // Flush any pending logs before closing
    flushLogs()

    // Wrap the close operations with a timeout to prevent UI hang
    const closeOp = async () => {
      // Send Ctrl+C first for graceful shutdown
      await invoke('write_to_terminal', {
        id: instance.terminalId,
        data: '\x03'
      }).catch(() => { /* ignore if already closed */ })

      // Short delay then force close
      await new Promise(resolve => setTimeout(resolve, 200))

      await invoke('close_terminal', { id: instance.terminalId })
    }

    try {
      await Promise.race([
        closeOp(),
        new Promise<void>(resolve => setTimeout(resolve, 3000)) // 3s timeout
      ])
    } catch (error) {
      console.error('Failed to close service terminal:', error)
    }
  }

  async function restartService(id: string): Promise<boolean> {
    await stopService(id)
    // Give background thread time to complete ConPTY teardown and release ports
    await new Promise(resolve => setTimeout(resolve, 500))
    return startService(id)
  }

  async function startAll(): Promise<void> {
    const stopped = services.value.filter(s => {
      const inst = instances.value.find(i => i.serviceId === s.id)
      return !inst || inst.status !== 'running'
    })
    await Promise.allSettled(stopped.map(s => startService(s.id)))
  }

  async function stopAll(): Promise<void> {
    const running = instances.value.filter(i => i.status === 'running')
    await Promise.allSettled(running.map(i => stopService(i.serviceId)))
  }

  function getStatus(serviceId: string): 'running' | 'stopped' | 'error' {
    const instance = instances.value.find(i => i.serviceId === serviceId)
    return instance?.status ?? 'stopped'
  }

  function getLog(serviceId: string): string {
    const instance = instances.value.find(i => i.serviceId === serviceId)
    // Include any pending (not yet flushed) data
    const pending = pendingLogs.get(serviceId) ?? ''
    return (instance?.logBuffer ?? '') + pending
  }

  function clearLog(serviceId: string): void {
    pendingLogs.delete(serviceId)
    instances.value = instances.value.map(i =>
      i.serviceId === serviceId ? { ...i, logBuffer: '' } : i
    )
  }

  // Open service terminal in the terminal tabs for full xterm view
  function viewInTerminal(serviceId: string): void {
    const instance = instances.value.find(i => i.serviceId === serviceId)
    if (!instance) return
    const service = services.value.find(s => s.id === serviceId)
    const termStore = useTerminalStore()

    // Lazily register in terminalStore so TerminalPane mounts
    if (!termStore.terminals.some(t => t.id === instance.terminalId)) {
      termStore.terminals = [...termStore.terminals, {
        id: instance.terminalId,
        name: `[svc] ${service?.name ?? serviceId}`,
        cwd: service?.cwd ?? '',
        created_at: instance.startedAt
      }]
    }

    termStore.setActiveTerminal(instance.terminalId)
  }

  // Init — only loads storage and starts timer (NO listener registration here)
  function init(): void {
    loadFromStorage()
    startFlushTimer()
  }

  function cleanup(): void {
    stopFlushTimer()
    flushLogs()
    if (unlistenOutput) {
      unlistenOutput()
      unlistenOutput = null
    }
    if (unlistenClosed) {
      unlistenClosed()
      unlistenClosed = null
    }
    listenersReady = false
  }

  // Auto-save on changes
  watch(services, saveToStorage, { deep: true })

  // Sync init on store creation (no async needed — listeners are lazy)
  init()

  return {
    services,
    instances,
    runningCount,
    serviceTerminalIds,
    addService,
    updateService,
    removeService,
    startService,
    stopService,
    startAll,
    stopAll,
    getStatus,
    getLog,
    clearLog,
    viewInTerminal,
    restartService,
    init,
    cleanup
  }
})
