/* ═══════════════════════════════════════════════════════════
   netlify/functions/fixtures.js
   Copa.pi — football-data.org server-side proxy
   Uses axios (reliable on all Netlify Node runtimes)
   Never exposes API key to frontend
═══════════════════════════════════════════════════════════ */

const axios  = require('axios');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FD_BASE = 'https://api.football-data.org/v4';

function pad(n){ return String(n).padStart(2,'0'); }

function todayStr(){
  var d = new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

exports.handler = async function(event) {

  /* Preflight */
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode:200, headers:CORS, body:'' };
  }

  /* API key — ONLY from environment, never hardcoded */
  const FD_KEY = process.env.FD_API_KEY;
  if(!FD_KEY){
    console.error('[Copa fixtures] FD_API_KEY not set in environment variables');
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ matches:[], error:'API key not configured', scorers:[] })
    };
  }

  const params = event.queryStringParameters || {};
  const type   = params.type   || 'matches';
  const from   = params.from   || todayStr();
  const to     = params.to     || todayStr();
  const comp   = params.comp   || '';
  const status = params.status || '';

  /* Build URL — always use /matches endpoint (faster, less rate-limited) */
  let url = '';
  if(type === 'scorers' && comp){
    url = FD_BASE + '/competitions/' + comp + '/scorers?limit=10';
  } else if(from && to){
    url = FD_BASE + '/matches?dateFrom=' + from + '&dateTo=' + to;
    if(status) url += '&status=' + status;
  } else {
    var d = todayStr();
    url = FD_BASE + '/matches?dateFrom=' + d + '&dateTo=' + d;
  }

  console.log('[Copa fixtures] Type:', type);
  console.log('[Copa fixtures] Request URL:', url);

  try {
    const response = await axios.get(url, {
      headers: {
        'X-Auth-Token': FD_KEY,
        'Accept':       'application/json'
      },
      timeout: 10000
    });

    const remaining = response.headers['x-requests-available-minute'] || '10';
    const data      = response.data;

    console.log('[Copa fixtures] Status:', response.status);
    console.log('[Copa fixtures] Matches:', data.matches ? data.matches.length : (data.scorers ? data.scorers.length + ' scorers' : 0));
    console.log('[Copa fixtures] Requests remaining:', remaining);

    if(response.status !== 200){
      console.error('[Copa fixtures] Non-200 status:', response.status);
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ matches:[], error:'FD returned '+response.status, scorers:[] })
      };
    }

    return {
      statusCode: 200,
      headers: Object.assign({}, CORS, { 'X-Requests-Remaining': String(remaining) }),
      body: JSON.stringify(data)
    };

  } catch(err) {
    const status_code = err.response ? err.response.status : 0;
    const err_msg     = err.response ? JSON.stringify(err.response.data).substring(0,200) : err.message;
    console.error('[Copa fixtures] axios error — status:', status_code, 'msg:', err_msg);

    /* Return empty data so frontend can fall back gracefully */
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        matches: [],
        scorers: [],
        error:   err_msg,
        status:  status_code
      })
    };
  }
};
