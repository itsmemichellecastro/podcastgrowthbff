exports.handler = async function(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    // ── FLODESK HANDLER ──
    if (body.action === 'flodesk') {
      const { email, first_name, segments } = body;

      if (!email) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'No email provided' })
        };
      }

      if (!process.env.FLODESK_API_KEY) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Flodesk API key not configured' })
        };
      }

      // Map segment names to Flodesk segment IDs
      const segmentIdMap = {
        'Diagnostic Purchase Made via Stripe': '69c9774f198ade849c332af0',
        'Self-Serve Diagnostic Finished': '69c8892cd6a8576122fdbead'
      };

      const segmentIds = (segments || []).map(name => segmentIdMap[name]).filter(Boolean);

      // First create/update the subscriber
      const subscriberResponse = await fetch('https://api.flodesk.com/v1/subscribers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(process.env.FLODESK_API_KEY + ':').toString('base64')
        },
        body: JSON.stringify({
          email: email,
          first_name: first_name || ''
        })
      });

      const subscriberData = await subscriberResponse.json();
      console.log('Flodesk subscriber response:', subscriberResponse.status, JSON.stringify(subscriberData));

      // Then add to segments
      if (segmentIds.length > 0) {
        const segmentResponse = await fetch('https://api.flodesk.com/v1/subscribers/' + email + '/segments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(process.env.FLODESK_API_KEY + ':').toString('base64')
          },
          body: JSON.stringify({ segment_ids: segmentIds })
        });

        const segmentData = await segmentResponse.json();
        console.log('Flodesk segment response:', segmentResponse.status, JSON.stringify(segmentData));
      }

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true })
      };
    }

    // ── CLAUDE API HANDLER ──
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const prompt = body.prompt;

    if (!prompt) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No prompt provided' })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Anthropic API error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API error: ' + response.status, details: errorText })
      };
    }

    const data = await response.json();
    console.log('Success - tokens:', JSON.stringify(data.usage));

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.log('Function error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
