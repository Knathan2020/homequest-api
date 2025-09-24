# 🚀 Deployment Checklist - HomeQuest Tech

## ✅ Current Development Setup
All webhook URLs are configured for GitHub Codespaces development environment.

## 📝 SINGLE CHANGE NEEDED FOR PRODUCTION

### 1. Update `.env` file on production server:

**Change this ONE line:**
```bash
# BEFORE (Development)
API_BASE_URL=https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev

# AFTER (Production)
API_BASE_URL=https://api.homequesttech.com
```

**That's it!** 🎉

### 2. Also update these environment variables for production:

```bash
NODE_ENV=production
FRONTEND_URL=https://homequesttech.com
```

## 🔄 What Happens Automatically

When you change `API_BASE_URL`, the system automatically:

1. **New User Signups**:
   - ✅ Phone numbers purchased with correct webhook URLs
   - ✅ VAPI integration configured with production URLs
   - ✅ Inbound calls routed to your production server

2. **All Webhook URLs Update**:
   - ✅ VAPI voice webhooks → `https://api.homequesttech.com/api/vapi/webhook`
   - ✅ SMS webhooks → `https://api.homequesttech.com/api/messaging/webhook`
   - ✅ Status callbacks → `https://api.homequesttech.com/api/vapi/status`
   - ✅ Realtime API → `https://api.homequesttech.com/api/realtime/inbound`

3. **Company Identification**:
   - ✅ System identifies company by phone number
   - ✅ Uses company name from database in greetings
   - ✅ No hardcoded values

## 📞 Testing After Deployment

1. **Test Inbound Calls**:
   ```bash
   Call your Twilio number
   Should hear: "Thank you for calling [Company Name]..."
   ```

2. **Test Outbound Calls**:
   ```bash
   Make a call from the dashboard
   Verify company name in greeting
   ```

3. **Test New User Signup**:
   ```bash
   Create a new account
   Verify phone provisioned with correct webhooks
   ```

## 🔍 Verify Webhook Configuration

Check if webhooks are correctly set:

```bash
# Development
curl https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/health

# Production
curl https://api.homequesttech.com/api/health
```

## 📊 Current Status

- [x] Development environment fully configured
- [x] All webhooks use centralized configuration
- [x] Company names pulled from database
- [x] Phone provisioning automated
- [ ] Deploy to production (just change API_BASE_URL!)

## 🎯 Quick Deploy Commands

```bash
# 1. Update .env on production server
nano .env
# Change API_BASE_URL to https://api.homequesttech.com

# 2. Restart the application
pm2 restart homequest-api

# 3. Verify
curl https://api.homequesttech.com/api/health
```

## ⚠️ Important Notes

- **Existing Phone Numbers**: If you have existing Twilio numbers, update their webhook URLs in Twilio Console
- **SSL Certificate**: Ensure SSL is configured for api.homequesttech.com
- **Firewall**: Allow HTTPS traffic on port 443

---

**Ready to deploy?** Just change that ONE environment variable and you're live! 🚀