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
  gravity: 0.6, // Slightly lighter feel
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
    // Animation states
    blinkTimer: 60 + Math.random() * 180, // Random initial blink time
    blinkState: 0,
    lookDirection: 0,
    lookTimer: 0,
    idleTimer: 0,
    // Jitter detection
    jitterAmount: 0,
    prevVx: 0,
    prevVy: 0,
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

  // Jitter detection - look for rapid velocity direction changes
  // Only check when moving at moderate speed (not stationary, not flying)
  if (speed > 1 && speed < 12) {
    // Check for velocity sign reversals (direction changes)
    const xReversed = (mochi.prevVx > 0.5 && velocity.vx < -0.5) || (mochi.prevVx < -0.5 && velocity.vx > 0.5);
    const yReversed = (mochi.prevVy > 0.5 && velocity.vy < -0.5) || (mochi.prevVy < -0.5 && velocity.vy > 0.5);

    if (xReversed || yReversed) {
      // Accumulate jitter - more jitter for faster reversals
      const reversalStrength = Math.abs(velocity.vx - mochi.prevVx) + Math.abs(velocity.vy - mochi.prevVy);
      mochi.jitterAmount += reversalStrength * 0.15 * dt;
    }
  }

  // Decay jitter over time
  mochi.jitterAmount *= Math.pow(0.92, dt);
  if (mochi.jitterAmount < 0.1) mochi.jitterAmount = 0;

  // Store current velocity for next frame's jitter detection
  mochi.prevVx = velocity.vx;
  mochi.prevVy = velocity.vy;

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
    let newTimer = 30; // Default timer

    if (mochi.jitterAmount > 2) {
      // Stressed face when jittering a lot
      newEmotion = "stressed";
      newTimer = 15;
    } else if (speed > 15) {
      // Only show flying face at very high speeds
      newEmotion = "flying";
      newTimer = 15;
    } else if (mochi.squishAmount > 0.5 || deformation > 0.25) {
      // Show squished face when heavily compressed
      newEmotion = "squished";
      newTimer = 20;
    } else if (speed < 0.5 && mochi.squishAmount < 0.15 && deformation < 0.1) {
      // Settled - stay happy or sleepy, don't randomly switch between them
      if (mochi.emotion !== "happy" && mochi.emotion !== "sleepy" && mochi.emotion !== "yawning") {
        newEmotion = "happy";
        newTimer = 120; // Long timer when settling into happy
      } else {
        // Keep current emotion, just refresh timer
        newTimer = 60;
      }
    } else if (mochi.squishAmount < 0.2 && speed < 4) {
      // Mild movement - return to happy
      if (mochi.emotion !== "happy" && mochi.emotion !== "sleepy") {
        newEmotion = "happy";
        newTimer = 45;
      }
    }

    if (newEmotion !== mochi.emotion) {
      mochi.emotion = newEmotion;
      mochi.emotionTimer = newTimer;
    } else if (mochi.emotionTimer <= 0) {
      // Same emotion, just refresh timer
      mochi.emotionTimer = newTimer;
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
    if (maxFloorImpact > 5) {
      mochi.emotion = "squished";
      mochi.emotionTimer = Math.min(20, maxFloorImpact * 2);
    }
  }

  // FINAL CONSTRAINTS - Applied after all physics to guarantee minimum size
  // These are absolute limits that cannot be violated

  // Minimum dimensions - prevents pancaking in any direction
  const minDimension = mochi.baseRadius * (mochi.tier <= 1 ? 1.0 : mochi.tier <= 3 ? 0.8 : 0.6);

  // Check HEIGHT (vertical span)
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

  // Check WIDTH (horizontal span)
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

  // Now enforce per-point minimum AND maximum radius from center
  const finalCenter = calculateCenter(points);
  // Vanilla & Sakura are very rigid - almost no deformation allowed
  const minPointRadius = mochi.baseRadius * (mochi.tier <= 1 ? 0.7 : mochi.tier <= 3 ? 0.4 : 0.3);
  // Maximum radius prevents bell-curve/elongation - Vanilla & Sakura stay nearly circular
  const maxPointRadius = mochi.baseRadius * (mochi.tier <= 1 ? 1.08 : mochi.tier <= 3 ? 1.3 : 1.4);

  for (const p of points) {
    const dx = p.x - finalCenter.x;
    const dy = p.y - finalCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minPointRadius) {
      if (dist > 0.1) {
        // Push point out to minimum radius
        const nx = dx / dist;
        const ny = dy / dist;
        p.x = finalCenter.x + nx * minPointRadius;
        p.y = finalCenter.y + ny * minPointRadius;
        // Kill inward velocity completely
        const radialVel = p.vx * nx + p.vy * ny;
        if (radialVel < 0) {
          p.vx -= nx * radialVel;
          p.vy -= ny * radialVel;
        }
      } else {
        // Point is at center - push it out in its original direction
        const angle = (points.indexOf(p) / points.length) * Math.PI * 2;
        p.x = finalCenter.x + Math.cos(angle) * minPointRadius;
        p.y = finalCenter.y + Math.sin(angle) * minPointRadius;
        p.vx = 0;
        p.vy = 0;
      }
    } else if (dist > maxPointRadius) {
      // Pull point back to maximum radius - prevents elongation
      const nx = dx / dist;
      const ny = dy / dist;
      p.x = finalCenter.x + nx * maxPointRadius;
      p.y = finalCenter.y + ny * maxPointRadius;
      // Kill outward velocity
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

  // Cap squishAmount to prevent visual issues (face/color disappearing)
  // Smaller mochi should squish less visually
  const maxSquish = mochi.tier <= 1 ? 0.4 : mochi.tier <= 3 ? 0.5 : 0.6;
  mochi.squishAmount = Math.min(mochi.squishAmount, maxSquish);

  // Ensure radius never goes below 50% of base (prevents face from being too small)
  const minRadiusRatio = mochi.tier <= 1 ? 0.6 : 0.5;
  mochi.radius = Math.max(
    mochi.baseRadius * minRadiusRatio,
    mochi.baseRadius * (1 - mochi.squishAmount * 0.15)
  );
}

