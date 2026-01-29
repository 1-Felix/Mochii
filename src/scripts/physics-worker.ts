// Physics Web Worker
// Runs physics simulation off the main thread for better mobile performance

import type { Point, Spring, PhysicsConfig, Container } from './types';
import type { SerializedMochi, WorkerInputMessage, WorkerOutputMessage, PhysicsEvent } from './physics-types';

// Local state
let config: PhysicsConfig = {
  springStiffness: 0.4,
  damping: 0.9,
  pressure: 1.3,
  gravity: 0.6,
  mouseForce: 0.5,
  mouseRadius: 120,
  wallBounce: 0.3,
  friction: 0.88,
  squishRecovery: 0.045,
};

// Mochi tier data (radius and level info needed for physics)
const mochiTierData = [
  { level: 0, radius: 18 },
  { level: 1, radius: 24 },
  { level: 2, radius: 30 },
  { level: 3, radius: 38 },
  { level: 4, radius: 46 },
  { level: 5, radius: 54 },
  { level: 6, radius: 62 },
  { level: 7, radius: 72 },
  { level: 8, radius: 82 },
  { level: 9, radius: 94 },
  { level: 10, radius: 108 },
];

// Helper functions
function calculateCenter(points: Point[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function calculateArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function calculateVelocity(points: Point[]): { vx: number; vy: number } {
  let vx = 0, vy = 0;
  for (const p of points) {
    vx += p.vx;
    vy += p.vy;
  }
  return { vx: vx / points.length, vy: vy / points.length };
}

// Update a single mochi's physics
function updateMochiPhysics(
  mochi: SerializedMochi,
  container: Container,
  dt: number,
  events: PhysicsEvent[]
): void {
  if (mochi.merging) return;

  const { points, springs } = mochi;

  mochi.lastY = mochi.cy;

  let center = calculateCenter(points);
  const velocity = calculateVelocity(points);
  const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);

  // Jitter detection
  if (speed > 1 && speed < 12) {
    const xReversed = (mochi.prevVx > 0.5 && velocity.vx < -0.5) || (mochi.prevVx < -0.5 && velocity.vx > 0.5);
    const yReversed = (mochi.prevVy > 0.5 && velocity.vy < -0.5) || (mochi.prevVy < -0.5 && velocity.vy > 0.5);

    if (xReversed || yReversed) {
      const reversalStrength = Math.abs(velocity.vx - mochi.prevVx) + Math.abs(velocity.vy - mochi.prevVy);
      mochi.jitterAmount += reversalStrength * 0.15 * dt;
    }
  }

  mochi.jitterAmount *= Math.pow(0.92, dt);
  if (mochi.jitterAmount < 0.1) mochi.jitterAmount = 0;

  mochi.prevVx = velocity.vx;
  mochi.prevVy = velocity.vy;

  // Breathing
  mochi.breathPhase += 0.02 * dt;
  const breathScale = 1 + Math.sin(mochi.breathPhase) * 0.012;

  // Wobble decay
  mochi.wobbleIntensity *= Math.pow(0.95, dt);

  // Gravity
  for (const p of points) {
    p.vy += config.gravity * dt;
  }

  // Idle animations
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const angle = (i / points.length) * Math.PI * 2;

    const breathForce = (breathScale - 1) * 0.4;
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      p.vx += (dx / dist) * breathForce * dt;
      p.vy += (dy / dist) * breathForce * dt;
    }

    if (mochi.wobbleIntensity > 0.01) {
      const wobble = Math.sin(angle * 3 + mochi.wobblePhase) * mochi.wobbleIntensity;
      if (dist > 0.1) {
        p.vx += (dx / dist) * wobble * 0.25 * dt;
        p.vy += (dy / dist) * wobble * 0.25 * dt;
      }
    }
  }
  mochi.wobblePhase += 0.12 * dt;

  // Spring forces
  for (let iter = 0; iter < 4; iter++) {
    for (const spring of springs) {
      const p1 = points[spring.p1];
      const p2 = points[spring.p2];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) continue;

      const diff = (dist - spring.restLength) / dist;
      const force = diff * spring.stiffness * config.springStiffness * dt;

      p1.vx += dx * force;
      p1.vy += dy * force;
      p2.vx -= dx * force;
      p2.vy -= dy * force;
    }
  }

  // Pressure with hard core
  center = calculateCenter(points);
  const targetArea = Math.PI * mochi.baseRadius * mochi.baseRadius;
  const currentArea = calculateArea(points);
  const areaDiff = (targetArea - currentArea) / targetArea;
  const compressionRatio = currentArea / targetArea;

  let pressureForce = areaDiff * config.pressure;

  const coreThreshold = mochi.tier <= 1 ? 0.75 : mochi.tier <= 3 ? 0.68 : 0.6;
  const coreStrength = mochi.tier <= 1 ? 15 : mochi.tier <= 3 ? 12 : 8;

  if (compressionRatio < coreThreshold) {
    const coreCompression = (coreThreshold - compressionRatio) / coreThreshold;
    pressureForce += coreCompression * coreCompression * config.pressure * coreStrength;
  }

  for (const p of points) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      p.vx += (dx / dist) * pressureForce * dt;
      p.vy += (dy / dist) * pressureForce * dt;
    }
  }

  // Squish recovery
  mochi.squishAmount = Math.max(0, mochi.squishAmount - config.squishRecovery * dt);

  // Update positions
  const velocityDamping = Math.pow(config.damping, dt);
  for (const p of points) {
    p.vx *= velocityDamping;
    p.vy *= velocityDamping;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // Angular damping
  const avgSpeed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
  center = calculateCenter(points);

  let angularVel = 0;
  for (const p of points) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      const tx = -dy / dist;
      const ty = dx / dist;
      angularVel += p.vx * tx + p.vy * ty;
    }
  }
  angularVel /= points.length;

  const rotationStrength = Math.abs(angularVel);
  const baseDamping = mochi.hasLanded ? 0.4 : rotationStrength > 0.5 ? 0.25 : 0.1;
  const angularDampingFactor = 1 - Math.pow(1 - baseDamping, dt);

  if (avgSpeed < 5 || rotationStrength > 0.3) {
    for (const p of points) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) {
        const tx = -dy / dist;
        const ty = dx / dist;
        const tangentVel = p.vx * tx + p.vy * ty;
        p.vx -= tx * tangentVel * angularDampingFactor;
        p.vy -= ty * tangentVel * angularDampingFactor;
      }
    }
  }

  // Container collisions
  const { x: cx, y: cy, width, height, wallThickness } = container;
  const left = cx + wallThickness;
  const right = cx + width - wallThickness;
  const bottom = cy + height - wallThickness;

  let hadFloorImpact = false;
  let maxFloorImpact = 0;

  for (const p of points) {
    // Floor
    if (p.y > bottom) {
      const impact = Math.abs(p.vy);
      p.y = bottom;
      if (p.vy > 0.5) {
        const bounceStrength = config.wallBounce + Math.min(0.2, impact * 0.015);
        p.vy *= -bounceStrength;
        p.vx *= config.friction;
        if (impact > maxFloorImpact) maxFloorImpact = impact;
        if (impact > 2) hadFloorImpact = true;
      } else {
        p.vy = 0;
      }

      // Mark as landed
      if (!mochi.hasLanded && mochi.isDropping) {
        mochi.hasLanded = true;
        mochi.isDropping = false;
        mochi.settleTimer = 60;
        events.push({ event: 'landed', mochiId: mochi.id, impactVelocity: impact });
      }
    }
    // Left wall
    if (p.x < left) {
      p.x = left;
      p.vx *= -config.wallBounce;
      mochi.wobbleIntensity = Math.min(1.5, mochi.wobbleIntensity + Math.abs(p.vx) * 0.1);
    }
    // Right wall
    if (p.x > right) {
      p.x = right;
      p.vx *= -config.wallBounce;
      mochi.wobbleIntensity = Math.min(1.5, mochi.wobbleIntensity + Math.abs(p.vx) * 0.1);
    }
  }

  // Floor impact effects
  if (hadFloorImpact && maxFloorImpact > 2) {
    const squashAmount = Math.min(0.7, maxFloorImpact * 0.06);
    mochi.squishAmount = Math.max(mochi.squishAmount, squashAmount);
    mochi.wobbleIntensity = Math.min(2.5, mochi.wobbleIntensity + maxFloorImpact * 0.15);
    if (maxFloorImpact > 5) {
      events.push({ event: 'floorImpact', mochiId: mochi.id, impactVelocity: maxFloorImpact });
    }
  }

  // Final constraints
  const minDimension = mochi.baseRadius * (mochi.tier <= 1 ? 1.0 : mochi.tier <= 3 ? 0.8 : 0.6);

  // Check HEIGHT
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const currentHeight = maxY - minY;

  if (currentHeight < minDimension) {
    const midY = (minY + maxY) / 2;
    const expansion = minDimension / 2;

    for (const p of points) {
      const distFromMid = p.y - midY;
      if (Math.abs(distFromMid) < 0.1) {
        const idx = points.indexOf(p);
        const angle = (idx / points.length) * Math.PI * 2;
        const targetOffsetY = Math.sin(angle) * expansion;
        p.y = midY + targetOffsetY;
      } else {
        const sign = distFromMid > 0 ? 1 : -1;
        const targetY = midY + sign * expansion;
        p.y = p.y + (targetY - p.y) * 0.5;
      }
      if ((p.y < midY && p.vy > 0) || (p.y > midY && p.vy < 0)) {
        p.vy *= 0.3;
      }
    }
  }

  // Check WIDTH
  let minX = Infinity, maxX = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  const currentWidth = maxX - minX;

  if (currentWidth < minDimension) {
    const midX = (minX + maxX) / 2;
    const expansion = minDimension / 2;

    for (const p of points) {
      const distFromMid = p.x - midX;
      if (Math.abs(distFromMid) < 0.1) {
        const idx = points.indexOf(p);
        const angle = (idx / points.length) * Math.PI * 2;
        const targetOffsetX = Math.cos(angle) * expansion;
        p.x = midX + targetOffsetX;
      } else {
        const sign = distFromMid > 0 ? 1 : -1;
        const targetX = midX + sign * expansion;
        p.x = p.x + (targetX - p.x) * 0.5;
      }
      if ((p.x < midX && p.vx > 0) || (p.x > midX && p.vx < 0)) {
        p.vx *= 0.3;
      }
    }
  }

  // Per-point radius constraints
  const finalCenter = calculateCenter(points);
  const minPointRadius = mochi.baseRadius * (mochi.tier <= 1 ? 0.7 : mochi.tier <= 3 ? 0.4 : 0.3);
  const maxPointRadius = mochi.baseRadius * (mochi.tier <= 1 ? 1.08 : mochi.tier <= 3 ? 1.3 : 1.4);

  for (const p of points) {
    const dx = p.x - finalCenter.x;
    const dy = p.y - finalCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minPointRadius) {
      if (dist > 0.1) {
        const nx = dx / dist;
        const ny = dy / dist;
        p.x = finalCenter.x + nx * minPointRadius;
        p.y = finalCenter.y + ny * minPointRadius;
        const radialVel = p.vx * nx + p.vy * ny;
        if (radialVel < 0) {
          p.vx -= nx * radialVel;
          p.vy -= ny * radialVel;
        }
      } else {
        const angle = (points.indexOf(p) / points.length) * Math.PI * 2;
        p.x = finalCenter.x + Math.cos(angle) * minPointRadius;
        p.y = finalCenter.y + Math.sin(angle) * minPointRadius;
        p.vx = 0;
        p.vy = 0;
      }
    } else if (dist > maxPointRadius) {
      const nx = dx / dist;
      const ny = dy / dist;
      p.x = finalCenter.x + nx * maxPointRadius;
      p.y = finalCenter.y + ny * maxPointRadius;
      const radialVel = p.vx * nx + p.vy * ny;
      if (radialVel > 0) {
        p.vx -= nx * radialVel * 0.8;
        p.vy -= ny * radialVel * 0.8;
      }
    }
  }

  // Update center
  const newCenter = calculateCenter(points);
  const newVel = calculateVelocity(points);
  mochi.cx = newCenter.x;
  mochi.cy = newCenter.y;
  mochi.vx = newVel.vx;
  mochi.vy = newVel.vy;

  // Cap squishAmount
  const maxSquish = mochi.tier <= 1 ? 0.4 : mochi.tier <= 3 ? 0.5 : 0.6;
  mochi.squishAmount = Math.min(mochi.squishAmount, maxSquish);

  // Ensure radius
  const minRadiusRatio = mochi.tier <= 1 ? 0.6 : 0.5;
  mochi.radius = Math.max(
    mochi.baseRadius * minRadiusRatio,
    mochi.baseRadius * (1 - mochi.squishAmount * 0.15)
  );
}

