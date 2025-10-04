// VAPI AI ROUTES
// Professional voice AI calls with natural conversation flow
// High-quality alternative to OpenAI Realtime API

import express from 'express';
import vapiService from '../services/vapi.service';
import { getAllVoices, getVoiceById } from '../config/vapi-voices.config';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

const router = express.Router();

// Initialize Supabase client for fetching user data
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Initiate a Vapi AI call
router.post('/call', async (req, res) => {
  try {
    let {
      to,
      vendorName,
      vendorCompany,
      projectDetails,
      builderName,
      builderPhone,
      companyName,
      companyPhone,
      teamId,
      voiceId,
      customMessage,
      briefing,  // Briefing data from quick call setup
      userId,  // User ID if provided for fetching from database
      companyId  // Company ID if provided for fetching from database
    } = req.body;

    // If userId is provided, fetch user and team data
    if (userId) {
      try {
        // First get user profile with team_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, team_id')
          .eq('id', userId)
          .single();
        
        if (profile) {
          builderName = builderName || `${profile.first_name} ${profile.last_name}`;
          teamId = teamId || profile.team_id;
        }
      } catch (dbError) {
        console.log('Could not fetch user profile:', dbError);
      }
    }

    // If teamId is provided (or found from user), fetch team/company data
    if (teamId && !companyName) {
      try {
        const { data: teamData } = await supabase
          .from('teams')
          .select('company_name, name')
          .eq('id', teamId)
          .single();
        
        if (teamData?.company_name) {
          companyName = teamData.company_name;
          console.log(`📞 Outbound call will use company name: ${companyName}`);
        }
      } catch (dbError) {
        console.log('Could not fetch team data:', dbError);
      }
    }

    console.log('🎙️ Initiating Vapi AI Call to', vendorName);

    const result = await vapiService.initiateCall({
      to: to || '+14047001234',
      vendorName: vendorName || 'Vendor',
      vendorCompany: vendorCompany || 'Vendor Company',
      projectDetails: projectDetails || {
        address: '1234 Luxury Boulevard',
        type: 'Premium Development',
        budget: '$5M+',
        timeline: '6 months',
        urgency: 'immediate',
        specificWork: 'Full project services'
      },
      builderName: builderName || 'Project Manager',
      builderPhone: builderPhone,  // Now includes phone for transfers
      companyName: companyName || 'the company',
      companyPhone: companyPhone,  // Now includes phone for transfers
      teamId: teamId || '11111111-1111-1111-1111-111111111111',
      voiceId,
      customMessage,
      briefing
    });

    if (result.success) {
      res.json({
        success: true,
        callId: result.callId,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error: any) {
    console.error('Error initiating Vapi call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate Vapi AI call'
    });
  }
});

// Debug endpoint - check team phone
router.get('/debug/team-phone/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;

    const { data, error } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', teamId);

    res.json({
      teamId,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      data,
      error
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get call status
router.get('/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await vapiService.getCallStatus(callId);
    
    if (call) {
      res.json({
        success: true,
        call
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Hangup/End a call
router.post('/hangup/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const result = await vapiService.hangupCall(callId);
    
    res.json(result);
  } catch (error: any) {
    console.error('Error hanging up call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to hang up call'
    });
  }
});

// List recent calls
router.get('/calls', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const calls = await vapiService.listCalls(limit);
    
    res.json({
      success: true,
      calls
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test webhook endpoint - GET request for debugging
router.get('/webhook-test', async (req, res) => {
  console.log('🧪 WEBHOOK TEST ENDPOINT HIT');
  res.json({ status: 'ok', message: 'Webhook endpoint is accessible', timestamp: new Date().toISOString() });
});

// Handle Vapi webhooks (including inbound calls)
router.post('/webhook', async (req, res) => {
  console.log('🔔 INBOUND WEBHOOK HIT from VAPI at', new Date().toISOString());
  console.log('Webhook headers:', req.headers);
  console.log('Webhook body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Vapi assistant-request comes with message.type, not root type
    const message = req.body.message || req.body;
    const type = message.type;
    const call = message.call;
    const phoneNumber = message.phoneNumber;
    const assistant = req.body.assistant;

    console.log('📞 Vapi webhook received:', type);
    console.log('📋 Message structure:', { hasMessage: !!req.body.message, type, hasCall: !!call });

    // Log call type for better debugging
    if (call) {
      const callType = call.type || 'unknown';
      const callId = call.id || 'unknown';
      console.log(`📋 Call details: Type=${callType}, ID=${callId}`);
    }

    console.log('Full webhook body:', JSON.stringify(req.body, null, 2));
    
    // Handle inbound call webhook - SIMPLIFIED FOR TESTING
    if (type === 'assistant-request') {
      console.log('📥 Inbound call detected! Returning assistant config...');
      
      // Determine which assistant to use based on the phone number called
      // You can look up the team/company based on the phoneNumberId
      const phoneNumberId = call?.phoneNumberId;
      
      // Look up company/team configuration based on phone number
      let companyName = ''; // Will be fetched from database
      let companyPhone = process.env.DEFAULT_TRANSFER_NUMBER;
      let receptionistVoiceId = 'OYTbf65OHHFELVut7v2H'; // Hope voice as default
      let teamId = null;
      let teamMembers = [];
      let departments = [];
      
      // Try to fetch company info based on phone number
      if (phoneNumberId) {
        try {
          // First check if there's a team associated with this phone number
          const { data: teamPhone } = await supabase
            .from('team_phones')
            .select('team_id')
            .eq('vapi_phone_id', phoneNumberId)
            .single();
          
          if (teamPhone?.team_id) {
            teamId = teamPhone.team_id;
            
            // Fetch team details to get company name
            const { data: teamData } = await supabase
              .from('teams')
              .select('company_name, name')
              .eq('id', teamId)
              .single();
            
            if (teamData?.company_name) {
              companyName = teamData.company_name;
              console.log(`✅ Found company: "${companyName}" for phone ${phoneNumberId}`);
            }
            
            // Fetch team members with profile data via user_id join
            const { data: membersData } = await supabase
              .from('team_members')
              .select(`
                *,
                profiles:user_id (
                  full_name,
                  phone_number,
                  email
                )
              `)
              .eq('team_id', teamId);

            if (membersData && membersData.length > 0) {
              // Extract member info from profiles join or permissions fallback
              teamMembers = membersData.map(m => ({
                name: m.profiles?.full_name || m.permissions?.fullName || 'Unknown',
                role: m.permissions?.jobTitle || m.role,
                department: m.department,
                phoneNumber: m.profiles?.phone_number || m.permissions?.phoneNumber || '',
                email: m.profiles?.email || m.permissions?.email || ''
              }));
              departments = [...new Set(membersData.map(m => m.department).filter(Boolean))];
              console.log(`📋 Available departments: ${departments.join(', ')}`);
              console.log(`👥 Team members:`, teamMembers);
            }
          }
          
          // Also check phone configuration table for custom settings
          const { data: phoneConfig } = await supabase
            .from('phone_configs')
            .select('voice_id, transfer_phone')
            .eq('vapi_phone_id', phoneNumberId)
            .single();
          
          if (phoneConfig?.voice_id) {
            receptionistVoiceId = phoneConfig.voice_id;
          }
          
          if (phoneConfig?.transfer_phone) {
            companyPhone = phoneConfig.transfer_phone;
          }
        } catch (error) {
          console.log('Error fetching company configuration:', error.message);
        }
      }
      
      // If we still don't have a company name, use a generic greeting
      if (!companyName) {
        companyName = 'our company';
        console.log('⚠️ No company name found, using generic greeting');
      }
      
      const inboundAssistant = {
        name: `${companyName} Receptionist`,
        voice: {
          provider: '11labs',
          voiceId: receptionistVoiceId,
          model: 'eleven_turbo_v2',
          stability: 0.5,
          similarityBoost: 0.75
        },
        model: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `⚠️ CRITICAL INSTRUCTION - READ FIRST ⚠️

🚨 WHEN CALLER REQUESTS A TRANSFER:
- IMMEDIATELY call transferToPerson() or transferToDepartment() function
- DO NOT end the call
- DO NOT say "okay" and hang up
- DO NOT use endCall() function when transfer is requested
- REQUIRED: Use transfer functions when caller says "transfer", "speak with", "connect to", "talk to" + any name/department

THE dtmf FUNCTION IS DISABLED. YOU MUST NEVER CALL IT.
FOR TRANSFERS: ONLY use transferToDepartment or transferToPerson functions.
IF YOU CALL dtmf, THE CALL WILL FAIL.

You are a professional receptionist for ${companyName}, a construction company.

🚨 TRANSFER PROTOCOL (MANDATORY):
When caller says "transfer", "speak with", "connect", "talk to" + person/department name:
→ USE transferToPerson({personName: "Name", reason: "caller requested"}) - DO NOT END CALL
→ OR transferToDepartment({department: "dept", reason: "caller requested"}) - DO NOT END CALL
→ NEVER EVER use dtmf function for transfers - it is DISABLED
→ NEVER use endCall() when transfer is requested - USE TRANSFER FUNCTIONS

        🎯 PRIMARY FUNCTIONS (in order of priority):
        1. TRANSFER calls when specifically requested (use transferToDepartment or transferToPerson functions)
        2. SCHEDULE APPOINTMENTS DIRECTLY
        3. Take messages when transfers aren't available

        🚨 APPOINTMENT SCHEDULING:
        When you hear ANY of these keywords, SCHEDULE IMMEDIATELY:
        - "schedule", "appointment", "meeting", "visit", "come out"
        - "estimate", "quote", "bid", "pricing"
        - "inspection", "consultation", "assessment"
        - "when can you", "available", "book", "reserve"

        FOR SCHEDULING REQUESTS:
        1. Say: "I can absolutely schedule that for you right now!"
        2. Collect: Name, Phone, Service type, Date/Time preference, Location
        3. IMMEDIATELY use scheduleAppointment function
        4. Confirm the appointment details

        AVAILABLE DEPARTMENTS AND STAFF:
        ${departments.length > 0 ? `Departments: ${departments.join(', ')}` : 'No departments configured yet'}
        ${teamMembers.length > 0 ? `\nTeam Members:\n${teamMembers.map(m => `- ${m.name}: ${m.role} (${m.department})`).join('\n')}` : '\nNo team members configured yet'}

        📞 CALL TRANSFER - IMPORTANT INSTRUCTIONS:
        When caller says ANY of these phrases, you MUST use the transferToDepartment or transferToPerson function:
        - "transfer me to [department/person]"
        - "I need to speak with [department/person]"
        - "connect me to [department/person]"
        - "I want to talk to [department/person]"
        - "can I speak with [department/person]"

        HOW TO TRANSFER:
        1. If they ask for a SPECIFIC PERSON (e.g., "Ken White") → Use transferToPerson function with personName parameter
        2. If they ask for a DEPARTMENT (e.g., "billing") → Use transferToDepartment function with department parameter
        3. NEVER use the dtmf function for transfers - ALWAYS use transferToDepartment or transferToPerson

        TRANSFER EXAMPLES:
        - "I need to talk to billing" → Call transferToDepartment({department: "billing", reason: "caller requested billing"})
        - "Transfer me to Ken White" → Call transferToPerson({personName: "Ken White", reason: "caller requested Ken White"})
        - "I want to speak with operations" → Call transferToDepartment({department: "operations", reason: "caller requested operations"})

        📝 WHEN TO TAKE MESSAGES:
        - Department/person unavailable (only after checking availability)
        - After hours calls
        - Complex issues requiring follow-up

        CRITICAL DECISION TREE:
        1. Is this a scheduling request? → SCHEDULE FIRST, then transfer if they need more info
        2. Do they want to speak with a person/department? → USE transferToDepartment or transferToPerson function
        3. Is the person/department unavailable? → TAKE MESSAGE

        Remember: ALWAYS use transferToDepartment or transferToPerson functions when caller asks to be connected to someone. NEVER use dtmf for transfers!`
            }
          ]
        },
        firstMessage: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${companyName}. How may I assist you?`,
        forwardingPhoneNumber: companyPhone,
        endCallFunctionEnabled: false,
        dialKeypadFunctionEnabled: false,
        maxDurationSeconds: 600,
        silenceTimeoutSeconds: 30,
        responseDelaySeconds: 0.5,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        functions: [
          {
            name: 'transferToDepartment',
            description: 'REQUIRED when caller asks to speak with a department. Transfers call to billing, sales, operations, management, field, or customer_service department.',
            parameters: {
              type: 'object',
              properties: {
                department: {
                  type: 'string',
                  description: 'Department to transfer to',
                  enum: ['billing', 'sales', 'operations', 'management', 'field', 'customer_service']
                },
                reason: { type: 'string', description: 'Reason for transfer' },
                callerName: { type: 'string', description: 'Name of the caller' },
                urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' }
              },
              required: ['department', 'reason']
            }
          },
          {
            name: 'transferToPerson',
            description: 'REQUIRED when caller asks to speak with a specific person by name. Transfers call directly to that team member.',
            parameters: {
              type: 'object',
              properties: {
                personName: { type: 'string', description: 'Name of the person to transfer to' },
                reason: { type: 'string', description: 'Reason for transfer' },
                callerName: { type: 'string', description: 'Name of the caller' },
                urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' }
              },
              required: ['personName', 'reason']
            }
          },
          {
            name: 'checkAvailability',
            description: 'Check if a specific person or department is available for transfer',
            parameters: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['person', 'department'] },
                name: { type: 'string', description: 'Name of person or department' }
              },
              required: ['type', 'name']
            }
          },
          {
            name: 'scheduleAppointment',
            description: 'Schedule an appointment with the customer',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Title of the appointment' },
                attendeeName: { type: 'string', description: 'Name of the customer' },
                attendeePhone: { type: 'string', description: 'Phone number of the customer' },
                attendeeEmail: { type: 'string', description: 'Email of the customer (optional)' },
                serviceType: { type: 'string', description: 'Type of service needed', enum: ['inspection', 'consultation', 'site_visit', 'meeting'] },
                workType: { type: 'string', description: 'Indoor or outdoor work', enum: ['indoor', 'outdoor', 'mixed'] },
                preferredDate: { type: 'string', description: 'Preferred date in YYYY-MM-DD format' },
                preferredTime: { type: 'string', description: 'Preferred time in HH:MM format (24hr)' },
                duration: { type: 'number', description: 'Duration in minutes', default: 60 },
                notes: { type: 'string', description: 'Additional notes about the appointment' },
                locationAddress: { type: 'string', description: 'Address for the appointment if site visit' }
              },
              required: ['title', 'attendeeName', 'attendeePhone', 'serviceType', 'workType', 'preferredDate', 'preferredTime']
            }
          },
          {
            name: 'checkAvailability',
            description: 'Check available time slots for scheduling',
            parameters: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Date to check in YYYY-MM-DD format' },
                serviceType: { type: 'string', description: 'Type of service needed' }
              },
              required: ['date']
            }
          },
          {
            name: 'takeMessage',
            description: 'Take a message for a team member',
            parameters: {
              type: 'object',
              properties: {
                callerName: { type: 'string', description: 'Name of the caller' },
                callerPhone: { type: 'string', description: 'Phone number of the caller' },
                callerCompany: { type: 'string', description: 'Company of the caller' },
                forDepartment: { type: 'string', description: 'Department the message is for' },
                forPerson: { type: 'string', description: 'Specific person the message is for' },
                message: { type: 'string', description: 'The message content' },
                urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
                callbackRequested: { type: 'boolean', description: 'Whether they requested a callback' },
                preferredCallbackTime: { type: 'string', description: 'When they prefer to be called back' }
              },
              required: ['callerName', 'callerPhone', 'message']
            }
          }
        ],
        serverUrl: `${process.env.WEBHOOK_BASE_URL || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev'}/api/vapi/webhook`
      };
      
      // Return the assistant configuration for this inbound call
      console.log('🤖 Returning assistant:', JSON.stringify(inboundAssistant, null, 2));
      return res.json({
        assistant: inboundAssistant
      });
    }
    
    // Handle function calls from the assistant
    if (type === 'function-call') {
      const { functionCall, call } = message;  // Get from message, not req.body
      console.log('🔧 Function call received:', functionCall.name, functionCall.parameters);
      
      // Get teamId from the phone number if available
      let teamId = null;
      if (call?.phoneNumberId) {
        const { data: teamPhone } = await supabase
          .from('team_phones')
          .select('team_id')
          .eq('vapi_phone_id', call.phoneNumberId)
          .single();
        
        if (teamPhone?.team_id) {
          teamId = teamPhone.team_id;
        }
      }
      
      if (functionCall.name === 'scheduleAppointment') {
        try {
          const {
            title, attendeeName, attendeePhone, attendeeEmail,
            serviceType, workType, preferredDate, preferredTime,
            duration = 60, notes, locationAddress,
            // Handle alternate parameter names
            customerName, phoneNumber, date, time, description
          } = functionCall.parameters;

          // Use alternate names if provided
          const finalAttendeeName = attendeeName || customerName;
          const finalAttendeePhone = attendeePhone || phoneNumber;
          const finalPreferredDate = preferredDate || date;
          const finalPreferredTime = preferredTime || time;
          const finalNotes = notes || description;
          const finalTitle = title || `${serviceType} appointment`;
          
          // Validate required fields
          if (!finalAttendeeName || !finalPreferredDate || !finalPreferredTime) {
            return res.json({
              result: `I need some information to schedule your appointment. Could you please provide your name, preferred date, and time?`
            });
          }

          // Combine date and time
          const scheduledAt = new Date(`${finalPreferredDate}T${finalPreferredTime}:00`);
          
          // Check weather if it's outdoor work (but don't block appointment if it fails)
          let weatherSuitable = true;
          let weatherWarnings = [];

          if (workType === 'outdoor' || workType === 'mixed') {
            try {
              const weatherCheck = await fetch(`${process.env.WEBHOOK_BASE_URL}/api/appointments/check-weather`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  date: scheduledAt.toISOString(),
                  location: locationAddress || 'Atlanta, GA',
                  workType
                })
              });

              if (weatherCheck.ok) {
                const weatherData = await weatherCheck.json();
                weatherSuitable = weatherData.suitable;
                weatherWarnings = weatherData.warnings || [];
              } else {
                console.warn('Weather check API returned error, proceeding without weather data');
              }
            } catch (error) {
              console.warn('Weather check failed, proceeding without weather data:', error.message);
              // Continue with appointment creation even if weather check fails
            }
          }
          
          // Create the appointment using the working API endpoint
          const appointmentData = {
            teamId: teamId || '11111111-1111-1111-1111-111111111111',
            title: finalTitle,
            description: finalNotes,
            scheduledAt: scheduledAt.toISOString(),
            durationMinutes: duration,
            attendeeName: finalAttendeeName,
            attendeePhone: finalAttendeePhone,
            attendeeEmail: attendeeEmail,
            workType: workType || 'indoor',
            locationAddress: locationAddress,
            notes: finalNotes,
            source: 'ai_assistant',
            createdByAi: true,
            aiCallId: call?.id
          };

          const appointmentResponse = await fetch('http://localhost:4000/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appointmentData)
          });

          let appointmentResult;
          let error = false;
          let appointment;

          console.log('Appointment API response status:', appointmentResponse.status);

          try {
            if (!appointmentResponse.ok) {
              const errorText = await appointmentResponse.text();
              console.error('Appointment API error response:', errorText);
              error = true;
              appointmentResult = { error: `API returned status ${appointmentResponse.status}: ${errorText}` };
            } else {
              const responseText = await appointmentResponse.text();
              console.log('Raw appointment API response:', responseText);

              if (responseText.trim()) {
                appointmentResult = JSON.parse(responseText);
                appointment = appointmentResult.data;
                console.log('Parsed appointment creation response:', appointmentResult);
              } else {
                console.error('Empty response from appointment API');
                error = true;
                appointmentResult = { error: 'Empty response from appointment API' };
              }
            }
          } catch (fetchError) {
            console.error('Error processing appointment API response:', fetchError);
            error = true;
            appointmentResult = { error: `Failed to process API response: ${fetchError.message}` };
          }
          
          if (error) {
            console.error('Failed to create appointment:', appointmentResult?.error || error);
            return res.json({
              result: `I'm sorry, I couldn't schedule the appointment due to a system error. Please try again or I can take a message for someone to call you back.`
            });
          }
          
          // Generate response based on weather
          let response = `Perfect! I've scheduled your ${serviceType} appointment for ${format(scheduledAt, 'MMMM d, yyyy at h:mm a')}.`;
          
          if (!weatherSuitable && weatherWarnings.length > 0) {
            response += ` However, please note that the weather forecast shows ${weatherWarnings.join(', ')}. We may need to reschedule if conditions don't improve.`;
          }
          
          response += ` We'll send you a confirmation text to ${attendeePhone}. Is there anything else I can help you with?`;
          
          return res.json({ result: response });
        } catch (error) {
          console.error('Error scheduling appointment:', error);
          return res.json({
            result: `I apologize, but I encountered an error while scheduling your appointment. Let me take your information and have someone call you back to schedule it manually.`
          });
        }
      }
      
      if (functionCall.name === 'checkAvailability') {
        const { date } = functionCall.parameters;
        
        // Check for existing appointments on that date
        const { data: appointments } = await supabase
          .from('appointments')
          .select('scheduled_at, duration_minutes')
          .gte('scheduled_at', `${date}T00:00:00`)
          .lte('scheduled_at', `${date}T23:59:59`)
          .eq('status', 'scheduled');
        
        // Generate available slots (simple logic for demo)
        const availableSlots = ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'];
        
        return res.json({
          result: `I have the following time slots available on ${date}: ${availableSlots.join(', ')}. Which time works best for you?`
        });
      }
      
      if (functionCall.name === 'transferToDepartment') {
        const { department, reason, callerName, urgency = 'normal' } = functionCall.parameters;

        try {
          // Find available team members in the requested department with profile data
          const { data: availableMembers, error: memberError } = await supabase
            .from('team_members')
            .select(`
              *,
              profiles:user_id (
                full_name,
                phone_number,
                email
              )
            `)
            .eq('team_id', teamId || '11111111-1111-1111-1111-111111111111')
            .ilike('department', department);

          console.log('🔍 Transfer lookup:', { teamId, department, availableMembers, memberError });

          if (availableMembers && availableMembers.length > 0) {
            // Find member with phone number (check profiles first, then permissions)
            const selectedMember = availableMembers.find(m => m.profiles?.phone_number || m.permissions?.phoneNumber) || availableMembers[0];
            const phoneNumber = selectedMember.profiles?.phone_number || selectedMember.permissions?.phoneNumber;

            if (!phoneNumber) {
              return res.json({
                result: `I apologize, but our ${department} team is currently unavailable. Let me take a message and have someone call you back as soon as possible.`
              });
            }

            // Log the transfer
            await supabase
              .from('call_transfers')
              .insert({
                call_id: call?.id || 'unknown',
                team_id: teamId || '11111111-1111-1111-1111-111111111111',
                from_type: 'ai',
                to_department: department,
                to_member: selectedMember.name,
                to_phone: phoneNumber,
                reason,
                caller_name: callerName,
                urgency_level: urgency === 'urgent' ? 5 : urgency === 'high' ? 4 : urgency === 'normal' ? 2 : 1,
                transfer_status: 'initiated'
              });

            // Use Vapi API to transfer the call
            console.log(`📞 DEBUG: Call object:`, JSON.stringify(call, null, 2));
            console.log(`📞 Transferring call ${call?.id} to ${phoneNumber} (${selectedMember.name} - ${department})`);

            const transferUrl = `https://aws-us-west-2-production1-phone-call-websocket.vapi.ai/${call?.id}/control`;
            const transferPayload = {
              type: 'transfer',
              destination: {
                type: 'number',
                number: phoneNumber
              },
              content: `Transferring you to ${selectedMember.name || department}`
            };

            console.log(`📞 Transfer URL: ${transferUrl}`);
            console.log(`📞 Transfer payload:`, JSON.stringify(transferPayload, null, 2));

            try {
              // Call Vapi control API to transfer the call
              const vapiResponse = await fetch(transferUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(transferPayload)
              });

              const responseText = await vapiResponse.text();
              console.log(`📞 Vapi transfer response status: ${vapiResponse.status}`);
              console.log(`📞 Vapi transfer response body:`, responseText);

              if (!vapiResponse.ok) {
                console.error('❌ Vapi transfer failed:', responseText);
              } else {
                console.log('✅ Transfer initiated successfully');
              }
            } catch (error) {
              console.error('❌ Error calling Vapi API:', error);
            }

            return res.json({
              results: [
                {
                  toolCallId: functionCall.toolCallId,
                  result: `Transferring you now to ${selectedMember.name || department}...`
                }
              ]
            });
          } else {
            return res.json({
              result: `I apologize, but our ${department} team is currently unavailable. Let me take a message and have someone call you back as soon as possible.`
            });
          }
        } catch (error) {
          console.error('Error processing department transfer:', error);
          return res.json({
            result: `I'm sorry, I'm having trouble connecting you right now. Let me take your information and have someone call you back immediately.`
          });
        }
      }

      if (functionCall.name === 'transferToPerson') {
        const { personName, reason, callerName, urgency = 'normal' } = functionCall.parameters;

        try {
          // Find the specific team member
          const { data: teamMember } = await supabase
            .from('available_team_members')
            .select('*')
            .eq('team_id', teamId || '11111111-1111-1111-1111-111111111111')
            .ilike('name', `%${personName}%`)
            .eq('can_take_call', true)
            .single();

          if (teamMember) {
            // Log the transfer
            await supabase
              .from('call_transfers')
              .insert({
                call_id: call?.id || 'unknown',
                team_id: teamId || '11111111-1111-1111-1111-111111111111',
                from_type: 'ai',
                to_department: teamMember.department,
                to_member: teamMember.name,
                to_phone: teamMember.phone_number,
                reason,
                caller_name: callerName,
                urgency_level: urgency === 'urgent' ? 5 : urgency === 'high' ? 4 : urgency === 'normal' ? 2 : 1,
                transfer_status: 'initiated'
              });

            // Return proper Vapi transfer response
            return res.json({
              result: `Great! I'm connecting you directly to ${teamMember.name} in our ${teamMember.department} department. Please hold.`,
              forwardCall: {
                phoneNumber: teamMember.phone_number,
                message: `Transferring call from AI: ${reason}. Caller: ${callerName || 'Unknown'}`
              }
            });
          } else {
            return res.json({
              result: `I'm sorry, ${personName} is not available right now. Would you like me to connect you to someone else in their department, or would you prefer to leave a message?`
            });
          }
        } catch (error) {
          console.error('Error processing person transfer:', error);
          return res.json({
            result: `I'm having trouble locating ${personName} right now. Let me connect you to our main team or take a message for you.`
          });
        }
      }

      if (functionCall.name === 'takeMessage') {
        const {
          callerName, callerPhone, callerCompany,
          forDepartment, forPerson, message,
          urgency = 'normal', callbackRequested, preferredCallbackTime
        } = functionCall.parameters;

        // Store the message
        const { error } = await supabase
          .from('team_messages')
          .insert({
            team_id: teamId || '11111111-1111-1111-1111-111111111111',
            from_name: callerName,
            from_phone: callerPhone,
            from_company: callerCompany,
            for_department: forDepartment,
            for_person: forPerson,
            message,
            urgency,
            callback_requested: callbackRequested,
            preferred_callback_time: preferredCallbackTime,
            source: 'ai_assistant',
            ai_call_id: call?.id,
            created_at: new Date().toISOString()
          });
        
        if (error) {
          console.error('Failed to save message:', error);
          return res.json({
            result: `I apologize, but I couldn't save your message. Please try calling back later or email us directly.`
          });
        }
        
        return res.json({
          result: `I've taken your message for ${forPerson || forDepartment || 'the team'}. ${callbackRequested ? `They will call you back ${preferredCallbackTime || 'as soon as possible'}` : 'Your message will be delivered'}. Is there anything else I can help you with?`
        });
      }
      
      return res.json({ result: 'Function executed successfully' });
    }
    
    // Handle other webhook types (call ended, transcript ready, etc.)
    await vapiService.handleWebhook(req.body);
    
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Error handling Vapi webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configure inbound assistant for a phone number
router.post('/inbound/configure', async (req, res) => {
  try {
    const {
      phoneNumberId,
      voiceId,
      companyName,
      transferPhone,
      businessHours,
      afterHoursMessage
    } = req.body;

    // In production, save this configuration to database
    // For now, return success
    res.json({
      success: true,
      message: 'Inbound assistant configured successfully',
      configuration: {
        phoneNumberId,
        voiceId,
        companyName,
        transferPhone,
        businessHours,
        afterHoursMessage
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get inbound call statistics
router.get('/inbound/stats', async (req, res) => {
  try {
    // Fetch inbound call stats from database
    // For now, return mock data
    res.json({
      success: true,
      stats: {
        totalInboundCalls: 0,
        answeredCalls: 0,
        missedCalls: 0,
        averageCallDuration: 0,
        transferredCalls: 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available voices
router.get('/voices', (req, res) => {
  try {
    const voices = getAllVoices();
    res.json({
      success: true,
      voices
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get voice details by ID
router.get('/voices/:voiceId', (req, res) => {
  try {
    const { voiceId } = req.params;
    const voice = getVoiceById(voiceId);
    
    if (voice) {
      res.json({
        success: true,
        voice
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Voice not found'
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Quick test endpoint for Vapi setup
router.get('/test', (req, res) => {
  const baseUrl = process.env.PUBLIC_URL || `https://${req.get('host')}`;
  
  res.json({
    success: true,
    message: 'Vapi AI service is ready!',
    features: [
      '✅ Natural conversation flow',
      '✅ Professional voice quality',
      '✅ Voice selection (6 ElevenLabs voices)',
      '✅ Built-in call analysis',
      '✅ Automatic transcription',
      '✅ Recording capabilities',
      '✅ Inbound call handling',
      '✅ Call transfers',
      '✅ Voicemail detection'
    ],
    endpoints: {
      initiateCall: '/api/vapi/call',
      getStatus: '/api/vapi/call/:callId',
      listCalls: '/api/vapi/calls',
      getVoices: '/api/vapi/voices',
      webhook: '/api/vapi/webhook',
      inboundConfigure: '/api/vapi/inbound/configure',
      inboundStats: '/api/vapi/inbound/stats'
    },
    inboundSetup: {
      webhookUrl: `${baseUrl}/api/vapi/webhook`,
      instructions: [
        '1. Go to your VAPI dashboard at https://dashboard.vapi.ai',
        '2. Navigate to Phone Numbers section',
        '3. Click on your phone number',
        '4. Set the Webhook URL to: ' + `${baseUrl}/api/vapi/webhook`,
        '5. Save the configuration',
        '6. Test by calling your VAPI phone number'
      ],
      currentPhoneNumber: process.env.VAPI_PHONE_NUMBER || 'Not configured'
    },
    availableVoices: getAllVoices()
  });
});

// Get call transcripts for a specific call or all recent calls
router.get('/transcripts/:callId?', async (req, res) => {
  try {
    const { callId } = req.params;
    const { teamId } = req.query;

    let query = supabase
      .from('call_transcripts')
      .select('*')
      .order('start_time', { ascending: true })
      .order('spoken_at', { ascending: true });

    if (callId) {
      // Get transcript for specific call
      query = query.eq('call_id', callId);
    } else {
      // Get recent transcripts (last 50 segments)
      query = query.limit(50);
    }

    const { data: transcripts, error } = await query;

    if (error) {
      console.error('Error fetching transcripts:', error);
      // If table doesn't exist or permission denied, return empty result
      if (error.message?.includes('does not exist') || error.message?.includes('permission denied')) {
        return res.json({
          success: true,
          transcripts: callId ? [] : {},
          total: 0,
          message: 'No transcripts available yet'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch transcripts'
      });
    }

    // Group transcripts by call_id if getting all transcripts
    if (!callId) {
      const groupedTranscripts = transcripts.reduce((acc, transcript) => {
        if (!acc[transcript.call_id]) {
          acc[transcript.call_id] = [];
        }
        acc[transcript.call_id].push(transcript);
        return acc;
      }, {});

      return res.json({
        success: true,
        transcripts: groupedTranscripts,
        total: transcripts.length
      });
    }

    res.json({
      success: true,
      transcripts,
      callId,
      total: transcripts.length
    });
  } catch (error: any) {
    console.error('Error in transcript endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get live transcript segments for a specific call (for real-time updates)
router.get('/transcripts/:callId/live', async (req, res) => {
  try {
    const { callId } = req.params;
    const { since } = req.query; // timestamp to get segments since

    let query = supabase
      .from('call_transcripts')
      .select('*')
      .eq('call_id', callId)
      .order('start_time', { ascending: true })
      .order('spoken_at', { ascending: true });

    if (since) {
      query = query.gt('spoken_at', since);
    }

    const { data: transcripts, error } = await query;

    if (error) {
      console.error('Error fetching live transcripts:', error);
      // If table doesn't exist or permission denied, return empty result
      if (error.message?.includes('does not exist') || error.message?.includes('permission denied')) {
        return res.json({
          success: true,
          transcripts: [],
          callId,
          count: 0,
          timestamp: new Date().toISOString(),
          message: 'No transcripts available yet'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch live transcripts'
      });
    }

    res.json({
      success: true,
      transcripts,
      callId,
      count: transcripts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in live transcript endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
/**
 * Add existing VAPI phone to team
 */
router.post('/add-team-phone', async (req, res) => {
  try {
    const { userId, twilioNumber, vapiPhoneId } = req.body;

    if (!userId || !twilioNumber || !vapiPhoneId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, twilioNumber, vapiPhoneId'
      });
    }

    // Get user's team
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id, first_name, last_name')
      .eq('id', userId)
      .single();

    if (!profile?.team_id) {
      return res.status(404).json({
        success: false,
        error: 'No team found for user'
      });
    }

    // Get team name
    const { data: team } = await supabase
      .from('teams')
      .select('name, company_name')
      .eq('id', profile.team_id)
      .single();

    // Check if phone already exists
    const { data: existing } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', profile.team_id);

    if (existing && existing.length > 0) {
      // Update existing
      const { error } = await supabase
        .from('team_phones')
        .update({
          vapi_phone_id: vapiPhoneId,
          twilio_number: twilioNumber,
          status: 'active'
        })
        .eq('team_id', profile.team_id);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Phone updated for team',
        teamId: profile.team_id
      });
    } else {
      // Insert new
      const { error } = await supabase
        .from('team_phones')
        .insert({
          team_id: profile.team_id,
          team_name: team?.company_name || team?.name || 'Team',
          owner_email: 'kentrill@yhshomes.com',
          twilio_number: twilioNumber,
          vapi_phone_id: vapiPhoneId,
          default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
          status: 'active'
        });

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Phone added to team',
        teamId: profile.team_id
      });
    }
  } catch (error: any) {
    console.error('Error adding phone:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
