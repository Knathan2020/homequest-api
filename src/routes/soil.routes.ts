/**
 * Soil Data Routes
 * Handles USDA Soil Data Access API integration for septic suitability analysis
 */

import express, { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const USDA_SDA_ENDPOINT = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';
const USDA_WFS_ENDPOINT = 'https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs';

/**
 * GET /api/soil/zones
 * Fetch soil zones for a property
 * Query params: minLat, minLng, maxLat, maxLng
 */
router.get('/zones', async (req: Request, res: Response) => {
  try {
    const { minLat, minLng, maxLat, maxLng } = req.query;

    if (!minLat || !minLng || !maxLat || !maxLng) {
      return res.status(400).json({
        error: 'Missing required parameters: minLat, minLng, maxLat, maxLng'
      });
    }

    console.log(`Fetching soil zones for bbox: ${minLng},${minLat},${maxLng},${maxLat}`);

    // Use center point to get dominant soil type
    // More reliable than WFS which has strict format requirements
    const centerLat = (parseFloat(minLat as string) + parseFloat(maxLat as string)) / 2;
    const centerLng = (parseFloat(minLng as string) + parseFloat(maxLng as string)) / 2;

    console.log(`Using center point: ${centerLat}, ${centerLng}`);

    console.log('📍 Coordinates received:', { minLat, minLng, maxLat, maxLng });
    console.log('📍 Center point:', { lat: centerLat, lng: centerLng });

    const query = `
      SELECT DISTINCT
        mu.mukey,
        mu.muname,
        mu.musym
      FROM mapunit mu
      WHERE mu.mukey IN (
        SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${centerLng} ${centerLat})')
      )
    `;

    const formData = new URLSearchParams({
      FORMAT: 'JSON+COLUMNNAME',
      QUERY: query
    });

    const response = await fetch(USDA_SDA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.statusText}`);
    }

    const data: any = await response.json();

    console.log('USDA API Response:', JSON.stringify(data, null, 2));

    if (!data.Table || data.Table.length < 2) {
      console.warn('⚠️ No soil map units found in USDA response');
      console.warn('Response structure:', data);
      return res.json({ zones: [] });
    }

    // Parse map units
    const columns = data.Table[0];
    const mukeyIndex = columns.indexOf('mukey');
    const munameIndex = columns.indexOf('muname');
    const musymIndex = columns.indexOf('musym');

    console.log(`✅ Found ${data.Table.length - 1} map units`);

    const zones = [];

    // Process each map unit found
    for (let i = 1; i < data.Table.length; i++) {
      const row = data.Table[i];
      console.log(`Processing map unit ${i}: mukey=${row[mukeyIndex]}`);
      const mukey = row[mukeyIndex];
      const soilData = await getSoilProperties(mukey);

      if (soilData) {
        // Use bounding box as a simple polygon
        // Note: For accurate boundaries, would need USDA WFS spatial query
        const geometry = {
          type: 'Polygon',
          coordinates: [[
            [parseFloat(minLng as string), parseFloat(minLat as string)],
            [parseFloat(maxLng as string), parseFloat(minLat as string)],
            [parseFloat(maxLng as string), parseFloat(maxLat as string)],
            [parseFloat(minLng as string), parseFloat(maxLat as string)],
            [parseFloat(minLng as string), parseFloat(minLat as string)]
          ]]
        };

        // Calculate approximate area
        const latDiff = parseFloat(maxLat as string) - parseFloat(minLat as string);
        const lngDiff = parseFloat(maxLng as string) - parseFloat(minLng as string);
        const area_sqft = Math.abs(latDiff * lngDiff) * 364000 * 364000; // Very rough approximation
        const area_acres = area_sqft / 43560;

        zones.push({
          id: `zone-${mukey}`,
          name: `${soilData.muname}${soilData.slope_r ? ` ${soilData.slope_r}%` : ''}`,
          mukey,
          musym: row[musymIndex],
          geometry,
          soilData,
          area_sqft,
          area_acres,
          septic_suitable: soilData.septic_suitability === 'A' || soilData.septic_suitability === 'B',
          color: getSuitabilityColor(soilData.septic_suitability || 'D'),
          opacity: 0.4
        });
      }
    }

    console.log(`Found ${zones.length} soil zones`);
    res.json({ zones });

  } catch (error) {
    console.error('Error fetching soil zones:', error);
    res.status(500).json({
      error: 'Failed to fetch soil zones',
      message: error.message
    });
  }
});

/**
 * GET /api/soil/point
 * Fetch soil data for a single point
 * Query params: lat, lng
 */
router.get('/point', async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Missing required parameters: lat, lng'
      });
    }

    console.log(`Fetching soil data for point: ${lat}, ${lng}`);

    const query = `
      SELECT TOP 1
        mu.mukey,
        mu.muname,
        mu.musym,
        c.compname,
        c.comppct_r,
        c.drainagecl,
        c.hydricrating
      FROM mapunit mu
      INNER JOIN component c ON mu.mukey = c.mukey
      WHERE mu.mukey IN (
        SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})')
      )
      AND c.majcompflag = 'Yes'
      ORDER BY c.comppct_r DESC
    `;

    const formData = new URLSearchParams({
      FORMAT: 'JSON+COLUMNNAME',
      QUERY: query
    });

    const response = await fetch(USDA_SDA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.statusText}`);
    }

    const data = await response.json();
    const soilData = parseSoilData(data);

    res.json(soilData);

  } catch (error) {
    console.error('Error fetching soil data:', error);
    res.status(500).json({
      error: 'Failed to fetch soil data',
      message: error.message
    });
  }
});

