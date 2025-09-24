import { Router } from 'express';
import { productionBlueprintController } from '../controllers/production-blueprint.controller';

const router = Router();

/**
 * Production Blueprint Processing Routes
 * Base path: /api/blueprint
 */

// Main processing endpoint - Claude Vision + OpenCV
router.post('/process', (req, res) => 
  productionBlueprintController.processBlueprint(req, res)
);

// Get job status
router.get('/status/:jobId', (req, res) => 
  productionBlueprintController.getJobStatus(req, res)
);

// Quick validation without full processing
router.post('/validate', (req, res) => 
  productionBlueprintController.validateBlueprint(req, res)
);

// Get system capabilities and features
router.get('/capabilities', (req, res) => 
  productionBlueprintController.getCapabilities(req, res)
);

// Get demo/example response
router.get('/demo', (req, res) => 
  productionBlueprintController.getDemo(req, res)
);

export default router;