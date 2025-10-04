/**
 * Vapi Webhook Handlers
 * Handle function calls and transfer requests from AI assistant
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import aiReceptionistService from '../services/ai-receptionist.service';
import weatherService from '../services/weather.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Vapi webhook endpoint for function calls
 */
router.post('/vapi/webhooks/function-call', async (req, res) => {
  try {
    console.log('🔍 Webhook received - body keys:', Object.keys(req.body));
    console.log('🔍 Full webhook body:', JSON.stringify(req.body, null, 2));

    const { message } = req.body;

    // Handle new VAPI tool-calls format
    if (message?.type === 'tool-calls') {
      const { call, toolCallList } = message;
      const results = [];

      for (const toolCall of toolCallList || []) {
        const { id, name: functionName, parameters } = toolCall;

        console.log('📞 Tool call received:', { functionName, parameters, toolCallId: id });

        let result;
        switch (functionName) {
          case 'transferToPerson':
            result = await handleTransferCallNew(call, { memberName: parameters.personName, ...parameters });
            break;
          case 'transferToDepartment':
            result = await handleTransferCallNew(call, parameters);
            break;
          case 'scheduleAppointment':
            result = await handleScheduleAppointment(call, parameters);
            break;
          case 'getWeather':
            result = await handleGetWeather(parameters);
            break;
          default:
            result = { error: 'Unknown function' };
        }

        results.push({
          name: functionName,
          toolCallId: id,
          result: JSON.stringify(result)
        });
      }

      return res.json({ results });
    }

    // Fallback for old format (keep for compatibility)
    const { call, functionCall } = req.body;
    if (!functionCall) {
      console.log('⚠️ No functionCall in webhook body');
      return res.json({ result: 'No function call data received' });
    }

    const { name: functionName, parameters } = functionCall;

    switch (functionName) {
      case 'transferToPerson':
        return await handleTransferCall(req, res, call, { memberName: parameters.personName, ...parameters });

      case 'transferToDepartment':
        return await handleTransferCall(req, res, call, parameters);

      default:
        console.log('⚠️ Unknown function call received:', functionName);
        res.json({
          result: 'I\'m not sure how to handle that request.'
        });
    }
    
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.json({
      result: 'I apologize, I\'m having technical difficulties. Please try again.'
    });
  }
});

/**
 * Handle transfer request - New format for tool-calls
 */
async function handleTransferCallNew(call: any, params: any) {
  try {
    const { department, memberName, reason } = params;
    const teamId = call.assistantId;

    // Find the team member to transfer to
    let query = supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId);

    if (memberName) {
      query = query.eq('name', memberName);
    } else if (department) {
      query = query.eq('department', department);
    }

    const { data: members } = await query;

    if (members && members.length > 0) {
      const member = members[0];

      // Return transfer destination
      return {
        destination: {
          type: 'number',
          number: member.phone_number,
          message: `Transferring to ${member.name}`
        }
      };
    } else {
      return { error: `${memberName || department} not available` };
    }
  } catch (error) {
    console.error('Transfer error:', error);
    return { error: 'Transfer failed' };
  }
}

/**
 * Handle transfer request - Old format
 */
async function handleTransferCall(req: any, res: any, call: any, params: any) {
  try {
    const { department, memberName, reason } = params;
    const teamId = call.assistantId; // We'll map this to team
    
    // Log the transfer request
    await supabase.from('call_transfers').insert({
      call_id: call.id,
      team_id: teamId,
      from_type: 'ai',
      to_department: department,
      to_member: memberName,
      reason: reason,
      caller_name: call.customer?.name,
      caller_phone: call.customer?.number,
      transferred_at: new Date().toISOString()
    });

    // Find the team member to transfer to
    let query = supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId);

    if (memberName) {
      query = query.eq('name', memberName);
    } else if (department) {
      query = query.eq('department', department);
    }

    const { data: members } = await query;

    if (members && members.length > 0) {
      const member = members[0];
      
      // Update member's transfer count
      await supabase
        .from('team_members')
        .update({
          transfers_today: member.transfers_today + 1,
          total_transfers_received: member.total_transfers_received + 1,
          last_call_at: new Date().toISOString()
        })
        .eq('id', member.id);

      // Return transfer instruction to Vapi
      res.json({
        action: 'transfer',
        destination: {
          type: 'number',
          number: member.phone_number,
          message: `Transferring you to ${member.name}, our ${member.role}. Please hold.`
        },
        result: `Transferring to ${member.name}`
      });
      
    } else {
      // No available member, offer to take a message
      res.json({
        result: `I'm sorry, ${memberName || 'that department'} is not available right now. Would you like me to take a message?`
      });
    }
    
  } catch (error) {
    console.error('Transfer error:', error);
    res.json({
      result: 'I\'m having trouble transferring your call. Can I take a message instead?'
    });
  }
}

