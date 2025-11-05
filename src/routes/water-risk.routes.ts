/**
 * Water Risk Analysis Routes
 * Secure water risk detection using FEMA and Google Places APIs
 */

import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';

const router = Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) {
  console.error('❌ GOOGLE_MAPS_API_KEY environment variable is not set');
}

interface WaterRiskInput {
  lat: number;
  lng: number;
  soilData?: {
    hydricRating?: string;
    waterTableDepth?: number;
    drainage?: string;
  };
}

/**
 * @route   POST /api/water-risk/analyze
 * @desc    Comprehensive water risk analysis
 * @access  Public
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { lat, lng, soilData }: WaterRiskInput = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`🌊 Water Risk Analysis - Coordinates: ${lat}, ${lng}`);

    // Parallel API calls for efficiency
    const [femaData, nearbyWater] = await Promise.all([
      getFEMAFloodZone(lat, lng),
      getNearbyWaterBodies(lat, lng)
    ]);

    // Analyze water table and wetlands from soil data
    const waterTable = soilData?.waterTableDepth
      ? analyzeWaterTable(soilData.waterTableDepth, soilData.drainage || 'Unknown')
      : null;

    const wetland = soilData?.hydricRating
      ? analyzeWetland(soilData.hydricRating, soilData.drainage || 'Unknown')
      : null;

    // Calculate overall risk
    const analysis = calculateOverallRisk({
      floodZone: femaData,
      nearbyWater,
      waterTable,
      wetland
    });

    console.log(`✅ Water Risk Analysis complete - Risk: ${analysis.overallRisk}`);

    res.json({
      success: true,
      analysis
    });

  } catch (error: any) {
    console.error('❌ Water Risk Analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze water risk'
    });
  }
});

/**
 * Get FEMA flood zone data
 */
async function getFEMAFloodZone(lat: number, lng: number): Promise<any> {
  try {
    const url = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;

    const response = await fetch(url);
    const data: any = await response.json();

    if (data.features && data.features.length > 0) {
      const zone = data.features[0].attributes;
      const zoneCode = zone.FLD_ZONE || zone.ZONE_SUBTY || 'X';

      return interpretFloodZone(zoneCode);
    }

    // Default to Zone X (minimal flood risk)
    return interpretFloodZone('X');
  } catch (error) {
    console.error('FEMA API error:', error);
    return interpretFloodZone('X');
  }
}

/**
 * Interpret FEMA flood zone codes
 */
function interpretFloodZone(zoneCode: string): any {
  const zones: Record<string, any> = {
    'A': {
      zone: 'A',
      description: 'High Risk Flood Zone',
      risk: 'high',
      insuranceRequired: true,
      estimatedAnnualInsurance: { min: 1200, max: 3000 }
    },
    'AE': {
      zone: 'AE',
      description: 'High Risk Flood Zone (with elevation)',
      risk: 'high',
      insuranceRequired: true,
      estimatedAnnualInsurance: { min: 1500, max: 4000 }
    },
    'V': {
      zone: 'V',
      description: 'Coastal High Risk Zone',
      risk: 'critical',
      insuranceRequired: true,
      estimatedAnnualInsurance: { min: 3000, max: 8000 }
    },
    'VE': {
      zone: 'VE',
      description: 'Coastal High Risk Zone (with elevation)',
      risk: 'critical',
      insuranceRequired: true,
      estimatedAnnualInsurance: { min: 3500, max: 10000 }
    },
    'X': {
      zone: 'X',
      description: 'Minimal Flood Risk',
      risk: 'low',
      insuranceRequired: false,
      estimatedAnnualInsurance: null
    }
  };

  return zones[zoneCode] || zones['X'];
}

/**
 * Get nearby water bodies using Google Places API
 */
async function getNearbyWaterBodies(lat: number, lng: number): Promise<any[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    return [];
  }

  try {
    const waterTypes = [
      'natural_feature', // Lakes, rivers, etc.
    ];

    const waterBodies: any[] = [];

    for (const type of waterTypes) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1000&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data: any = await response.json();

      if (data.results) {
        for (const place of data.results) {
          if (isWaterBody(place.name)) {
            const distance = calculateDistance(
              lat,
              lng,
              place.geometry.location.lat,
              place.geometry.location.lng
            );

            waterBodies.push({
              name: place.name,
              type: place.types[0],
              distanceMeters: distance,
              distanceFeet: distance * 3.28084,
              impact: distance < 30 ? 'critical' : distance < 100 ? 'high' : distance < 300 ? 'moderate' : 'low'
            });
          }
        }
      }
    }

    return waterBodies.sort((a, b) => a.distanceMeters - b.distanceMeters);
  } catch (error) {
    console.error('Google Places API error:', error);
    return [];
  }
}

