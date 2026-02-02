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
  wallBounce: 0.2, // Low bounce - dough absorbs energy (spec: 0.1-0.3)
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

function calculateEdgeNormals(points: Point[]): { nx: number; ny: number }[] {
  const normals: { nx: number; ny: number }[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const edgeX = p2.x - p1.x;
    const edgeY = p2.y - p1.y;
    const edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);

    if (edgeLen > 0.01) {
      // Outward normal (perpendicular to edge, CW winding in screen coords)
      normals.push({ nx: edgeY / edgeLen, ny: -edgeX / edgeLen });
    } else {
      normals.push({ nx: 0, ny: 0 });
    }
  }
  return normals;
}

// Point-in-polygon test using ray casting
function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Find closest edge and its normal for collision resolution
function closestEdgeInfo(x: number, y: number, polygon: Point[]): {
  distance: number; nx: number; ny: number;
} {
  let minDist = Infinity;
  let closestNx = 0, closestNy = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const edgeX = p2.x - p1.x;
    const edgeY = p2.y - p1.y;
    const edgeLenSq = edgeX * edgeX + edgeY * edgeY;
    if (edgeLenSq < 0.01) continue;

    // Project point onto edge
    const t = Math.max(0, Math.min(1,
      ((x - p1.x) * edgeX + (y - p1.y) * edgeY) / edgeLenSq));

    const closestX = p1.x + t * edgeX;
    const closestY = p1.y + t * edgeY;
    const dist = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);

    if (dist < minDist) {
      minDist = dist;
      const edgeLen = Math.sqrt(edgeLenSq);
      // Outward normal (CW winding in screen coords)
      closestNx = edgeY / edgeLen;
      closestNy = -edgeX / edgeLen;
    }
  }
  return { distance: minDist, nx: closestNx, ny: closestNy };
}

