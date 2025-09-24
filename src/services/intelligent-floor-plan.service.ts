/**
 * Intelligent Floor Plan Analysis Service
 * Combines YOLO object detection, Tesseract OCR, and RAG for comprehensive analysis
 */

import * as tf from '@tensorflow/tfjs-node';
import * as Tesseract from 'tesseract.js';
import { createCanvas, loadImage } from 'canvas';
import secureRAGService from './secure-rag.service';
import persistenceService from './floor-plan-persistence.service';

interface DetectedObject {
  type: 'wall' | 'door' | 'window' | 'room' | 'fixture' | 'dimension' | 'text';
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  properties?: any;
}

interface ExtractedText {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  type?: 'room_label' | 'dimension' | 'note' | 'specification';
}

interface FloorPlanAnalysis {
  // Visual Detection (YOLO)
  objects: DetectedObject[];
  walls: Array<{
    type: 'interior' | 'exterior' | 'load-bearing';
    color: 'black' | 'grey' | 'pattern';
    thickness: number;
    length: number;
    coordinates: any;
  }>;
  rooms: Array<{
    id: string;
    label: string;
    area: number;
    perimeter: number;
    walls: string[];
    doors: string[];
    windows: string[];
  }>;
  
  // Text Extraction (Tesseract)
  extractedTexts: ExtractedText[];
  dimensions: { [key: string]: string };
  roomLabels: { [roomId: string]: string };
  specifications: string[];
  
  // Intelligent Analysis (RAG)
  analysis: {
    totalArea: number;
    roomCount: number;
    compliance: {
      ada: boolean;
      fireCode: boolean;
      buildingCode: boolean;
      issues: string[];
    };
    suggestions: string[];
    materials: Array<{
      item: string;
      quantity: number;
      unit: string;
    }>;
  };
  
  // Knowledge & Context
  knowledge: {
    buildingType: string;
    constructionMethod: string;
    estimatedCost?: number;
    timeline?: string;
  };
}

export class IntelligentFloorPlanService {
  private yoloModel: any;
  private tesseractWorker: Tesseract.Worker | null = null;
  private modelLoaded: boolean = false;

  constructor() {
    this.initializeServices();
  }

