/**
 * AI Routes
 * Simple AI endpoints that integrate with existing autonomous email processing
 */

import express, { Request, Response } from 'express';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * @route   POST /api/ai/generate-response
 * @desc    Generate AI reply to an email
 * @access  Public
 */
router.post('/generate-response', async (req: Request, res: Response) => {
  try {
    const {
      originalMessage,
      context = '',
      signature = '',
      tone = 'professional',
      userInfo = {},
      replyType = 'reply'
    } = req.body;

    if (!originalMessage) {
      return res.status(400).json({
        success: false,
        error: 'Original message is required'
      });
    }

    // Create a system prompt for email reply generation
    const systemPrompt = `You are a professional email assistant for a construction company. Generate a ${tone} ${replyType} email based on the original message and context provided.

Key guidelines:
- Be concise and professional
- Address the specific points raised in the original email
- Use construction industry terminology appropriately
- Include relevant project details when available
- End with an appropriate professional closing

Context: ${context}
User Info: ${JSON.stringify(userInfo)}`;

    const userPrompt = `Original email to ${replyType} to:
"""
${originalMessage}
"""

Generate a professional ${replyType} email. Do not include subject line or email headers, just the body content.${signature ? ` End with this signature: ${signature}` : ''}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const generatedReply = completion.choices[0]?.message?.content?.trim();

    if (!generatedReply) {
      throw new Error('Failed to generate reply');
    }

    res.json({
      success: true,
      reply: generatedReply,
      usage: completion.usage
    });

  } catch (error) {
    console.error('AI generate-response error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI response',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route   POST /api/ai/compose
 * @desc    Compose a new email with AI assistance
 * @access  Public
 */
router.post('/compose', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      recipient = '',
      subject = '',
      context = '',
      signature = '',
      tone = 'professional',
      userInfo = {}
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Create a system prompt for email composition
    const systemPrompt = `You are a professional email assistant for a construction company. Compose a ${tone} email based on the user's request.

Key guidelines:
- Be concise and professional
- Use appropriate construction industry terminology
- Include relevant details and context
- Structure the email with clear paragraphs
- End with an appropriate professional closing

Recipient: ${recipient}
Subject Context: ${subject}
Additional Context: ${context}
User Info: ${JSON.stringify(userInfo)}`;

    const userPrompt = `Compose an email based on this request:
"""
${prompt}
"""

Generate a professional email body. Do not include subject line or email headers, just the body content.${signature ? ` End with this signature: ${signature}` : ''}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const generatedEmail = completion.choices[0]?.message?.content?.trim();

    if (!generatedEmail) {
      throw new Error('Failed to generate email');
    }

    res.json({
      success: true,
      email: generatedEmail,
      usage: completion.usage
    });

  } catch (error) {
    console.error('AI compose error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compose AI email',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route   POST /api/ai/schedule-appointment
 * @desc    Parse natural language input and create appointment data
 * @access  Public
 */
router.post('/schedule-appointment', async (req: Request, res: Response) => {
  try {
    const {
      input,
      teamId,
      projects = [],
      currentDate = new Date().toISOString()
    } = req.body;

    if (!input || !teamId) {
      return res.status(400).json({
        success: false,
        error: 'Input text and team ID are required'
      });
    }

    // Create a comprehensive system prompt for appointment parsing
    const systemPrompt = `You are an AI assistant for a construction company that specializes in parsing natural language appointment requests into structured data.

Parse the user's request and extract appointment details. Return a JSON object with the following structure:

{
  "title": "string - appointment title/description",
  "date": "YYYY-MM-DD - appointment date",
  "time": "HH:MM - appointment time in 24-hour format",
  "attendeeName": "string - client/attendee name",
  "attendeePhone": "string - phone number if mentioned",
  "workType": "indoor|outdoor|mixed - based on appointment type",
  "projectId": "string - match to project if mentioned",
  "duration": "number - duration in minutes (default 60)",
  "type": "meeting|call|site_visit|inspection - appointment type"
}

Available projects: ${JSON.stringify(projects, null, 2)}
Current date: ${currentDate}

Rules:
- If no specific time is mentioned, use 10:00 for "morning", 14:00 for "afternoon", 16:00 for "evening"
- Match project names/addresses to projectId from the available projects list
- Default to "outdoor" work type for site visits, inspections
- Default to "indoor" or "call" for meetings, calls
- Parse relative dates like "tomorrow", "next Friday", "Monday" into actual dates
- Extract phone numbers in various formats
- Default duration is 60 minutes unless specified
- Be flexible with appointment types (site visit, inspection, meeting, call)`;

    const userPrompt = `Parse this appointment request:
"${input}"

Current date for reference: ${currentDate}
Available projects: ${projects.map(p => `${p.name} - ${p.address}`).join(', ')}

Return only the JSON object with the extracted appointment data.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.1 // Low temperature for consistent parsing
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim();

    if (!aiResponse) {
      throw new Error('Failed to generate appointment data');
    }

    // Try to parse the JSON response
    let appointmentData;
    try {
      // Clean the response in case AI adds extra text
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;
      appointmentData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', aiResponse);
      throw new Error('AI response was not valid JSON');
    }

    // Validate required fields
    if (!appointmentData.title || !appointmentData.attendeeName) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract required appointment details (title and attendee name)',
        aiResponse: appointmentData
      });
    }

    // Process the date if it's relative
    let appointmentDate = appointmentData.date;
    if (!appointmentDate) {
      // Default to tomorrow if no date specified
      const tomorrow = new Date(currentDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      appointmentDate = tomorrow.toISOString().split('T')[0];
    }

    // Ensure we have a valid time
    let appointmentTime = appointmentData.time || '10:00';
    if (!appointmentTime.includes(':')) {
      appointmentTime = '10:00'; // Default fallback
    }

    // Find matching project
    let matchedProjectId = appointmentData.projectId || '';
    if (!matchedProjectId && projects.length > 0) {
      // Try to match project by name mentioned in the input
      const inputLower = input.toLowerCase();
      const matchedProject = projects.find(p =>
        inputLower.includes(p.name.toLowerCase()) ||
        (p.address && inputLower.includes(p.address.toLowerCase()))
      );
      if (matchedProject) {
        matchedProjectId = matchedProject.id;
      }
    }

    const structuredAppointment = {
      title: appointmentData.title,
      date: appointmentDate,
      time: appointmentTime,
      attendeeName: appointmentData.attendeeName,
      attendeePhone: appointmentData.attendeePhone || '',
      workType: appointmentData.workType || 'outdoor',
      projectId: matchedProjectId,
      duration: appointmentData.duration || 60,
      type: appointmentData.type || 'site_visit'
    };

    res.json({
      success: true,
      appointment: structuredAppointment,
      originalInput: input,
      aiResponse: appointmentData,
      usage: completion.usage
    });

  } catch (error) {
    console.error('AI schedule-appointment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse appointment request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;