/**
 * OpenAI Vision API Service
 * Production-ready integration with OpenAI GPT-4 Vision for blueprint analysis
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export interface OpenAIVisionResponse {
  success: boolean;
  data?: any;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  processing_time: number;
}

export class OpenAIVisionService {
  private readonly MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for GPT-4 Vision
  private readonly SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  
  /**
   * Process blueprint through OpenAI Vision API with the complete 10-stage prompt
   */
  async analyzeBlueprint(
    imageBuffer: Buffer,
    mimeType: string,
    useGPT4: boolean = true
  ): Promise<OpenAIVisionResponse> {
    const startTime = Date.now();
    
    try {
      // Validate and prepare image
      const preparedImage = await this.prepareImage(imageBuffer, mimeType);
      
      // Select model - Using GPT-4 Vision
      // Current vision models: gpt-4-turbo (supports vision), gpt-4o, gpt-4o-mini
      const model = useGPT4 
        ? 'gpt-4-turbo'     // GPT-4 Turbo with vision support
        : 'gpt-4o-mini';     // Cheaper alternative with vision support
      
      // Create the complete prompt
      const prompt = this.getBlueprintAnalysisPrompt();
      
      // Call OpenAI Vision API
      console.log(`📸 Calling OpenAI Vision API (${model})...`);
      console.log(`🔑 API Key configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
      console.log(`🔑 API Key length: ${process.env.OPENAI_API_KEY?.length || 0}`);
      console.log(`🔑 API Key preview: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);
      
      // First, let's do a simple test to see if GPT can see the image
      console.log('🧪 Testing if GPT-4 Vision can see the image...');
      
      // Add timeout handling with AbortController
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 120000); // 2 minute timeout for OpenAI API
      
      try {
        // Convert image to base64 URL format
        const base64Image = `data:${mimeType};base64,${preparedImage.toString('base64')}`;
        
        console.log('📤 Sending request to OpenAI...');
        console.log('📊 Image size:', preparedImage.length, 'bytes');
        console.log('🔧 Model:', model);
        
        const response = await openai.chat.completions.create({
          model: model,
          max_tokens: 4096,
          temperature: 0.1, // Low temperature for precision
          messages: [
            {
              role: 'system',
              content: "You are GPT-4 Vision analyzing a REAL blueprint image. DO NOT generate fake/example data. ONLY report what you ACTUALLY SEE in the uploaded image. If you cannot detect rooms/walls/text in the image, return empty arrays or 'not detected'. Never use placeholder IDs like 'unique_id_001' or dates like '2023-12-07'. Extract REAL pixel coordinates from THIS specific uploaded image. You MUST return valid JSON with actual detected elements or empty arrays if nothing is detected."
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64Image,
                    detail: 'high' // Use high detail for better analysis
                  }
                },
              ],
            },
          ],
          response_format: { type: "json_object" } // Ensure JSON response
        });
        
        clearTimeout(timeout);
        
        // Parse the response
        let analysisResult;
        
        if (response.choices[0]?.message?.content) {
          console.log('📝 Raw GPT-4 Response (first 500 chars):', response.choices[0].message.content.substring(0, 500));
          // Try to extract JSON from the response
          const rawResult = this.extractJsonFromResponse(response.choices[0].message.content);
          
          // Check if the response is wrapped in blueprint_analysis_complete
          if (rawResult.blueprint_analysis_complete) {
            analysisResult = rawResult.blueprint_analysis_complete;
          } else {
            analysisResult = rawResult;
          }
          
          console.log('📊 Extracted analysis structure:', {
            hasProcessingStages: !!analysisResult.processing_stages,
            stageCount: analysisResult.processing_stages ? Object.keys(analysisResult.processing_stages).length : 0
          });
        } else {
          throw new Error('Unexpected response type from OpenAI');
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ OpenAI Vision analysis completed in ${processingTime}ms`);
        
        return {
          success: true,
          data: analysisResult,
          model: model,
          usage: response.usage as any,
          processing_time: processingTime,
        };
      } catch (timeoutError: any) {
        clearTimeout(timeout);
        if (timeoutError.name === 'AbortError') {
          throw new Error('OpenAI API timeout - request took too long');
        }
        throw timeoutError;
      }
      
    } catch (error: any) {
      console.error('OpenAI Vision API error:', error);
      console.error('Error details:', {
        message: error.message,
        type: error.type,
        code: error.code,
        status: error.status,
        response: error.response?.data
      });
      
      // Check if it's an API key issue
      if (error.message?.includes('401') || error.message?.includes('Incorrect API key')) {
        console.error('❌ API Key Authentication Failed - Check your OpenAI API key');
      }
      
      // Check if it's a billing issue
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        console.error('❌ OpenAI API Quota/Billing Issue - Check your OpenAI account');
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: useGPT4 ? 'gpt-4o' : 'gpt-4o-mini',
        processing_time: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Prepare image for OpenAI Vision API
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
   * Extract JSON from GPT's response text
   */
  private extractJsonFromResponse(text: string): any {
    // GPT-4 with json_object format should return valid JSON
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('Failed to parse JSON directly, trying extraction...');
    }
    
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
    // This is a fallback for when GPT doesn't return proper JSON
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
    return `# OpenAI Vision API Complete Blueprint Processing - HomeQuest Tech

## Task: Analyze THIS SPECIFIC architectural blueprint image through 10 systematic processing stages

CRITICAL: You MUST analyze the ACTUAL IMAGE provided in this request. 
- DO NOT return example, placeholder, or template data
- DO NOT use dates like "2023-12-07" or IDs like "unique_id_001"  
- ONLY return what you can SEE in THIS SPECIFIC IMAGE
- If you cannot detect rooms, return empty arrays
- If you cannot read text, mark as "illegible"
- Extract REAL coordinates based on the ACTUAL pixels in THIS image
- Count the EXACT number of rooms, walls, doors visible in THIS uploaded image

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

CRITICAL INSTRUCTIONS:
1. This is a REAL blueprint analysis task, not an example
2. Count and detect ACTUAL features in the provided image:
   - Count REAL rooms you can see
   - Detect ACTUAL walls with real coordinates
   - Find ACTUAL doors and windows
   - Extract REAL measurements if visible
3. DO NOT return example data like "unique_id_001" or "2023-10-01"
4. DO NOT return empty arrays if features exist in the image
5. Use the current timestamp and generate a real blueprint ID
6. Return ONLY valid JSON with ACTUAL detected data from THIS specific image`;
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
      if (imageBuffer.length > 20 * 1024 * 1024) {
        issues.push('File size too large (>20MB)');
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
export const openaiVisionService = new OpenAIVisionService();