  /**
   * Initialize YOLO model and Tesseract
   */
  private async initializeServices() {
    try {
      // Initialize Tesseract worker
      this.tesseractWorker = await Tesseract.createWorker();
      await this.tesseractWorker.loadLanguage('eng');
      await this.tesseractWorker.initialize('eng');
      
      // Load YOLO model (using COCO-SSD as example)
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      this.yoloModel = await cocoSsd.load();
      this.modelLoaded = true;
      
      console.log('✅ Intelligent Floor Plan Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
    }
  }

  /**
   * Main analysis pipeline combining all services
   */
  async analyzeFloorPlan(
    imagePath: string,
    projectId?: string,
    options: {
      detectWalls?: boolean;
      extractText?: boolean;
      analyzeCompliance?: boolean;
      generateInsights?: boolean;
    } = {}
  ): Promise<FloorPlanAnalysis> {
    console.log('🧠 Starting intelligent floor plan analysis...');
    
    // Load and prepare image
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    // Step 1: YOLO Object Detection
    const detectedObjects = await this.detectObjects(canvas);
    const walls = await this.detectWalls(canvas, detectedObjects);
    const rooms = await this.identifyRooms(detectedObjects, walls);
    
    // Step 2: Tesseract OCR
    const extractedTexts = await this.extractText(imagePath);
    const { dimensions, roomLabels, specifications } = this.categorizeText(extractedTexts);
    
    // Step 3: Combine visual and text data
    const enrichedRooms = this.enrichRoomsWithText(rooms, roomLabels, dimensions);
    
    // Step 4: RAG-based intelligent analysis
    const analysis = await this.performIntelligentAnalysis({
      objects: detectedObjects,
      walls,
      rooms: enrichedRooms,
      texts: extractedTexts,
      specifications
    });
    
    // Step 5: Generate knowledge and insights
    const knowledge = await this.generateKnowledge(analysis, projectId);
    
    // Step 6: Auto-save results
    const result: FloorPlanAnalysis = {
      objects: detectedObjects,
      walls,
      rooms: enrichedRooms,
      extractedTexts,
      dimensions,
      roomLabels,
      specifications,
      analysis,
      knowledge
    };
    
    if (projectId) {
      await persistenceService.autoSaveDetection(
        projectId,
        imagePath,
        result,
        undefined
      );
    }
    
    return result;
  }

  /**
   * YOLO-based object detection
   */
  private async detectObjects(canvas: any): Promise<DetectedObject[]> {
    if (!this.modelLoaded || !this.yoloModel) {
      console.warn('⚠️ YOLO model not loaded, using fallback detection');
      return this.fallbackObjectDetection(canvas);
    }

    try {
      // Run YOLO detection
      const predictions = await this.yoloModel.detect(canvas);
      
      // Convert to our format and filter relevant objects
      const floorPlanObjects = predictions
        .filter((pred: any) => this.isFloorPlanObject(pred.class))
        .map((pred: any) => ({
          type: this.mapToFloorPlanType(pred.class),
          label: pred.class,
          confidence: pred.score,
          bbox: pred.bbox,
          properties: {}
        }));
      
      // Add custom detection for walls, doors, windows
      const customDetections = await this.detectFloorPlanSpecificObjects(canvas);
      
      return [...floorPlanObjects, ...customDetections];
    } catch (error) {
      console.error('❌ YOLO detection error:', error);
      return this.fallbackObjectDetection(canvas);
    }
  }

  /**
   * Detect walls with color classification
   */
  private async detectWalls(canvas: any, objects: DetectedObject[]): Promise<any[]> {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const walls = [];
    
    // Analyze pixels for wall detection
    for (let y = 0; y < canvas.height; y += 10) {
      for (let x = 0; x < canvas.width; x += 10) {
        const idx = (y * canvas.width + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        
        // Classify wall by color
        let wallType = null;
        let wallColor = null;
        
        if (r < 50 && g < 50 && b < 50) {
          // Black wall - typically exterior/load-bearing
          wallType = 'exterior';
          wallColor = 'black';
        } else if (r > 100 && r < 180 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
          // Grey wall - typically interior
          wallType = 'interior';
          wallColor = 'grey';
        } else if (this.hasPattern(imageData, x, y)) {
          // Pattern wall - special purpose
          wallType = 'load-bearing';
          wallColor = 'pattern';
        }
        
        if (wallType) {
          // Trace wall segment
          const segment = this.traceWallSegment(imageData, x, y, wallColor);
          if (segment) {
            walls.push({
              type: wallType,
              color: wallColor,
              thickness: segment.thickness,
              length: segment.length,
              coordinates: segment.coords
            });
          }
        }
      }
    }
    
    return this.mergeWallSegments(walls);
  }

  /**
   * OCR text extraction with categorization
   */
  private async extractText(imagePath: string): Promise<ExtractedText[]> {
    if (!this.tesseractWorker) {
      console.warn('⚠️ Tesseract not initialized');
      return [];
    }

    try {
      const { data } = await this.tesseractWorker.recognize(imagePath);
      
      return data.words.map(word => {
        const text = word.text.trim();
        const type = this.categorizeTextType(text);
        
        return {
          text,
          confidence: word.confidence,
          bbox: word.bbox,
          type
        };
      });
    } catch (error) {
      console.error('❌ OCR error:', error);
      return [];
    }
  }

  /**
   * Categorize extracted text
   */
  private categorizeText(texts: ExtractedText[]): {
    dimensions: { [key: string]: string };
    roomLabels: { [key: string]: string };
    specifications: string[];
  } {
    const dimensions: { [key: string]: string } = {};
    const roomLabels: { [key: string]: string } = {};
    const specifications: string[] = [];
    
    texts.forEach(text => {
      // Dimension pattern: 12' x 10' or 12'-6"
      if (/\d+['\s\-x]+\d+/.test(text.text)) {
        dimensions[`dim_${Object.keys(dimensions).length}`] = text.text;
      }
      // Room labels
      else if (this.isRoomLabel(text.text)) {
        roomLabels[`room_${Object.keys(roomLabels).length}`] = text.text;
      }
      // Specifications and notes
      else if (text.text.length > 10) {
        specifications.push(text.text);
      }
    });
    
    return { dimensions, roomLabels, specifications };
  }

  /**
   * Perform intelligent analysis using RAG
   */
  private async performIntelligentAnalysis(data: any): Promise<any> {
    // Prepare context for RAG
    const context = this.prepareRAGContext(data);
    
    // Query 1: Compliance check
    const complianceQuery = `Based on this floor plan analysis:
    ${context}
    Check for: ADA compliance, fire code compliance, building code compliance.
    List any issues found.`;
    
    const complianceResult = await secureRAGService.query({
      query: complianceQuery,
      includePublic: true,
      maxResults: 10
    });
    
    // Query 2: Material estimation
    const materialQuery = `Based on this floor plan with:
    - ${data.walls.length} walls totaling ${this.calculateTotalWallLength(data.walls)} linear feet
    - ${data.rooms.length} rooms totaling ${this.calculateTotalArea(data.rooms)} square feet
    Estimate required materials for construction.`;
    
    const materialResult = await secureRAGService.query({
      query: materialQuery,
      includePublic: true,
      maxResults: 5
    });
    
    // Query 3: Suggestions for improvement
    const suggestionQuery = `Analyze this floor plan layout and suggest improvements for:
    - Space efficiency
    - Natural lighting
    - Traffic flow
    - Modern building standards`;
    
    const suggestionResult = await secureRAGService.query({
      query: suggestionQuery,
      includePublic: true,
      maxResults: 5
    });
    
    // Parse and structure responses
    return {
      totalArea: this.calculateTotalArea(data.rooms),
      roomCount: data.rooms.length,
      compliance: this.parseComplianceResponse(complianceResult.answer),
      suggestions: this.parseSuggestions(suggestionResult.answer),
      materials: this.parseMaterials(materialResult.answer)
    };
  }

  /**
   * Generate knowledge insights
   */
  private async generateKnowledge(analysis: any, projectId?: string): Promise<any> {
    const query = `Based on a floor plan with ${analysis.roomCount} rooms and ${analysis.totalArea} sq ft:
    1. What building type is this likely?
    2. What construction method would be recommended?
    3. Estimated cost range?
    4. Typical construction timeline?`;
    
    const result = await secureRAGService.query({
      query,
      projectId,
      includePublic: true
    });
    
    return this.parseKnowledgeResponse(result.answer);
  }

  /**
   * Question answering about the floor plan
   */
  async askAboutFloorPlan(
    floorPlanId: string,
    question: string,
    projectId?: string
  ): Promise<{
    answer: string;
    confidence: number;
    sources: string[];
  }> {
    // Load saved floor plan analysis
    const savedAnalysis = await persistenceService.loadFloorPlan(floorPlanId);
    
    if (!savedAnalysis) {
      return {
        answer: 'Floor plan not found. Please analyze it first.',
        confidence: 0,
        sources: []
      };
    }
    
    // Prepare context from saved analysis
    const context = `
    Floor Plan Analysis:
    - Total Area: ${savedAnalysis.dimensions?.width * savedAnalysis.dimensions?.height || 0} sq ft
    - Rooms: ${savedAnalysis.rooms?.map((r: any) => r.label || 'Unnamed').join(', ')}
    - Walls: ${savedAnalysis.walls?.length} detected (${savedAnalysis.walls?.filter((w: any) => w.type === 'exterior').length} exterior, ${savedAnalysis.walls?.filter((w: any) => w.type === 'interior').length} interior)
    - Doors: ${savedAnalysis.doors?.length || 0}
    - Windows: ${savedAnalysis.windows?.length || 0}
    `;
    
    // Enhanced query with context
    const enhancedQuery = `${context}\n\nQuestion: ${question}`;
    
    const result = await secureRAGService.query({
      query: enhancedQuery,
      projectId,
      includePublic: true,
      maxResults: 10
    });
    
    return {
      answer: result.answer,
      confidence: result.sources.length > 0 ? 0.85 : 0.5,
      sources: result.sources.map(s => s.title)
    };
  }

  // Helper methods
  
  private isFloorPlanObject(className: string): boolean {
    const relevantClasses = ['door', 'window', 'sink', 'toilet', 'bed', 'couch', 'chair', 'table'];
    return relevantClasses.some(c => className.toLowerCase().includes(c));
  }
  
  private mapToFloorPlanType(className: string): any {
    const mapping: { [key: string]: string } = {
      'door': 'door',
      'window': 'window',
      'sink': 'fixture',
      'toilet': 'fixture',
      'bed': 'fixture',
      'couch': 'fixture',
      'table': 'fixture'
    };
    return mapping[className.toLowerCase()] || 'object';
  }
  
  private detectFloorPlanSpecificObjects(canvas: any): DetectedObject[] {
    // Custom detection logic for floor plan specific objects
    const objects: DetectedObject[] = [];
    
    // Add custom wall, door, window detection
    // This would use computer vision techniques specific to floor plans
    
    return objects;
  }
  
  private fallbackObjectDetection(canvas: any): DetectedObject[] {
    // Simple fallback detection when YOLO is not available
    return [
      {
        type: 'room',
        label: 'Detected Space',
        confidence: 0.5,
        bbox: { x: 0, y: 0, width: canvas.width, height: canvas.height }
      }
    ];
  }
  
  private hasPattern(imageData: any, x: number, y: number): boolean {
    // Check for repeating patterns indicating special wall types
    // Simplified pattern detection
    return false;
  }
  
  private traceWallSegment(imageData: any, startX: number, startY: number, color: string): any {
    // Trace continuous wall segment
    // Returns segment with thickness, length, and coordinates
    return {
      thickness: 10,
      length: 100,
      coords: { start: { x: startX, y: startY }, end: { x: startX + 100, y: startY } }
    };
  }
  
  private mergeWallSegments(walls: any[]): any[] {
    // Merge adjacent wall segments
    return walls;
  }
  
  private identifyRooms(objects: DetectedObject[], walls: any[]): any[] {
    // Identify rooms based on wall boundaries
    const rooms = [];
    // Room detection logic here
    return rooms;
  }
  
  private enrichRoomsWithText(rooms: any[], roomLabels: any, dimensions: any): any[] {
    // Combine visual room detection with OCR text
    return rooms.map((room, i) => ({
      ...room,
      label: roomLabels[`room_${i}`] || `Room ${i + 1}`,
      dimensions: dimensions[`dim_${i}`] || 'Unknown'
    }));
  }
  
  private isRoomLabel(text: string): boolean {
    const roomTypes = [
      'bedroom', 'bathroom', 'kitchen', 'living', 'dining', 
      'office', 'garage', 'closet', 'hall', 'foyer', 'laundry'
    ];
    return roomTypes.some(type => text.toLowerCase().includes(type));
  }
  
  private categorizeTextType(text: string): ExtractedText['type'] {
    if (/\d+['\s\-x]+\d+/.test(text)) return 'dimension';
    if (this.isRoomLabel(text)) return 'room_label';
    if (text.length > 20) return 'specification';
    return 'note';
  }
  
  private prepareRAGContext(data: any): string {
    return JSON.stringify({
      wallCount: data.walls.length,
      roomCount: data.rooms.length,
      totalWalls: data.walls.length,
      specifications: data.specifications
    }, null, 2);
  }
  
  private calculateTotalWallLength(walls: any[]): number {
    return walls.reduce((total, wall) => total + (wall.length || 0), 0);
  }
  
  private calculateTotalArea(rooms: any[]): number {
    return rooms.reduce((total, room) => total + (room.area || 0), 0);
  }
  
  private parseComplianceResponse(response: string): any {
    // Parse AI response for compliance information
    return {
      ada: response.includes('ADA compliant'),
      fireCode: response.includes('fire code compliant'),
      buildingCode: response.includes('building code compliant'),
      issues: response.match(/Issue: ([^\n]+)/g) || []
    };
  }
  
  private parseSuggestions(response: string): string[] {
    // Extract suggestions from AI response
    return response.split('\n').filter(line => line.trim().startsWith('-')).map(s => s.trim());
  }
  
  private parseMaterials(response: string): any[] {
    // Parse material estimates from AI response
    const materials = [];
    const lines = response.split('\n');
    lines.forEach(line => {
      const match = line.match(/(\d+)\s+(\w+)\s+of\s+([\w\s]+)/);
      if (match) {
        materials.push({
          item: match[3],
          quantity: parseInt(match[1]),
          unit: match[2]
        });
      }
    });
    return materials;
  }
  
  private parseKnowledgeResponse(response: string): any {
    // Parse knowledge insights from AI response
    return {
      buildingType: response.match(/building type[:\s]+([^\n]+)/i)?.[1] || 'Unknown',
      constructionMethod: response.match(/construction method[:\s]+([^\n]+)/i)?.[1] || 'Standard',
      estimatedCost: response.match(/\$[\d,]+/)?.[0] || undefined,
      timeline: response.match(/timeline[:\s]+([^\n]+)/i)?.[1] || undefined
    };
  }
}

export default new IntelligentFloorPlanService();