// src/routes/gis-proxy.ts
import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// Proxy endpoint for GIS requests that have CORS issues
router.get('/gis-proxy', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        error: 'URL parameter is required',
        success: false 
      });
    }

    // Decode the URL
    const targetUrl = decodeURIComponent(url);
    
    // Validate it's a legitimate GIS URL (whitelist approach)
    const allowedDomains = [
      'fultoncountyga.gov',
      'arcgis.com',
      'cobbcounty.org',
      'gwinnettcounty.com',
      'cherokeega.com',
      'dekalbcountyga.gov',
      'services.arcgis.com'
    ];
    
    const isAllowed = allowedDomains.some(domain => targetUrl.includes(domain));
    if (!isAllowed) {
      return res.status(400).json({ 
        error: 'Invalid URL - must be a recognized GIS service',
        success: false 
      });
    }

    console.log('🔐 Proxying GIS request:', targetUrl);

    // Make the request from server-side (no CORS issues)
    const response = await axios.get(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HomeQuest-API/1.0'
      },
      timeout: 10000
    });

    const data = response.data;

    // Forward the response
    res.json(data);

  } catch (error) {
    console.error('GIS Proxy error:', error);
    res.status(500).json({
      error: 'Failed to fetch GIS data',
      message: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

// Test endpoint specifically for Fulton County
router.get('/test-fulton-gis', async (req: Request, res: Response) => {
  try {
    // Try multiple Fulton County endpoints to find a working one
    const endpoints = [
      'https://gis.fultoncountyga.gov/RESTPublic/rest/services/GreenSpace/PublicParcels/MapServer/0/query?where=1=1&outFields=*&returnGeometry=false&f=json&resultRecordCount=1',
      'https://services.arcgis.com/bkrWlSKcjUDFDtgw/arcgis/rest/services/Property_Information_with_Tax_Districts/FeatureServer/0/query?where=1=1&outFields=*&returnGeometry=false&f=json&resultRecordCount=1'
    ];
    
    for (const testUrl of endpoints) {
      try {
        console.log('Testing endpoint:', testUrl);
        const response = await axios.get(testUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'HomeQuest-API/1.0'
          },
          timeout: 10000
        });

        const data = response.data;
          
        if (data.features && data.features.length > 0) {
          const fields = Object.keys(data.features[0].attributes);
          
          return res.json({
            success: true,
            endpoint: testUrl,
            message: 'Found working Fulton County endpoint',
            availableFields: fields,
            sampleRecord: data.features[0].attributes
          });
        }
      } catch (err) {
        console.error('Endpoint failed:', testUrl, err);
        continue;
      }
    }
    
    res.status(404).json({
      success: false,
      error: 'No working Fulton County endpoints found',
      testedEndpoints: endpoints
    });

  } catch (error) {
    console.error('Test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test Fulton County GIS',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;