/**
 * Handle taking a message
 */
async function handleTakeMessage(req: any, res: any, call: any, params: any) {
  try {
    const { for: forMember, from, phone, message, urgent } = params;
    const teamId = call.assistantId;
    
    // Find the team member
    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('name', forMember)
      .single();

    // Save the message
    const { error } = await supabase.from('team_messages').insert({
      team_id: teamId,
      for_member_id: member?.id,
      from_name: from,
      from_phone: phone,
      message: message,
      urgent: urgent || false,
      taken_by: 'ai',
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    res.json({
      result: `I've taken your message for ${forMember}. ${urgent ? 'I\'ve marked it as urgent and' : ''} They will get back to you as soon as possible.`
    });
    
  } catch (error) {
    console.error('Message error:', error);
    res.json({
      result: 'I\'ve noted your message and will make sure it gets delivered.'
    });
  }
}

/**
 * Handle scheduling a callback
 */
async function handleScheduleCallback(req: any, res: any, call: any, params: any) {
  try {
    const { callerName, callerPhone, preferredTime, topic, department } = params;
    const teamId = call.assistantId;
    
    // Parse the preferred time (could be like "tomorrow at 2pm" or "Monday morning")
    let scheduledAt = new Date();
    
    // Simple time parsing (you could enhance this with natural language processing)
    if (preferredTime.toLowerCase().includes('tomorrow')) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
      scheduledAt.setHours(14, 0, 0, 0); // Default to 2 PM
    } else if (preferredTime.toLowerCase().includes('morning')) {
      scheduledAt.setHours(10, 0, 0, 0); // Default to 10 AM
    } else if (preferredTime.toLowerCase().includes('afternoon')) {
      scheduledAt.setHours(14, 0, 0, 0); // Default to 2 PM
    } else if (preferredTime.toLowerCase().includes('evening')) {
      scheduledAt.setHours(17, 0, 0, 0); // Default to 5 PM
    }
    
    // Create an appointment in the new appointments table
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        team_id: teamId,
        title: `Callback: ${callerName}`,
        description: `Topic: ${topic}. Department: ${department || 'General'}`,
        type: 'call',
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: 30,
        attendee_name: callerName,
        attendee_phone: callerPhone,
        location_type: 'phone',
        location_details: callerPhone,
        notes: `Preferred time: ${preferredTime}. Topic: ${topic}`,
        source: 'ai_assistant',
        created_by_ai: true,
        ai_call_id: call.id
      })
      .select()
      .single();
    
    if (appointmentError) {
      console.error('Error creating appointment:', appointmentError);
      
      // Fallback to the old message system
      await supabase.from('team_messages').insert({
        team_id: teamId,
        from_name: callerName,
        from_phone: callerPhone,
        message: `Callback requested. Topic: ${topic}`,
        preferred_callback_time: preferredTime,
        callback_requested: true,
        created_at: new Date().toISOString()
      });
    }
    
    // Create a reminder if appointment was successful
    if (appointment) {
      const reminderTime = new Date(scheduledAt);
      reminderTime.setMinutes(reminderTime.getMinutes() - 15); // 15 minutes before
      
      await supabase
        .from('appointment_reminders')
        .insert({
          appointment_id: appointment.id,
          type: 'sms',
          send_at: reminderTime.toISOString(),
          recipient_phone: callerPhone,
          message: `Reminder: You have a callback scheduled in 15 minutes regarding ${topic}`
        });
    }

    res.json({
      result: `Perfect! I've scheduled a callback for ${preferredTime}. Someone from our ${department || 'team'} will call you at ${callerPhone} to discuss ${topic}. You'll receive a reminder before the call.`
    });
    
  } catch (error) {
    console.error('Callback error:', error);
    res.json({
      result: 'I\'ve noted your callback request. Our team will reach out to you soon.'
    });
  }
}

