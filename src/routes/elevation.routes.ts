/**
 * Elevation API Proxy Routes
 * Proxies requests to Google Elevation API to avoid CORS issues
 */

import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';

const router = Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyAJ1n2j8Cw-RbPEs3tCCksAG4cNO0wuSEI';

/**
 * Get elevation data for multiple locations
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { locations } = req.body;
    
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Locations array is required'
      });
    }

    // Format locations for Google API
    const locationString = locations.map(loc => `${loc.lat},${loc.lng}`).join('|');
    
    // Call Google Elevation API
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locationString}&key=${GOOGLE_MAPS_API_KEY}`;
    
    console.log(`📍 Fetching elevation for ${locations.length} points`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      console.log(`✅ Received elevation data for ${data.results.length} points`);
      res.json({
        success: true,
        data: data.results,
        status: data.status
      });
    } else {
      console.error('❌ Elevation API error:', data.status, data.error_message);
      res.status(400).json({
        success: false,
        error: data.error_message || data.status,
        status: data.status
      });
    }
  } catch (error: any) {
    console.error('Error proxying elevation request:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch elevation data'
    });
  }
});

/**
 * Get elevation along a path
 */
router.post('/path', async (req: Request, res: Response) => {
  try {
    const { path, samples = 100 } = req.body;
    
    if (!path || !Array.isArray(path) || path.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Path array with at least 2 points is required'
      });
    }

    // Format path for Google API
    const pathString = path.map(p => `${p.lat},${p.lng}`).join('|');
    
    // Call Google Elevation API
    const url = `https://maps.googleapis.com/maps/api/elevation/json?path=${pathString}&samples=${samples}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      res.json({
        success: true,
        data: data.results,
        status: data.status
      });
    } else {
      res.status(400).json({
        success: false,
        error: data.error_message || data.status,
        status: data.status
      });
    }
  } catch (error: any) {
    console.error('Error proxying elevation path request:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch elevation data'
    });
  }
});

export default router;