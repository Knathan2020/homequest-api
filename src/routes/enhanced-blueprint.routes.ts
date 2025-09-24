import { Router } from 'express';
import { enhancedBlueprintController } from '../controllers/enhanced-blueprint.controller';

const router = Router();

/**
 * Enhanced Blueprint Processing Routes
 * Base path: /api/enhanced-blueprint
 */

// Process a complete blueprint through all 10 stages
router.post('/process', (req, res) => 
  enhancedBlueprintController.processBlueprint(req, res)
);

// Get current processing status
router.get('/status', (req, res) => 
  enhancedBlueprintController.getProcessingStatus(req, res)
);

// Process blueprint with selected stages only
router.post('/process-stages', (req, res) => 
  enhancedBlueprintController.processSelectedStages(req, res)
);

// Validate blueprint quality before processing
router.post('/validate', (req, res) => 
  enhancedBlueprintController.validateBlueprint(req, res)
);

// Get system capabilities and supported features
router.get('/capabilities', (req, res) => 
  enhancedBlueprintController.getCapabilities(req, res)
);

export default router;