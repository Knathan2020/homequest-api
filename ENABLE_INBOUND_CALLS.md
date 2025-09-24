# Enable Inbound Calls with VAPI

## Your Webhook URL
```
https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook
```

## Setup Instructions

### Step 1: Configure VAPI Dashboard
1. Go to [VAPI Dashboard](https://dashboard.vapi.ai)
2. Navigate to **Phone Numbers** section
3. Click on your phone number (ID: 889151da-ac44-4296-a9cf-568a414815a0)
4. In the **Assistant** section, select "Use URL" or "Webhook"
5. Set the **Webhook URL** to:
   ```
   https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook
   ```
6. Save the configuration

### Step 2: Test Inbound Calls
1. Call your VAPI phone number
2. The AI assistant will answer with: "Thank you for calling HomeQuest. This is HomeQuest's assistant. How may I help you today?"
3. Try these test phrases:
   - "I need to speak to someone about a construction project"
   - "I'm a vendor calling about materials"
   - "Can I leave a message for the builder?"
   - "Transfer me to someone in charge"

### Step 3: Monitor Calls
- Check the console output in your backend (port 4000) to see webhook events
- View call logs at `/api/vapi/calls`
- Check inbound stats at `/api/vapi/inbound/stats`

## How Inbound Calls Work

1. **Someone calls your VAPI number** → 
2. **VAPI sends webhook** to your backend →
3. **Your backend responds** with assistant configuration →
4. **AI answers the call** using selected voice →
5. **Call is handled** (transfer, message, or resolved)

## Features Available
- ✅ Professional AI receptionist
- ✅ 6 different voice options
- ✅ Call transfers to your phone
- ✅ Message taking
- ✅ Voicemail detection
- ✅ Call routing based on caller intent

## Troubleshooting
- Make sure port 4000 is running (`npm run dev`)
- Ensure the webhook URL is exactly as shown above
- Check console logs for any errors
- Test with `/api/vapi/test` endpoint to verify configuration

## Important Notes
- The webhook URL changes if you restart your Codespace
- Always use HTTPS (not HTTP) for the webhook URL
- The assistant will use the "Hope" voice by default for inbound calls