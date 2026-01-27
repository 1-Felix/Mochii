export interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ox: number;
  oy: number;
}

export interface Spring {
  p1: number;
  p2: number;
  restLength: number;
  stiffness: number;
}

export interface MochiTier {
  level: number;
  name: string;
  radius: number;
  color: MochiColor;
  points: number;
}

export interface MochiColor {
  primary: string;
  secondary: string;
  highlight: string;
  shadow: string;
  cheek: string;
}

export type MochiEmotion = 'happy' | 'surprised' | 'squished' | 'flying' | 'sleepy' | 'love' | 'yawning' | 'stressed';

export interface Mochi {
  id: number;
  tier: number;
  points: Point[];
  springs: Spring[];
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: MochiColor;
  grabbed: boolean;
  emotion: MochiEmotion;
  emotionTimer: number;
  squishAmount: number;
  impactVelocity: number;
  wobblePhase: number;
  wobbleIntensity: number;
  breathPhase: number;
  lastY: number;
  merging: boolean;
  mergeTimer: number;
  isDropping: boolean; // Currently being dropped by player
  hasLanded: boolean; // Has touched something after being dropped
  settleTimer: number; // Frames since landing - for game over grace period
  // Animation states
  blinkTimer: number; // Countdown to next blink
  blinkState: number; // 0 = open, >0 = closing/closed
  lookDirection: number; // -1 to 1, where to look (0 = center)
  lookTimer: number; // How long to look in current direction
  idleTimer: number; // How long mochi has been idle (for yawning)
  // Jitter detection
  jitterAmount: number; // Accumulated jitter score
  prevVx: number; // Previous frame velocity for jitter detection
  prevVy: number;
}

export interface PhysicsConfig {
  springStiffness: number;
  damping: number;
  pressure: number;
  gravity: number;
  mouseForce: number;
  mouseRadius: number;
  wallBounce: number;
  friction: number;
  squishRecovery: number;
}

export interface GameState {
  score: number;
  highScore: number;
  gameOver: boolean;
  currentMochi: Mochi | null;
  nextTier: number;
  dropX: number;
  canDrop: boolean;
  container: Container;
  mouseX: number;
  mouseY: number;
  // Easter egg states
  nightMode: boolean;
  lastInteraction: number;
  easterEggActive: string | null;
  easterEggTimer: number;
  // Sound state
  soundEnabled: boolean;
}

export interface CherryBlossom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

export interface WalkingCat {
  x: number;
  y: number;
  direction: number;
  frame: number;
  active: boolean;
}

export interface Container {
  x: number;
  y: number;
  width: number;
  height: number;
  wallThickness: number;
  overflowLine: number; // Y position of the danger line
}

export interface InputState {
  mouseX: number;
  mouseY: number;
  prevMouseX: number;
  prevMouseY: number;
  mouseDown: boolean;
  grabbedMochi: Mochi | null;
  grabOffsetX: number;
  grabOffsetY: number;
  dragVelocityX: number;
  dragVelocityY: number;
}

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}

export interface MergeEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: string;
  particles: MergeParticle[];
}

export interface MergeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
}

export interface ImpactStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  life: number;
  color: string;
}
