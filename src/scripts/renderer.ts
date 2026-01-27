import type {
  Mochi,
  CanvasContext,
  MochiEmotion,
  Container,
  GameState,
  MergeEffect,
  ImpactStar,
  CherryBlossom,
  WalkingCat,
} from "./types";
import { mochiTiers } from "./physics";
import type { LeaderboardEntry } from "./leaderboard";

// Visual effects storage
const mergeEffects: MergeEffect[] = [];
const impactStars: ImpactStar[] = [];

// Easter egg effects
const cherryBlossoms: CherryBlossom[] = [];
const walkingCat: WalkingCat = { x: -50, y: 0, direction: 1, frame: 0, active: false };

// Cat sprite
const catSprite = new Image();
catSprite.src = "/sprites/cat_walk_12_frames_right_to_left.png";
const CAT_FRAMES = 12;
let catFrameWidth = 0;
let catFrameHeight = 0;
catSprite.onload = () => {
  catFrameWidth = catSprite.width / CAT_FRAMES;
  catFrameHeight = catSprite.height;
};

export function addCherryBlossoms(width: number, height: number, count: number): void {
  for (let i = 0; i < count; i++) {
    cherryBlossoms.push({
      x: Math.random() * width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 0.8 + Math.random() * 1.2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      size: 6 + Math.random() * 6,
      opacity: 0.7 + Math.random() * 0.3,
    });
  }
}

export function triggerCatWalk(width: number, height: number): void {
  walkingCat.active = true;
  walkingCat.direction = Math.random() > 0.5 ? 1 : -1;
  walkingCat.x = walkingCat.direction > 0 ? -40 : width + 40;
  walkingCat.y = height - 60;
  walkingCat.frame = 0;
}

export function isCatWalking(): boolean {
  return walkingCat.active;
}

export function updateEasterEggs(dt: number): void {
  // Update cherry blossoms
  for (let i = cherryBlossoms.length - 1; i >= 0; i--) {
    const b = cherryBlossoms[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx += (Math.random() - 0.5) * 0.1 * dt; // Gentle drift
    b.rotation += b.rotationSpeed * dt;
    b.opacity -= 0.002 * dt;

    if (b.opacity <= 0 || b.y > 800) {
      cherryBlossoms.splice(i, 1);
    }
  }

  // Update walking cat
  if (walkingCat.active) {
    walkingCat.x += walkingCat.direction * 1.5 * dt;
    walkingCat.frame += 0.15 * dt;

    // Check if cat has walked off screen
    if (
      (walkingCat.direction > 0 && walkingCat.x > 1000) ||
      (walkingCat.direction < 0 && walkingCat.x < -50)
    ) {
      walkingCat.active = false;
    }
  }
}

export function createCanvasContext(canvas: HTMLCanvasElement): CanvasContext {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");

  return {
    canvas,
    ctx,
    width: canvas.width,
    height: canvas.height,
    dpr: window.devicePixelRatio || 1,
  };
}

export function resizeCanvas(context: CanvasContext): void {
  const { canvas, ctx } = context;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  context.width = rect.width;
  context.height = rect.height;
  context.dpr = dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function clearCanvas(context: CanvasContext, nightMode: boolean = false): void {
  const { ctx, width, height } = context;

  if (nightMode) {
    // Cozy night mode gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#2A3A4A"); // Deep night blue
    gradient.addColorStop(0.5, "#1E2D3D"); // Darker blue
    gradient.addColorStop(1, "#152535"); // Deep night
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Stars
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    for (let i = 0; i < 30; i++) {
      const starX = (i * 137) % width;
      const starY = (i * 89) % (height * 0.4);
      const size = 1 + (i % 3);
      ctx.beginPath();
      ctx.arc(starX, starY, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft texture
    ctx.fillStyle = "rgba(100, 120, 150, 0.03)";
    for (let i = 0; i < width; i += 20) {
      for (let j = 0; j < height; j += 20) {
        if ((i + j) % 40 === 0) {
          ctx.fillRect(i, j, 10, 10);
        }
      }
    }
  } else {
    // Matcha-inspired gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#E8F0E4"); // Light matcha cream
    gradient.addColorStop(0.5, "#D4E4D1"); // Soft matcha
    gradient.addColorStop(1, "#C5D9BE"); // Deeper matcha
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle pattern overlay for texture
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    for (let i = 0; i < width; i += 20) {
      for (let j = 0; j < height; j += 20) {
        if ((i + j) % 40 === 0) {
          ctx.fillRect(i, j, 10, 10);
        }
      }
    }
  }
}

export function drawContainer(context: CanvasContext, container: Container): void {
  const { ctx } = context;
  const { x, y, width, height, wallThickness, overflowLine } = container;

  // Container shadow (softer, green-tinted)
  ctx.fillStyle = "rgba(60, 80, 50, 0.15)";
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, width, height, 12);
  ctx.fill();

  // Container background (inside) - soft matcha green
  const innerGradient = ctx.createLinearGradient(x, y, x, y + height);
  innerGradient.addColorStop(0, "rgba(220, 235, 210, 0.85)");
  innerGradient.addColorStop(1, "rgba(200, 220, 190, 0.9)");
  ctx.fillStyle = innerGradient;
  ctx.beginPath();
  ctx.roundRect(x + wallThickness, y, width - wallThickness * 2, height - wallThickness, 8);
  ctx.fill();

  // Container walls - natural bamboo/wood green
  const wallGradient = ctx.createLinearGradient(x, y, x + wallThickness, y);
  wallGradient.addColorStop(0, "#7A9B6D"); // Bamboo green
  wallGradient.addColorStop(0.5, "#8DAA7F");
  wallGradient.addColorStop(1, "#7A9B6D");

  ctx.fillStyle = wallGradient;
  ctx.strokeStyle = "#5C7A52";
  ctx.lineWidth = 2;

  // Left wall
  ctx.beginPath();
  ctx.roundRect(x, y, wallThickness, height, [12, 0, 0, 12]);
  ctx.fill();
  ctx.stroke();

  // Right wall
  const rightWallGradient = ctx.createLinearGradient(x + width - wallThickness, y, x + width, y);
  rightWallGradient.addColorStop(0, "#7A9B6D");
  rightWallGradient.addColorStop(0.5, "#8DAA7F");
  rightWallGradient.addColorStop(1, "#7A9B6D");
  ctx.fillStyle = rightWallGradient;
  ctx.beginPath();
  ctx.roundRect(x + width - wallThickness, y, wallThickness, height, [0, 12, 12, 0]);
  ctx.fill();
  ctx.stroke();

  // Bottom wall
  const bottomWallGradient = ctx.createLinearGradient(x, y + height - wallThickness, x, y + height);
  bottomWallGradient.addColorStop(0, "#8DAA7F");
  bottomWallGradient.addColorStop(1, "#6B8A5E");
  ctx.fillStyle = bottomWallGradient;
  ctx.beginPath();
  ctx.roundRect(x, y + height - wallThickness, width, wallThickness, [0, 0, 12, 12]);
  ctx.fill();
  ctx.stroke();

  // Danger line (softer, matcha-tinted red)
  ctx.strokeStyle = "rgba(180, 90, 90, 0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(x + wallThickness, overflowLine);
  ctx.lineTo(x + width - wallThickness, overflowLine);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Chaikin smoothing for organic shapes
function smoothPoints(
  points: { x: number; y: number }[],
  iterations: number = 2,
): { x: number; y: number }[] {
  let result = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const newPoints: { x: number; y: number }[] = [];
    const n = result.length;

    for (let i = 0; i < n; i++) {
      const p0 = result[i];
      const p1 = result[(i + 1) % n];

      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25,
      });
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75,
      });
    }

    result = newPoints;
  }

  return result;
}

