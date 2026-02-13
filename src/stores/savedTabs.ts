import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface SavedTab {
  id: string
  name: string
  cwd: string
  commands: string  // Multi-line commands, one per line
  createdAt: string
  avatarUrl?: string  // custom avatar for virtual office
}

const STORAGE_KEY = 'agent-monitor-saved-tabs'

export const useSavedTabsStore = defineStore('savedTabs', () => {
  const savedTabs = ref<SavedTab[]>([])

  function loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        savedTabs.value = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to load saved tabs:', error)
    }
  }

  function saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTabs.value))
    } catch (error) {
      console.error('Failed to save tabs:', error)
    }
  }

  function saveTab(name: string, cwd: string, commands: string = '', avatarUrl?: string): SavedTab {
    const tab: SavedTab = {
      id: `tab-${Date.now()}`,
      name,
      cwd,
      commands,
      createdAt: new Date().toISOString(),
      avatarUrl
    }
    savedTabs.value = [...savedTabs.value, tab]
    // Note: watcher handles persistence
    return tab
  }

  function removeTab(id: string): void {
    savedTabs.value = savedTabs.value.filter(t => t.id !== id)
    // Note: watcher handles persistence
  }

  function updateTab(id: string, updates: Partial<Pick<SavedTab, 'name' | 'cwd' | 'commands' | 'avatarUrl'>>): void {
    savedTabs.value = savedTabs.value.map(t =>
      t.id === id ? { ...t, ...updates } : t
    )
    // Note: watcher handles persistence
  }

  // Load on init
  loadFromStorage()

  // Auto-save on changes
  watch(savedTabs, saveToStorage, { deep: true })

  return {
    savedTabs,
    saveTab,
    removeTab,
    updateTab,
    loadFromStorage
  }
})
