/**
 * Team Management Routes
 * Handles team member operations and online status
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import emailService from '../services/email.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get all team members
 * AUTO-SYNCS profile data to team_members if missing
 */
router.get('/members', async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'teamId is required'
      });
    }

    if (!supabase || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    // STEP 1: Sync profiles to team_members if missing
    // Get all profiles for this team
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone_number, role, team_id')
      .eq('team_id', teamId);

    if (!profilesError && profiles && profiles.length > 0) {
      // For each profile, ensure there's a corresponding team_members record
      for (const profile of profiles) {
        const { data: existingMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', profile.id)
          .eq('team_id', teamId)
          .maybeSingle();

        if (!existingMember) {
          // Create team member record from profile
          console.log(`🔄 Auto-syncing profile to team_members: ${profile.email}`);
          await supabase
            .from('team_members')
            .insert({
              team_id: teamId,
              user_id: profile.id,
              email: profile.email,
              name: profile.full_name || profile.email?.split('@')[0] || 'Team Member',
              phone_number: profile.phone_number || '',
              role: profile.role || 'member',
              department: 'Operations',
              availability: 'available',
              can_receive_transfers: true,
              seniority_level: 1
            });
        }
      }
    }

    // STEP 2: Fetch all team members
    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    if (!members || members.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // STEP 3: Return members with online status
    // Note: Online status can be calculated from last_activity if that column exists
    res.json({
      success: true,
      data: members
    });

  } catch (error: any) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch team members'
    });
  }
});

/**
 * Add a new team member (invite)
 */
router.post('/team/members/invite', async (req, res) => {
  try {
    const { 
      teamId, 
      email, 
      fullName, 
      role = 'member',
      department,
      phoneNumber,
      invitedBy
    } = req.body;

    // Check if member already exists
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', email)
      .single();

    if (existingMember) {
      return res.status(400).json({
        success: false,
        error: 'This email is already a team member'
      });
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');

    // Create team member record (pending status)
    const { data: newMember, error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        email,
        full_name: fullName,
        role,
        department,
        phone_number: phoneNumber,
        status: 'pending',
        invited_by: invitedBy,
        invited_at: new Date().toISOString()
      })
      .select()
      .single();

    if (memberError) {
      throw memberError;
    }

    // Create invitation record
    const { error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        team_id: teamId,
        email,
        role,
        invitation_token: invitationToken,
        invited_by: invitedBy
      });

    if (inviteError) {
      // Rollback member creation if invitation fails
      await supabase
        .from('team_members')
        .delete()
        .eq('id', newMember.id);
      throw inviteError;
    }

    // Send invitation email (implement this based on your email service)
    // await emailService.sendTeamInvitation(email, fullName, teamName, invitationToken);

    res.json({
      success: true,
      message: 'Team member invited successfully',
      data: newMember
    });

  } catch (error: any) {
    console.error('Error inviting team member:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to invite team member'
    });
  }
});

/**
 * Update team member
 */
router.put('/team/members/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.team_id;
    delete updates.created_at;

    const { data: updatedMember, error } = await supabase
      .from('team_members')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: updatedMember
    });

  } catch (error: any) {
    console.error('Error updating team member:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update team member'
    });
  }
});

/**
 * Remove team member
 */
router.delete('/team/members/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;

    // Check if member exists and get their role
    const { data: member, error: fetchError } = await supabase
      .from('team_members')
      .select('role, email')
      .eq('id', memberId)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found'
      });
    }

    // Prevent removing the owner
    if (member.role === 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Cannot remove team owner'
      });
    }

    // Delete the member
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      throw deleteError;
    }

    // Also delete any pending invitations
    await supabase
      .from('team_invitations')
      .delete()
      .eq('email', member.email);

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });

  } catch (error: any) {
    console.error('Error removing team member:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove team member'
    });
  }
});

/**
 * Update user's online status
 */
router.post('/team/members/status', async (req, res) => {
  try {
    const { userId, isOnline } = req.body;

    const { data: updatedMember, error } = await supabase
      .from('team_members')
      .update({
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: updatedMember
    });

  } catch (error: any) {
    console.error('Error updating online status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update online status'
    });
  }
});

/**
 * Accept team invitation
 */
