import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const router = express.Router();

// ============================================================================
// FLOOR PLAN VERSIONS
// ============================================================================

/**
 * GET /api/versions/floor-plans/:floorPlanId
 * Get all versions for a specific floor plan
 */
router.get('/floor-plans/:floorPlanId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { floorPlanId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error, count } = await supabase
      .from('floor_plans_versions')
      .select('*', { count: 'exact' })
      .eq('floor_plan_id', floorPlanId)
      .order('version_number', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      versions: data || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('Error fetching floor plan versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions', details: error.message });
  }
});

/**
 * GET /api/versions/floor-plans/:floorPlanId/:versionNumber
 * Get a specific version by version number
 */
router.get('/floor-plans/:floorPlanId/:versionNumber', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { floorPlanId, versionNumber } = req.params;

    const { data, error } = await supabase
      .from('floor_plans_versions')
      .select('*')
      .eq('floor_plan_id', floorPlanId)
      .eq('version_number', versionNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Version not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      version: data
    });

  } catch (error: any) {
    console.error('Error fetching floor plan version:', error);
    res.status(500).json({ error: 'Failed to fetch version', details: error.message });
  }
});

/**
 * POST /api/versions/floor-plans/:floorPlanId/save
 * Manually save a version with custom metadata
 */
router.post('/floor-plans/:floorPlanId/save', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { floorPlanId } = req.params;
    const { change_summary, changed_by, change_reason } = req.body;

    // Call the database function to create version
    const { data, error } = await supabase.rpc('create_floor_plan_version', {
      p_floor_plan_id: floorPlanId,
      p_change_summary: change_summary || null,
      p_changed_by: changed_by || null,
      p_change_reason: change_reason || null
    });

    if (error) throw error;

    // Fetch the created version
    const { data: version, error: fetchError } = await supabase
      .from('floor_plans_versions')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      version_id: data,
      version
    });

  } catch (error: any) {
    console.error('Error saving floor plan version:', error);
    res.status(500).json({ error: 'Failed to save version', details: error.message });
  }
});

/**
 * POST /api/versions/floor-plans/:floorPlanId/restore/:versionId
 * Restore a floor plan to a specific version
 */
router.post('/floor-plans/:floorPlanId/restore/:versionId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { versionId } = req.params;

    // Call the database function to restore version
    const { data, error } = await supabase.rpc('restore_floor_plan_version', {
      p_version_id: versionId
    });

    if (error) throw error;

    res.json({
      success: true,
      restored: data,
      message: 'Floor plan restored successfully'
    });

  } catch (error: any) {
    console.error('Error restoring floor plan version:', error);
    res.status(500).json({ error: 'Failed to restore version', details: error.message });
  }
});

/**
 * GET /api/versions/floor-plans/:floorPlanId/compare/:version1/:version2
 * Compare two versions of a floor plan
 */
router.get('/floor-plans/:floorPlanId/compare/:version1/:version2', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { floorPlanId, version1, version2 } = req.params;

    // Fetch both versions
    const { data, error } = await supabase
      .from('floor_plans_versions')
      .select('*')
      .eq('floor_plan_id', floorPlanId)
      .in('version_number', [version1, version2])
      .order('version_number', { ascending: true });

    if (error) throw error;

    if (!data || data.length !== 2) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    // Calculate differences
    const diff = calculateFloorPlanDiff(data[0], data[1]);

    res.json({
      success: true,
      version1: data[0],
      version2: data[1],
      differences: diff
    });

  } catch (error: any) {
    console.error('Error comparing versions:', error);
    res.status(500).json({ error: 'Failed to compare versions', details: error.message });
  }
});

// ============================================================================
// ROOM SELECTION VERSIONS
// ============================================================================

/**
 * GET /api/versions/selections/:selectionId
 * Get all versions for a specific room selection
 */
router.get('/selections/:selectionId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { selectionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error, count } = await supabase
      .from('room_selections_versions')
      .select('*', { count: 'exact' })
      .eq('room_selection_id', selectionId)
      .order('version_number', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      versions: data || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('Error fetching selection versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions', details: error.message });
  }
});