export function checkMochiCollision(m1: Mochi, m2: Mochi): boolean {
  if (m1.merging || m2.merging) return false;

  const dx = m2.cx - m1.cx;
  const dy = m2.cy - m1.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = m1.baseRadius + m2.baseRadius;

  // Check if any points from m1 have penetrated inside m2's boundary (and vice versa)
  // This prevents wobbly edges from overlapping
  if (dist < minDist * 1.3 && dist > 0.1) {
    const penetrationThreshold = 2; // Dead zone - ignore tiny penetrations to prevent jitter
    const nx = dx / dist; // Normal from m1 to m2
    const ny = dy / dist;

    // Find actual surface extent of each mochi toward the other
    // This accounts for wobble/deformation extending beyond baseRadius
    let m2ExtentTowardM1 = 0;
    for (const p of m2.points) {
      const pdx = p.x - m2.cx;
      const pdy = p.y - m2.cy;
      // Project onto the direction toward m1 (negative normal)
      const projection = -(pdx * nx + pdy * ny);
      if (projection > m2ExtentTowardM1) m2ExtentTowardM1 = projection;
    }

    let m1ExtentTowardM2 = 0;
    for (const p of m1.points) {
      const pdx = p.x - m1.cx;
      const pdy = p.y - m1.cy;
      // Project onto the direction toward m2 (positive normal)
      const projection = pdx * nx + pdy * ny;
      if (projection > m1ExtentTowardM2) m1ExtentTowardM2 = projection;
    }

    // Check m1's points against m2's actual surface
    for (const p of m1.points) {
      const pdx = p.x - m2.cx;
      const pdy = p.y - m2.cy;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      // Use actual extent only - matches visual shape
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

    // Check m2's points against m1's actual surface
    for (const p of m2.points) {
      const pdx = p.x - m1.cx;
      const pdy = p.y - m1.cy;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      // Use actual extent only - matches visual shape
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