/**
 * Check if place name indicates water body
 */
function isWaterBody(name: string): boolean {
  const waterKeywords = [
    'lake', 'river', 'creek', 'stream', 'pond', 'bay', 'ocean',
    'reservoir', 'canal', 'marsh', 'swamp', 'wetland', 'brook'
  ];

  const nameLower = name.toLowerCase();
  return waterKeywords.some(keyword => nameLower.includes(keyword));
}

/**
 * Calculate distance between two coordinates (in meters)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Analyze water table depth
 */
function analyzeWaterTable(depth: number, drainage: string): any {
  return {
    depth,
    drainage,
    slabSafe: depth >= 12,
    crawlspaceSafe: depth >= 24,
    basementSafe: depth >= 72,
    risk: depth < 12 ? 'critical' : depth < 24 ? 'high' : depth < 72 ? 'moderate' : 'low',
    warning: depth < 12 ? 'Water table too shallow - may be wetland' :
             depth < 24 ? 'Slab-on-grade foundation recommended' :
             depth < 72 ? 'Basement not recommended' :
             null
  };
}

/**
 * Analyze wetland status
 */
function analyzeWetland(hydricRating: string, drainage: string): any {
  const isWetland = hydricRating?.toLowerCase().includes('yes') ||
                    drainage?.toLowerCase().includes('very poor');

  return {
    isWetland,
    hydricRating,
    drainage,
    buildingAllowed: !isWetland,
    permitRequired: isWetland,
    estimatedPermitCost: isWetland ? { min: 5000, max: 25000 } : null,
    warning: isWetland ? 'Protected wetland - building may be prohibited or require extensive permits' : null
  };
}

/**
 * Calculate overall water risk
 */
function calculateOverallRisk(data: any): any {
  const { floodZone, nearbyWater, waterTable, wetland } = data;

  const risks: string[] = [];
  const warnings: string[] = [];
  const requirements: string[] = [];
  let additionalCostsMin = 0;
  let additionalCostsMax = 0;

  // Flood zone risk
  if (floodZone.risk === 'critical' || floodZone.risk === 'high') {
    risks.push(floodZone.risk);
    warnings.push(`FEMA ${floodZone.zone} - ${floodZone.description}`);
    if (floodZone.insuranceRequired) {
      requirements.push('Flood insurance required for mortgage');
      additionalCostsMin += floodZone.estimatedAnnualInsurance.min;
      additionalCostsMax += floodZone.estimatedAnnualInsurance.max;
    }
  }

  // Nearby water risk
  const criticalWater = nearbyWater.filter((w: any) => w.impact === 'critical');
  if (criticalWater.length > 0) {
    risks.push('critical');
    warnings.push(`Water body within 100 feet: ${criticalWater[0].name}`);
    requirements.push('Elevation survey required');
    additionalCostsMin += 2000;
    additionalCostsMax += 5000;
  }

  // Water table risk
  if (waterTable && waterTable.risk === 'critical') {
    risks.push('critical');
    warnings.push(waterTable.warning);
    requirements.push('Geotechnical investigation required');
    additionalCostsMin += 5000;
    additionalCostsMax += 15000;
  }

  // Wetland risk
  if (wetland && wetland.isWetland) {
    risks.push('critical');
    warnings.push(wetland.warning);
    if (wetland.permitRequired) {
      requirements.push('Wetland delineation and permits');
      additionalCostsMin += wetland.estimatedPermitCost.min;
      additionalCostsMax += wetland.estimatedPermitCost.max;
    }
  }

  // Determine overall risk
  const overallRisk = risks.includes('critical') ? 'critical' :
                      risks.includes('high') ? 'high' :
                      risks.includes('moderate') ? 'moderate' :
                      'low';

  const buildable = overallRisk !== 'critical' || (wetland && !wetland.isWetland);

  return {
    overallRisk,
    buildable,
    floodZone,
    nearbyWater,
    waterTable,
    wetland,
    warnings,
    requirements,
    estimatedAdditionalCosts: {
      min: additionalCostsMin,
      max: additionalCostsMax
    }
  };
}

export default router;
