/**
 * Retell.ai Routes - Natural conversation AI voice calls
 * Better than Vapi for sales, more natural than Bland
 */

import express from 'express';
import retellService from '../services/retell.service';

const router = express.Router();

// Test endpoint
router.get('/retell/test', (req, res) => {
  res.json({
    success: true,
    message: 'Retell.ai service ready!',
    features: [
      '✅ Most natural conversation flow',
      '✅ Handles interruptions smoothly',
      '✅ Built-in objection handling',
      '✅ Automatic call analysis',
      '✅ Better for B2B sales calls',
      '✅ $0.06/minute'
    ]
  });
});

// Initiate a call
router.post('/retell/call', async (req, res) => {
  try {
    const {
      to,
      vendorName,
      vendorCompany,
      builderName,
      companyName,
      projectDetails,
      teamId
    } = req.body;

    console.log('🎙️ Initiating Retell.ai call to', vendorName);

    const result = await retellService.initiateCall({
      to: to || '+16789005531',
      vendorName: vendorName || 'Vendor',
      vendorCompany: vendorCompany || 'Vendor Company',
      projectDetails: projectDetails || {
        address: '123 Construction Ave',
        type: 'Commercial Build',
        budget: '$1M+',
        timeline: 'Q1 2025',
        urgency: 'immediate'
      },
      builderName: builderName || 'Dave Martinez',
      companyName: companyName || 'Premier Construction',
      teamId: teamId
    });

    if (result.success) {
      res.json({
        success: true,
        callId: result.callId,
        agentId: result.agentId,
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
    console.error('Error initiating Retell call:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate Retell.ai call'
    });
  }
});

// Get call status
router.get('/retell/call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const call = await retellService.getCall(callId);
    
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

// Get available voices
router.get('/retell/voices', (req, res) => {
  const voices = retellService.getAvailableVoices();
  res.json({
    success: true,
    voices
  });
});

// Handle webhooks
router.post('/retell/webhook', async (req, res) => {
  try {
    console.log('📞 Retell webhook received:', req.body.event_type);
    
    await retellService.handleWebhook(req.body);
    
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;