<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { ClaudeStatus } from '../stores/terminal'
import { playSound, stopSound } from '../utils/sounds'

const avatarLoadError = ref(false)

const props = defineProps<{
  id: number
  name: string
  status: ClaudeStatus
  avatarUrl?: string
  isActive: boolean
}>()

const emit = defineEmits<{
  click: [id: number]
  editAvatar: [id: number]
}>()

const statusClass = computed(() => props.status || 'idle')

const speechBubbleText = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'Help!'
    case 'completed':
      return '報告!!\n已完成'
    default:
      return ''
  }
})

// Status emoji for collapsed mode
const statusEmoji = computed(() => {
  switch (props.status) {
    case 'working':
      return '⏳'
    case 'waiting':
      return '❓'
    case 'completed':
      return '✅'
    default:
      return '💤'
  }
})

// Watch status changes and play sounds
watch(() => props.status, (newStatus, oldStatus) => {
  if (newStatus === oldStatus) return

  // Stop typing sound when leaving working state
  if (oldStatus === 'working') {
    stopSound('typing')
  }

  // Play appropriate sound for new status
  switch (newStatus) {
    case 'working':
      playSound('typing', true) // loop
      break
    case 'waiting':
      playSound('help')
      break
    case 'completed':
      playSound('complete')
      break
  }
})

// Cleanup sound when component is destroyed (terminal closed)
onUnmounted(() => {
  if (props.status === 'working') {
    stopSound('typing')
  }
})

function handleClick() {
  emit('click', props.id)
}

function handleDoubleClick() {
  emit('editAvatar', props.id)
}

function handleImageError() {
  avatarLoadError.value = true
}

// Reset error when avatar URL changes
watch(() => props.avatarUrl, () => {
  avatarLoadError.value = false
})

// Expose for parent component (collapsed mode)
defineExpose({
  statusEmoji
})
</script>

<template>
  <div
    class="mini-worker"
    :class="[`status-${statusClass}`, { active: isActive }]"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    :title="`${name} - ${status}`"
  >
    <!-- Status LED -->
    <div class="status-led" :class="statusClass"></div>
    <!-- Pixel Desk -->
    <div class="desk">
      <div class="monitor">
        <div class="screen" :class="[statusClass, { 'no-animation': !isActive }]"></div>
      </div>
      <div class="keyboard"></div>
    </div>

    <!-- Pixel Character -->
    <div class="character" :class="[statusClass, { 'no-animation': !isActive }]">
      <!-- Custom Avatar or Default Pixel Person -->
      <div v-if="avatarUrl && !avatarLoadError" class="avatar-custom">
        <img
          :src="avatarUrl"
          :alt="name"
          referrerpolicy="no-referrer"
          @error="handleImageError"
        />
      </div>
      <div v-else class="avatar-pixel">
        <!-- Pixel person using CSS -->
        <div class="pixel-head"></div>
        <div class="pixel-body"></div>
        <div class="pixel-arms" :class="[statusClass, { 'no-animation': !isActive }]"></div>
      </div>
    </div>

    <!-- Speech Bubble -->
    <div v-if="speechBubbleText" class="speech-bubble" :class="statusClass">
      <span>{{ speechBubbleText }}</span>
    </div>

    <!-- Name Tag -->
    <div class="name-tag">{{ name }}</div>
  </div>
</template>

<style scoped>
.mini-worker {
  position: relative;
  width: 80px;
  height: 90px;
  padding: 4px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  background: var(--panel-bg);
  border: 2px solid transparent;
  border-left: 3px solid transparent;
  flex-shrink: 0;
}

.mini-worker:hover {
  background: var(--hover-bg);
  transform: translateY(-1px);
}

.mini-worker.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 6px rgba(79, 70, 229, 0.3);
}

/* Left border status indicator */
.mini-worker.status-working {
  border-left: 3px solid #22d3ee;
}
.mini-worker.status-waiting {
  border-left: 3px solid #fb923c;
  animation: borderPulse 0.6s ease-in-out infinite alternate;
}
.mini-worker.status-completed {
  border-left: 3px solid #4ade80;
}

@keyframes borderPulse {
  from { border-left-color: #fb923c; }
  to { border-left-color: rgba(251, 146, 60, 0.4); }
}

/* Status LED indicator */
.status-led {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #666;
  z-index: 5;
}
.status-led.working {
  background: #22d3ee;
  box-shadow: 0 0 4px #22d3ee;
  animation: ledPulse 1s ease-in-out infinite;
}
.status-led.waiting {
  background: #fb923c;
  box-shadow: 0 0 4px #fb923c;
  animation: ledBlink 0.6s ease-in-out infinite;
}
.status-led.completed {
  background: #4ade80;
  box-shadow: 0 0 4px #4ade80;
}

@keyframes ledPulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #22d3ee; }
  50% { opacity: 0.5; box-shadow: 0 0 8px #22d3ee; }
}

@keyframes ledBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}

