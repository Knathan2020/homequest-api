/**
 * Messaging API Routes
 */

import express from 'express';
import autonomousMessagingService from '../services/autonomous-messaging.service';

const router = express.Router();

/**
 * Create a new messaging campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const campaign = await autonomousMessagingService.createMessageCampaign(req.body);
    
    res.json({
      success: true,
      campaign,
      message: 'SMS campaign created and started!'
    });
  } catch (error) {
    console.error('Error creating messaging campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create messaging campaign'
    });
  }
});

/**
 * Twilio webhook for incoming messages
 */
router.post('/webhook/incoming', async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;
    
    await autonomousMessagingService.handleIncomingMessage({
      from: From,
      to: To,
      body: Body,
      messageSid: MessageSid,
      timestamp: new Date().toISOString()
    });
    
    // Respond to Twilio
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Error handling incoming message:', error);
    res.status(500).send('Error processing message');
  }
});

/**
 * Twilio webhook for message status updates
 */
router.post('/webhook/status', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To } = req.body;
    
    console.log(`Message ${MessageSid} to ${To}: ${MessageStatus}`);
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling status update:', error);
    res.status(500).send('Error processing status');
  }
});

/**
 * Send a manual message
 */
router.post('/send', async (req, res) => {
  try {
    const { to, message, teamId, type = 'manual', attachments = [] } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and message are required'
      });
    }

    // Format phone number
    const formattedPhone = formatPhoneNumber(to);

    // Send via Twilio
    const twilioClient = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const messageOptions: any = {
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/messaging/webhook/status`
    };

    // Add media URLs if attachments provided
    if (attachments.length > 0) {
      messageOptions.mediaUrl = attachments;
    }

    const sentMessage = await twilioClient.messages.create(messageOptions);

    // Log to database/memory for tracking
    const messageRecord = {
      id: sentMessage.sid,
      to: formattedPhone,
      from: messageOptions.from,
      body: message,
      status: sentMessage.status,
      type: type,
      teamId: teamId,
      attachments: attachments,
      sentAt: new Date().toISOString(),
      twilioSid: sentMessage.sid
    };

    console.log(`📤 Manual SMS sent to ${formattedPhone}: ${message.substring(0, 50)}...`);

    res.json({
      success: true,
      message: 'Message sent successfully',
      messageId: sentMessage.sid,
      status: sentMessage.status,
      to: formattedPhone,
      data: messageRecord
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
});

/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // If it's 10 digits, assume US number and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If it's 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Otherwise return as is (assume it's already formatted)
  return digits.startsWith('+') ? phone : `+${digits}`;
}

/**
 * Get unified messaging dashboard data
 */
router.get('/dashboard/:teamId?', async (req, res) => {
  try {
    const { teamId = 'demo-team' } = req.params;

    // In production, this would aggregate data from your database
    // For now, providing realistic mock data structure
    const dashboardData = {
      stats: {
        totalMessages: Math.floor(Math.random() * 500) + 800,
        unreadMessages: Math.floor(Math.random() * 20) + 5,
        activeConversations: Math.floor(Math.random() * 15) + 8,
        responseRate: 94.5 + Math.random() * 4,
        avgResponseTime: `${(2.1 + Math.random()).toFixed(1)} hrs`,
        messagesThisWeek: Math.floor(Math.random() * 100) + 120,
        messagesLastWeek: Math.floor(Math.random() * 80) + 90
      },
      recentActivity: [
        {
          id: 'activity_1',
          type: 'message_received',
          contact: 'John Smith - Electrician',
          phoneNumber: '+1234567890',
          preview: 'Thanks for the project update...',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          priority: 'high'
        },
        {
          id: 'activity_2',
          type: 'message_sent',
          contact: 'ABC Plumbing',
          phoneNumber: '+1987654321',
          preview: 'Materials scheduled for Monday delivery...',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          priority: 'normal'
        },
        {
          id: 'activity_3',
          type: 'bulk_message_sent',
          count: 15,
          preview: 'Weekly project status update...',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          priority: 'normal'
        }
      ],
      quickActions: [
        { id: 'compose', label: 'Compose Message', icon: 'compose', enabled: true },
        { id: 'bulk_send', label: 'Send Bulk Message', icon: 'broadcast', enabled: true },
        { id: 'import_contacts', label: 'Import Contacts', icon: 'upload', enabled: true },
        { id: 'export_data', label: 'Export Messages', icon: 'download', enabled: true }
      ],
      messagesByDay: [
        { date: '2025-09-08', sent: 12, received: 8 },
        { date: '2025-09-09', sent: 18, received: 15 },
        { date: '2025-09-10', sent: 25, received: 12 },
        { date: '2025-09-11', sent: 22, received: 18 },
        { date: '2025-09-12', sent: 30, received: 25 },
        { date: '2025-09-13', sent: 28, received: 20 },
        { date: '2025-09-14', sent: 15, received: 10 }
      ],
      topContacts: [
        { phoneNumber: '+1234567890', name: 'John Smith - Electrician', messageCount: 45, lastContact: new Date(Date.now() - 1800000).toISOString() },
        { phoneNumber: '+1987654321', name: 'ABC Plumbing', messageCount: 32, lastContact: new Date(Date.now() - 7200000).toISOString() },
        { phoneNumber: '+1555123456', name: 'Mike Johnson - Site Manager', messageCount: 28, lastContact: new Date(Date.now() - 86400000).toISOString() }
      ]
    };

    res.json({
      success: true,
      dashboard: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching messaging dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messaging dashboard'
    });
  }
});

/**
 * Get conversation history
 */
router.get('/conversations/:teamId?', async (req, res) => {
  try {
    const { teamId = 'demo-team' } = req.params;

    // For now, return mock conversations data
    // TODO: Implement actual database integration
    const conversations = [
      {
        id: 'conv_1',
        phoneNumber: '+1234567890',
        contactName: 'John Smith - Electrician',
        lastMessage: 'Thanks for the update on the project timeline.',
        lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
        unreadCount: 2,
        status: 'active',
        messageCount: 15
      },
      {
        id: 'conv_2',
        phoneNumber: '+1987654321',
        contactName: 'ABC Plumbing',
        lastMessage: 'We can start on Monday morning.',
        lastMessageAt: new Date(Date.now() - 7200000).toISOString(),
        unreadCount: 0,
        status: 'active',
        messageCount: 8
      },
      {
        id: 'conv_3',
        phoneNumber: '+1555123456',
        contactName: 'Mike Johnson - Site Manager',
        lastMessage: 'Weather looks good for concrete pour.',
        lastMessageAt: new Date(Date.now() - 86400000).toISOString(),
        unreadCount: 1,
        status: 'active',
        messageCount: 23
      }
    ];

    res.json({
      success: true,
      conversations: conversations,
      totalCount: conversations.length,
      unreadTotal: conversations.reduce((sum, conv) => sum + conv.unreadCount, 0)
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations'
    });
  }
});

/**
 * Get messages for a specific conversation
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Mock message data
    const messages = [
      {
        id: 'msg_1',
        conversationId,
        from: '+1234567890',
        to: process.env.TWILIO_PHONE_NUMBER,
        body: 'Hi, I wanted to check on the project status.',
        status: 'delivered',
        direction: 'inbound',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        read: false
      },
      {
        id: 'msg_2',
        conversationId,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+1234567890',
        body: 'Thanks for reaching out! The foundation work is complete and we\'re starting framing next week.',
        status: 'delivered',
        direction: 'outbound',
        timestamp: new Date(Date.now() - 1200000).toISOString(),
        read: true
      },
      {
        id: 'msg_3',
        conversationId,
        from: '+1234567890',
        to: process.env.TWILIO_PHONE_NUMBER,
        body: 'That\'s great news! Will the electrical rough-in be ready by Friday?',
        status: 'delivered',
        direction: 'inbound',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        read: false
      }
    ];

    res.json({
      success: true,
      messages: messages.slice(Number(offset), Number(offset) + Number(limit)),
      totalCount: messages.length,
      hasMore: Number(offset) + Number(limit) < messages.length
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
});

/**
 * Get real-time message status
 */
router.get('/status/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // In production, this would query your database for message status
    // For now, simulate status tracking
    const statuses = ['sent', 'delivered', 'read', 'failed'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    const messageStatus = {
      messageId: messageId,
      status: randomStatus,
      timestamp: new Date().toISOString(),
      deliveredAt: randomStatus !== 'sent' ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null,
      readAt: randomStatus === 'read' ? new Date(Date.now() - Math.random() * 1800000).toISOString() : null,
      errorMessage: randomStatus === 'failed' ? 'Delivery failed - invalid number' : null
    };

    res.json({
      success: true,
      status: messageStatus
    });
  } catch (error) {
    console.error('Error fetching message status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message status'
    });
  }
});

/**
 * Get message analytics for team
 */
router.get('/analytics/:teamId?', async (req, res) => {
  try {
    const { teamId = 'demo-team' } = req.params;
    const { timeframe = '7d' } = req.query;

    // Mock analytics data - in production, aggregate from database
    const analytics = {
      timeframe: timeframe,
      totalSent: Math.floor(Math.random() * 200) + 300,
      totalDelivered: Math.floor(Math.random() * 180) + 280,
      totalRead: Math.floor(Math.random() * 150) + 200,
      totalFailed: Math.floor(Math.random() * 20) + 5,
      deliveryRate: 94.2 + Math.random() * 4,
      readRate: 78.5 + Math.random() * 15,
      avgResponseTime: `${(2.3 + Math.random()).toFixed(1)} hrs`,
      peakHours: [
        { hour: 9, count: 45 },
        { hour: 14, count: 52 },
        { hour: 17, count: 38 }
      ],
      statusBreakdown: {
        sent: Math.floor(Math.random() * 50) + 20,
        delivered: Math.floor(Math.random() * 100) + 150,
        read: Math.floor(Math.random() * 80) + 120,
        failed: Math.floor(Math.random() * 10) + 5
      }
    };

    res.json({
      success: true,
      analytics: analytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching message analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message analytics'
    });
  }
});

/**
 * Send bulk messages
 */
router.post('/bulk-send', async (req, res) => {
  try {
    const { recipients, message, teamId, scheduledFor } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    const twilioClient = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const results = [];
    const delay = 1000; // 1 second delay between messages to avoid rate limits

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      try {
        // Add delay between messages
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const formattedPhone = formatPhoneNumber(recipient.phone || recipient);

        const messageOptions: any = {
          body: message.replace(/\{name\}/g, recipient.name || 'there'),
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone,
          statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/messaging/webhook/status`
        };

        if (scheduledFor) {
          messageOptions.sendAt = new Date(scheduledFor);
          messageOptions.scheduleType = 'fixed';
        }

        const sentMessage = await twilioClient.messages.create(messageOptions);

        results.push({
          recipient: formattedPhone,
          name: recipient.name,
          messageId: sentMessage.sid,
          status: 'sent',
          error: null
        });

        console.log(`📤 Bulk SMS sent to ${formattedPhone}`);
      } catch (error) {
        results.push({
          recipient: recipient.phone || recipient,
          name: recipient.name,
          messageId: null,
          status: 'failed',
          error: error.message
        });
        console.error(`❌ Failed to send to ${recipient.phone || recipient}:`, error.message);
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    res.json({
      success: true,
      message: `Bulk message sent to ${successCount} recipients`,
      results: {
        successful: successCount,
        failed: failureCount,
        total: recipients.length,
        details: results
      }
    });
  } catch (error) {
    console.error('Error sending bulk messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk messages',
      details: error.message
    });
  }
});

