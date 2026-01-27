import type {
  Mochi,
  Point,
  Spring,
  PhysicsConfig,
  MochiColor,
  MochiTier,
  Container,
} from "./types";

export const defaultConfig: PhysicsConfig = {
  springStiffness: 0.4, // Slightly softer for more squish
  damping: 0.9, // More damping to reduce jitter
  pressure: 1.3, // Slightly less pressure for more deformation
  gravity: 0.7, // Faster falling
  mouseForce: 0.5,
  mouseRadius: 120,
  wallBounce: 0.3, // Less bouncy
  friction: 0.88, // More friction
  squishRecovery: 0.045, // Moderate recovery
};

// 11 mochi tiers - real mochi flavors from light to dark
export const mochiTiers: MochiTier[] = [
  {
    // 0: Vanilla (plain white mochi)
    level: 0,
    name: "Vanilla",
    radius: 18,
    points: 1,
    color: {
      primary: "#F8F4EC",
      secondary: "#EBE5D8",
      highlight: "#FFFEFA",
      shadow: "rgba(120, 110, 90, 0.25)",
      cheek: "#EACFC0",
    },
  },
  {
    // 1: Sakura (cherry blossom)
    level: 1,
    name: "Sakura",
    radius: 24,
    points: 3,
    color: {
      primary: "#F8D7DD",
      secondary: "#F0C4CC",
      highlight: "#FFF0F3",
      shadow: "rgba(150, 100, 110, 0.25)",
      cheek: "#E8A0B0",
    },
  },
  {
    // 2: Yuzu (citrus)
    level: 2,
    name: "Yuzu",
    radius: 30,
    points: 6,
    color: {
      primary: "#F8E8A0",
      secondary: "#EED880",
      highlight: "#FFFBE8",
      shadow: "rgba(140, 120, 50, 0.25)",
      cheek: "#E0C060",
    },
  },
  {
    // 3: Strawberry
    level: 3,
    name: "Strawberry",
    radius: 38,
    points: 10,
    color: {
      primary: "#F4A0A8",
      secondary: "#E88890",
      highlight: "#FFD8DC",
      shadow: "rgba(160, 80, 90, 0.28)",
      cheek: "#E06878",
    },
  },
  {
    // 4: Mango
    level: 4,
    name: "Mango",
    radius: 46,
    points: 15,
    color: {
      primary: "#F8C878",
      secondary: "#F0B050",
      highlight: "#FFE8C0",
      shadow: "rgba(160, 110, 40, 0.28)",
      cheek: "#E89830",
    },
  },
  {
    // 5: Matcha (green tea)
    level: 5,
    name: "Matcha",
    radius: 54,
    points: 21,
    color: {
      primary: "#A8C890",
      secondary: "#90B078",
      highlight: "#D0E8C0",
      shadow: "rgba(80, 100, 60, 0.28)",
      cheek: "#78A058",
    },
  },
  {
    // 6: Taro (purple yam)
    level: 6,
    name: "Taro",
    radius: 62,
    points: 28,
    color: {
      primary: "#C8A8D0",
      secondary: "#B090C0",
      highlight: "#E8D8F0",
      shadow: "rgba(100, 70, 120, 0.28)",
      cheek: "#9870A8",
    },
  },
  {
    // 7: Hojicha (roasted tea)
    level: 7,
    name: "Hojicha",
    radius: 72,
    points: 36,
    color: {
      primary: "#C8A888",
      secondary: "#B89070",
      highlight: "#E8D8C8",
      shadow: "rgba(110, 80, 50, 0.3)",
      cheek: "#A07850",
    },
  },
  {
    // 8: Chocolate
    level: 8,
    name: "Chocolate",
    radius: 82,
    points: 45,
    color: {
      primary: "#8B6850",
      secondary: "#705038",
      highlight: "#B89880",
      shadow: "rgba(80, 50, 30, 0.3)",
      cheek: "#583820",
    },
  },
  {
    // 9: Black Sesame (goma)
    level: 9,
    name: "Black Sesame",
    radius: 94,
    points: 55,
    color: {
      primary: "#5A5550",
      secondary: "#484440",
      highlight: "#888480",
      shadow: "rgba(50, 45, 40, 0.3)",
      cheek: "#383430",
    },
  },
  {
    // 10: Kuromame (black bean) - largest!
    level: 10,
    name: "Kuromame",
    radius: 108,
    points: 66,
    color: {
      primary: "#3A3530",
      secondary: "#282420",
      highlight: "#585450",
      shadow: "rgba(30, 25, 20, 0.35)",
      cheek: "#181410",
    },
  },
];

// Only tiers 0-4 can be dropped (smallest 5)
export const DROPPABLE_TIERS = [0, 1, 2, 3, 4];

let mochiIdCounter = 0;