/**
 * Handle appointment scheduling (OLD - not used)
 */
async function handleScheduleAppointmentOld(req: any, res: any, call: any, params: any) {
  try {
    const {
      appointmentType,
      customerName,
      customerPhone,
      preferredDate,
      preferredTime,
      projectAddress,
      notes
    } = params;

    console.log('📅 Scheduling appointment from AI call:', {
      params,
      callId: call.id,
      assistantId: call.assistantId,
      customer: call.customer
    });

    // Use AI to parse natural language date/time
    const aiParseResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/ai/schedule-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: `Schedule ${appointmentType} with ${customerName} on ${preferredDate} at ${preferredTime}`,
        teamId: call.assistantId || '11111111-1111-1111-1111-111111111111',
        projects: [], // Would normally fetch from database
        currentDate: new Date().toISOString()
      })
    });

    if (!aiParseResponse.ok) {
      throw new Error('Failed to parse appointment details');
    }

    const aiParsedData = await aiParseResponse.json();
    console.log('🤖 AI parsing response:', aiParsedData);

    if (!aiParsedData.success) {
      console.error('❌ AI parsing failed:', aiParsedData.error);
      throw new Error(aiParsedData.error || 'AI parsing failed');
    }

    const appointmentData = aiParsedData.appointment;
    console.log('📋 Parsed appointment data:', appointmentData);

    // Ensure we have valid date and time
    const appointmentDate = appointmentData.date || new Date().toISOString().split('T')[0];
    const appointmentTime = appointmentData.time || '10:00';
    const scheduledAt = `${appointmentDate}T${appointmentTime}:00Z`; // Add timezone

    // Determine work type
    const workType = appointmentType === 'site_visit' ? 'outdoor' : 'indoor';

    // Check weather for outdoor work
    let weatherWarnings: string[] = [];
    let weatherRecommendation = '';
    let alternativeDate: Date | undefined;

    if (workType === 'outdoor' && projectAddress) {
      try {
        console.log('☁️ Checking weather for outdoor appointment...');
        const scheduledDate = new Date(`${appointmentDate}T${appointmentTime}:00`);
        const weatherCheck = await weatherService.checkSchedulingDate(
          projectAddress,
          scheduledDate,
          'outdoor'
        );

        weatherWarnings = weatherCheck.warnings;
        weatherRecommendation = weatherCheck.recommendation;
        alternativeDate = weatherCheck.alternativeDate;

        console.log('🌤️ Weather check result:', {
          canProceed: weatherCheck.canProceed,
          warnings: weatherWarnings,
          recommendation: weatherRecommendation
        });

        // Add weather info to notes
        if (weatherWarnings.length > 0) {
          console.log('⚠️ Weather warnings detected for appointment');
        }
      } catch (weatherError) {
        console.error('⚠️ Weather check failed:', weatherError);
        weatherWarnings.push('Unable to check weather - please verify conditions before appointment');
      }
    }

    // Create the appointment
    const appointmentInsertData = {
      team_id: call.assistantId || '11111111-1111-1111-1111-111111111111',
      title: appointmentData.title || `${appointmentType} with ${customerName}`,
      type: appointmentType,
      scheduled_at: scheduledAt,
      duration_minutes: 60,
      attendee_name: customerName,
      attendee_phone: customerPhone || call.customer?.number,
      location_address: projectAddress,
      work_type: workType,
      notes: `Scheduled during AI call. ${notes || ''}${weatherWarnings.length > 0 ? `\n\n⚠️ Weather: ${weatherWarnings.join('; ')}` : ''}`,
      source: 'ai_call',
      created_by_ai: true,
      ai_call_id: call.id,
      status: 'scheduled'
    };

    console.log('💾 Inserting appointment into database:', appointmentInsertData);

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert(appointmentInsertData)
      .select()
      .single();

    if (appointmentError) {
      console.error('❌ Database error creating appointment:', appointmentError);
      throw appointmentError;
    }

    console.log('✅ Appointment created successfully:', appointment);

    // Create reminder
    if (appointment && (customerPhone || call.customer?.number)) {
      try {
        const reminderTime = new Date(`${appointmentDate}T${appointmentTime}:00Z`);
        reminderTime.setHours(reminderTime.getHours() - 1); // 1 hour before

        const { error: reminderError } = await supabase
          .from('appointment_reminders')
          .insert({
            appointment_id: appointment.id,
            type: 'sms',
            send_at: reminderTime.toISOString(),
            recipient_phone: customerPhone || call.customer?.number,
            message: `Reminder: You have a ${appointmentType} scheduled in 1 hour at ${appointmentTime}`
          });

        if (reminderError) {
          console.error('⚠️ Warning: Failed to create reminder:', reminderError);
          // Don't fail the whole appointment for reminder issues
        } else {
          console.log('🔔 Reminder created successfully');
        }
      } catch (reminderErr) {
        console.error('⚠️ Warning: Error creating reminder:', reminderErr);
        // Don't fail the whole appointment for reminder issues
      }
    }

    console.log('✅ Appointment scheduled successfully:', appointment.id);

    // Build response with weather info if applicable
    let responseMessage = `Perfect! I've scheduled your ${appointmentType} for ${preferredDate} at ${preferredTime}. You'll receive a reminder before the appointment.`;

    if (weatherWarnings.length > 0) {
      responseMessage += `\n\nWeather note: ${weatherRecommendation}`;

      if (alternativeDate && !weatherRecommendation.toLowerCase().includes('good') && !weatherRecommendation.toLowerCase().includes('excellent')) {
        const altDateStr = alternativeDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        responseMessage += ` If you'd like, I can reschedule to ${altDateStr} when conditions will be better.`;
      }
    }

    res.json({
      result: responseMessage
    });

  } catch (error) {
    console.error('❌ Error scheduling appointment:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      params,
      callId: call?.id,
      assistantId: call?.assistantId
    });

    res.json({
      result: 'I\'ve noted your appointment request. Our team will confirm the details with you shortly.'
    });
  }
}

