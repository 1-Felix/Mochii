import type { Mochi, CanvasContext, GameState, Container, GameMode } from './types';
import { createMochi, updateMochi, checkMochiCollision, canMerge, mochiTiers, defaultConfig, DROPPABLE_TIERS } from './physics';
import { createCanvasContext, resizeCanvas, render, addMergeEffect, addCherryBlossoms, triggerCatWalk, updateEasterEggs, isCatWalking, initAmbientEffects, addDustPoof, MODE_TOGGLE_BOUNDS, initQualityMode, getQualityMode, setQualityMode, getQualityReason } from './renderer';
import { initLeaderboard, getLeaderboard, getOrCreatePlayerName, submitScore, setLeaderboardMode, fetchLeaderboard } from './leaderboard';
import { createSeededRandom, loadDailyChallenge, saveDailyChallenge, createTodayChallenge, generateShareText, copyToClipboard, getDayNumber, getTodayString } from './daily';
import type { WorkerInputMessage, WorkerOutputMessage, PhysicsEvent } from './physics-types';
import { serializeMochi, applyPhysicsToMochi } from './physics-types';

let context: CanvasContext;
let mochis: Mochi[] = [];
let gameState: GameState;
let animationId: number;
let lastTime = 0;
let dropCooldown = 0;
let playerName: string;

// Physics worker for off-main-thread physics simulation
let physicsWorker: Worker | null = null;
let useWorkerPhysics = false;
let pendingPhysicsUpdate = false;

// Performance profiling (toggle with 'P' key or 4-finger tap on mobile)
let profilingEnabled = false;
const perfMetrics = {
  fps: 0,
  frameTime: 0,
  updateTime: 0,
  physicsTime: 0,
  renderTime: 0,
  easterEggsTime: 0,
  frameCount: 0,
  lastFpsUpdate: 0,
  frameTimes: [] as number[],
};

// Seeded random function for daily mode
let seededRandom: (() => number) | null = null;

// Initialize physics worker (browser-only)
function initPhysicsWorker(): void {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    console.warn('Web Workers not supported, using main thread physics');
    return;
  }

  try {
    physicsWorker = new Worker(
      new URL('./physics-worker.ts', import.meta.url),
      { type: 'module' }
    );

    physicsWorker.onmessage = handleWorkerMessage;
    physicsWorker.onerror = (e) => {
      console.error('Physics worker error:', e);
      physicsWorker = null;
      useWorkerPhysics = false;
    };

    // Initialize worker with config
    physicsWorker.postMessage({
      type: 'init',
      config: defaultConfig,
      container: gameState?.container,
    } satisfies WorkerInputMessage);

  } catch (e) {
    console.warn('Failed to create physics worker:', e);
    physicsWorker = null;
  }
}

// Handle messages from physics worker
function handleWorkerMessage(e: MessageEvent<WorkerOutputMessage>): void {
  const message = e.data;

  if (message.type === 'ready') {
    useWorkerPhysics = true;
    console.log('Physics worker ready');
    return;
  }

  if (message.type === 'updated') {
    pendingPhysicsUpdate = false;

    // Apply physics updates to mochis
    const updatedMochis = message.mochis;
    for (const serialized of updatedMochis) {
      const mochi = mochis.find(m => m.id === serialized.id);
      if (mochi) {
        applyPhysicsToMochi(mochi, serialized);
      }
    }

    // Process physics events
    for (const event of message.events) {
      handlePhysicsEvent(event);
    }
  }
}

// Handle physics events from worker
function handlePhysicsEvent(event: PhysicsEvent): void {
  switch (event.event) {
    case 'merge': {
      const m1 = mochis.find(m => m.id === event.m1Id);
      const m2 = mochis.find(m => m.id === event.m2Id);
      if (m1 && m2) {
        handleMergeFromWorker(m1, m2, event.x, event.y, event.tier);
      }
      break;
    }

    case 'landed': {
      const mochi = mochis.find(m => m.id === event.mochiId);
      if (mochi) {
        // Trigger dust poof
        const bottomY = mochi.cy + mochi.baseRadius * 0.8;
        const intensity = Math.min(2, Math.abs(event.impactVelocity) * 0.3 + 0.5);
        addDustPoof(mochi.cx, bottomY, intensity);
      }
      break;
    }

    case 'floorImpact': {
      const mochi = mochis.find(m => m.id === event.mochiId);
      if (mochi && event.impactVelocity > 5) {
        mochi.emotion = 'squished';
        mochi.emotionTimer = Math.min(20, event.impactVelocity * 2);
        mochi.impactVelocity = event.impactVelocity;
      }
      break;
    }

    case 'gameOver':
      triggerGameOver();
      break;
  }
}

// Handle merge triggered by worker
function handleMergeFromWorker(m1: Mochi, m2: Mochi, mergeX: number, mergeY: number, newTier: number): void {
  // Add score
  const points = mochiTiers[newTier].points;
  gameState.score += points;

  // Track stats
  gameState.mergeCount++;
  if (newTier > gameState.highestTierReached) {
    gameState.highestTierReached = newTier;
  }

  // Update high score
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    localStorage.setItem('mochiHighScore', gameState.highScore.toString());
  }

  // Visual effects
  addMergeEffect(mergeX, mergeY, mochiTiers[newTier].radius, mochiTiers[newTier].color.primary);
  playMergeSound(newTier);

  // Delayed creation of new mochi
  setTimeout(() => {
    // Remove old mochis
    mochis = mochis.filter(m => m !== m1 && m !== m2);

    // Create new bigger mochi
    const newMochi = createMochi(mergeX, mergeY, newTier);
    newMochi.hasLanded = true;
    newMochi.emotion = 'love';
    newMochi.emotionTimer = 40;
    newMochi.wobbleIntensity = 2;

    // Give it a little upward pop
    for (const p of newMochi.points) {
      p.vy = -3;
    }

    mochis.push(newMochi);
  }, 150);
}

