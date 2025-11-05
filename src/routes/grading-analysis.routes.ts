/**
 * Grading Analysis Routes
 * Secure GPT-powered grading and site analysis
 */

import express, { Request, Response } from 'express';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface GradingInput {
  // Property Info
  address: string;
  lotSize: number;
  lotDimensions?: { width: number; height: number };
  propertyBounds?: Array<{ lat: number; lng: number }>;

  // Elevation Data
  elevationData: {
    min: number;
    max: number;
    average: number;
    slope: number;
    terrainType?: string;
  };

  // Soil Data
  soilData: {
    type: string;
    drainage: string;
    composition?: string;
    hydricRating?: string;
    bearingCapacity?: string;
  };

  // Zoning & Regulations
  zoning?: {
    zoneType: string;
    maxLotCoverage?: number;
    setbacks?: {
      front: number;
      rear: number;
      side: number;
    };
    heightLimit?: number;
    minLotSize?: number;
  };

  // Building Info (Optional - Mode 2)
  building?: {
    footprint: number;
    dimensions?: { width: number; length: number };
    stories: number;
    bedrooms: number;
    bathrooms: number;
    foundationType?: 'slab' | 'crawlspace' | 'basement' | 'pier';
    hasGarage?: boolean;
  };

  // Water Risk Data
  waterRisk?: any;
}

