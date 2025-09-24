/**
 * Wall Editor Routes
 * Handles saving and loading custom wall modifications
 */

import { Router } from 'express';

const router = Router();

// In-memory storage for wall modifications
const wallModifications = new Map();

/**
 * Save wall modifications for a floor plan
 */
router.post('/save/:floorPlanId', (req, res) => {
  const { floorPlanId } = req.params;
  const { walls, deletedWalls, addedWalls } = req.body;
  
  wallModifications.set(floorPlanId, {
    walls,
    deletedWalls,
    addedWalls,
    modifiedAt: new Date(),
    modifiedBy: 'user'
  });
  
  res.json({
    success: true,
    message: 'Wall modifications saved',
    floorPlanId
  });
});

/**
 * Get wall modifications for a floor plan
 */
router.get('/load/:floorPlanId', (req, res) => {
  const { floorPlanId } = req.params;
  const modifications = wallModifications.get(floorPlanId);
  
  if (!modifications) {
    return res.json({
      success: true,
      modifications: null
    });
  }
  
  res.json({
    success: true,
    modifications
  });
});

/**
 * Export walls with 3D coordinates
 */
router.get('/export3d/:floorPlanId', (req, res) => {
  const { floorPlanId } = req.params;
  const modifications = wallModifications.get(floorPlanId);
  
  if (!modifications) {
    return res.status(404).json({
      error: 'No modifications found for this floor plan'
    });
  }
  
  // Convert 2D walls to 3D coordinates
  const walls3D = modifications.walls.map(wall => {
    const height = wall.type === 'exterior' ? 3.0 : 2.5; // meters
    
    return {
      id: wall.id,
      type: wall.type,
      vertices: [
        { x: wall.start.x, y: 0, z: wall.start.y },        // Bottom start
        { x: wall.end.x, y: 0, z: wall.end.y },            // Bottom end
        { x: wall.end.x, y: height, z: wall.end.y },       // Top end
        { x: wall.start.x, y: height, z: wall.start.y }    // Top start
      ],
      thickness: wall.thickness / 100, // Convert pixels to meters
      material: wall.type === 'exterior' ? 'concrete' : 'drywall',
      color: wall.type === 'exterior' ? '#808080' : '#F5F5DC'
    };
  });
  
  res.json({
    success: true,
    walls3D,
    metadata: {
      unit: 'meters',
      wallCount: walls3D.length,
      exportedAt: new Date()
    }
  });
});

export default router;