/**
 * Check team member availability
 */
async function handleCheckAvailability(_req: any, res: any, call: any, params: any) {
  try {
    const { department, memberName } = params;
    const teamId = call.assistantId;
    
    let query = supabase
      .from('available_team_members')
      .select('name, department, availability')
      .eq('team_id', teamId);

    if (memberName) {
      query = query.eq('name', memberName);
    } else if (department) {
      query = query.eq('department', department);
    }

    const { data: members } = await query;

    if (!members || members.length === 0) {
      res.json({
        result: `${memberName || department} is not available right now. Would you like to leave a message?`
      });
      return;
    }

    const available = members.filter(m => m.availability === 'available');
    
    if (available.length > 0) {
      res.json({
        result: `Yes, ${memberName || `someone in ${department}`} is available. Would you like me to transfer you?`
      });
    } else {
      const busy = members.filter(m => m.availability === 'busy');
      if (busy.length > 0) {
        res.json({
          result: `${memberName || `The ${department} team`} is currently busy with another call. Would you like to hold or leave a message?`
        });
      } else {
        res.json({
          result: `${memberName || `The ${department} team`} is offline right now. Can I take a message?`
        });
      }
    }
    
  } catch (error) {
    console.error('Availability check error:', error);
    res.json({
      result: 'Let me check on that for you. One moment please.'
    });
  }
}

/**
 * Handle call status updates
 */
router.post('/vapi/webhooks/status-update', async (req, res) => {
  try {
    const { call, status } = req.body;
    
    console.log('📞 Call status update:', status, call.id);

    // Update call log
    await supabase
      .from('call_logs')
      .update({
        status: status.type,
        duration_seconds: status.duration,
        ended_at: status.endedAt,
        cost_estimate: status.cost
      })
      .eq('vapi_call_id', call.id);

    res.json({ success: true });
    
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Failed to update call status' });
  }
});

/**
 * Handle call ended webhook
 */
