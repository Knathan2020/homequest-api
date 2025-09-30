// Builder Phone Numbers Management Routes
// Each builder gets their own Twilio phone number with VAPI AI integration

import express, { Request, Response } from 'express';
import twilioSubaccountsService from '../services/twilioSubaccounts.service';
import phoneProvisioningService from '../services/phone-provisioning.service';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Check if current user has a phone number
router.get('/check/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const hasPhone = await twilioSubaccountsService.hasPhoneNumber(userId);
    
    if (hasPhone) {
      const usage = await twilioSubaccountsService.getBuilderUsage(userId);
      res.json({
        hasPhoneNumber: true,
        phoneDetails: usage
      });
    } else {
      res.json({
        hasPhoneNumber: false,
        message: 'No phone number assigned. Click to get your business number!'
      });
    }
  } catch (error: any) {
    console.error('Error checking phone status:', error);
    res.status(500).json({
      error: 'Failed to check phone status',
      message: error.message
    });
  }
});

// Create a new phone number for builder with VAPI integration
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { userId, userName, email, company, phoneNumber } = req.body;

    console.log('📞 Creating phone number with VAPI for:', userName);

    // Check if team exists for this user
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', userId)
      .single();

    if (!profile?.team_id) {
      return res.status(400).json({
        error: 'No team found for user. Please ensure user has a team.'
      });
    }

    const teamId = profile.team_id;

    // Check if team already has a phone
    const hasPhone = await phoneProvisioningService.teamHasPhone(teamId);
    if (hasPhone) {
      // Get existing phone config
      const phoneConfig = await phoneProvisioningService.getTeamPhoneConfig(teamId);

      console.log('✅ Team already has phone:', phoneConfig.twilio_number);

      return res.json({
        success: true,
        message: `Phone number ${phoneConfig.twilio_number} already assigned`,
        account: {
          phoneNumber: phoneConfig.twilio_number,
          vapiPhoneId: phoneConfig.vapi_phone_id,
          status: phoneConfig.status || 'active',
          monthlyCost: 2.15 // $1.15 Twilio + $1 VAPI estimate
        }
      });
    }

    // Create subaccount for team
    console.log('🚀 Creating Twilio subaccount for team:', teamId);

    // Get full team details
    const { data: teamData } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (!teamData) {
      throw new Error('Team data not found');
    }

    const teamAccount = await twilioSubaccountsService.createTeamAccount({
      teamId: teamId,
      teamName: teamData.team_name || company || userName,
      ownerEmail: email,
      companyName: teamData.company_name || company
    });

    if (!teamAccount) {
      throw new Error('Failed to create Twilio subaccount');
    }

    console.log('✅ Subaccount created:', {
      subaccountSid: teamAccount.subaccount_sid,
      phoneNumber: teamAccount.twilio_phone_number
    });

    // Update the teams table with subaccount phone info
    await supabase
      .from('teams')
      .update({
        twilio_phone_number: teamAccount.twilio_phone_number,
        twilio_subaccount_sid: teamAccount.subaccount_sid,
        phone_system_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId);

    res.json({
      success: true,
      message: `Phone ${teamAccount.twilio_phone_number} with subaccount created!`,
      account: {
        phoneNumber: teamAccount.twilio_phone_number,
        subaccountSid: teamAccount.subaccount_sid,
        status: 'active',
        monthlyCost: teamAccount.monthly_cost
      }
    });
  } catch (error: any) {
    console.error('Error creating phone with VAPI:', error);
    res.status(500).json({
      error: 'Failed to create phone number',
      message: error.message
    });
  }
});

// Make a call from builder's phone
router.post('/call', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      to,
      callerName,
      vendorName,
      purpose,
      projectDetails
    } = req.body;
    
    // Check if user has a phone number
    const hasPhone = await twilioSubaccountsService.hasPhoneNumber(userId);
    if (!hasPhone) {
      return res.status(400).json({
        error: 'No phone number assigned. Please set up your business phone first.'
      });
    }
    
    // Make the call
    const result = await twilioSubaccountsService.makeTeamCall(
      userId,
      to,
      callerName,
      vendorName,
      purpose,
      projectDetails
    );
    
    res.json({
      success: true,
      ...result,
      message: `Calling ${vendorName} from your business number`
    });
  } catch (error: any) {
    console.error('Error making builder call:', error);
    res.status(500).json({
      error: 'Failed to make call',
      message: error.message
    });
  }
});

// Send SMS from builder's phone
router.post('/sms', async (req: Request, res: Response) => {
  try {
    const { userId, to, message } = req.body;
    
    // Check if user has a phone number
    const hasPhone = await twilioSubaccountsService.hasPhoneNumber(userId);
    if (!hasPhone) {
      return res.status(400).json({
        error: 'No phone number assigned. Please set up your business phone first.'
      });
    }
    
    // Send the SMS
    const result = await twilioSubaccountsService.sendTeamSMS(userId, to, message);
    
    res.json({
      success: true,
      ...result,
      message: 'SMS sent successfully'
    });
  } catch (error: any) {
    console.error('Error sending builder SMS:', error);
    res.status(500).json({
      error: 'Failed to send SMS',
      message: error.message
    });
  }
});

// Get usage statistics for builder
router.get('/usage/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const usage = await twilioSubaccountsService.getBuilderUsage(userId);
    
    if (!usage) {
      return res.status(404).json({
        error: 'No phone number found for this user'
      });
    }
    
    res.json({
      success: true,
      usage
    });
  } catch (error: any) {
    console.error('Error getting usage:', error);
    res.status(500).json({
      error: 'Failed to get usage statistics',
      message: error.message
    });
  }
});

// List all builder accounts (admin only)
router.get('/list', async (req: Request, res: Response) => {
  try {
    const accounts = await twilioSubaccountsService.listBuilderAccounts();
    
    res.json({
      success: true,
      accounts,
      total: accounts.length,
      totalMonthlyCost: accounts.reduce((sum, acc) => sum + acc.monthly_cost, 0)
    });
  } catch (error: any) {
    console.error('Error listing accounts:', error);
    res.status(500).json({
      error: 'Failed to list accounts',
      message: error.message
    });
  }
});

// Suspend a builder's phone (admin only)
router.post('/suspend/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const success = await twilioSubaccountsService.suspendBuilderAccount(userId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Phone number suspended'
      });
    } else {
      res.status(400).json({
        error: 'Failed to suspend phone number'
      });
    }
  } catch (error: any) {
    console.error('Error suspending account:', error);
    res.status(500).json({
      error: 'Failed to suspend account',
      message: error.message
    });
  }
});

// Reactivate a builder's phone (admin only)
router.post('/reactivate/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const success = await twilioSubaccountsService.reactivateBuilderAccount(userId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Phone number reactivated'
      });
    } else {
      res.status(400).json({
        error: 'Failed to reactivate phone number'
      });
    }
  } catch (error: any) {
    console.error('Error reactivating account:', error);
    res.status(500).json({
      error: 'Failed to reactivate account',
      message: error.message
    });
  }
});

export default router;