/**
 * POST /api/soil/analyze
 * Analyze soil for septic suitability
 * Body: { propertyBounds: [{lat, lng}, ...], propertyCenter: {lat, lng} }
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { propertyBounds, propertyCenter } = req.body;

    if (!propertyBounds || !propertyCenter) {
      return res.status(400).json({
        error: 'Missing required parameters: propertyBounds, propertyCenter'
      });
    }

    // Use center point to get soil data
    const query = `
      SELECT DISTINCT
        mu.mukey,
        mu.muname,
        mu.musym
      FROM mapunit mu
      WHERE mu.mukey IN (
        SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${propertyCenter.lng} ${propertyCenter.lat})')
      )
    `;

    const formData = new URLSearchParams({
      FORMAT: 'JSON+COLUMNNAME',
      QUERY: query
    });

    const response = await fetch(USDA_SDA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.statusText}`);
    }

    const data: any = await response.json();

    const zones = [];

    if (data.Table && data.Table.length >= 2) {
      const columns = data.Table[0];
      const mukeyIndex = columns.indexOf('mukey');
      const musymIndex = columns.indexOf('musym');

      // Use actual property boundaries instead of bounding box
      const propertyCoordinates = propertyBounds.map((p: any) => [p.lng, p.lat]);
      // Close the polygon
      propertyCoordinates.push(propertyCoordinates[0]);

      // Calculate area
      const lats = propertyBounds.map((p: any) => p.lat);
      const lngs = propertyBounds.map((p: any) => p.lng);
      const latDiff = Math.max(...lats) - Math.min(...lats);
      const lngDiff = Math.max(...lngs) - Math.min(...lngs);
      const area_sqft = Math.abs(latDiff * lngDiff) * 364000 * 364000; // Rough approximation
      const area_acres = area_sqft / 43560;

      for (let i = 1; i < data.Table.length; i++) {
        const row = data.Table[i];
        const mukey = row[mukeyIndex];
        const soilData = await getSoilProperties(mukey);

        if (soilData) {
          // Use actual property boundary shape
          const geometry = {
            type: 'Polygon',
            coordinates: [propertyCoordinates]
          };

          zones.push({
            id: `zone-${mukey}`,
            name: `${soilData.muname}${soilData.slope_r ? ` ${soilData.slope_r}%` : ''}`,
            mukey,
            musym: row[musymIndex],
            geometry,
            soilData,
            area_sqft,
            area_acres,
            septic_suitable: soilData.septic_suitability === 'A' || soilData.septic_suitability === 'B',
            color: getSuitabilityColor(soilData.septic_suitability || 'D')
          });
        }
      }
    }

    // Find primary soil type (most common)
    const primaryZone = zones.length > 0 ? zones[0] : null;

    // Generate septic recommendations
    const suitableZones = zones.filter(z => z.septic_suitable);
    const septicRecommendation = {
      suitable: suitableZones.length > 0,
      recommended_zones: suitableZones.map(z => z.id),
      recommended_location: propertyCenter,
      recommended_depth: primaryZone ? getRecommendedDepth(primaryZone.soilData) : 'N/A',
      drainage_requirements: primaryZone ? getDrainageRequirements(primaryZone.soilData) : [],
      warnings: primaryZone ? getWarnings(primaryZone.soilData) : [],
      estimated_cost: primaryZone ? estimateSepticCost(primaryZone.soilData) : 25000
    };

    const result = {
      zones,
      primary_soil_type: primaryZone ? primaryZone.soilData.muname : 'Unknown',
      overall_suitability: primaryZone ? getOverallSuitability(primaryZone.soilData.septic_suitability) : 'Poor',
      septic_recommendation: septicRecommendation,
      analysis_date: new Date().toISOString()
    };

    res.json(result);

  } catch (error) {
    console.error('Error analyzing soil:', error);
    res.status(500).json({
      error: 'Failed to analyze soil',
      message: error.message
    });
  }
});

/**
 * Helper: Get soil properties for a map unit key
 */
