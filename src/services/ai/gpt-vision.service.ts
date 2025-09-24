// ========================================
// GPT-4 VISION SERVICE - gpt-vision.service.ts
// Analyzes floor plans using GPT-4 Vision API for unclear areas
// ========================================

import OpenAI from 'openai';
import sharp from 'sharp';
import { Room, Point2D } from '../../types/floor-plan.types';
import { RoomType } from '../../types/room.types';

interface VisionAnalysisRequest {
  imageBuffer: Buffer;
  analysisType: 'full' | 'region' | 'clarification' | 'validation';
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    context?: string;
  };
  existingData?: {
    rooms?: Room[];
    text?: string;
    dimensions?: any[];
  };
  prompt?: string;
}

interface VisionAnalysisResult {
  success: boolean;
  analysis: {
    rooms: RoomAnalysis[];
    dimensions: DimensionAnalysis[];
    features: FeatureAnalysis[];
    unclear_areas: UnclearArea[];
    text_annotations: TextAnnotation[];
    confidence_score: number;
  };
  raw_response: string;
  tokens_used: number;
  processing_time: number;
}

interface RoomAnalysis {
  type: RoomType;
  label?: string;
  polygon?: Point2D[];
  dimensions?: {
    width: string;
    height: string;
    area?: string;
  };
  features: string[];
  confidence: number;
  reasoning: string;
}

interface DimensionAnalysis {
  location: Point2D;
  value: string;
  unit: 'feet' | 'meters' | 'inches';
  refers_to: string;
  confidence: number;
}

interface FeatureAnalysis {
  type: 'door' | 'window' | 'fixture' | 'appliance' | 'structural';
  name: string;
  location: Point2D;
  attributes: Record<string, any>;
  confidence: number;
}

interface UnclearArea {
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  issue: string;
  suggestions: string[];
  requires_human_review: boolean;
}

interface TextAnnotation {
  text: string;
  location: Point2D;
  type: 'room_label' | 'dimension' | 'note' | 'title';
  confidence: number;
}

// Prompt templates for different analysis types
const PROMPT_TEMPLATES = {
  FULL_ANALYSIS: `You are an expert architectural plan analyst. Analyze this floor plan image and provide detailed information about:

1. ROOMS: Identify all rooms with their types (bedroom, bathroom, kitchen, living room, etc.)
2. DIMENSIONS: Extract all visible dimensions and measurements
3. FEATURES: Identify doors, windows, fixtures, and appliances
4. LAYOUT: Describe the overall layout and flow
5. UNCLEAR AREAS: Point out any areas that are unclear or ambiguous

Respond in JSON format with the following structure:
{
  "rooms": [
    {
      "type": "room type",
      "label": "room label if visible",
      "approximate_location": "description of location",
      "dimensions": {
        "width": "width if visible",
        "height": "height if visible",
        "area": "area if calculable"
      },
      "features": ["list of features"],
      "confidence": 0.0-1.0,
      "reasoning": "why you identified it as this room type"
    }
  ],
  "dimensions": [
    {
      "value": "dimension value",
      "unit": "feet/meters/inches",
      "refers_to": "what this dimension refers to",
      "confidence": 0.0-1.0
    }
  ],
  "features": [
    {
      "type": "door/window/fixture/appliance/structural",
      "name": "feature name",
      "location": "description of location",
      "attributes": {},
      "confidence": 0.0-1.0
    }
  ],
  "unclear_areas": [
    {
      "location": "description of location",
      "issue": "what is unclear",
      "suggestions": ["possible interpretations"],
      "requires_human_review": true/false
    }
  ],
  "text_annotations": [
    {
      "text": "visible text",
      "type": "room_label/dimension/note/title",
      "refers_to": "what it refers to",
      "confidence": 0.0-1.0
    }
  ],
  "overall_confidence": 0.0-1.0
}`,

  REGION_ANALYSIS: `Analyze this specific region of a floor plan. Focus on:
1. What type of room or area this appears to be
2. Any visible text, labels, or dimensions
3. Fixtures, doors, windows, or other features
4. Any ambiguities or unclear elements

Context: {context}

Provide detailed analysis in JSON format.`,

  CLARIFICATION: `You previously analyzed a floor plan, but some areas were unclear. 
Here's what we found so far:
{existing_data}

Please focus on clarifying:
1. Ambiguous room boundaries
2. Unclear text or dimensions
3. Overlapping or conflicting information
4. Missing critical details

Provide clarifications and corrections in JSON format.`,

  VALIDATION: `Validate the following floor plan analysis against the image:
{existing_data}

Check for:
1. Accuracy of room identification
2. Correctness of dimensions
3. Proper feature detection
4. Any missed elements
5. Any misidentified elements

Provide validation results with confidence scores and corrections.`,

  DIMENSION_EXTRACTION: `Extract all dimensions and measurements from this floor plan image.
Focus on:
1. Room dimensions (width x height)
2. Overall floor plan dimensions
3. Door and window sizes
4. Any scale indicators
5. Square footage annotations

For each dimension found, provide:
- The exact text as shown
- The numeric value and unit
- What it refers to
- Confidence level

Respond in JSON format.`,

  ROOM_BOUNDARY: `Identify and describe the room boundaries in this floor plan region.
For each room:
1. Describe the boundary walls
2. Identify entry/exit points (doors)
3. Note any open connections to other spaces
4. Estimate relative size and proportions
5. Identify room type based on layout and fixtures

Focus on spatial relationships and connectivity.`,

  FIXTURE_IDENTIFICATION: `Identify all fixtures and appliances in this floor plan.
Categories:
- Bathroom: toilet, sink, bathtub, shower
- Kitchen: sink, stove, refrigerator, dishwasher, island
- HVAC: vents, radiators, AC units
- Electrical: outlets, switches, panels
- Plumbing: water heater, pipes
- Built-in: cabinets, closets, shelving

For each fixture, note its location and any visible specifications.`
};

