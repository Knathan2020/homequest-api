"use strict";
/**
 * Projects Routes with Supabase Integration
 * Handles project management with persistent database storage
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const router = express_1.default.Router();
// Initialize Supabase client with service role key for backend operations
const supabaseUrl = process.env.SUPABASE_URL || '';
// Use service role key to bypass RLS policies in backend
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
// Create Supabase client with error handling
const supabase = supabaseUrl && supabaseKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;
if (!process.env.SUPABASE_SERVICE_KEY) {
    console.warn('⚠️ SUPABASE_SERVICE_KEY not set - using ANON key which may cause RLS issues');
}
/**
 * Get all projects (filtered by team_id or user_id if provided)
 */
router.get('/projects', async (req, res) => {
    try {
        // Get team_id or user_id from query params or headers
        const teamId = req.query.team_id || req.headers['x-team-id'];
        const userId = req.query.user_id || req.headers['x-user-id'];
        console.log('📊 Fetching projects from database', { teamId, userId });
        // If Supabase is not configured, return mock data
        if (!supabase) {
            console.log('⚠️ Supabase not configured, using mock data');
            return res.json({
                success: true,
                data: [
                    {
                        id: 'proj-001',
                        project_name: 'Maple Street Residence',
                        address: '123 Maple St, Kennesaw, GA',
                        status: 'active',
                        progress: 35,
                        square_footage: 4850,
                        notes: 'Foundation complete, framing in progress',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    },
                    {
                        id: 'proj-002',
                        project_name: 'Oak Avenue Complex',
                        address: '456 Oak Ave, Marietta, GA',
                        status: 'planning',
                        progress: 10,
                        square_footage: 12000,
                        notes: 'Awaiting permits',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ]
            });
        }
        // Build query - for now just get all projects
        // Filtering by user breaks when auth fails
        let query = supabase.from('projects').select('*');
        // OPTIONAL filtering if explicitly provided
        if (teamId && teamId !== 'undefined') {
            query = query.eq('team_id', teamId);
            console.log('Filtering by team_id:', teamId);
        }
        else if (userId && userId !== 'undefined') {
            query = query.eq('user_id', userId);
            console.log('Filtering by user_id:', userId);
        }
        else {
            console.log('No filter applied - fetching all projects');
        }
        // Fetch from Supabase
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) {
            console.error('Supabase error:', error);
            // If table doesn't exist, create it
            if (error.code === '42P01') {
                console.log('📦 Projects table not found, creating...');
                // Create the table
                const { error: createError } = await supabase.rpc('exec_sql', {
                    query: `
            CREATE TABLE IF NOT EXISTS projects (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              project_name VARCHAR(255) NOT NULL,
              address TEXT,
              status VARCHAR(50) DEFAULT 'planning',
              progress INTEGER DEFAULT 0,
              square_footage INTEGER,
              notes TEXT,
              phases JSONB,
              team_id UUID,
              user_id UUID,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            -- Create index for faster queries
            CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
            CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
          `
                });
                if (createError) {
                    // If RPC doesn't work, return empty array
                    console.log('📋 Table creation pending, returning empty project list');
                    return res.json({
                        success: true,
                        data: [],
                        message: 'Projects table is being set up. Please refresh in a moment.'
                    });
                }
                // Return empty array for now
                return res.json({
                    success: true,
                    data: []
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data: data || []
        });
    }
    catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch projects'
        });
    }
});
/**
 * Get single project
 */
router.get('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not configured'
            });
        }
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Project not found'
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch project'
        });
    }
});
/**
 * Create new project
 */
