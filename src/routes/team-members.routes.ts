/**
 * Team Members Management Routes
 * Manage team members for AI call routing
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import aiReceptionistService from '../services/ai-receptionist.service';
import resendEmailService from '../services/resend-email.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get all team members
 */
router.get('/', async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'teamId is required'
      });
    }

    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('department', { ascending: true });

    if (error) throw error;

    // Group by department
    const byDepartment = (data || []).reduce((acc: any, member: any) => {
      if (!acc[member.department]) {
        acc[member.department] = [];
      }
      acc[member.department].push(member);
      return acc;
    }, {});

    res.json({
      success: true,
      data: data || [],
      byDepartment,
      total: data?.length || 0
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Invite team member (sends email invitation)
 */
router.post('/invite', async (req, res) => {
  try {
    const inviteData = req.body;

    // Validate required fields
    if (!inviteData.email || !inviteData.fullName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, fullName'
      });
    }

    // Get team ID from request or user context
    const teamId = inviteData.teamId || req.body.team_id;
    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'teamId is required'
      });
    }

    // Create team member record matching actual Supabase schema
    // Actual columns: id, user_id, team_id, role, permissions, joined_at, invited_by, created_at, department
    // Valid roles: owner, admin, member, viewer
    const memberData: any = {
      team_id: teamId,
      role: inviteData.role || 'member', // Must be: owner, admin, member, or viewer
      department: inviteData.department || 'Operations',
      permissions: {
        email: inviteData.email,
        fullName: inviteData.fullName,
        phoneNumber: inviteData.phoneNumber,
        jobTitle: inviteData.jobTitle, // Store original job title in permissions
        canApproveEstimates: inviteData.permissions?.canApproveEstimates || false,
        canScheduleWork: inviteData.permissions?.canScheduleWork || false,
        canAccessFinancials: inviteData.permissions?.canAccessFinancials || false,
        canManageTeam: inviteData.permissions?.canManageTeam || false,
        canHandleComplaints: inviteData.permissions?.canHandleComplaints || false,
        inviteStatus: 'pending'
      }
    };

    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .insert([memberData])
      .select()
      .single();

    if (memberError) throw memberError;

    // Generate invitation URL with team member ID
    const frontendUrl = process.env.FRONTEND_URL || process.env.ALLOWED_ORIGINS || 'https://construction-platform-rc3mhy39v-ken-whites-projects-cbf8a7e8.vercel.app';
    const inviteUrl = `${frontendUrl}/accept-invite?token=${member.id}`;

    // Send invitation email using Resend
    try {
      await resendEmailService.sendTeamInvite({
        email: inviteData.email,
        fullName: inviteData.fullName,
        teamName: 'Your Team', // TODO: Get actual team name from database
        role: inviteData.jobTitle || inviteData.role,
        department: inviteData.department,
        inviteUrl: inviteUrl
      });
      console.log('✅ Invitation email sent to:', inviteData.email);
    } catch (emailError) {
      console.error('❌ Error sending invitation email:', emailError);
      // Continue even if email fails - admin can share link manually
    }

    res.json({
      success: true,
      message: `Invitation sent to ${inviteData.email}`,
      data: member,
      inviteUrl: inviteUrl // Return URL in case email fails
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Accept invitation (user completes their profile)
 */
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, phoneNumber, password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Invitation token is required'
      });
    }

    // Get the team member record by token (ID)
    const { data: member, error: fetchError } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', token)
      .single();

    if (fetchError || !member) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired invitation'
      });
    }

    // Check if invite is still pending
    if (member.permissions?.inviteStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invitation already accepted or expired'
      });
    }

    // Update permissions with phone number and mark as accepted
    const updatedPermissions = {
      ...member.permissions,
      phoneNumber: phoneNumber,
      inviteStatus: 'accepted'
    };

    const updateData: any = {
      permissions: updatedPermissions,
      joined_at: new Date().toISOString()
    };

    const { data: updatedMember, error: updateError } = await supabase
      .from('team_members')
      .update(updateData)
      .eq('id', token)
      .select()
      .single();

    if (updateError) throw updateError;

    // If password provided, create auth user
    if (password && member.permissions?.email) {
      try {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: member.permissions.email,
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: member.permissions?.fullName || 'Team Member',
            team_id: member.team_id,
            team_member_id: member.id,
            role: member.role,
            department: member.department
          }
        });

        if (authError) {
          console.error('Error creating auth user:', authError);
        } else {
          // Link auth user to team member
          await supabase
            .from('team_members')
            .update({ user_id: authUser.user.id })
            .eq('id', token);
        }
      } catch (authError) {
        console.error('Auth error:', authError);
      }
    }

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: updatedMember
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get invitation details (for frontend to pre-fill form)
 */
