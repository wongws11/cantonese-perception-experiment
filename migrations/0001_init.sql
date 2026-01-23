-- Migration: Initialize D1 database schema
-- Description: Create sessions and trials tables for the Cantonese experiment

-- Sessions table: stores metadata for each experiment session
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_agent TEXT NOT NULL,
  screen_resolution TEXT NOT NULL,
  total_trials INTEGER NOT NULL DEFAULT 0,
  first_trial_at INTEGER,
  last_trial_at INTEGER,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trials table: stores individual trial results
CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  trial_number INTEGER NOT NULL,
  stimulus_id INTEGER NOT NULL,
  character TEXT NOT NULL,
  reaction_time REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  was_paused BOOLEAN NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, trial_number)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trials_session_id ON trials(session_id);
CREATE INDEX IF NOT EXISTS idx_trials_trial_number ON trials(trial_number);
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions(completed_at);
