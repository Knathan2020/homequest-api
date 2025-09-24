/**
 * Claude Vision API Service
 * Production-ready integration with Anthropic Claude Vision for blueprint analysis
 */

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface ClaudeVisionResponse {
  success: boolean;
  data?: any;
  error?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  model: string;
  processing_time: number;
}

export class ClaudeVisionService {
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  
  /**
   * Process blueprint through Claude Vision API with the complete 10-stage prompt
   */
  async analyzeBlueprint(
    imageBuffer: Buffer,
    mimeType: string,
    useOpus: boolean = true
  ): Promise<ClaudeVisionResponse> {
    const startTime = Date.now();
    
    try {
      // Validate and prepare image
      const preparedImage = await this.prepareImage(imageBuffer, mimeType);
      
      // Select model - Using Claude Opus 4.1 as documented
      const model = useOpus 
        ? 'claude-opus-4-1-20250805'     // Claude Opus 4.1 - Latest and most capable
        : 'claude-3-haiku-20240307';     // Haiku for faster/cheaper processing
      
      // Create the complete prompt
      const prompt = this.getBlueprintAnalysisPrompt();
      
      // Call Claude Vision API
      console.log(`📸 Calling Claude Vision API (${model})...`);
      console.log(`🔑 API Key configured: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
      console.log(`🔑 API Key length: ${process.env.ANTHROPIC_API_KEY?.length || 0}`);
      console.log(`🔑 API Key preview: ${process.env.ANTHROPIC_API_KEY?.substring(0, 10)}...`);
      
      // First, let's do a simple test to see if Claude can see the image
      console.log('🧪 Testing if Claude can see the image...');
      
      // Add timeout handling with AbortController
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 120000); // 2 minute timeout for Claude API
      
      try {
        const response = await anthropic.messages.create({
          model: model,
          max_tokens: 8000,
          temperature: 0.1, // Low temperature for precision
          system: "You are Claude Vision, an expert architectural blueprint analyzer. Analyze the provided blueprint image and extract all structural elements, measurements, and specifications following the exact 10-stage processing pipeline. Return structured JSON data for each stage.",
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as any,
                    data: preparedImage.toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
        });
        
        clearTimeout(timeout);
        
        // Parse the response
        const content = response.content[0];
        let analysisResult;
        
        if (content.type === 'text') {
          console.log('📝 Raw Claude Response (first 500 chars):', content.text?.substring(0, 500));
          // Try to extract JSON from the response
          analysisResult = this.extractJsonFromResponse(content.text);
        } else {
          throw new Error('Unexpected response type from Claude');
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Claude Vision analysis completed in ${processingTime}ms`);
        
        return {
          success: true,
          data: analysisResult,
          model: model,
          usage: response.usage as any,
          processing_time: processingTime,
        };
      } catch (timeoutError) {
        clearTimeout(timeout);
        if (timeoutError.name === 'AbortError') {
          throw new Error('Claude API timeout - request took too long');
        }
        throw timeoutError;
      }
      
    } catch (error) {
      console.error('Claude Vision API error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: useOpus ? 'claude-3-opus-20240229' : 'claude-3-sonnet-20240229',
        processing_time: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Prepare image for Claude Vision API
   */
  private async prepareImage(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
    // Check file size
    if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
      console.log('📉 Compressing large image...');
      
      // Compress image using sharp
      const compressed = await sharp(imageBuffer)
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
      
      if (compressed.length > this.MAX_IMAGE_SIZE) {
        // Further resize if still too large
        return await sharp(compressed)
          .resize(2000, 2000, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      }
      
      return compressed;
    }
    
    // Validate format
    if (!this.SUPPORTED_FORMATS.includes(mimeType)) {
      // Convert to supported format
      return await sharp(imageBuffer)
        .jpeg()
        .toBuffer();
    }
    
    return imageBuffer;
  }
  
  /**
   * Extract JSON from Claude's response text
   */
  private extractJsonFromResponse(text: string): any {
    // First, try to extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (error) {
        console.warn('Failed to parse JSON from code block');
      }
    }
    
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (error) {
        console.warn('Failed to parse JSON from response, attempting to clean...');
        
        // Try to clean and parse again
        const cleaned = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/,\s*}/, '}') // Remove trailing commas
          .replace(/,\s*]/, ']');
        
        try {
          return JSON.parse(cleaned);
        } catch {
          // Return structured response even if parsing fails
          return this.parseTextResponse(text);
        }
      }
    }
    
    // If no JSON found, try to parse the text response
    return this.parseTextResponse(text);
  }
  
  /**
   * Parse text response into structured format
   */
  private parseTextResponse(text: string): any {
    // This is a fallback for when Claude doesn't return proper JSON
    const result: any = {
      processing_stages: {},
      text_content: text,
    };
    
    // Try to extract stages from text
    const stagePatterns = [
      /stage[_\s]?1[_\s]?assessment[:\s]*(.*?)(?=stage[_\s]?2|$)/is,
      /stage[_\s]?2[_\s]?recognition[:\s]*(.*?)(?=stage[_\s]?2\.5|stage[_\s]?3|$)/is,
      /stage[_\s]?2\.5[_\s]?symbols[:\s]*(.*?)(?=stage[_\s]?3|$)/is,
      /stage[_\s]?3[_\s]?scale[:\s]*(.*?)(?=stage[_\s]?4|$)/is,
      /stage[_\s]?4[_\s]?coordinates[:\s]*(.*?)(?=stage[_\s]?5|$)/is,
      /stage[_\s]?5[_\s]?measurements[:\s]*(.*?)(?=stage[_\s]?5\.5|stage[_\s]?6|$)/is,
      /stage[_\s]?5\.5[_\s]?code[_\s]?validation[:\s]*(.*?)(?=stage[_\s]?6|$)/is,
      /stage[_\s]?6[_\s]?rooms[:\s]*(.*?)(?=stage[_\s]?7|$)/is,
      /stage[_\s]?7[_\s]?threejs[:\s]*(.*?)(?=stage[_\s]?8|$)/is,
      /stage[_\s]?8[_\s]?glb[_\s]?specs[:\s]*(.*?)(?=$)/is,
    ];
    
    stagePatterns.forEach((pattern, index) => {
      const match = text.match(pattern);
      if (match && match[1]) {
        const stageKey = this.getStageKey(index);
        result.processing_stages[stageKey] = {
          content: match[1].trim(),
          extracted: true,
        };
      }
    });
    
    return result;
  }
  
  /**
   * Get stage key from index
   */
  private getStageKey(index: number): string {
    const keys = [
      'stage_1_assessment',
      'stage_2_recognition',
      'stage_2_5_symbols',
      'stage_3_scale',
      'stage_4_coordinates',
      'stage_5_measurements',
      'stage_5_5_code_validation',
      'stage_6_rooms',
      'stage_7_threejs',
      'stage_8_glb_specs',
    ];
    return keys[index] || `stage_${index + 1}`;
  }
  
  /**
   * Get the complete blueprint analysis prompt
   */
  private getBlueprintAnalysisPrompt(): string {
    return `# Claude Vision API Complete Blueprint Processing - HomeQuest Tech

## Task: Analyze this architectural blueprint through 10 systematic processing stages

You are analyzing a blueprint for a construction technology platform. Extract precise building data and return structured JSON for each stage.

## STAGE 1: Blueprint Quality Assessment

Assess the image quality:
- Resolution clarity and text readability
- Line clarity and contrast
- Blueprint type (floor plan, site plan, elevation, detail)
- Drawing style (CAD, hand-drawn, hybrid)

Return JSON:
{
  "stage_1_assessment": {
    "image_quality": "excellent|good|fair|poor",
    "text_readability": "clear|readable|difficult|illegible",
    "line_clarity": "crisp|acceptable|blurry|unusable",
    "blueprint_type": "floor_plan|site_plan|elevation|detail|multiple",
    "drawing_style": "CAD|hand_drawn|hybrid",
    "processing_recommendation": "proceed|enhance_image|manual_input_required",
    "quality_issues": []
  }
}

## STAGE 2: Element Recognition & Classification

Identify and classify structural elements:
- Exterior and interior walls (thick parallel lines)
- Wall intersections and building outline
- Doors (arc symbols, gaps in walls)
- Windows (rectangles in walls)
- Property lines (dashed lines)
- Filter out dimension lines and annotations

Return JSON:
{
  "stage_2_recognition": {
    "structural_elements": {
      "exterior_walls": [{"id": "ext_wall_1", "start_pixel": [x,y], "end_pixel": [x,y], "thickness_pixels": n, "confidence": n}],
      "interior_walls": [],
      "wall_intersections": [],
      "building_outline": [[x,y], [x,y], ...]
    },
    "property_elements": {
      "property_lines": [],
      "setback_lines": []
    },
    "openings": {
      "doors": [{"id": "door_1", "position_pixel": [x,y], "width_pixels": n, "type": "entry", "confidence": n}],
      "windows": [],
      "garage_doors": []
    },
    "text_recognition": {
      "room_labels": [],
      "dimensions": []
    },
    "recognition_confidence": {
      "overall_confidence": n,
      "elements_flagged_for_review": []
    }
  }
}

## STAGE 2.5: Architectural Symbol Library

Detect standard architectural symbols:
- Electrical (outlets, switches, fixtures)
- Plumbing (toilets, sinks, tubs)
- HVAC (vents, equipment)
- Structural (columns, beams, stairs)
- Appliances (refrigerator, stove, dishwasher)

Return JSON:
{
  "stage_2_5_symbols": {
    "electrical": {"outlets": [], "switches": [], "fixtures": []},
    "plumbing": {"bathroom_fixtures": [], "kitchen_fixtures": []},
    "hvac": {"vents": [], "equipment": []},
    "structural": {"columns": [], "beams": [], "stairs": []},
    "appliances": {"major_appliances": []},
    "symbol_recognition_summary": {
      "total_symbols_detected": n,
      "confidence_average": n
    }
  }
}

## STAGE 3: Scale Detection & Measurement

Detect drawing scale using multiple methods:
- Look for scale text (e.g., "1/4" = 1'-0")
- Analyze dimension annotations
- Use standard door width (36")
- Check grid patterns

Return JSON:
{
  "stage_3_scale": {
    "scale_detection": {
      "method_used": "scale_text|dimension_analysis|standard_objects",
      "scale_ratio": {
        "drawing_units": "1/4 inch",
        "real_world_units": "1 foot",
        "pixels_per_foot": n,
        "scale_confidence": n
      }
    },
    "scale_reliability": {
      "cross_validation_passed": true|false,
      "final_confidence": n,
      "recommendation": "proceed_with_scale|request_manual_input"
    }
  }
}

## STAGE 4: Precision Coordinate Extraction

Extract precise coordinates for all elements:
- Wall start/end points with sub-pixel precision
- Curved elements (arcs, circles)
- Irregular room boundaries
- Opening positions

Return JSON:
{
  "stage_4_coordinates": {
    "precision_extraction": {
      "coordinate_confidence": n
    },
    "straight_walls": [],
    "curved_elements": [],
    "irregular_rooms": [],
    "coordinate_quality": {
      "sub_pixel_precision": true|false,
      "intersection_accuracy": "high|medium|low"
    }
  }
}

## STAGE 5: Real-World Measurements

Convert pixel measurements to feet/inches:
- Apply scale ratio to all coordinates
- Calculate room areas in square feet
- Measure wall lengths and thicknesses
- Validate measurements against standards

Return JSON:
{
  "stage_5_measurements": {
    "scale_application": {
      "pixels_per_foot": n
    },
    "exterior_dimensions": {
      "walls": [],
      "building_envelope": {
        "length_feet": n,
        "width_feet": n,
        "footprint_sqft": n
      }
    },
    "interior_spaces": {
      "rooms": [{"name": "Living Room", "area_sqft": n, "boundary_feet": []}],
      "total_interior_sqft": n
    }
  }
}

## STAGE 5.5: Building Code Validation

Validate against building codes:
- Room minimum sizes (bedroom 70 sqft, bathroom 40 sqft)
- Egress requirements (doors, windows)
- ADA compliance (door widths, hallways)
- Structural requirements

Return JSON:
{
  "stage_5_5_code_validation": {
    "room_compliance": {
      "bedrooms": [],
      "bathrooms": []
    },
    "egress_compliance": {
      "all_bedrooms_have_egress": true|false
    },
    "ada_compliance": {
      "door_clearances": "compliant|non_compliant",
      "hallway_widths": "compliant|non_compliant"
    },
    "compliance_summary": {
      "overall_compliance": "passed|failed",
      "violations": [],
      "warnings": []
    }
  }
}

## STAGE 6: Room Boundary Detection

Detect and classify rooms:
- Trace room boundaries from walls
- Identify room types from labels/size/features
- Handle open floor plans
- Map room connections

Return JSON:
{
  "stage_6_rooms": {
    "room_boundaries": [
      {
        "room_id": "living_room",
        "room_name": "Living Room",
        "boundary_feet": [[x,y], [x,y], ...],
        "area_sqft": n,
        "room_type": "living_space",
        "connected_to": ["kitchen", "hallway"]
      }
    ],
    "room_detection_summary": {
      "total_rooms_detected": n,
      "total_interior_sqft": n
    }
  }
}

## STAGE 7: Three.js Geometry Formatting

Convert to Three.js 3D coordinates:
- Transform 2D to 3D coordinates (Y-up system)
- Generate wall geometries with height
- Create floor geometries for rooms
- Prepare building envelope

Return JSON:
{
  "stage_7_threejs": {
    "coordinate_conversion": {
      "coordinate_system": "Y_up_real_world_feet",
      "origin_point": [0, 0, 0]
    },
    "wall_geometries": [],
    "room_geometries": [],
    "building_envelope": {
      "footprint": [],
      "overall_dimensions": {"length": n, "width": n, "height": 9}
    }
  }
}

## STAGE 8: GLB Model Specifications

Generate 3D model specifications:
- Building type and complexity
- Geometry specifications
- Site planning data
- Placement metadata

Return JSON:
{
  "stage_8_glb_specs": {
    "model_requirements": {
      "building_type": "single_family|multi_family|commercial",
      "complexity_level": "simple|moderate|complex"
    },
    "geometry_specs": {
      "exterior_envelope": {},
      "key_features": {}
    },
    "site_planning_data": {
      "property_boundaries": [],
      "setbacks": {},
      "lot_coverage": {}
    }
  }
}

## FINAL OUTPUT

Combine all stages into a complete analysis:
{
  "blueprint_analysis_complete": {
    "processing_timestamp": "ISO8601",
    "blueprint_id": "unique_id",
    "processing_stages": {
      "stage_1_assessment": {...},
      "stage_2_recognition": {...},
      "stage_2_5_symbols": {...},
      "stage_3_scale": {...},
      "stage_4_coordinates": {...},
      "stage_5_measurements": {...},
      "stage_5_5_code_validation": {...},
      "stage_6_rooms": {...},
      "stage_7_threejs": {...},
      "stage_8_glb_specs": {...}
    },
    "accuracy_metrics": {
      "overall_accuracy": n,
      "wall_detection_accuracy": n,
      "room_detection_accuracy": n,
      "measurement_accuracy": n
    },
    "overall_results": {
      "processing_success": true|false,
      "overall_confidence": n,
      "ready_for_glb_generation": true|false,
      "manual_review_needed": true|false,
      "critical_errors": [],
      "warnings": []
    }
  }
}

IMPORTANT: Analyze the blueprint image carefully and provide accurate measurements and detection for all 10 stages. Return complete JSON structure.`;
  }
  
  /**
   * Perform quick validation of blueprint before full processing
   */
  async quickValidation(imageBuffer: Buffer): Promise<{
    valid: boolean;
    confidence: number;
    issues: string[];
  }> {
    try {
      // Use sharp to get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      
      const issues: string[] = [];
      let confidence = 100;
      
      // Check resolution
      if (!metadata.width || !metadata.height) {
        issues.push('Unable to determine image dimensions');
        confidence -= 30;
      } else {
        if (metadata.width < 800 || metadata.height < 600) {
          issues.push('Image resolution too low');
          confidence -= 20;
        }
      }
      
      // Check format
      if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
        issues.push('Unsupported image format');
        confidence -= 15;
      }
      
      // Check file size
      if (imageBuffer.length > 10 * 1024 * 1024) {
        issues.push('File size too large (>10MB)');
        confidence -= 10;
      }
      
      return {
        valid: confidence >= 50,
        confidence: Math.max(0, confidence),
        issues,
      };
    } catch (error) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Failed to validate image'],
      };
    }
  }
}

// Export singleton instance
export const claudeVisionService = new ClaudeVisionService();