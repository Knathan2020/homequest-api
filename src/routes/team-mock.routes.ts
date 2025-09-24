import { Router, Request, Response } from 'express';

const router = Router();

// Mock team data for Ken White
const mockTeamData = {
  owner: {
    id: 'ken-white-001',
    email: 'kenwhite2015@gmail.com',
    fullName: 'Ken White',
    role: 'owner',
    status: 'online',
    title: 'CEO / Founder',
    department: 'Leadership',
    avatarUrl: null,
    lastSeen: new Date().toISOString()
  },
  members: []
};

// GET /api/team/members - Get all team members
router.get('/team/members', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching team members (mock data)');
    
    // Return Ken White as the owner with empty members array
    res.json({
      success: true,
      data: {
        members: [mockTeamData.owner, ...mockTeamData.members]
      }
    });
  } catch (error) {
    console.error('❌ Error fetching team members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team members'
    });
  }
});

// POST /api/team/members/invite - Send team invitation
router.post('/team/members/invite', async (req: Request, res: Response) => {
  try {
    const { email, role = 'member', fullName } = req.body;
    
    console.log('📧 Sending team invitation to:', email);
    
    // Add to mock members
    const newMember = {
      id: `member-${Date.now()}`,
      email,
      fullName: fullName || email.split('@')[0],
      role,
      status: 'pending',
      title: role,
      department: 'General',
      avatarUrl: null,
      lastSeen: new Date().toISOString()
    };
    
    mockTeamData.members.push(newMember);
    
    res.json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: { invitation: newMember }
    });
  } catch (error) {
    console.error('❌ Error sending invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send invitation'
    });
  }
});

// DELETE /api/team/members/:memberId - Remove team member
router.delete('/team/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    
    console.log('🗑️ Removing team member:', memberId);
    
    // Remove from mock data
    mockTeamData.members = mockTeamData.members.filter(m => m.id !== memberId);
    
    res.json({
      success: true,
      message: 'Team member removed'
    });
  } catch (error) {
    console.error('❌ Error removing member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove member'
    });
  }
});

// POST /api/team/members/status - Update member status
router.post('/team/members/status', async (req: Request, res: Response) => {
  try {
    const { memberId, status } = req.body;
    
    console.log('📊 Updating member status:', { memberId, status });
    
    // Update in mock data
    if (memberId === 'ken-white-001') {
      mockTeamData.owner.status = status;
      mockTeamData.owner.lastSeen = new Date().toISOString();
    } else {
      const member = mockTeamData.members.find(m => m.id === memberId);
      if (member) {
        member.status = status;
        member.lastSeen = new Date().toISOString();
      }
    }
    
    res.json({
      success: true,
      message: 'Status updated'
    });
  } catch (error) {
    console.error('❌ Error updating status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status'
    });
  }
});

export default router;