router.post('/vapi/webhooks/call-ended', async (req, res) => {
  try {
    const { call, reason, recording } = req.body;
    
    console.log('📞 Call ended:', call.id, reason);

    // Update call log with final details
    await supabase
      .from('call_logs')
      .update({
        status: 'completed',
        duration_seconds: call.duration,
        ended_at: new Date().toISOString(),
        recording_url: recording?.url
      })
      .eq('vapi_call_id', call.id);

    // Update any pending transfers
    await supabase
      .from('call_transfers')
      .update({
        transfer_status: reason === 'hangup' ? 'completed' : 'failed',
        duration_seconds: call.duration
      })
      .eq('call_id', call.id)
      .eq('transfer_status', 'initiated');

    res.json({ success: true });
    
  } catch (error) {
    console.error('Call ended error:', error);
    res.status(500).json({ error: 'Failed to handle call end' });
  }
});

/**
 * Get project information for the team
 */
async function handleGetProjectInfo(req: any, res: any, call: any, params: any) {
  try {
    const { projectName, projectId } = params;

    // Get team ID from phone number
    const { data: teamData } = await supabase
      .from('teams')
      .select('id, name')
      .eq('twilio_phone_number', call.phoneNumberId)
      .single();

    if (!teamData) {
      return res.json({
        result: 'I apologize, I couldn\'t find information about this team.'
      });
    }

    const teamId = teamData.id;

    // Fetch projects
    let projectQuery = supabase
      .from('projects')
      .select(`
        *,
        phases (
          id,
          name,
          status,
          start_date,
          end_date,
          budget,
          spent
        )
      `)
      .eq('team_id', teamId)
      .in('status', ['active', 'in_progress', 'planning']);

    if (projectId) {
      projectQuery = projectQuery.eq('id', projectId);
    } else if (projectName) {
      projectQuery = projectQuery.ilike('name', `%${projectName}%`);
    }

    const { data: projects } = await projectQuery.limit(5);

    // Fetch vendors for this team
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name, company, phone, email, category, status')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .limit(10);

    // Fetch upcoming schedule
    const today = new Date().toISOString().split('T')[0];
    const { data: schedule } = await supabase
      .from('scheduled_tasks')
      .select('id, task_name, scheduled_date, assigned_to, status')
      .eq('team_id', teamId)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(10);

    // Format the response
    let response = `Here's what I found for ${teamData.name}:\n\n`;

    if (projects && projects.length > 0) {
      response += `**Active Projects (${projects.length}):**\n`;
      projects.forEach(p => {
        response += `- ${p.name} (${p.status})`;
        if (p.address) response += ` at ${p.address}`;
        response += `\n`;

        if (p.phases && p.phases.length > 0) {
          const activePhases = p.phases.filter((ph: any) => ph.status === 'in_progress');
          if (activePhases.length > 0) {
            response += `  Current phase: ${activePhases[0].name}\n`;
          }
        }
      });
      response += `\n`;
    }

    if (vendors && vendors.length > 0) {
      response += `**Available Vendors (${vendors.length}):**\n`;
      vendors.slice(0, 5).forEach(v => {
        response += `- ${v.name}`;
        if (v.company) response += ` (${v.company})`;
        response += ` - ${v.category}`;
        if (v.phone) response += ` - ${v.phone}`;
        response += `\n`;
      });
      response += `\n`;
    }

    if (schedule && schedule.length > 0) {
      response += `**Upcoming Schedule (${schedule.length} items):**\n`;
      schedule.slice(0, 5).forEach(s => {
        response += `- ${s.scheduled_date}: ${s.task_name}`;
        if (s.assigned_to) response += ` (assigned to ${s.assigned_to})`;
        response += `\n`;
      });
    }

    res.json({ result: response });

  } catch (error) {
    console.error('Get project info error:', error);
    res.json({
      result: 'I apologize, I\'m having trouble accessing that information right now.'
    });
  }
}

/**
 * Look up vendor contact information
 */
