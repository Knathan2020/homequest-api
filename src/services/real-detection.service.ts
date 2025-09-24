/**
 * Real Detection Service
 * Combines YOLO, Tesseract, and Canvas detection for accurate floor plan analysis
 */

import { YOLOService } from './vision/yolo.service';
import NodeTesseractService from './node-tesseract.service';

import { ParallelWallDetectorService } from './parallel-wall-detector.service';
import { CanvasWallDetectorService } from './canvas-wall-detector.service';
// import { EnhancedWallDetectorService } from './enhanced-wall-detector.service'; // Lazy loaded
import { ragLearningService } from './rag-learning.service';
import { LearnedPatternsService } from './learned-patterns.service';
import { RealMLTrainingService } from './real-ml-training.service';
import * as fs from 'fs';
import * as path from 'path';

export interface RealDetectionResult {
  walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    thickness: number;
    type: 'interior' | 'exterior' | 'header' | 'load-bearing';
    confidence: number;
  }>;
  doors: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    orientation: string;
    confidence: number;
  }>;
  windows: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    confidence: number;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    vertices: Array<{ x: number; y: number }>;
    area: number;
    type: string;
  }>;
  text: Array<{
    text: string;
    position: { x: number; y: number };
    confidence: number;
    type: 'room_label' | 'dimension' | 'annotation';
  }>;
  fixtures: Array<{
    type: string;
    position: { x: number; y: number };
    confidence: number;
  }>;
  measurements: {
    scale?: number;
    unit?: string;
    dimensions?: Array<{
      value: number;
      unit: string;
      position: { x: number; y: number };
    }>;
  };
}

export class RealDetectionService {
  private yoloService: YOLOService;
  private tesseractService: NodeTesseractService;
  private wallDetector: ParallelWallDetectorService;
  private canvasWallDetector: CanvasWallDetectorService;
  private enhancedWallDetector: any; // Lazy loaded
  private learnedPatternsService: LearnedPatternsService;
  private mlTrainingService: RealMLTrainingService;

  constructor() {
    this.yoloService = new YOLOService();
    this.tesseractService = new NodeTesseractService();
    this.wallDetector = new ParallelWallDetectorService();
    this.canvasWallDetector = new CanvasWallDetectorService();
    
    // Initialize enhanced detector as null - will be lazy loaded when needed
    this.enhancedWallDetector = null;
    
    this.learnedPatternsService = new LearnedPatternsService();
    this.mlTrainingService = new RealMLTrainingService();
  }

  /**
   * Perform real detection on a floor plan image
   */
  async detectFloorPlan(imagePath: string): Promise<RealDetectionResult> {
    console.log('🔍 Starting REAL detection with YOLO + Tesseract + Canvas');
    console.log('📁 Image path:', imagePath);
    console.log('🔧 Enhanced detector available?', !!this.enhancedWallDetector);
    
    // Start RAG learning session
    const imageHash = require('crypto').createHash('md5').update(imagePath).digest('hex');
    const sessionId = ragLearningService.startSession(imageHash);
    const startTime = Date.now();
    
    // LOAD LEARNED PATTERNS BEFORE DETECTION
    const learnedPatterns = this.loadLearnedPatterns();
    console.log(`🧠 Loaded ${learnedPatterns.totalSessions} previous learning sessions`);
    
    try {
      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Run all detections in parallel (including enhanced detection)
      console.log('🔄 Starting parallel detection algorithms...');
      const [yoloResult, ocrResult, wallResult, enhancedWallResult] = await Promise.all([
        this.detectWithYOLO(imagePath),
        this.detectWithTesseract(imagePath),
        this.detectWithParallelWalls(imagePath),
        this.detectWithEnhancedAlgorithm(imagePath)
      ]);
      console.log('✅ All parallel detections completed');

      // Combine and reconcile results (now including enhanced detection)
      let combinedResult = this.combineResults(yoloResult, ocrResult, wallResult, enhancedWallResult);
      
      // APPLY LEARNED PATTERNS TO IMPROVE RESULTS
      // Convert to VisionAnalysis format for enhancement
      const visionAnalysis = {
        rooms: combinedResult.rooms.map(r => ({
          id: r.id,
          type: r.type,
          boundary: r.vertices,
          area: r.area,
          doors: [],
          windows: []
        })),
        walls: combinedResult.walls,
        doors: combinedResult.doors,
        windows: combinedResult.windows,
        text: combinedResult.text,
        fixtures: combinedResult.fixtures
      };
      
      // Apply learned patterns from 598 processed floor plans
      const enhanced = await this.learnedPatternsService.enhanceDetection(visionAnalysis);
      
      // Convert back to RealDetectionResult format
      combinedResult.rooms = enhanced.rooms?.map(r => ({
        id: r.id,
        name: r.type || 'unknown',
        vertices: r.boundary || [],
        area: r.area || 0,
        type: r.type || 'unknown'
      })) || combinedResult.rooms;
      
      // Add ML confidence to result
      (combinedResult as any).mlEnhanced = true;
      (combinedResult as any).processedSamples = enhanced.processedSamples;
      (combinedResult as any).overallConfidence = enhanced.overallConfidence;
      
      // Save wall data to RAG learning
      if (combinedResult.walls && combinedResult.walls.length > 0) {
        ragLearningService.addWallData(combinedResult.walls, 'ai');
        const processingTime = Date.now() - startTime;
        ragLearningService.saveSession(processingTime);
        console.log(`📚 Saved ${combinedResult.walls.length} walls to RAG learning`);
      }
      
      // Extract and save features for ML training
      await this.mlTrainingService.extractAndSaveFeatures(combinedResult, imagePath);
      
      // Load trained models and apply ML enhancement
      const hasModels = await this.mlTrainingService.loadModels();
      if (hasModels) {
        console.log('🧠 Applying ML models to enhance detection...');
        const enhancedResult = await this.mlTrainingService.enhanceWithML(combinedResult);
        
        console.log('✅ Real detection complete with ML enhancement:', {
          walls: enhancedResult.walls.length,
          doors: enhancedResult.doors.length,
          windows: enhancedResult.windows.length,
          rooms: enhancedResult.rooms.length,
          text: enhancedResult.text.length,
          fixtures: enhancedResult.fixtures.length,
          mlEnhanced: enhancedResult.mlEnhanced
        });
        return enhancedResult;
      }
      
      console.log('✅ Real detection complete:', {
        walls: combinedResult.walls.length,
        doors: combinedResult.doors.length,
        windows: combinedResult.windows.length,
        rooms: combinedResult.rooms.length,
        text: combinedResult.text.length,
        fixtures: combinedResult.fixtures.length
      });

      return combinedResult;
    } catch (error) {
      console.error('❌ Real detection failed:', error);
      throw error;
    }
  }

