// Simple stub routes to prevent 404 errors
import { Router } from 'express';

const router = Router();

// RAG Learning stubs
router.get('/rag-learning/stats', (req, res) => {
  res.json({
    totalSessions: 0,
    totalSamples: 0,
    averageAccuracy: 0,
    models: []
  });
});

router.post('/rag-learning/predict', (req, res) => {
  res.json({
    predictions: [],
    confidence: 0
  });
});

router.post('/rag-learning/session/start', (req, res) => {
  res.json({
    sessionId: 'session-' + Date.now(),
    status: 'started'
  });
});

// Vendor bidding stubs
router.get('/vendor-bidding/projects/:projectId/bids', (req, res) => {
  res.json({
    bids: [],
    projectId: req.params.projectId
  });
});

router.post('/vendor-bidding/bids', (req, res) => {
  res.json({
    success: true,
    bidId: 'bid-' + Date.now()
  });
});

// Floor plans upload stub
router.post('/floor-plans/upload-cad', (req, res) => {
  res.json({
    success: true,
    jobId: 'job-' + Date.now(),
    message: 'CAD file upload endpoint'
  });
});

export default router;