export class GPTVisionService {
  private openai: OpenAI;
  private apiKey: string;
  private maxTokens: number = 4096;
  private temperature: number = 0.2; // Lower temperature for more consistent analysis
  private model: string = 'gpt-4-vision-preview';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for GPT Vision Service');
    }

    this.openai = new OpenAI({
      apiKey: this.apiKey
    });
  }

  /**
   * Main analysis method
   */
  async analyzeFloorPlan(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const startTime = Date.now();

    try {
      // Prepare image for API
      const imageBase64 = await this.prepareImage(request.imageBuffer, request.region);
      
      // Select appropriate prompt
      const prompt = this.buildPrompt(request);

      // Call GPT-4 Vision API
      console.log('🤖 Calling GPT-4 Vision API...');
      console.log('📋 Analysis Type:', request.analysisType);
      console.log('🖼️ Image Size:', imageBase64.length, 'bytes (base64)');
      console.log('💭 Prompt:', prompt.substring(0, 300) + '...');

      const response = await this.callVisionAPI(imageBase64, prompt);

      console.log('✨ GPT-4 Vision Response Received');
      console.log('📊 Response Length:', response.content?.length || 0, 'characters');
      console.log('🎯 Tokens Used:', response.tokens || 'unknown');

      // Parse response
      const parsedAnalysis = this.parseVisionResponse(response.content);

      // Post-process results
      const processedAnalysis = await this.postProcessAnalysis(
        parsedAnalysis,
        request.existingData
      );

      return {
        success: true,
        analysis: processedAnalysis,
        raw_response: response.content,
        tokens_used: response.tokens,
        processing_time: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ GPT Vision analysis failed:', error);
      
      return {
        success: false,
        analysis: {
          rooms: [],
          dimensions: [],
          features: [],
          unclear_areas: [],
          text_annotations: [],
          confidence_score: 0
        },
        raw_response: error instanceof Error ? error.message : 'Unknown error',
        tokens_used: 0,
        processing_time: Date.now() - startTime
      };
    }
  }

  /**
   * Analyze specific unclear areas
   */
  async analyzeUnclearAreas(
    imageBuffer: Buffer,
    unclearAreas: UnclearArea[]
  ): Promise<Map<UnclearArea, VisionAnalysisResult>> {
    const results = new Map<UnclearArea, VisionAnalysisResult>();

    for (const area of unclearAreas) {
      console.log(`🔍 Analyzing unclear area: ${area.issue}`);
      
      const result = await this.analyzeFloorPlan({
        imageBuffer,
        analysisType: 'region',
        region: {
          ...area.region,
          context: area.issue
        }
      });

      results.set(area, result);
    }

    return results;
  }

  /**
   * Validate existing analysis
   */
  async validateAnalysis(
    imageBuffer: Buffer,
    existingData: any
  ): Promise<{
    isValid: boolean;
    confidence: number;
    corrections: any[];
    missing: any[];
  }> {
    const result = await this.analyzeFloorPlan({
      imageBuffer,
      analysisType: 'validation',
      existingData
    });

    // Extract validation results
    const analysis = result.analysis;
    
    return {
      isValid: analysis.confidence_score > 0.8,
      confidence: analysis.confidence_score,
      corrections: this.extractCorrections(result.raw_response),
      missing: this.extractMissingElements(result.raw_response)
    };
  }

  /**
   * Prepare image for API
   */
  private async prepareImage(
    imageBuffer: Buffer,
    region?: any
  ): Promise<string> {
    let processedBuffer = imageBuffer;

    // Extract region if specified
    if (region) {
      processedBuffer = await sharp(imageBuffer)
        .extract({
          left: region.x,
          top: region.y,
          width: region.width,
          height: region.height
        })
        .toBuffer();
    }

    // Optimize image size for API (max 20MB)
    const metadata = await sharp(processedBuffer).metadata();
    const size = processedBuffer.length;

    if (size > 20 * 1024 * 1024) {
      // Resize if too large
      const scaleFactor = Math.sqrt((20 * 1024 * 1024) / size);
      processedBuffer = await sharp(processedBuffer)
        .resize({
          width: Math.floor((metadata.width || 1000) * scaleFactor),
          height: Math.floor((metadata.height || 1000) * scaleFactor),
          fit: 'inside'
        })
        .toBuffer();
    }

    // Convert to base64
    return processedBuffer.toString('base64');
  }

  /**
   * Build prompt based on request type
   */
  private buildPrompt(request: VisionAnalysisRequest): string {
    if (request.prompt) {
      return request.prompt;
    }

    switch (request.analysisType) {
      case 'full':
        return PROMPT_TEMPLATES.FULL_ANALYSIS;
      
      case 'region':
        return PROMPT_TEMPLATES.REGION_ANALYSIS.replace(
          '{context}',
          request.region?.context || 'No additional context provided'
        );
      
      case 'clarification':
        return PROMPT_TEMPLATES.CLARIFICATION.replace(
          '{existing_data}',
          JSON.stringify(request.existingData, null, 2)
        );
      
      case 'validation':
        return PROMPT_TEMPLATES.VALIDATION.replace(
          '{existing_data}',
          JSON.stringify(request.existingData, null, 2)
        );
      
      default:
        return PROMPT_TEMPLATES.FULL_ANALYSIS;
    }
  }

  /**
   * Call OpenAI Vision API
   */
  private async callVisionAPI(
    imageBase64: string,
    prompt: string
  ): Promise<{ content: string; tokens: number }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert architectural plan analyst with deep knowledge of floor plans, building codes, and spatial design. Provide accurate, detailed analysis in JSON format.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content || '{}';
      const tokens = response.usage?.total_tokens || 0;

      return { content, tokens };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  /**
   * Parse GPT Vision response
   */
  private parseVisionResponse(response: string): any {
    try {
      // Try to parse as JSON
      return JSON.parse(response);
    } catch (error) {
      // If not valid JSON, try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('Failed to parse JSON from response');
        }
      }
      
      // Return structured empty response
      return {
        rooms: [],
        dimensions: [],
        features: [],
        unclear_areas: [],
        text_annotations: [],
        overall_confidence: 0
      };
    }
  }

  /**
   * Post-process analysis results
   */
  private async postProcessAnalysis(
    analysis: any,
    existingData?: any
  ): Promise<any> {
    // Normalize room types
    if (analysis.rooms) {
      analysis.rooms = analysis.rooms.map((room: any) => ({
        ...room,
        type: this.normalizeRoomType(room.type),
        confidence: room.confidence || 0.5
      }));
    }

    // Parse dimensions
    if (analysis.dimensions) {
      analysis.dimensions = analysis.dimensions.map((dim: any) => ({
        ...dim,
        location: this.parseLocation(dim.location),
        unit: this.normalizeUnit(dim.unit)
      }));
    }

    // Merge with existing data if provided
    if (existingData) {
      analysis = this.mergeAnalysisData(analysis, existingData);
    }

    // Calculate overall confidence
    analysis.confidence_score = this.calculateOverallConfidence(analysis);

    return analysis;
  }

  /**
   * Specialized analysis methods
   */

  async extractDimensions(imageBuffer: Buffer): Promise<DimensionAnalysis[]> {
    const result = await this.analyzeFloorPlan({
      imageBuffer,
      analysisType: 'full',
      prompt: PROMPT_TEMPLATES.DIMENSION_EXTRACTION
    });

    return result.analysis.dimensions;
  }

  async identifyRoomBoundaries(
    imageBuffer: Buffer,
    region?: any
  ): Promise<RoomAnalysis[]> {
    const result = await this.analyzeFloorPlan({
      imageBuffer,
      analysisType: 'region',
      region,
      prompt: PROMPT_TEMPLATES.ROOM_BOUNDARY
    });

    return result.analysis.rooms;
  }

  async identifyFixtures(imageBuffer: Buffer): Promise<FeatureAnalysis[]> {
    const result = await this.analyzeFloorPlan({
      imageBuffer,
      analysisType: 'full',
      prompt: PROMPT_TEMPLATES.FIXTURE_IDENTIFICATION
    });

    return result.analysis.features.filter(f => 
      f.type === 'fixture' || f.type === 'appliance'
    );
  }

  /**
   * Interactive refinement
   */
  async refineAnalysis(
    imageBuffer: Buffer,
    previousAnalysis: VisionAnalysisResult,
    userFeedback: string
  ): Promise<VisionAnalysisResult> {
    const refinementPrompt = `
Previous analysis:
${JSON.stringify(previousAnalysis.analysis, null, 2)}

User feedback:
${userFeedback}

Please refine the analysis based on the user feedback. Focus on:
1. Correcting any misidentifications
2. Adding missing elements
3. Improving confidence scores
4. Clarifying ambiguous areas

Provide updated analysis in the same JSON format.`;

    return await this.analyzeFloorPlan({
      imageBuffer,
      analysisType: 'full',
      prompt: refinementPrompt,
      existingData: {
        rooms: [], // Previous analysis rooms need conversion to Room type
        text: previousAnalysis.analysis.text_annotations?.map(t => t.text).join(' '),
        dimensions: previousAnalysis.analysis.dimensions
      }
    });
  }

  /**
   * Batch analysis for multiple images
   */
  async batchAnalyze(
    images: Buffer[],
    analysisType: 'full' | 'region' | 'clarification' | 'validation' = 'full'
  ): Promise<VisionAnalysisResult[]> {
    const results: VisionAnalysisResult[] = [];
    
    // Process in parallel with rate limiting
    const batchSize = 3; // Process 3 images at a time
    
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(img => this.analyzeFloorPlan({
          imageBuffer: img,
          analysisType
        }))
      );
      results.push(...batchResults);
      
      // Rate limiting delay
      if (i + batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Helper methods
   */

  private normalizeRoomType(type: string): RoomType {
    const typeMap: Record<string, RoomType> = {
      'bedroom': RoomType.BEDROOM,
      'master bedroom': RoomType.MASTER_BEDROOM,
      'bathroom': RoomType.BATHROOM,
      'master bathroom': RoomType.MASTER_BATHROOM,
      'kitchen': RoomType.KITCHEN,
      'living room': RoomType.LIVING_ROOM,
      'dining room': RoomType.DINING_ROOM,
      'office': RoomType.OFFICE,
      'garage': RoomType.GARAGE,
      'closet': RoomType.CLOSET,
      'hallway': RoomType.HALLWAY,
      'laundry': RoomType.LAUNDRY_ROOM,
      'pantry': RoomType.PANTRY,
      'basement': RoomType.BASEMENT,
      'attic': RoomType.ATTIC
    };

    const normalized = type.toLowerCase().trim();
    return typeMap[normalized] || RoomType.UNIDENTIFIED;
  }

  private normalizeUnit(unit: string): 'feet' | 'meters' | 'inches' {
    const normalized = unit.toLowerCase().trim();
    
    if (normalized.includes('ft') || normalized.includes('feet') || normalized === "'") {
      return 'feet';
    } else if (normalized.includes('m') || normalized.includes('meter')) {
      return 'meters';
    } else if (normalized.includes('in') || normalized.includes('inch') || normalized === '"') {
      return 'inches';
    }
    
    return 'feet'; // default
  }

  private parseLocation(location: any): Point2D {
    if (typeof location === 'object' && location.x !== undefined && location.y !== undefined) {
      return location;
    }
    
    // If location is a string description, return center placeholder
    return { x: 0, y: 0 };
  }

  private mergeAnalysisData(newAnalysis: any, existingData: any): any {
    const merged = { ...newAnalysis };
    
    // Merge rooms
    if (existingData.rooms && newAnalysis.rooms) {
      merged.rooms = this.mergeRooms(existingData.rooms, newAnalysis.rooms);
    }
    
    // Merge dimensions
    if (existingData.dimensions && newAnalysis.dimensions) {
      merged.dimensions = [...existingData.dimensions, ...newAnalysis.dimensions];
    }
    
    return merged;
  }

  private mergeRooms(existing: any[], new_rooms: any[]): any[] {
    const merged = [...existing];
    
    for (const newRoom of new_rooms) {
      const existingIndex = merged.findIndex(r => 
        r.type === newRoom.type && 
        this.isSimilarLocation(r.location, newRoom.location)
      );
      
      if (existingIndex >= 0) {
        // Update confidence if new analysis is more confident
        if (newRoom.confidence > merged[existingIndex].confidence) {
          merged[existingIndex] = newRoom;
        }
      } else {
        merged.push(newRoom);
      }
    }
    
    return merged;
  }

  private isSimilarLocation(loc1: any, loc2: any): boolean {
    if (!loc1 || !loc2) return false;
    
    // Simple proximity check
    const distance = Math.sqrt(
      Math.pow(loc1.x - loc2.x, 2) + 
      Math.pow(loc1.y - loc2.y, 2)
    );
    
    return distance < 50; // Within 50 pixels
  }

  private calculateOverallConfidence(analysis: any): number {
    const confidences: number[] = [];
    
    if (analysis.rooms) {
      confidences.push(...analysis.rooms.map((r: any) => r.confidence || 0.5));
    }
    
    if (analysis.dimensions) {
      confidences.push(...analysis.dimensions.map((d: any) => d.confidence || 0.5));
    }
    
    if (analysis.features) {
      confidences.push(...analysis.features.map((f: any) => f.confidence || 0.5));
    }
    
    if (confidences.length === 0) return 0;
    
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  private extractCorrections(response: string): any[] {
    // Extract corrections from validation response
    const corrections = [];
    
    if (response.includes('correction') || response.includes('should be')) {
      // Parse corrections from response
      // This is simplified - real implementation would be more sophisticated
      corrections.push({
        type: 'correction',
        description: 'Extracted from GPT response'
      });
    }
    
    return corrections;
  }

  private extractMissingElements(response: string): any[] {
    // Extract missing elements from validation response
    const missing = [];
    
    if (response.includes('missing') || response.includes('not detected')) {
      missing.push({
        type: 'missing',
        description: 'Extracted from GPT response'
      });
    }
    
    return missing;
  }

  /**
   * Cost estimation
   */
  estimateCost(tokensUsed: number): number {
    // GPT-4 Vision pricing (as of 2024)
    const inputTokenCost = 0.01 / 1000; // $0.01 per 1K tokens
    const outputTokenCost = 0.03 / 1000; // $0.03 per 1K tokens
    
    // Rough estimate: 70% input, 30% output
    const inputTokens = tokensUsed * 0.7;
    const outputTokens = tokensUsed * 0.3;
    
    return (inputTokens * inputTokenCost) + (outputTokens * outputTokenCost);
  }
}

// Export singleton instance
export const gptVisionService = new GPTVisionService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { gptVisionService } from './services/ai/gpt-vision.service';

// Full floor plan analysis
const analysis = await gptVisionService.analyzeFloorPlan({
  imageBuffer: floorPlanBuffer,
  analysisType: 'full'
});

console.log(`Found ${analysis.analysis.rooms.length} rooms`);
console.log(`Confidence: ${(analysis.analysis.confidence_score * 100).toFixed(1)}%`);
console.log(`Tokens used: ${analysis.tokens_used}`);
console.log(`Cost: $${gptVisionService.estimateCost(analysis.tokens_used).toFixed(4)}`);

// Analyze unclear areas
const unclearAreas = analysis.analysis.unclear_areas;
if (unclearAreas.length > 0) {
  const clarifications = await gptVisionService.analyzeUnclearAreas(
    floorPlanBuffer,
    unclearAreas
  );
  
  for (const [area, result] of clarifications) {
    console.log(`Clarified: ${area.issue}`);
    console.log(`Result: ${result.analysis}`);
  }
}

// Validate existing analysis
const validation = await gptVisionService.validateAnalysis(
  floorPlanBuffer,
  existingAnalysisData
);

console.log(`Validation confidence: ${(validation.confidence * 100).toFixed(1)}%`);
console.log(`Corrections needed: ${validation.corrections.length}`);
console.log(`Missing elements: ${validation.missing.length}`);

// Extract specific information
const dimensions = await gptVisionService.extractDimensions(floorPlanBuffer);
const fixtures = await gptVisionService.identifyFixtures(floorPlanBuffer);

// Refine with user feedback
const refined = await gptVisionService.refineAnalysis(
  floorPlanBuffer,
  analysis,
  "The master bedroom is actually on the second floor, not the first"
);
*/