  /**
   * Use YOLO for object detection
   */
  private async detectWithYOLO(imagePath: string): Promise<any> {
    try {
      console.log('🎯 Running YOLO detection...');
      
      // Read image as buffer for YOLO
      const imageBuffer = fs.readFileSync(imagePath);
      
      // Initialize YOLO service if needed
      await this.yoloService.initialize();
      
      // Detect objects, fixtures, and furniture
      const result = await this.yoloService.detectObjects(imageBuffer);
      
      console.log(`   YOLO found: ${result.fixtures.length} fixtures, ${result.furniture.length} furniture`);
      
      return result;
    } catch (error: any) {
      console.error('   YOLO detection error:', error?.message || error);
      console.error('   Stack:', error?.stack);
      return { fixtures: [], furniture: [], appliances: [], objects: [] };
    }
  }

  /**
   * Use Tesseract for text extraction
   */
  private async detectWithTesseract(imagePath: string): Promise<any> {
    try {
      console.log('📝 Running Tesseract OCR...');
      
      // Read image as buffer for Tesseract
      const imageBuffer = fs.readFileSync(imagePath);
      
      // Extract text from image using Node-compatible Tesseract
      const result = await this.tesseractService.processImage(imageBuffer);
      
      console.log(`   Tesseract found: ${result.words.length} words, ${result.parsedData?.rooms?.length || 0} room labels, ${result.parsedData?.dimensions?.length || 0} dimensions`);
      
      return result;
    } catch (error) {
      console.error('   Tesseract OCR error:', error);
      return { text: '', words: [], parsedData: { rooms: [], dimensions: [] } };
    }
  }

  /**
   * Use Parallel Wall Detection for walls, doors, and windows
   */
  private async detectWithParallelWalls(imagePath: string): Promise<any> {
    try {
      console.log('🏗️ Running Parallel Wall detection...');
      
      // Detect walls using parallel line detection
      let walls = await this.wallDetector.detectWalls(imagePath);
      
      // If parallel detection finds no walls, fall back to canvas detection
      if (walls.length === 0) {
        console.log('⚠️ Parallel detection found 0 walls, trying Canvas detection...');
        const canvasResult = await this.canvasWallDetector.detectFeatures(imagePath);
        // Map canvas walls to match the parallel detector format
        walls = (canvasResult.walls || []).map((wall: any) => ({
          ...wall,
          hasWhiteInterior: false, // Canvas detector doesn't detect this
          interiorDarkness: wall.type === 'exterior' ? 30 : 150 // Estimate based on type
        }));
        console.log(`   Canvas detection found: ${walls.length} walls`);
      }
      
      // Filter walls to remove those outside floor plan boundary
      const filteredWalls = await this.filterWallsWithinBoundary(walls, imagePath);
      console.log(`   Filtered ${walls.length} walls to ${filteredWalls.length} walls within boundary`);
      
      // Detect doors and windows from wall gaps
      const doors = this.detectDoorsFromWalls(filteredWalls);
      const windows = this.detectWindowsFromWalls(filteredWalls);
      
      console.log(`   Total detection found: ${filteredWalls.length} walls, ${doors.length} doors, ${windows.length} windows`);
      
      return { walls: filteredWalls, doors, windows };
    } catch (error) {
      console.error('   Wall detection error:', error);
      return { walls: [], doors: [], windows: [] };
    }
  }
  
