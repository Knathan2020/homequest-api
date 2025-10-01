/**
 * Setup Routes - Database initialization and phone provisioning
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import phoneProvisioningService from '../services/phone-provisioning.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Create team_phones table and provision default team phone
 */
router.post('/setup/team-phones', async (req, res) => {
  try {
    console.log('🔧 Setting up team phones table and provisioning default team phone...');

    // Step 1: Create the team_phones table
    console.log('📋 Creating team_phones table...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS team_phones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        owner_email TEXT NOT NULL,
        twilio_number TEXT NOT NULL UNIQUE,
        vapi_phone_id TEXT NOT NULL UNIQUE,
        default_voice_id TEXT DEFAULT 'ewxUvnyvvOehYjKjUVKC',
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_team_phones_team_id ON team_phones(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_phones_status ON team_phones(status);
    `;

    // Try direct SQL execution
    const { error: createTableError } = await supabase.rpc('exec_sql', {
      sql: createTableSQL
    });

    if (createTableError) {
      console.log('⚠️ RPC exec_sql failed, trying alternative approach...');

      // Alternative: Create via raw query
      const { error: altError } = await supabase
        .from('_temp_table_creation')
        .select('*')
        .limit(0);  // This will fail but might give us SQL access

      // If that doesn't work, we'll create manually
      console.log('Creating table structure manually...');

      // Insert a test record to create the table structure
      const { error: insertError } = await supabase
        .from('team_phones')
        .insert({
          id: '00000000-0000-0000-0000-000000000000',
          team_id: 'test',
          team_name: 'Test Team',
          owner_email: 'test@test.com',
          twilio_number: '+10000000000',
          vapi_phone_id: 'test-vapi-id',
          status: 'inactive'
        });

      if (insertError && insertError.code !== '23505') {  // Ignore unique constraint violations
        console.log('Table creation approach failed:', insertError.message);

        return res.json({
          success: false,
          error: 'Could not create team_phones table. You may need to create it manually in Supabase.',
          sqlToRun: createTableSQL
        });
      }

      // Delete the test record
      await supabase
        .from('team_phones')
        .delete()
        .eq('id', '00000000-0000-0000-0000-000000000000');
    }

    console.log('✅ team_phones table ready');

    // Step 2: Check if default team already has a phone
    const defaultTeamId = '11111111-1111-1111-1111-111111111111';

    const hasPhone = await phoneProvisioningService.teamHasPhone(defaultTeamId);

    if (hasPhone) {
      console.log('✅ Default team already has a phone provisioned');

      const phoneConfig = await phoneProvisioningService.getTeamPhoneConfig(defaultTeamId);

      return res.json({
        success: true,
        message: 'Default team already has a phone provisioned',
        phoneConfig: {
          phoneNumber: phoneConfig.twilio_number,
          vapiPhoneId: phoneConfig.vapi_phone_id
        }
      });
    }

    // Step 3: Provision phone for default team
    console.log('📞 Provisioning phone for default team...');

    const provisionResult = await phoneProvisioningService.provisionPhoneForTeam({
      teamId: defaultTeamId,
      teamName: 'HomeQuest Demo Team',
      ownerEmail: 'admin@homequest.com',
      preferredAreaCode: '678' // Atlanta area code
    });

    if (provisionResult.success) {
      console.log('🎉 Phone provisioned successfully!');
      console.log('📞 Phone number:', provisionResult.twilioNumber);
      console.log('🤖 VAPI ID:', provisionResult.vapiPhoneId);

      res.json({
        success: true,
        message: 'Team phones setup completed successfully!',
        phoneConfig: {
          phoneNumber: provisionResult.twilioNumber,
          vapiPhoneId: provisionResult.vapiPhoneId
        }
      });
    } else {
      console.error('❌ Phone provisioning failed:', provisionResult.error);

      res.status(500).json({
        success: false,
        error: `Phone provisioning failed: ${provisionResult.error}`
      });
    }

  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get current team phone status
 */
router.get('/setup/team-phones/status', async (req, res) => {
  try {
    const defaultTeamId = '11111111-1111-1111-1111-111111111111';

    const hasPhone = await phoneProvisioningService.teamHasPhone(defaultTeamId);

    if (hasPhone) {
      const phoneConfig = await phoneProvisioningService.getTeamPhoneConfig(defaultTeamId);

      res.json({
        success: true,
        hasPhone: true,
        phoneConfig: {
          phoneNumber: phoneConfig.twilio_number,
          vapiPhoneId: phoneConfig.vapi_phone_id,
          status: phoneConfig.status
        }
      });
    } else {
      res.json({
        success: true,
        hasPhone: false,
        message: 'No phone provisioned for default team'
      });
    }

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add existing VAPI phone to team
 * Accepts teamId directly or looks up from userId
 */
router.post('/setup/add-team-phone', async (req, res) => {
  try {
    const { userId, teamId, teamName, ownerEmail, twilioNumber, vapiPhoneId } = req.body;

    if (!twilioNumber || !vapiPhoneId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: twilioNumber, vapiPhoneId'
      });
    }

    let finalTeamId = teamId;
    let finalTeamName = teamName;
    let finalOwnerEmail = ownerEmail;

    // If teamId not provided, look it up from userId
    if (!finalTeamId && userId) {
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

      finalTeamId = profile.team_id;

      // Get team details if not provided
      if (!finalTeamName || !finalOwnerEmail) {
        const { data: team } = await supabase
          .from('teams')
          .select('name, company_name')
          .eq('id', finalTeamId)
          .single();

        finalTeamName = finalTeamName || team?.company_name || team?.name || 'Team';
      }
    }

    // Require either teamId or userId
    if (!finalTeamId) {
      return res.status(400).json({
        success: false,
        error: 'Either teamId or userId must be provided'
      });
    }

    // Set defaults only if not provided
    finalTeamName = finalTeamName || 'Team';
    finalOwnerEmail = finalOwnerEmail || 'admin@example.com';

    // Check if phone already exists
    const { data: existing } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', finalTeamId);

    if (existing && existing.length > 0) {
      // Update existing
      const { error } = await supabase
        .from('team_phones')
        .update({
          vapi_phone_id: vapiPhoneId,
          twilio_number: twilioNumber,
          team_name: finalTeamName,
          owner_email: finalOwnerEmail,
          status: 'active'
        })
        .eq('team_id', finalTeamId);

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Phone updated for team',
        teamId: finalTeamId
      });
    } else {
      // Insert new
      const { error } = await supabase
        .from('team_phones')
        .insert({
          team_id: finalTeamId,
          team_name: finalTeamName,
          owner_email: finalOwnerEmail,
          twilio_number: twilioNumber,
          vapi_phone_id: vapiPhoneId,
          default_voice_id: 'ewxUvnyvvOehYjKjUVKC',
          status: 'active'
        });

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Phone added to team',
        teamId: finalTeamId
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
export default router;
