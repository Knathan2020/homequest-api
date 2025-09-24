/**
 * Floor Plan Storage Routes
 * Endpoints for saving and retrieving floor plans for all users
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// In-memory storage for demo (in production, use database)
const globalFloorPlans = new Map();

// Storage directory for floor plan data
const STORAGE_DIR = path.join(process.cwd(), 'data', 'saved-floor-plans');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  console.log('📁 Created floor plan storage directory:', STORAGE_DIR);
}

/**
 * Save a floor plan (scoped to account/team)
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { 
      projectId, 
      imageUrl, 
      thumbnail, 
      detectionResults, 
      customElements, 
      metadata,
      accountId 
    } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID (name) is required'
      });
    }

    // Use accountId from request or default to 'default-team'
    const teamId = accountId || req.headers['x-account-id'] || 'default-team';

    // Generate unique ID for this floor plan
    const planId = uuidv4();
    const timestamp = new Date().toISOString();

    // Create floor plan object with team/account scope
    const floorPlan = {
      id: planId,
      projectId,
      accountId: teamId, // Add account/team ID
      imageUrl,
      thumbnail,
      detectionResults,
      customElements,
      metadata: {
        ...metadata,
        savedAt: timestamp,
        accountId: teamId // Include in metadata too
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Save to file system (for persistence across restarts)
    const filePath = path.join(STORAGE_DIR, `${planId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(floorPlan, null, 2));

    // Also keep in memory for fast access
    globalFloorPlans.set(planId, floorPlan);

    console.log(`💾 Saved floor plan: ${projectId} (${planId}) - for account: ${teamId}`);

    res.json({
      success: true,
      id: planId,
      message: 'Floor plan saved successfully and available to all users',
      data: {
        id: planId,
        name: projectId,
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
    
    // Load all floor plans from storage
    const files = fs.readdirSync(STORAGE_DIR);
    const floorPlans = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(STORAGE_DIR, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const plan = JSON.parse(data);
          
          // Only include plans for this account/team AND this specific project
          const hasAccountAccess = !plan.accountId || plan.accountId === accountId;
          const belongsToProject = plan.projectId === projectId;
          
          if (hasAccountAccess && belongsToProject) {
            // Return summary for list display
            floorPlans.push({
              id: plan.id,
              name: plan.projectId,
              thumbnail: plan.thumbnail, // Send full thumbnail
              wallCount: plan.detectionResults?.walls?.length || 0,
              doorCount: plan.detectionResults?.doors?.length || 0,
              windowCount: plan.detectionResults?.windows?.length || 0,
              savedAt: plan.createdAt,
              accountId: plan.accountId || 'default-team',
              projectId: plan.projectId
            });
          }
        } catch (e) {
          console.error(`Error reading floor plan ${file}:`, e);
        }
      }
    }

    // Sort by most recent first
    floorPlans.sort((a, b) => 
      new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );

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
    const { id } = req.params;
    const accountId = req.query.accountId || req.headers['x-account-id'] || 'default-team';

    // Try memory first
    let floorPlan = globalFloorPlans.get(id);

    // If not in memory, load from file
    if (!floorPlan) {
      const filePath = path.join(STORAGE_DIR, `${id}.json`);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        floorPlan = JSON.parse(data);
        // Cache in memory
        globalFloorPlans.set(id, floorPlan);
      }
    }

    if (!floorPlan) {
      return res.status(404).json({
        success: false,
        error: 'Floor plan not found'
      });
    }

    // Check if user has access to this floor plan
    // Legacy plans without accountId are accessible to everyone
    if (floorPlan.accountId && floorPlan.accountId !== accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied - floor plan belongs to different account'
      });
    }

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
 */
router.put('/update/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      projectId, 
      imageUrl, 
      thumbnail, 
      detectionResults, 
      customElements, 
      metadata 
    } = req.body;

    // Load existing floor plan
    const filePath = path.join(STORAGE_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Floor plan not found'
      });
    }

    // Read existing plan
    const existingData = fs.readFileSync(filePath, 'utf-8');
    const existingPlan = JSON.parse(existingData);

    // Update floor plan object
    const updatedPlan = {
      ...existingPlan,
      projectId: projectId || existingPlan.projectId,
      imageUrl: imageUrl || existingPlan.imageUrl,
      thumbnail: thumbnail || existingPlan.thumbnail,
      detectionResults: detectionResults || existingPlan.detectionResults,
      customElements: customElements || existingPlan.customElements,
      metadata: {
        ...existingPlan.metadata,
        ...metadata,
        updatedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };

    // Save updated plan to file system
    fs.writeFileSync(filePath, JSON.stringify(updatedPlan, null, 2));

    // Update in memory
    globalFloorPlans.set(id, updatedPlan);

    console.log(`📝 Updated floor plan: ${updatedPlan.projectId} (${id})`);

    res.json({
      success: true,
      message: 'Floor plan updated successfully',
      data: {
        id: id,
        name: updatedPlan.projectId,
        updatedAt: updatedPlan.updatedAt
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
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Remove from memory
    globalFloorPlans.delete(id);

    // Remove from file system
    const filePath = path.join(STORAGE_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`🗑️ Deleted floor plan: ${id}`);

    res.json({
      success: true,
      message: 'Floor plan deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting floor plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete floor plan'
    });
  }
});

// Load all floor plans into memory on startup
const loadFloorPlansOnStartup = () => {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    let count = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(STORAGE_DIR, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const plan = JSON.parse(data);
          globalFloorPlans.set(plan.id, plan);
          count++;
        } catch (e) {
          console.error(`Error loading floor plan ${file}:`, e);
        }
      }
    }
    
    console.log(`📥 Loaded ${count} saved floor plans into memory`);
  } catch (error) {
    console.error('Error loading floor plans on startup:', error);
  }
};

// Load existing floor plans on startup
loadFloorPlansOnStartup();

export default router;