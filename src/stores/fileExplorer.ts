import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTerminalStore } from './terminal'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  is_hidden: boolean
  size: number
}

const STORAGE_KEY_VISIBLE = 'file-explorer-visible'
const STORAGE_KEY_WIDTH = 'file-explorer-width'
const DEFAULT_WIDTH = 200

export const useFileExplorerStore = defineStore('fileExplorer', () => {
  // State
  const rootPath = ref('')
  const isVisible = ref(localStorage.getItem(STORAGE_KEY_VISIBLE) !== 'false')
  const sidebarWidth = ref(Number(localStorage.getItem(STORAGE_KEY_WIDTH)) || DEFAULT_WIDTH)
  const showHiddenFiles = ref(false)
  const expandedDirs = ref(new Set<string>())
  const isLoading = ref(false)

  // Cache: path -> entries (LRU with max size)
  const MAX_CACHE_SIZE = 100
  const directoryCache = new Map<string, FileEntry[]>()
  const cacheOrder: string[] = []

  // Pending loads for deduplication
  const pendingLoads = new Map<string, Promise<FileEntry[]>>()

  // Computed — use a reactive trigger since Map is not reactive
  const cacheTrigger = ref(0)
  const rootEntries = computed(() => {
    void cacheTrigger.value  // track reactivity
    return directoryCache.get(rootPath.value) ?? []
  })

  const isDriveRoot = computed(() => rootPath.value === '')

  const visibleRootEntries = computed(() => {
    const entries = rootEntries.value
    if (showHiddenFiles.value) return entries
    return entries.filter(e => !e.is_hidden)
  })

  function cacheSet(path: string, entries: FileEntry[]): void {
    // Remove from order if already exists
    const idx = cacheOrder.indexOf(path)
    if (idx > -1) cacheOrder.splice(idx, 1)

    // Evict oldest if at capacity
    if (cacheOrder.length >= MAX_CACHE_SIZE) {
      const oldest = cacheOrder.shift()!
      directoryCache.delete(oldest)
    }

    directoryCache.set(path, entries)
    cacheOrder.push(path)
    cacheTrigger.value++
  }

  // Actions
  async function loadDirectory(path: string): Promise<FileEntry[]> {
    // Return cached if available
    const cached = directoryCache.get(path)
    if (cached) return cached

    // Deduplicate concurrent requests for same path
    const pending = pendingLoads.get(path)
    if (pending) return pending

    const loadPromise = (async () => {
      try {
        const entries = await invoke<FileEntry[]>('read_directory', { path })
        cacheSet(path, entries)
        return entries
      } catch (error: unknown) {
        console.error('Failed to read directory:', error)
        return []
      } finally {
        pendingLoads.delete(path)
      }
    })()

    pendingLoads.set(path, loadPromise)
    return loadPromise
  }

  async function toggleDirectory(path: string): Promise<void> {
    if (expandedDirs.value.has(path)) {
      const next = new Set(expandedDirs.value)
      next.delete(path)
      expandedDirs.value = next
    } else {
      const next = new Set(expandedDirs.value)
      next.add(path)
      expandedDirs.value = next
      await loadDirectory(path)
    }
  }

  function navigateUp(): void {
    if (!rootPath.value) return
    // Check if at drive root (e.g. "C:\", "C:", "D:\")
    if (/^[A-Za-z]:[\\/]?$/.test(rootPath.value)) {
      navigateToDirectory('')
      return
    }
    const parent = rootPath.value.replace(/[\\/][^\\/]+$/, '')
    if (!parent || parent === rootPath.value) {
      // Unresolvable parent — fall back to drive list
      navigateToDirectory('')
      return
    }
    navigateToDirectory(parent)
  }

  async function loadDrives(): Promise<FileEntry[]> {
    const DRIVES_KEY = ''
    const cached = directoryCache.get(DRIVES_KEY)
    if (cached) return cached

    const pending = pendingLoads.get(DRIVES_KEY)
    if (pending) return pending

    const loadPromise = (async () => {
      try {
        const entries = await invoke<FileEntry[]>('list_drives')
        cacheSet(DRIVES_KEY, entries)
        return entries
      } catch (error: unknown) {
        console.error('Failed to list drives:', error)
        return []
      } finally {
        pendingLoads.delete(DRIVES_KEY)
      }
    })()

    pendingLoads.set(DRIVES_KEY, loadPromise)
    return loadPromise
  }

  async function navigateToDirectory(path: string): Promise<void> {
    rootPath.value = path
    expandedDirs.value = new Set()
    isLoading.value = true
    try {
      if (path === '') {
        await loadDrives()
      } else {
        await loadDirectory(path)
      }
    } finally {
      isLoading.value = false
    }
  }

  function refreshAll(): void {
    directoryCache.clear()
    cacheOrder.length = 0
    cacheTrigger.value++
    expandedDirs.value = new Set()
    isLoading.value = true
    const loadFn = rootPath.value === '' ? loadDrives() : loadDirectory(rootPath.value)
    loadFn.finally(() => {
      isLoading.value = false
    })
  }

  function toggleVisibility(): void {
    isVisible.value = !isVisible.value
    localStorage.setItem(STORAGE_KEY_VISIBLE, String(isVisible.value))
  }

  function setSidebarWidth(width: number): void {
    sidebarWidth.value = Math.max(150, Math.min(400, width))
    localStorage.setItem(STORAGE_KEY_WIDTH, String(sidebarWidth.value))
  }

  function toggleHiddenFiles(): void {
    showHiddenFiles.value = !showHiddenFiles.value
  }

  function getDirectoryEntries(path: string): FileEntry[] {
    void cacheTrigger.value  // track reactivity
    return directoryCache.get(path) ?? []
  }

  function getVisibleEntries(path: string): FileEntry[] {
    const entries = getDirectoryEntries(path)
    if (showHiddenFiles.value) return entries
    return entries.filter(e => !e.is_hidden)
  }

  async function initFromTerminal(): Promise<void> {
    const terminalStore = useTerminalStore()
    const activeTerm = terminalStore.activeTerminal

    let initialPath = activeTerm?.cwd || ''

    if (!initialPath) {
      try {
        initialPath = await invoke<string>('get_home_directory')
      } catch {
        initialPath = 'C:\\'
      }
    }

    await navigateToDirectory(initialPath)
  }

  return {
    // State
    rootPath,
    isVisible,
    sidebarWidth,
    showHiddenFiles,
    expandedDirs,
    isLoading,
    // Computed
    isDriveRoot,
    rootEntries,
    visibleRootEntries,
    // Actions
    loadDirectory,
    loadDrives,
    toggleDirectory,
    navigateUp,
    navigateToDirectory,
    refreshAll,
    toggleVisibility,
    setSidebarWidth,
    toggleHiddenFiles,
    getDirectoryEntries,
    getVisibleEntries,
    initFromTerminal,
  }
})
