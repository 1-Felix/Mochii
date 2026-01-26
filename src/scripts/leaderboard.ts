import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
}

// Leaderboard state
let leaderboardData: LeaderboardEntry[] = [];
let isLoading = false;
let supabase: SupabaseClient | null = null;

// Initialize Supabase client
export function initLeaderboard(): void {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    fetchLeaderboard();
  } catch (e) {
    console.warn('Failed to initialize Supabase:', e);
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];

  isLoading = true;
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .limit(10);

    if (error) throw error;
    leaderboardData = data || [];
  } catch (e) {
    console.error('Failed to fetch leaderboard:', e);
  }
  isLoading = false;
  return leaderboardData;
}

export async function submitScore(name: string, score: number): Promise<boolean> {
  if (!supabase || score <= 0) return false;

  try {
    // Check if player already has a score
    const { data: existing } = await supabase
      .from('leaderboard')
      .select('id, score')
      .eq('name', name)
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
        .insert({ name, score });
      if (error) throw error;
    }

    await fetchLeaderboard();
    return true;
  } catch (e) {
    console.error('Failed to submit score:', e);
    return false;
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  return leaderboardData;
}

export function isLeaderboardLoading(): boolean {
  return isLoading;
}

// Check if score qualifies for leaderboard
export function isHighScore(score: number): boolean {
  if (leaderboardData.length < 10) return score > 0;
  const lowestScore = leaderboardData[leaderboardData.length - 1]?.score || 0;
  return score > lowestScore;
}
