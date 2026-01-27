import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { GameMode } from './types';

// Supabase configuration
const SUPABASE_URL = 'https://utzsbizennwcvpgbcrwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0enNiaXplbm53Y3ZwZ2JjcndmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDA3NjIsImV4cCI6MjA4NTAxNjc2Mn0.QDG6tp_23esZR1NTtbhJVRcGiXwvKq-7RulGX8QuhLU';

// Fun name generator for players
const adjectives = [
  'Happy', 'Sleepy', 'Bouncy', 'Fluffy', 'Cozy', 'Sunny', 'Dreamy', 'Gentle',
  'Jolly', 'Mellow', 'Peaceful', 'Quiet', 'Soft', 'Sweet', 'Tender', 'Warm',
  'Bubbly', 'Cheerful', 'Cuddly', 'Fuzzy', 'Giggly', 'Lovely', 'Snuggly', 'Tiny'
];

const nouns = [
  'Mochi', 'Tanuki', 'Panda', 'Bunny', 'Kitten', 'Puppy', 'Duckling', 'Hamster',
  'Penguin', 'Koala', 'Otter', 'Seal', 'Squirrel', 'Hedgehog', 'Deer', 'Fox',
  'Shiba', 'Corgi', 'Totoro', 'Pikachu', 'Kirby', 'Slime', 'Bean', 'Dumpling'
];

export function generatePlayerName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

export function getOrCreatePlayerName(): string {
  let name = localStorage.getItem('mochiPlayerName');
  if (!name) {
    name = generatePlayerName();
    localStorage.setItem('mochiPlayerName', name);
  }
  return name;
}

export interface LeaderboardEntry {
  id?: string;
  name: string;
  score: number;
  created_at?: string;
  game_mode?: string;
  daily_date?: string;
}

// Leaderboard state - separate for each mode
let freePlayLeaderboard: LeaderboardEntry[] = [];
let dailyLeaderboard: LeaderboardEntry[] = [];
let currentMode: GameMode = 'daily';
let currentDailyDate: string = '';
let isLoading = false;
let supabase: SupabaseClient | null = null;

// Initialize Supabase client
export function initLeaderboard(): void {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Fetch both leaderboards initially
    fetchLeaderboard('practice');
    const today = new Date().toISOString().split('T')[0];
    fetchLeaderboard('daily', today);
  } catch (e) {
    console.warn('Failed to initialize Supabase:', e);
  }
}

// Set current mode for getLeaderboard()
export function setLeaderboardMode(mode: GameMode, dailyDate?: string): void {
  currentMode = mode;
  if (dailyDate) {
    currentDailyDate = dailyDate;
  }
}

export async function fetchLeaderboard(mode: GameMode, dailyDate?: string): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];

  isLoading = true;
  try {
    let query = supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .limit(50);

    if (mode === 'daily' && dailyDate) {
      // Daily leaderboard - filter by date
      query = query.eq('game_mode', 'daily').eq('daily_date', dailyDate);
    } else {
      // Free play leaderboard - no date filter, just mode
      query = query.eq('game_mode', 'freeplay');
    }

    const { data, error } = await query;

    if (error) throw error;

    if (mode === 'daily') {
      dailyLeaderboard = data || [];
    } else {
      freePlayLeaderboard = data || [];
    }
  } catch (e) {
    console.error('Failed to fetch leaderboard:', e);
  }
  isLoading = false;
  return mode === 'daily' ? dailyLeaderboard : freePlayLeaderboard;
}

export async function submitScore(name: string, score: number, mode: GameMode, dailyDate?: string): Promise<boolean> {
  if (!supabase || score <= 0) return false;

  const gameMode = mode === 'daily' ? 'daily' : 'freeplay';

  try {
    if (mode === 'daily' && dailyDate) {
      // Daily mode: check if player already has a score for this specific day
      const { data: existing } = await supabase
        .from('leaderboard')
        .select('id, score')
        .eq('name', name)
        .eq('game_mode', 'daily')
        .eq('daily_date', dailyDate)
        .single();

      if (existing) {
        // Only update if new score is higher
        if (score > existing.score) {
          const { error } = await supabase
            .from('leaderboard')
            .update({ score })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else {
        // Insert new daily score
        const { error } = await supabase
          .from('leaderboard')
          .insert({ name, score, game_mode: gameMode, daily_date: dailyDate });
        if (error) throw error;
      }

      await fetchLeaderboard('daily', dailyDate);
    } else {
      // Free play mode: single persistent entry per player
      const { data: existing } = await supabase
        .from('leaderboard')
        .select('id, score')
        .eq('name', name)
        .eq('game_mode', 'freeplay')
        .single();

      if (existing) {
        // Only update if new score is higher
        if (score > existing.score) {
          const { error } = await supabase
            .from('leaderboard')
            .update({ score })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else {
        // Insert new player
        const { error } = await supabase
          .from('leaderboard')
          .insert({ name, score, game_mode: gameMode });
        if (error) throw error;
      }

      await fetchLeaderboard('practice');
    }

    return true;
  } catch (e) {
    console.error('Failed to submit score:', e);
    return false;
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  return currentMode === 'daily' ? dailyLeaderboard : freePlayLeaderboard;
}

export function isLeaderboardLoading(): boolean {
  return isLoading;
}

// Check if score qualifies for leaderboard
export function isHighScore(score: number): boolean {
  const data = currentMode === 'daily' ? dailyLeaderboard : freePlayLeaderboard;
  if (data.length < 10) return score > 0;
  const lowestScore = data[data.length - 1]?.score || 0;
  return score > lowestScore;
}