/**
 * @route   POST /api/grading/analyze
 * @desc    Analyze site grading and provide recommendations
 * @access  Public
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const input: GradingInput = req.body;

    if (!input.address || !input.lotSize || !input.elevationData || !input.soilData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: address, lotSize, elevationData, soilData'
      });
    }

    const mode = input.building ? 'with-building' : 'land-only';
    console.log(`🏗️ GPT Grading Analysis - Mode: ${mode} - Address: ${input.address}`);

    const prompt = buildPrompt(input, mode);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert civil engineer and site planner specializing in residential site grading, drainage design, and cost estimation.
          You have 20+ years of experience in site development and are familiar with building codes, soil mechanics, and construction costs.
          Provide detailed, practical, and cost-effective recommendations.
          Always respond in valid JSON format.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const result = completion.choices[0].message.content;
    const analysis = JSON.parse(result || '{}');

    // Ensure mode is set
    analysis.mode = mode;

    console.log('✅ GPT Grading Analysis complete');

    res.json({
      success: true,
      analysis,
      usage: completion.usage
    });

  } catch (error: any) {
    console.error('❌ GPT Grading Analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze grading'
    });
  }
});

function buildPrompt(input: GradingInput, mode: 'land-only' | 'with-building'): string {
  const baseInfo = `
PROPERTY INFORMATION:
- Address: ${input.address}
- Lot Size: ${input.lotSize.toLocaleString()} sq ft
${input.lotDimensions ? `- Lot Dimensions: ${input.lotDimensions.width}ft x ${input.lotDimensions.height}ft` : ''}

ELEVATION DATA:
- Elevation Range: ${input.elevationData.min}m to ${input.elevationData.max}m
- Average Elevation: ${input.elevationData.average}m
- Slope: ${input.elevationData.slope}%
- Elevation Change: ${(input.elevationData.max - input.elevationData.min).toFixed(1)}m (${((input.elevationData.max - input.elevationData.min) * 3.28084).toFixed(1)}ft)
${input.elevationData.terrainType ? `- Terrain Type: ${input.elevationData.terrainType}` : ''}

SOIL DATA:
- Soil Type: ${input.soilData.type}
- Drainage Class: ${input.soilData.drainage}
${input.soilData.composition ? `- Composition: ${input.soilData.composition}` : ''}
${input.soilData.hydricRating ? `- Hydric Rating: ${input.soilData.hydricRating}` : ''}
${input.soilData.bearingCapacity ? `- Bearing Capacity: ${input.soilData.bearingCapacity}` : ''}

${input.zoning ? `
ZONING & REGULATIONS:
- Zone Type: ${input.zoning.zoneType}
${input.zoning.maxLotCoverage ? `- Max Lot Coverage: ${input.zoning.maxLotCoverage}%` : ''}
${input.zoning.setbacks ? `
- Setbacks: Front ${input.zoning.setbacks.front}ft, Rear ${input.zoning.setbacks.rear}ft, Sides ${input.zoning.setbacks.side}ft` : ''}
${input.zoning.heightLimit ? `- Height Limit: ${input.zoning.heightLimit}ft` : ''}
${input.zoning.minLotSize ? `- Min Lot Size: ${input.zoning.minLotSize} sq ft` : ''}
` : ''}

BUILDING CODES & REQUIREMENTS:
- Min slope away from building: 2% (for drainage)
- Max slope without retaining wall: 33% (3:1 ratio)
- Erosion control required for: >50 cubic yards of grading
- Grading permit required for: >50 cubic yards of cut/fill

${input.waterRisk ? `
WATER RISK ANALYSIS:
- Overall Risk: ${input.waterRisk.overallRisk.toUpperCase()}
- Buildable: ${input.waterRisk.buildable ? 'YES' : 'NO - CRITICAL ISSUE'}
- FEMA Flood Zone: ${input.waterRisk.floodZone.zone} (${input.waterRisk.floodZone.description})
- Flood Insurance Required: ${input.waterRisk.floodZone.insuranceRequired ? 'YES' : 'No'}
${input.waterRisk.floodZone.estimatedAnnualInsurance ? `- Flood Insurance Cost: $${input.waterRisk.floodZone.estimatedAnnualInsurance.min}-$${input.waterRisk.floodZone.estimatedAnnualInsurance.max}/year` : ''}
${input.waterRisk.nearbyWater.length > 0 ? `
- Nearby Water Bodies:
${input.waterRisk.nearbyWater.slice(0, 3).map((w: any) => `  • ${w.name} - ${Math.round(w.distanceFeet)} feet away (${w.impact.toUpperCase()} impact)`).join('\n')}` : ''}
${input.waterRisk.waterTable ? `
- Water Table Depth: ${input.waterRisk.waterTable.depth} inches ${input.waterRisk.waterTable.depth < 24 ? '🚨 CRITICAL - VERY SHALLOW' : input.waterRisk.waterTable.depth < 72 ? '⚠️ WARNING - SHALLOW' : '✓ Safe'}
- Basement Safe: ${input.waterRisk.waterTable.basementSafe ? 'Yes' : 'NO'}` : ''}
${input.waterRisk.wetland?.isWetland ? `
- 🚨 WETLAND DETECTED: ${input.waterRisk.wetland.hydricRating}
- Building Allowed: ${input.waterRisk.wetland.buildingAllowed ? 'Yes (with permits)' : 'NO - WETLAND PROTECTED'}
- Permit Required: ${input.waterRisk.wetland.permitRequired ? 'YES' : 'No'}
- Estimated Permit Cost: $${input.waterRisk.wetland.estimatedPermitCost?.min}-$${input.waterRisk.wetland.estimatedPermitCost?.max}` : ''}
- Additional Costs Due to Water: $${input.waterRisk.estimatedAdditionalCosts.min.toLocaleString()}-$${input.waterRisk.estimatedAdditionalCosts.max.toLocaleString()}

CRITICAL WATER WARNINGS:
${input.waterRisk.warnings.map((w: string) => `- ${w}`).join('\n')}

WATER-RELATED REQUIREMENTS:
${input.waterRisk.requirements.map((r: string) => `- ${r}`).join('\n')}
` : ''}
`;

  if (mode === 'land-only') {
    return `${baseInfo}

TASK: LAND DEVELOPMENT ANALYSIS

This is a VACANT LOT. The client wants to know what they can build here.

Analyze this property and provide:

1. SITE CAPACITY ANALYSIS
   - Calculate buildable area (considering setbacks and lot coverage)
   - Determine maximum building footprint possible
   - Assess terrain characteristics (slope, drainage, soil)

2. BUILDING RECOMMENDATIONS (provide 3 options: small, medium, large)
   For each option, specify:
   - Square footage (main floor)
   - Number of bedrooms and bathrooms
   - Number of stories (consider basement potential)
   - Key features (garage, deck, basement, etc.)
   - Site preparation costs (grading, foundation, utilities)
   - Pros and cons specific to this lot
   - Description of why this size works well

3. GRADING PLAN (for a typical medium-sized home)
   - Recommended building pad elevation
   - Cut and fill volumes needed
   - Drainage design (slopes, swales, features)
   - Retaining walls (if needed)
   - Cost breakdown (grading, erosion control, drainage, walls)
   - Timeline estimates

4. OPTIMAL PLACEMENT
   - Where on the lot to place the building
   - Orientation considerations
   - Reasoning based on terrain, views, access

5. RECOMMENDATIONS & OPPORTUNITIES
   - Cost-saving strategies
   - Design opportunities (walk-out basement, views, etc.)
   - Warnings about challenges
   - Code compliance requirements

Respond in this EXACT JSON format:
{
  "mode": "land-only",
  "siteCapacity": {
    "buildableArea": number,
    "maxBuildingFootprint": number,
    "recommendedBuildings": [
      {
        "size": "small",
        "squareFeet": number,
        "bedrooms": number,
        "bathrooms": number,
        "stories": number,
        "description": "string",
        "features": ["string"],
        "estimatedCost": {
          "sitePrepMin": number,
          "sitePrepMax": number,
          "foundationMin": number,
          "foundationMax": number,
          "totalMin": number,
          "totalMax": number
        },
        "pros": ["string"],
        "cons": ["string"]
      }
    ],
    "optimalPlacement": "string",
    "siteCharacteristics": ["string"]
  },
  "gradingPlan": {
    "buildingPadElevation": number,
    "proposedGrade": {
      "cutVolume": number,
      "fillVolume": number,
      "netVolume": number,
      "balancedGrade": boolean
    },
    "drainagePlan": {
      "primarySlope": "string",
      "features": ["string"],
      "swales": ["string"]
    },
    "retainingWalls": [],
    "costs": {
      "grading": {"min": number, "max": number},
      "erosionControl": {"min": number, "max": number},
      "drainage": {"min": number, "max": number},
      "total": {"min": number, "max": number}
    },
    "timeline": {
      "grading": "string",
      "drainage": "string",
      "total": "string"
    }
  },
  "recommendations": ["string"],
  "warnings": ["string"],
  "opportunities": ["string"],
  "compliance": {
    "permits": ["string"],
    "inspections": ["string"],
    "requirements": ["string"]
  },
  "summary": "string",
  "confidence": number
}`;
  } else {
    return `${baseInfo}

PROPOSED BUILDING:
- Footprint: ${input.building!.footprint.toLocaleString()} sq ft
${input.building!.dimensions ? `- Dimensions: ${input.building!.dimensions.width}ft x ${input.building!.dimensions.length}ft` : ''}
- Stories: ${input.building!.stories}
- Bedrooms: ${input.building!.bedrooms}
- Bathrooms: ${input.building!.bathrooms}
${input.building!.foundationType ? `- Foundation Type: ${input.building!.foundationType}` : ''}
${input.building!.hasGarage ? '- Includes Garage' : ''}

TASK: BUILDING-SPECIFIC GRADING PLAN

The client wants to build THIS SPECIFIC BUILDING on this lot.

Analyze and provide:

1. COMPATIBILITY CHECK
   - Does the building fit within setbacks?
   - Does it comply with lot coverage limits?
   - Are there any zoning violations?
   - What modifications (if any) are needed?

2. DETAILED GRADING PLAN
   - Optimal building pad elevation for this building
   - Exact cut and fill volumes required
   - Drainage design around this specific footprint
   - Retaining walls needed (locations, heights, lengths)
   - Complete cost breakdown
   - Timeline for site preparation

3. RECOMMENDATIONS & WARNINGS
   - Cost optimization strategies
   - Potential issues or challenges
   - Code compliance requirements
   - Alternatives to consider

Respond in this EXACT JSON format:
{
  "mode": "with-building",
  "compatibility": {
    "fits": boolean,
    "issues": ["string"],
    "warnings": ["string"],
    "modifications": ["string"]
  },
  "gradingPlan": {
    "buildingPadElevation": number,
    "proposedGrade": {
      "cutVolume": number,
      "fillVolume": number,
      "netVolume": number,
      "balancedGrade": boolean
    },
    "drainagePlan": {
      "primarySlope": "string",
      "features": ["string"],
      "swales": ["string"],
      "retention": "string"
    },
    "retainingWalls": [
      {
        "location": "string",
        "height": number,
        "length": number,
        "reason": "string"
      }
    ],
    "costs": {
      "grading": {"min": number, "max": number},
      "erosionControl": {"min": number, "max": number},
      "drainage": {"min": number, "max": number},
      "retainingWalls": {"min": number, "max": number},
      "total": {"min": number, "max": number}
    },
    "timeline": {
      "grading": "string",
      "drainage": "string",
      "total": "string"
    }
  },
  "recommendations": ["string"],
  "warnings": ["string"],
  "opportunities": ["string"],
  "compliance": {
    "permits": ["string"],
    "inspections": ["string"],
    "requirements": ["string"]
  },
  "summary": "string",
  "confidence": number
}`;
  }
}

export default router;
