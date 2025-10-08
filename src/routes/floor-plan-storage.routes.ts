/**
 * Floor Plan Storage Routes
 * Endpoints for saving and retrieving floor plans with Supabase versioning
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn('⚠️ Supabase not configured - floor plan storage will not work');
}

/**
 * Save a floor plan (scoped to account/team)
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const {
      name,
      projectId,
      imageUrl,
      thumbnail,
      detectionResults,
      customElements,
      metadata,
      accountId
    } = req.body;

    if (!name && !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Name or Project ID is required'
      });
    }

    // Use accountId from request or default to 'default-team'
    const teamId = accountId || req.headers['x-account-id'] || 'default-team';
    const timestamp = new Date().toISOString();

    // Prepare data for database insert
    const floorPlanData = {
      project_id: projectId,
      user_id: teamId,
      image_url: imageUrl || '',
      walls: detectionResults?.walls || [],
      doors: detectionResults?.doors || [],
      windows: detectionResults?.windows || [],
      rooms: detectionResults?.rooms || [],
      dimensions: metadata?.dimensions || { width: 0, height: 0 },
      metadata: {
        ...metadata,
        name: name || 'Untitled Floor Plan',
        projectId: projectId,
        thumbnail: thumbnail,
        customElements: customElements,
        accountId: teamId,
        savedAt: timestamp
      }
    };

    // Insert into database (will auto-generate UUID)
    const { data, error } = await supabase
      .from('floor_plans')
      .insert(floorPlanData)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log(`💾 Saved floor plan: ${name || projectId} (${data.id}) - for account: ${teamId}`);

    res.json({
      success: true,
      id: data.id,
      message: 'Floor plan saved successfully and available to all users',
      data: {
        id: data.id,
        name: name || projectId,
        savedAt: timestamp
      }
    });
  } catch (error: any) {
    console.error('Error saving floor plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save floor plan'
    });
  }
});

/**
 * Get all saved floor plans (filtered by account/team and project)
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    // Get account ID and project ID from query params or headers
    const accountId = req.query.accountId || req.headers['x-account-id'] || 'default-team';
    const projectId = req.query.projectId as string;

    // Project ID is required for data isolation
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required for data isolation'
      });
    }

    // Query floor plans from database
    let query = supabase
      .from('floor_plans')
      .select('*')
      .eq('user_id', accountId)
      .order('created_at', { ascending: false });

    const { data: plans, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    // Filter by project and format response
    const floorPlans = (plans || [])
      .filter(plan => {
        // Match by projectId in metadata or by project_id field
        const metadataProjectId = plan.metadata?.projectId;
        const planProjectId = plan.project_id;
        return metadataProjectId === projectId || planProjectId === projectId;
      })
      .map(plan => {
        // Calculate room count from rooms or customElements
        let roomCount = plan.rooms?.length || 0;

        // If it's a selections-only save, count rooms from customElements
        if (plan.metadata?.customElements?.roomMappings) {
          const mappings = plan.metadata.customElements.roomMappings;
          if (Array.isArray(mappings)) {
            roomCount = mappings.length;
          } else if (typeof mappings === 'object') {
            roomCount = Object.keys(mappings).length;
          }
        }

        // Return summary for list display
        return {
          id: plan.id,
          name: plan.metadata?.name || plan.project_id,
          thumbnail: plan.metadata?.thumbnail,
          wallCount: plan.walls?.length || 0,
          doorCount: plan.doors?.length || 0,
          windowCount: plan.windows?.length || 0,
          roomCount: roomCount,
          savedAt: plan.created_at,
          accountId: plan.user_id,
          projectId: plan.metadata?.projectId || plan.project_id
        };
      });

    res.json({
      success: true,
      data: floorPlans,
      count: floorPlans.length
    });
  } catch (error: any) {
    console.error('Error loading floor plans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load floor plans'
    });
  }
});

/**
 * Get a specific floor plan by ID (with account check)
 */
router.get('/load/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { id } = req.params;
    const accountId = req.query.accountId || req.headers['x-account-id'] || 'default-team';

    // Load from database
    const { data: plan, error } = await supabase
      .from('floor_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Floor plan not found'
        });
      }
      throw error;
    }

    // Check if user has access to this floor plan
    if (plan.user_id && plan.user_id !== accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied - floor plan belongs to different account'
      });
    }

    // Convert database format back to frontend format
    const floorPlan = {
      id: plan.id,
      name: plan.metadata?.name || plan.project_id,
      projectId: plan.metadata?.projectId || plan.project_id,
      accountId: plan.user_id,
      imageUrl: plan.image_url,
      thumbnail: plan.metadata?.thumbnail,
      detectionResults: {
        walls: plan.walls || [],
        doors: plan.doors || [],
        windows: plan.windows || [],
        rooms: plan.rooms || [],
        stairs: [],
        elevators: [],
        annotations: []
      },
      customElements: plan.metadata?.customElements || {},
      metadata: {
        ...plan.metadata,
        dimensions: plan.dimensions
      },
      createdAt: plan.created_at,
      updatedAt: plan.updated_at
    };

    res.json({
      success: true,
      data: floorPlan
    });
  } catch (error: any) {
    console.error('Error loading floor plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load floor plan'
    });
  }
});

/**
 * Update an existing floor plan
 * This will automatically trigger version creation via database trigger
 */
router.put('/update/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { id } = req.params;
    const {
      projectId,
      imageUrl,
      thumbnail,
      detectionResults,
      customElements,
      metadata
    } = req.body;

    // Prepare update data
    const updateData: any = {};

    if (projectId) updateData.project_id = projectId;
    if (imageUrl) updateData.image_url = imageUrl;
    if (detectionResults) {
      if (detectionResults.walls) updateData.walls = detectionResults.walls;
      if (detectionResults.doors) updateData.doors = detectionResults.doors;
      if (detectionResults.windows) updateData.windows = detectionResults.windows;
      if (detectionResults.rooms) updateData.rooms = detectionResults.rooms;
    }

    // Update metadata
    const { data: existingPlan } = await supabase
      .from('floor_plans')
      .select('metadata')
      .eq('id', id)
      .single();

    updateData.metadata = {
      ...(existingPlan?.metadata || {}),
      ...metadata,
      thumbnail: thumbnail || existingPlan?.metadata?.thumbnail,
      customElements: customElements || existingPlan?.metadata?.customElements,
      updatedAt: new Date().toISOString()
    };

    // Update in database (will trigger versioning automatically)
    const { data: updatedPlan, error } = await supabase
      .from('floor_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Floor plan not found'
        });
      }
      throw error;
    }

    console.log(`📝 Updated floor plan: ${updatedPlan.project_id} (${id})`);

    res.json({
      success: true,
      message: 'Floor plan updated successfully (version saved automatically)',
      data: {
        id: id,
        name: updatedPlan.project_id,
        updatedAt: updatedPlan.updated_at
      }
    });
  } catch (error: any) {
    console.error('Error updating floor plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update floor plan'
    });
  }
});

/**
 * Delete a floor plan
 * This will automatically trigger version creation before deletion via database trigger
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { id } = req.params;

    // Delete from database (will trigger versioning automatically)
    const { error } = await supabase
      .from('floor_plans')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    console.log(`🗑️ Deleted floor plan: ${id}`);

    res.json({
      success: true,
      message: 'Floor plan deleted successfully (final version saved automatically)'
    });
  } catch (error: any) {
    console.error('Error deleting floor plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete floor plan'
    });
  }
});

export default router;
