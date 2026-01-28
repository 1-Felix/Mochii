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
import { getDayNumber } from "./daily";

// Visual effects storage
const mergeEffects: MergeEffect[] = [];
const impactStars: ImpactStar[] = [];

// Ambient particles (dust motes floating gently)
interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  phase: number;
  life: number; // 0-1, controls fade in/out
  lifeSpeed: number; // How fast it fades
  fadingIn: boolean; // Direction of fade
}
const ambientParticles: AmbientParticle[] = [];

// Fireflies for night mode
interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  glowPhase: number;
  glowSpeed: number;
  size: number;
}
const fireflies: Firefly[] = [];

// Rain drops for night mode
interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
}
const rainDrops: RainDrop[] = [];

// Warmth wisps (gentle steam-like rising particles)
interface WarmthWisp {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  wobblePhase: number;
  wobbleSpeed: number;
}
const warmthWisps: WarmthWisp[] = [];

// Landing dust poofs
interface DustPoof {
  x: number;
  y: number;
  particles: { x: number; y: number; vx: number; vy: number; size: number; life: number }[];
  life: number;
}
const dustPoofs: DustPoof[] = [];

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

export function addDustPoof(x: number, y: number, intensity: number = 1): void {
  const particles: DustPoof["particles"] = [];
  const count = Math.floor(6 + intensity * 4);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI + Math.random() * 0.5; // Spread upward in arc
    const speed = (0.5 + Math.random() * 1) * intensity;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed * 2,
      vy: -Math.sin(angle) * speed - 0.5,
      size: 2 + Math.random() * 3,
      life: 1,
    });
  }

  dustPoofs.push({ x, y, particles, life: 1 });
}

export function addCherryBlossoms(width: number, _height: number, count: number): void {
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

// Store screen dimensions for particle systems
let screenWidth = 400;
let screenHeight = 600;

export function initAmbientEffects(width: number, height: number): void {
  screenWidth = width;
  screenHeight = height;

  // Initialize ambient particles if empty
  if (ambientParticles.length === 0) {
    for (let i = 0; i < 20; i++) {
      ambientParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.12 - 0.06, // Gentle upward drift
        size: 2 + Math.random() * 2.5,
        opacity: 0.25 + Math.random() * 0.2, // Reduced base opacity
        phase: Math.random() * Math.PI * 2,
        life: Math.random(), // Start at random point in lifecycle
        lifeSpeed: 0.003 + Math.random() * 0.004, // Slow fade
        fadingIn: Math.random() > 0.5,
      });
    }
  }

  // Initialize fireflies if empty (fewer for cozy vibe)
  if (fireflies.length === 0) {
    for (let i = 0; i < 6; i++) {
      fireflies.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.7,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        glowPhase: Math.random() * Math.PI * 2,
        glowSpeed: 0.008 + Math.random() * 0.012, // Slower, dreamier glow
        size: 2 + Math.random() * 1.5,
      });
    }
  }

  // Initialize rain drops if empty
  if (rainDrops.length === 0) {
    for (let i = 0; i < 60; i++) {
      rainDrops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 10 + Math.random() * 15,
        speed: 3 + Math.random() * 2,
        opacity: 0.1 + Math.random() * 0.2,
      });
    }
  }

  // Initialize warmth wisps if empty
  if (warmthWisps.length === 0) {
    for (let i = 0; i < 12; i++) {
      warmthWisps.push({
        x: Math.random() * width,
        y: height * 0.5 + Math.random() * height * 0.5,
        size: 50 + Math.random() * 60,
        opacity: 0.12 + Math.random() * 0.1,
        speed: 0.15 + Math.random() * 0.12,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.006 + Math.random() * 0.006,
      });
    }
  }
}