/**
 * POST /api/versions/selections/:selectionId/save
 * Manually save a room selection version
 */
router.post('/selections/:selectionId/save', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { selectionId } = req.params;
    const { change_summary, changed_by, change_reason } = req.body;

    // Call the database function to create version
    const { data, error } = await supabase.rpc('create_room_selection_version', {
      p_room_selection_id: selectionId,
      p_change_summary: change_summary || null,
      p_changed_by: changed_by || null,
      p_change_reason: change_reason || null
    });

    if (error) throw error;

    // Fetch the created version
    const { data: version, error: fetchError } = await supabase
      .from('room_selections_versions')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      version_id: data,
      version
    });

  } catch (error: any) {
    console.error('Error saving selection version:', error);
    res.status(500).json({ error: 'Failed to save version', details: error.message });
  }
});

/**
 * GET /api/versions/project/:projectId/all
 * Get all versions for all floor plans and selections in a project
 */
router.get('/project/:projectId/all', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;
    const { limit = 100 } = req.query;

    // Get floor plan versions for this project
    const { data: floorPlanVersions, error: fpError } = await supabase
      .from('floor_plans_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_created_at', { ascending: false })
      .limit(Number(limit));

    if (fpError) throw fpError;

    // Get room selection versions for this project
    const { data: selectionVersions, error: rsError } = await supabase
      .from('room_selections_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_created_at', { ascending: false })
      .limit(Number(limit));

    if (rsError) throw rsError;

    // Combine and sort by timestamp
    const allVersions = [
      ...(floorPlanVersions || []).map(v => ({ ...v, type: 'floor_plan' })),
      ...(selectionVersions || []).map(v => ({ ...v, type: 'room_selection' }))
    ].sort((a, b) =>
      new Date(b.version_created_at).getTime() - new Date(a.version_created_at).getTime()
    );

    res.json({
      success: true,
      versions: allVersions,
      floor_plan_count: floorPlanVersions?.length || 0,
      selection_count: selectionVersions?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching project versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions', details: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate differences between two floor plan versions
 */
function calculateFloorPlanDiff(version1: any, version2: any) {
  const diff: any = {
    walls: {
      added: 0,
      removed: 0,
      modified: 0
    },
    doors: {
      added: 0,
      removed: 0,
      modified: 0
    },
    windows: {
      added: 0,
      removed: 0,
      modified: 0
    },
    rooms: {
      added: 0,
      removed: 0,
      modified: 0
    },
    metadata_changed: false,
    dimensions_changed: false
  };

  // Compare walls
  const walls1 = version1.walls || [];
  const walls2 = version2.walls || [];
  diff.walls.added = Math.max(0, walls2.length - walls1.length);
  diff.walls.removed = Math.max(0, walls1.length - walls2.length);

  // Compare doors
  const doors1 = version1.doors || [];
  const doors2 = version2.doors || [];
  diff.doors.added = Math.max(0, doors2.length - doors1.length);
  diff.doors.removed = Math.max(0, doors1.length - doors2.length);

  // Compare windows
  const windows1 = version1.windows || [];
  const windows2 = version2.windows || [];
  diff.windows.added = Math.max(0, windows2.length - windows1.length);
  diff.windows.removed = Math.max(0, windows1.length - windows2.length);

  // Compare rooms
  const rooms1 = version1.rooms || [];
  const rooms2 = version2.rooms || [];
  diff.rooms.added = Math.max(0, rooms2.length - rooms1.length);
  diff.rooms.removed = Math.max(0, rooms1.length - rooms2.length);

  // Check metadata and dimensions
  diff.metadata_changed = JSON.stringify(version1.metadata) !== JSON.stringify(version2.metadata);
  diff.dimensions_changed = JSON.stringify(version1.dimensions) !== JSON.stringify(version2.dimensions);

  return diff;
}

export default router;
