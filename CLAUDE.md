# Mochii Project Memory

## Current Status (2026-01-28)

### Leaderboard Implementation - COMPLETE
Separate daily and free play leaderboards are now functional.

**Database schema (leaderboard table):**
- `id` (uuid) - primary key
- `name` (text) - player name
- `score` (integer) - score between 1-50000
- `created_at` (timestamptz) - submission time
- `game_mode` (text) - 'daily' or 'freeplay' (defaults to 'freeplay')
- `daily_date` (date) - required for daily mode, null for freeplay

**Constraints:**
- `game_mode` must be 'daily' or 'freeplay'
- `daily_date` required when `game_mode = 'daily'`, must be null for freeplay

**Code filters:**
- Daily leaderboard: `game_mode = 'daily'` AND `daily_date = [today's date]`
- Free play leaderboard: `game_mode = 'freeplay'`