async function handleLookupVendor(req: any, res: any, call: any, params: any) {
  try {
    const { vendorName, category } = params;

    // Get team ID from phone number
    const { data: teamData } = await supabase
      .from('teams')
      .select('id')
      .eq('twilio_phone_number', call.phoneNumberId)
      .single();

    if (!teamData) {
      return res.json({
        result: 'I couldn\'t find vendor information for this team.'
      });
    }

    // Search for vendor
    let query = supabase
      .from('vendors')
      .select('*')
      .eq('team_id', teamData.id)
      .eq('status', 'active');

    if (vendorName) {
      query = query.or(`name.ilike.%${vendorName}%,company.ilike.%${vendorName}%`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: vendors } = await query.limit(5);

    if (!vendors || vendors.length === 0) {
      return res.json({
        result: `I couldn't find any vendors matching "${vendorName || category}". Would you like me to take a message or transfer you to someone who can help?`
      });
    }

    let response = `I found ${vendors.length} vendor${vendors.length > 1 ? 's' : ''}:\n\n`;

    vendors.forEach(v => {
      response += `**${v.name}**`;
      if (v.company) response += ` (${v.company})`;
      response += `\n`;
      response += `- Category: ${v.category}\n`;
      if (v.phone) response += `- Phone: ${v.phone}\n`;
      if (v.email) response += `- Email: ${v.email}\n`;
      if (v.notes) response += `- Notes: ${v.notes}\n`;
      response += `\n`;
    });

    response += `Would you like me to transfer you to any of these vendors or schedule an appointment?`;

    res.json({ result: response });

  } catch (error) {
    console.error('Lookup vendor error:', error);
    res.json({
      result: 'I\'m having trouble looking up that vendor. Let me transfer you to someone who can help.'
    });
  }
}

/**
 * Handle schedule appointment request
 */
async function handleScheduleAppointment(call: any, params: any) {
  try {
    const {
      title,
      attendeeName,
      attendeePhone,
      attendeeEmail,
      serviceType,
      workType,
      preferredDate,
      preferredTime,
      duration = 60,
      notes,
      locationAddress
    } = params;

    // Combine date and time
    const scheduledAt = `${preferredDate}T${preferredTime}:00Z`;

    // Check weather for outdoor work
    let weatherWarning = null;
    if (workType === 'outdoor' && locationAddress) {
      const weatherCheck = await weatherService.checkSchedulingDate(
        locationAddress,
        new Date(preferredDate),
        workType
      );
      if (!weatherCheck.canProceed) {
        weatherWarning = weatherCheck.recommendation;
      }
    }

    // Create appointment in database
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        team_id: call.assistantId,
        title,
        attendee_name: attendeeName,
        attendee_phone: attendeePhone,
        attendee_email: attendeeEmail,
        service_type: serviceType,
        work_type: workType,
        scheduled_at: scheduledAt,
        duration,
        notes,
        location_address: locationAddress,
        status: 'scheduled',
        created_via: 'phone_call',
        call_id: call.id
      })
      .select()
      .single();

    if (error) throw error;

    let response = `Appointment scheduled for ${attendeeName} on ${preferredDate} at ${preferredTime} for ${serviceType}.`;

    if (weatherWarning) {
      response += ` Weather alert: ${weatherWarning}`;
    }

    return { success: true, appointment, message: response };

  } catch (error: any) {
    console.error('Schedule appointment error:', error);
    return {
      success: false,
      error: error.message,
      message: 'I had trouble scheduling that appointment. Let me get someone to help you.'
    };
  }
}

/**
 * Handle weather check request
 */
async function handleGetWeather(params: any) {
  try {
    const { location, date } = params;

    const weatherCheck = await weatherService.checkSchedulingDate(
      location,
      new Date(date),
      'outdoor'
    );

    const response = weatherCheck.canProceed
      ? `Weather looks good for outdoor work on ${date}. ${weatherCheck.recommendation}`
      : `Weather not ideal for outdoor work on ${date}. ${weatherCheck.recommendation}` +
        (weatherCheck.alternativeDate ? ` Better day: ${weatherCheck.alternativeDate.toDateString()}` : '');

    return {
      success: true,
      weatherCheck,
      message: response
    };

  } catch (error: any) {
    console.error('Weather check error:', error);
    return {
      success: false,
      error: error.message,
      message: 'I had trouble checking the weather. Please try again.'
    };
  }
}

export default router;