export function createMochi(x: number, y: number, tier: number): Mochi {
  const tierData = mochiTiers[tier];
  const radius = tierData.radius;

  // More points for larger mochi (smoother shape)
  const numPoints = Math.max(16, Math.min(32, Math.floor(12 + tier * 2)));
  const points: Point[] = [];
  const springs: Spring[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const ox = Math.cos(angle) * radius;
    const oy = Math.sin(angle) * radius;
    points.push({
      x: x + ox,
      y: y + oy,
      vx: 0,
      vy: 0,
      ox,
      oy,
    });
  }

  // Edge springs
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints;
    const dx = points[next].x - points[i].x;
    const dy = points[next].y - points[i].y;
    springs.push({
      p1: i,
      p2: next,
      restLength: Math.sqrt(dx * dx + dy * dy),
      stiffness: 0.5,
    });
  }

  // Skip springs
  for (let i = 0; i < numPoints; i++) {
    const skip = (i + 2) % numPoints;
    const dx = points[skip].x - points[i].x;
    const dy = points[skip].y - points[i].y;
    springs.push({
      p1: i,
      p2: skip,
      restLength: Math.sqrt(dx * dx + dy * dy),
      stiffness: 0.3,
    });
  }

  // Cross springs
  for (let i = 0; i < numPoints / 2; i++) {
    const opposite = (i + numPoints / 2) % numPoints;
    const dx = points[opposite].x - points[i].x;
    const dy = points[opposite].y - points[i].y;
    springs.push({
      p1: i,
      p2: Math.floor(opposite),
      restLength: Math.sqrt(dx * dx + dy * dy),
      stiffness: 0.15,
    });
  }

  return {
    id: mochiIdCounter++,
    tier,
    points,
    springs,
    cx: x,
    cy: y,
    vx: 0,
    vy: 0,
    radius,
    baseRadius: radius,
    color: tierData.color,
    grabbed: false,
    emotion: "happy",
    emotionTimer: 0,
    squishAmount: 0,
    impactVelocity: 0,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleIntensity: 0,
    breathPhase: Math.random() * Math.PI * 2,
    lastY: y,
    merging: false,
    mergeTimer: 0,
    isDropping: false,
    hasLanded: false,
    settleTimer: 0,
  };
}

function calculateCenter(points: Point[]): { x: number; y: number } {
  let x = 0,
    y = 0;
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
  let vx = 0,
    vy = 0;
  for (const p of points) {
    vx += p.vx;
    vy += p.vy;
  }
  return { vx: vx / points.length, vy: vy / points.length };
}

export function updateMochi(
  mochi: Mochi,
  config: PhysicsConfig,
  container: Container,
  dt: number = 1,
): void {
  if (mochi.merging) return; // Don't update merging mochi

  const { points, springs } = mochi;

  mochi.lastY = mochi.cy;

  let center = calculateCenter(points);
  const velocity = calculateVelocity(points);
  const speed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);

  // Calculate shape deformation (how far from a perfect circle)
  let deformation = 0;
  for (const p of points) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idealDist = mochi.baseRadius;
    deformation += Math.abs(dist - idealDist) / idealDist;
  }
  deformation /= points.length;

  // Update emotion
  mochi.emotionTimer -= dt;
  if (mochi.emotionTimer <= 0) {
    let newEmotion = mochi.emotion;
    if (speed > 10) {
      newEmotion = "flying";
    } else if (mochi.squishAmount > 0.4 || deformation > 0.2) {
      // Show squished face when noticeably compressed
      newEmotion = "squished";
    } else if (speed < 0.3 && mochi.squishAmount < 0.12 && deformation < 0.08) {
      newEmotion = Math.random() > 0.2 ? "happy" : "sleepy";
    } else if (mochi.squishAmount < 0.18 && speed < 3) {
      newEmotion = "happy";
    }
    if (newEmotion !== mochi.emotion) {
      mochi.emotion = newEmotion;
      mochi.emotionTimer = newEmotion === "squished" ? 25 : 15;
    }
  }

  // Breathing
  mochi.breathPhase += 0.02 * dt;
  const breathScale = 1 + Math.sin(mochi.breathPhase) * 0.012;

  // Wobble decay (frame-rate independent)
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

  // Spring forces (scaled by dt for frame-rate independence)
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

  // Base pressure (normal squishiness)
  let pressureForce = areaDiff * config.pressure;

  // Hard core: smaller mochi have stronger cores (they're at the bottom under more weight)
  // Tier 0-1: threshold 75%, multiplier 15
  // Tier 2-3: threshold 68%, multiplier 12
  // Tier 4+:  threshold 60%, multiplier 8
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

  // Update positions (damping is frame-rate independent)
  const velocityDamping = Math.pow(config.damping, dt);
  for (const p of points) {
    p.vx *= velocityDamping;
    p.vy *= velocityDamping;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // Strong angular damping - always apply to reduce rotation
  const avgSpeed = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2);
  center = calculateCenter(points);

  // Calculate angular velocity
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

  // Apply stronger damping when rotating or at rest (frame-rate independent)
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
        // Remove rotational component
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
      // Only bounce if moving into the floor with enough velocity
      if (p.vy > 0.5) {
        const bounceStrength = config.wallBounce + Math.min(0.2, impact * 0.015);
        p.vy *= -bounceStrength;
        p.vx *= config.friction;
        if (impact > maxFloorImpact) maxFloorImpact = impact;
        if (impact > 2) hadFloorImpact = true;
      } else {
        // Very slow or moving up - just stop vertical movement
        p.vy = 0;
      }

      // Mark as landed
      if (!mochi.hasLanded && mochi.isDropping) {
        mochi.hasLanded = true;
        mochi.isDropping = false;
        mochi.settleTimer = 60; // Grace period before game over check
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
    mochi.impactVelocity = maxFloorImpact;
    const squashAmount = Math.min(0.7, maxFloorImpact * 0.06);
    mochi.squishAmount = Math.max(mochi.squishAmount, squashAmount);
    mochi.wobbleIntensity = Math.min(2.5, mochi.wobbleIntensity + maxFloorImpact * 0.15);
    if (maxFloorImpact > 4) {
      mochi.emotion = "squished";
      mochi.emotionTimer = Math.min(35, maxFloorImpact * 3);
    }
  }

  // Update center
  const newCenter = calculateCenter(points);
  const newVel = calculateVelocity(points);
  mochi.cx = newCenter.x;
  mochi.cy = newCenter.y;
  mochi.vx = newVel.vx;
  mochi.vy = newVel.vy;
  mochi.radius = mochi.baseRadius * (1 - mochi.squishAmount * 0.15);
}