// Trigger game over state
function triggerGameOver(): void {
  if (gameState.gameOver) return;

  gameState.gameOver = true;
  // Set all mochis to celebrating
  for (const mochi of mochis) {
    mochi.emotion = 'celebrating';
    mochi.emotionTimer = 99999;
  }
  // Start modal animation
  gameState.modalAnimationProgress = 0;
  gameState.displayedScore = 0;
  // Submit score
  if (gameState.score > 0) {
    const dailyDate = gameState.gameMode === 'daily' ? getTodayString() : undefined;
    submitScore(playerName, gameState.score, gameState.gameMode, dailyDate);
  }
  // Save daily challenge result
  if (gameState.gameMode === 'daily' && gameState.dailyChallenge && !gameState.dailyChallenge.played) {
    gameState.dailyChallenge = {
      ...gameState.dailyChallenge,
      played: true,
      score: gameState.score,
      highestTier: gameState.highestTierReached,
      mergeCount: gameState.mergeCount,
    };
    saveDailyChallenge(gameState.dailyChallenge);
  }
}

// Saved game state per mode for toggle persistence
interface SavedModeState {
  mochis: Mochi[];
  gameState: GameState;
  dropCooldown: number;
  seededRandom: (() => number) | null;
}

let savedDailyState: SavedModeState | null = null;
let savedFreePlayState: SavedModeState | null = null;

// Get a random droppable tier (uses seeded random in daily mode)
// Accepts optional mode override for use during initGameState before gameState is assigned
function getNextTier(mode?: GameMode): number {
  const isDaily = mode === 'daily' || gameState?.gameMode === 'daily';
  const rand = isDaily && seededRandom ? seededRandom() : Math.random();
  return DROPPABLE_TIERS[Math.floor(rand * DROPPABLE_TIERS.length)];
}

// Sound management - Pentatonic scale for gentle plop sounds
// Higher pitch for small mochi, lower for large (reversed order)
const MERGE_NOTES = [
  523.25, // C5 - Tier 0 (Vanilla) - highest, small
  440.00, // A4 - Tier 1 (Sakura)
  392.00, // G4 - Tier 2 (Yuzu)
  329.63, // E4 - Tier 3 (Strawberry)
  293.66, // D4 - Tier 4 (Mango)
  261.63, // C4 - Tier 5 (Matcha)
  220.00, // A3 - Tier 6 (Taro)
  196.00, // G3 - Tier 7 (Hojicha)
  164.81, // E3 - Tier 8 (Chocolate)
  146.83, // D3 - Tier 9 (Black Sesame)
  130.81, // C3 - Tier 10 (Kuromame) - lowest, large
];

function playMergeSound(tier: number): void {
  if (!gameState || !gameState.soundEnabled) return;

  try {
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Get the note for this tier (clamped to available notes)
    const noteIndex = Math.min(tier, MERGE_NOTES.length - 1);
    const baseFreq = MERGE_NOTES[noteIndex];

    // Gentle "plop" sound - lower pitch drop with soft attack
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Add a warmer lowpass filter
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, audioContext.currentTime);
    filter.Q.setValueAtTime(0.7, audioContext.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    // Plop: start slightly higher, drop to a lower note for that bubble pop feel
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.4, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, audioContext.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, audioContext.currentTime + 0.25);

    // Soft, gentle envelope for plop feel
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.02); // Quick but soft attack
    gain.gain.exponentialRampToValueAtTime(0.03, audioContext.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.4);
  } catch {
    // Silently fail if audio doesn't work
  }
}


// Easter egg tracking
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let konamiIndex = 0;
let typedChars = '';
const IDLE_TIMEOUT = 30000; // 30 seconds
let wasCatWalking = false; // Track cat state for emotion reset

// Track landing states for dust poof effect
const previousLandingStates = new Map<number, boolean>();

// Fixed container size to prevent cheating
const CONTAINER_WIDTH = 320;
const CONTAINER_HEIGHT = 450;

function createContainer(width: number, height: number): Container {
  // Container is fixed size, just centered horizontally
  const x = (width - CONTAINER_WIDTH) / 2;

  // On mobile/smaller screens, shift container towards bottom
  // Leave more space at top for UI, less at bottom for thumb access
  const isMobile = width < 500 || height < 700;
  const bottomMargin = isMobile ? 20 : 40;
  const y = isMobile
    ? height - CONTAINER_HEIGHT - bottomMargin
    : (height - CONTAINER_HEIGHT) / 2 + 20;

  return {
    x,
    y,
    width: CONTAINER_WIDTH,
    height: CONTAINER_HEIGHT,
    wallThickness: 15,
    overflowLine: y + 60,
  };
}

