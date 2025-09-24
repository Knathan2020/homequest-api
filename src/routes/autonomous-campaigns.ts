/**
 * Autonomous Campaign API Routes
 */

import express from 'express';
import autonomousCallingService from '../services/autonomous-calling.service';

const router = express.Router();

/**
 * Create a new autonomous campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const campaign = await autonomousCallingService.createCampaign(req.body);
    
    res.json({
      success: true,
      campaign,
      message: 'Autonomous campaign created and started!'
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create autonomous campaign'
    });
  }
});

/**
 * Get campaign status and analytics
 */
router.get('/campaigns/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await autonomousCallingService.getCampaignAnalytics(campaignId);
    
    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign'
    });
  }
});

/**
 * Pause a campaign
 */
router.post('/campaigns/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;
    await autonomousCallingService.pauseCampaign(campaignId);
    
    res.json({
      success: true,
      message: 'Campaign paused'
    });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause campaign'
    });
  }
});

/**
 * Resume a campaign
 */
router.post('/campaigns/:campaignId/resume', async (req, res) => {
  try {
    const { campaignId } = req.params;
    await autonomousCallingService.resumeCampaign(campaignId);
    
    res.json({
      success: true,
      message: 'Campaign resumed'
    });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume campaign'
    });
  }
});

/**
 * Initialize autonomous system (called on server start)
 */
router.post('/initialize', async (req, res) => {
  try {
    await autonomousCallingService.initialize();
    
    res.json({
      success: true,
      message: 'Autonomous calling system initialized'
    });
  } catch (error) {
    console.error('Error initializing autonomous system:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize autonomous system'
    });
  }
});

export default router;