router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, role, department, permissions')
      .eq('id', token)
      .single();

    if (error || !member) {
      return res.status(404).json({
        success: false,
        error: 'Invalid invitation'
      });
    }

    if (member.permissions?.inviteStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Invitation already accepted or expired'
      });
    }

    res.json({
      success: true,
      data: {
        email: member.permissions?.email,
        fullName: member.permissions?.fullName,
        role: member.role,
        department: member.department
      }
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add team member (direct, no email)
 */
router.post('/', async (req, res) => {
  try {
    const memberData = req.body;

    // Validate required fields
    if (!memberData.team_id || !memberData.name || !memberData.phone_number || !memberData.role || !memberData.department) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: team_id, name, phone_number, role, department'
      });
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert([memberData])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Team member added successfully',
      data
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update team member
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const memberData = req.body;

    const { data, error } = await supabase
      .from('team_members')
      .update({
        ...memberData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Team member updated successfully',
      data
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update member availability
 */
router.patch('/team/:teamId/members/:memberId/availability', async (req, res) => {
  try {
    const { teamId, memberId } = req.params;
    const { availability } = req.body;
    
    const validStatuses = ['available', 'busy', 'offline', 'do_not_disturb'];
    if (!validStatuses.includes(availability)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid availability status'
      });
    }
    
    const { error } = await supabase
      .from('team_members')
      .update({ 
        availability,
        updated_at: new Date().toISOString()
      })
      .eq('id', memberId)
      .eq('team_id', teamId);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Availability updated to ${availability}`
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete team member
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Team member deleted successfully'
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get department routing rules
 */
router.get('/team/:teamId/routing', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    // Get team-specific rules
    const { data: teamRules } = await supabase
      .from('department_routing')
      .select('*')
      .eq('team_id', teamId)
      .order('priority', { ascending: false });
    
    // Get default rules
    const { data: defaultRules } = await supabase
      .from('department_routing')
      .select('*')
      .eq('team_id', 'default')
      .order('priority', { ascending: false });
    
    res.json({
      success: true,
      teamRules: teamRules || [],
      defaultRules: defaultRules || [],
      merged: [...(teamRules || []), ...(defaultRules || [])]
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add routing rule
 */
router.post('/team/:teamId/routing', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { keywords, department, priority, fallbackDepartment } = req.body;
    
    const { error } = await supabase
      .from('department_routing')
      .insert({
        team_id: teamId,
        keyword_triggers: keywords,
        department,
        priority: priority || 1,
        fallback_department: fallbackDepartment
      });
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Routing rule added'
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get messages for team
 */
router.get('/team/:teamId/messages', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { unreadOnly, urgent } = req.query;
    
    let query = supabase
      .from('team_messages')
      .select(`
        *,
        for_member:team_members!for_member_id(name, department)
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    
    if (unreadOnly === 'true') {
      query = query.eq('read', false);
    }
    
    if (urgent === 'true') {
      query = query.eq('urgent', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      messages: data,
      unreadCount: data?.filter(m => !m.read).length || 0,
      urgentCount: data?.filter(m => m.urgent && !m.read).length || 0
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Mark message as read
 */
router.patch('/team/:teamId/messages/:messageId/read', async (req, res) => {
  try {
    const { teamId, messageId } = req.params;
    
    const { error } = await supabase
      .from('team_messages')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('team_id', teamId);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Message marked as read'
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get transfer analytics
 */
router.get('/team/:teamId/analytics/transfers', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { period = '7d' } = req.query;
    
    const analytics = await aiReceptionistService.getTransferAnalytics(
      teamId, 
      period as string
    );
    
    res.json({
      success: true,
      period,
      analytics
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Bulk update team members business hours
 */
router.patch('/team/:teamId/business-hours', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { businessHours } = req.body;
    
    const { error } = await supabase
      .from('team_members')
      .update({
        business_hours: businessHours,
        updated_at: new Date().toISOString()
      })
      .eq('team_id', teamId);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Business hours updated for all team members'
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get available members for transfer
 */
router.get('/team/:teamId/available-for-transfer', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { department } = req.query;
    
    let query = supabase
      .from('available_team_members') // Using the view
      .select('*')
      .eq('team_id', teamId)
      .eq('can_take_call', true);
    
    if (department) {
      query = query.eq('department', department);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      available: data,
      count: data?.length || 0
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;