function initGameState(mode: GameMode = 'daily'): void {
  // Clear saved state for this mode since we're starting fresh
  if (mode === 'daily') {
    savedDailyState = null;
  } else {
    savedFreePlayState = null;
  }

  const container = createContainer(context.width, context.height);

  // Set up seeded random for daily mode
  let dailyChallenge = null;
  if (mode === 'daily') {
    // Check if already played today
    const existing = loadDailyChallenge();
    if (existing?.played) {
      // Already played today - show results instead
      dailyChallenge = existing;
    } else {
      // New daily challenge
      dailyChallenge = existing ?? createTodayChallenge();
      seededRandom = createSeededRandom(dailyChallenge.seed);
    }
  } else {
    seededRandom = null;
  }

  // Store previous night mode preference
  const wasNightMode = gameState?.nightMode ?? false;
  const wasSoundEnabled = gameState?.soundEnabled ?? true;

  gameState = {
    score: 0,
    highScore: parseInt(localStorage.getItem('mochiHighScore') || '0'),
    gameOver: dailyChallenge?.played ?? false, // Show game over if already played
    currentMochi: null,
    currentTier: getNextTier(mode), // What player is about to drop
    nextTier: getNextTier(mode), // What's shown in "next" preview
    dropX: container.x + container.width / 2,
    canDrop: !dailyChallenge?.played,
    container,
    mouseX: 0,
    mouseY: 0,
    // UI hover state
    hoveredButton: null,
    buttonHoverProgress: 0,
    // Share button feedback
    shareCopiedTimer: 0,
    // Modal animation state
    modalAnimationProgress: dailyChallenge?.played ? 1 : 0, // Start complete if showing results
    displayedScore: dailyChallenge?.played ? dailyChallenge.score : 0,
    // Info tooltip state
    infoTooltipTimer: 0,
    // Easter eggs
    nightMode: wasNightMode,
    lastInteraction: Date.now(),
    easterEggActive: null,
    easterEggTimer: 0,
    // Sound
    soundEnabled: wasSoundEnabled,
    // Game mode
    gameMode: mode,
    dailyChallenge,
    mergeCount: 0,
    highestTierReached: 0,
  };
  mochis = [];
  dropCooldown = 0;
  konamiIndex = 0;
  typedChars = '';

  // Set leaderboard mode and fetch appropriate leaderboard
  const todayDate = getTodayString();
  setLeaderboardMode(mode, todayDate);
  if (mode === 'daily') {
    fetchLeaderboard('daily', todayDate);
  } else {
    fetchLeaderboard('practice');
  }
}

const DROP_COOLDOWN = 45; // Frames to wait between drops (~0.75 seconds)

function dropMochi(x: number): void {
  if (!gameState.canDrop || gameState.gameOver || dropCooldown > 0) return;

  const container = gameState.container;
  const tier = gameState.currentTier; // Use current tier for drop
  const tierData = mochiTiers[tier];

  // Clamp X within container
  const minX = container.x + container.wallThickness + tierData.radius;
  const maxX = container.x + container.width - container.wallThickness - tierData.radius;
  const clampedX = Math.max(minX, Math.min(maxX, x));

  // Create and drop the mochi
  const mochi = createMochi(clampedX, container.overflowLine - 50, tier);
  mochi.isDropping = true;
  mochi.emotion = 'surprised';
  mochi.emotionTimer = 12; // Brief surprised look when dropped

  // Give initial downward velocity to maintain falling speed with lower gravity
  for (const p of mochi.points) {
    p.vy = 2;
  }

  mochis.push(mochi);

  // Cycle tiers: current becomes next, next becomes new random
  gameState.currentTier = gameState.nextTier;
  gameState.nextTier = getNextTier();
  gameState.canDrop = false;
  dropCooldown = DROP_COOLDOWN;
}

function mergeMochis(m1: Mochi, m2: Mochi): void {
  // Start merge animation
  m1.merging = true;
  m2.merging = true;
  m1.mergeTimer = 1;
  m2.mergeTimer = 1;

  // Calculate merge position (midpoint)
  const mergeX = (m1.cx + m2.cx) / 2;
  const mergeY = (m1.cy + m2.cy) / 2;
  const newTier = m1.tier + 1;

  // Add score
  const points = mochiTiers[newTier].points;
  gameState.score += points;

  // Track stats for daily challenge
  gameState.mergeCount++;
  if (newTier > gameState.highestTierReached) {
    gameState.highestTierReached = newTier;
  }

  // Update high score
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    localStorage.setItem('mochiHighScore', gameState.highScore.toString());
  }

  // Add merge effect
  addMergeEffect(mergeX, mergeY, mochiTiers[newTier].radius, mochiTiers[newTier].color.primary);

  // Play harmonizing merge sound based on tier
  playMergeSound(newTier);

  // Delayed creation of new mochi
  setTimeout(() => {
    // Remove old mochis
    mochis = mochis.filter(m => m !== m1 && m !== m2);

    // Create new bigger mochi
    const newMochi = createMochi(mergeX, mergeY, newTier);
    newMochi.hasLanded = true;
    newMochi.emotion = 'love';
    newMochi.emotionTimer = 40;
    newMochi.wobbleIntensity = 2;

    // Give it a little upward pop
    for (const p of newMochi.points) {
      p.vy = -3;
    }

    mochis.push(newMochi);
  }, 150);
}

function checkGameOver(): boolean {
  // Check if any fully settled mochi is above the overflow line
  for (const mochi of mochis) {
    // Skip mochi that are merging, dropping, or haven't settled yet
    if (mochi.merging || mochi.isDropping || !mochi.hasLanded) continue;
    if (mochi.settleTimer > 0) continue; // Still in grace period

    // Check if the top of the mochi is above the overflow line
    const topY = mochi.cy - mochi.baseRadius;
    if (topY < gameState.container.overflowLine) {
      // Additional check: must be relatively stationary
      const speed = Math.sqrt(mochi.vx ** 2 + mochi.vy ** 2);
      if (speed < 2) {
        return true;
      }
    }
  }
  return false;
}

// Fixed timestep for physics stability
const PHYSICS_DT = 0.5; // Target ~120fps physics rate

// Send physics update to worker
function postPhysicsToWorker(dt: number): void {
  if (!physicsWorker || pendingPhysicsUpdate) return;

  pendingPhysicsUpdate = true;
  const serializedMochis = mochis.map(serializeMochi);

  physicsWorker.postMessage({
    type: 'update',
    mochis: serializedMochis,
    container: gameState.container,
    dt,
  } satisfies WorkerInputMessage);
}

