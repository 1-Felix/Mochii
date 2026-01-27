import type { Mochi, CanvasContext, GameState, Container } from './types';
import { createMochi, updateMochi, checkMochiCollision, canMerge, mochiTiers, defaultConfig, getRandomDroppableTier } from './physics';
import { createCanvasContext, resizeCanvas, render, addMergeEffect, addImpactStars, addCherryBlossoms, triggerCatWalk, updateEasterEggs, isCatWalking } from './renderer';
import { initLeaderboard, getLeaderboard, getOrCreatePlayerName, submitScore } from './leaderboard';

let context: CanvasContext;
let mochis: Mochi[] = [];
let gameState: GameState;
let animationId: number;
let lastTime = 0;
let dropCooldown = 0;
let playerName: string;


// Easter egg tracking
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let konamiIndex = 0;
let typedChars = '';
const IDLE_TIMEOUT = 30000; // 30 seconds
let wasCatWalking = false; // Track cat state for emotion reset

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

function initGameState(): void {
  const container = createContainer(context.width, context.height);
  gameState = {
    score: 0,
    highScore: parseInt(localStorage.getItem('mochiHighScore') || '0'),
    gameOver: false,
    currentMochi: null,
    nextTier: getRandomDroppableTier(),
    dropX: container.x + container.width / 2,
    canDrop: true,
    container,
    mouseX: 0,
    mouseY: 0,
    // Easter eggs
    nightMode: false,
    lastInteraction: Date.now(),
    easterEggActive: null,
    easterEggTimer: 0,
  };
  mochis = [];
  dropCooldown = 0;
  konamiIndex = 0;
  typedChars = '';
}

const DROP_COOLDOWN = 45; // Frames to wait between drops (~0.75 seconds)

function dropMochi(x: number): void {
  if (!gameState.canDrop || gameState.gameOver || dropCooldown > 0) return;

  const container = gameState.container;
  const tier = gameState.nextTier;
  const tierData = mochiTiers[tier];

  // Clamp X within container
  const minX = container.x + container.wallThickness + tierData.radius;
  const maxX = container.x + container.width - container.wallThickness - tierData.radius;
  const clampedX = Math.max(minX, Math.min(maxX, x));

  // Create and drop the mochi
  const mochi = createMochi(clampedX, container.overflowLine - 50, tier);
  mochi.isDropping = true;
  mochi.emotion = 'surprised';
  mochi.emotionTimer = 20;
  mochis.push(mochi);

  // Prepare next mochi
  gameState.nextTier = getRandomDroppableTier();
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

  // Update high score
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    localStorage.setItem('mochiHighScore', gameState.highScore.toString());
  }

  // Add merge effect
  addMergeEffect(mergeX, mergeY, mochiTiers[newTier].radius, mochiTiers[newTier].color.primary);

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

function update(dt: number): void {
  if (gameState.gameOver) return;

  const { container } = gameState;

  // Update drop cooldown
  if (dropCooldown > 0) {
    dropCooldown -= dt;
    if (dropCooldown <= 0) {
      gameState.canDrop = true;
    }
  }

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

  // Post-physics updates (once per frame, not per step)
  for (const mochi of mochis) {
    if (!mochi.merging) {
      // Decrement settle timer (grace period for game over)
      if (mochi.settleTimer > 0) {
        mochi.settleTimer -= dt;
      }

      // Spawn impact stars on floor hit
      if (mochi.impactVelocity > 5) {
        const impactY = container.y + container.height - container.wallThickness;
        addImpactStars(mochi.cx, impactY, mochi.impactVelocity, mochi.color.primary);
      }

      // Decay impact velocity
      if (mochi.impactVelocity > 0) {
        mochi.impactVelocity *= 0.8;
        if (mochi.impactVelocity < 0.5) mochi.impactVelocity = 0;
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
    gameState.gameOver = true;
    // Submit score to leaderboard
    if (gameState.score > 0) {
      submitScore(playerName, gameState.score);
    }
  }
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

  update(dt);
  updateEasterEggs(dt);

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

  render(context, mochis, gameState, getLeaderboard(), playerName);

  animationId = requestAnimationFrame(gameLoop);
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
}

function handleKeyDown(e: KeyboardEvent): void {
  gameState.lastInteraction = Date.now();

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

function handleClick(e: MouseEvent): void {
  const rect = context.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  gameState.lastInteraction = Date.now();

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
    // Restart game
    initGameState();
    return;
  }

  dropMochi(x);
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
  if (gameState.gameOver) {
    initGameState();
    return;
  }
  dropMochi(gameState.dropX);
}

export function init(canvas: HTMLCanvasElement): () => void {
  context = createCanvasContext(canvas);
  resizeCanvas(context);

  // Initialize leaderboard and player
  playerName = getOrCreatePlayerName();
  initLeaderboard();

  initGameState();

  // Event listeners
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('click', handleClick);
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
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    mochis = [];
  };
}