/**
 * Get AI-powered message suggestions
 */
router.post('/suggestions', async (req, res) => {
  try {
    const { context, messageHistory, recipientType, urgency } = req.body;

    if (!context) {
      return res.status(400).json({
        success: false,
        error: 'Context is required for message suggestions'
      });
    }

    // In production, this would use an AI service like OpenAI or Claude
    // For now, providing smart context-aware suggestions
    const suggestions = generateContextualSuggestions(context, recipientType, urgency);

    res.json({
      success: true,
      suggestions: suggestions,
      context: context,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating message suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate message suggestions'
    });
  }
});

/**
 * Generate contextual message suggestions based on construction industry patterns
 */
function generateContextualSuggestions(context: string, recipientType?: string, urgency?: string) {
  const baseTemplates = {
    project_update: [
      "Hi {name}, just wanted to update you on the project progress. The {phase} is on schedule and should be completed by {date}. Let me know if you have any questions.",
      "Project update: We've completed the {milestone} ahead of schedule. Next phase begins {date}. Everything is looking great!",
      "Quick update on your project: {status}. We're maintaining our timeline and will have more updates tomorrow."
    ],
    schedule_change: [
      "Hi {name}, we need to adjust the schedule for {project}. The new timeline is {date} due to {reason}. This won't affect overall completion.",
      "Schedule update: Due to {weather/materials/inspection}, we're moving {task} to {new_date}. Final completion still on track.",
      "Heads up - minor schedule adjustment needed. {Task} moved from {old_date} to {new_date}. No impact on final delivery."
    ],
    materials_delivery: [
      "Your materials for {project} will arrive on {date} between {time_range}. Please ensure site access is available.",
      "Materials delivery scheduled for {date}. We'll need {requirements} ready at the site. Confirmed delivery window: {time}.",
      "Hi {name}, confirming material delivery for {date}. Everything is ready on our end. Please let me know if any access issues."
    ],
    inspection_required: [
      "Hi {name}, we need to schedule a {inspection_type} inspection for {project}. Are you available {suggested_dates}?",
      "Inspection checkpoint reached! We need {inspection_type} scheduled within the next {timeframe}. When works best for you?",
      "Ready for the next inspection phase. {Inspection_type} needed - I can arrange for {date_options}. Which works better?"
    ],
    completion_notice: [
      "Great news! The {phase} of your project is now complete. Ready for your final walkthrough. When can we schedule?",
      "Phase complete! {Work_description} is finished and ready for your approval. Photos attached. Schedule final review?",
      "Milestone achieved! {Project_phase} completed on schedule. Ready for your sign-off and next phase planning."
    ],
    weather_delay: [
      "Weather update: Due to {weather_condition}, we're postponing {work_type} until conditions improve. Safety first!",
      "Hi {name}, weather delay today. Will resume {work} tomorrow if conditions clear. Keeping you in the loop!",
      "Weather hold on {project}. {Specific_weather} preventing safe work. Resume as soon as it clears - no cost impact."
    ],
    billing_payment: [
      "Hi {name}, invoice #{number} for {project_phase} was sent on {date}. Let me know if you need any clarification.",
      "Just a friendly reminder about invoice #{invoice_number} due {date}. Thanks for your continued business!",
      "Payment received - thank you! Your {project} continues as scheduled. Next billing cycle is {date}."
    ]
  };

  // Determine context type from input
  const contextLower = context.toLowerCase();
  let suggestedType = 'project_update'; // default

  if (contextLower.includes('schedule') || contextLower.includes('delay') || contextLower.includes('postpone')) {
    suggestedType = 'schedule_change';
  } else if (contextLower.includes('material') || contextLower.includes('deliver') || contextLower.includes('supply')) {
    suggestedType = 'materials_delivery';
  } else if (contextLower.includes('inspect') || contextLower.includes('approval') || contextLower.includes('review')) {
    suggestedType = 'inspection_required';
  } else if (contextLower.includes('complete') || contextLower.includes('finish') || contextLower.includes('done')) {
    suggestedType = 'completion_notice';
  } else if (contextLower.includes('weather') || contextLower.includes('rain') || contextLower.includes('storm')) {
    suggestedType = 'weather_delay';
  } else if (contextLower.includes('bill') || contextLower.includes('payment') || contextLower.includes('invoice')) {
    suggestedType = 'billing_payment';
  }

  const templates = baseTemplates[suggestedType] || baseTemplates.project_update;

  // Add urgency modifiers
  const urgencyPrefixes = {
    high: ['URGENT: ', 'IMMEDIATE: ', 'PRIORITY: '],
    medium: ['Important: ', 'Update: ', 'Notice: '],
    low: ['FYI: ', 'Update: ', '']
  };

  const urgencyLevel = urgency || 'medium';
  const prefixes = urgencyPrefixes[urgencyLevel] || urgencyPrefixes.medium;

  // Generate variations with urgency and context
  const suggestions = templates.slice(0, 3).map((template, index) => {
    const prefix = prefixes[index % prefixes.length];
    return {
      id: `suggestion_${index + 1}`,
      text: prefix + template,
      category: suggestedType,
      urgency: urgencyLevel,
      tone: recipientType === 'client' ? 'professional' : 'friendly',
      placeholders: extractPlaceholders(template)
    };
  });

  return suggestions;
}

/**
 * Extract placeholder variables from message template
 */
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{([^}]+)\}/g);
  return matches ? matches.map(match => match.slice(1, -1)) : [];
}

export default router;