// Main thread fallback physics (used when worker not available)
function updatePhysicsMainThread(dt: number): void {
  const { container } = gameState;

  // Sub-stepping: run physics at consistent rate for stability
  const numSteps = Math.ceil(dt / PHYSICS_DT);
  const stepDt = dt / numSteps;

  for (let step = 0; step < numSteps; step++) {
    // Update all mochis
    for (const mochi of mochis) {
      if (!mochi.merging) {
        updateMochi(mochi, defaultConfig, container, stepDt);
      }
    }

    // Check collisions between mochis
    for (let i = 0; i < mochis.length; i++) {
      for (let j = i + 1; j < mochis.length; j++) {
        checkMochiCollision(mochis[i], mochis[j]);
      }
    }
  }

  // Post-physics updates for fallback mode
  for (const mochi of mochis) {
    if (!mochi.merging) {
      // Check for landing - spawn dust poof
      const wasLanded = previousLandingStates.get(mochi.id) ?? false;
      if (mochi.hasLanded && !wasLanded) {
        const bottomY = mochi.cy + mochi.baseRadius * 0.8;
        const intensity = Math.min(2, Math.abs(mochi.impactVelocity) * 0.3 + 0.5);
        addDustPoof(mochi.cx, bottomY, intensity);
      }
      previousLandingStates.set(mochi.id, mochi.hasLanded);

      // Decrement settle timer (grace period for game over)
      if (mochi.settleTimer > 0) {
        mochi.settleTimer -= dt;
      }
    } else {
      // Update merge animation
      mochi.mergeTimer -= 0.08;
      if (mochi.mergeTimer < 0) mochi.mergeTimer = 0;
    }
  }

  // Check for merges (once per frame)
  const mergePairs: [Mochi, Mochi][] = [];
  for (let i = 0; i < mochis.length; i++) {
    for (let j = i + 1; j < mochis.length; j++) {
      const m1 = mochis[i];
      const m2 = mochis[j];
      if (canMerge(m1, m2)) {
        mergePairs.push([m1, m2]);
      }
    }
  }

  // Process merges (only first one per frame to avoid conflicts)
  if (mergePairs.length > 0) {
    const [m1, m2] = mergePairs[0];
    mergeMochis(m1, m2);
  }

  // Check game over
  if (checkGameOver()) {
    triggerGameOver();
  }
}

// Update animation states (runs on main thread regardless of worker)
function updateAnimations(dt: number): void {
  for (const mochi of mochis) {
    if (mochi.merging) continue;

    // Update emotion based on physics state (when using worker)
    mochi.emotionTimer -= dt;
    if (mochi.emotionTimer <= 0) {
      const speed = Math.sqrt(mochi.vx ** 2 + mochi.vy ** 2);
      let newEmotion = mochi.emotion;
      let newTimer = 30;

      if (mochi.jitterAmount > 2) {
        newEmotion = 'stressed';
        newTimer = 15;
      } else if (speed > 15) {
        newEmotion = 'flying';
        newTimer = 15;
      } else if (mochi.squishAmount > 0.5) {
        newEmotion = 'squished';
        newTimer = 20;
      } else if (speed < 0.5 && mochi.squishAmount < 0.15) {
        if (mochi.emotion !== 'happy' && mochi.emotion !== 'sleepy' && mochi.emotion !== 'yawning') {
          newEmotion = 'happy';
          newTimer = 120;
        } else {
          newTimer = 60;
        }
      } else if (mochi.squishAmount < 0.2 && speed < 4) {
        if (mochi.emotion !== 'happy' && mochi.emotion !== 'sleepy') {
          newEmotion = 'happy';
          newTimer = 45;
        }
      }

      if (newEmotion !== mochi.emotion) {
        mochi.emotion = newEmotion;
        mochi.emotionTimer = newTimer;
      } else if (mochi.emotionTimer <= 0) {
        mochi.emotionTimer = newTimer;
      }
    }

    // Decay impact velocity
    if (mochi.impactVelocity > 0) {
      mochi.impactVelocity *= 0.8;
      if (mochi.impactVelocity < 0.5) mochi.impactVelocity = 0;
    }

    // Update blink animation
    if (mochi.blinkState > 0) {
      mochi.blinkState -= dt * 0.15;
      if (mochi.blinkState <= 0) {
        mochi.blinkState = 0;
        mochi.blinkTimer = 90 + Math.random() * 180;
      }
    } else {
      mochi.blinkTimer -= dt;
      if (mochi.blinkTimer <= 0) {
        mochi.blinkState = 1;
      }
    }

    // Update look direction (glancing at nearby mochi)
    if (mochi.lookTimer > 0) {
      mochi.lookTimer -= dt;
      if (mochi.lookTimer <= 0) {
        mochi.lookDirection = 0;
        mochi.lookTimer = 0;
      }
    } else if (Math.random() < 0.003 * dt) {
      let nearestDist = Infinity;
      let nearestDir = 0;
      for (const other of mochis) {
        if (other === mochi || other.merging) continue;
        const dx = other.cx - mochi.cx;
        const dy = other.cy - mochi.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mochi.baseRadius * 4 && dist < nearestDist) {
          nearestDist = dist;
          nearestDir = dx > 0 ? 1 : -1;
        }
      }
      if (nearestDir !== 0) {
        mochi.lookDirection = nearestDir * (0.5 + Math.random() * 0.5);
        mochi.lookTimer = 30 + Math.random() * 60;
      }
    }

    // Update idle timer for yawning/sleepy
    const speed = Math.sqrt(mochi.vx * mochi.vx + mochi.vy * mochi.vy);
    if (speed < 0.5 && mochi.hasLanded) {
      mochi.idleTimer += dt;
      if (mochi.idleTimer > 600 && mochi.idleTimer < 660 && mochi.emotion !== 'yawning' && mochi.emotion !== 'sleepy') {
        mochi.emotion = 'yawning';
        mochi.emotionTimer = 60;
      }
      if (mochi.emotion === 'yawning' && mochi.emotionTimer <= 0) {
        mochi.emotion = 'sleepy';
        mochi.emotionTimer = 999;
      }
    } else {
      mochi.idleTimer = 0;
      if ((mochi.emotion === 'sleepy' || mochi.emotion === 'yawning') && speed > 2) {
        mochi.emotion = 'happy';
        mochi.emotionTimer = 30;
      }
    }
  }
}