// Check collision between two mochis
function checkMochiCollision(m1: SerializedMochi, m2: SerializedMochi, events: PhysicsEvent[]): boolean {
  if (m1.merging || m2.merging) return false;

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = m1.baseRadius + m2.baseRadius;

  // Point penetration checks
  if (dist < minDist * 1.3 && dist > 0.1) {
    const penetrationThreshold = 2;
    const nx = dx / dist;
    const ny = dy / dist;

    let m2ExtentTowardM1 = 0;
    for (const p of m2.points) {
      const pdx = p.x - m2.cx;
      const pdy = p.y - m2.cy;
      const projection = -(pdx * nx + pdy * ny);
      if (projection > m2ExtentTowardM1) m2ExtentTowardM1 = projection;
    }

    let m1ExtentTowardM2 = 0;
    for (const p of m1.points) {
      const pdx = p.x - m1.cx;
      const pdy = p.y - m1.cy;
      const projection = pdx * nx + pdy * ny;
      if (projection > m1ExtentTowardM2) m1ExtentTowardM2 = projection;
    }

    for (const p of m1.points) {
      const pdx = p.x - m2.cx;
      const pdy = p.y - m2.cy;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
      const boundary = m2ExtentTowardM1 * 0.92;

      if (pDist < boundary && pDist > 0.1) {
        const penetration = boundary - pDist;
        if (penetration > penetrationThreshold) {
          const pnx = pdx / pDist;
          const pny = pdy / pDist;
          const targetDist = boundary + 1;
          const pushAmount = (targetDist - pDist) * 0.2;
          p.x += pnx * pushAmount;
          p.y += pny * pushAmount;
          p.vx *= 0.85;
          p.vy *= 0.85;
        }
      }
    }

    for (const p of m2.points) {
      const pdx = p.x - m1.cx;
      const pdy = p.y - m1.cy;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
      const boundary = m1ExtentTowardM2 * 0.92;

      if (pDist < boundary && pDist > 0.1) {
        const penetration = boundary - pDist;
        if (penetration > penetrationThreshold) {
          const pnx = pdx / pDist;
          const pny = pdy / pDist;
          const targetDist = boundary + 1;
          const pushAmount = (targetDist - pDist) * 0.2;
          p.x += pnx * pushAmount;
          p.y += pny * pushAmount;
          p.vx *= 0.85;
          p.vy *= 0.85;
        }
      }
    }
  }

  if (dist < minDist && dist > 0.1) {
    // Mark as landed if they collide
    if (m1.isDropping && !m1.hasLanded) {
      m1.hasLanded = true;
      m1.isDropping = false;
      m1.settleTimer = 60;
      events.push({ event: 'landed', mochiId: m1.id, impactVelocity: Math.sqrt(m1.vx ** 2 + m1.vy ** 2) });
    }
    if (m2.isDropping && !m2.hasLanded) {
      m2.hasLanded = true;
      m2.isDropping = false;
      m2.settleTimer = 60;
      events.push({ event: 'landed', mochiId: m2.id, impactVelocity: Math.sqrt(m2.vx ** 2 + m2.vy ** 2) });
    }

    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;

    const canMergeNow = m1.tier === m2.tier && m1.tier < mochiTierData.length - 1;

    if (canMergeNow) {
      const collisionStrength = Math.min(1, overlap / 10);
      m1.squishAmount = Math.max(m1.squishAmount, collisionStrength * 0.5);
      m2.squishAmount = Math.max(m2.squishAmount, collisionStrength * 0.5);
      return true;
    }

    const collisionStrength = Math.min(1, overlap / 10);
    m1.squishAmount = Math.max(m1.squishAmount, collisionStrength * 0.4);
    m2.squishAmount = Math.max(m2.squishAmount, collisionStrength * 0.4);

    if (overlap > minDist * 0.15) {
      const centerPush = (overlap - minDist * 0.15) * 0.2;
      const totalMass = m1.baseRadius + m2.baseRadius;
      const m1Ratio = m2.baseRadius / totalMass;
      const m2Ratio = m1.baseRadius / totalMass;

      for (const p of m1.points) {
        p.x -= nx * centerPush * m1Ratio;
        p.y -= ny * centerPush * m1Ratio;
      }
      for (const p of m2.points) {
        p.x += nx * centerPush * m2Ratio;
        p.y += ny * centerPush * m2Ratio;
      }
    }
  }

  return false;
}

