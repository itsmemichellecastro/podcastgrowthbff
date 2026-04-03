const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { action } = body;

  // ── FLODESK SUBSCRIBER ADD ──────────────────────────────────────────────────
  // Handles both diagnostic purchases and quiz leads
  if (action === 'flodesk') {
    const { email, firstName, segment, quizStage } = body;

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };
    }

    const FLODESK_API_KEY = process.env.FLODESK_API_KEY;

    if (!FLODESK_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Flodesk API key not configured' }) };
    }

    try {
      // Step 1: Upsert subscriber (create or update)
      const subscriberPayload = {
        email: email,
        first_name: firstName || '',
      };

      // If this is a quiz lead, store the stage as a custom field
      if (quizStage) {
        subscriberPayload.custom_fields = {
          quiz_stage: quizStage
        };
      }

      const subscriberRes = await fetch('https://api.flodesk.com/v1/subscribers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(FLODESK_API_KEY + ':').toString('base64'),
          'User-Agent': 'PodcastGrowthOS/1.0'
        },
        body: JSON.stringify(subscriberPayload)
      });

      if (!subscriberRes.ok) {
        const errText = await subscriberRes.text();
        console.error('Flodesk subscriber error:', errText);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to upsert subscriber', detail: errText })
        };
      }

      // Step 2: Add to segment (if provided)
      if (segment) {
        const segmentRes = await fetch(`https://api.flodesk.com/v1/subscribers/${encodeURIComponent(email)}/segments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(FLODESK_API_KEY + ':').toString('base64'),
            'User-Agent': 'PodcastGrowthOS/1.0'
          },
          body: JSON.stringify({ segment_ids: [segment] })
        });

        if (!segmentRes.ok) {
          const errText = await segmentRes.text();
          console.error('Flodesk segment error:', errText);
          // Don't fail the whole request — subscriber was already created
          // Just log and continue
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };

    } catch (err) {
      console.error('Flodesk fetch error:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Flodesk request failed', detail: err.message })
      };
    }
  }

  // ── CLAUDE API CALL ─────────────────────────────────────────────────────────
  // Handles diagnostic report generation
  if (action === 'claude' || !action) {
    const { messages, system, token } = body;

    // Token check for diagnostic access
    if (token !== 'pgbff97x2026') {
      return { statusCode: 403, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Anthropic API key not configured' }) };
    }

    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: system || '',
          messages: messages || []
        })
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error('Claude API error:', errText);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Claude API request failed', detail: errText })
        };
      }

      const data = await claudeRes.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };

    } catch (err) {
      console.error('Claude fetch error:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Claude request failed', detail: err.message })
      };
    }
  }

  // Unknown action
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown action' })
  };
};