export function checkMochiCollision(m1: Mochi, m2: Mochi): boolean {
  if (m1.merging || m2.merging) return false;

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = m1.baseRadius + m2.baseRadius;

  if (dist < minDist && dist > 0.1) {
    // Mark as landed if they collide with each other
    if (m1.isDropping && !m1.hasLanded) {
      m1.hasLanded = true;
      m1.isDropping = false;
      m1.settleTimer = 60;
    }
    if (m2.isDropping && !m2.hasLanded) {
      m2.hasLanded = true;
      m2.isDropping = false;
      m2.settleTimer = 60;
    }

    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;

    // Check if these can merge (same tier, not max tier)
    const canMergeNow = m1.tier === m2.tier && m1.tier < mochiTiers.length - 1;

    // If same tier, allow them to overlap for merging
    if (canMergeNow) {
      const collisionStrength = Math.min(1, overlap / 10);
      m1.squishAmount = Math.max(m1.squishAmount, collisionStrength * 0.5);
      m2.squishAmount = Math.max(m2.squishAmount, collisionStrength * 0.5);
      return true;
    }

    // Calculate collision strength based on overlap
    const collisionStrength = Math.min(1, overlap / 10);

    // Set squish amount - only when really compressed
    m1.squishAmount = Math.max(m1.squishAmount, collisionStrength * 0.4);
    m2.squishAmount = Math.max(m2.squishAmount, collisionStrength * 0.4);

    // Point-to-point collision - use actual radius so they touch visually
    const collisionRadius1 = m1.baseRadius * 0.92;
    const collisionRadius2 = m2.baseRadius * 0.92;

    for (const p of m1.points) {
      const pDx = p.x - m2.cx;
      const pDy = p.y - m2.cy;
      const pDist = Math.sqrt(pDx * pDx + pDy * pDy);

      if (pDist < collisionRadius2) {
        // This point is inside or near the other mochi - push it out
        const pOverlap = collisionRadius2 - pDist;
        const pNx = pDist > 0.1 ? pDx / pDist : nx;
        const pNy = pDist > 0.1 ? pDy / pDist : ny;

        // Stronger push to prevent overlap
        const pushStrength = pOverlap * 0.45;
        p.x += pNx * pushStrength;
        p.y += pNy * pushStrength;
        p.vx += pNx * pushStrength * 0.3;
        p.vy += pNy * pushStrength * 0.3;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }

    for (const p of m2.points) {
      const pDx = p.x - m1.cx;
      const pDy = p.y - m1.cy;
      const pDist = Math.sqrt(pDx * pDx + pDy * pDy);

      if (pDist < collisionRadius1) {
        const pOverlap = collisionRadius1 - pDist;
        const pNx = pDist > 0.1 ? pDx / pDist : -nx;
        const pNy = pDist > 0.1 ? pDy / pDist : -ny;

        const pushStrength = pOverlap * 0.45;
        p.x += pNx * pushStrength;
        p.y += pNy * pushStrength;
        p.vx += pNx * pushStrength * 0.3;
        p.vy += pNy * pushStrength * 0.3;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }

    // Center separation when overlapping
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

export function canMerge(m1: Mochi, m2: Mochi): boolean {
  if (m1.merging || m2.merging) return false;
  if (m1.tier !== m2.tier) return false;
  if (m1.tier >= mochiTiers.length - 1) return false; // Can't merge watermelons

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = (m1.baseRadius + m2.baseRadius) * 0.85;

  return dist < minDist;
}

export function getRandomDroppableTier(): number {
  return DROPPABLE_TIERS[Math.floor(Math.random() * DROPPABLE_TIERS.length)];
}
