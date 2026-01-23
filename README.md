# Cantonese Audio-Visual Perception Reaction Time Experiment

A browser-based psychology experiment designed to measure reaction times to Cantonese audio-visual stimuli.

See in action: https://cantonese-perception-experiment.falling-truth-56a3.workers.dev

## Background

This project is a modern web port of an experiment originally written in MATLAB using the Psychtoolbox library in 2018. It was developed for my MSc dissertation, titled "Perception of Cantonese Syllables under Distortion".

## Project Goals

The original study, conducted in 2018, collected data from 13 subjects. Due to technical limitations at the time, the experiment was restricted to on-site, in-person participation.

This repository revisits that code, utilising modern web technologies to demonstrate how similar linguistic research can now be conducted remotely. While I do not intend to rerun the experiment, this project serves as a proof of concept—showcasing the potential of current web standards and AI-assisted coding (LLMs) to facilitate remote data collection.

I hope this repository serves as a useful template for students and researchers looking to migrate their experiments to an online format.

This project is licensed under the MIT License. Please feel free to fork or copy this code to use in your own experiments. I am keen to see this used as a template, so if you have questions, I am happy to provide support when my schedule permits.

## Features

- **Smart audio preloading** - Progressive loading with pause protection
- **Service Worker caching** - Offline capability after first load
- **Per-trial data submission** - No data loss if experiment interrupted
- **Responsive design** - Works on desktop and mobile
- **Modern web stack** - Cloudflare Workers + TypeScript

## Project Structure

```
cantonese-perception-experiment/
├── public/             # Frontend assets
│   ├── index.html      # Main page
│   ├── styles.css      # Styling
│   ├── experiment.js   # Experiment logic
│   ├── sw.js           # Service Worker for caching
│   ├── characters.json # Character list (UPDATE THIS)
│   └── audio/          # Audio files (ADD YOUR 75 .wav FILES)
│       ├── 1.m4a
│       ├── 2.m4a
│       └── ...
├── src/
│   └── index.ts        # Cloudflare Worker backend
├── migrations/         # D1 database migrations
│   └── 0001_init.sql   # Schema initialization
├── package.json
├── tsconfig.json
├── wrangler.jsonc
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Create D1 Database

```bash
# Create production database
wrangler d1 create cantonese-perception-experiment
# Create a local database
wrangler d1 create cantonese-perception-experiment --remote

# Apply migrations to initialize schema
wrangler d1 migrations apply cantonese-perception-experiment
wrangler d1 migrations apply cantonese-perception-experiment --remote

```

## Development

### Run locally

```bash
npm run dev
```

This uses a local preview D1 database for testing.

Open http://localhost:8787

### View logs

```bash
npm run tail
```

## Deployment

### Deploy to Production

```bash
npm run deploy
```

This deploys to:
`https://cantonese-perception-experiment.<your-subdomain>.workers.dev`

(Make sure to run migrations in production: `npm run db:migrate`)

## How It Works

### Experiment Flow

1. **Loading** - Preloads first 3 audio files
2. **Instructions** - Shows intro screen, waits for spacebar
3. **Trials** (75 total):
   - Shows Chinese character (1 second)
   - Plays audio (gradual clarity increase)
   - Records reaction time when spacebar pressed
   - Submits trial data to backend
   - 500ms blank screen
4. **End** - Shows completion message

### Data Collection

- Each trial is submitted immediately after completion
- Each trial creates a session record (if it doesn't exist) and stores the trial data in D1
- Data persists in the database even if network fails (no fallback needed)
- Results stored in Cloudflare D1 database

### Audio Strategy

- **Initial load**: 3 files (~7.8MB)
- **Progressive**: Loads 3 trials ahead during experiment
- **Pause protection**: Automatically pauses if next audio not ready
- **Caching**: Service Worker caches all audio after first fetch

## Data Retrieval

### Local Development Database

When running `npm run dev`, you can query the local preview database:

```bash
# List all sessions in local database
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT * FROM sessions"

# Get all trials in local database
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT * FROM trials"

# Get all trials for a specific session (local)
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT * FROM trials WHERE session_id = 'abc-123-def' ORDER BY trial_number"

# Count trials by session (local)
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT session_id, COUNT(*) as trial_count FROM trials GROUP BY session_id"
```

### Production Database

Results are stored in the Cloudflare D1 production database:

```bash
# List all sessions in production
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT * FROM sessions" --remote

# Get all trials for a specific session in production
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT * FROM trials WHERE session_id = 'abc-123-def' ORDER BY trial_number" --remote

# Export trials as CSV (production)
npx wrangler d1 execute cantonese-perception-experiment --command "SELECT trial_number, stimulus_id, character, reaction_time, timestamp, was_paused FROM trials WHERE session_id = 'abc-123-def' ORDER BY trial_number" --format csv --remote
```

## Database Schema

### Sessions Table

- `id` (TEXT, PRIMARY KEY) - Unique session identifier
- `user_agent` (TEXT) - Browser user agent string
- `screen_resolution` (TEXT) - Screen resolution when experiment started
- `total_trials` (INTEGER) - Total number of trials completed
- `first_trial_at` (INTEGER) - Timestamp of first trial
- `last_trial_at` (INTEGER) - Timestamp of last trial
- `completed_at` (TEXT) - ISO timestamp when experiment completed
- `created_at` (TEXT) - ISO timestamp when session was created

### Trials Table

- `id` (INTEGER, PRIMARY KEY) - Auto-incrementing trial ID
- `session_id` (TEXT, FOREIGN KEY) - Reference to session
- `trial_number` (INTEGER) - Trial sequence number
- `stimulus_id` (INTEGER) - Stimulus identifier
- `character` (TEXT) - Character shown in trial
- `reaction_time` (REAL) - Reaction time in milliseconds
- `timestamp` (INTEGER) - Unix timestamp
- `was_paused` (BOOLEAN) - Whether trial was paused
- `saved_at` (TEXT) - ISO timestamp when trial was saved

## Troubleshooting

### Audio not loading

- Check file naming: `1.wav`, `2.wav`, etc.
- Verify files are in `public/audio/`
- Check browser console for errors

### Service Worker not working

- Use HTTPS (required for Service Workers)
- Check Application tab in DevTools
- Clear cache and reload

### Data not saving

- Check D1 database exists: `npx wrangler d1 list`
- Verify migrations have been applied: `npm run db:migrate`
- Check worker logs: `npm run tail`
- Ensure session is created before trial insert

## Performance Notes

- **Initial load**: ~5-10 seconds (3 files)
- **Trial duration**: 1-16 seconds (depends on participant RT)
- **Memory usage**: ~40MB max (audio buffers)
- **Network**: Works on 1Mbps+ connections

## License

MIT
