// Sound effects system for Virtual Office

export type SoundName = 'typing' | 'help' | 'complete'

interface SoundInstance {
  audio: HTMLAudioElement
  isLooping: boolean
}

const soundInstances: Map<SoundName, SoundInstance> = new Map()

// Sound file paths
const soundPaths: Record<SoundName, string> = {
  typing: '/sounds/typing.mp3',
  help: '/sounds/help.mp3',
  complete: '/sounds/complete.mp3'
}

// Volume levels
const volumeLevels: Record<SoundName, number> = {
  typing: 0.3,
  help: 0.5,
  complete: 0.5
}

// Storage key for mute state
const MUTE_STORAGE_KEY = 'agent-monitor-sound-muted'

// Global mute state - load from localStorage
let isMuted = (() => {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
})()

/**
 * Initialize a sound if not already loaded
 */
function getOrCreateSound(name: SoundName): SoundInstance {
  let instance = soundInstances.get(name)
  if (!instance) {
    const audio = new Audio(soundPaths[name])
    audio.volume = volumeLevels[name]
    instance = { audio, isLooping: false }
    soundInstances.set(name, instance)
  }
  return instance
}

/**
 * Play a sound effect
 * @param name - Sound name to play
 * @param loop - Whether to loop the sound (default: false)
 */
export function playSound(name: SoundName, loop: boolean = false): void {
  if (isMuted) return

  try {
    const instance = getOrCreateSound(name)

    // Stop current playback first to avoid race conditions
    instance.audio.pause()

    instance.audio.loop = loop
    instance.isLooping = loop
    instance.audio.currentTime = 0

    instance.audio.play().catch(() => {
      // Silently ignore autoplay restrictions
    })
  } catch {
    // Silently fail - sound is non-critical
  }
}

/**
 * Stop a looping sound
 * @param name - Sound name to stop
 */
export function stopSound(name: SoundName): void {
  const instance = soundInstances.get(name)
  if (instance && instance.isLooping) {
    instance.audio.pause()
    instance.audio.currentTime = 0
    instance.isLooping = false
  }
}

/**
 * Stop all sounds
 */
export function stopAllSounds(): void {
  soundInstances.forEach((instance) => {
    instance.audio.pause()
    instance.audio.currentTime = 0
    instance.isLooping = false
  })
}

/**
 * Cleanup all sound resources
 */
export function cleanup(): void {
  soundInstances.forEach((instance) => {
    instance.audio.pause()
    instance.audio.src = ''
  })
  soundInstances.clear()
}

/**
 * Set global mute state (persisted to localStorage)
 */
export function setMuted(muted: boolean): void {
  isMuted = muted
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted))
  } catch {
    // Storage not available
  }
  if (muted) {
    stopAllSounds()
  }
}

/**
 * Get current mute state
 */
export function getMuted(): boolean {
  return isMuted
}

/**
 * Set volume for a specific sound
 */
export function setVolume(name: SoundName, volume: number): void {
  const instance = soundInstances.get(name)
  if (instance) {
    instance.audio.volume = Math.max(0, Math.min(1, volume))
  }
  volumeLevels[name] = volume
}
