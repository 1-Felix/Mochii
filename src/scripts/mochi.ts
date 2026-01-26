import type { Mochi, CanvasContext, GameState, Container } from './types';
import { createMochi, updateMochi, checkMochiCollision, canMerge, mochiTiers, defaultConfig, getRandomDroppableTier } from './physics';
import { createCanvasContext, resizeCanvas, render, addMergeEffect, addImpactStars } from './renderer';
import { initLeaderboard, getLeaderboard, getOrCreatePlayerName, submitScore } from './leaderboard';

let context: CanvasContext;
let mochis: Mochi[] = [];
let gameState: GameState;
let animationId: number;
let lastTime = 0;
let dropCooldown = 0;
let playerName: string;

// Fixed container size to prevent cheating
const CONTAINER_WIDTH = 320;
const CONTAINER_HEIGHT = 450;

function createContainer(width: number, height: number): Container {
  // Container is fixed size, just centered on screen
  const x = (width - CONTAINER_WIDTH) / 2;
  const y = (height - CONTAINER_HEIGHT) / 2 + 20; // Slightly lower for UI space

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
  };
  mochis = [];
  dropCooldown = 0;
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

  // Update all mochis
  for (const mochi of mochis) {
    if (!mochi.merging) {
      const prevImpact = mochi.impactVelocity;
      updateMochi(mochi, defaultConfig, container, dt);

      // Decrement settle timer (grace period for game over)
      if (mochi.settleTimer > 0) {
        mochi.settleTimer -= dt;
      }

      // Spawn impact stars on floor hit
      if (mochi.impactVelocity > prevImpact && mochi.impactVelocity > 5) {
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

  // Check collisions and merges
  const mergePairs: [Mochi, Mochi][] = [];

  for (let i = 0; i < mochis.length; i++) {
    for (let j = i + 1; j < mochis.length; j++) {
      const m1 = mochis[i];
      const m2 = mochis[j];

      // checkMochiCollision handles physics and returns true if same tier (can merge)
      const couldMerge = checkMochiCollision(m1, m2);

      // Check for merge using the dedicated function (checks distance threshold)
      if (couldMerge && canMerge(m1, m2)) {
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

  update(dt);
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
}

function handleClick(e: MouseEvent): void {
  const rect = context.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;

  if (gameState.gameOver) {
    // Restart game
    initGameState();
    return;
  }

  dropMochi(x);
}

function handleTouchMove(e: TouchEvent): void {
  e.preventDefault();
  if (e.touches.length > 0) {
    const rect = context.canvas.getBoundingClientRect();
    gameState.dropX = e.touches[0].clientX - rect.left;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  e.preventDefault();
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
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    mochis = [];
  };
}