function update(dt: number): void {
  if (gameState.gameOver) return;

  // Update drop cooldown
  if (dropCooldown > 0) {
    dropCooldown -= dt;
    if (dropCooldown <= 0) {
      gameState.canDrop = true;
    }
  }

  // Run physics (worker or main thread)
  if (useWorkerPhysics && physicsWorker) {
    postPhysicsToWorker(dt);
  } else {
    updatePhysicsMainThread(dt);
  }

  // Always update animations on main thread
  updateAnimations(dt);
}

function gameLoop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 16.667, 3);
  lastTime = timestamp;

  // Update easter egg timer
  if (gameState.easterEggTimer > 0) {
    gameState.easterEggTimer -= dt;
    if (gameState.easterEggTimer <= 0) {
      gameState.easterEggActive = null;
    }
  }

  // Check for idle - make mochi sleepy
  const idleTime = Date.now() - gameState.lastInteraction;
  if (idleTime > IDLE_TIMEOUT && !gameState.gameOver) {
    for (const mochi of mochis) {
      if (mochi.emotion !== 'sleepy') {
        mochi.emotion = 'sleepy';
        mochi.emotionTimer = 999; // Keep sleepy until interaction
      }
    }
  }

  // Animate button hover progress (smooth ease in/out)
  if (gameState.hoveredButton) {
    gameState.buttonHoverProgress = Math.min(1, gameState.buttonHoverProgress + dt * 0.15);
  } else {
    gameState.buttonHoverProgress = Math.max(0, gameState.buttonHoverProgress - dt * 0.15);
  }

  // Update share copied feedback timer
  if (gameState.shareCopiedTimer > 0) {
    gameState.shareCopiedTimer = Math.max(0, gameState.shareCopiedTimer - dt);
  }

  // Update info tooltip timer (for mobile)
  if (gameState.infoTooltipTimer > 0) {
    gameState.infoTooltipTimer = Math.max(0, gameState.infoTooltipTimer - dt);
  }

  // Animate modal entrance and score counter when game over
  if (gameState.gameOver) {
    // Modal entrance animation (0 to 1 over ~0.5 seconds)
    if (gameState.modalAnimationProgress < 1) {
      gameState.modalAnimationProgress = Math.min(1, gameState.modalAnimationProgress + dt * 0.04);
    }

    // Get target score (use daily score if viewing completed daily)
    const targetScore = (gameState.gameMode === 'daily' && gameState.dailyChallenge?.played)
      ? gameState.dailyChallenge.score
      : gameState.score;

    // Animate score counter (counts up with easing)
    if (gameState.displayedScore < targetScore) {
      const remaining = targetScore - gameState.displayedScore;
      const increment = Math.max(1, Math.ceil(remaining * 0.08 * dt));
      gameState.displayedScore = Math.min(targetScore, gameState.displayedScore + increment);
    }
  }

  // Performance profiling
  const frameStart = profilingEnabled ? performance.now() : 0;

  const updateStart = profilingEnabled ? performance.now() : 0;
  update(dt);
  if (profilingEnabled) perfMetrics.physicsTime = performance.now() - updateStart;

  const easterEggsStart = profilingEnabled ? performance.now() : 0;
  updateEasterEggs(dt);
  
  if (profilingEnabled) perfMetrics.easterEggsTime = performance.now() - easterEggsStart;

  // Check if cat just finished walking - reset mochi emotions
  const catWalking = isCatWalking();
  if (wasCatWalking && !catWalking) {
    for (const mochi of mochis) {
      if (mochi.emotion === 'surprised') {
        mochi.emotion = 'happy';
        mochi.emotionTimer = 60; // Brief happy moment before returning to normal
      }
    }
  }
  wasCatWalking = catWalking;

  const renderStart = profilingEnabled ? performance.now() : 0;
  render(context, mochis, gameState, getLeaderboard(), playerName);

  if (profilingEnabled) perfMetrics.renderTime = performance.now() - renderStart;

  // Draw profiling overlay
  if (profilingEnabled) {
    perfMetrics.frameTime = performance.now() - frameStart;
    perfMetrics.frameCount++;
    perfMetrics.frameTimes.push(perfMetrics.frameTime);
    if (perfMetrics.frameTimes.length > 60) perfMetrics.frameTimes.shift();

    // Update FPS every 500ms
    if (timestamp - perfMetrics.lastFpsUpdate > 500) {
      perfMetrics.fps = Math.round(1000 / (perfMetrics.frameTimes.reduce((a, b) => a + b, 0) / perfMetrics.frameTimes.length));
      perfMetrics.lastFpsUpdate = timestamp;
    }

    drawProfilingOverlay();
  }

  animationId = requestAnimationFrame(gameLoop);
}

