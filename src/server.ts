import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { routeMapper, logUnmappedRoutes } from './middleware/route-mapper';

// Import critical routes
import enhancedDetectionRoutes from './routes/enhanced-detection.routes';
import intelligentAnalysisRoutes from './routes/intelligent-analysis.routes';
import floorPlansRoutes from './routes/floor-plans.routes';
import floorPlanPersistenceRoutes from './routes/floor-plan-persistence.routes';
import documentsRoutes from './routes/documents.routes';
import productionBlueprintRoutes from './routes/production-blueprint.routes';
import twilioRoutes from './routes/twilio.routes';
import nylasEmailRoutes from './routes/nylas-email.routes';
import teamRoutes from './routes/team.routes';
import userRoutes from './routes/user.routes';
import ragRoutes from './routes/rag.routes';
import elevationRoutes from './routes/elevation.routes';
import vapiRoutes from './routes/vapi.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2ODI4MTcsImV4cCI6MjA2NzI1ODgxN30.-rBrI8a56Pc-5ROhiZaGtK6QwH1qrZOt7Osmj-lqeJc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add route mapper middleware BEFORE other routes
app.use(routeMapper);
app.use(logUnmappedRoutes);

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      // Allow public access for now but no user context
      req.user = null;
      return next();
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    req.user = null;
    next();
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============= PROJECTS API =============
app.get('/api/projects', authenticateUser, async (req, res) => {
  try {
    // No user authenticated, return empty array for security
    if (!req.user) {
      console.log('❌ No authenticated user - returning empty array');
      return res.json({ success: true, data: [] });
    }

    console.log(`📊 Fetching projects for user: ${req.user.email} (ID: ${req.user.id})`);

    // Get the user's profile to check their team_id for filtering
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_name, team_id')
      .eq('id', req.user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
    }

    let projects = [];

    // Check team_id first (newer method)
    if (userProfile?.team_id) {
      console.log(`🏢 User has team_id: ${userProfile.team_id}`);

      // Get all projects for this team
      const { data: teamProjects, error } = await supabase
        .from('projects')
        .select(`
          *,
          buildings:buildings(count),
          construction_phases:construction_phases(
            id,
            phase,
            status,
            completion_percentage
          )
        `)
        .eq('team_id', userProfile.team_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      projects = teamProjects || [];
      console.log(`✅ Found ${projects.length} team projects`);

    } else if (userProfile?.company_name) {
      console.log(`🏢 User has company_name: ${userProfile.company_name}`);

      // Legacy: get all team projects by company name
      const { data: teamUserIds, error: teamError } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_name', userProfile.company_name);

      if (!teamError && teamUserIds) {
        const teamIds = teamUserIds.map(u => u.id);
        console.log(`👥 Found ${teamIds.length} team members`);

        // Get projects from all team members
        const { data: teamProjects, error } = await supabase
          .from('projects')
          .select(`
            *,
            buildings:buildings(count),
            construction_phases:construction_phases(
              id,
              phase,
              status,
              completion_percentage
            )
          `)
          .in('user_id', teamIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        projects = teamProjects || [];
        console.log(`✅ Found ${projects.length} team projects (by company_name)`);
      }
    } else {
      console.log(`👤 User has no team - fetching personal projects only`);

      // No team - just get user's own projects
      const { data: userProjects, error } = await supabase
        .from('projects')
        .select(`
          *,
          buildings:buildings(count),
          construction_phases:construction_phases(
            id,
            phase,
            status,
            completion_percentage
          )
        `)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      projects = userProjects || [];
      console.log(`✅ Found ${projects.length} personal projects`);
    }

    // Process projects to add progress info
    const processedProjects = (projects || []).map(project => {
      const phases = project.construction_phases || [];
      const totalProgress = phases.reduce((sum, phase) =>
        sum + (phase.completion_percentage || 0), 0
      );
      const averageProgress = phases.length > 0 ? totalProgress / phases.length : 0;

      return {
        ...project,
        progress: Math.round(averageProgress),
        phaseCount: phases.length,
        activePhase: phases.find(p => p.status === 'in_progress')?.phase || 'Planning'
      };
    });

    console.log(`📤 Returning ${processedProjects.length} processed projects to client`);
    res.json({ success: true, data: processedProjects });
  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects', authenticateUser, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    console.log(`📝 Creating project for user: ${req.user.email}`);

    // Get user's profile to get team_id
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('team_id, company_name')
      .eq('id', req.user.id)
      .single();

    // Add user_id AND team_id to the project data
    const projectData = {
      ...req.body,
      user_id: req.user.id,
      team_id: userProfile?.team_id || null
    };

    console.log(`🏢 Creating project with team_id: ${projectData.team_id || 'none (personal project)'}`);

    const { data: project, error } = await supabase
      .from('projects')
      .insert([projectData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= BUILDINGS API =============
app.get('/api/buildings', async (req, res) => {
  try {
    const { data: buildings, error } = await supabase
      .from('buildings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: buildings || [] });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/buildings', async (req, res) => {
  try {
    const { data: building, error } = await supabase
      .from('buildings')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: building });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= NOTIFICATIONS API =============
app.post('/api/notifications', async (req, res) => {
  try {
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= TEAM API =============
app.get('/api/team/:teamId/members', async (req, res) => {
  try {
    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', req.params.teamId);

    if (error) throw error;

    res.json({ success: true, data: members || [] });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/team/:teamId/members', async (req, res) => {
  try {
    const memberData = { ...req.body, team_id: req.params.teamId };
    const { data: member, error } = await supabase
      .from('team_members')
      .insert([memberData])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: member });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= ATTACHMENTS API =============
app.post('/api/attachments/process', async (req, res) => {
  try {
    // Process attachment logic here
    const { file, projectId } = req.body;

    // For now, just save to database
    const { data: attachment, error } = await supabase
      .from('attachments')
      .insert([{
        project_id: projectId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        url: file.url || '',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data: attachment });
  } catch (error) {
    console.error('Error processing attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= VENDOR BIDDING API =============
app.get('/api/vendor-bidding/projects/:projectId/bidding-details', async (req, res) => {
  try {
    const { data: details, error } = await supabase
      .from('vendor_bids')
      .select('*')
      .eq('project_id', req.params.projectId);

    if (error) throw error;

    res.json({ success: true, data: details || [] });
  } catch (error) {
    console.error('Error fetching bidding details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/vendor-bidding/projects/:projectId/line-items', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('project_line_items')
      .select('*')
      .eq('project_id', req.params.projectId);

    if (error) throw error;

    res.json({ success: true, data: items || [] });
  } catch (error) {
    console.error('Error fetching line items:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vendor-bidding/vendor/submit-bid', async (req, res) => {
  try {
    const { data: bid, error } = await supabase
      .from('vendor_bids')
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data: bid });
  } catch (error) {
    console.error('Error submitting bid:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= VENDOR BIDS ENDPOINT =============
app.get('/api/vendor-bidding/projects/:projectId/bids', async (req, res) => {
  try {
    const { data: bids, error } = await supabase
      .from('bids')
      .select(`
        *,
        vendor:vendors(*)
      `)
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(bids || []);
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= USAGE ENDPOINT =============
app.get('/api/usage/today/:teamId', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch usage data
    const { data: usageData, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('team_id', req.params.teamId)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    let usage = {
      team_id: req.params.teamId,
      date: today.toISOString().split('T')[0],
      api_calls: 0,
      tokens_used: 0,
      storage_mb: 0,
      bandwidth_mb: 0,
      email_sent: 0,
      phone_minutes: 0,
      ai_requests: 0
    };

    if (usageData && usageData.length > 0) {
      usageData.forEach(log => {
        usage.api_calls += log.api_calls || 0;
        usage.tokens_used += log.tokens_used || 0;
        usage.storage_mb += log.storage_mb || 0;
        usage.bandwidth_mb += log.bandwidth_mb || 0;
        usage.email_sent += log.email_sent || 0;
        usage.phone_minutes += log.phone_minutes || 0;
        usage.ai_requests += log.ai_requests || 0;
      });
    }

    // Calculate costs
    usage.estimated_cost = {
      api_calls: usage.api_calls * 0.0001,
      tokens: usage.tokens_used * 0.00002,
      storage: usage.storage_mb * 0.023,
      bandwidth: usage.bandwidth_mb * 0.087,
      email: usage.email_sent * 0.0001,
      phone: usage.phone_minutes * 0.015,
      ai: usage.ai_requests * 0.002,
      total: 0
    };

    usage.estimated_cost.total = Object.values(usage.estimated_cost)
      .filter(v => typeof v === 'number')
      .reduce((sum, cost) => sum + cost, 0);

    res.json(usage);
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= AI ENDPOINTS (Placeholder) =============
// These need actual AI implementation
app.post('/api/ai/vendor', async (req, res) => {
  res.json({ success: true, message: 'AI vendor endpoint - needs implementation' });
});

app.post('/api/ai/emergency', async (req, res) => {
  res.json({ success: true, message: 'AI emergency endpoint - needs implementation' });
});

app.post('/api/ai/voice', async (req, res) => {
  res.json({ success: true, message: 'AI voice endpoint - needs implementation' });
});

app.post('/api/ai/memory', async (req, res) => {
  res.json({ success: true, message: 'AI memory endpoint - needs implementation' });
});

app.post('/api/ai/knowledge', async (req, res) => {
  res.json({ success: true, message: 'AI knowledge endpoint - needs implementation' });
});

app.post('/api/ai/decisions', async (req, res) => {
  res.json({ success: true, message: 'AI decisions endpoint - needs implementation' });
});

app.post('/api/ai/analyze-email', async (req, res) => {
  res.json({ success: true, analysis: 'Email analysis placeholder' });
});

app.post('/api/ai/generate-response', async (req, res) => {
  res.json({ success: true, response: 'Generated response placeholder' });
});

app.post('/api/ai/analyze-message', async (req, res) => {
  res.json({ success: true, analysis: 'Message analysis placeholder' });
});

app.post('/api/ai/transcribe-voicemail', async (req, res) => {
  res.json({ success: true, transcript: 'Voicemail transcript placeholder' });
});

app.get('/api/ai-brain/status', async (req, res) => {
  res.json({ success: true, status: 'operational' });
});

// ============= COMMUNICATION ENDPOINTS (Placeholder) =============
app.post('/api/sms/send', async (req, res) => {
  res.json({ success: true, message: 'SMS sent (placeholder)' });
});

app.post('/api/email/send', async (req, res) => {
  res.json({ success: true, message: 'Email sent (placeholder)' });
});

app.post('/api/gmail/connect', async (req, res) => {
  res.json({ success: true, connected: true });
});

app.get('/api/gmail/threads', async (req, res) => {
  res.json({ success: true, threads: [] });
});

app.get('/api/gmail/check-new', async (req, res) => {
  res.json({ success: true, newMessages: [] });
});

app.post('/api/gmail/send', async (req, res) => {
  res.json({ success: true, message: 'Email sent via Gmail (placeholder)' });
});

// ============= VAPI ENDPOINTS (Placeholder) =============
app.get('/api/vapi/voices', async (req, res) => {
  res.json({ success: true, voices: [] });
});

app.post('/api/vapi/call', async (req, res) => {
  res.json({ success: true, callId: 'placeholder-call-id' });
});

// ============= OTHER ENDPOINTS =============
app.get('/api/calls/transcript/:id', async (req, res) => {
  res.json({ success: true, transcript: 'Call transcript placeholder' });
});

app.post('/api/elevation/batch', async (req, res) => {
  res.json({ success: true, elevations: [] });
});

app.get('/api/conversations/transcripts/:teamId', async (req, res) => {
  res.json({ success: true, transcripts: [] });
});

// ============= FLOOR PLANS API =============
app.get('/api/floor-plans/scale-presets', async (req, res) => {
  res.json({
    success: true,
    presets: [
      { id: 1, name: 'Standard', scale: 1.0 },
      { id: 2, name: 'Large', scale: 1.5 }
    ]
  });
});

app.get('/api/floor-plans/jobs', async (req, res) => {
  res.json({ success: true, jobs: [] });
});

app.post('/api/floor-plans/upload', async (req, res) => {
  res.json({ success: true, jobId: 'job-' + Date.now() });
});

app.get('/api/floor-plans/job/:jobId', async (req, res) => {
  res.json({ success: true, status: 'completed' });
});

// Register all imported routes
app.use('/api', enhancedDetectionRoutes);
app.use('/api', intelligentAnalysisRoutes);
app.use('/api', floorPlansRoutes);
app.use('/api', floorPlanPersistenceRoutes);
app.use('/api', documentsRoutes);
app.use('/api', productionBlueprintRoutes);
app.use('/api', twilioRoutes);
app.use('/api', nylasEmailRoutes);
app.use('/api', teamRoutes);
app.use('/api', userRoutes);
app.use('/api', ragRoutes);
app.use('/api', elevationRoutes);
app.use('/api', vapiRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Routes registered: enhanced-detection, intelligent-analysis, floor-plans, documents, production-blueprint, twilio, nylas, team, user, rag, elevation, vapi`);
});