function getSmoothPath(points: { x: number; y: number }[]): Path2D {
  const path = new Path2D();
  const smoothed = smoothPoints(points, 2);
  const n = smoothed.length;

  if (n < 3) return path;

  path.moveTo(smoothed[0].x, smoothed[0].y);

  for (let i = 0; i < n; i++) {
    const p0 = smoothed[i];
    const p1 = smoothed[(i + 1) % n];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    path.quadraticCurveTo(p0.x, p0.y, midX, midY);
  }

  path.closePath();
  return path;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  emotion: MochiEmotion,
  squishAmount: number,
  cheekColor: string,
): void {
  const scale = radius / 50; // Scale face features based on size
  const eyeSpacing = 12 * scale;
  const eyeY = cy - 5 * scale;
  const eyeSize = 4 * scale;

  const squishOffset = squishAmount * 5 * scale;
  const faceY = eyeY + squishOffset;

  ctx.fillStyle = "#4A4A4A";
  ctx.strokeStyle = "#4A4A4A";
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.lineCap = "round";

  switch (emotion) {
    case "happy":
      ctx.beginPath();
      ctx.arc(cx - eyeSpacing, faceY, eyeSize * 1.2, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + eyeSpacing, faceY, eyeSize * 1.2, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, faceY + 8 * scale, 6 * scale, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      break;

    case "surprised":
      ctx.beginPath();
      ctx.arc(cx - eyeSpacing, faceY, eyeSize * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + eyeSpacing, faceY, eyeSize * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, faceY + 10 * scale, 3 * scale, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case "squished":
      // Cute squeezed eyes (curved lines like >_<)
      ctx.lineWidth = Math.max(2, 2.5 * scale);

      // Left eye - curved squeeze
      ctx.beginPath();
      ctx.moveTo(cx - eyeSpacing - eyeSize, faceY - eyeSize * 0.6);
      ctx.quadraticCurveTo(
        cx - eyeSpacing + eyeSize * 0.5,
        faceY,
        cx - eyeSpacing - eyeSize,
        faceY + eyeSize * 0.6,
      );
      ctx.stroke();

      // Right eye - curved squeeze
      ctx.beginPath();
      ctx.moveTo(cx + eyeSpacing + eyeSize, faceY - eyeSize * 0.6);
      ctx.quadraticCurveTo(
        cx + eyeSpacing - eyeSize * 0.5,
        faceY,
        cx + eyeSpacing + eyeSize,
        faceY + eyeSize * 0.6,
      );
      ctx.stroke();

      // Cute worried mouth (small wobbly line)
      ctx.beginPath();
      ctx.moveTo(cx - 4 * scale, faceY + 9 * scale);
      ctx.quadraticCurveTo(cx, faceY + 11 * scale, cx + 4 * scale, faceY + 9 * scale);
      ctx.stroke();

      // Sweat drop
      ctx.fillStyle = "rgba(150, 200, 255, 0.7)";
      ctx.beginPath();
      ctx.moveTo(cx + eyeSpacing * 1.8, faceY - eyeSize * 2);
      ctx.quadraticCurveTo(
        cx + eyeSpacing * 1.8 + 3 * scale,
        faceY - eyeSize,
        cx + eyeSpacing * 1.8,
        faceY,
      );
      ctx.quadraticCurveTo(
        cx + eyeSpacing * 1.8 - 3 * scale,
        faceY - eyeSize,
        cx + eyeSpacing * 1.8,
        faceY - eyeSize * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#4A4A4A";

      // Extra blush lines (anime style)
      ctx.strokeStyle = cheekColor;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1, 1.5 * scale);
      for (let i = 0; i < 3; i++) {
        const lineX = cx - eyeSpacing * 1.6 - 4 * scale + i * 4 * scale;
        ctx.beginPath();
        ctx.moveTo(lineX, faceY + 4 * scale);
        ctx.lineTo(lineX + 2 * scale, faceY + 8 * scale);
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const lineX = cx + eyeSpacing * 1.6 - 4 * scale + i * 4 * scale;
        ctx.beginPath();
        ctx.moveTo(lineX, faceY + 4 * scale);
        ctx.lineTo(lineX + 2 * scale, faceY + 8 * scale);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#4A4A4A";
      break;

    case "flying":
      ctx.beginPath();
      ctx.arc(cx - eyeSpacing, faceY, eyeSize * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + eyeSpacing, faceY, eyeSize * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(
        cx - eyeSpacing - eyeSize * 0.4,
        faceY - eyeSize * 0.4,
        eyeSize * 0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        cx + eyeSpacing - eyeSize * 0.4,
        faceY - eyeSize * 0.4,
        eyeSize * 0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#4A4A4A";
      ctx.beginPath();
      ctx.arc(cx, faceY + 7 * scale, 7 * scale, 0, Math.PI);
      ctx.fill();
      break;

    case "love":
      // Heart eyes
      ctx.fillStyle = "#FF6B8A";
      const heartSize = eyeSize * 1.5;
      drawHeart(ctx, cx - eyeSpacing, faceY, heartSize);
      drawHeart(ctx, cx + eyeSpacing, faceY, heartSize);
      ctx.fillStyle = "#4A4A4A";
      ctx.beginPath();
      ctx.arc(cx, faceY + 8 * scale, 5 * scale, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      break;

    case "sleepy":
      // Soft closed eyes (curved lines like peaceful sleep)
      ctx.lineWidth = Math.max(2, 2.5 * scale);
      ctx.lineCap = "round";

      // Left eye - gentle curved closed eye
      ctx.beginPath();
      ctx.arc(
        cx - eyeSpacing,
        faceY + eyeSize * 0.3,
        eyeSize * 1.1,
        Math.PI * 0.15,
        Math.PI * 0.85,
      );
      ctx.stroke();

      // Right eye - gentle curved closed eye
      ctx.beginPath();
      ctx.arc(
        cx + eyeSpacing,
        faceY + eyeSize * 0.3,
        eyeSize * 1.1,
        Math.PI * 0.15,
        Math.PI * 0.85,
      );
      ctx.stroke();

      // Content little smile
      ctx.beginPath();
      ctx.arc(cx, faceY + 9 * scale, 4 * scale, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();

      // Cozy zzz (small, subtle)
      ctx.fillStyle = "rgba(74, 74, 74, 0.4)";
      ctx.font = `${Math.max(8, 7 * scale)}px "Segoe UI", sans-serif`;
      ctx.fillText("z", cx + eyeSpacing * 1.8, faceY - eyeSize * 1.5);
      ctx.font = `${Math.max(6, 5 * scale)}px "Segoe UI", sans-serif`;
      ctx.fillText("z", cx + eyeSpacing * 2.2, faceY - eyeSize * 2.5);
      break;
  }

  // Blush - extra big and rosy when squished!
  const isSquished = emotion === "squished";
  const blushOpacity = emotion === "surprised" || isSquished || emotion === "love" ? 0.7 : 0.35;
  const blushWidth = isSquished ? 7 * scale : 5 * scale;
  const blushHeight = isSquished ? 4 * scale : 3 * scale;

  ctx.fillStyle = cheekColor;
  ctx.globalAlpha = blushOpacity;
  ctx.beginPath();
  ctx.ellipse(cx - eyeSpacing * 1.6, faceY + 6 * scale, blushWidth, blushHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + eyeSpacing * 1.6, faceY + 6 * scale, blushWidth, blushHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x - size, y - size * 0.5, x - size, y + size * 0.5, x, y + size);
  ctx.bezierCurveTo(x + size, y + size * 0.5, x + size, y - size * 0.5, x, y + size * 0.3);
  ctx.fill();
}

export function addMergeEffect(x: number, y: number, radius: number, color: string): void {
  const particles: MergeEffect["particles"] = [];
  const numParticles = 12;

  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 3 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      radius: 4 + Math.random() * 4,
      color,
      life: 1,
    });
  }

  mergeEffects.push({
    x,
    y,
    radius: 0,
    maxRadius: radius * 2,
    life: 1,
    color,
    particles,
  });
}

export function addImpactStars(x: number, y: number, intensity: number, color: string): void {
  const numStars = Math.min(6, Math.floor(intensity));

  for (let i = 0; i < numStars; i++) {
    const angle = (i / numStars) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 2 + intensity * 0.2;

    impactStars.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      scale: 0.4 + Math.random() * 0.4,
      life: 1,
      color,
    });
  }
}

function drawEffects(ctx: CanvasRenderingContext2D): void {
  // Draw merge effects
  for (let i = mergeEffects.length - 1; i >= 0; i--) {
    const effect = mergeEffects[i];
    effect.life -= 0.03;
    effect.radius += (effect.maxRadius - effect.radius) * 0.2;

    if (effect.life <= 0) {
      mergeEffects.splice(i, 1);
      continue;
    }

    // Ring effect
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 4 * effect.life;
    ctx.globalAlpha = effect.life * 0.6;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Particles
    for (let j = effect.particles.length - 1; j >= 0; j--) {
      const p = effect.particles[j];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= 0.04;

      if (p.life <= 0) {
        effect.particles.splice(j, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Draw impact stars
  for (let i = impactStars.length - 1; i >= 0; i--) {
    const star = impactStars[i];
    star.x += star.vx;
    star.y += star.vy;
    star.vy += 0.12;
    star.rotation += star.rotationSpeed;
    star.life -= 0.025;

    if (star.life <= 0) {
      impactStars.splice(i, 1);
      continue;
    }

    const size = 6 * star.scale * (0.5 + star.life * 0.5);
    ctx.fillStyle = star.color;
    ctx.globalAlpha = star.life;

    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(star.rotation);

    // 4-point star
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const r = j % 2 === 0 ? size : size * 0.4;
      const angle = (j / 8) * Math.PI * 2;
      if (j === 0) {
        ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      } else {
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export function drawMochi(context: CanvasContext, mochi: Mochi, isPreview: boolean = false): void {
  const { ctx } = context;
  const { points, color, cx, cy, radius, baseRadius, emotion, squishAmount, merging } = mochi;

  // Merging animation
  if (merging) {
    const scale = mochi.mergeTimer;
    ctx.globalAlpha = scale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }

  const path = getSmoothPath(points);

  // Shadow
  if (!isPreview) {
    ctx.save();
    ctx.translate(0, 8 + squishAmount * 4);
    ctx.filter = "blur(12px)";
    ctx.fillStyle = color.shadow;
    ctx.fill(path);
    ctx.restore();
  }

  // Body gradient
  const gradient = ctx.createRadialGradient(
    cx - baseRadius * 0.2,
    cy - baseRadius * 0.2,
    0,
    cx,
    cy,
    baseRadius * 1.2,
  );
  gradient.addColorStop(0, color.highlight);
  gradient.addColorStop(0.3, color.primary);
  gradient.addColorStop(1, color.secondary);

  ctx.fillStyle = gradient;
  ctx.fill(path);

  // Outline
  ctx.strokeStyle = color.secondary;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.stroke(path);
  ctx.globalAlpha = 1;

  // Highlight
  const highlightGradient = ctx.createRadialGradient(
    cx - baseRadius * 0.15,
    cy - baseRadius * 0.3,
    0,
    cx - baseRadius * 0.15,
    cy - baseRadius * 0.3,
    baseRadius * 0.45,
  );
  highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  highlightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
  highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = highlightGradient;
  ctx.fill(path);

  // Face
  if (!isPreview || baseRadius > 20) {
    drawFace(ctx, cx, cy, radius, emotion, squishAmount, color.cheek);
  }

  if (merging) {
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// Animation state for progression wheel hover effects
const wheelAnimations: {
  scale: number;
  targetScale: number;
  velocity: number;
  wasHovered: boolean;
}[] = Array.from({ length: 11 }, () => ({
  scale: 1,
  targetScale: 1,
  velocity: 0,
  wasHovered: false,
}));

// Tooltip animation state
const tooltipAnim = { opacity: 0, offsetX: 0, currentTier: -1 };

function drawProgressionWheel(
  context: CanvasContext,
  container: Container,
  currentTier: number,
  mouseX: number,
  mouseY: number,
): void {
  const { ctx } = context;

  // Position to the right of the container
  const wheelX = container.x + container.width + 50;
  const wheelStartY = container.y + 30;
  const spacing = 42; // Vertical spacing between tiers
  const hoverRadius = 20; // Hover detection radius

  // Background panel - matcha themed
  const panelGradient = ctx.createLinearGradient(
    wheelX - 28,
    wheelStartY,
    wheelX + 28,
    wheelStartY,
  );
  panelGradient.addColorStop(0, "rgba(200, 220, 190, 0.6)");
  panelGradient.addColorStop(0.5, "rgba(220, 235, 210, 0.7)");
  panelGradient.addColorStop(1, "rgba(200, 220, 190, 0.6)");
  ctx.fillStyle = panelGradient;
  ctx.strokeStyle = "rgba(100, 130, 90, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(wheelX - 28, wheelStartY - 20, 56, spacing * 10 + 50, 12);
  ctx.fill();
  ctx.stroke();

  // Track hovered tier for tooltip
  let hoveredTier: { index: number; y: number; name: string } | null = null;

  // Draw each tier
  for (let i = 0; i < mochiTiers.length; i++) {
    const tier = mochiTiers[i];
    const y = wheelStartY + i * spacing;
    const anim = wheelAnimations[i];

    // Scale mochi to fit (max display radius of 16)
    const displayRadius = Math.min(16, tier.radius * 0.35);
    const isCurrentTier = i === currentTier;

    // Check if mouse is hovering over this tier
    const dx = mouseX - wheelX;
    const dy = mouseY - y;
    const isHovered = Math.sqrt(dx * dx + dy * dy) < hoverRadius;

    // Trigger gentle bounce animation when newly hovered
    if (isHovered && !anim.wasHovered) {
      anim.velocity = 0.08; // Gentle initial pop
    }
    anim.wasHovered = isHovered;

    // Update animation with soft spring physics
    if (isHovered) {
      anim.targetScale = 1.15; // Subtle scale up
    } else {
      anim.targetScale = 1;
    }

    // Soft, cozy spring animation
    const springStrength = 0.06; // Gentle pull
    const damping = 0.85; // Smooth, slow settle
    const diff = anim.targetScale - anim.scale;
    anim.velocity += diff * springStrength;
    anim.velocity *= damping;
    anim.scale += anim.velocity;

    // Clamp scale
    anim.scale = Math.max(0.95, Math.min(1.25, anim.scale));

    if (isHovered) {
      hoveredTier = { index: i, y, name: tier.name };
    }

    // Highlight current tier or animated tier
    const showHighlight = isCurrentTier || anim.scale > 1.02;
    if (showHighlight) {
      const highlightAlpha = isHovered ? 0.6 : Math.min(0.5, (anim.scale - 1) * 4 + 0.2);
      ctx.fillStyle = `rgba(170, 210, 150, ${highlightAlpha})`;
      ctx.beginPath();
      ctx.arc(wheelX, y, 19 + (anim.scale - 1) * 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw mini mochi with animated scale
    const finalScale = anim.scale;
    const offsetY = (anim.scale - 1) * -2; // Slight upward bounce

    const gradient = ctx.createRadialGradient(
      wheelX - displayRadius * 0.2,
      y + offsetY - displayRadius * 0.2,
      0,
      wheelX,
      y + offsetY,
      displayRadius * 1.2 * finalScale,
    );
    gradient.addColorStop(0, tier.color.highlight);
    gradient.addColorStop(0.3, tier.color.primary);
    gradient.addColorStop(1, tier.color.secondary);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(wheelX, y + offsetY, displayRadius * finalScale, 0, Math.PI * 2);
    ctx.fill();

    // Subtle outline
    ctx.strokeStyle = tier.color.secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw arrow to next tier (except for last) - matcha colored
    if (i < mochiTiers.length - 1) {
      const arrowY = y + spacing / 2;
      ctx.fillStyle = "rgba(100, 130, 90, 0.5)";
      ctx.beginPath();
      ctx.moveTo(wheelX, arrowY - 4);
      ctx.lineTo(wheelX + 5, arrowY + 4);
      ctx.lineTo(wheelX - 5, arrowY + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Animate tooltip
  if (hoveredTier) {
    // Switching to new tier or showing
    if (tooltipAnim.currentTier !== hoveredTier.index) {
      tooltipAnim.currentTier = hoveredTier.index;
      tooltipAnim.offsetX = 8; // Start slightly to the right
    }
    // Fade in and slide
    tooltipAnim.opacity += (1 - tooltipAnim.opacity) * 0.25;
    tooltipAnim.offsetX += (0 - tooltipAnim.offsetX) * 0.2;
  } else {
    // Fade out
    tooltipAnim.opacity += (0 - tooltipAnim.opacity) * 0.2;
    if (tooltipAnim.opacity < 0.01) {
      tooltipAnim.currentTier = -1;
    }
  }

  // Draw tooltip with animation
  if (tooltipAnim.opacity > 0.01 && tooltipAnim.currentTier >= 0) {
    const tier = mochiTiers[tooltipAnim.currentTier];
    const tierY = wheelStartY + tooltipAnim.currentTier * spacing;
    const anim = wheelAnimations[tooltipAnim.currentTier];
    const bounceOffsetY = (anim.scale - 1) * -2;

    const tooltipX = wheelX - 38 + tooltipAnim.offsetX; // Closer to the wheel
    const tooltipY = tierY + bounceOffsetY;

    ctx.font = '13px "Segoe UI", sans-serif';
    const textWidth = ctx.measureText(tier.name).width;
    const padding = 12;
    const tooltipWidth = textWidth + padding * 2;
    const tooltipLeft = tooltipX - tooltipWidth - 4;

    ctx.globalAlpha = tooltipAnim.opacity;

    // Tooltip background - softer, rounder
    ctx.fillStyle = "rgba(55, 75, 45, 0.92)";
    ctx.beginPath();
    ctx.roundRect(tooltipLeft, tooltipY - 11, tooltipWidth, 22, 8);
    ctx.fill();

    // Tooltip arrow (small triangle pointing right)
    ctx.beginPath();
    ctx.moveTo(tooltipX - 4, tooltipY - 4);
    ctx.lineTo(tooltipX + 1, tooltipY);
    ctx.lineTo(tooltipX - 4, tooltipY + 4);
    ctx.closePath();
    ctx.fill();

    // Tooltip text - centered
    ctx.fillStyle = "#F4FCF0";
    ctx.textAlign = "center";
    ctx.fillText(tier.name, tooltipLeft + tooltipWidth / 2, tooltipY + 4);
    ctx.textAlign = "left";

    ctx.globalAlpha = 1;
  }
}

function drawLeaderboard(
  context: CanvasContext,
  leaderboard: LeaderboardEntry[],
  playerName: string,
  container: Container,
): void {
  const { ctx } = context;

  const panelX = 20;
  const panelY = 85;
  const panelWidth = 180;

  // Calculate fade zone - start fading 40px before container top
  const fadeStartY = container.y - 40;
  const fadeEndY = container.y + 20;

  // Helper to get opacity based on Y position
  const getYOpacity = (y: number): number => {
    if (y < fadeStartY) return 1;
    if (y > fadeEndY) return 0;
    return 1 - (y - fadeStartY) / (fadeEndY - fadeStartY);
  };

  // Subtle title - blends with background
  const titleOpacity = getYOpacity(panelY);
  if (titleOpacity > 0) {
    ctx.fillStyle = `rgba(90, 120, 80, ${0.5 * titleOpacity})`;
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("Leaderboard", panelX, panelY);
  }

  // Entries - soft and cozy
  if (leaderboard.length === 0) {
    const emptyY1 = panelY + 28;
    const emptyY2 = panelY + 48;
    const opacity1 = getYOpacity(emptyY1);
    const opacity2 = getYOpacity(emptyY2);

    if (opacity1 > 0) {
      ctx.fillStyle = `rgba(90, 120, 80, ${0.4 * opacity1})`;
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillText("no scores yet...", panelX, emptyY1);
    }
    if (opacity2 > 0) {
      ctx.fillStyle = `rgba(90, 120, 80, ${0.4 * opacity2})`;
      ctx.fillText("be the first! ♡", panelX, emptyY2);
    }
  } else {
    for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
      const entry = leaderboard[i];
      const y = panelY + 26 + i * 26;
      const isPlayer = entry.name === playerName;
      const yOpacity = getYOpacity(y);

      // Skip if fully faded
      if (yOpacity <= 0) continue;

      // Subtle highlight for player's entry
      if (isPlayer && yOpacity > 0) {
        ctx.fillStyle = `rgba(140, 170, 130, ${0.25 * yOpacity})`;
        ctx.beginPath();
        ctx.roundRect(panelX - 6, y - 14, panelWidth, 22, 6);
        ctx.fill();
      }

      // Rank - very subtle
      const baseOpacity = isPlayer ? 0.7 : 0.4 - i * 0.02;
      ctx.fillStyle = `rgba(70, 100, 60, ${baseOpacity * yOpacity})`;
      ctx.font = isPlayer ? '600 14px "Segoe UI", sans-serif' : '14px "Segoe UI", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, panelX, y);

      // Name (truncated)
      const displayName = entry.name.length > 14 ? entry.name.slice(0, 13) + "…" : entry.name;
      ctx.fillText(displayName, panelX + 22, y);

      // Score - aligned right
      ctx.textAlign = "right";
      ctx.fillText(entry.score.toString(), panelX + panelWidth - 10, y);
    }
  }

  ctx.textAlign = "left";
}

export function drawUI(
  context: CanvasContext,
  gameState: GameState,
  leaderboard?: LeaderboardEntry[],
  playerName?: string,
): void {
  const { ctx, width } = context;
  const { score, highScore, nextTier, gameOver, container, mouseX, mouseY } = gameState;

  // Check if screen is small (not enough space for progression wheel)
  const spaceOnRight = width - (container.x + container.width);
  const isSmallScreen = spaceOnRight < 80;

  // Score - matcha green text
  ctx.fillStyle = "#4A6741";
  ctx.font = 'bold 24px "Segoe UI", sans-serif';
  ctx.textAlign = "left";
  const scoreText = `Score: ${score}`;
  ctx.fillText(scoreText, 20, 35);

  // Player name - very subtle, to the right of score
  if (playerName) {
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.fillStyle = "rgba(90, 120, 80, 0.45)";
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText(playerName, 20 + scoreWidth + 10, 35);
  }

  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = "#6B8A5E";
  ctx.fillText(`Best: ${highScore}`, 20, 58);

  // Next mochi preview - position changes based on screen size
  let previewX: number;
  let previewY: number;
  let labelOffset: number;

  if (isSmallScreen) {
    // Top right corner on small screens, below the sun/moon toggle
    previewX = width - 55;
    previewY = 130;
    labelOffset = 45;
  } else {
    // Left of container on larger screens
    previewX = container.x - 50;
    previewY = container.y + 50;
    labelOffset = 45;
  }

  ctx.fillStyle = "#4A6741";
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("NEXT", previewX, previewY - labelOffset);

  // Preview background - soft matcha tint
  ctx.fillStyle = "rgba(200, 220, 190, 0.6)";
  ctx.strokeStyle = "rgba(100, 130, 90, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(previewX, previewY, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw preview mochi
  const tierData = mochiTiers[nextTier];
  const previewScale = 30 / tierData.radius;
  ctx.save();
  ctx.translate(previewX, previewY);
  ctx.scale(previewScale, previewScale);

  const gradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, tierData.radius);
  gradient.addColorStop(0, tierData.color.highlight);
  gradient.addColorStop(0.3, tierData.color.primary);
  gradient.addColorStop(1, tierData.color.secondary);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, tierData.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Draw progression wheel on the right (only on larger screens)
  if (!isSmallScreen) {
    drawProgressionWheel(context, container, nextTier, mouseX, mouseY);
  }

  // Draw leaderboard on the left (with vertical fade near container)
  if (leaderboard && playerName) {
    drawLeaderboard(context, leaderboard, playerName, container);
  }

  // Game over overlay - matcha themed
  if (gameOver) {
    // Semi-transparent matcha overlay
    ctx.fillStyle = "rgba(60, 80, 50, 0.75)";
    ctx.fillRect(0, 0, width, context.height);

    // Decorative panel
    const panelX = width / 2;
    const panelY = context.height / 2;
    ctx.fillStyle = "rgba(230, 240, 225, 0.95)";
    ctx.strokeStyle = "#7A9B6D";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(panelX - 150, panelY - 80, 300, 180, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#3D5A3A";
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("Game Over", panelX, panelY - 30);

    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.fillStyle = "#4A6741";
    ctx.fillText(`Final Score: ${score}`, panelX, panelY + 15);

    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillStyle = "#6B8A5E";
    ctx.fillText("Click to play again", panelX, panelY + 55);
  }
}

export function drawDropPreview(
  context: CanvasContext,
  x: number,
  tier: number,
  container: Container,
): void {
  const { ctx } = context;
  const tierData = mochiTiers[tier];

  // Clamp x within container
  const minX = container.x + container.wallThickness + tierData.radius;
  const maxX = container.x + container.width - container.wallThickness - tierData.radius;
  const clampedX = Math.max(minX, Math.min(maxX, x));

  // Drop line - matcha colored
  ctx.strokeStyle = "rgba(100, 130, 90, 0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(clampedX, container.overflowLine - 50);
  ctx.lineTo(clampedX, container.y + container.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // Preview mochi (semi-transparent)
  ctx.globalAlpha = 0.7;
  const gradient = ctx.createRadialGradient(
    clampedX - tierData.radius * 0.2,
    container.overflowLine - 50 - tierData.radius * 0.2,
    0,
    clampedX,
    container.overflowLine - 50,
    tierData.radius * 1.2,
  );
  gradient.addColorStop(0, tierData.color.highlight);
  gradient.addColorStop(0.3, tierData.color.primary);
  gradient.addColorStop(1, tierData.color.secondary);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(clampedX, container.overflowLine - 50, tierData.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCherryBlossoms(ctx: CanvasRenderingContext2D): void {
  for (const b of cherryBlossoms) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);
    ctx.globalAlpha = b.opacity;

    // Draw a simple cherry blossom (5 petals)
    ctx.fillStyle = "#FFB7C5";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -b.size * 0.6, b.size * 0.35, b.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate((Math.PI * 2) / 5);
    }

    // Center
    ctx.fillStyle = "#FFE4E8";
    ctx.beginPath();
    ctx.arc(0, 0, b.size * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawWalkingCat(ctx: CanvasRenderingContext2D): void {
  if (!walkingCat.active || catFrameWidth === 0) return;

  const { x, y, direction, frame } = walkingCat;

  // Calculate current frame (loop through 12 frames)
  const currentFrame = Math.floor(frame) % CAT_FRAMES;
  const sourceX = currentFrame * catFrameWidth;

  // Scale for display (adjust as needed)
  const scale = 2;
  const displayWidth = catFrameWidth * scale;
  const displayHeight = catFrameHeight * scale;

  ctx.save();
  ctx.translate(x, y);

  // Sprite is right-to-left, so flip when going right
  if (direction > 0) {
    ctx.scale(-1, 1);
  }

  // Draw the current frame (centered)
  ctx.drawImage(
    catSprite,
    sourceX,
    0,
    catFrameWidth,
    catFrameHeight, // Source rectangle
    -displayWidth / 2,
    -displayHeight / 2,
    displayWidth,
    displayHeight, // Destination rectangle
  );

  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, width: number, nightMode: boolean): void {
  const moonX = width - 35;
  const moonY = 35;

  ctx.save();

  if (nightMode) {
    // Glowing moon at night
    const glow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 30);
    glow.addColorStop(0, "rgba(255, 250, 220, 0.4)");
    glow.addColorStop(1, "rgba(255, 250, 220, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Moon
    ctx.fillStyle = "#FFF8E0";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Moon craters
    ctx.fillStyle = "rgba(200, 190, 160, 0.3)";
    ctx.beginPath();
    ctx.arc(moonX - 5, moonY - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX + 4, moonY + 5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Zzz
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillText("z", moonX + 18, moonY - 12);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText("z", moonX + 24, moonY - 20);
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText("z", moonX + 32, moonY - 30);
  } else {
    // Sun during day
    ctx.fillStyle = "rgba(255, 220, 100, 0.3)";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#FFE082";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 14, 0, Math.PI * 2);
    ctx.fill();

    // Sun rays
    ctx.strokeStyle = "rgba(255, 200, 50, 0.5)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(moonX + Math.cos(angle) * 18, moonY + Math.sin(angle) * 18);
      ctx.lineTo(moonX + Math.cos(angle) * 24, moonY + Math.sin(angle) * 24);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function render(
  context: CanvasContext,
  mochis: Mochi[],
  gameState: GameState,
  leaderboard?: LeaderboardEntry[],
  playerName?: string,
): void {
  context.ctx.setTransform(context.dpr, 0, 0, context.dpr, 0, 0);

  clearCanvas(context, gameState.nightMode);
  drawContainer(context, gameState.container);

  // Draw drop preview
  if (gameState.canDrop && !gameState.gameOver) {
    drawDropPreview(
      context,
      gameState.dropX,
      gameState.currentMochi?.tier ?? gameState.nextTier,
      gameState.container,
    );
  }

  // Draw effects behind mochi
  drawEffects(context.ctx);

  // Draw cherry blossoms (behind mochi)
  drawCherryBlossoms(context.ctx);

  // Sort and draw mochi
  const sorted = [...mochis].sort((a, b) => a.cy - b.cy);
  for (const mochi of sorted) {
    drawMochi(context, mochi);
  }

  // Draw walking cat (in front of mochi)
  drawWalkingCat(context.ctx);

  // Draw UI on top
  drawUI(context, gameState, leaderboard, playerName);

  // Draw moon/sun toggle
  drawMoon(context.ctx, context.width, gameState.nightMode);
}