// Check if two mochis can merge
function canMerge(m1: SerializedMochi, m2: SerializedMochi): boolean {
  if (m1.merging || m2.merging) return false;
  if (m1.tier !== m2.tier) return false;
  if (m1.tier >= mochiTierData.length - 1) return false;

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = (m1.baseRadius + m2.baseRadius) * 0.85;

  return dist < minDist;
}

// Check game over condition
function checkGameOver(mochis: SerializedMochi[], container: Container): boolean {
  for (const mochi of mochis) {
    if (mochi.merging || mochi.isDropping || !mochi.hasLanded) continue;
    if (mochi.settleTimer > 0) continue;

    const topY = mochi.cy - mochi.baseRadius;
    if (topY < container.overflowLine) {
      const speed = Math.sqrt(mochi.vx ** 2 + mochi.vy ** 2);
      if (speed < 2) {
        return true;
      }
    }
  }
  return false;
}

// Main physics update function
function runPhysicsUpdate(mochis: SerializedMochi[], container: Container, dt: number): { mochis: SerializedMochi[]; events: PhysicsEvent[] } {
  const events: PhysicsEvent[] = [];

  // Fixed timestep sub-stepping
  const PHYSICS_DT = 0.5;
  const numSteps = Math.ceil(dt / PHYSICS_DT);
  const stepDt = dt / numSteps;

  for (let step = 0; step < numSteps; step++) {
    // Update all mochis
    for (const mochi of mochis) {
      if (!mochi.merging) {
        updateMochiPhysics(mochi, container, stepDt, events);
      }
    }

    // Check collisions between mochis
    for (let i = 0; i < mochis.length; i++) {
      for (let j = i + 1; j < mochis.length; j++) {
        checkMochiCollision(mochis[i], mochis[j], events);
      }
    }
  }

  // Post-physics updates (once per frame)
  for (const mochi of mochis) {
    if (!mochi.merging) {
      // Decrement settle timer
      if (mochi.settleTimer > 0) {
        mochi.settleTimer -= dt;
      }
    } else {
      // Update merge animation
      mochi.mergeTimer -= 0.08;
      if (mochi.mergeTimer < 0) mochi.mergeTimer = 0;
    }
  }

  // Check for merges
  const mergePairs: [SerializedMochi, SerializedMochi][] = [];
  for (let i = 0; i < mochis.length; i++) {
    for (let j = i + 1; j < mochis.length; j++) {
      if (canMerge(mochis[i], mochis[j])) {
        mergePairs.push([mochis[i], mochis[j]]);
      }
    }
  }

  // Process first merge
  if (mergePairs.length > 0) {
    const [m1, m2] = mergePairs[0];
    const mergeX = (m1.cx + m2.cx) / 2;
    const mergeY = (m1.cy + m2.cy) / 2;
    const newTier = m1.tier + 1;

    // Mark as merging
    m1.merging = true;
    m2.merging = true;
    m1.mergeTimer = 1;
    m2.mergeTimer = 1;

    events.push({
      event: 'merge',
      m1Id: m1.id,
      m2Id: m2.id,
      x: mergeX,
      y: mergeY,
      tier: newTier,
    });
  }

  // Check game over
  if (checkGameOver(mochis, container)) {
    events.push({ event: 'gameOver' });
  }

  return { mochis, events };
}

// Worker message handler
self.onmessage = function(e: MessageEvent<WorkerInputMessage>) {
  const message = e.data;

  switch (message.type) {
    case 'init':
      config = message.config;
      self.postMessage({ type: 'ready' } satisfies WorkerOutputMessage);
      break;

    case 'setConfig':
      config = message.config;
      break;

    case 'update':
      const result = runPhysicsUpdate(message.mochis, message.container, message.dt);
      self.postMessage({
        type: 'updated',
        mochis: result.mochis,
        events: result.events,
      } satisfies WorkerOutputMessage);
      break;
  }
};
