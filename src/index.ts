// Cloudflare Worker Backend

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface TrialData {
  trialNumber: number;
  stimulusId: number;
  character: string;
  reactionTime: number;
  timestamp: number;
  wasPaused: boolean;
}

interface TrialSubmission {
  sessionId: string;
  userAgent: string;
  screenResolution: string;
  trial: TrialData;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    console.log(`[DEBUG] Received ${request.method} request to ${url.pathname}`);
    console.log(`[DEBUG] DB binding available:`, !!env.DB);
    console.log(`[DEBUG] ASSETS binding available:`, !!env.ASSETS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Serve static files
    if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (error) {
        console.error('Error serving static file:', url.pathname, error);
        return new Response('Failed to load resource', { status: 500, headers: corsHeaders });
      }
    }

    // API: Save individual trial
    if (url.pathname === '/api/trial' && request.method === 'POST') {
      try {
        const data: TrialSubmission = await request.json();
        
        if (!data.sessionId || !data.trial) {
          return new Response(
            JSON.stringify({ error: 'Invalid trial data' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await saveTrial(env, data);

        return new Response(
          JSON.stringify({ 
            success: true, 
            trialNumber: data.trial.trialNumber,
            sessionId: data.sessionId 
          }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error('Error saving trial:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save trial' }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

async function saveTrial(env: Env, data: TrialSubmission): Promise<void> {
  try {
    console.log(`[DEBUG] Attempting to save trial ${data.trial.trialNumber} for session ${data.sessionId} to D1 database`);
    
    // Ensure session exists first (before inserting trial)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO sessions (id, user_agent, screen_resolution, first_trial_at) 
       VALUES (?, ?, ?, ?)`
    ).bind(
      data.sessionId,
      data.userAgent,
      data.screenResolution,
      data.trial.timestamp
    ).run();
    
    // Insert trial data into the database
    const result = await env.DB.prepare(
      `INSERT INTO trials (
        session_id, trial_number, stimulus_id, character, 
        reaction_time, timestamp, was_paused, saved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.sessionId,
      data.trial.trialNumber,
      data.trial.stimulusId,
      data.trial.character,
      data.trial.reactionTime,
      data.trial.timestamp,
      data.trial.wasPaused ? 1 : 0,
      new Date().toISOString()
    ).run();
    
    console.log(`[SUCCESS] ✓ Saved trial ${data.trial.trialNumber} for session ${data.sessionId}`);
    console.log(`[DEBUG] D1 insert result:`, result);
    
    // Update last trial timestamp
    await env.DB.prepare(
      `UPDATE sessions SET last_trial_at = ? WHERE id = ?`
    ).bind(data.trial.timestamp, data.sessionId).run();
    
  } catch (error) {
    console.error(`[ERROR] Failed to save trial ${data.trial.trialNumber} for session ${data.sessionId}:`, error);
    throw error;
  }
}

