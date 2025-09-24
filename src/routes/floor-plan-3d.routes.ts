// homequest-api/src/routes/floor-plan-3d.routes.ts
/**
 * API Routes for 2D to 3D Floor Plan Conversion
 */

import { Router, Request, Response } from 'express';
import { floorPlan3DService } from '../services/floor-plan-3d.service';
import { modelExporter } from '../services/export/model-export.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { body, param, query } from 'express-validator';

const router = Router();

/**
 * POST /api/floor-plans/:id/convert-3d
 * Convert 2D floor plan to 3D model
 */
router.post(
  '/floor-plans/:id/convert-3d',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Invalid floor plan ID'),
    body('cvData').isObject().withMessage('CV data is required'),
    body('options.buildingType').optional().isIn(['residential', 'commercial']),
    body('options.luxuryLevel').optional().isIn(['standard', 'premium', 'luxury']),
    body('options.style').optional().isIn(['modern', 'traditional', 'rustic']),
    body('options.generateFurniture').optional().isBoolean(),
    body('options.exportFormats').optional().isArray()
  ],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const floorPlanId = req.params.id;
      const { cvData, options } = req.body;
      const userId = (req as any).user?.id;

      console.log(`🔄 Converting floor plan ${floorPlanId} to 3D`);

      const model3D = await floorPlan3DService.convertTo3D(
        floorPlanId,
        cvData,
        options
      );

      res.json({
        success: true,
        data: model3D,
        message: '3D model generated successfully'
      });

    } catch (error) {
      console.error('3D conversion error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to convert to 3D'
      });
    }
  }
);

/**
 * GET /api/3d-models/:id
 * Get 3D model by ID
 */
router.get(
  '/3d-models/:id',
  authMiddleware,
  [param('id').isUUID().withMessage('Invalid model ID')],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      
      // Get model from database
      const model = await floorPlan3DService.getModel(modelId);
      
      if (!model) {
        return res.status(404).json({
          success: false,
          error: 'Model not found'
        });
      }

      res.json({
        success: true,
        data: model
      });

    } catch (error) {
      console.error('Get model error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get model'
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/3d-models
 * Get all 3D models for a project
 */
router.get(
  '/projects/:projectId/3d-models',
  authMiddleware,
  [param('projectId').isUUID().withMessage('Invalid project ID')],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      
      const models = await floorPlan3DService.getProjectModels(projectId);

      res.json({
        success: true,
        data: models,
        total: models.length
      });

    } catch (error) {
      console.error('Get project models error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get models'
      });
    }
  }
);

/**
 * POST /api/3d-models/:id/export
 * Export 3D model to different formats
 */
router.post(
  '/3d-models/:id/export',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Invalid model ID'),
    body('format').isIn(['gltf', 'glb', 'obj', 'ifc', 'dxf', 'fbx']).withMessage('Invalid format'),
    body('options').optional().isObject()
  ],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      const { format, options } = req.body;

      console.log(`📦 Exporting model ${modelId} as ${format}`);

      // Get model data
      const model = await floorPlan3DService.getModel(modelId);
      
      if (!model) {
        return res.status(404).json({
          success: false,
          error: 'Model not found'
        });
      }

      // Export using the ModelExportService
      const exportResult = await modelExporter.exportModel(
        model,
        {
          format,
          ...options
        }
      );

      if (exportResult.success) {
        // Return file for download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
        res.send(exportResult.data);
      } else {
        res.status(500).json({
          success: false,
          error: 'Export failed'
        });
      }

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to export model'
      });
    }
  }
);

/**
 * GET /api/3d-models/:id/status
 * Get processing status for a model
 */
router.get(
  '/3d-models/:id/status',
  authMiddleware,
  [param('id').isUUID().withMessage('Invalid model ID')],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      
      const status = floorPlan3DService.getProcessingStatus(modelId);

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Get status error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get status'
      });
    }
  }
);

/**
 * POST /api/3d-models/:id/update-materials
 * Update materials for a 3D model
 */
router.post(
  '/3d-models/:id/update-materials',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Invalid model ID'),
    body('materials').isObject().withMessage('Materials object required')
  ],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      const { materials } = req.body;

      const updatedModel = await floorPlan3DService.updateMaterials(
        modelId,
        materials
      );

      res.json({
        success: true,
        data: updatedModel,
        message: 'Materials updated successfully'
      });

    } catch (error) {
      console.error('Update materials error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update materials'
      });
    }
  }
);

/**
 * POST /api/3d-models/:id/add-furniture
 * Add furniture to a 3D model
 */
router.post(
  '/3d-models/:id/add-furniture',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Invalid model ID'),
    body('roomId').isUUID().withMessage('Room ID required'),
    body('furniture').isArray().withMessage('Furniture array required')
  ],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      const { roomId, furniture } = req.body;

      const updatedModel = await floorPlan3DService.addFurniture(
        modelId,
        roomId,
        furniture
      );

      res.json({
        success: true,
        data: updatedModel,
        message: 'Furniture added successfully'
      });

    } catch (error) {
      console.error('Add furniture error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add furniture'
      });
    }
  }
);

/**
 * POST /api/3d-models/:id/update-heights
 * Update room heights in a 3D model
 */
router.post(
  '/3d-models/:id/update-heights',
  authMiddleware,
  [
    param('id').isUUID().withMessage('Invalid model ID'),
    body('heights').isObject().withMessage('Heights object required')
  ],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      const { heights } = req.body;

      const updatedModel = await floorPlan3DService.updateHeights(
        modelId,
        heights
      );

      res.json({
        success: true,
        data: updatedModel,
        message: 'Heights updated successfully'
      });

    } catch (error) {
      console.error('Update heights error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update heights'
      });
    }
  }
);

/**
 * DELETE /api/3d-models/:id
 * Delete a 3D model
 */
router.delete(
  '/3d-models/:id',
  authMiddleware,
  [param('id').isUUID().withMessage('Invalid model ID')],
  validationMiddleware,
  async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id;
      
      await floorPlan3DService.deleteModel(modelId);

      res.json({
        success: true,
        message: 'Model deleted successfully'
      });

    } catch (error) {
      console.error('Delete model error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete model'
      });
    }
  }
);

/**
 * WebSocket endpoint for real-time 3D processing updates
 */
export const setup3DWebSocket = (io: any) => {
  io.on('connection', (socket: any) => {
    console.log('Client connected for 3D updates');

    socket.on('subscribe-model', (modelId: string) => {
      socket.join(`model-${modelId}`);
      console.log(`Client subscribed to model ${modelId}`);
    });

    socket.on('unsubscribe-model', (modelId: string) => {
      socket.leave(`model-${modelId}`);
      console.log(`Client unsubscribed from model ${modelId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected from 3D updates');
    });
  });
};

export default router;