// Draw performance profiling overlay
function drawProfilingOverlay(): void {
  const ctx = context.ctx;
  const x = context.width - 180;
  const y = 10;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(x - 10, y - 5, 180, 205);

  ctx.fillStyle = '#00ff00';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';

  const workerStatus = useWorkerPhysics ? 'Worker' : 'Main';
  const workerColor = useWorkerPhysics ? '#00ff00' : '#ffaa00';
  const quality = getQualityMode();
  const qualityColor = quality === 'high' ? '#00ff00' : '#ffaa00';
  const reason = getQualityReason();

  const lines = [
    `FPS: ${perfMetrics.fps}`,
    `Frame: ${perfMetrics.frameTime.toFixed(2)}ms`,
    `Physics: ${perfMetrics.physicsTime.toFixed(2)}ms`,
    `Effects: ${perfMetrics.easterEggsTime.toFixed(2)}ms`,
    `Render: ${perfMetrics.renderTime.toFixed(2)}ms`,
    `Mochis: ${mochis.length}`,
    `Physics: ${workerStatus}`,
    `Quality: ${quality}`,
    `Reason: ${reason}`,
    ``,
    `P/4-tap=close Q=quality`,
  ];

  lines.forEach((line, i) => {
    // Color code based on time spent or status
    if (line.includes('ms')) {
      const ms = parseFloat(line.split(':')[1]);
      if (ms > 10) ctx.fillStyle = '#ff4444';
      else if (ms > 5) ctx.fillStyle = '#ffaa00';
      else ctx.fillStyle = '#00ff00';
    } else if (line.startsWith('Physics:') && !line.includes('ms')) {
      ctx.fillStyle = workerColor;
    } else if (line.startsWith('Quality:')) {
      ctx.fillStyle = qualityColor;
    } else if (line.startsWith('Reason:')) {
      ctx.fillStyle = '#888888';
    } else {
      ctx.fillStyle = '#00ff00';
    }
    ctx.fillText(line, x, y + 15 + i * 14);
  });

  ctx.restore();
}

function handleResize(): void {
  resizeCanvas(context);
  if (gameState) {
    gameState.container = createContainer(context.width, context.height);
  }
}

function handleMouseMove(e: MouseEvent): void {
  const rect = context.canvas.getBoundingClientRect();
  gameState.dropX = e.clientX - rect.left;
  gameState.mouseX = e.clientX - rect.left;
  gameState.mouseY = e.clientY - rect.top;
  gameState.lastInteraction = Date.now();

  // Update button hover state when game over
  if (gameState.gameOver) {
    gameState.hoveredButton = getHoveredButton(gameState.mouseX, gameState.mouseY);
    // Change cursor to pointer when hovering a button
    context.canvas.style.cursor = gameState.hoveredButton ? 'pointer' : 'default';
  } else {
    gameState.hoveredButton = null;
    context.canvas.style.cursor = 'default';
  }
}

// Check which game over button is being hovered
function getHoveredButton(x: number, y: number): 'daily' | 'freeplay' | 'share' | null {
  const { container } = gameState;

  // Button area below container (must match renderer)
  const buttonAreaY = container.y + container.height + 40;
  const centerX = container.x + container.width / 2;
  const btnWidth = 120;
  const btnHeight = 38;
  const buttonSpacing = 130;

  const hasShareButton = gameState.gameMode === 'daily' && !!gameState.dailyChallenge;
  const dailyAlreadyPlayed = gameState.dailyChallenge?.played === true;

  if (hasShareButton) {
    if (dailyAlreadyPlayed) {
      // Daily complete: just two buttons centered (Share | Free Play)
      const shareX = centerX - buttonSpacing / 2;
      const freePlayX = centerX + buttonSpacing / 2;

      // Check Share button
      if (x >= shareX - btnWidth/2 && x <= shareX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'share';
      }

      // Check Free Play button
      if (x >= freePlayX - btnWidth/2 && x <= freePlayX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'freeplay';
      }
    } else {
      // Three buttons: Daily | Share | Free Play
      const dailyX = centerX - buttonSpacing;
      const shareX = centerX;
      const freePlayX = centerX + buttonSpacing;

      // Check Daily button
      if (x >= dailyX - btnWidth/2 && x <= dailyX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'daily';
      }

      // Check Share button
      if (x >= shareX - btnWidth/2 && x <= shareX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'share';
      }

      // Check Free Play button
      if (x >= freePlayX - btnWidth/2 && x <= freePlayX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'freeplay';
      }
    }
  } else {
    if (dailyAlreadyPlayed) {
      // Daily complete without share: just Free Play centered
      if (x >= centerX - btnWidth/2 && x <= centerX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'freeplay';
      }
    } else {
      // Two buttons: Daily | Free Play
      const dailyX = centerX - buttonSpacing / 2;
      const freePlayX = centerX + buttonSpacing / 2;

      // Check Daily button
      if (x >= dailyX - btnWidth/2 && x <= dailyX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'daily';
      }

      // Check Free Play button
      if (x >= freePlayX - btnWidth/2 && x <= freePlayX + btnWidth/2 &&
          y >= buttonAreaY - btnHeight/2 && y <= buttonAreaY + btnHeight/2) {
        return 'freeplay';
      }
    }
  }

  return null;
}

function handleKeyDown(e: KeyboardEvent): void {
  gameState.lastInteraction = Date.now();

  // Toggle performance profiling with 'P' key
  if (e.key === 'p' || e.key === 'P') {
    profilingEnabled = !profilingEnabled;
    return;
  }

  // Toggle quality mode with 'Q' key
  if (e.key === 'q' || e.key === 'Q') {
    const currentQuality = getQualityMode();
    setQualityMode(currentQuality === 'high' ? 'low' : 'high');
    return;
  }

  // Konami code detection
  if (e.code === KONAMI_CODE[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === KONAMI_CODE.length) {
      // Konami code complete!
      triggerKonamiEasterEgg();
      konamiIndex = 0;
    }
  } else {
    konamiIndex = e.code === KONAMI_CODE[0] ? 1 : 0;
  }

  // Secret word detection (only letters)
  if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
    typedChars += e.key.toLowerCase();
    // Keep only last 10 chars
    if (typedChars.length > 10) {
      typedChars = typedChars.slice(-10);
    }
    // Check for secret words
    if (typedChars.includes('mochi') || typedChars.includes('matcha')) {
      triggerCatEasterEgg();
      typedChars = '';
    }
  }
}

