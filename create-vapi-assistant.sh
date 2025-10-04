#!/bin/bash

# Create a VAPI Assistant with Transfer Tool
# Run this script to create a persistent assistant

VAPI_API_KEY="${VAPI_API_KEY:-31344c5e-a977-4438-ad39-0e1c245be45f}"

# Get Ken White's phone number from your database
# For now, using placeholder - update with actual number
KEN_PHONE="+1234567890"  # UPDATE THIS

curl -X POST https://api.vapi.ai/assistant \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HomeQuest Transfer Assistant",
    "model": {
      "provider": "openai",
      "model": "gpt-4",
      "temperature": 0.7,
      "messages": [
        {
          "role": "system",
          "content": "You are a receptionist for HomeQuest Construction.\n\nWhen caller asks to speak with someone, say \"One moment\" then use the transferCall tool to transfer them.\n\nAvailable: Ken White (Billing)"
        }
      ],
      "tools": [
        {
          "type": "transferCall",
          "destinations": [
            {
              "type": "number",
              "number": "'"$KEN_PHONE"'",
              "description": "Ken White - Billing"
            }
          ]
        }
      ]
    },
    "voice": {
      "provider": "11labs",
      "voiceId": "OYTbf65OHHFELVut7v2H",
      "model": "eleven_turbo_v2"
    },
    "firstMessage": "Good morning, HomeQuest Construction. How may I assist you?",
    "endCallFunctionEnabled": false
  }' | jq '.'

echo ""
echo "✅ Copy the 'id' from above"
echo "📋 Then update your phone number with:"
echo ""
echo "curl -X PATCH https://api.vapi.ai/phone-number/86d21bb9-4562-4fcf-a834-cbfdccc0de5f \\"
echo "  -H \"Authorization: Bearer $VAPI_API_KEY\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"assistantId\": \"PASTE_ASSISTANT_ID_HERE\"}'"