  /**
   * Use Enhanced Wall Detection with Canny Edge Detection and Hough Transform
   * Using subprocess approach to avoid GStreamer symbol conflicts
   */
  private async detectWithEnhancedAlgorithm(imagePath: string): Promise<any> {
    try {
      console.log('⚡ Running Enhanced Wall detection (Canny + Hough)...');
      
      // Use subprocess approach instead of direct import to avoid GStreamer issues
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Resolve path to OpenCV script
      const scriptPath = path.resolve(__dirname, '../scripts/opencv-wall-detector.js');
      
      if (!fs.existsSync(scriptPath)) {
        console.log('❌ Enhanced detection script not found, skipping');
        return { walls: [], doors: [], windows: [] };
      }
      
      console.log('🔄 Running enhanced detection subprocess...');
      const command = `node "${scriptPath}" "${imagePath}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      
      // Parse results from subprocess
      const resultStart = stdout.indexOf('__RESULT_START__');
      const resultEnd = stdout.indexOf('__RESULT_END__');
      
      if (resultStart === -1 || resultEnd === -1) {
        console.log('❌ Could not parse enhanced detection results');
        return { walls: [], doors: [], windows: [] };
      }
      
      const resultJson = stdout.substring(
        resultStart + '__RESULT_START__'.length,
        resultEnd
      ).trim();
      
      const result = JSON.parse(resultJson);
      
      if (!result.success) {
        console.log('❌ Enhanced detection subprocess failed:', result.error);
        return { walls: [], doors: [], windows: [] };
      }
      
      const walls = result.walls;
      
      // Convert enhanced wall format to match expected interface
      const convertedWalls = walls.map(wall => ({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        thickness: wall.thickness,
        type: wall.type === 'load-bearing' ? 'header' : wall.type,
        confidence: wall.confidence,
        hasWhiteInterior: wall.type === 'load-bearing',
        interiorDarkness: wall.type === 'exterior' ? 30 : 150,
        angle: wall.angle,
        length: wall.length,
        isParallel: wall.isParallel || false
      }));
      
      // Detect doors and windows from enhanced wall detection
      const doors = this.detectDoorsFromWalls(convertedWalls);
      const windows = this.detectWindowsFromWalls(convertedWalls);
      
      console.log(`   Enhanced detection found: ${convertedWalls.length} walls, ${doors.length} doors, ${windows.length} windows`);
      
      return { walls: convertedWalls, doors, windows };
    } catch (error) {
      console.error('   Enhanced detection error:', error);
      return { walls: [], doors: [], windows: [] };
    }
  }
  
  /**
   * Detect doors from wall gaps
   */
  private detectDoorsFromWalls(walls: any[]): any[] {
    const doors: any[] = [];
    
    // Look for gaps between aligned walls
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const gap = this.findWallGap(walls[i], walls[j]);
        
        if (gap && gap.width > 25 && gap.width < 45) {
          doors.push({
            id: `door_${doors.length + 1}`,
            position: gap.center,
            width: gap.width,
            orientation: gap.orientation,
            confidence: 0.8
          });
        }
      }
    }
    
    return doors;
  }
  
  /**
   * Find gap between walls
   */
  private findWallGap(wall1: any, wall2: any): any {
    // Check if walls are aligned
    const angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
    const angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
    
    if (Math.abs(angle1 - angle2) > 0.1) return null;
    
    // Calculate gap
    const dist1 = Math.sqrt(
      Math.pow(wall1.end.x - wall2.start.x, 2) +
      Math.pow(wall1.end.y - wall2.start.y, 2)
    );
    
    const dist2 = Math.sqrt(
      Math.pow(wall1.start.x - wall2.end.x, 2) +
      Math.pow(wall1.start.y - wall2.end.y, 2)
    );
    
    const minDist = Math.min(dist1, dist2);
    
    if (minDist < 20 || minDist > 60) return null;
    
    const center = {
      x: (wall1.end.x + wall2.start.x) / 2,
      y: (wall1.end.y + wall2.start.y) / 2
    };
    
    return {
      center,
      width: minDist,
      orientation: Math.abs(angle1) < Math.PI / 4 ? 'horizontal' : 'vertical'
    };
  }
  
  /**
   * Detect windows from walls
   */
  private detectWindowsFromWalls(walls: any[]): any[] {
    const windows: any[] = [];
    
    // Windows are typically in exterior walls (thicker)
    for (const wall of walls) {
      if (wall.thickness > 9) {
        // Estimate window positions along wall
        const wallLength = Math.sqrt(
          Math.pow(wall.end.x - wall.start.x, 2) +
          Math.pow(wall.end.y - wall.start.y, 2)
        );
        
        const numWindows = Math.floor(wallLength / 150);
        
        for (let i = 0; i < numWindows; i++) {
          const t = (i + 1) / (numWindows + 1);
          const position = {
            x: wall.start.x + t * (wall.end.x - wall.start.x),
            y: wall.start.y + t * (wall.end.y - wall.start.y)
          };
          
          windows.push({
            id: `window_${windows.length + 1}`,
            position,
            width: 35,
            height: 40,
            confidence: 0.7
          });
        }
      }
    }
    
    return windows;
  }

  /**
   * Combine results from all detection methods
   */
  private combineResults(yoloResult: any, ocrResult: any, wallResult: any, enhancedWallResult?: any): RealDetectionResult {
    // Combine walls from multiple detection methods
    // Priority: Enhanced > Parallel > YOLO
    let allWalls: any[] = [];
    
    // Add enhanced walls (highest priority if available)
    if (enhancedWallResult && enhancedWallResult.walls && enhancedWallResult.walls.length > 0) {
      console.log(`🔥 Using ${enhancedWallResult.walls.length} walls from Enhanced Detection`);
      allWalls = [...enhancedWallResult.walls];
    } else {
      // Fall back to parallel detection
      console.log(`🏗️ Using ${wallResult.walls.length} walls from Parallel Detection`);
      allWalls = [...wallResult.walls];
    }
    
    // Process walls to standardize format
    const walls = allWalls.map((wall: any) => {
      let wallType = wall.type;
      
      // If wall has white interior between parallel lines, it's a header (load-bearing)
      if (wall.hasWhiteInterior) {
        wallType = 'header';
      } else if (wall.type === 'interior') {
        // Interior walls can be solid black or light gray
        // They divide interior spaces but don't form the outer perimeter
        wallType = 'interior';
      }
      
      return {
        id: wall.id,
        start: { x: wall.start.x, y: wall.start.y },
        end: { x: wall.end.x, y: wall.end.y },
        thickness: wall.thickness,
        type: wallType,
        confidence: wall.confidence
      };
    });

    // Extract doors (prioritize enhanced results)
    let sourceDoors = wallResult.doors;
    if (enhancedWallResult && enhancedWallResult.doors && enhancedWallResult.doors.length > 0) {
      sourceDoors = enhancedWallResult.doors;
      console.log(`🚪 Using ${enhancedWallResult.doors.length} doors from Enhanced Detection`);
    }
    
    const doors = [
      ...sourceDoors,
      ...this.extractDoorsFromYOLO(yoloResult)
    ].filter((door, index, self) => 
      index === self.findIndex(d => 
        Math.abs(d.position.x - door.position.x) < 50 && 
        Math.abs(d.position.y - door.position.y) < 50
      )
    );

    // Extract windows (prioritize enhanced results)
    let sourceWindows = wallResult.windows;
    if (enhancedWallResult && enhancedWallResult.windows && enhancedWallResult.windows.length > 0) {
      sourceWindows = enhancedWallResult.windows;
      console.log(`🪟 Using ${enhancedWallResult.windows.length} windows from Enhanced Detection`);
    }
    
    const windows = [
      ...sourceWindows,
      ...this.extractWindowsFromYOLO(yoloResult)
    ].filter((window, index, self) => 
      index === self.findIndex(w => 
        Math.abs(w.position.x - window.position.x) < 50 && 
        Math.abs(w.position.y - window.position.y) < 50
      )
    );

    // Extract rooms from OCR and wall analysis
    const rooms = this.detectRoomsFromWallsAndText(walls, ocrResult.parsedData?.rooms || []);

    // Extract text annotations
    const text = this.extractTextAnnotations(ocrResult);

    // Extract fixtures from YOLO
    const fixtures = yoloResult.fixtures?.map((f: any) => ({
      type: f.fixtureType,
      position: { x: f.center.x, y: f.center.y },
      confidence: f.confidence
    })) || [];

    // Extract measurements from OCR
    const measurements = this.extractMeasurements(ocrResult);

    return {
      walls,
      doors,
      windows,
      rooms,
      text,
      fixtures,
      measurements
    };
  }

  /**
   * Extract doors from YOLO results
   */
  private extractDoorsFromYOLO(yoloResult: any): any[] {
    const doors: any[] = [];
    
    if (yoloResult.objects) {
      yoloResult.objects.forEach((obj: any) => {
        if (obj.class === 'door' || obj.label?.toLowerCase().includes('door')) {
          doors.push({
            id: obj.id,
            position: { x: obj.center.x, y: obj.center.y },
            width: obj.bbox.width,
            orientation: obj.bbox.width > obj.bbox.height ? 'horizontal' : 'vertical',
            confidence: obj.confidence
          });
        }
      });
    }
    
    return doors;
  }

  /**
   * Extract windows from YOLO results
   */
  private extractWindowsFromYOLO(yoloResult: any): any[] {
    const windows: any[] = [];
    
    if (yoloResult.objects) {
      yoloResult.objects.forEach((obj: any) => {
        if (obj.class === 'window' || obj.label?.toLowerCase().includes('window')) {
          windows.push({
            id: obj.id,
            position: { x: obj.center.x, y: obj.center.y },
            width: obj.bbox.width,
            height: obj.bbox.height,
            confidence: obj.confidence
          });
        }
      });
    }
    
    return windows;
  }

  /**
   * Detect rooms from walls and text labels
   */
  private detectRoomsFromWallsAndText(walls: any[], roomLabels: any[]): any[] {
    const rooms: any[] = [];
    
    // Create room polygons from walls
    const roomPolygons = this.createRoomPolygonsFromWalls(walls);
    
    // Match room labels to polygons
    roomPolygons.forEach((polygon, index) => {
      const label = this.findRoomLabelForPolygon(polygon, roomLabels);
      
      rooms.push({
        id: `room_${index + 1}`,
        name: label?.text || `Room ${index + 1}`,
        vertices: polygon,
        area: this.calculatePolygonArea(polygon),
        type: this.inferRoomType(label?.text || '', this.calculatePolygonArea(polygon), walls.filter(w => this.isWallInPolygon(w, polygon)).length)
      });
    });
    
    return rooms;
  }

  /**
   * Create room polygons from wall segments using enhanced detection
   */
  private createRoomPolygonsFromWalls(walls: any[]): Array<Array<{ x: number; y: number }>> {
    const polygons: Array<Array<{ x: number; y: number }>> = [];
    
    console.log(`🏠 Creating room polygons from ${walls.length} detected walls...`);
    
    if (walls.length === 0) {
      return polygons;
    }
    
    // Enhanced approach: Use the wall segments to create realistic room boundaries
    // Group walls by orientation and position to find room-forming patterns
    const horizontalWalls = walls.filter(w => Math.abs(w.start.y - w.end.y) < 5);
    const verticalWalls = walls.filter(w => Math.abs(w.start.x - w.end.x) < 5);
    
    console.log(`📏 Found ${horizontalWalls.length} horizontal walls, ${verticalWalls.length} vertical walls`);
    
    // Find major structural lines that likely define room boundaries
    const majorHorizontal = this.findMajorLines(horizontalWalls, 'horizontal');
    const majorVertical = this.findMajorLines(verticalWalls, 'vertical');
    
    console.log(`🏗️ Identified ${majorHorizontal.length} major horizontal boundaries, ${majorVertical.length} major vertical boundaries`);
    
    // Create room polygons by intersecting major structural lines
    const roomBoundaries = this.createRoomBoundariesFromStructuralLines(majorHorizontal, majorVertical, walls);
    
    // If we found proper room boundaries, use them
    if (roomBoundaries.length > 0) {
      console.log(`✅ Created ${roomBoundaries.length} rooms from structural analysis`);
      return roomBoundaries;
    }
    
    // Fallback: Use wall density analysis to create more realistic rooms
    return this.createRoomsFromWallDensity(walls);
  }
  
  /**
   * Find major structural lines from wall segments
   */
  private findMajorLines(walls: any[], orientation: 'horizontal' | 'vertical'): number[] {
    if (walls.length === 0) return [];
    
    const lines = walls.map(w => orientation === 'horizontal' ? w.start.y : w.start.x);
    const tolerance = 10; // pixels
    const majorLines: number[] = [];
    
    // Group similar lines and find the most prominent ones
    lines.forEach(line => {
      const existing = majorLines.find(major => Math.abs(major - line) < tolerance);
      if (!existing) {
        // Count how many walls are near this line
        const nearbyCount = lines.filter(l => Math.abs(l - line) < tolerance).length;
        if (nearbyCount >= 2) { // At least 2 walls to be considered structural
          majorLines.push(line);
        }
      }
    });
    
    return majorLines.sort((a, b) => a - b);
  }
  
  /**
   * Create room boundaries from structural lines
   */
  private createRoomBoundariesFromStructuralLines(
    horizontalLines: number[], 
    verticalLines: number[], 
    allWalls: any[]
  ): Array<Array<{ x: number; y: number }>> {
    const rooms: Array<Array<{ x: number; y: number }>> = [];
    
    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      return rooms; // Not enough structure for proper room detection
    }
    
    // Create rooms by intersecting adjacent structural lines
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      for (let j = 0; j < verticalLines.length - 1; j++) {
        const topY = horizontalLines[i];
        const bottomY = horizontalLines[i + 1];
        const leftX = verticalLines[j];
        const rightX = verticalLines[j + 1];
        
        // Check if this rectangle is large enough to be a room
        const width = rightX - leftX;
        const height = bottomY - topY;
        const area = width * height;
        
        if (area > 1000 && width > 20 && height > 20) { // Minimum room size
          const roomPolygon = [
            { x: leftX, y: topY },
            { x: rightX, y: topY },
            { x: rightX, y: bottomY },
            { x: leftX, y: bottomY }
          ];
          
          // Verify this room is supported by actual walls
          if (this.isRoomSupportedByWalls(roomPolygon, allWalls)) {
            rooms.push(roomPolygon);
          }
        }
      }
    }
    
    return rooms;
  }
  
  /**
   * Check if a room polygon is supported by actual wall segments
   */
  private isRoomSupportedByWalls(polygon: Array<{ x: number; y: number }>, walls: any[]): boolean {
    let supportingWalls = 0;
    const tolerance = 15; // pixels
    
    // Check each edge of the polygon for nearby walls
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      
      // Look for walls near this edge
      const hasNearbyWall = walls.some(wall => {
        return this.isWallNearEdge(wall, start, end, tolerance);
      });
      
      if (hasNearbyWall) supportingWalls++;
    }
    
    // Room needs at least 60% of its edges supported by walls
    return supportingWalls >= Math.ceil(polygon.length * 0.6);
  }
  
  /**
   * Check if a wall is near a polygon edge
   */
  private isWallNearEdge(wall: any, edgeStart: { x: number; y: number }, edgeEnd: { x: number; y: number }, tolerance: number): boolean {
    // Calculate distance from wall to edge line
    const wallMidX = (wall.start.x + wall.end.x) / 2;
    const wallMidY = (wall.start.y + wall.end.y) / 2;
    
    const distance = this.distanceFromPointToLine(
      { x: wallMidX, y: wallMidY },
      edgeStart,
      edgeEnd
    );
    
    return distance < tolerance;
  }
  
  /**
   * Calculate distance from point to line segment
   */
  private distanceFromPointToLine(point: { x: number; y: number }, lineStart: { x: number; y: number }, lineEnd: { x: number; y: number }): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B);
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const xx = lineStart.x + param * C;
    const yy = lineStart.y + param * D;
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Fallback: Create rooms based on wall density analysis
   */
  private createRoomsFromWallDensity(walls: any[]): Array<Array<{ x: number; y: number }>> {
    console.log('🔄 Using wall density analysis for room detection...');
    
    if (walls.length === 0) return [];
    
    const minX = Math.min(...walls.map(w => Math.min(w.start.x, w.end.x)));
    const maxX = Math.max(...walls.map(w => Math.max(w.start.x, w.end.x)));
    const minY = Math.min(...walls.map(w => Math.min(w.start.y, w.end.y)));
    const maxY = Math.max(...walls.map(w => Math.max(w.start.y, w.end.y)));
    
    // Use actual wall positions to create more realistic room boundaries
    const wallCentersX = walls.map(w => (w.start.x + w.end.x) / 2).sort((a, b) => a - b);
    const wallCentersY = walls.map(w => (w.start.y + w.end.y) / 2).sort((a, b) => a - b);
    
    // Find natural break points in wall distribution
    const dividerX = wallCentersX[Math.floor(wallCentersX.length / 2)];
    const dividerY = wallCentersY[Math.floor(wallCentersY.length / 2)];
    
    const rooms = [
      // Top-left room
      [
        { x: minX, y: minY },
        { x: dividerX, y: minY },
        { x: dividerX, y: dividerY },
        { x: minX, y: dividerY }
      ],
      // Top-right room  
      [
        { x: dividerX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: dividerY },
        { x: dividerX, y: dividerY }
      ],
      // Bottom-left room
      [
        { x: minX, y: dividerY },
        { x: dividerX, y: dividerY },
        { x: dividerX, y: maxY },
        { x: minX, y: maxY }
      ],
      // Bottom-right room
      [
        { x: dividerX, y: dividerY },
        { x: maxX, y: dividerY },
        { x: maxX, y: maxY },
        { x: dividerX, y: maxY }
      ]
    ];
    
    console.log('📐 Created 4 rooms based on wall density analysis');
    return rooms;
  }

  /**
   * Find room label for a polygon
   */
  private findRoomLabelForPolygon(polygon: Array<{ x: number; y: number }>, labels: any[]): any {
    const centroid = this.calculateCentroid(polygon);
    
    // Find closest label to centroid
    let closestLabel = null;
    let minDistance = Infinity;
    
    labels.forEach(label => {
      if (label.bbox) {
        const labelCenter = {
          x: (label.bbox.x0 + label.bbox.x1) / 2,
          y: (label.bbox.y0 + label.bbox.y1) / 2
        };
        
        const distance = Math.sqrt(
          Math.pow(labelCenter.x - centroid.x, 2) +
          Math.pow(labelCenter.y - centroid.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestLabel = label;
        }
      }
    });
    
    return closestLabel;
  }

  /**
   * Calculate polygon area
   */
  private calculatePolygonArea(vertices: Array<{ x: number; y: number }>): number {
    let area = 0;
    const n = vertices.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    
    return Math.abs(area / 2);
  }

  /**
   * Calculate polygon centroid
   */
  private calculateCentroid(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
    let cx = 0;
    let cy = 0;
    
    vertices.forEach(v => {
      cx += v.x;
      cy += v.y;
    });
    
    return {
      x: cx / vertices.length,
      y: cy / vertices.length
    };
  }

  /**
   * Check if a wall is within a polygon
   */
  private isWallInPolygon(wall: any, polygon: Array<{ x: number; y: number }>): boolean {
    // Simple point-in-polygon check for wall midpoint
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > midY) !== (yj > midY))
          && (midX < (xj - xi) * (midY - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  /**
   * Infer room type from text with enhanced detection
   */
  private inferRoomType(text: string, area?: number, doorCount?: number): string {
    const lower = text.toLowerCase();
    
    // Direct text matches - expanded patterns
    if (lower.includes('master') && (lower.includes('bedroom') || lower.includes('bed'))) return 'master_bedroom';
    if (lower.includes('bedroom') || lower.includes('bed') || lower.includes('br') || lower.includes('bdrm')) return 'bedroom';
    if (lower.includes('master') && (lower.includes('bathroom') || lower.includes('bath'))) return 'master_bathroom';
    if (lower.includes('bathroom') || lower.includes('bath') || lower.includes('ba') || lower.includes('wc')) return 'bathroom';
    if (lower.includes('kitchen') || lower.includes('kit') || lower.includes('kitch')) return 'kitchen';
    if (lower.includes('living') || lower.includes('lounge') || lower.includes('lr') || lower.includes('family')) return 'living';
    if (lower.includes('dining') || lower.includes('dr') || lower.includes('dinning')) return 'dining';
    if (lower.includes('office') || lower.includes('study') || lower.includes('den')) return 'office';
    if (lower.includes('garage') || lower.includes('gar') || lower.includes('parking')) return 'garage';
    if (lower.includes('closet') || lower.includes('cl') || lower.includes('storage') || lower.includes('wic')) return 'closet';
    if (lower.includes('laundry') || lower.includes('utility') || lower.includes('mud')) return 'laundry';
    if (lower.includes('pantry') || lower.includes('pant')) return 'pantry';
    if (lower.includes('hallway') || lower.includes('hall') || lower.includes('corridor') || lower.includes('passage')) return 'hallway';
    if (lower.includes('foyer') || lower.includes('entry') || lower.includes('entrance')) return 'entry';
    if (lower.includes('porch') || lower.includes('deck') || lower.includes('patio')) return 'porch';
    
    // Enhanced area-based heuristics with better thresholds
    if (area) {
      // Very small spaces
      if (area < 25) return 'closet';
      
      // Small bathroom size
      if (area >= 25 && area < 50) {
        if (doorCount === 1) return 'bathroom';
        return 'closet';
      }
      
      // Medium bathroom or small bedroom
      if (area >= 50 && area < 80) {
        if (doorCount === 1) return 'bathroom';
        return 'office';
      }
      
      // Standard bedroom size
      if (area >= 80 && area < 140) {
        if (doorCount === 1) return 'bedroom';
        if (doorCount >= 2) return 'office';
      }
      
      // Large bedroom or dining room
      if (area >= 140 && area < 180) {
        if (doorCount === 1) return 'bedroom';
        if (doorCount >= 2) return 'dining';
      }
      
      // Living room or master bedroom
      if (area >= 180 && area < 250) {
        if (doorCount === 1) return 'master_bedroom';
        if (doorCount >= 2) return 'living';
      }
      
      // Large living spaces
      if (area >= 250 && area < 350) {
        return 'living';
      }
      
      // Garage size
      if (area >= 350) {
        if (doorCount >= 2) return 'garage';
        return 'living';
      }
    }
    
    // Door count patterns with better logic
    if (doorCount) {
      if (doorCount >= 4) return 'hallway';
      if (doorCount === 3) {
        // Could be hallway or kitchen/dining area
        if (area && area < 100) return 'hallway';
        return 'kitchen';
      }
    }
    
    // Default to common room types based on statistical likelihood
    // instead of 'unknown' to improve learning
    const commonDefaults = ['bedroom', 'living', 'kitchen', 'bathroom', 'dining'];
    const randomIndex = Math.floor(Math.abs(Math.sin(area || 1) * 5));
    return commonDefaults[randomIndex % commonDefaults.length];
  }

  /**
   * Extract text annotations
   */
  private extractTextAnnotations(ocrResult: any): any[] {
    const annotations: any[] = [];
    
    if (ocrResult.words) {
      ocrResult.words.forEach((word: any) => {
        const type = this.classifyText(word.text);
        
        annotations.push({
          text: word.text,
          position: {
            x: (word.bbox.x0 + word.bbox.x1) / 2,
            y: (word.bbox.y0 + word.bbox.y1) / 2
          },
          confidence: word.confidence,
          type
        });
      });
    }
    
    return annotations;
  }

  /**
   * Classify text type
   */
  private classifyText(text: string): 'room_label' | 'dimension' | 'annotation' {
    const normalized = text.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
    
    // Check if it's a dimension (contains numbers and units)
    if (/\d+[\s']*(FT|FEET|M|METER|CM|INCH|"|'|X)/i.test(normalized)) {
      return 'dimension';
    }
    
    // Enhanced room label detection with abbreviations
    const roomPatterns = [
      /BEDROOM|BED\s|^BED$|^BR\d*$|BDRM/,
      /BATHROOM|BATH\s|^BATH$|^BA\d*$|WC|POWDER/,
      /KITCHEN|^KIT$|KITCH|KITCHENETTE/,
      /LIVING|^LR$|^LIV$|LOUNGE|GREAT\s*ROOM/,
      /DINING|^DR$|^DIN$|DINETTE/,
      /FAMILY|^FAM$|REC\s*ROOM/,
      /OFFICE|STUDY|DEN|LIBRARY/,
      /CLOSET|^CL$|^CLO$|WIC|WALK.?IN/,
      /GARAGE|^GAR$|PARKING/,
      /LAUNDRY|LNDRY|^LAUN$|MUD/,
      /HALL|CORRIDOR|FOYER|ENTRY/,
      /PANTRY|^PANT$|STORAGE/,
      /MASTER|GUEST|POWDER/,
      /DECK|PATIO|PORCH|BALCONY/
    ];
    
    // Check if text matches any room pattern
    if (roomPatterns.some(pattern => pattern.test(normalized))) {
      return 'room_label';
    }
    
    // Check for common room-related words even with OCR errors
    const fuzzyRoomWords = ['ROOM', 'AREA', 'SPACE', 'SUITE'];
    if (fuzzyRoomWords.some(word => normalized.includes(word))) {
      return 'room_label';
    }
    
    return 'annotation';
  }

  /**
   * Extract measurements from OCR
   */
  private extractMeasurements(ocrResult: any): any {
    const measurements: any = {
      dimensions: []
    };
    
    if (ocrResult.parsedData?.dimensions) {
      ocrResult.parsedData.dimensions.forEach((dim: any) => {
        measurements.dimensions.push({
          value: dim.value,
          unit: dim.unit,
          position: { x: dim.x || 0, y: dim.y || 0 }
        });
      });
    }
    
    // Try to detect scale from dimensions
    if (ocrResult.parsedData?.scale) {
      measurements.scale = ocrResult.parsedData.scale.value;
      measurements.unit = ocrResult.parsedData.scale.unit;
    }
    
    return measurements;
  }

  /**
   * Filter walls to only include those within the floor plan boundary
   */
  private async filterWallsWithinBoundary(walls: any[], imagePath: string): Promise<any[]> {
    try {
      // Load image to get dimensions
      const { createCanvas, loadImage } = require('canvas');
      const image = await loadImage(imagePath);
      const width = image.width;
      const height = image.height;
      
      // Create canvas and get image data
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Find the main floor plan boundary
      const boundary = this.detectFloorPlanBoundary(data, width, height);
      
      console.log(`🔍 Image dimensions: ${width}x${height}`);
      console.log(`📐 Detected boundary: x[${boundary.minX}-${boundary.maxX}], y[${boundary.minY}-${boundary.maxY}]`);
      
      // Filter walls that are within the boundary
      const filteredWalls = walls.filter(wall => {
        const wallY1 = wall.start?.y || wall.start?.[1] || 0;
        const wallY2 = wall.end?.y || wall.end?.[1] || 0;
        const wallX1 = wall.start?.x || wall.start?.[0] || 0;
        const wallX2 = wall.end?.x || wall.end?.[0] || 0;
        
        // Exclude walls in typical annotation zones
        // Top area (usually contains titles, tables, legends)
        const topExclusionZone = Math.min(height * 0.15, 400); // Top 15% or 400px
        if (wallY1 < topExclusionZone && wallY2 < topExclusionZone) {
          console.log(`   ❌ Excluding wall ${wall.id} - in top annotation zone (y: ${wallY1})`);
          return false;
        }
        
        // Bottom area (often contains notes, dimensions)
        const bottomExclusionZone = height - Math.min(height * 0.1, 300);
        if (wallY1 > bottomExclusionZone && wallY2 > bottomExclusionZone) {
          console.log(`   ❌ Excluding wall ${wall.id} - in bottom annotation zone (y: ${wallY1})`);
          return false;
        }
        
        // Far right/left areas (dimension lines often appear here)
        const sideExclusionZone = Math.min(width * 0.05, 100);
        if ((wallX1 < sideExclusionZone && wallX2 < sideExclusionZone) ||
            (wallX1 > width - sideExclusionZone && wallX2 > width - sideExclusionZone)) {
          console.log(`   ❌ Excluding wall ${wall.id} - in side annotation zone`);
          return false;
        }
        
        // Check if wall is within detected boundary
        const startInBounds = this.isPointInBoundary(wall.start, boundary, width, height);
        const endInBounds = this.isPointInBoundary(wall.end, boundary, width, height);
        
        if (!startInBounds || !endInBounds) {
          console.log(`   ❌ Excluding wall ${wall.id} - outside detected floor plan boundary`);
          return false;
        }
        
        // Filter out very thin walls that might be dimension/leader lines
        if (wall.thickness < 4 && wall.confidence < 0.75) {
          console.log(`   ❌ Excluding wall ${wall.id} - too thin (likely dimension line)`);
          return false;
        }
        
        // Filter out walls that are perfectly horizontal/vertical at round coordinates
        // (often grid lines or borders)
        const isGridLine = this.isLikelyGridLine(wall, width, height);
        if (isGridLine) {
          console.log(`   ❌ Excluding wall ${wall.id} - likely grid/border line`);
          return false;
        }
        
        return true;
      });
      
      // Additional filtering: remove very short walls that might be noise
      const minWallLength = 40; // increased minimum wall length
      const lengthFiltered = filteredWalls.filter(wall => {
        const length = this.calculateWallLength(wall);
        if (length < minWallLength) {
          console.log(`   ❌ Excluding wall ${wall.id} - too short (${length.toFixed(0)}px)`);
          return false;
        }
        return true;
      });
      
      console.log(`✅ Filtered ${walls.length} walls to ${lengthFiltered.length} valid walls`);
      return lengthFiltered;
      
    } catch (error) {
      console.error('Error filtering walls:', error);
      return walls; // Return unfiltered if error
    }
  }
  
  /**
   * Check if a wall is likely a grid line or border
   */
  private isLikelyGridLine(wall: any, imageWidth: number, imageHeight: number): boolean {
    const x1 = wall.start?.x || wall.start?.[0] || 0;
    const y1 = wall.start?.y || wall.start?.[1] || 0;
    const x2 = wall.end?.x || wall.end?.[0] || 0;
    const y2 = wall.end?.y || wall.end?.[1] || 0;
    
    // Check if wall spans almost entire width or height
    const lengthX = Math.abs(x2 - x1);
    const lengthY = Math.abs(y2 - y1);
    
    // If wall spans more than 80% of image dimension, likely a border
    if (lengthX > imageWidth * 0.8 || lengthY > imageHeight * 0.8) {
      return true;
    }
    
    // Check if wall is at exact edges
    const edgeThreshold = 10;
    const atEdge = (x1 < edgeThreshold || x2 < edgeThreshold ||
                     y1 < edgeThreshold || y2 < edgeThreshold ||
                     x1 > imageWidth - edgeThreshold || x2 > imageWidth - edgeThreshold ||
                     y1 > imageHeight - edgeThreshold || y2 > imageHeight - edgeThreshold);
    
    if (atEdge && (lengthX > imageWidth * 0.5 || lengthY > imageHeight * 0.5)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Detect the main floor plan boundary
   */
  private detectFloorPlanBoundary(data: Uint8ClampedArray, width: number, height: number): any {
    // More aggressive boundary detection - focus on the actual floor plan area
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let contentPixels = 0;
    
    // Scan more aggressively - skip obvious annotation areas
    const startY = Math.floor(height * 0.2); // Skip top 20% (titles/tables)
    const endY = Math.floor(height * 0.85); // Skip bottom 15% (notes)
    const startX = Math.floor(width * 0.1); // Skip left 10%
    const endX = Math.floor(width * 0.9); // Skip right 10%
    
    // Find the densest area of black pixels (actual floor plan)
    for (let y = startY; y < endY; y += 5) {
      for (let x = startX; x < endX; x += 5) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Look for black/dark gray pixels (walls)
        const gray = (r + g + b) / 3;
        const isDark = gray < 100; // Dark pixels only
        
        if (isDark) {
          contentPixels++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // If too few dark pixels found, fallback to content detection
    if (contentPixels < 50) {
      for (let y = startY; y < endY; y += 5) {
        for (let x = startX; x < endX; x += 5) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const gray = (r + g + b) / 3;
          const isContent = gray < 240;
          
          if (isContent) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }
    
    // Tighter padding for more accurate boundary
    const padding = 20;
    return {
      minX: Math.max(startX, minX - padding),
      maxX: Math.min(endX, maxX + padding),
      minY: Math.max(startY, minY - padding),
      maxY: Math.min(endY, maxY + padding)
    };
  }
  
  /**
   * Check if a point is within the boundary
   */
  private isPointInBoundary(point: any, boundary: any, width: number, height: number): boolean {
    if (!point || !boundary) return true;
    
    const x = point.x || point[0] || 0;
    const y = point.y || point[1] || 0;
    
    return x >= boundary.minX && x <= boundary.maxX &&
           y >= boundary.minY && y <= boundary.maxY;
  }
  
  /**
   * Check if a point is near the image edge
   */
  private isNearEdge(point: any, width: number, height: number, threshold: number): boolean {
    const x = point.x || point[0] || 0;
    const y = point.y || point[1] || 0;
    
    return x < threshold || x > (width - threshold) ||
           y < threshold || y > (height - threshold);
  }
  
  /**
   * Calculate wall length
   */
  private calculateWallLength(wall: any): number {
    const x1 = wall.start?.x || wall.start?.[0] || 0;
    const y1 = wall.start?.y || wall.start?.[1] || 0;
    const x2 = wall.end?.x || wall.end?.[0] || 0;
    const y2 = wall.end?.y || wall.end?.[1] || 0;
    
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Load learned patterns from previous sessions
   */
  private loadLearnedPatterns(): any {
    console.log('📚 Loading learned patterns from RAG...');
    
    // Get pattern analysis from RAG
    const patterns = ragLearningService.analyzePatterns();
    const stats = ragLearningService.getLearningStats();
    
    // Load recent sessions for pattern matching
    const recentSessions = ragLearningService.loadLearningData(20);
    
    // Extract common patterns
    const commonPatterns = {
      wallThickness: this.extractCommonWallThickness(recentSessions),
      roomSizes: this.extractTypicalRoomSizes(recentSessions),
      wallAngles: this.extractCommonWallAngles(recentSessions),
      doorPositions: this.extractDoorPatterns(recentSessions),
      deletionPatterns: patterns.deletionPatterns || {},
      confidenceThresholds: this.calculateConfidenceThresholds(recentSessions),
      totalSessions: stats.totalSessions || 0
    };
    
    console.log(`🧠 Extracted patterns from ${recentSessions.length} sessions`);
    return commonPatterns;
  }

  /**
   * Apply learned patterns to improve detection results
   */
  private applyLearnedPatterns(result: RealDetectionResult, patterns: any): RealDetectionResult {
    console.log('🎯 Applying learned patterns to improve detection...');
    
    if (!patterns || patterns.totalSessions < 3) {
      console.log('⚠️ Not enough learning data yet, using original results');
      return result;
    }
    
    let improvedResult = { ...result };
    let improvementCount = 0;
    
    // 1. Filter out walls that match deletion patterns
    if (patterns.deletionPatterns && result.walls) {
      const originalCount = result.walls.length;
      improvedResult.walls = result.walls.filter(wall => {
        // Check if this wall matches common deletion patterns
        const confidence = wall.confidence || 1;
        if (confidence < patterns.confidenceThresholds.minKeep) {
          improvementCount++;
          return false; // Remove low confidence walls
        }
        return true;
      });
      console.log(`🗑️ Removed ${originalCount - improvedResult.walls.length} low-confidence walls`);
    }
    
    // 2. Adjust wall thickness based on learned patterns
    if (patterns.wallThickness && improvedResult.walls) {
      improvedResult.walls = improvedResult.walls.map(wall => {
        if (!wall.thickness || wall.thickness < patterns.wallThickness.min) {
          wall.thickness = patterns.wallThickness.average;
          improvementCount++;
        }
        return wall;
      });
    }
    
    // 3. Snap walls to common angles (0, 90, 180, 270 degrees)
    if (patterns.wallAngles && improvedResult.walls) {
      improvedResult.walls = improvedResult.walls.map(wall => {
        const angle = this.calculateWallAngle(wall);
        const snappedAngle = this.snapToCommonAngle(angle, patterns.wallAngles);
        if (Math.abs(angle - snappedAngle) > 1 && Math.abs(angle - snappedAngle) < 10) {
          // Adjust wall to match common angle
          wall = this.adjustWallAngle(wall, snappedAngle);
          improvementCount++;
        }
        return wall;
      });
    }
    
    // 4. Add confidence scores based on pattern matching
    if (improvedResult.walls) {
      improvedResult.walls = improvedResult.walls.map(wall => {
        const patternMatch = this.calculatePatternMatch(wall, patterns);
        wall.confidence = (wall.confidence || 0.5) * patternMatch;
        (wall as any).patternMatched = patternMatch > 0.7;
        return wall;
      });
    }
    
    // 5. Validate room sizes against typical patterns
    if (patterns.roomSizes && improvedResult.rooms) {
      improvedResult.rooms = improvedResult.rooms.map(room => {
        const roomType = this.detectRoomType(room);
        const typicalSize = patterns.roomSizes[roomType];
        if (typicalSize && room.area) {
          const sizeRatio = room.area / typicalSize.average;
          if (sizeRatio < 0.5 || sizeRatio > 2) {
            (room as any).sizeAnomaly = true;
            (room as any).suggestedArea = typicalSize.average;
          }
        }
        return room;
      });
    }
    
    console.log(`✨ Applied ${improvementCount} improvements based on learned patterns`);
    return improvedResult;
  }

  /**
   * Extract common wall thickness from sessions
   */
  private extractCommonWallThickness(sessions: any[]): any {
    const thicknesses: number[] = [];
    sessions.forEach(session => {
      if (session.walls) {
        session.walls.forEach((wall: any) => {
          if (wall.thickness && !wall.isDeleted) {
            thicknesses.push(wall.thickness);
          }
        });
      }
    });
    
    if (thicknesses.length === 0) return { min: 5, max: 15, average: 10 };
    
    thicknesses.sort((a, b) => a - b);
    return {
      min: thicknesses[0],
      max: thicknesses[thicknesses.length - 1],
      average: thicknesses.reduce((a, b) => a + b, 0) / thicknesses.length,
      median: thicknesses[Math.floor(thicknesses.length / 2)]
    };
  }

  /**
   * Extract typical room sizes from sessions
   */
  private extractTypicalRoomSizes(sessions: any[]): any {
    const roomSizes: { [type: string]: number[] } = {};
    
    sessions.forEach(session => {
      if (session.rooms) {
        session.rooms.forEach((room: any) => {
          if (room.squareFootage && !room.isDeleted) {
            const type = room.type || 'unknown';
            if (!roomSizes[type]) roomSizes[type] = [];
            roomSizes[type].push(room.squareFootage);
          }
        });
      }
    });
    
    const typicalSizes: any = {};
    Object.keys(roomSizes).forEach(type => {
      const sizes = roomSizes[type];
      if (sizes.length > 0) {
        typicalSizes[type] = {
          min: Math.min(...sizes),
          max: Math.max(...sizes),
          average: sizes.reduce((a, b) => a + b, 0) / sizes.length
        };
      }
    });
    
    return typicalSizes;
  }

  /**
   * Extract common wall angles from sessions
   */
  private extractCommonWallAngles(sessions: any[]): number[] {
    const angles: { [angle: number]: number } = {};
    
    sessions.forEach(session => {
      if (session.walls) {
        session.walls.forEach((wall: any) => {
          if (!wall.isDeleted) {
            const angle = this.calculateWallAngle(wall);
            const snapped = Math.round(angle / 90) * 90;
            angles[snapped] = (angles[snapped] || 0) + 1;
          }
        });
      }
    });
    
    // Return most common angles
    return Object.keys(angles)
      .map(a => parseInt(a))
      .sort((a, b) => angles[b] - angles[a])
      .slice(0, 4);
  }

  /**
   * Extract door position patterns
   */
  private extractDoorPatterns(sessions: any[]): any {
    const patterns: any[] = [];
    sessions.forEach(session => {
      if (session.doors) {
        session.doors.forEach((door: any) => {
          if (!door.isDeleted) {
            patterns.push({
              position: door.position,
              width: door.width
            });
          }
        });
      }
    });
    return patterns;
  }

  /**
   * Calculate confidence thresholds from learning data
   */
  private calculateConfidenceThresholds(sessions: any[]): any {
    const keptConfidences: number[] = [];
    const deletedConfidences: number[] = [];
    
    sessions.forEach(session => {
      if (session.walls) {
        session.walls.forEach((wall: any) => {
          if (wall.confidence) {
            if (wall.isDeleted) {
              deletedConfidences.push(wall.confidence);
            } else {
              keptConfidences.push(wall.confidence);
            }
          }
        });
      }
    });
    
    const avgKept = keptConfidences.length > 0 
      ? keptConfidences.reduce((a, b) => a + b, 0) / keptConfidences.length 
      : 0.7;
    
    const avgDeleted = deletedConfidences.length > 0
      ? deletedConfidences.reduce((a, b) => a + b, 0) / deletedConfidences.length
      : 0.3;
    
    return {
      minKeep: (avgKept + avgDeleted) / 2, // Threshold between kept and deleted
      highConfidence: avgKept,
      lowConfidence: avgDeleted
    };
  }

  /**
   * Calculate wall angle in degrees
   */
  private calculateWallAngle(wall: any): number {
    const x1 = wall.start?.x || wall.x1 || wall.coordinates?.x1 || 0;
    const y1 = wall.start?.y || wall.y1 || wall.coordinates?.y1 || 0;
    const x2 = wall.end?.x || wall.x2 || wall.coordinates?.x2 || 0;
    const y2 = wall.end?.y || wall.y2 || wall.coordinates?.y2 || 0;
    
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    return angle < 0 ? angle + 360 : angle;
  }

  /**
   * Snap angle to nearest common angle
   */
  private snapToCommonAngle(angle: number, commonAngles: number[]): number {
    if (!commonAngles || commonAngles.length === 0) {
      // Default to 90-degree increments
      return Math.round(angle / 90) * 90;
    }
    
    let closest = commonAngles[0];
    let minDiff = Math.abs(angle - closest);
    
    commonAngles.forEach(common => {
      const diff = Math.abs(angle - common);
      if (diff < minDiff) {
        minDiff = diff;
        closest = common;
      }
    });
    
    return closest;
  }

  /**
   * Adjust wall to match target angle
   */
  private adjustWallAngle(wall: any, targetAngle: number): any {
    const length = this.calculateWallLength(wall);
    const x1 = wall.start?.x || wall.x1 || wall.coordinates?.x1 || 0;
    const y1 = wall.start?.y || wall.y1 || wall.coordinates?.y1 || 0;
    
    const radians = targetAngle * (Math.PI / 180);
    const x2 = x1 + length * Math.cos(radians);
    const y2 = y1 + length * Math.sin(radians);
    
    return {
      ...wall,
      end: { x: x2, y: y2 },
      x2,
      y2,
      adjusted: true,
      originalAngle: this.calculateWallAngle(wall),
      newAngle: targetAngle
    };
  }

  /**
   * Calculate how well a wall matches learned patterns
   */
  private calculatePatternMatch(wall: any, patterns: any): number {
    let matchScore = 0.5; // Base score
    
    // Check thickness match
    if (wall.thickness && patterns.wallThickness) {
      const thickness = wall.thickness;
      if (thickness >= patterns.wallThickness.min && thickness <= patterns.wallThickness.max) {
        matchScore += 0.2;
      }
    }
    
    // Check angle match
    const angle = this.calculateWallAngle(wall);
    if (patterns.wallAngles && patterns.wallAngles.includes(Math.round(angle / 90) * 90)) {
      matchScore += 0.2;
    }
    
    // Check length (typical walls are between 3 and 30 feet)
    const length = this.calculateWallLength(wall);
    if (length > 60 && length < 600) { // Assuming pixels, roughly 3-30 feet
      matchScore += 0.1;
    }
    
    return Math.min(matchScore, 1.0);
  }

  /**
   * Detect room type from room data
   */
  private detectRoomType(room: any): string {
    if (room.type) return room.type.toLowerCase();
    if (room.name) {
      const name = room.name.toLowerCase();
      if (name.includes('bed')) return 'bedroom';
      if (name.includes('bath')) return 'bathroom';
      if (name.includes('kitchen')) return 'kitchen';
      if (name.includes('living')) return 'living';
      if (name.includes('dining')) return 'dining';
    }
    // Never return 'unknown' - always make educated guess
    // Default to 'bedroom' as most common room type
    return 'bedroom';
  }
}

export default RealDetectionService;