function triggerKonamiEasterEgg(): void {
  gameState.easterEggActive = 'konami';
  gameState.easterEggTimer = 300; // ~5 seconds
    addCherryBlossoms(context.width, context.height, 50);
  // Make all mochi show love
  for (const mochi of mochis) {
    mochi.emotion = 'love';
    mochi.emotionTimer = 300;
  }
}

function triggerCatEasterEgg(): void {
  triggerCatWalk(context.width, context.height);
  // Make mochi surprised then happy
  for (const mochi of mochis) {
    mochi.emotion = 'surprised';
    mochi.emotionTimer = 60;
  }
}

// Calculate toggle position (shared helper)
function getTogglePosition(): { toggleX: number; toggleY: number } {
  // Fixed width to match renderer (accommodates scores up to 99,999)
  const fixedScoreWidth = 140;
  const toggleX = 20 + fixedScoreWidth + 50;
  const toggleY = 28;
  return { toggleX, toggleY };
}

// Check if click is on mode toggle
function isToggleClick(clickX: number, clickY: number): boolean {
  const { toggleX, toggleY } = getTogglePosition();
  const halfWidth = MODE_TOGGLE_BOUNDS.width / 2;
  const halfHeight = MODE_TOGGLE_BOUNDS.height / 2;
  return clickX >= toggleX - halfWidth && clickX <= toggleX + halfWidth &&
         clickY >= toggleY - halfHeight && clickY <= toggleY + halfHeight;
}

// Check if click is on info icon (next to toggle)
function isInfoIconClick(clickX: number, clickY: number): boolean {
  const { toggleX, toggleY } = getTogglePosition();
  const infoX = toggleX + 48;
  const infoY = toggleY;
  const infoRadius = 20; // Generous click target
  const dx = clickX - infoX;
  const dy = clickY - infoY;
  return Math.sqrt(dx * dx + dy * dy) < infoRadius;
}

// Debounce for mode toggle to prevent double-triggering from touch + click
let lastToggleTime = 0;

// Handle mode toggle - switch between daily and free play (preserves state)
function handleModeToggle(): void {
  // Prevent rapid double-toggling (touch + click can both fire)
  const now = Date.now();
  if (now - lastToggleTime < 300) return;
  lastToggleTime = now;

  const currentMode = gameState.gameMode;
  const newMode: GameMode = currentMode === 'daily' ? 'practice' : 'daily';

  // Preserve global preferences across modes
  const nightMode = gameState.nightMode;
  const soundEnabled = gameState.soundEnabled;

  // Save current mode state
  if (currentMode === 'daily') {
    savedDailyState = { mochis, gameState, dropCooldown, seededRandom };
  } else {
    savedFreePlayState = { mochis, gameState, dropCooldown, seededRandom };
  }

  // Check for saved state in target mode
  const targetState = newMode === 'daily' ? savedDailyState : savedFreePlayState;

  if (targetState) {
    // Restore saved state
    mochis = targetState.mochis;
    gameState = targetState.gameState;
    dropCooldown = targetState.dropCooldown;
    seededRandom = targetState.seededRandom;

    // Sync landing states to prevent false dust poofs on restore
    previousLandingStates.clear();
    for (const m of mochis) {
      previousLandingStates.set(m.id, m.hasLanded);
    }

    // Update container in case of resize
    gameState.container = createContainer(context.width, context.height);

    // Carry over global preferences
    gameState.nightMode = nightMode;
    gameState.soundEnabled = soundEnabled;

    // Update leaderboard for this mode
    const todayDate = getTodayString();
    setLeaderboardMode(newMode, todayDate);
  } else {
    // No saved state - initialize fresh
    initGameState(newMode);
  }
}

function handleClick(e: MouseEvent): void {
  const rect = context.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  gameState.lastInteraction = Date.now();

  // Check for mode toggle click (top left area) - works even in game over
  if (isToggleClick(x, y)) {
    handleModeToggle();
    return;
  }

  // Check for info icon click (shows tooltip)
  if (isInfoIconClick(x, y)) {
    gameState.infoTooltipTimer = 180; // Show for ~3 seconds
    return;
  }

  // Check for speaker icon click (bottom right corner)
  const speakerX = context.width - 30;
  const speakerY = context.height - 30;
  const dxSpeaker = x - speakerX;
  const dySpeaker = y - speakerY;
  if (Math.sqrt(dxSpeaker * dxSpeaker + dySpeaker * dySpeaker) < 25) {
    gameState.soundEnabled = !gameState.soundEnabled;
    return;
  }

  // Check for moon click (top right area, lower on mobile for accessibility)
  const isMobile = context.width < 500 || context.height < 700;
  const moonX = context.width - 35;
  const moonY = isMobile ? 55 : 35;
  const dx = x - moonX;
  const dy = y - moonY;
  if (Math.sqrt(dx * dx + dy * dy) < 30) { // Larger tap target
    gameState.nightMode = !gameState.nightMode;
    if (gameState.nightMode) {
      // Make mochi sleepy in night mode
      for (const mochi of mochis) {
        mochi.emotion = 'sleepy';
        mochi.emotionTimer = 120;
      }
    } else {
      // Wake up! Happy mochi in day mode
      for (const mochi of mochis) {
        mochi.emotion = 'happy';
        mochi.emotionTimer = 90;
      }
    }
    return;
  }

  if (gameState.gameOver) {
    const { container } = gameState;
    const dailyAlreadyPlayed = gameState.dailyChallenge?.played === true;

    // Check if a button was clicked (use same logic as getHoveredButton)
    const hoveredBtn = getHoveredButton(x, y);

    if (hoveredBtn === 'daily') {
      initGameState('daily');
      return;
    }

    if (hoveredBtn === 'share' && gameState.dailyChallenge) {
      const shareText = generateShareText(gameState.dailyChallenge);
      copyToClipboard(shareText);
      gameState.shareCopiedTimer = 90; // ~1.5 seconds at 60fps
      return;
    }

    if (hoveredBtn === 'freeplay') {
      initGameState('practice');
      return;
    }

    // Click on the container overlay area -> restart game
    const isOnContainer = x >= container.x && x <= container.x + container.width &&
                          y >= container.y && y <= container.y + container.height;

    if (isOnContainer) {
      // If daily is complete, go to free play; otherwise restart current mode
      if (dailyAlreadyPlayed) {
        initGameState('practice');
      } else {
        initGameState(gameState.gameMode);
      }
      return;
    }

    return;
  }

  dropMochi(x);
}

