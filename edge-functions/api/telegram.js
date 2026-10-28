export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  // Read EdgeOne Environment Variables
  const BOT_TOKEN = env.TG_BOT_TOKEN;
  const CHAT_ID = env.TG_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return jsonResponse({ 
      ok: false, 
      error: 'server_not_configured', 
      message: 'Missing TG_BOT_TOKEN or TG_CHAT_ID in EdgeOne dashboard.' 
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'bad_json' }, 400);
  }

  const method = body && body.method;
  const payload = (body && body.payload) || {};

  const ALLOWED = ['sendMessage', 'getUpdates', 'answerCallbackQuery'];
  if (!method || !ALLOWED.includes(method)) {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 400);
  }

  // Force chat_id server-side so client can't spam other chats
  if (method === 'sendMessage') {
    payload.chat_id = CHAT_ID;
  }

  // Long-polling needs a longer timeout
  const timeoutMs = method === 'getUpdates' ? 28000 : 8000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    
    const data = await tgRes.json();
    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'upstream_error', details: err.message }, 502);
  } finally {
    clearTimeout(timer);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}