export function updateEasterEggs(dt: number): void {
  // Update ambient particles
  for (const p of ambientParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.phase += 0.02 * dt;

    // Update life (fade in/out)
    if (p.fadingIn) {
      p.life += p.lifeSpeed * dt;
      if (p.life >= 1) {
        p.life = 1;
        p.fadingIn = false;
      }
    } else {
      p.life -= p.lifeSpeed * dt;
      if (p.life <= 0) {
        // Respawn at new random position
        p.life = 0;
        p.fadingIn = true;
        p.x = Math.random() * screenWidth;
        p.y = Math.random() * screenHeight;
        p.vx = (Math.random() - 0.5) * 0.2;
        p.vy = (Math.random() - 0.5) * 0.12 - 0.06;
      }
    }

    // Gentle wandering
    p.vx += (Math.random() - 0.5) * 0.015 * dt;
    p.vy += (Math.random() - 0.5) * 0.015 * dt;

    // Keep velocity small
    p.vx *= 0.99;
    p.vy *= 0.99;

    // Wrap around screen
    if (p.x < 0) p.x = screenWidth;
    if (p.x > screenWidth) p.x = 0;
    if (p.y < 0) p.y = screenHeight;
    if (p.y > screenHeight) p.y = 0;
  }

  // Update fireflies (slower, dreamier movement)
  for (const f of fireflies) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.glowPhase += f.glowSpeed * dt;

    // Very gentle wandering
    f.vx += (Math.random() - 0.5) * 0.015 * dt;
    f.vy += (Math.random() - 0.5) * 0.015 * dt;

    // Keep velocity very small for lazy drifting
    const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (speed > 0.25) {
      f.vx *= 0.25 / speed;
      f.vy *= 0.25 / speed;
    }

    // Wrap around screen
    if (f.x < 0) f.x = screenWidth;
    if (f.x > screenWidth) f.x = 0;
    if (f.y < 0) f.y = screenHeight * 0.7;
    if (f.y > screenHeight * 0.7) f.y = 0;
  }

  // Update rain drops
  for (const r of rainDrops) {
    r.y += r.speed * dt;
    r.x -= 0.5 * dt; // Slight angle

    // Reset when off screen
    if (r.y > screenHeight) {
      r.y = -r.length;
      r.x = Math.random() * screenWidth;
    }
    if (r.x < 0) r.x = screenWidth;
  }

  // Update warmth wisps
  for (const w of warmthWisps) {
    w.y -= w.speed * dt;
    w.wobblePhase += w.wobbleSpeed * dt;
    w.x += Math.sin(w.wobblePhase) * 0.4 * dt;

    // Fade out as it rises
    if (w.y < screenHeight * 0.4) {
      w.opacity -= 0.0008 * dt;
    }

    // Reset when faded or off screen
    if (w.y < -w.size || w.opacity <= 0) {
      w.y = screenHeight + Math.random() * 30;
      w.x = Math.random() * screenWidth;
      w.opacity = 0.12 + Math.random() * 0.1;
      w.wobblePhase = Math.random() * Math.PI * 2;
    }
  }

  // Update dust poofs
  for (let i = dustPoofs.length - 1; i >= 0; i--) {
    const poof = dustPoofs[i];
    poof.life -= 0.02 * dt;

    for (const p of poof.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.02 * dt; // Slight gravity
      p.vx *= 0.98; // Friction
      p.life -= 0.025 * dt;
    }

    if (poof.life <= 0) {
      dustPoofs.splice(i, 1);
    }
  }

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
    // Cozy blue night mode gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#1a2a4a"); // Deep night blue
    gradient.addColorStop(0.5, "#162040"); // Darker blue
    gradient.addColorStop(1, "#0f1628"); // Deep night
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Twinkling stars with animation
    const time = Date.now() * 0.001;
    for (let i = 0; i < 40; i++) {
      const starX = (i * 137 + 20) % width;
      const starY = (i * 89 + 10) % (height * 0.6);
      const twinkle = 0.4 + 0.6 * Math.sin(time * (1.5 + (i % 5) * 0.3) + i);
      const size = 1 + (i % 2) * 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.8})`;
      ctx.beginPath();
      ctx.arc(starX, starY, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Golden accent stars - larger and brighter
    for (let i = 0; i < 8; i++) {
      const starX = (i * 193 + 80) % width;
      const starY = (i * 67 + 40) % (height * 0.45);
      const twinkle = 0.6 + 0.4 * Math.sin(time * 2 + i * 1.5);
      ctx.fillStyle = `rgba(255, 220, 120, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(starX, starY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Star glow
      ctx.fillStyle = `rgba(255, 220, 120, ${twinkle * 0.3})`;
      ctx.beginPath();
      ctx.arc(starX, starY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fireflies - glowing wandering lights
    for (const f of fireflies) {
      const glow = 0.3 + 0.7 * Math.sin(f.glowPhase);
      // Outer glow
      const glowGradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 4);
      glowGradient.addColorStop(0, `rgba(180, 255, 150, ${glow * 0.6})`);
      glowGradient.addColorStop(0.5, `rgba(150, 255, 100, ${glow * 0.2})`);
      glowGradient.addColorStop(1, "rgba(100, 200, 80, 0)");
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 4, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.fillStyle = `rgba(220, 255, 200, ${glow})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft rain on window
    ctx.strokeStyle = "rgba(150, 180, 220, 0.3)";
    ctx.lineWidth = 1;
    for (const r of rainDrops) {
      ctx.globalAlpha = r.opacity;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 2, r.y + r.length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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

  // Ambient particles - soft floating dust motes (day mode only)
  if (!nightMode) {
    for (const p of ambientParticles) {
      const shimmer = 0.7 + 0.3 * Math.sin(p.phase);
      const alpha = p.opacity * shimmer * p.life; // life controls fade in/out

      if (alpha < 0.01) continue; // Skip nearly invisible particles

      // Outer glow
      ctx.fillStyle = `rgba(255, 255, 240, ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Warmth wisps - gentle steam-like rising effect (day mode only)
    for (const w of warmthWisps) {
      const gradient = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.size);
      // Soft cream/white tones - less warm
      gradient.addColorStop(0, `rgba(255, 252, 245, ${w.opacity * 1.4})`);
      gradient.addColorStop(0.3, `rgba(255, 250, 240, ${w.opacity * 0.9})`);
      gradient.addColorStop(0.6, `rgba(250, 248, 235, ${w.opacity * 0.4})`);
      gradient.addColorStop(1, "rgba(245, 243, 230, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Draw big muted day number watermark for daily mode
function drawDailyWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  containerY: number,
  dayNumber: number,
  nightMode: boolean,
): void {
  const text = `#${dayNumber}`;

  // Large, soft watermark positioned above container, slightly overlapping top edge
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom"; // Align bottom of text to position
  ctx.font = 'bold 200px "Segoe UI", sans-serif';

  // Gentle but visible - serves as the day indicator
  if (nightMode) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  } else {
    ctx.fillStyle = "rgba(60, 100, 50, 0.12)";
  }

  // Position so bottom of text overlaps top of container by ~40px
  const watermarkY = containerY + 40;
  ctx.fillText(text, width / 2, watermarkY);

  ctx.restore();
}

export function drawContainer(
  context: CanvasContext,
  container: Container,
  nightMode: boolean = false,
): void {
  const { ctx } = context;
  const { x, y, width, height, wallThickness, overflowLine } = container;

  if (nightMode) {
    // Night mode - cozy wooden container with warm lighting

    // Warm shadow
    ctx.fillStyle = "rgba(20, 15, 30, 0.3)";
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, width, height, 12);
    ctx.fill();

    // Container background - cozy dark blue with warm tint
    const innerGradient = ctx.createLinearGradient(x, y, x, y + height);
    innerGradient.addColorStop(0, "rgba(35, 45, 65, 0.9)");
    innerGradient.addColorStop(1, "rgba(25, 35, 55, 0.95)");
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.roundRect(x + wallThickness, y, width - wallThickness * 2, height - wallThickness, 8);
    ctx.fill();

    // Cozy warm wood walls
    const wallGradient = ctx.createLinearGradient(x, y, x + wallThickness, y);
    wallGradient.addColorStop(0, "#5D4E3C"); // Dark warm wood
    wallGradient.addColorStop(0.5, "#6B5A47");
    wallGradient.addColorStop(1, "#5D4E3C");

    ctx.fillStyle = wallGradient;
    ctx.strokeStyle = "#4A3D2E";
    ctx.lineWidth = 2;

    // Left wall
    ctx.beginPath();
    ctx.roundRect(x, y, wallThickness, height, [12, 0, 0, 12]);
    ctx.fill();
    ctx.stroke();

    // Right wall
    const rightWallGradient = ctx.createLinearGradient(x + width - wallThickness, y, x + width, y);
    rightWallGradient.addColorStop(0, "#5D4E3C");
    rightWallGradient.addColorStop(0.5, "#6B5A47");
    rightWallGradient.addColorStop(1, "#5D4E3C");
    ctx.fillStyle = rightWallGradient;
    ctx.beginPath();
    ctx.roundRect(x + width - wallThickness, y, wallThickness, height, [0, 12, 12, 0]);
    ctx.fill();
    ctx.stroke();

    // Bottom wall
    const bottomWallGradient = ctx.createLinearGradient(
      x,
      y + height - wallThickness,
      x,
      y + height,
    );
    bottomWallGradient.addColorStop(0, "#6B5A47");
    bottomWallGradient.addColorStop(1, "#4A3D2E");
    ctx.fillStyle = bottomWallGradient;
    ctx.beginPath();
    ctx.roundRect(x, y + height - wallThickness, width, wallThickness, [0, 0, 12, 12]);
    ctx.fill();
    ctx.stroke();

    // Danger line - soft amber glow
    ctx.strokeStyle = "rgba(255, 180, 100, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(x + wallThickness, overflowLine);
    ctx.lineTo(x + width - wallThickness, overflowLine);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Day mode - original matcha green

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
    const bottomWallGradient = ctx.createLinearGradient(
      x,
      y + height - wallThickness,
      x,
      y + height,
    );
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
  blinkState: number = 0,
  lookDirection: number = 0,
): void {
  const scale = radius / 50; // Scale face features based on size
  const eyeSpacing = 12 * scale;
  const eyeY = cy - 5 * scale;
  const eyeSize = 4 * scale;

  const squishOffset = squishAmount * 5 * scale;
  const faceY = eyeY + squishOffset;

  // Look direction offset for pupils
  const lookOffset = lookDirection * eyeSize * 0.8;

  ctx.fillStyle = "#4A4A4A";
  ctx.strokeStyle = "#4A4A4A";
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.lineCap = "round";

  // Helper to draw blinking eyes (used by happy and other emotions)
  const drawBlinkingEyes = (leftX: number, rightX: number, y: number, openSize: number) => {
    if (blinkState > 0.3) {
      // Eyes closed - draw curved lines
      ctx.beginPath();
      ctx.arc(leftX + lookOffset, y, openSize, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightX + lookOffset, y, openSize, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (blinkState > 0) {
      // Eyes half closed
      const closeAmount = blinkState / 0.3;
      ctx.beginPath();
      ctx.arc(
        leftX + lookOffset,
        y,
        openSize,
        Math.PI * (0.1 + 0.05 * closeAmount),
        Math.PI * (0.9 - 0.05 * closeAmount),
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        rightX + lookOffset,
        y,
        openSize,
        Math.PI * (0.1 + 0.05 * closeAmount),
        Math.PI * (0.9 - 0.05 * closeAmount),
      );
      ctx.stroke();
    } else {
      // Eyes open - normal happy eyes
      ctx.beginPath();
      ctx.arc(leftX + lookOffset, y, openSize, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightX + lookOffset, y, openSize, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
  };

  switch (emotion) {
    case "happy":
      drawBlinkingEyes(cx - eyeSpacing, cx + eyeSpacing, faceY, eyeSize * 1.2);
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

    case "yawning":
      // Closed eyes (like sleepy but slightly different)
      ctx.lineWidth = Math.max(2, 2.5 * scale);
      ctx.lineCap = "round";

      // Left eye - gentle curved closed eye, slightly scrunched
      ctx.beginPath();
      ctx.arc(cx - eyeSpacing, faceY + eyeSize * 0.2, eyeSize * 0.9, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();

      // Right eye - gentle curved closed eye, slightly scrunched
      ctx.beginPath();
      ctx.arc(cx + eyeSpacing, faceY + eyeSize * 0.2, eyeSize * 0.9, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();

      // Wide open yawning mouth (oval)
      ctx.fillStyle = "#4A4A4A";
      ctx.beginPath();
      ctx.ellipse(cx, faceY + 10 * scale, 5 * scale, 7 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiny tongue
      ctx.fillStyle = "#E8A0A0";
      ctx.beginPath();
      ctx.ellipse(cx, faceY + 14 * scale, 3 * scale, 2 * scale, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#4A4A4A";
      break;

    case "stressed":
      // Stressed/worried face - spiral eyes and wobbly mouth
      ctx.lineWidth = Math.max(1.5, 2 * scale);
      ctx.lineCap = "round";

      // Spiral eyes (dizzy/stressed look)
      const spiralSize = eyeSize * 1.2;
      for (let side = -1; side <= 1; side += 2) {
        const eyeX = cx + side * eyeSpacing;
        ctx.beginPath();
        // Draw a small spiral
        for (let i = 0; i < 2.5; i += 0.1) {
          const angle = i * Math.PI;
          const r = spiralSize * (0.2 + i * 0.3);
          const px = eyeX + Math.cos(angle) * r;
          const py = faceY + Math.sin(angle) * r;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }

      // Worried eyebrows (angled up in middle)
      ctx.beginPath();
      ctx.moveTo(cx - eyeSpacing - eyeSize, faceY - eyeSize * 1.8);
      ctx.lineTo(cx - eyeSpacing + eyeSize * 0.5, faceY - eyeSize * 2.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + eyeSpacing + eyeSize, faceY - eyeSize * 1.8);
      ctx.lineTo(cx + eyeSpacing - eyeSize * 0.5, faceY - eyeSize * 2.3);
      ctx.stroke();

      // Wobbly/wavy worried mouth
      ctx.beginPath();
      ctx.moveTo(cx - 6 * scale, faceY + 8 * scale);
      ctx.quadraticCurveTo(cx - 3 * scale, faceY + 10 * scale, cx, faceY + 8 * scale);
      ctx.quadraticCurveTo(cx + 3 * scale, faceY + 6 * scale, cx + 6 * scale, faceY + 8 * scale);
      ctx.stroke();
      break;
  }

  // Blush - extra big and rosy when squished or stressed!
  const isSquished = emotion === "squished";
  const isStressed = emotion === "stressed";
  const blushOpacity =
    emotion === "surprised" || isSquished || emotion === "love" || isStressed ? 0.7 : 0.35;
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

  // Draw dust poofs
  for (const poof of dustPoofs) {
    for (const p of poof.particles) {
      if (p.life <= 0) continue;
      ctx.fillStyle = `rgba(220, 210, 190, ${p.life * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawMochi(context: CanvasContext, mochi: Mochi, isPreview: boolean = false): void {
  const { ctx } = context;
  const {
    points,
    color,
    cx,
    cy,
    radius,
    baseRadius,
    emotion,
    squishAmount,
    merging,
    blinkState,
    lookDirection,
  } = mochi;

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

  // Warm ambient glow around mochi
  if (!isPreview && !merging) {
    const glowRadius = baseRadius * 1.5;
    const glowGradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, glowRadius);
    glowGradient.addColorStop(0, `${color.primary}40`); // 25% opacity of primary color
    glowGradient.addColorStop(0.5, `${color.primary}15`);
    glowGradient.addColorStop(1, `${color.primary}00`);
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

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
    drawFace(ctx, cx, cy, radius, emotion, squishAmount, color.cheek, blinkState, lookDirection);
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
  const panelY = 100; // Below score/name/best area
  const panelWidth = 180;
  const maxEntries = 5;

  // Calculate fade zone - start fading 40px before container top
  const fadeStartY = container.y - 40;
  const fadeEndY = container.y + 20;

  // Helper to get opacity based on Y position
  const getYOpacity = (y: number): number => {
    if (y < fadeStartY) return 1;
    if (y > fadeEndY) return 0;
    return 1 - (y - fadeStartY) / (fadeEndY - fadeStartY);
  };

  // Title
  const titleOpacity = getYOpacity(panelY);
  if (titleOpacity > 0) {
    ctx.fillStyle = `rgba(60, 90, 50, ${0.65 * titleOpacity})`;
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
      ctx.fillStyle = `rgba(60, 90, 50, ${0.55 * opacity1})`;
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillText("no scores yet...", panelX, emptyY1);
    }
    if (opacity2 > 0) {
      ctx.fillStyle = `rgba(60, 90, 50, ${0.55 * opacity2})`;
      ctx.fillText("be the first!", panelX, emptyY2);
    }
  } else {
    // Find player's rank in full leaderboard
    const playerRank = leaderboard.findIndex((e) => e.name === playerName);
    const playerInTop = playerRank >= 0 && playerRank < maxEntries - 1; // Top 4

    // Build display list: top entries + player if not in top
    const displayEntries: {
      entry: LeaderboardEntry;
      rank: number;
      isPlayer: boolean;
      showGap: boolean;
    }[] = [];

    // How many top entries to show
    const topCount = playerInTop ? maxEntries : maxEntries - 1;

    for (let i = 0; i < Math.min(topCount, leaderboard.length); i++) {
      displayEntries.push({
        entry: leaderboard[i],
        rank: i + 1,
        isPlayer: leaderboard[i].name === playerName,
        showGap: false,
      });
    }

    // Add player's entry if not in top entries
    if (!playerInTop && playerRank >= 0) {
      displayEntries.push({
        entry: leaderboard[playerRank],
        rank: playerRank + 1,
        isPlayer: true,
        showGap: playerRank > topCount, // Show "..." gap if there's a gap
      });
    }

    let yOffset = 0;
    for (let i = 0; i < displayEntries.length; i++) {
      const { entry, rank, isPlayer, showGap } = displayEntries[i];

      // Show gap indicator before player's entry if needed
      if (showGap) {
        const gapY = panelY + 26 + yOffset * 26;
        const gapOpacity = getYOpacity(gapY);
        if (gapOpacity > 0) {
          ctx.fillStyle = `rgba(60, 90, 50, ${0.45 * gapOpacity})`;
          ctx.font = '12px "Segoe UI", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("···", panelX + panelWidth / 2, gapY);
          ctx.textAlign = "left";
        }
        yOffset++;
      }

      const y = panelY + 26 + yOffset * 26;
      const yOpacity = getYOpacity(y);

      // Skip if fully faded
      if (yOpacity <= 0) {
        yOffset++;
        continue;
      }

      // Subtle highlight for player's entry
      if (isPlayer && yOpacity > 0) {
        ctx.fillStyle = `rgba(140, 170, 130, ${0.25 * yOpacity})`;
        ctx.beginPath();
        ctx.roundRect(panelX - 6, y - 14, panelWidth, 22, 6);
        ctx.fill();
      }

      // Rank - more visible
      const baseOpacity = isPlayer ? 0.85 : 0.6;
      ctx.fillStyle = `rgba(60, 90, 50, ${baseOpacity * yOpacity})`;
      ctx.font = isPlayer ? '600 14px "Segoe UI", sans-serif' : '14px "Segoe UI", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(`${rank}`, panelX, y);

      // Name (truncated)
      const displayName = entry.name.length > 12 ? entry.name.slice(0, 11) + "…" : entry.name;
      ctx.fillText(displayName, panelX + 26, y);

      // Score - aligned right
      ctx.textAlign = "right";
      ctx.fillText(entry.score.toString(), panelX + panelWidth - 10, y);

      yOffset++;
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

  // Mode toggle switch (next to score on first line)
  const { gameMode } = gameState;
  const scoreWidth = ctx.measureText(scoreText).width;
  const toggleX = 20 + scoreWidth + 50; // After score with some spacing
  const toggleY = 28;
  drawModeToggle(ctx, toggleX, toggleY, gameMode === "daily", gameState.nightMode);

  // Info icon next to toggle (explains daily mode)
  const infoX = toggleX + 48;
  const infoY = toggleY;
  const infoRadius = 10;
  const infoDx = mouseX - infoX;
  const infoDy = mouseY - infoY;
  const isHoveringInfo = Math.sqrt(infoDx * infoDx + infoDy * infoDy) < infoRadius + 5;
  const showInfoTooltip = isHoveringInfo || gameState.infoTooltipTimer > 0;

  // Draw info icon
  ctx.save();
  ctx.globalAlpha = showInfoTooltip ? 1 : 0.5;
  ctx.fillStyle = gameState.nightMode ? "rgba(150, 180, 200, 0.8)" : "rgba(100, 140, 90, 0.8)";
  ctx.beginPath();
  ctx.arc(infoX, infoY, infoRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gameState.nightMode ? "#E8F0F8" : "#FFFFFF";
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("?", infoX, infoY + 5);
  ctx.restore();

  // Store tooltip info for drawing later (higher z-index)
  const infoTooltipData = showInfoTooltip
    ? { x: infoX, y: infoY + 28, gameMode, nightMode: gameState.nightMode }
    : null;

  // Player name - underneath the score
  if (playerName) {
    ctx.fillStyle = "rgba(90, 120, 80, 0.5)";
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText(playerName, 20, 52);
  }

  // Best score
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = "#6B8A5E";
  ctx.fillText(`Best: ${highScore}`, 20, 72);

  // Next mochi preview - position changes based on screen size
  let previewX: number;
  let previewY: number;
  let labelOffset: number;

  if (isSmallScreen) {
    // Top right corner on small screens, well below the sun/moon toggle
    previewX = width - 55;
    previewY = 160;
    labelOffset = 45;
  } else {
    // Left of container on larger screens
    previewX = container.x - 50;
    previewY = container.y + 50;
    labelOffset = 45;
  }

  // Soft, cozy "next" label
  ctx.fillStyle = "rgba(90, 120, 80, 0.5)";
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("next", previewX, previewY - labelOffset);

  // Preview background - very soft, subtle circle
  ctx.fillStyle = "rgba(210, 225, 200, 0.4)";
  ctx.beginPath();
  ctx.arc(previewX, previewY, 35, 0, Math.PI * 2);
  ctx.fill();

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
    const { gameMode, dailyChallenge } = gameState;

    // Animation and display state
    const { hoveredButton, buttonHoverProgress, modalAnimationProgress, displayedScore } =
      gameState;

    // Easing functions
    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    // Semi-transparent matcha overlay (fades in)
    const overlayAlpha = Math.min(0.75, modalAnimationProgress * 0.75);
    ctx.fillStyle = `rgba(60, 80, 50, ${overlayAlpha})`;
    ctx.fillRect(0, 0, width, context.height);

    // Check if daily already played (for layout calculation)
    const dailyAlreadyPlayed = dailyChallenge?.played === true;

    // Get highest tier reached
    const highestTier =
      gameMode === "daily" && dailyChallenge?.played
        ? dailyChallenge.highestTier
        : gameState.highestTierReached;

    // Panel setup with bounce animation
    const panelX = width / 2;
    const panelY = context.height / 2;
    // Increased height to fit tier bar and mascot
    const panelHeight = gameMode === "daily" ? 340 : dailyAlreadyPlayed ? 305 : 300;

    // Set text alignment before save so it persists
    ctx.textAlign = "center";

    // Apply bounce scale animation
    const scaleProgress = easeOutBack(Math.min(1, modalAnimationProgress * 1.2));
    ctx.save();
    ctx.translate(panelX, panelY);
    ctx.scale(scaleProgress, scaleProgress);
    ctx.translate(-panelX, -panelY);

    // Panel background
    ctx.fillStyle = "rgba(230, 240, 225, 0.95)";
    ctx.strokeStyle = "#7A9B6D";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(panelX - 170, panelY - 110, 340, panelHeight, 16);
    ctx.fill();
    ctx.stroke();

    // Mini mochi mascot showing highest tier achieved (top right of panel)
    const mascotX = panelX + 125;
    const mascotY = panelY - 60;
    const mascotSize = 26;
    const mascotBounce = Math.sin(Date.now() / 300) * 3;

    // Check if mouse is hovering over mascot (for blush effect)
    const mascotDx = mouseX - mascotX;
    const mascotDy = mouseY - (mascotY + mascotBounce);
    const isHoveringMascot = Math.sqrt(mascotDx * mascotDx + mascotDy * mascotDy) < mascotSize + 10;

    // Get colors for the highest tier achieved
    const tierData = mochiTiers[highestTier];
    const mascotHappy = highestTier >= 5 || displayedScore >= 1000;

    // Draw mascot body with tier colors
    const mascotGradient = ctx.createRadialGradient(
      mascotX - mascotSize * 0.2,
      mascotY + mascotBounce - mascotSize * 0.2,
      0,
      mascotX,
      mascotY + mascotBounce,
      mascotSize * 1.2,
    );
    mascotGradient.addColorStop(0, tierData.color.highlight);
    mascotGradient.addColorStop(0.3, tierData.color.primary);
    mascotGradient.addColorStop(1, tierData.color.secondary);
    ctx.fillStyle = mascotGradient;
    ctx.beginPath();
    ctx.arc(mascotX, mascotY + mascotBounce, mascotSize, 0, Math.PI * 2);
    ctx.fill();

    // Mascot face - adjust colors for dark tiers
    const isDarkTier = highestTier >= 8; // Chocolate, Black Sesame, Kuromame are dark
    const faceColor = isDarkTier ? "#E8E4E0" : "#3D3530";
    const eyeY = mascotY + mascotBounce - 3;

    ctx.strokeStyle = faceColor;
    ctx.fillStyle = faceColor;
    ctx.lineWidth = 1.5;

    // Eyes (happy = curved, shy/blushing = ^^ when hovered)
    if (isHoveringMascot) {
      // Shy happy eyes when hovered ^^
      ctx.beginPath();
      ctx.arc(mascotX - 7, eyeY, 3.5, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mascotX + 7, eyeY, 3.5, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    } else if (mascotHappy) {
      ctx.beginPath();
      ctx.arc(mascotX - 7, eyeY, 3.5, Math.PI, 0, true);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mascotX + 7, eyeY, 3.5, Math.PI, 0, true);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(mascotX - 7, eyeY, 2.5, 0, Math.PI * 2);
      ctx.arc(mascotX + 7, eyeY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cheeks - blush more when hovered!
    const blushIntensity = isHoveringMascot ? 0.9 : 0.6;
    const blushSize = isHoveringMascot ? 1.3 : 1;
    ctx.fillStyle = tierData.color.cheek;
    ctx.globalAlpha = blushIntensity;
    ctx.beginPath();
    ctx.ellipse(
      mascotX - 14,
      mascotY + mascotBounce + 4,
      5 * blushSize,
      3.5 * blushSize,
      0,
      0,
      Math.PI * 2,
    );
    ctx.ellipse(
      mascotX + 14,
      mascotY + mascotBounce + 4,
      5 * blushSize,
      3.5 * blushSize,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;

    // Mouth - small shy smile when hovered
    ctx.strokeStyle = faceColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isHoveringMascot) {
      // Small shy smile
      ctx.arc(mascotX, mascotY + mascotBounce + 6, 3, 0.2 * Math.PI, 0.8 * Math.PI);
    } else if (mascotHappy) {
      ctx.arc(mascotX, mascotY + mascotBounce + 5, 4, 0.1 * Math.PI, 0.9 * Math.PI);
    } else {
      ctx.moveTo(mascotX - 3, mascotY + mascotBounce + 7);
      ctx.lineTo(mascotX + 3, mascotY + mascotBounce + 7);
    }
    ctx.stroke();

    // Title - show day number for daily mode (centered in panel)
    ctx.fillStyle = "#3D5A3A";
    if (gameMode === "daily" && dailyChallenge) {
      const dayNum = getDayNumber(dailyChallenge.date);
      ctx.font = 'bold 28px "Segoe UI", sans-serif';
      ctx.fillText(`Mochii #${dayNum}`, panelX, panelY - 70);
      ctx.font = '18px "Segoe UI", sans-serif';
      ctx.fillStyle = "#6B8A5E";
      ctx.fillText("Daily Challenge", panelX, panelY - 47);
    } else {
      ctx.font = 'bold 32px "Segoe UI", sans-serif';
      ctx.fillText("Game Over", panelX, panelY - 60);
    }

    // Animated score counter
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillStyle = "#4A6741";
    ctx.fillText(`Score: ${Math.floor(displayedScore).toLocaleString()}`, panelX, panelY - 12);

    // Tier progression bar
    const tierBarY = panelY + 18;
    const tierBarWidth = 280;
    const tierBarX = panelX - tierBarWidth / 2;
    const tierCount = 11; // Total tiers (0-10)
    const dotSize = 8;
    const dotSpacing = tierBarWidth / (tierCount - 1);

    // Draw tier progression
    for (let i = 0; i < tierCount; i++) {
      const dotX = tierBarX + i * dotSpacing;
      const reached = i <= highestTier;
      const isHighest = i === highestTier;

      // Animate dots appearing
      const dotDelay = i * 0.05;
      const dotProgress = Math.max(0, Math.min(1, (modalAnimationProgress - dotDelay) * 2));

      if (dotProgress > 0) {
        ctx.save();
        ctx.globalAlpha = dotProgress;

        // Get tier color
        const tierColors = [
          "#F8F4EC",
          "#F8D7DD",
          "#F8E8A0",
          "#F4A0A8",
          "#F8C878",
          "#A8C890",
          "#C8A8D0",
          "#C8A888",
          "#8B6850",
          "#5A5550",
          "#3A3530",
        ];

        if (reached) {
          // Filled dot with tier color
          const pulseScale = isHighest ? 1 + Math.sin(Date.now() / 200) * 0.15 : 1;
          ctx.fillStyle = tierColors[i];
          ctx.strokeStyle = "rgba(60, 80, 50, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(dotX, tierBarY, (dotSize / 2) * pulseScale * dotProgress, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Empty dot
          ctx.fillStyle = "rgba(200, 200, 190, 0.5)";
          ctx.beginPath();
          ctx.arc(dotX, tierBarY, (dotSize / 2 - 1) * dotProgress, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    // Tier label
    const tierNames = [
      "Vanilla",
      "Sakura",
      "Yuzu",
      "Strawberry",
      "Mango",
      "Matcha",
      "Taro",
      "Hojicha",
      "Chocolate",
      "Sesame",
      "Kuromame",
    ];
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = "#6B8A5E";
    ctx.fillText(`Highest: ${tierNames[highestTier] || "Vanilla"}`, panelX, tierBarY + 22);

    ctx.restore(); // Restore from scale transform

    // Ensure text alignment is centered for buttons
    ctx.textAlign = "center";

    // Button styling helper - larger, more comfortable buttons with hover effects
    const drawButton = (
      text: string,
      y: number,
      style: "primary" | "secondary" | "tertiary" = "secondary",
      buttonId: "daily" | "freeplay" | "share",
    ) => {
      const isHovered = hoveredButton === buttonId;
      const hoverAmount = isHovered ? easeOutCubic(buttonHoverProgress) : 0;

      // Animated scale on hover
      const baseWidth = 180;
      const baseHeight = 44;
      const scaleBoost = hoverAmount * 0.05;
      const btnWidth = baseWidth * (1 + scaleBoost);
      const btnHeight = baseHeight * (1 + scaleBoost);

      ctx.save();
      ctx.textAlign = "center"; // Ensure centered text in buttons

      // Different styles for visual hierarchy with hover enhancements
      if (style === "primary") {
        // Primary: solid green, gets brighter on hover
        const brightness = 1 + hoverAmount * 0.15;
        const r = Math.min(255, Math.round(122 * brightness));
        const g = Math.min(255, Math.round(155 * brightness));
        const b = Math.min(255, Math.round(109 * brightness));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.shadowColor = `rgba(0, 0, 0, ${0.15 + hoverAmount * 0.1})`;
        ctx.shadowBlur = 4 + hoverAmount * 6;
        ctx.shadowOffsetY = 2 + hoverAmount * 2;
      } else if (style === "secondary") {
        // Secondary: transparent, fills in on hover
        const bgAlpha = 0.25 + hoverAmount * 0.35;
        ctx.fillStyle = `rgba(122, 155, 109, ${bgAlpha})`;
        if (isHovered) {
          ctx.shadowColor = `rgba(122, 155, 109, ${hoverAmount * 0.3})`;
          ctx.shadowBlur = hoverAmount * 8;
          ctx.shadowOffsetY = hoverAmount * 2;
        }
      } else {
        // Tertiary: subtle, becomes more visible on hover
        const bgAlpha = 0.15 + hoverAmount * 0.25;
        ctx.fillStyle = `rgba(122, 155, 109, ${bgAlpha})`;
        if (isHovered) {
          ctx.shadowColor = `rgba(122, 155, 109, ${hoverAmount * 0.2})`;
          ctx.shadowBlur = hoverAmount * 6;
        }
      }

      ctx.beginPath();
      ctx.roundRect(panelX - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 12);
      ctx.fill();

      // Reset shadow before border
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Border for secondary/tertiary buttons - gets more prominent on hover
      if (style !== "primary") {
        const borderAlpha = 0.4 + hoverAmount * 0.3;
        ctx.strokeStyle = `rgba(122, 155, 109, ${borderAlpha})`;
        ctx.lineWidth = 1.5 + hoverAmount * 0.5;
        ctx.stroke();
      }

      // Text color - white for primary, darker green for others (with hover adjustment)
      if (style === "primary") {
        ctx.fillStyle = "#FFFFFF";
      } else {
        // Text gets slightly darker/more prominent on hover
        const textAlpha = 1 - hoverAmount * 0.1;
        ctx.fillStyle = `rgba(60, 85, 52, ${textAlpha + hoverAmount * 0.1})`;
      }

      // Font size slightly increases on hover
      const baseFontSize = style === "primary" ? 16 : 15;
      const fontSize = baseFontSize + hoverAmount * 1;
      ctx.font =
        style === "primary"
          ? `bold ${fontSize}px "Segoe UI", sans-serif`
          : `${fontSize}px "Segoe UI", sans-serif`;
      ctx.fillText(text, panelX, y + 6);

      ctx.restore();
    };

    // Buttons with more spacing (adjusted for tier bar)
    const dailyBtnY = panelY + 70;
    const practiceBtnY = panelY + 125;
    const shareBtnY = panelY + 180;

    if (dailyAlreadyPlayed) {
      // Daily already completed - show friendly message instead of confusing button
      ctx.fillStyle = "#7A9B6D";
      ctx.font = '14px "Segoe UI", sans-serif';
      ctx.fillText("✓ Today's daily complete!", panelX, dailyBtnY - 5);
      ctx.fillStyle = "#8BA37E";
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillText("Come back tomorrow for a new challenge", panelX, dailyBtnY + 12);

      // Free Play button - moved up slightly and is primary
      drawButton("Free Play", practiceBtnY, "primary", "freeplay");
    } else {
      // Daily button - primary if in daily mode, secondary otherwise
      const dailyText =
        gameMode === "daily" && dailyChallenge?.played ? "Daily ✓" : "Daily Challenge";
      drawButton(dailyText, dailyBtnY, gameMode === "daily" ? "primary" : "secondary", "daily");

      // Free Play button - primary if in practice mode
      drawButton(
        "Free Play",
        practiceBtnY,
        gameMode === "practice" ? "primary" : "secondary",
        "freeplay",
      );
    }

    // Share button only for daily mode
    if (gameMode === "daily" && dailyChallenge) {
      const shareText = gameState.shareCopiedTimer > 0 ? "✓ Copied!" : "📋 Share";
      const shareStyle = gameState.shareCopiedTimer > 0 ? "primary" : "tertiary";
      drawButton(shareText, shareBtnY, shareStyle, "share");
    }
  }

  // Draw info tooltip LAST (highest z-index, overlaps everything)
  if (infoTooltipData) {
    const tooltipX = infoTooltipData.x;
    const tooltipY = infoTooltipData.y;
    const currentMode = infoTooltipData.gameMode;
    const isNight = infoTooltipData.nightMode;

    ctx.save();
    ctx.font = '12px "Segoe UI", sans-serif';

    // Multi-line tooltip content
    const lines = [
      currentMode === "daily"
        ? "▸ Daily: Same puzzle for all, once a day!"
        : "  Daily: Same puzzle for all, once a day!",
      currentMode === "practice"
        ? "▸ Free Play: Unlimited random practice"
        : "  Free Play: Unlimited random practice",
    ];

    const lineHeight = 20;
    const paddingLeft = 12;
    const paddingRight = 18;
    const paddingY = 10;
    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const tooltipWidth = maxLineWidth + paddingLeft + paddingRight;
    const tooltipHeight = lines.length * lineHeight + paddingY * 2;

    // Tooltip background with arrow
    ctx.fillStyle = isNight ? "rgba(30, 40, 55, 0.97)" : "rgba(50, 65, 45, 0.97)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    // Arrow pointing up
    ctx.beginPath();
    ctx.moveTo(tooltipX - 8, tooltipY);
    ctx.lineTo(tooltipX, tooltipY - 8);
    ctx.lineTo(tooltipX + 8, tooltipY);
    ctx.closePath();
    ctx.fill();

    // Rounded rectangle
    ctx.beginPath();
    ctx.roundRect(tooltipX - tooltipWidth / 2, tooltipY, tooltipWidth, tooltipHeight, 8);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Tooltip text
    ctx.textAlign = "left";
    const textX = tooltipX - tooltipWidth / 2 + paddingLeft;
    const textStartY = tooltipY + paddingY + 12; // 12 = approximate font ascent
    lines.forEach((line, i) => {
      const isCurrentMode = line.startsWith("▸");
      ctx.fillStyle = isCurrentMode ? "#90EE90" : "rgba(255, 255, 255, 0.7)";
      ctx.font = isCurrentMode ? 'bold 12px "Segoe UI", sans-serif' : '12px "Segoe UI", sans-serif';
      ctx.fillText(line, textX, textStartY + i * lineHeight);
    });

    ctx.restore();
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

// Toggle animation state
const toggleAnim = {
  knobPosition: 0, // 0 = daily (left), 1 = free play (right)
  targetPosition: 0,
  squish: 0, // Squish effect when switching
  bounce: 0,
};

// Draw mode toggle switch (mochi-inspired pill shape with animations)
function drawModeToggle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isDaily: boolean,
  nightMode: boolean,
): void {
  const toggleWidth = 70;
  const toggleHeight = 28;
  const knobRadius = 11;
  const padding = 4;

  // Animate knob position with spring physics
  toggleAnim.targetPosition = isDaily ? 0 : 1;
  const diff = toggleAnim.targetPosition - toggleAnim.knobPosition;
  toggleAnim.knobPosition += diff * 0.15;
  toggleAnim.bounce *= 0.85;
  toggleAnim.squish *= 0.9;

  // Trigger bounce when close to target
  if (Math.abs(diff) > 0.4) {
    toggleAnim.squish = 0.15;
  }

  ctx.save();

  // Soft outer glow
  const glowGradient = ctx.createRadialGradient(x, y, toggleWidth * 0.3, x, y, toggleWidth * 0.8);
  if (nightMode) {
    glowGradient.addColorStop(0, "rgba(100, 140, 180, 0.15)");
    glowGradient.addColorStop(1, "rgba(100, 140, 180, 0)");
  } else {
    glowGradient.addColorStop(0, "rgba(140, 180, 120, 0.2)");
    glowGradient.addColorStop(1, "rgba(140, 180, 120, 0)");
  }
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(x, y, toggleWidth * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Toggle track (pill shape) with inner shadow effect
  const trackGradient = ctx.createLinearGradient(x, y - toggleHeight / 2, x, y + toggleHeight / 2);
  if (nightMode) {
    trackGradient.addColorStop(0, "rgba(50, 70, 100, 0.8)");
    trackGradient.addColorStop(0.5, "rgba(60, 85, 120, 0.75)");
    trackGradient.addColorStop(1, "rgba(70, 95, 130, 0.8)");
  } else {
    trackGradient.addColorStop(0, "rgba(160, 185, 145, 0.85)");
    trackGradient.addColorStop(0.5, "rgba(175, 200, 160, 0.8)");
    trackGradient.addColorStop(1, "rgba(165, 190, 150, 0.85)");
  }

  ctx.fillStyle = trackGradient;
  ctx.beginPath();
  ctx.roundRect(
    x - toggleWidth / 2,
    y - toggleHeight / 2,
    toggleWidth,
    toggleHeight,
    toggleHeight / 2,
  );
  ctx.fill();

  // Inner shadow for depth
  const innerShadow = ctx.createLinearGradient(
    x,
    y - toggleHeight / 2,
    x,
    y - toggleHeight / 2 + 8,
  );
  innerShadow.addColorStop(0, "rgba(0, 0, 0, 0.12)");
  innerShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = innerShadow;
  ctx.beginPath();
  ctx.roundRect(
    x - toggleWidth / 2,
    y - toggleHeight / 2,
    toggleWidth,
    toggleHeight,
    toggleHeight / 2,
  );
  ctx.fill();

  // Soft border
  ctx.strokeStyle = nightMode ? "rgba(80, 110, 150, 0.6)" : "rgba(100, 140, 90, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Labels with better visibility
  ctx.font = '600 10px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Daily label
  const dailyAlpha = 0.4 + (1 - toggleAnim.knobPosition) * 0.4;
  ctx.fillStyle = nightMode
    ? `rgba(200, 230, 255, ${dailyAlpha})`
    : `rgba(50, 80, 40, ${dailyAlpha})`;
  ctx.fillText("D", x - toggleWidth / 2 + 13, y);

  // Free play label
  const freeAlpha = 0.4 + toggleAnim.knobPosition * 0.4;
  ctx.fillStyle = nightMode
    ? `rgba(200, 230, 255, ${freeAlpha})`
    : `rgba(50, 80, 40, ${freeAlpha})`;
  ctx.fillText("F", x + toggleWidth / 2 - 13, y);

  // Calculate animated knob position
  const leftX = x - toggleWidth / 2 + knobRadius + padding;
  const rightX = x + toggleWidth / 2 - knobRadius - padding;
  const knobX = leftX + (rightX - leftX) * toggleAnim.knobPosition;

  // Squish deformation
  const squishX = 1 + toggleAnim.squish * 0.3;
  const squishY = 1 - toggleAnim.squish * 0.2;

  // Knob shadow (soft, offset)
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(knobX + 1.5, y + 2, knobRadius * squishX, knobRadius * squishY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mochi knob gradient - interpolate colors based on position
  const dailyColor = { h: 110, s: 45, l: 65 }; // Green
  const freeColor = { h: 35, s: 30, l: 90 }; // Cream
  const t = toggleAnim.knobPosition;
  const h = dailyColor.h + (freeColor.h - dailyColor.h) * t;
  const s = dailyColor.s + (freeColor.s - dailyColor.s) * t;
  const l = dailyColor.l + (freeColor.l - dailyColor.l) * t;

  const knobGradient = ctx.createRadialGradient(knobX - 3, y - 3, 0, knobX, y, knobRadius * 1.2);
  knobGradient.addColorStop(0, `hsl(${h}, ${s}%, ${Math.min(95, l + 15)}%)`);
  knobGradient.addColorStop(0.5, `hsl(${h}, ${s}%, ${l}%)`);
  knobGradient.addColorStop(1, `hsl(${h}, ${s + 10}%, ${l - 15}%)`);

  ctx.fillStyle = knobGradient;
  ctx.beginPath();
  ctx.ellipse(knobX, y, knobRadius * squishX, knobRadius * squishY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Knob highlight (glossy effect)
  const highlightGradient = ctx.createRadialGradient(
    knobX - 3,
    y - 4,
    0,
    knobX - 2,
    y - 3,
    knobRadius * 0.7,
  );
  highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  highlightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
  highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = highlightGradient;
  ctx.beginPath();
  ctx.ellipse(knobX, y, knobRadius * squishX, knobRadius * squishY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cute mochi face
  ctx.strokeStyle = `rgba(80, 80, 80, ${0.5 + (1 - t) * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";

  const eyeSpacing = 3.5 * squishX;
  const eyeY = y - 1;
  const eyeSize = 2;

  // Happy curved eyes
  ctx.beginPath();
  ctx.arc(knobX - eyeSpacing, eyeY, eyeSize, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(knobX + eyeSpacing, eyeY, eyeSize, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  // Tiny smile
  ctx.beginPath();
  ctx.arc(knobX, y + 2, 2.5 * squishX, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  // Rosy cheeks
  ctx.fillStyle = `rgba(255, 150, 150, ${0.25 + (1 - t) * 0.15})`;
  ctx.beginPath();
  ctx.ellipse(knobX - eyeSpacing - 2, y + 1.5, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(knobX + eyeSpacing + 2, y + 1.5, 2, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Export for hit testing
export const MODE_TOGGLE_BOUNDS = {
  width: 70,
  height: 28,
};

function drawSpeakerIcon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  soundEnabled: boolean,
  nightMode: boolean,
): void {
  const x = width - 30;
  const y = height - 30;

  ctx.save();

  // Icon color
  const iconColor = nightMode ? "rgba(200, 220, 255, 0.7)" : "rgba(90, 120, 80, 0.8)";
  ctx.fillStyle = iconColor;
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Center offset to visually center the icon (speaker + waves)
  const offsetX = soundEnabled ? -3 : -1;

  // Speaker body (trapezoid-ish shape)
  ctx.beginPath();
  ctx.moveTo(x + offsetX - 5, y - 4);
  ctx.lineTo(x + offsetX, y - 4);
  ctx.lineTo(x + offsetX + 5, y - 8);
  ctx.lineTo(x + offsetX + 5, y + 8);
  ctx.lineTo(x + offsetX, y + 4);
  ctx.lineTo(x + offsetX - 5, y + 4);
  ctx.closePath();
  ctx.fill();

  if (soundEnabled) {
    // Sound waves
    ctx.beginPath();
    ctx.arc(x + offsetX + 7, y, 5, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + offsetX + 7, y, 9, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  } else {
    // X mark when muted
    ctx.beginPath();
    ctx.moveTo(x + offsetX + 7, y - 5);
    ctx.lineTo(x + offsetX + 14, y + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + offsetX + 14, y - 5);
    ctx.lineTo(x + offsetX + 7, y + 5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 0.75;

  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.25,
    centerX,
    centerY,
    radius,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.4, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.6, "rgba(35, 25, 15, 0.08)");
  gradient.addColorStop(0.75, "rgba(30, 20, 10, 0.18)");
  gradient.addColorStop(0.9, "rgba(25, 15, 5, 0.3)");
  gradient.addColorStop(1, "rgba(20, 10, 0, 0.4)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawWarmOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nightMode: boolean,
): void {
  if (nightMode) {
    // Subtle cool blue tint at night
    ctx.fillStyle = "rgba(100, 120, 150, 0.03)";
  } else {
    // Warm sepia-like tint during day
    ctx.fillStyle = "rgba(255, 240, 220, 0.06)";
  }
  ctx.fillRect(0, 0, width, height);
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nightMode: boolean,
): void {
  const isMobile = width < 500 || height < 700;
  const moonX = width - 35;
  const moonY = isMobile ? 55 : 35; // Lower on mobile for easier tap

  ctx.save();

  if (nightMode) {
    // Bright moon glow
    const glow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 45);
    glow.addColorStop(0, "rgba(255, 255, 240, 0.6)");
    glow.addColorStop(0.5, "rgba(200, 220, 255, 0.2)");
    glow.addColorStop(1, "rgba(150, 180, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 45, 0, Math.PI * 2);
    ctx.fill();

    // Hazy clouds drifting across moon
    const time = Date.now() * 0.0003;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) {
      const cloudOffset = Math.sin(time + i * 2) * 15;
      const cloudY = moonY - 5 + i * 8;
      const cloudGradient = ctx.createRadialGradient(
        moonX + cloudOffset,
        cloudY,
        5,
        moonX + cloudOffset,
        cloudY,
        25 + i * 5,
      );
      cloudGradient.addColorStop(0, "rgba(180, 200, 220, 0.6)");
      cloudGradient.addColorStop(1, "rgba(100, 130, 160, 0)");
      ctx.fillStyle = cloudGradient;
      ctx.beginPath();
      ctx.ellipse(moonX + cloudOffset, cloudY, 30 + i * 8, 12 + i * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shining moon
    ctx.fillStyle = "#FFFEF5";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Moon craters - subtle
    ctx.fillStyle = "rgba(200, 210, 220, 0.3)";
    ctx.beginPath();
    ctx.arc(moonX - 5, moonY - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX + 4, moonY + 5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Zzz
    ctx.fillStyle = "rgba(200, 220, 255, 0.7)";
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

  // Draw daily mode watermark (big muted day number in background)
  if (gameState.gameMode === "daily" && gameState.dailyChallenge) {
    const dayNum = getDayNumber(gameState.dailyChallenge.date);
    drawDailyWatermark(
      context.ctx,
      context.width,
      gameState.container.y,
      dayNum,
      gameState.nightMode,
    );
  }

  drawContainer(context, gameState.container, gameState.nightMode);

  // Draw drop preview (shows the mochi player is about to drop)
  if (gameState.canDrop && !gameState.gameOver) {
    drawDropPreview(
      context,
      gameState.dropX,
      gameState.currentMochi?.tier ?? gameState.currentTier,
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
  drawMoon(context.ctx, context.width, context.height, gameState.nightMode);

  // Draw speaker toggle icon
  drawSpeakerIcon(
    context.ctx,
    context.width,
    context.height,
    gameState.soundEnabled,
    gameState.nightMode,
  );

  // Apply cozy post-processing effects
  drawWarmOverlay(context.ctx, context.width, context.height, gameState.nightMode);
  drawVignette(context.ctx, context.width, context.height);
}
