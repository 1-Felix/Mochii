import type { DailyChallenge } from './types';

// Seeded random number generator (mulberry32)
// Returns a function that produces deterministic random numbers from 0-1
export function createSeededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Get today's date as YYYY-MM-DD string
export function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// Generate a seed from a date string
export function getSeedFromDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Add a magic number to make seeds more varied
  return Math.abs(hash * 2654435761);
}

// Calculate day number since launch (for "Mochii #123" format)
const LAUNCH_DATE = new Date('2026-01-26');
export function getDayNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const diffTime = date.getTime() - LAUNCH_DATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Day 1 is launch day
}

// LocalStorage key for daily challenges
const DAILY_STORAGE_KEY = 'mochiDailyChallenge';

// Load today's daily challenge from localStorage
export function loadDailyChallenge(): DailyChallenge | null {
  try {
    const stored = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!stored) return null;

    const challenge = JSON.parse(stored) as DailyChallenge;
    const today = getTodayString();

    // Return null if it's from a different day
    if (challenge.date !== today) {
      return null;
    }

    return challenge;
  } catch {
    return null;
  }
}

// Save daily challenge result to localStorage
export function saveDailyChallenge(challenge: DailyChallenge): void {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(challenge));
  } catch {
    // Silently fail if localStorage is not available
  }
}

// Create a new daily challenge for today
export function createTodayChallenge(): DailyChallenge {
  const today = getTodayString();
  return {
    date: today,
    seed: getSeedFromDate(today),
    played: false,
    score: 0,
    highestTier: 0,
    mergeCount: 0,
  };
}

// Mochi tier emojis for share text
const TIER_EMOJIS = [
  '⚪', // 0: Vanilla
  '🌸', // 1: Sakura
  '🟡', // 2: Yuzu
  '🍓', // 3: Strawberry
  '🟠', // 4: Mango
  '🍵', // 5: Matcha
  '🟣', // 6: Taro
  '🟤', // 7: Hojicha
  '🍫', // 8: Chocolate
  '⚫', // 9: Black Sesame
  '🖤', // 10: Kuromame
];

// Generate shareable result text
export function generateShareText(challenge: DailyChallenge): string {
  const dayNum = getDayNumber(challenge.date);

  // Create tier progression (show emojis up to highest tier reached)
  const tierProgression = TIER_EMOJIS
    .slice(0, Math.min(challenge.highestTier + 1, TIER_EMOJIS.length))
    .join('');

  const lines = [
    `Mochii #${dayNum} 🍡`,
    `Score: ${challenge.score.toLocaleString()}`,
    tierProgression,
    `Merges: ${challenge.mergeCount}`,
    '',
    'https://mochii.game', // Replace with actual URL
  ];

  return lines.join('\n');
}

// Copy text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}
