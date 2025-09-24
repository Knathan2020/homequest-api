/**
 * Meeting Invites and Notifications Routes
 * Handles sending meeting invitations via email and SMS
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Send meeting invitation via email
 */
router.post('/notifications/meeting-invite', async (req, res) => {
  try {
    const {
      recipientEmail,
      recipientName,
      meetingTitle,
      meetingDate,
      meetingTime,
      location,
      organizer,
      organizerEmail,
      notes,
      appointmentId
    } = req.body;

    if (!recipientEmail || !meetingTitle || !meetingDate || !meetingTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Format meeting datetime
    const meetingDateTime = new Date(`${meetingDate}T${meetingTime}:00`);
    const formattedDate = format(meetingDateTime, 'PPP');
    const formattedTime = format(meetingDateTime, 'p');

    // Prepare email content
    const emailSubject = `Meeting Invitation: ${meetingTitle}`;
    const emailBody = `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb;">Meeting Invitation</h2>

    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #1e40af;">${meetingTitle}</h3>

      <p><strong>📅 Date:</strong> ${formattedDate}</p>
      <p><strong>🕐 Time:</strong> ${formattedTime}</p>
      ${location ? `<p><strong>📍 Location:</strong> ${location}</p>` : ''}
      ${organizer ? `<p><strong>👤 Organizer:</strong> ${organizer}</p>` : ''}
      ${notes ? `<p><strong>📝 Notes:</strong> ${notes}</p>` : ''}
    </div>

    <p>You have been invited to attend this meeting. Please confirm your attendance.</p>

    <div style="margin: 30px 0;">
      <a href="mailto:${organizerEmail || 'noreply@homequest.com'}?subject=Re: ${meetingTitle} - Confirmed"
         style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 10px;">
        ✅ Accept
      </a>
      <a href="mailto:${organizerEmail || 'noreply@homequest.com'}?subject=Re: ${meetingTitle} - Declined"
         style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        ❌ Decline
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 14px; color: #6b7280;">
      This invitation was sent automatically by the HomeQuest scheduling system.
    </p>
  </div>
</body>
</html>`;

    // Send via Supabase Edge Function or email service
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: recipientEmail,
          subject: emailSubject,
          html: emailBody
        }
      });

      if (error) {
        throw error;
      }

      console.log('✅ Meeting invitation sent to:', recipientEmail);

      // Log the invitation
      await supabase
        .from('meeting_invitations')
        .insert({
          appointment_id: appointmentId,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          meeting_title: meetingTitle,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location,
          organizer,
          status: 'sent',
          sent_at: new Date().toISOString()
        });

      res.json({
        success: true,
        message: 'Meeting invitation sent successfully'
      });

    } catch (emailError) {
      console.error('Email service error, falling back to database log:', emailError);

      // If email fails, at least log the invitation attempt
      await supabase
        .from('meeting_invitations')
        .insert({
          appointment_id: appointmentId,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          meeting_title: meetingTitle,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location,
          organizer,
          status: 'failed',
          error_message: emailError.message,
          sent_at: new Date().toISOString()
        });

      res.json({
        success: true,
        message: 'Meeting invitation logged (email service unavailable)',
        warning: 'Email delivery may have failed'
      });
    }

  } catch (error: any) {
    console.error('Error sending meeting invitation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send meeting invitation via SMS
 */
router.post('/notifications/meeting-invite-sms', async (req, res) => {
  try {
    const {
      recipientPhone,
      recipientName,
      meetingTitle,
      meetingDate,
      meetingTime,
      location,
      organizer,
      appointmentId
    } = req.body;

    if (!recipientPhone || !meetingTitle || !meetingDate || !meetingTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Format meeting datetime
    const meetingDateTime = new Date(`${meetingDate}T${meetingTime}:00`);
    const formattedDate = format(meetingDateTime, 'MMM d');
    const formattedTime = format(meetingDateTime, 'h:mm a');

    // Prepare SMS content (keep it short!)
    const smsMessage = `Meeting Invite: ${meetingTitle}
📅 ${formattedDate} at ${formattedTime}
${location ? `📍 ${location}` : ''}
${organizer ? `Host: ${organizer}` : ''}

Reply YES to confirm or NO to decline.`;

    // Send via Twilio or SMS service
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: recipientPhone,
          message: smsMessage
        }
      });

      if (error) {
        throw error;
      }

      console.log('✅ Meeting SMS invitation sent to:', recipientPhone);

      // Log the invitation
      await supabase
        .from('meeting_invitations')
        .insert({
          appointment_id: appointmentId,
          recipient_phone: recipientPhone,
          recipient_name: recipientName,
          meeting_title: meetingTitle,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location,
          organizer,
          status: 'sent',
          sent_at: new Date().toISOString(),
          delivery_method: 'sms'
        });

      res.json({
        success: true,
        message: 'Meeting SMS invitation sent successfully'
      });

    } catch (smsError) {
      console.error('SMS service error:', smsError);

      // Log the failed attempt
      await supabase
        .from('meeting_invitations')
        .insert({
          appointment_id: appointmentId,
          recipient_phone: recipientPhone,
          recipient_name: recipientName,
          meeting_title: meetingTitle,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location,
          organizer,
          status: 'failed',
          error_message: smsError.message,
          sent_at: new Date().toISOString(),
          delivery_method: 'sms'
        });

      res.status(500).json({
        success: false,
        error: 'Failed to send SMS invitation'
      });
    }

  } catch (error: any) {
    console.error('Error sending SMS meeting invitation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get meeting invitation status
 */
router.get('/notifications/meeting-invite/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const { data, error } = await supabase
      .from('meeting_invitations')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('sent_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      invitations: data || []
    });

  } catch (error: any) {
    console.error('Error fetching invitation status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update meeting invitation response
 */
router.post('/notifications/meeting-invite/:inviteId/respond', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const { response, notes } = req.body;

    if (!response || !['accepted', 'declined', 'tentative'].includes(response)) {
      return res.status(400).json({
        success: false,
        error: 'Valid response required: accepted, declined, or tentative'
      });
    }

    const { data, error } = await supabase
      .from('meeting_invitations')
      .update({
        response,
        response_notes: notes,
        responded_at: new Date().toISOString()
      })
      .eq('id', inviteId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data,
      message: `Meeting invitation ${response}`
    });

  } catch (error: any) {
    console.error('Error updating invitation response:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;