router.post('/projects', async (req, res) => {
    try {
        const { project_name, address, status = 'planning', progress = 0, square_footage, notes, phases, team_id, user_id } = req.body;
        console.log('🏗️ Creating new project:', project_name);
        if (!supabase) {
            // Return mock response if Supabase not configured
            return res.json({
                success: true,
                message: 'Project created (mock mode)',
                data: {
                    id: 'proj-' + Date.now(),
                    project_name,
                    address,
                    status,
                    progress,
                    square_footage,
                    notes,
                    phases,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            });
        }
        // Insert into Supabase
        const { data, error } = await supabase
            .from('projects')
            .insert({
            project_name,
            address,
            status,
            progress,
            square_footage,
            notes,
            phases,
            team_id,
            user_id
        })
            .select()
            .single();
        if (error) {
            console.error('Supabase insert error:', error);
            // If table doesn't exist, try to create it first
            if (error.code === '42P01') {
                return res.status(503).json({
                    success: false,
                    error: 'Projects table not found. Please set up the database schema.',
                    setupRequired: true
                });
            }
            throw error;
        }
        res.json({
            success: true,
            message: 'Project created successfully',
            data
        });
    }
    catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create project'
        });
    }
});
/**
 * Update project
 */
router.put('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (!supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not configured'
            });
        }
        // Update in Supabase - don't use .single() to avoid row count error
        const { data, error } = await supabase
            .from('projects')
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select();
        if (error) {
            console.error('Update error:', error);
            throw error;
        }
        // Check if any rows were updated
        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        res.json({
            success: true,
            message: 'Project updated successfully',
            data: data[0]
        });
    }
    catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update project'
        });
    }
});
/**
 * PATCH project (for status updates like archiving)
 */
router.patch('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, data: updateData } = req.body;
        console.log('🔄🔄🔄 PATCH /projects/:id called [FORCED DEPLOY]', { id, action, updateData });
        if (!supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not configured'
            });
        }
        // Handle different actions
        if (action === 'update_status') {
            console.log(`📦 Updating project ${id} status to:`, updateData.status);
            const { data, error } = await supabase
                .from('projects')
                .update({
                status: updateData.status,
                updated_at: new Date().toISOString()
            })
                .eq('id', id)
                .select();
            if (error) {
                console.error('❌ Supabase update error:', error);
                console.error('Error details:', { code: error.code, message: error.message, details: error.details });
                return res.status(500).json({
                    success: false,
                    error: error.message || 'Database error updating project status'
                });
            }
            if (!data || data.length === 0) {
                console.warn(`⚠️ Project ${id} not found in database`);
                return res.status(404).json({
                    success: false,
                    error: 'Project not found'
                });
            }
            console.log(`✅ Project ${id} archived successfully`);
            return res.json({
                success: true,
                message: 'Project status updated successfully',
                data: data[0]
            });
        }
        // Default: update with provided data
        console.log(`📝 Default update for project ${id}:`, updateData);
        const { data, error } = await supabase
            .from('projects')
            .update({
            ...updateData,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .select();
        if (error) {
            console.error('❌ Supabase update error:', error);
            throw error;
        }
        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        res.json({
            success: true,
            message: 'Project updated successfully',
            data: data[0]
        });
    }
    catch (error) {
        console.error('❌ Error patching project:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update project'
        });
    }
});
/**
 * Delete project
 */
router.delete('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!supabase) {
            return res.status(503).json({
                success: false,
                error: 'Database not configured'
            });
        }
        // First, check if the project exists
        const { data: project, error: checkError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', id)
            .single();
        if (checkError || !project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Delete related data first to avoid foreign key constraints
        // This is a temporary workaround - ideally should be handled by CASCADE in DB
        // Delete project phases
        await supabase
            .from('project_phases')
            .delete()
            .eq('project_id', id);
        // Delete project sections
        await supabase
            .from('project_sections')
            .delete()
            .eq('project_id', id);
        // Delete accepted bids
        await supabase
            .from('accepted_bids')
            .delete()
            .eq('project_id', id);
        // Delete vendor bids
        await supabase
            .from('vendor_bids')
            .delete()
            .eq('project_id', id);
        // Finally delete the project itself
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);
        if (error) {
            throw error;
        }
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete project'
        });
    }
});
/**
 * Get projects for a specific team
 */
router.get('/projects/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!supabase) {
            return res.json({
                success: true,
                data: []
            });
        }
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({
            success: true,
            data: data || []
        });
    }
    catch (error) {
        console.error('Error fetching team projects:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch team projects'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projects-supabase.routes.js.map