router.post('/team/invitations/accept', async (req, res) => {
  try {
    const { token, userId } = req.body;

    // Find invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('invitation_token', token)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired invitation'
      });
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'This invitation has expired'
      });
    }

    // Update team member record
    const { error: updateError } = await supabase
      .from('team_members')
      .update({
        user_id: userId,
        status: 'active',
        joined_at: new Date().toISOString()
      })
      .eq('team_id', invitation.team_id)
      .eq('email', invitation.email);

    if (updateError) {
      throw updateError;
    }

    // Mark invitation as accepted
    await supabase
      .from('team_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    res.json({
      success: true,
      message: 'Successfully joined the team',
      data: {
        teamId: invitation.team_id
      }
    });

  } catch (error: any) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to accept invitation'
    });
  }
});

/**
 * Get team statistics
 */
router.get('/team/stats', async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required'
      });
    }

    // Get team member counts
    const { data: members, error } = await supabase
      .from('team_members')
      .select('status, is_online')
      .eq('team_id', teamId);

    if (error) {
      throw error;
    }

    const stats = {
      totalMembers: members?.length || 0,
      activeMembers: members?.filter(m => m.status === 'active').length || 0,
      pendingInvites: members?.filter(m => m.status === 'pending').length || 0,
      onlineMembers: members?.filter(m => m.is_online).length || 0
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch team statistics'
    });
  }
});

/**
 * ADDITIONAL ROUTES FOR TEAM MEMBER MANAGEMENT (Frontend Compatibility)
 * These routes match the frontend TeamMembersManager.tsx expectations
 */

/**
 * Get team members by team ID (frontend format)
 */
router.get('/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;

    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('name');

    if (error) {
      console.error('Error fetching team members:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch team members'
      });
    }

    // Transform database format to frontend format
    const transformedMembers = (members || []).map(member => ({
      id: member.id,
      name: member.name,
      phoneNumber: member.phone_number,
      email: member.email,
      role: member.role,
      department: member.department,
      availability: member.availability,
      expertise: member.expertise || []
    }));

    res.json({
      success: true,
      members: transformedMembers
    });

  } catch (error: any) {
    console.error('Team members route error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add team member (frontend format)
 */
router.post('/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      name,
      phoneNumber,
      email,
      role,
      department,
      availability = 'available',
      expertise = []
    } = req.body;

    // Validate required fields
    if (!name || !phoneNumber || !role || !department) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, phoneNumber, role, department'
      });
    }

    // Check if phone number already exists for this team
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('phone_number', phoneNumber)
      .single();

    if (existingMember) {
      return res.status(409).json({
        success: false,
        error: 'Phone number already exists for this team'
      });
    }

    const { data: member, error } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        name,
        phone_number: phoneNumber,
        email,
        role,
        department,
        availability,
        expertise,
        seniority_level: 1,
        can_receive_transfers: true,
        max_daily_transfers: 20
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating team member:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create team member'
      });
    }

    res.status(201).json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        phoneNumber: member.phone_number,
        email: member.email,
        role: member.role,
        department: member.department,
        availability: member.availability,
        expertise: member.expertise || []
      },
      message: 'Team member added successfully'
    });

  } catch (error: any) {
    console.error('Add team member error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update team member availability (frontend format)
 */
router.patch('/:teamId/members/:memberId/availability', async (req, res) => {
  try {
    const { teamId, memberId } = req.params;
    const { availability } = req.body;

    if (!availability) {
      return res.status(400).json({
        success: false,
        error: 'Availability is required'
      });
    }

    const validAvailability = ['available', 'busy', 'offline', 'do_not_disturb'];
    if (!validAvailability.includes(availability)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid availability status'
      });
    }

    const { data: member, error } = await supabase
      .from('team_members')
      .update({ availability })
      .eq('team_id', teamId)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      console.error('Error updating availability:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update availability'
      });
    }

    res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        phoneNumber: member.phone_number,
        email: member.email,
        role: member.role,
        department: member.department,
        availability: member.availability,
        expertise: member.expertise || []
      },
      message: 'Availability updated successfully'
    });

  } catch (error: any) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete team member (frontend format)
 */
router.delete('/:teamId/members/:memberId', async (req, res) => {
  try {
    const { teamId, memberId } = req.params;

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('id', memberId);

    if (error) {
      console.error('Error deleting team member:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete team member'
      });
    }

    res.json({
      success: true,
      message: 'Team member deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete team member error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;