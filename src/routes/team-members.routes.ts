/**
 * Team Members Management Routes
 * Manage team members for AI call routing
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import aiReceptionistService from '../services/ai-receptionist.service';

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

    // Create team member record
    const memberData = {
      team_id: teamId,
      email: inviteData.email,
      full_name: inviteData.fullName,
      name: inviteData.fullName, // Alias for compatibility
      phone_number: inviteData.phoneNumber,
      alternate_phone: inviteData.alternatePhone,
      role: inviteData.role,
      department: inviteData.department,
      job_title: inviteData.jobTitle,
      status: 'pending', // Mark as pending until they accept

      // Permissions
      can_approve_estimates: inviteData.permissions?.canApproveEstimates || false,
      can_schedule_work: inviteData.permissions?.canScheduleWork || false,
      can_access_financials: inviteData.permissions?.canAccessFinancials || false,
      can_manage_team: inviteData.permissions?.canManageTeam || false,
      can_handle_complaints: inviteData.permissions?.canHandleComplaints || false,

      // Additional data (stored as JSON)
      availability: 'available',
      invited_at: new Date().toISOString()
    };

    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .insert([memberData])
      .select()
      .single();

    if (memberError) throw memberError;

    // Send invitation email using Supabase Auth
    const inviteUrl = `${process.env.FRONTEND_URL || process.env.ALLOWED_ORIGINS}/accept-invite?token=${member.id}`;

    try {
      // Use Supabase to send invite email
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        inviteData.email,
        {
          data: {
            full_name: inviteData.fullName,
            team_id: teamId,
            role: inviteData.role,
            department: inviteData.department,
            invited_by: req.body.invitedBy || 'admin'
          },
          redirectTo: inviteUrl
        }
      );

      if (inviteError) {
        console.error('Error sending invite email:', inviteError);
        // Don't fail the request, just log the error
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Continue even if email fails
    }

    res.json({
      success: true,
      message: `Invitation sent to ${inviteData.email}`,
      data: member
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