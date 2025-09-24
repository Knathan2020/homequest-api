/**
 * User Routes
 * Handles user profile and company information
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get current user's profile with company information
 */
router.get('/user/profile', async (req, res) => {
  try {
    // Get user ID from auth header or session
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    // Get team/company information
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', profile?.team_id)
      .single();

    if (teamError) {
      console.error('Team fetch error:', teamError);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: profile?.first_name && profile?.last_name 
          ? `${profile.first_name} ${profile.last_name}`
          : profile?.full_name || user.email,
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        fullName: profile?.full_name,
        phone: profile?.phone_number,
        role: profile?.role || 'builder',
        teamId: profile?.team_id,
        companyId: team?.id,
        // Check both profile company_name (for individual users) and team company_name
        companyName: profile?.company_name || team?.company_name || team?.name,
        companyPhone: team?.phone_number
      }
    });

  } catch (error: any) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch profile'
    });
  }
});

/**
 * Update user profile
 */
router.put('/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const {
      firstName,
      lastName,
      phoneNumber
    } = req.body;

    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error: any) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update profile'
    });
  }
});

/**
 * Update company information
 */
router.put('/user/company', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const {
      companyName,
      companyPhone
    } = req.body;

    // Get user's team ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.team_id) {
      return res.status(400).json({
        success: false,
        error: 'User is not associated with a team'
      });
    }

    // Check if user has permission (owner or admin)
    if (profile.role !== 'owner' && profile.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to update company information'
      });
    }

    // Update team/company info
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        company_name: companyName,
        phone_number: companyPhone,
        updated_at: new Date().toISOString()
      })
      .eq('id', profile.team_id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Company information updated successfully'
    });

  } catch (error: any) {
    console.error('Company update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update company information'
    });
  }
});

export default router;