async function getSoilProperties(mukey: string): Promise<any> {
  try {
    const query = `
      SELECT TOP 1
        mu.mukey,
        mu.muname,
        mu.musym,
        c.compname,
        c.comppct_r,
        c.drainagecl,
        c.hydricrating
      FROM mapunit mu
      INNER JOIN component c ON mu.mukey = c.mukey
      WHERE mu.mukey = '${mukey}'
      AND c.majcompflag = 'Yes'
      ORDER BY c.comppct_r DESC
    `;

    const formData = new URLSearchParams({
      FORMAT: 'JSON+COLUMNNAME',
      QUERY: query
    });

    const response = await fetch(USDA_SDA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return parseSoilData(data);

  } catch (error) {
    console.error(`Error getting soil properties for ${mukey}:`, error);
    return null;
  }
}

/**
 * Helper: Parse USDA API response
 */
function parseSoilData(apiResponse: any): any {
  try {
    if (!apiResponse || !apiResponse.Table || apiResponse.Table.length < 2) {
      return null;
    }

    const columns = apiResponse.Table[0];
    const values = apiResponse.Table[1];

    const data: any = {};
    columns.forEach((col: string, index: number) => {
      data[col.toLowerCase()] = values[index];
    });

    const septicSuitability = calculateSepticSuitability(data);

    return {
      mukey: data.mukey || '',
      muname: data.muname || 'Unknown',
      musym: data.musym || '',
      taxonname: data.compname || data.taxonname,
      drainagecl: data.drainagecl,
      hydricrating: data.hydricrating,
      comppct_r: data.comppct_r,
      // Note: Detailed soil properties not available in basic query
      claytotal_r: null,
      sandtotal_r: null,
      silttotal_r: null,
      slope_r: null,
      depth_r: null,
      wtdepannmin: null,
      septic_suitability: septicSuitability.rating,
      septic_rating: septicSuitability.description,
      adsorption_rate: septicSuitability.adsorptionRate,
      corrosion_concrete: null,
      corrosion_steel: null,
      source: 'USDA-SDA',
      confidence: 70, // Lower confidence since we have limited data
      query_date: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error parsing soil data:', error);
    return null;
  }
}

/**
 * Helper: Calculate septic suitability
 */
function calculateSepticSuitability(data: any): { rating: string; description: string; adsorptionRate: number } {
  const drainage = data.drainagecl?.toLowerCase() || '';
  const hydric = data.hydricrating?.toLowerCase() || '';

  // Simplified septic suitability based on drainage and hydric rating
  // This is a conservative estimate - real site evaluations needed

  if (drainage.includes('well drained') && hydric !== 'yes') {
    return { rating: 'B', description: 'Good - suitable with proper system design', adsorptionRate: 60 };
  }

  if (drainage.includes('moderately well') && hydric !== 'yes') {
    return { rating: 'B', description: 'Good - suitable with proper system design', adsorptionRate: 60 };
  }

  if ((drainage.includes('moderately') || drainage.includes('somewhat')) && hydric !== 'yes') {
    return { rating: 'C', description: 'Fair - may require engineered septic system', adsorptionRate: 90 };
  }

  if (drainage.includes('poor') || hydric === 'yes') {
    return { rating: 'D', description: 'Poor - not suitable for conventional septic systems', adsorptionRate: 120 };
  }

  // Default to fair rating if drainage class is unclear
  return { rating: 'C', description: 'Fair - detailed site evaluation required', adsorptionRate: 90 };
}

function getSuitabilityColor(rating: string): string {
  const colors: any = {
    'A': '#10b981',
    'B': '#22c55e',
    'C': '#f59e0b',
    'D': '#ef4444'
  };
  return colors[rating] || '#6b7280';
}

function getRecommendedDepth(soilData: any): string {
  const ratings: any = {
    'A': '24-48 inches',
    'B': '36-60 inches',
    'C': '48-72 inches',
    'D': 'Consult engineer'
  };
  return ratings[soilData.septic_suitability] || 'Consult engineer';
}

function getDrainageRequirements(soilData: any): string[] {
  const requirements: string[] = [];

  if (soilData.drainagecl?.toLowerCase().includes('poor')) {
    requirements.push('Enhanced drainage system required');
    requirements.push('Consider mound or above-ground system');
  }

  if (soilData.drainagecl?.toLowerCase().includes('somewhat')) {
    requirements.push('Moderate drainage - engineered system recommended');
  }

  if (soilData.hydricrating?.toLowerCase() === 'yes') {
    requirements.push('Wetland soil - special permitting required');
  }

  if (requirements.length === 0) {
    requirements.push('Standard drain field acceptable');
    requirements.push('Site-specific evaluation recommended');
  }

  return requirements;
}

function getWarnings(soilData: any): string[] {
  const warnings: string[] = [];

  if (soilData.hydricrating?.toLowerCase() === 'yes') {
    warnings.push('⚠ Hydric soil - wetland regulations may apply');
  }

  if (soilData.drainagecl?.toLowerCase().includes('poor')) {
    warnings.push('⚠ Poor drainage - conventional septic may not be suitable');
  }

  // Note: Limited soil data available - recommend professional site evaluation
  warnings.push('ℹ Professional soil evaluation recommended for accurate assessment');

  return warnings;
}

function estimateSepticCost(soilData: any): number {
  let baseCost = 8000;

  if (soilData.septic_suitability === 'C') baseCost += 5000;
  if (soilData.septic_suitability === 'D') baseCost += 12000;

  if (soilData.drainagecl?.toLowerCase().includes('poor')) {
    baseCost += 5000; // Mound or elevated system
  }

  if (soilData.hydricrating?.toLowerCase() === 'yes') {
    baseCost += 8000; // Special wetland considerations
  }

  return baseCost;
}

function getOverallSuitability(rating: string): string {
  const suitability: any = {
    'A': 'Excellent',
    'B': 'Good',
    'C': 'Fair',
    'D': 'Poor'
  };
  return suitability[rating] || 'Poor';
}

export default router;
