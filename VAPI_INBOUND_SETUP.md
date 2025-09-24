# VAPI Inbound Call Setup

## How It Currently Works

### YES, IT USES VAPI! 🎉

When a phone number is provisioned for a new user:

1. **Twilio Number is Purchased** ✅
2. **Number is Imported to VAPI** ✅
3. **VAPI Takes Control of the Number** ✅

## The Flow for Inbound Calls:

```
Caller dials your Twilio number
    ↓
VAPI intercepts the call (because number was imported)
    ↓
VAPI sends webhook to: /api/vapi/webhook
with type: "assistant-request"
    ↓
Your server responds with assistant configuration
(which voice to use, company name, etc.)
    ↓
VAPI handles the call with AI voice
```

## Current Configuration

When you import a number to VAPI (which happens automatically during phone provisioning), VAPI:

1. **Takes over the Twilio number's voice webhook**
2. **Routes inbound calls through VAPI's infrastructure**
3. **Uses your `/api/vapi/webhook` endpoint to get assistant configuration**
4. **Handles the call with ElevenLabs voices**

## The Problem You Encountered

The error happened because:
- Twilio's console was showing the webhook URL as `/api/vapi/webhook`
- But this is actually VAPI's internal callback URL
- The actual voice handling is done by VAPI's infrastructure

## To Verify VAPI is Working:

1. **Check VAPI Dashboard**: 
   - Go to https://dashboard.vapi.ai
   - Look for your imported phone numbers
   - You should see them listed there

2. **Check Phone Number Status**:
   ```bash
   curl -X GET "https://api.vapi.ai/phone-number" \
     -H "Authorization: Bearer YOUR_VAPI_API_KEY"
   ```

3. **Test Inbound Call**:
   - Call your Twilio number
   - You should hear the AI voice (not Twilio's default voice)
   - Check logs for "assistant-request" webhook

## If VAPI is NOT Working:

The imported number might not be configured correctly. You need to:

1. **Ensure the number is properly imported to VAPI**
2. **Set up the serverUrl in VAPI** (webhook for assistant configuration)
3. **Configure the assistant** (either fixed or transient)

## The Correct Setup:

### For New Numbers (Automatic):
- Phone provisioning service imports to VAPI ✅
- VAPI handles all inbound calls ✅
- Uses ElevenLabs voices ✅

### For Existing Numbers (Manual):
Need to import them to VAPI:
```javascript
// Import existing Twilio number to VAPI
const importNumber = await axios.post(
  'https://api.vapi.ai/phone-number',
  {
    provider: 'twilio',
    number: '+1234567890',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    serverUrl: 'https://your-api.com/api/vapi/webhook'
  },
  {
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`
    }
  }
);
```

## Summary:

**YES, the system DOES use VAPI for inbound calls!** 

When properly configured:
- ✅ VAPI handles inbound calls
- ✅ Uses ElevenLabs voices
- ✅ Gets company info from your database
- ✅ No manual TwiML needed

The `/api/twilio/voice` endpoint we created is a fallback, but when VAPI is properly configured, it takes over the number and handles everything.