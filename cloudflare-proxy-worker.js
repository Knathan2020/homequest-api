// Cloudflare Worker Proxy for GIS Services
// Deploy this to Cloudflare Workers (free tier)
// This bypasses the IP blocking issue

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Enable CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Get the target URL from query params
  const url = new URL(request.url)
  const targetUrl = url.searchParams.get('url')
  
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'No URL provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Whitelist of allowed GIS domains
  const allowedDomains = [
    'gismaps.fultoncountyga.gov',
    'gis.cherokeega.com',
    'gis.cobbcounty.org',
    'secure.mariettaga.gov',
    'gis.fultoncountyga.gov'
  ]

  const targetUrlObj = new URL(targetUrl)
  const isAllowed = allowedDomains.some(domain => 
    targetUrlObj.hostname.includes(domain)
  )

  if (!isAllowed) {
    return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Make the request to the GIS server
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': targetUrlObj.origin
      }
    })

    // Get the response body
    const body = await response.text()

    // Return the response with CORS headers
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'max-age=3600' // Cache for 1 hour
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch from GIS server',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

/* 
DEPLOYMENT INSTRUCTIONS:

1. Sign up for free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Go to Workers & Pages
3. Create new Worker
4. Paste this code
5. Deploy
6. You'll get a URL like: https://your-worker.username.workers.dev

Then update UniversalPropertyExtractor.js to use:
const proxyUrl = `https://your-worker.username.workers.dev?url=${encodeURIComponent(url)}`;
*/