function handleTouchStart(e: TouchEvent): void {
  // 4-finger tap toggles profiling overlay on mobile
  if (e.touches.length === 4) {
    e.preventDefault();
    profilingEnabled = !profilingEnabled;
    return;
  }
}

function handleTouchMove(e: TouchEvent): void {
  e.preventDefault();
  gameState.lastInteraction = Date.now();
  if (e.touches.length > 0) {
    const rect = context.canvas.getBoundingClientRect();
    gameState.dropX = e.touches[0].clientX - rect.left;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  e.preventDefault();
  gameState.lastInteraction = Date.now();

  // Get touch position from the last touch
  const rect = context.canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  const x = touch ? touch.clientX - rect.left : gameState.dropX;
  const y = touch ? touch.clientY - rect.top : 0;

  // Check for mode toggle tap (top left area) - works even in game over
  if (isToggleClick(x, y)) {
    handleModeToggle();
    return;
  }

  // Check for info icon tap (shows tooltip) - larger tap target for mobile
  {
    const { toggleX, toggleY } = getTogglePosition();
    const infoIconX = toggleX + 48;
    const infoIconY = toggleY;
    const dxInfo = x - infoIconX;
    const dyInfo = y - infoIconY;
    if (Math.sqrt(dxInfo * dxInfo + dyInfo * dyInfo) < 30) {
      gameState.infoTooltipTimer = 180;
      return;
    }
  }

  // Check for speaker icon tap (bottom right corner)
  const speakerX = context.width - 30;
  const speakerY = context.height - 30;
  const dxSpeaker = x - speakerX;
  const dySpeaker = y - speakerY;
  if (Math.sqrt(dxSpeaker * dxSpeaker + dySpeaker * dySpeaker) < 35) { // Larger tap target for mobile
    gameState.soundEnabled = !gameState.soundEnabled;
    return;
  }

  // Check for moon/sun tap (top right area)
  const isMobile = context.width < 500 || context.height < 700;
  const moonX = context.width - 35;
  const moonY = isMobile ? 55 : 35;
  const dxMoon = x - moonX;
  const dyMoon = y - moonY;
  if (Math.sqrt(dxMoon * dxMoon + dyMoon * dyMoon) < 40) { // Larger tap target for mobile
    gameState.nightMode = !gameState.nightMode;
    if (gameState.nightMode) {
      for (const mochi of mochis) {
        mochi.emotion = 'sleepy';
        mochi.emotionTimer = 120;
      }
    } else {
      for (const mochi of mochis) {
        mochi.emotion = 'happy';
        mochi.emotionTimer = 90;
      }
    }
    return;
  }

  if (gameState.gameOver) {
    const { container } = gameState;
    const dailyAlreadyPlayed = gameState.dailyChallenge?.played === true;

    // Check if a button was tapped (use same logic as getHoveredButton)
    const hoveredBtn = getHoveredButton(x, y);

    if (hoveredBtn === 'daily') {
      initGameState('daily');
      return;
    }

    if (hoveredBtn === 'share' && gameState.dailyChallenge) {
      const shareText = generateShareText(gameState.dailyChallenge);
      copyToClipboard(shareText);
      gameState.shareCopiedTimer = 90; // ~1.5 seconds at 60fps
      return;
    }

    if (hoveredBtn === 'freeplay') {
      initGameState('practice');
      return;
    }

    // Tap on the container overlay area -> restart game
    const isOnContainer = x >= container.x && x <= container.x + container.width &&
                          y >= container.y && y <= container.y + container.height;

    if (isOnContainer) {
      // If daily is complete, go to free play; otherwise restart current mode
      if (dailyAlreadyPlayed) {
        initGameState('practice');
      } else {
        initGameState(gameState.gameMode);
      }
      return;
    }

    return;
  }
  dropMochi(gameState.dropX);
}

export function init(canvas: HTMLCanvasElement): () => void {
  // Browser-only check
  if (typeof window === 'undefined') {
    return () => {};
  }

  context = createCanvasContext(canvas);
  resizeCanvas(context);

  // Initialize leaderboard and player
  playerName = getOrCreatePlayerName();
  initLeaderboard();

  // Detect device capabilities and set quality mode
  initQualityMode();

  // Initialize ambient effects (particles, fireflies, rain)
  initAmbientEffects(context.width, context.height);

  initGameState();

  // Initialize physics worker (for better mobile performance)
  initPhysicsWorker();

  // Event listeners
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

  // Start game loop
  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);

  // Cleanup
  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeyDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    // Terminate physics worker
    if (physicsWorker) {
      physicsWorker.terminate();
      physicsWorker = null;
      useWorkerPhysics = false;
    }
    mochis = [];
  };
}
