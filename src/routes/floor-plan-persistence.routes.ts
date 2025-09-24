/**
 * Floor Plan Persistence Routes
 * Handles saving and loading of floor plan detection data
 */

import { Router, Request, Response } from 'express';
import persistenceService from '../services/floor-plan-persistence.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

/**
 * Save floor plan detection results
 * POST /api/floor-plans/save
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { projectId, imageUrl, detectionResults, userId } = req.body;

    if (!projectId || !imageUrl || !detectionResults) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, imageUrl, detectionResults'
      });
    }

    const result = await persistenceService.autoSaveDetection(
      projectId,
      imageUrl,
      detectionResults,
      userId
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        id: result.id,
        message: 'Floor plan saved successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to save floor plan'
      });
    }
  } catch (error) {
    console.error('Error saving floor plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Load floor plan by ID
 * GET /api/floor-plans/load/:id
 */
router.get('/load/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const floorPlan = await persistenceService.loadFloorPlan(id);

    if (floorPlan) {
      return res.status(200).json({
        success: true,
        data: floorPlan
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Floor plan not found'
      });
    }
  } catch (error) {
    console.error('Error loading floor plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Load all floor plans for a project
 * GET /api/floor-plans/project/:projectId
 */
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const floorPlans = await persistenceService.loadProjectFloorPlans(projectId);

    return res.status(200).json({
      success: true,
      data: floorPlans,
      count: floorPlans.length
    });
  } catch (error) {
    console.error('Error loading project floor plans:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Update floor plan with edits
 * PUT /api/floor-plans/update/:id
 */
router.put('/update/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { updates, userId } = req.body;

    if (!updates) {
      return res.status(400).json({
        success: false,
        error: 'Missing updates in request body'
      });
    }

    const result = await persistenceService.updateFloorPlan(id, updates, userId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Floor plan updated successfully'
      });
    } else {
      return res.status(result.error === 'Floor plan not found' ? 404 : 500).json({
        success: false,
        error: result.error || 'Failed to update floor plan'
      });
    }
  } catch (error) {
    console.error('Error updating floor plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Delete floor plan
 * DELETE /api/floor-plans/delete/:id
 */
router.delete('/delete/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await persistenceService.deleteFloorPlan(id);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Floor plan deleted successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to delete floor plan'
      });
    }
  } catch (error) {
    console.error('Error deleting floor plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Auto-save endpoint for immediate saving after detection
 * POST /api/floor-plans/auto-save
 */
router.post('/auto-save', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // This endpoint is called automatically after detection completes
    const result = await persistenceService.saveFloorPlan({
      project_id: data.project_id || 'default',
      user_id: data.user_id,
      image_url: data.image_url,
      imageData: data.imageData, // Include base64 image data for Supabase Storage
      walls: data.walls || [],
      doors: data.doors || [],
      windows: data.windows || [],
      rooms: data.rooms || [],
      dimensions: data.dimensions || { width: 0, height: 0 },
      metadata: {
        detected_at: new Date().toISOString(),
        version: 1,
        detection_method: data.detection_method || 'auto'
      }
    });

    if (result.success) {
      console.log('🔄 Auto-saved floor plan:', result.id);
      return res.status(200).json({
        success: true,
        id: result.id,
        message: 'Floor plan auto-saved successfully'
      });
    } else {
      throw new Error(result.error || 'Auto-save failed');
    }
  } catch (error) {
    console.error('Auto-save error:', error);
    return res.status(500).json({
      success: false,
      error: 'Auto-save failed'
    });
  }
});

export default router;