/* Pixel Desk - scaled down */
.desk {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.monitor {
  width: 28px;
  height: 20px;
  background: #333;
  border: 2px solid #555;
  border-radius: 2px;
  padding: 1px;
  image-rendering: pixelated;
}

.screen {
  width: 100%;
  height: 100%;
  background: #1a1a2e;
  transition: background 0.3s ease;
}

.screen.working {
  background: #16213e;
  animation: screenGlow 0.5s ease-in-out infinite alternate;
}

.screen.waiting {
  background: #ff6b6b;
  animation: screenBlink 0.8s ease-in-out infinite;
}

.screen.completed {
  background: #51cf66;
  animation: completedPulse 1.5s ease-in-out infinite alternate;
}

@keyframes completedPulse {
  from { background: #51cf66; }
  to { background: #40c057; box-shadow: 0 0 4px rgba(81, 207, 102, 0.6); }
}

@keyframes screenGlow {
  from { background: #16213e; }
  to { background: #1e90ff; }
}

@keyframes screenBlink {
  0%, 100% { background: #ff6b6b; }
  50% { background: #c92a2a; }
}

.keyboard {
  width: 24px;
  height: 4px;
  background: #666;
  border-radius: 1px;
  margin-top: 1px;
}

/* Pixel Character - scaled down */
.character {
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 32px;
}

.avatar-custom {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  overflow: hidden;
  image-rendering: pixelated;
}

.avatar-custom img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Default Pixel Person - scaled down */
.avatar-pixel {
  position: relative;
  width: 22px;
  height: 32px;
}

.pixel-head {
  position: absolute;
  top: 0;
  left: 5px;
  width: 12px;
  height: 12px;
  background: #ffd8b1;
  border-radius: 2px;
  image-rendering: pixelated;
}

.pixel-head::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 0;
  width: 12px;
  height: 4px;
  background: #4a4a4a;
  border-radius: 2px 2px 0 0;
}

/* Eyes */
.pixel-head::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 2px;
  width: 2px;
  height: 2px;
  background: #333;
  box-shadow: 5px 0 0 #333;
  image-rendering: pixelated;
}

.pixel-body {
  position: absolute;
  top: 12px;
  left: 4px;
  width: 14px;
  height: 14px;
  background: #4a90d9;
  border-radius: 2px;
  image-rendering: pixelated;
}

.pixel-arms {
  position: absolute;
  top: 13px;
  left: 0;
  width: 4px;
  height: 10px;
  background: #ffd8b1;
  border-radius: 1px;
  box-shadow: 18px 0 0 #ffd8b1;
  transition: all 0.1s ease;
  image-rendering: pixelated;
}

/* Arm animations based on status - always run regardless of active state */
.pixel-arms.working {
  animation: typing 0.2s ease-in-out infinite alternate;
  animation-play-state: running !important;
}

.pixel-arms.waiting {
  top: 3px;
  transform: rotate(-25deg);
  transform-origin: bottom center;
  animation: raiseHand 0.5s ease-in-out infinite alternate;
  animation-play-state: running !important;
}

.pixel-arms.completed {
  top: 13px;
  left: 1px;
  box-shadow: 16px 0 0 #ffd8b1;
}

@keyframes typing {
  from { transform: translateY(0); }
  to { transform: translateY(2px); }
}

@keyframes raiseHand {
  from { transform: rotate(-25deg); }
  to { transform: rotate(-55deg); }
}

/* Idle animation - always runs (lightweight, no performance concern) */
.character.idle .avatar-pixel {
  animation: idleBob 2s ease-in-out infinite;
}

.character.idle.no-animation .avatar-pixel {
  animation: idleBob 2s ease-in-out infinite !important;
}

/* Working animation - body sways while typing */
.character.working .avatar-pixel {
  animation: workingSway 0.6s ease-in-out infinite alternate;
}

.character.working.no-animation .avatar-pixel {
  animation: workingSway 0.6s ease-in-out infinite alternate !important;
}

/* Waiting animation - body bounces for attention */
.character.waiting .avatar-pixel {
  animation: waitingBounce 0.8s ease-in-out infinite;
}

.character.waiting.no-animation .avatar-pixel {
  animation: waitingBounce 0.8s ease-in-out infinite !important;
}

@keyframes idleBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes workingSway {
  from { transform: translateX(-2px); }
  to { transform: translateX(2px); }
}

@keyframes waitingBounce {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-6px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(-3px); }
}

/* Speech Bubble - scaled down */
.speech-bubble {
  position: absolute;
  top: -2px;
  right: -4px;
  padding: 2px 4px;
  background: white;
  border: 1.5px solid #333;
  border-radius: 4px;
  font-size: 7px;
  font-weight: bold;
  white-space: pre-line;
  text-align: center;
  z-index: 10;
  animation: bubblePop 0.3s ease-out;
  image-rendering: auto;
  line-height: 1.2;
}

.speech-bubble::before {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 6px;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid #333;
}

.speech-bubble::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 7px;
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-top: 4px solid white;
}

.speech-bubble.waiting {
  background: #fff3bf;
  border-color: #f59f00;
  color: #e67700;
}

.speech-bubble.waiting::before {
  border-top-color: #f59f00;
}

.speech-bubble.waiting::after {
  border-top-color: #fff3bf;
}

.speech-bubble.completed {
  background: #d3f9d8;
  border-color: #40c057;
  color: #2f9e44;
}

.speech-bubble.completed::before {
  border-top-color: #40c057;
}

.speech-bubble.completed::after {
  border-top-color: #d3f9d8;
}

@keyframes bubblePop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Pause heavy animations for non-active workers (performance optimization) */
/* Note: idle/working/waiting character animations override this via specific selectors above */
.no-animation {
  animation-play-state: paused !important;
}

/* Screen animations always run so users can see status at a glance */
.screen.no-animation.working {
  animation: screenGlow 0.5s ease-in-out infinite alternate !important;
  animation-play-state: running !important;
}

.screen.no-animation.waiting {
  animation: screenBlink 0.8s ease-in-out infinite !important;
  animation-play-state: running !important;
}

.screen.no-animation.completed {
  animation: completedPulse 1.5s ease-in-out infinite alternate !important;
  animation-play-state: running !important;
}

/* Name Tag - scaled down */
.name-tag {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 1px 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 2px;
  font-size: 8px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
}
</style>
