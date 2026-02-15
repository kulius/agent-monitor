<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useDebounceFn } from '@vueuse/core'
import { useTerminalStore } from '../stores/terminal'
import { stripAnsi } from '../utils/ansi'

const props = defineProps<{
  terminalId: number
}>()

const store = useTerminalStore()

const terminalRef = ref<HTMLDivElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let unlistenOutput: UnlistenFn | null = null
let resizeObserver: ResizeObserver | null = null

// Track initialization state
const isInitialized = ref(false)

// Buffer for storing output when terminal is not active (lazy init optimization)
let pendingOutputBuffer: string[] = []
const MAX_BUFFER_SIZE = 50000 // Max chars to buffer

// Check if this terminal is currently active
const isActive = computed(() => store.activeTerminalId === props.terminalId)

function initTerminal() {
  if (!terminalRef.value || isInitialized.value) return

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#ffffff',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#264f78',
      selectionForeground: '#ffffff',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff'
    },
    allowProposedApi: true,
    scrollback: 1500,
    fastScrollSensitivity: 5
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())

  terminal.open(terminalRef.value)

  // Handle user input
  terminal.onData((data) => {
    store.writeToTerminal(props.terminalId, data)
  })

  // Handle resize
  terminal.onResize(({ cols, rows }) => {
    store.resizeTerminal(props.terminalId, cols, rows)
  })

  // Clipboard: Ctrl+Shift+C to copy, Ctrl+Shift+V to paste
  // Also: right-click copies selection (or pastes if no selection)
  terminal.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true

    // Ctrl+Shift+C → copy selection to clipboard
    if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
      const selection = terminal?.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
      }
      return false
    }

    // Ctrl+Shift+V → paste from clipboard
    if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyV') {
      navigator.clipboard.readText().then(text => {
        if (text && terminal) {
          store.writeToTerminal(props.terminalId, text)
        }
      })
      return false
    }

    return true
  })

  // Right-click: copy selection or paste
  terminalRef.value.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const selection = terminal?.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
      terminal?.clearSelection()
    } else {
      navigator.clipboard.readText().then(text => {
        if (text && terminal) {
          store.writeToTerminal(props.terminalId, text)
        }
      })
    }
  })

  isInitialized.value = true

  // Write any buffered output
  if (pendingOutputBuffer.length > 0) {
    const bufferedData = pendingOutputBuffer.join('')
    terminal.write(bufferedData)
    pendingOutputBuffer = []
  }

  // Delay fit until browser layout has settled
  // requestAnimationFrame ensures the DOM has been painted
  requestAnimationFrame(() => {
    if (fitAddon && terminal) {
      fitAddon.fit()
      const { cols, rows } = terminal
      store.resizeTerminal(props.terminalId, cols, rows)
    }
  })
}

// Thinking verbs used by AI coding agents (Set for O(1) lookup)
const THINKING_VERBS = new Set([
  'thinking', 'pondering', 'befuddling', 'cogitating', 'ruminating',
  'musing', 'deliberating', 'considering', 'reflecting', 'contemplating',
  'meditating', 'analyzing', 'synthesizing', 'evaluating', 'conceptualizing',
  'brainstorming', 'deducing', 'reasoning', 'processing', 'inferring',
  'hypothesizing', 'extrapolating', 'formulating', 'theorizing', 'assessing',
  'investigating', 'examining', 'interpreting', 'strategizing', 'deciphering',
  'integrating', 'abstracting', 'calculating', 'envisioning', 'innovating',
  'elaborating', 'speculating', 'rationalizing', 'orchestrating', 'consolidating',
  'distilling', 'projecting', 'recalibrating', 'adapting', 'iterating',
  'mapping', 'reconciling', 'sculpting', 'navigating', 'untangling',
  'crystallizing', 'visualizing', 'connecting', 'calibrating', 'transcending',
  'channeling', 'deconstructing', 'illuminating', 'harmonizing', 'balancing',
  'weaving',
])

function isThinkingLine(text: string): boolean {
  const match = text.match(/(\w+)(?:\.{3}| \.\.\.)/i)
  return match !== null && THINKING_VERBS.has(match[1].toLowerCase())
}