// Check if two line segments intersect
function segmentsIntersect(
  a1x: number, a1y: number, a2x: number, a2y: number,
  b1x: number, b1y: number, b2x: number, b2y: number
): boolean {
  const d1x = a2x - a1x, d1y = a2y - a1y;
  const d2x = b2x - b1x, d2y = b2y - b1y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 0.0001) return false; // Parallel

  const dx = b1x - a1x, dy = b1y - a1y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
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

  // Spring forces with viscous damping
  const SPRING_DAMPING = 0.15; // Viscous damping coefficient
  for (let iter = 0; iter < 4; iter++) {
    for (const spring of springs) {
      const p1 = points[spring.p1];
      const p2 = points[spring.p2];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) continue;

      // Normalized spring direction
      const nx = dx / dist;
      const ny = dy / dist;

      // Position-based spring force
      const diff = (dist - spring.restLength) / dist;
      const force = diff * spring.stiffness * config.springStiffness * dt;

      // Viscous damping on relative velocity along spring axis
      const relVx = p2.vx - p1.vx;
      const relVy = p2.vy - p1.vy;
      const relVelAlongSpring = relVx * nx + relVy * ny;
      const dampingForce = relVelAlongSpring * SPRING_DAMPING * dt;

      // Apply combined forces
      p1.vx += dx * force + nx * dampingForce;
      p1.vy += dy * force + ny * dampingForce;
      p2.vx -= dx * force + nx * dampingForce;
      p2.vy -= dy * force + ny * dampingForce;
    }
  }

  // Pressure with hard core - applied to EDGE NORMALS (not radially)
  center = calculateCenter(points);
  const targetArea = Math.PI * mochi.baseRadius * mochi.baseRadius;
  const currentArea = calculateArea(points);
  const areaDiff = (targetArea - currentArea) / targetArea;
  const compressionRatio = currentArea / targetArea;

  // Only apply pressure when compressed below target area
  if (compressionRatio < 1.0) {
    // Base pressure (normal squishiness)
    let pressureForce = areaDiff * config.pressure;

    // Hard core: smaller mochi have stronger cores (they're at the bottom under more weight)
    // First three tiers (0-2) get extra resistance since they're always at the bottom
    const coreThreshold = mochi.tier <= 2 ? 0.82 : mochi.tier <= 4 ? 0.68 : 0.6;
    const coreStrength = mochi.tier <= 2 ? 22 : mochi.tier <= 4 ? 12 : 8;

    if (compressionRatio < coreThreshold) {
      const coreCompression = (coreThreshold - compressionRatio) / coreThreshold;
      pressureForce += coreCompression * coreCompression * config.pressure * coreStrength;
    }

    // Emergency damping below 50% compression (from spec)
    if (compressionRatio < 0.5) {
      for (const p of points) {
        p.vx *= 0.7;
        p.vy *= 0.7;
      }
    }

    // Apply pressure using hybrid approach: blend edge normal with radial direction
    // This prevents extreme elongation when compressed in corners
    const edgeNormals = calculateEdgeNormals(points);
    const n = points.length;
    const maxRadius = mochi.baseRadius * (mochi.tier <= 2 ? 1.05 : mochi.tier <= 4 ? 1.15 : 1.25);

    for (let i = 0; i < n; i++) {
      const p = points[i];

      // Calculate radial direction from center
      const rdx = p.x - center.x;
      const rdy = p.y - center.y;
      const rDist = Math.sqrt(rdx * rdx + rdy * rdy);

      // Skip if already at or beyond max radius
      if (rDist >= maxRadius) continue;

      let radialNx = 0, radialNy = 0;
      if (rDist > 0.1) {
        radialNx = rdx / rDist;
        radialNy = rdy / rDist;
      }

      // Get edge normal
      const prevNormal = edgeNormals[(i - 1 + n) % n];
      const currNormal = edgeNormals[i];
      let edgeNx = (prevNormal.nx + currNormal.nx) / 2;
      let edgeNy = (prevNormal.ny + currNormal.ny) / 2;
      const edgeLen = Math.sqrt(edgeNx * edgeNx + edgeNy * edgeNy);
      if (edgeLen > 0.01) {
        edgeNx /= edgeLen;
        edgeNy /= edgeLen;
      }

      // Blend: 60% radial, 40% edge normal (prevents elongation while allowing deformation)
      const blendNx = radialNx * 0.6 + edgeNx * 0.4;
      const blendNy = radialNy * 0.6 + edgeNy * 0.4;
      const blendLen = Math.sqrt(blendNx * blendNx + blendNy * blendNy);

      if (blendLen > 0.01) {
        const finalNx = blendNx / blendLen;
        const finalNy = blendNy / blendLen;
        p.vx += finalNx * pressureForce * dt;
        p.vy += finalNy * pressureForce * dt;
      }
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

  // Velocity clamping - prevent physics explosions
  const MAX_VELOCITY = 25;
  for (const p of points) {
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > MAX_VELOCITY) {
      const scale = MAX_VELOCITY / speed;
      p.vx *= scale;
      p.vy *= scale;
    }
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

  // Stiction friction constants
  const STICTION_THRESHOLD = 2.0; // Velocity below which stiction kicks in
  const DYNAMIC_FRICTION = 0.88;
  const MAX_STICTION = 0.98; // Nearly complete stop at rest

  for (const p of points) {
    // Floor
    if (p.y > bottom) {
      const impact = Math.abs(p.vy);
      p.y = bottom;

      // Calculate velocity-dependent friction (stiction)
      const horizontalSpeed = Math.abs(p.vx);
      let friction: number;
      if (horizontalSpeed < STICTION_THRESHOLD) {
        // Interpolate from high stiction to dynamic friction
        const t = horizontalSpeed / STICTION_THRESHOLD;
        friction = MAX_STICTION - (MAX_STICTION - DYNAMIC_FRICTION) * t;
      } else {
        friction = DYNAMIC_FRICTION;
      }

      // Bounce if moving into the floor with enough velocity
      if (p.vy > 0.5) {
        const bounceStrength = config.wallBounce + Math.min(0.2, impact * 0.015);
        p.vy *= -bounceStrength;
        p.vx *= friction;
        if (impact > maxFloorImpact) maxFloorImpact = impact;
        if (impact > 2) hadFloorImpact = true;
      } else {
        // Very slow or moving up - stop vertical and apply stiction
        p.vy = 0;
        p.vx *= friction; // Apply stiction even when not bouncing
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
  // Use smaller values to avoid forcing rectangular shapes - rely on minPointRadius for roundness
  const minDimension = mochi.baseRadius * (mochi.tier <= 2 ? 0.9 : mochi.tier <= 4 ? 0.7 : 0.5);

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

  // Per-point radius constraints - tighter to prevent bell-curve shape
  const finalCenter = calculateCenter(points);
  // First three tiers get much tighter constraints to stay more round
  const minPointRadius = mochi.baseRadius * (mochi.tier <= 2 ? 0.85 : mochi.tier <= 4 ? 0.65 : 0.55);
  const maxPointRadius = mochi.baseRadius * (mochi.tier <= 2 ? 1.05 : mochi.tier <= 4 ? 1.15 : 1.25);

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

  // Cap squishAmount - first three tiers should squish less visually
  const maxSquish = mochi.tier <= 2 ? 0.3 : mochi.tier <= 4 ? 0.5 : 0.6;
  mochi.squishAmount = Math.min(mochi.squishAmount, maxSquish);

  // Ensure radius
  const minRadiusRatio = mochi.tier <= 2 ? 0.7 : 0.5;
  mochi.radius = Math.max(
    mochi.baseRadius * minRadiusRatio,
    mochi.baseRadius * (1 - mochi.squishAmount * 0.15)
  );

  // Settling system: zero velocities when at rest to prevent micro-jitter
  const SLEEP_VELOCITY_THRESHOLD = 0.3;
  let totalVelocity = 0;
  for (const p of points) {
    totalVelocity += Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  }
  const avgVelocity = totalVelocity / points.length;

  if (mochi.hasLanded && mochi.settleTimer <= 0 && avgVelocity < SLEEP_VELOCITY_THRESHOLD) {
    for (const p of points) {
      p.vx = 0;
      p.vy = 0;
    }
  }
}

// Check collision between two mochis
function checkMochiCollision(m1: SerializedMochi, m2: SerializedMochi, events: PhysicsEvent[]): boolean {
  if (m1.merging || m2.merging) return false;

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = m1.baseRadius + m2.baseRadius;

  // Polygon-based collision: detect vertex penetration and push along edge normals
  if (dist < minDist * 1.3 && dist > 0.1) {
    // Check m1's points against m2's polygon boundary
    for (const p of m1.points) {
      const edge = closestEdgeInfo(p.x, p.y, m2.points);
      const isInside = pointInPolygon(p.x, p.y, m2.points);

      // Push out if inside, or if very close to the edge (proximity threshold)
      const proximityThreshold = 0.5;
      if (isInside || edge.distance < proximityThreshold) {
        const penetrationDepth = isInside ? edge.distance + proximityThreshold : proximityThreshold - edge.distance;
        // Stronger push - fully resolve penetration
        const pushAmount = penetrationDepth * 0.6;
        p.x += edge.nx * pushAmount;
        p.y += edge.ny * pushAmount;

        // Damp velocity moving into the surface
        const velIntoSurface = p.vx * (-edge.nx) + p.vy * (-edge.ny);
        if (velIntoSurface > 0) {
          p.vx += edge.nx * velIntoSurface * 0.7;
          p.vy += edge.ny * velIntoSurface * 0.7;
        }
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }

    // Check m2's points against m1's polygon boundary
    for (const p of m2.points) {
      const edge = closestEdgeInfo(p.x, p.y, m1.points);
      const isInside = pointInPolygon(p.x, p.y, m1.points);

      // Push out if inside, or if very close to the edge (proximity threshold)
      const proximityThreshold = 0.5;
      if (isInside || edge.distance < proximityThreshold) {
        const penetrationDepth = isInside ? edge.distance + proximityThreshold : proximityThreshold - edge.distance;
        // Stronger push - fully resolve penetration
        const pushAmount = penetrationDepth * 0.6;
        p.x += edge.nx * pushAmount;
        p.y += edge.ny * pushAmount;

        // Damp velocity moving into the surface
        const velIntoSurface = p.vx * (-edge.nx) + p.vy * (-edge.ny);
        if (velIntoSurface > 0) {
          p.vx += edge.nx * velIntoSurface * 0.7;
          p.vy += edge.ny * velIntoSurface * 0.7;
        }
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }

    // Edge-edge intersection: detect when edges cross without vertices being inside
    const n1 = m1.points.length;
    const n2 = m2.points.length;
    for (let i = 0; i < n1; i++) {
      const a1 = m1.points[i];
      const a2 = m1.points[(i + 1) % n1];
      for (let j = 0; j < n2; j++) {
        const b1 = m2.points[j];
        const b2 = m2.points[(j + 1) % n2];

        if (segmentsIntersect(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y)) {
          // Push the vertices of both edges apart along the separation direction
          const sepX = m2.cx - m1.cx;
          const sepY = m2.cy - m1.cy;
          const sepDist = Math.sqrt(sepX * sepX + sepY * sepY);
          if (sepDist > 0.1) {
            const nx = sepX / sepDist;
            const ny = sepY / sepDist;
            const push = 0.5;

            // Push m1's edge vertices away from m2
            a1.x -= nx * push; a1.y -= ny * push;
            a2.x -= nx * push; a2.y -= ny * push;
            a1.vx *= 0.9; a1.vy *= 0.9;
            a2.vx *= 0.9; a2.vy *= 0.9;

            // Push m2's edge vertices away from m1
            b1.x += nx * push; b1.y += ny * push;
            b2.x += nx * push; b2.y += ny * push;
            b1.vx *= 0.9; b1.vy *= 0.9;
            b2.vx *= 0.9; b2.vy *= 0.9;
          }
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
  // Merge when mochi are just touching (95% of combined radii)
  const minDist = (m1.baseRadius + m2.baseRadius) * 0.95;

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
