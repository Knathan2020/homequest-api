# HomeQuest Tech Production Setup Guide

## Domain Configuration

### Main Application
- **Frontend**: https://homequesttech.com
- **API Backend**: https://api.homequesttech.com

### SSL/TLS Requirements
- Ensure SSL certificates are installed for both domains
- WebSocket connections require valid SSL certificates

## Twilio Configuration for Production

### 1. Phone Number Webhook Settings

In your Twilio Console, configure your phone number with these production URLs:

#### For VAPI.ai Integration:
- **Voice Webhook URL**: `https://api.homequesttech.com/api/vapi/webhook`
- **Method**: POST
- **Fallback URL**: `https://api.homequesttech.com/api/vapi/fallback`

#### For OpenAI Realtime API:
- **Voice Webhook URL**: `https://api.homequesttech.com/api/realtime/inbound`
- **Status Callback URL**: `https://api.homequesttech.com/api/realtime/status`
- **Method**: POST

### 2. Environment Variables for Production

Update your `.env` file on the production server:

```bash
# Server Configuration
NODE_ENV=production
API_URL=https://api.homequesttech.com
FRONTEND_URL=https://homequesttech.com

# Twilio Configuration
TWILIO_ACCOUNT_SID=ACdced5b7ba48a5d47222ee6c2fe041419
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# VAPI Configuration
VAPI_API_KEY=your_vapi_key_here
VAPI_WEBHOOK_URL=https://api.homequesttech.com/api/vapi/webhook

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key_here

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_key
```

### 3. DNS Configuration

Add these DNS records to your domain:

```
Type    Name    Value                   TTL
A       @       your.server.ip.address  3600
A       api     your.server.ip.address  3600
CNAME   www     homequesttech.com       3600
```

### 4. Nginx Configuration (if using Nginx)

```nginx
# API Server
server {
    listen 443 ssl http2;
    server_name api.homequesttech.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support for Realtime API
    location /api/realtime/websocket {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Frontend Server
server {
    listen 443 ssl http2;
    server_name homequesttech.com www.homequesttech.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    root /var/www/homequest-frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy for frontend
    location /api {
        proxy_pass https://api.homequesttech.com;
        proxy_set_header Host api.homequesttech.com;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name homequesttech.com www.homequesttech.com api.homequesttech.com;
    return 301 https://$server_name$request_uri;
}
```

### 5. Deployment Steps

1. **Backend Deployment**:
```bash
# On production server
cd /var/www/homequest-api
git pull origin main
npm install
npm run build
pm2 restart homequest-api
```

2. **Frontend Deployment**:
```bash
# Build locally or in CI/CD
cd construction-platform
npm run build

# Upload dist folder to server
scp -r dist/* user@server:/var/www/homequest-frontend/dist/
```

3. **Database Migrations**:
```bash
# Run any pending migrations
npm run migrate:production
```

### 6. Process Management with PM2

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'homequest-api',
    script: './dist/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 7. Security Checklist

- [ ] SSL certificates installed and auto-renewing (use Let's Encrypt)
- [ ] Environment variables secured (not in git)
- [ ] Database credentials rotated from development
- [ ] API rate limiting configured
- [ ] CORS properly configured for production domain
- [ ] Firewall rules configured (only ports 80, 443, and 22 open)
- [ ] Regular backups configured
- [ ] Monitoring and alerting set up
- [ ] Error logging to external service (e.g., Sentry)

### 8. Testing Production

After deployment, test these critical paths:

1. **Inbound Calls**: Call your Twilio number
2. **Outbound Calls**: Make a call from the dashboard
3. **VAPI Integration**: Test all 6 voice options
4. **Company Data**: Verify company names appear correctly
5. **Authentication**: Test login/logout flow

### 9. Monitoring

Set up monitoring for:
- Server uptime (e.g., UptimeRobot)
- API response times
- Error rates
- Twilio webhook failures
- SSL certificate expiration

## Troubleshooting

### If inbound calls fail:
1. Check Twilio Console for error logs
2. Verify webhook URLs are accessible: `curl https://api.homequesttech.com/api/realtime/inbound`
3. Check API logs: `pm2 logs homequest-api`

### If WebSocket connections fail:
1. Ensure Nginx is configured for WebSocket upgrade
2. Check SSL certificate validity
3. Verify firewall allows WebSocket connections

## Support

For issues, check:
- API Logs: `pm2 logs homequest-api`
- Nginx Logs: `/var/log/nginx/error.log`
- Twilio Console: https://console.twilio.com/debugger