// IMPORTANT: Do NOT add the 'g' flag to these patterns.
// Using .test() with 'g' flag causes stateful lastIndex behavior
// that produces alternating true/false results.
//
// Supports: Claude Code, OpenCode, and similar AI coding agents
const AGENT_PATTERNS = {
  waiting: [
    /\?\s*$/m,
    /\[Y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /waiting for.*input/i,
    /please (choose|select|enter)/i,
    // Claude Code permission prompts
    /Allow once/i,
    /Allow always/i,
    /Do you want to proceed/i,
    // OpenCode permission prompts
    /\b(?:approve|allow|deny|ask)\b.*(?:tool|bash|edit|write)/i,
    /permission.*(?:required|needed)/i,
  ],
  completed: [
    /completed successfully/i,
    /task complete/i,
    /已完成/,
    /完成了/,
    // Claude Code cost summary
    /Total cost:/,
    /Total cost:.*\d+ tool use/is,
    // OpenCode session summary patterns
    /session (?:complete|ended|finished)/i,
    /tokens?\s*used/i,
  ],
  working: [
    // Thought duration indicator (both agents)
    /\(thought for \d+s\)/,
    // Claude Code tool calls (PascalCase)
    /(?:Read|Write|Edit|Bash|Grep|Glob|Task|Explore|WebSearch|WebFetch|TodoWrite|TodoRead|NotebookEdit)\s*\(/,
    // OpenCode tool calls (lowercase)
    /(?:bash|edit|write|patch|read|grep|glob|list|skill|todowrite|todoread|webfetch|websearch|question|lsp)\s*\(/,
    // Hook execution (Claude Code)
    /Running (?:PreToolUse|PostToolUse|Stop) hook/i,
    // Structural symbols from agent TUI output
    /[├└│●]\s+\S/,
    // "esc to interrupt" prompt (Claude Code)
    /esc to interrupt/i,
    // OpenCode agent activity
    /\b(?:Build|Plan|Explore|General)\b.*(?:agent|thinking|working)/i,
    // Generic tool execution indicators
    /Executing.*tool/i,
    /Running command/i,
  ]
}

let outputBuffer = ''
let bufferTimeout: ReturnType<typeof setTimeout> | null = null
let idleTimeout: ReturnType<typeof setTimeout> | null = null
let lastStatusChange = 0
let currentStatus: 'idle' | 'working' | 'waiting' | 'completed' = 'idle'

const STATUS_MIN_DURATION: Record<string, number> = {
  completed: 2000,
  waiting: 2000,
}
const IDLE_TIMEOUT_MS = 15000

function setStatus(status: 'idle' | 'working' | 'waiting' | 'completed') {
  const now = Date.now()
  // Protect completed/waiting from being overridden too quickly
  const minDuration = STATUS_MIN_DURATION[currentStatus] ?? 0
  if (minDuration > 0 && now - lastStatusChange < minDuration && status !== currentStatus) {
    return
  }
  if (status !== currentStatus) {
    currentStatus = status
    lastStatusChange = now
    store.updateClaudeStatus(props.terminalId, status)
  }
}

function resetIdleTimer() {
  if (idleTimeout) clearTimeout(idleTimeout)
  idleTimeout = setTimeout(() => {
    // Don't reset to idle when waiting for user input
    if (currentStatus !== 'waiting') {
      setStatus('idle')
    }
  }, IDLE_TIMEOUT_MS)
}

function detectAgentStatus(data: string) {
  const clean = stripAnsi(data)
  outputBuffer += clean

  // Trim buffer - keep tail for context
  if (outputBuffer.length > 4000) {
    outputBuffer = outputBuffer.slice(-2000)
  }

  // Reset idle timer on any output
  resetIdleTimer()

  if (bufferTimeout) clearTimeout(bufferTimeout)
  bufferTimeout = setTimeout(() => {
    // Trim again in case more data arrived during debounce
    if (outputBuffer.length > 4000) {
      outputBuffer = outputBuffer.slice(-2000)
    }

    // Priority: waiting > completed > working
    for (const pattern of AGENT_PATTERNS.waiting) {
      if (pattern.test(outputBuffer)) {
        setStatus('waiting')
        outputBuffer = outputBuffer.slice(-500)
        return
      }
    }

    for (const pattern of AGENT_PATTERNS.completed) {
      if (pattern.test(outputBuffer)) {
        setStatus('completed')
        outputBuffer = outputBuffer.slice(-500)
        return
      }
    }

    // Check thinking verbs (Set-based, O(1) per line)
    if (isThinkingLine(outputBuffer)) {
      setStatus('working')
      outputBuffer = outputBuffer.slice(-500)
      return
    }

    for (const pattern of AGENT_PATTERNS.working) {
      if (pattern.test(outputBuffer)) {
        setStatus('working')
        outputBuffer = outputBuffer.slice(-500)
        return
      }
    }
  }, 300)
}

async function setupOutputListener() {
  unlistenOutput = await listen<{ id: number; data: string }>('terminal-output', (event) => {
    if (event.payload.id === props.terminalId) {
      // Always detect status regardless of initialization
      detectAgentStatus(event.payload.data)

      if (terminal && isInitialized.value) {
        // Terminal is ready, write directly
        terminal.write(event.payload.data)
      } else {
        // Buffer output until terminal is initialized
        pendingOutputBuffer.push(event.payload.data)

        // Trim buffer if too large (keep recent output)
        const totalLength = pendingOutputBuffer.reduce((sum, s) => sum + s.length, 0)
        if (totalLength > MAX_BUFFER_SIZE) {
          // Remove oldest entries until under limit
          while (pendingOutputBuffer.length > 1 &&
                 pendingOutputBuffer.reduce((sum, s) => sum + s.length, 0) > MAX_BUFFER_SIZE * 0.8) {
            pendingOutputBuffer.shift()
          }
        }
      }
    }
  })
}

const handleResize = useDebounceFn(() => {
  if (fitAddon && terminal && isInitialized.value) {
    fitAddon.fit()
  }
}, 100)

onMounted(async () => {
  // Always setup output listener to not miss any data
  await setupOutputListener()

  // Only initialize xterm if this is the active terminal
  if (isActive.value) {
    await nextTick()
    initTerminal()

    if (terminalRef.value) {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(terminalRef.value)
    }
  }
})

onUnmounted(() => {
  // Clear timers first to prevent late callbacks
  if (bufferTimeout) clearTimeout(bufferTimeout)
  if (idleTimeout) clearTimeout(idleTimeout)
  outputBuffer = ''

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (unlistenOutput) {
    unlistenOutput()
    unlistenOutput = null
  }
  if (fitAddon) {
    fitAddon.dispose()
    fitAddon = null
  }
  if (terminal) {
    terminal.dispose()
    terminal = null
  }
  pendingOutputBuffer = []
})

// Initialize terminal when it becomes active (lazy initialization)
watch(
  () => store.activeTerminalId,
  async (newActiveId) => {
    if (newActiveId === props.terminalId) {
      await nextTick()

      if (!isInitialized.value) {
        // First time becoming active - initialize terminal
        initTerminal()

        if (terminalRef.value && !resizeObserver) {
          resizeObserver = new ResizeObserver(handleResize)
          resizeObserver.observe(terminalRef.value)
        }
      } else if (terminal && fitAddon) {
        // Already initialized - wait for layout then refit and focus
        requestAnimationFrame(() => {
          if (fitAddon && terminal) {
            fitAddon.fit()
            terminal.focus()
          }
        })
      }
    }
  }
)

// Reset display when triggered from store (targeted by terminal ID)
watch(
  () => store.resetTargetId,
  (targetId) => {
    if (targetId === props.terminalId && terminal && fitAddon) {
      // 1. Clear xterm.js buffer and state
      terminal.reset()
      // 2. Refit to recalculate dimensions
      fitAddon.fit()
      // 3. Send resize to PTY (forces TUI app to redraw via SIGWINCH)
      const { cols, rows } = terminal
      store.resizeTerminal(props.terminalId, cols, rows)
    }
  }
)

defineExpose({
  focus: () => terminal?.focus(),
  fit: () => fitAddon?.fit(),
  resetDisplay: () => store.triggerResetDisplay()
})
</script>

<template>
  <div class="terminal-pane">
    <div ref="terminalRef" class="terminal-container">
      <!-- Show loading indicator if not initialized yet -->
      <div v-if="!isInitialized" class="terminal-loading">
        <span class="loading-text">Click to activate terminal...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-pane {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1e1e1e;
  overflow: hidden;
}

.terminal-container {
  width: 100%;
  height: 100%;
  padding: 4px;
  position: relative;
}

.terminal-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #666;
  font-size: 13px;
  font-family: Consolas, "Courier New", monospace;
}

.loading-text {
  opacity: 0.7;
}

:deep(.xterm) {
  height: 100%;
}
</style>

<style>
@import '@xterm/xterm/css/xterm.css';
</style>
