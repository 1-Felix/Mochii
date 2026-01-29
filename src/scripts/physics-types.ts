import type { Point, Spring, PhysicsConfig, Container, Mochi, MochiColor } from './types';

// Serialized mochi data for worker communication
// Contains only physics-relevant data, no animation/visual state
export interface SerializedMochi {
  id: number;
  tier: number;
  baseRadius: number;
  radius: number;
  points: Point[];
  springs: Spring[];
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  isDropping: boolean;
  hasLanded: boolean;
  merging: boolean;
  mergeTimer: number;
  settleTimer: number;
  squishAmount: number;
  wobblePhase: number;
  wobbleIntensity: number;
  breathPhase: number;
  lastY: number;
  jitterAmount: number;
  prevVx: number;
  prevVy: number;
}

// Messages from main thread to worker
export type WorkerInputMessage =
  | { type: 'init'; config: PhysicsConfig; container: Container }
  | { type: 'update'; mochis: SerializedMochi[]; container: Container; dt: number }
  | { type: 'add'; mochi: SerializedMochi }
  | { type: 'remove'; mochiId: number }
  | { type: 'setConfig'; config: PhysicsConfig };

// Messages from worker to main thread
export type WorkerOutputMessage =
  | { type: 'updated'; mochis: SerializedMochi[]; events: PhysicsEvent[] }
  | { type: 'ready' };

// Physics events that need main thread handling
export type PhysicsEvent =
  | { event: 'merge'; m1Id: number; m2Id: number; x: number; y: number; tier: number }
  | { event: 'landed'; mochiId: number; impactVelocity: number }
  | { event: 'floorImpact'; mochiId: number; impactVelocity: number }
  | { event: 'gameOver' };

// Convert full Mochi to serialized form for worker
export function serializeMochi(mochi: Mochi): SerializedMochi {
  return {
    id: mochi.id,
    tier: mochi.tier,
    baseRadius: mochi.baseRadius,
    radius: mochi.radius,
    points: mochi.points.map(p => ({ ...p })),
    springs: mochi.springs.map(s => ({ ...s })),
    cx: mochi.cx,
    cy: mochi.cy,
    vx: mochi.vx,
    vy: mochi.vy,
    isDropping: mochi.isDropping,
    hasLanded: mochi.hasLanded,
    merging: mochi.merging,
    mergeTimer: mochi.mergeTimer,
    settleTimer: mochi.settleTimer,
    squishAmount: mochi.squishAmount,
    wobblePhase: mochi.wobblePhase,
    wobbleIntensity: mochi.wobbleIntensity,
    breathPhase: mochi.breathPhase,
    lastY: mochi.lastY,
    jitterAmount: mochi.jitterAmount,
    prevVx: mochi.prevVx,
    prevVy: mochi.prevVy,
  };
}

// Apply worker physics update back to full Mochi
export function applyPhysicsToMochi(mochi: Mochi, serialized: SerializedMochi): void {
  // Update physics state
  mochi.points = serialized.points;
  mochi.cx = serialized.cx;
  mochi.cy = serialized.cy;
  mochi.vx = serialized.vx;
  mochi.vy = serialized.vy;
  mochi.radius = serialized.radius;
  mochi.isDropping = serialized.isDropping;
  mochi.hasLanded = serialized.hasLanded;
  mochi.merging = serialized.merging;
  mochi.mergeTimer = serialized.mergeTimer;
  mochi.settleTimer = serialized.settleTimer;
  mochi.squishAmount = serialized.squishAmount;
  mochi.wobblePhase = serialized.wobblePhase;
  mochi.wobbleIntensity = serialized.wobbleIntensity;
  mochi.breathPhase = serialized.breathPhase;
  mochi.lastY = serialized.lastY;
  mochi.jitterAmount = serialized.jitterAmount;
  mochi.prevVx = serialized.prevVx;
  mochi.prevVy = serialized.prevVy;
}

// Create a full Mochi from serialized data (for new mochis from merges)
export function deserializeMochi(serialized: SerializedMochi, color: MochiColor): Mochi {
  return {
    ...serialized,
    color,
    grabbed: false,
    emotion: 'happy',
    emotionTimer: 0,
    impactVelocity: 0,
    blinkTimer: 60 + Math.random() * 180,
    blinkState: 0,
    lookDirection: 0,
    lookTimer: 0,
    idleTimer: 0,
  };
}
