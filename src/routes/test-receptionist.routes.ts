/**
 * Test AI Receptionist with Transfer Capabilities
 * Demonstrates intelligent call routing
 */

import express from 'express';
import axios from 'axios';
import aiReceptionistService from '../services/ai-receptionist.service';

const router = express.Router();

/**
 * Test the AI receptionist with different scenarios
 */
router.post('/test-receptionist/call', async (req, res) => {
  try {
    const { scenario = 'general', phoneNumber } = req.body;
    
    // Different test scenarios
    const scenarios = {
      general: {
        message: "Hi, I'm calling about a construction project. Can you help me?",
        expectedBehavior: "AI should answer and provide information"
      },
      billing: {
        message: "I have a question about my invoice and payment terms",
        expectedBehavior: "AI should offer to transfer to Billing Department"
      },
      emergency: {
        message: "This is urgent! We have a critical issue on site that needs immediate attention",
        expectedBehavior: "AI should transfer to Management immediately"
      },
      specific_person: {
        message: "I need to speak with John Smith about the project timeline",
        expectedBehavior: "AI should transfer to John Smith if available"
      },
      unavailable: {
        message: "Can I talk to someone in the Safety department?",
        expectedBehavior: "If no one available, AI should offer to take a message"
      }
    };
    
    const testScenario = scenarios[scenario as keyof typeof scenarios] || scenarios.general;
    
    // Create test call with Vapi
    const vapiResponse = await axios.post(
      'https://api.vapi.ai/call/phone',
      {
        phoneNumberId: process.env.VAPI_PHONE_ID || '889151da-ac44-4296-a9cf-568a414815a0',
        to: phoneNumber,
        assistantId: process.env.VAPI_RECEPTIONIST_ID,
        // Override with test scenario
        assistantOverrides: {
          firstMessage: `This is a test call. Scenario: ${scenario}. The caller will say: "${testScenario.message}"`
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({
      success: true,
      message: `Test call initiated for ${scenario} scenario`,
      scenario: testScenario,
      callId: vapiResponse.data.id,
      instruction: `The AI receptionist will now handle this scenario. Expected: ${testScenario.expectedBehavior}`
    });
    
  } catch (error: any) {
    console.error('Test receptionist error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a test team with sample members
 */
router.post('/test-receptionist/setup-team', async (req, res) => {
  try {
    const { teamId = 'team_123' } = req.body;
    
    // Sample team members for testing
    const testMembers = [
      {
        teamId,
        name: 'John Smith',
        role: 'Owner',
        department: 'Management',
        phoneNumber: '+16785551234',
        email: 'john@construction.com',
        availability: 'available',
        expertise: ['everything', 'emergencies', 'contracts']
      },
      {
        teamId,
        name: 'Sarah Johnson',
        role: 'Project Manager',
        department: 'Operations',
        phoneNumber: '+16785555678',
        email: 'sarah@construction.com',
        availability: 'busy',
        expertise: ['scheduling', 'permits', 'coordination']
      },
      {
        teamId,
        name: 'Mike Williams',
        role: 'Billing Manager',
        department: 'Billing',
        phoneNumber: '+16785559012',
        email: 'mike@construction.com',
        availability: 'available',
        expertise: ['invoicing', 'payments', 'accounts']
      },
      {
        teamId,
        name: 'Lisa Chen',
        role: 'Safety Manager',
        department: 'Safety',
        phoneNumber: '+16785553456',
        email: 'lisa@construction.com',
        availability: 'offline',
        expertise: ['safety', 'compliance', 'training']
      }
    ];
    
    // Add members to database
    for (const member of testMembers) {
      await aiReceptionistService.upsertTeamMember(member);
    }
    
    // Create/update the AI assistant
    const assistant = await aiReceptionistService.createTeamReceptionist(
      teamId,
      'Test Construction Company'
    );
    
    res.json({
      success: true,
      message: 'Test team setup complete',
      members: testMembers,
      assistantId: assistant.id,
      instructions: [
        '1. John Smith (Owner) - Available for emergencies',
        '2. Sarah Johnson (Project Manager) - Currently busy',
        '3. Mike Williams (Billing) - Available for billing questions',
        '4. Lisa Chen (Safety) - Currently offline',
        '',
        'Test scenarios:',
        '- Ask for billing → Should transfer to Mike',
        '- Emergency → Should transfer to John',
        '- Ask for Lisa → Should take message (offline)',
        '- General question → AI should answer'
      ].join('\n')
    });
    
  } catch (error: any) {
    console.error('Setup team error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Monitor active transfers
 */
router.get('/test-receptionist/transfers/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const analytics = await aiReceptionistService.getTransferAnalytics(teamId, '1d');
    
    res.json({
      success: true,
      analytics,
      recentTransfers: analytics?.totalTransfers || 0,
      departments: analytics?.byDepartment || {},
      members: analytics?.byMember || {}
    });
    
  } catch (error: any) {
    console.error('Get transfers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;