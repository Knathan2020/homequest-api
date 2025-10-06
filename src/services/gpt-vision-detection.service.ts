/**
 * GPT-4 Vision Floor Plan Detection Service
 * Uses OpenAI's GPT-4o Vision with structured JSON output
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

interface FloorPlanAnalysisSchema {
  walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    thickness: number;
    type: 'interior' | 'exterior' | 'load-bearing' | 'partition';
    confidence: number;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    type: string;
    vertices: Array<{ x: number; y: number }>;
    area: number;
    confidence: number;
  }>;
  doors: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    orientation: 'horizontal' | 'vertical';
    confidence: number;
  }>;
  windows: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    confidence: number;
  }>;
  measurements: {
    scale: number;
    unit: string;
    imageWidth: number;
    imageHeight: number;
  };
  metadata: {
    confidence: number;
    detectionMethod: string;
  };
}

export class GPTVisionDetectionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Detect floor plan features using GPT-4 Vision with structured output
   */
  async detectFloorPlan(imagePath: string): Promise<FloorPlanAnalysisSchema> {
    console.log('👁️ Starting GPT-4 Vision floor plan detection...');

    // Read and encode image as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = this.getMimeType(imagePath);
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    // Get image dimensions for coordinate system
    const sharp = require('sharp');
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert architectural floor plan analyzer. Analyze floor plan images and extract structural elements with precise coordinates.

COORDINATE SYSTEM:
- Origin (0,0) is at the TOP-LEFT corner
- X increases from left to right (0 to ${imageWidth})
- Y increases from top to bottom (0 to ${imageHeight})
- All coordinates must be within these bounds

DETECTION RULES:
- Walls: Identify all wall lines (thick black/dark lines). Include start/end coordinates.
- Rooms: Detect enclosed spaces. Provide polygon vertices in clockwise order.
- Doors: Find door symbols (arcs, swing marks). Mark center position.
- Windows: Find window symbols (parallel lines, rectangles). Mark center position.
- Measurements: Extract scale and unit from dimension text. If not visible, use scale: 1.0 and unit: "pixels".

Be precise with coordinates and conservative with confidence scores (0.0 to 1.0).`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this floor plan image and extract all architectural elements. The image dimensions are ${imageWidth}x${imageHeight} pixels. Return precise coordinates for all detected features.`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high"
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "floor_plan_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                walls: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      start: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" }
                        },
                        required: ["x", "y"],
                        additionalProperties: false
                      },
                      end: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" }
                        },
                        required: ["x", "y"],
                        additionalProperties: false
                      },
                      thickness: { type: "number" },
                      type: {
                        type: "string",
                        enum: ["interior", "exterior", "load-bearing", "partition"]
                      },
                      confidence: { type: "number" }
                    },
                    required: ["id", "start", "end", "thickness", "type", "confidence"],
                    additionalProperties: false
                  }
                },
                rooms: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string" },
                      vertices: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            x: { type: "number" },
                            y: { type: "number" }
                          },
                          required: ["x", "y"],
                          additionalProperties: false
                        }
                      },
                      area: { type: "number" },
                      confidence: { type: "number" }
                    },
                    required: ["id", "name", "type", "vertices", "area", "confidence"],
                    additionalProperties: false
                  }
                },
                doors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      position: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" }
                        },
                        required: ["x", "y"],
                        additionalProperties: false
                      },
                      width: { type: "number" },
                      orientation: {
                        type: "string",
                        enum: ["horizontal", "vertical"]
                      },
                      confidence: { type: "number" }
                    },
                    required: ["id", "position", "width", "orientation", "confidence"],
                    additionalProperties: false
                  }
                },
                windows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      position: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" }
                        },
                        required: ["x", "y"],
                        additionalProperties: false
                      },
                      width: { type: "number" },
                      height: { type: "number" },
                      confidence: { type: "number" }
                    },
                    required: ["id", "position", "width", "height", "confidence"],
                    additionalProperties: false
                  }
                },
                measurements: {
                  type: "object",
                  properties: {
                    scale: { type: "number" },
                    unit: { type: "string" },
                    imageWidth: { type: "number" },
                    imageHeight: { type: "number" }
                  },
                  required: ["scale", "unit", "imageWidth", "imageHeight"],
                  additionalProperties: false
                },
                metadata: {
                  type: "object",
                  properties: {
                    confidence: { type: "number" },
                    detectionMethod: { type: "string" }
                  },
                  required: ["confidence", "detectionMethod"],
                  additionalProperties: false
                }
              },
              required: ["walls", "rooms", "doors", "windows", "measurements", "metadata"],
              additionalProperties: false
            }
          }
        },
        temperature: 0.1,
        max_tokens: 4096
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT-4 Vision');
      }

      const result = JSON.parse(content) as FloorPlanAnalysisSchema;

      console.log(`✅ GPT-4 Vision detected: ${result.walls.length} walls, ${result.rooms.length} rooms, ${result.doors.length} doors, ${result.windows.length} windows`);
      console.log(`   Overall confidence: ${result.metadata.confidence}`);

      return result;

    } catch (error) {
      console.error('❌ GPT-4 Vision detection failed:', error);
      throw error;
    }
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'image/png';
  }
}

// Export singleton instance
export const gptVisionDetector = new GPTVisionDetectionService();
