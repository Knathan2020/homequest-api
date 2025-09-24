import { Router } from 'express';
import claudeAIController from '../controllers/claude-ai.controller';

const router = Router();

// Claude AI Query endpoints
router.post('/query', claudeAIController.query.bind(claudeAIController));

// Image analysis endpoints
router.post(
  '/analyze-image',
  claudeAIController.getUploadMiddleware().single('image'),
  claudeAIController.analyzeImage.bind(claudeAIController)
);

// Blueprint processing
router.post(
  '/process-blueprint',
  claudeAIController.getUploadMiddleware().single('blueprint'),
  claudeAIController.processBlueprint.bind(claudeAIController)
);

// Knowledge management
router.post('/knowledge/add', claudeAIController.addKnowledge.bind(claudeAIController));
router.post(
  '/knowledge/construction/add',
  claudeAIController.addConstructionKnowledge.bind(claudeAIController)
);
router.get('/knowledge/search', claudeAIController.searchKnowledge.bind(claudeAIController));

// OCR extraction
router.post(
  '/extract-text',
  claudeAIController.getUploadMiddleware().single('document'),
  claudeAIController.extractText.bind(claudeAIController)
);

// Batch processing
router.post(
  '/batch-process',
  claudeAIController.getBatchUploadMiddleware(),
  claudeAIController.batchProcess.bind(claudeAIController)
);

export default router;