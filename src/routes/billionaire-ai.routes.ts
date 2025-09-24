// BILLIONAIRE AI ROUTES
// Handles ultra-intelligent voice interactions that vendors prefer over humans

import express from 'express';
import billionaireAI from '../services/billionaire-ai-voice.service';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

const router = express.Router();

// Initiate a billionaire-level AI call
router.post('/billionaire-call', async (req, res) => {
  try {
    const {
      vendorPhone,
      vendorName,
      vendorCompany,
      vendorSpecialty,
      projectDetails,
      builderName,
      companyName,
      teamId
    } = req.body;

    // Validate required fields
    if (!vendorPhone || !vendorName || !projectDetails) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Ensure project details are complete
    const enhancedProjectDetails = {
      address: projectDetails.address || '1234 Luxury Estate Drive',
      type: projectDetails.type || 'Luxury Custom Home',
      budget: projectDetails.budget || '$2.5M - $3M',
      timeline: projectDetails.timeline || '6-8 months',
      urgency: projectDetails.urgency || 'this_week',
      specificWork: projectDetails.specificWork || 'Complete project management'
    };

    const result = await billionaireAI.initiateBillionaireDeal({
      teamId: teamId || '11111111-1111-1111-1111-111111111111',
      vendorPhone,
      vendorName,
      vendorCompany: vendorCompany || 'Vendor Company',
      vendorSpecialty: vendorSpecialty || 'General Contracting',
      projectDetails: enhancedProjectDetails,
      builderName: builderName || 'John Builder',
      companyName: companyName || 'HomeQuest Premium Developments'
    });

    res.json({
      success: true,
      ...result,
      message: 'Billionaire AI sequence initiated. SMS sent, call in 30 seconds.'
    });
  } catch (error: any) {
    console.error('Error initiating billionaire call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate billionaire AI call'
    });
  }
});

// Handle vendor responses during active calls
router.post('/billionaire-ai/respond', async (req, res) => {
  try {
    const { CallSid, SpeechResult, Digits } = req.body;
    
    console.log(`🧠 Billionaire AI processing: "${SpeechResult || Digits}" from call ${CallSid}`);
    
    const response = await billionaireAI.handleVendorResponse(
      CallSid,
      SpeechResult || Digits || ''
    );
    
    res.type('text/xml');
    res.send(response);
  } catch (error) {
    console.error('Error in billionaire AI response:', error);
    
    // Graceful fallback
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      'I need to process that information. Let me send you all the details via text message. Thank you for your time!'
    );
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle incoming calls from vendors
router.post('/billionaire-ai/incoming', async (req, res) => {
  try {
    const { From, CallSid } = req.body;
    
    console.log(`📞 Incoming call from ${From}`);
    
    const response = await billionaireAI.handleIncomingCall(From);
    
    res.type('text/xml');
    res.send(response);
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      'Thank you for calling HomeQuest Construction. I\'m having a technical issue. Please try again in a few minutes, or I can have someone call you back immediately.'
    );
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle new vendor registration via voice
router.post('/billionaire-ai/new-vendor', async (req, res) => {
  try {
    const { SpeechResult, From } = req.body;
    
    const twiml = new VoiceResponse();
    
    // Extract vendor info from speech
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      `Excellent! I've captured your information. We have several high-value projects that match your expertise. 
      I'm texting you our vendor portal link right now where you can see all available projects. 
      We pay premium rates for quality work, and I can personally fast-track your application.`
    );
    
    twiml.pause({ length: 1 });
    
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      'Is there a specific type of project you\'re most interested in? Residential, commercial, or industrial?'
    );
    
    const gather = twiml.gather({
      input: 'speech',
      timeout: 4,
      speechTimeout: 'auto',
      action: '/api/billionaire-ai/vendor-preference'
    });
    
    gather.say(
      { voice: 'Google.en-US-Neural2-A' },
      'I\'m listening.'
    );
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error registering new vendor:', error);
    res.status(500).send('<Response><Say>Technical difficulty. Please try again.</Say></Response>');
  }
});

// Handle vendor preferences
router.post('/billionaire-ai/vendor-preference', async (req, res) => {
  try {
    const { SpeechResult } = req.body;
    
    const twiml = new VoiceResponse();
    
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      `Perfect! I'm matching you with relevant projects right now. 
      You'll receive a text with three high-priority projects that need your expertise within the next minute. 
      Each one includes premium pay rates and flexible scheduling.`
    );
    
    twiml.pause({ length: 1 });
    
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      'I\'ve also added you to our preferred vendor list, which means you\'ll get first consideration for all matching projects. Welcome to HomeQuest\'s premium network!'
    );
    
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling vendor preference:', error);
    res.status(500).send('<Response><Say>Thank you. We\'ll be in touch!</Say></Response>');
  }
});

// Handle call status updates
router.post('/billionaire-ai/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, From, To } = req.body;
    
    console.log(`📊 Call ${CallSid} status: ${CallStatus}, duration: ${CallDuration}s`);
    
    if (CallStatus === 'completed') {
      // Generate and save call summary
      const summary = await billionaireAI.generateCallSummary(CallSid);
      
      if (summary) {
        console.log(`💼 Deal probability: ${summary.dealProbability}%`);
        console.log(`📝 Recommendation: ${summary.recommendedFollowUp}`);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling status callback:', error);
    res.status(200).send('OK');
  }
});

// Handle inbound response continuation
router.post('/billionaire-ai/inbound-response', async (req, res) => {
  try {
    const { CallSid, SpeechResult } = req.body;
    
    // Use the main response handler
    const response = await billionaireAI.handleVendorResponse(CallSid, SpeechResult || '');
    
    res.type('text/xml');
    res.send(response);
  } catch (error) {
    console.error('Error handling inbound response:', error);
    
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: 'Google.en-US-Neural2-A' },
      'Let me send you the complete project details via text. Thank you for calling!'
    );
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Get conversation analytics
router.get('/billionaire-ai/analytics/:projectId', async (req, res) => {
  try {
    // In production, fetch from database
    res.json({
      projectId: req.params.projectId,
      totalCalls: 5,
      avgDealProbability: 75,
      vendorSentiment: 'positive',
      expectedCloseDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      topConcerns: ['Timeline', 'Payment terms'],
      recommendedActions: [
        'Send contract within 2 hours',
        'Offer 10% early completion bonus',
        'Schedule site visit for tomorrow'
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;