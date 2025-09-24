// ========================================
// CONFIDENCE SCORER SERVICE - confidence-scorer.ts
// Calculates accuracy scores for all extractions
// ========================================

import { Room, Wall, Door, Window, Point2D } from '../../types/floor-plan.types';
import { ConfidenceScore } from '../../types/processing.types';

interface ScoringMetrics {
  // OCR Metrics
  ocrConfidence: number;
  textClarity: number;
  characterRecognition: number;
  
  // Vision Metrics
  edgeDetection: number;
  contourCompleteness: number;
  lineDetection: number;
  
  // Object Detection Metrics
  objectDetection: number;
  boundingBoxAccuracy: number;
  classificationConfidence: number;
  
  // Geometric Metrics
  polygonClosure: number;
  dimensionConsistency: number;
  areaCalculation: number;
  
  // Semantic Metrics
  roomTypeAccuracy: number;
  layoutCoherence: number;
  featureConsistency: number;
  
  // Cross-validation Metrics
  modelAgreement: number;
  dataConsistency: number;
  validationScore: number;
}

interface ExtractedData {
  source: 'ocr' | 'vision' | 'yolo' | 'gpt' | 'manual';
  confidence: number;
  data: any;
  timestamp: Date;
  processingTime?: number;
}

interface ValidationRule {
  name: string;
  description: string;
  validate: (data: any) => number; // Returns score 0-1
  weight: number;
  critical?: boolean; // If true, low score significantly impacts overall
}

interface ConfidenceReport {
  overallScore: number;
  categoryScores: {
    ocr: number;
    vision: number;
    objectDetection: number;
    geometry: number;
    semantics: number;
    validation: number;
  };
  detailedMetrics: ScoringMetrics;
  issues: ConfidenceIssue[];
  recommendations: string[];
  reliabilityLevel: 'high' | 'medium' | 'low' | 'unreliable';
}

interface ConfidenceIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  affectedData: any;
  impact: number; // Impact on overall score (0-1)
}

export class ConfidenceScorer {
  private validationRules: Map<string, ValidationRule>;
  private weights: {
    ocr: number;
    vision: number;
    objectDetection: number;
    geometry: number;
    semantics: number;
    validation: number;
  };

  constructor() {
    this.weights = {
      ocr: 0.15,
      vision: 0.20,
      objectDetection: 0.20,
      geometry: 0.20,
      semantics: 0.15,
      validation: 0.10
    };

    this.validationRules = new Map();
    this.initializeValidationRules();
  }

  /**
   * Initialize validation rules
   */
  private initializeValidationRules(): void {
    // Dimension validation rules
    this.addValidationRule({
      name: 'dimension_format',
      description: 'Validates dimension format consistency',
      validate: (dimensions: any[]) => {
        if (!dimensions || dimensions.length === 0) return 0;
        
        const validFormats = dimensions.filter(d => 
          this.isValidDimensionFormat(d.value)
        ).length;
        
        return validFormats / dimensions.length;
      },
      weight: 0.8
    });

    this.addValidationRule({
      name: 'dimension_range',
      description: 'Validates dimensions are within reasonable ranges',
      validate: (dimensions: any[]) => {
        if (!dimensions || dimensions.length === 0) return 0;
        
        const reasonable = dimensions.filter(d => {
          const value = this.parseDimensionValue(d.value);
          return value > 0 && value < 1000; // Reasonable room size in feet
        }).length;
        
        return reasonable / dimensions.length;
      },
      weight: 0.9,
      critical: true
    });

    // Room validation rules
    this.addValidationRule({
      name: 'room_polygon_closure',
      description: 'Validates room polygons are closed',
      validate: (rooms: Room[]) => {
        if (!rooms || rooms.length === 0) return 0;
        
        const closed = rooms.filter(r => 
          r.polygon && this.isPolygonClosed(r.polygon.vertices)
        ).length;
        
        return closed / rooms.length;
      },
      weight: 1.0,
      critical: true
    });

    this.addValidationRule({
      name: 'room_area_consistency',
      description: 'Validates room area matches dimensions',
      validate: (rooms: Room[]) => {
        if (!rooms || rooms.length === 0) return 0;
        
        const consistent = rooms.filter(r => {
          if (!r.dimensions || !r.polygon?.area) return false;
          
          const calculatedArea = this.calculateAreaFromDimensions(r.dimensions);
          const difference = Math.abs(calculatedArea - r.polygon.area) / r.polygon.area;
          
          return difference < 0.1; // Within 10% tolerance
        }).length;
        
        return consistent / rooms.length;
      },
      weight: 0.7
    });

    // Wall validation rules
    this.addValidationRule({
      name: 'wall_connectivity',
      description: 'Validates walls are properly connected',
      validate: (walls: Wall[]) => {
        if (!walls || walls.length === 0) return 0;
        
        const connected = this.checkWallConnectivity(walls);
        return connected;
      },
      weight: 0.9
    });

    // Door/Window validation rules
    this.addValidationRule({
      name: 'opening_placement',
      description: 'Validates doors and windows are on walls',
      validate: (data: { walls: Wall[], doors: Door[], windows: Window[] }) => {
        if (!data.walls || data.walls.length === 0) return 0;
        
        const validDoors = data.doors?.filter(d => 
          this.isOpeningOnWall(d.position, data.walls)
        ).length || 0;
        
        const validWindows = data.windows?.filter(w => 
          this.isOpeningOnWall(w.position, data.walls)
        ).length || 0;
        
        const total = (data.doors?.length || 0) + (data.windows?.length || 0);
        if (total === 0) return 1;
        
        return (validDoors + validWindows) / total;
      },
      weight: 0.8
    });

    // Layout validation rules
    this.addValidationRule({
      name: 'layout_coherence',
      description: 'Validates overall layout makes sense',
      validate: (data: any) => {
        // Check for common layout patterns
        const hasEntrance = data.doors?.some((d: Door) => d.type === 'single' || d.type === 'double');
        const hasRooms = data.rooms?.length > 0;
        const roomsConnected = this.checkRoomConnectivity(data.rooms);
        
        let score = 0;
        if (hasEntrance) score += 0.3;
        if (hasRooms) score += 0.3;
        if (roomsConnected) score += 0.4;
        
        return score;
      },
      weight: 0.6
    });
  }

  /**
   * Calculate overall confidence score
   */
  async calculateConfidence(
    extractedData: ExtractedData[],
    processedData: any
  ): Promise<ConfidenceReport> {
    console.log('📊 Calculating confidence scores...');

    // Calculate metrics for each category
    const metrics = await this.calculateMetrics(extractedData, processedData);

    // Calculate category scores
    const categoryScores = this.calculateCategoryScores(metrics);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(categoryScores);

    // Identify issues
    const issues = this.identifyIssues(metrics, processedData);

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, metrics);

    // Determine reliability level
    const reliabilityLevel = this.determineReliabilityLevel(overallScore);

    return {
      overallScore,
      categoryScores,
      detailedMetrics: metrics,
      issues,
      recommendations,
      reliabilityLevel
    };
  }

  /**
   * Calculate detailed metrics
   */
  private async calculateMetrics(
    extractedData: ExtractedData[],
    processedData: any
  ): Promise<ScoringMetrics> {
    // OCR Metrics
    const ocrData = extractedData.filter(d => d.source === 'ocr');
    const ocrMetrics = this.calculateOCRMetrics(ocrData);

    // Vision Metrics
    const visionData = extractedData.filter(d => d.source === 'vision');
    const visionMetrics = this.calculateVisionMetrics(visionData);

    // Object Detection Metrics
    const objectData = extractedData.filter(d => d.source === 'yolo');
    const objectMetrics = this.calculateObjectMetrics(objectData);

    // Geometric Metrics
    const geometricMetrics = this.calculateGeometricMetrics(processedData);

    // Semantic Metrics
    const semanticMetrics = this.calculateSemanticMetrics(processedData);

    // Cross-validation Metrics
    const validationMetrics = this.calculateValidationMetrics(extractedData, processedData);

    return {
      // OCR
      ocrConfidence: ocrMetrics.confidence,
      textClarity: ocrMetrics.clarity,
      characterRecognition: ocrMetrics.recognition,
      
      // Vision
      edgeDetection: visionMetrics.edges,
      contourCompleteness: visionMetrics.contours,
      lineDetection: visionMetrics.lines,
      
      // Object Detection
      objectDetection: objectMetrics.detection,
      boundingBoxAccuracy: objectMetrics.bbox,
      classificationConfidence: objectMetrics.classification,
      
      // Geometry
      polygonClosure: geometricMetrics.closure,
      dimensionConsistency: geometricMetrics.consistency,
      areaCalculation: geometricMetrics.area,
      
      // Semantics
      roomTypeAccuracy: semanticMetrics.roomTypes,
      layoutCoherence: semanticMetrics.layout,
      featureConsistency: semanticMetrics.features,
      
      // Validation
      modelAgreement: validationMetrics.agreement,
      dataConsistency: validationMetrics.consistency,
      validationScore: validationMetrics.validation
    };
  }

  /**
   * Calculate OCR-specific metrics
   */
  private calculateOCRMetrics(ocrData: ExtractedData[]): any {
    if (ocrData.length === 0) {
      return { confidence: 0.5, clarity: 0.5, recognition: 0.5 };
    }

    const confidences = ocrData.map(d => d.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    // Estimate clarity based on confidence distribution
    const variance = this.calculateVariance(confidences);
    const clarity = 1 - Math.min(variance, 1);

    // Character recognition score (mock - would analyze actual OCR results)
    const recognition = avgConfidence * 0.9;

    return {
      confidence: avgConfidence,
      clarity,
      recognition
    };
  }

  /**
   * Calculate vision-specific metrics
   */
  private calculateVisionMetrics(visionData: ExtractedData[]): any {
    if (visionData.length === 0) {
      return { edges: 0.5, contours: 0.5, lines: 0.5 };
    }

    let edgeScore = 0.5;
    let contourScore = 0.5;
    let lineScore = 0.5;

    for (const data of visionData) {
      if (data.data.edges) {
        edgeScore = Math.max(edgeScore, data.confidence);
      }
      if (data.data.contours) {
        contourScore = Math.max(contourScore, data.confidence);
      }
      if (data.data.lines) {
        lineScore = Math.max(lineScore, data.confidence);
      }
    }

    return {
      edges: edgeScore,
      contours: contourScore,
      lines: lineScore
    };
  }

  /**
   * Calculate object detection metrics
   */
  private calculateObjectMetrics(objectData: ExtractedData[]): any {
    if (objectData.length === 0) {
      return { detection: 0.5, bbox: 0.5, classification: 0.5 };
    }

    const detectionScores: number[] = [];
    const bboxScores: number[] = [];
    const classificationScores: number[] = [];

    for (const data of objectData) {
      if (data.data.objects) {
        for (const obj of data.data.objects) {
          detectionScores.push(obj.confidence || 0.5);
          
          // Bounding box score based on aspect ratio reasonableness
          const bboxScore = this.evaluateBoundingBox(obj.bbox);
          bboxScores.push(bboxScore);
          
          classificationScores.push(obj.confidence || 0.5);
        }
      }
    }

    return {
      detection: this.calculateAverage(detectionScores, 0.5),
      bbox: this.calculateAverage(bboxScores, 0.5),
      classification: this.calculateAverage(classificationScores, 0.5)
    };
  }

  /**
   * Calculate geometric metrics
   */
  private calculateGeometricMetrics(processedData: any): any {
    const rooms = processedData.rooms || [];
    
    // Polygon closure
    const closureScores = rooms.map((r: Room) => 
      r.polygon ? (this.isPolygonClosed(r.polygon.vertices) ? 1 : 0) : 0
    );
    const closure = this.calculateAverage(closureScores, 0);

    // Dimension consistency
    const consistencyScores = rooms.map((r: Room) => 
      this.checkDimensionConsistency(r)
    );
    const consistency = this.calculateAverage(consistencyScores, 0.5);

    // Area calculation accuracy
    const areaScores = rooms.map((r: Room) => 
      this.checkAreaAccuracy(r)
    );
    const area = this.calculateAverage(areaScores, 0.5);

    return { closure, consistency, area };
  }

  /**
   * Calculate semantic metrics
   */
  private calculateSemanticMetrics(processedData: any): any {
    const rooms = processedData.rooms || [];
    
    // Room type accuracy (based on features matching type)
    const roomTypeScores = rooms.map((r: Room) => 
      this.evaluateRoomType(r)
    );
    const roomTypes = this.calculateAverage(roomTypeScores, 0.5);

    // Layout coherence
    const layout = this.evaluateLayoutCoherence(processedData);

    // Feature consistency
    const features = this.evaluateFeatureConsistency(processedData);

    return { roomTypes, layout, features };
  }

  /**
   * Calculate cross-validation metrics
   */
  private calculateValidationMetrics(
    extractedData: ExtractedData[],
    processedData: any
  ): any {
    // Model agreement
    const agreement = this.calculateModelAgreement(extractedData);

    // Data consistency
    const consistency = this.calculateDataConsistency(processedData);

    // Validation score
    const validation = this.runValidationRules(processedData);

    return { agreement, consistency, validation };
  }

  /**
   * Calculate category scores
   */
  private calculateCategoryScores(
    metrics: ScoringMetrics
  ): any {
    return {
      ocr: (metrics.ocrConfidence + metrics.textClarity + metrics.characterRecognition) / 3,
      vision: (metrics.edgeDetection + metrics.contourCompleteness + metrics.lineDetection) / 3,
      objectDetection: (metrics.objectDetection + metrics.boundingBoxAccuracy + metrics.classificationConfidence) / 3,
      geometry: (metrics.polygonClosure + metrics.dimensionConsistency + metrics.areaCalculation) / 3,
      semantics: (metrics.roomTypeAccuracy + metrics.layoutCoherence + metrics.featureConsistency) / 3,
      validation: (metrics.modelAgreement + metrics.dataConsistency + metrics.validationScore) / 3
    };
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(categoryScores: any): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [category, weight] of Object.entries(this.weights)) {
      weightedSum += categoryScores[category] * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Score individual extractions
   */
  scoreExtraction(extraction: ExtractedData): ConfidenceScore {
    const baseScore = extraction.confidence;
    
    // Apply source-specific adjustments
    const sourceMultiplier = this.getSourceMultiplier(extraction.source);
    
    // Apply data quality adjustments
    const qualityMultiplier = this.evaluateDataQuality(extraction.data);
    
    // Calculate final score
    const score = baseScore * sourceMultiplier * qualityMultiplier;

    return {
      overall: Math.min(Math.max(score, 0), 1),
      breakdown: {
        detection: extraction.source === 'vision' ? score : 0.5,
        classification: extraction.source === 'gpt' ? score : 0.5,
        measurement: score,
        extraction: extraction.source === 'ocr' ? score : 0.5
      },
      factors: [
        {
          name: 'source_type',
          value: sourceMultiplier,
          weight: 0.3,
          impact: 'positive'
        },
        {
          name: 'quality_multiplier',
          value: qualityMultiplier,
          weight: 0.7,
          impact: 'positive'
        }
      ]
    };
  }

  /**
   * Score room detection
   */
  scoreRoomDetection(room: Room): number {
    let score = 0.5; // Base score

    // Check polygon closure
    if (room.polygon && this.isPolygonClosed(room.polygon.vertices)) {
      score += 0.1;
    }

    // Check dimension presence
    if (room.dimensions) {
      score += 0.1;
    }

    // Check area calculation
    if (room.polygon.area && room.dimensions) {
      const calculatedArea = this.calculateAreaFromDimensions(room.dimensions);
      if (Math.abs(calculatedArea - room.polygon.area) / room.polygon.area < 0.1) {
        score += 0.1;
      }
    }

    // Check polygon completeness
    if (room.polygon.vertices && room.polygon.vertices.length >= 3) {
      score += 0.1;
    }

    // Check feature consistency
    if (this.checkRoomFeatureConsistency(room)) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Score dimension extraction
   */
  scoreDimensionExtraction(dimension: any): number {
    let score = 0.5;

    // Check format validity
    if (this.isValidDimensionFormat(dimension.value)) {
      score += 0.2;
    }

    // Check value reasonableness
    const value = this.parseDimensionValue(dimension.value);
    if (value > 0 && value < 1000) {
      score += 0.2;
    }

    // Check unit consistency
    if (dimension.unit && ['feet', 'meters', 'inches'].includes(dimension.unit)) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Compare multiple model results
   */
  compareModelResults(results: Map<string, any>): {
    agreement: number;
    conflicts: any[];
    consensus: any;
  } {
    const conflicts: any[] = [];
    let agreementScore = 0;

    // Compare room counts
    const roomCounts = Array.from(results.values()).map(r => r.rooms?.length || 0);
    const roomCountVariance = this.calculateVariance(roomCounts);
    agreementScore += (1 - Math.min(roomCountVariance / 10, 1)) * 0.3;

    // Compare room types
    const roomTypes = this.extractRoomTypes(results);
    const typeAgreement = this.calculateSetAgreement(roomTypes);
    agreementScore += typeAgreement * 0.3;

    // Compare dimensions
    const dimensions = this.extractDimensions(results);
    const dimAgreement = this.calculateDimensionAgreement(dimensions);
    agreementScore += dimAgreement * 0.4;

    // Identify conflicts
    for (const [model1, data1] of results) {
      for (const [model2, data2] of results) {
        if (model1 !== model2) {
          const modelConflicts = this.findConflicts(data1, data2);
          conflicts.push(...modelConflicts.map(c => ({
            ...c,
            models: [model1, model2]
          })));
        }
      }
    }

    // Build consensus
    const consensus = this.buildConsensus(results);

    return {
      agreement: agreementScore,
      conflicts: this.deduplicateConflicts(conflicts),
      consensus
    };
  }

  /**
   * Helper methods
   */

  private addValidationRule(rule: ValidationRule): void {
    this.validationRules.set(rule.name, rule);
  }

  private isValidDimensionFormat(value: string): boolean {
    // Check for common dimension formats
    const patterns = [
      /^\d+'\s*\d+"?$/,  // 12' 6"
      /^\d+\.\d+\s*(ft|m|in)?$/,  // 12.5 ft
      /^\d+x\d+$/,  // 12x10
      /^\d+\s*[xX×]\s*\d+/  // 12 x 10
    ];

    return patterns.some(p => p.test(value));
  }

  private parseDimensionValue(value: string): number {
    // Extract numeric value from dimension string
    const match = value.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private isPolygonClosed(polygon: Point2D[]): boolean {
    if (polygon.length < 3) return false;
    
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    
    const distance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + 
      Math.pow(last.y - first.y, 2)
    );
    
    return distance < 5; // Within 5 pixels
  }

  private calculateAreaFromDimensions(dimensions: any): number {
    if (!dimensions.width || !dimensions.height) return 0;
    
    const width = this.parseDimensionValue(dimensions.width);
    const height = this.parseDimensionValue(dimensions.height);
    
    return width * height;
  }

  private checkWallConnectivity(walls: Wall[]): number {
    if (walls.length === 0) return 0;
    
    let connectedCount = 0;
    
    for (const wall of walls) {
      const connected = walls.some(w => 
        w !== wall && this.wallsConnect(wall, w)
      );
      
      if (connected) connectedCount++;
    }
    
    return connectedCount / walls.length;
  }

  private wallsConnect(wall1: Wall, wall2: Wall): boolean {
    const threshold = 10; // pixels
    
    return (
      this.pointsClose(wall1.startPoint, wall2.startPoint, threshold) ||
      this.pointsClose(wall1.startPoint, wall2.endPoint, threshold) ||
      this.pointsClose(wall1.endPoint, wall2.startPoint, threshold) ||
      this.pointsClose(wall1.endPoint, wall2.endPoint, threshold)
    );
  }

  private pointsClose(p1: Point2D, p2: Point2D, threshold: number): boolean {
    const distance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + 
      Math.pow(p2.y - p1.y, 2)
    );
    
    return distance < threshold;
  }

  private isOpeningOnWall(position: Point2D, walls: Wall[]): boolean {
    for (const wall of walls) {
      const distance = this.pointToLineDistance(position, wall.startPoint, wall.endPoint);
      if (distance < wall.thickness) {
        return true;
      }
    }
    return false;
  }

  private pointToLineDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  private checkRoomConnectivity(rooms: Room[]): boolean {
    if (!rooms || rooms.length === 0) return false;
    
    // Check if rooms share walls or have doors between them
    for (const room of rooms) {
      const hasConnection = rooms.some(r => 
        r !== room && this.roomsConnect(room, r)
      );
      
      if (!hasConnection) return false;
    }
    
    return true;
  }

  private roomsConnect(room1: Room, room2: Room): boolean {
    // Check if rooms are connected via doors
    return room1.connectedRooms.some(conn => conn.roomId === room2.id) ||
           room2.connectedRooms.some(conn => conn.roomId === room1.id);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateAverage(values: number[], defaultValue: number): number {
    if (values.length === 0) return defaultValue;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private evaluateBoundingBox(bbox: any): number {
    if (!bbox) return 0;
    
    const aspectRatio = bbox.width / bbox.height;
    
    // Reasonable aspect ratios for floor plan objects
    if (aspectRatio > 0.1 && aspectRatio < 10) {
      return 0.9;
    } else if (aspectRatio > 0.05 && aspectRatio < 20) {
      return 0.7;
    }
    
    return 0.5;
  }

  private checkDimensionConsistency(room: Room): number {
    if (!room.dimensions || !room.polygon) return 0.5;
    
    // Check if dimensions match polygon bounds
    const bounds = this.getPolygonBounds(room.polygon.vertices);
    const width = this.parseDimensionValue(room.dimensions.width?.value.toString() || '0');
    const height = this.parseDimensionValue(room.dimensions.height?.value.toString() || '0');
    
    // Assuming some scale factor
    const scale = 10; // pixels per foot
    const expectedWidth = bounds.width / scale;
    const expectedHeight = bounds.height / scale;
    
    const widthDiff = Math.abs(width - expectedWidth) / expectedWidth;
    const heightDiff = Math.abs(height - expectedHeight) / expectedHeight;
    
    if (widthDiff < 0.2 && heightDiff < 0.2) {
      return 1;
    } else if (widthDiff < 0.4 && heightDiff < 0.4) {
      return 0.7;
    }
    
    return 0.4;
  }

  private getPolygonBounds(polygon: Point2D[]): any {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private checkAreaAccuracy(room: Room): number {
    if (!room.polygon.area || !room.dimensions) return 0.5;
    
    const calculatedArea = this.calculateAreaFromDimensions(room.dimensions);
    if (calculatedArea === 0) return 0.5;
    
    const difference = Math.abs(calculatedArea - room.polygon.area) / room.polygon.area;
    
    if (difference < 0.05) return 1;
    if (difference < 0.1) return 0.9;
    if (difference < 0.2) return 0.7;
    if (difference < 0.3) return 0.5;
    
    return 0.3;
  }

  private evaluateRoomType(room: Room): number {
    // Check if room features match its type
    // This is simplified - real implementation would be more sophisticated
    
    const typeFeatures: Record<string, string[]> = {
      'bathroom': ['toilet', 'sink', 'shower', 'bathtub'],
      'kitchen': ['sink', 'stove', 'refrigerator'],
      'bedroom': ['bed', 'closet'],
      'living_room': ['sofa', 'tv']
    };
    
    const expectedFeatures = typeFeatures[room.type] || [];
    if (expectedFeatures.length === 0) return 0.7;
    
    let matchCount = 0;
    for (const feature of expectedFeatures) {
      if (room.features.fixtures?.some((f: any) => f.type?.includes(feature))) {
        matchCount++;
      }
    }
    
    return matchCount / expectedFeatures.length;
  }

  private evaluateLayoutCoherence(data: any): number {
    let score = 0;
    
    // Check for entrance
    if (data.doors?.some((d: Door) => d.type === 'single' || d.type === 'double')) {
      score += 0.2;
    }
    
    // Check room connectivity
    if (this.checkRoomConnectivity(data.rooms)) {
      score += 0.3;
    }
    
    // Check for reasonable room count
    const roomCount = data.rooms?.length || 0;
    if (roomCount > 0 && roomCount < 20) {
      score += 0.2;
    }
    
    // Check for basic room types
    const hasBasicRooms = ['bathroom', 'kitchen', 'bedroom'].some(type =>
      data.rooms?.some((r: Room) => r.type === type)
    );
    if (hasBasicRooms) {
      score += 0.3;
    }
    
    return Math.min(score, 1);
  }

  private evaluateFeatureConsistency(data: any): number {
    // Check if features are consistently detected
    let consistencyScore = 0.7;
    
    // Check for duplicate features
    const features = [...(data.doors || []), ...(data.windows || [])];
    const duplicates = this.findDuplicateFeatures(features);
    
    if (duplicates.length > 0) {
      consistencyScore -= 0.1 * duplicates.length;
    }
    
    return Math.max(consistencyScore, 0);
  }

  private findDuplicateFeatures(features: any[]): any[] {
    const duplicates = [];
    
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        if (this.pointsClose(features[i].position, features[j].position, 10)) {
          duplicates.push([features[i], features[j]]);
        }
      }
    }
    
    return duplicates;
  }

  private calculateModelAgreement(extractedData: ExtractedData[]): number {
    if (extractedData.length < 2) return 1;
    
    const sourceGroups = new Map<string, ExtractedData[]>();
    
    for (const data of extractedData) {
      if (!sourceGroups.has(data.source)) {
        sourceGroups.set(data.source, []);
      }
      sourceGroups.get(data.source)!.push(data);
    }
    
    if (sourceGroups.size < 2) return 1;
    
    // Compare confidence levels between sources
    const avgConfidences = new Map<string, number>();
    for (const [source, data] of sourceGroups) {
      const avg = data.reduce((sum, d) => sum + d.confidence, 0) / data.length;
      avgConfidences.set(source, avg);
    }
    
    const confidenceValues = Array.from(avgConfidences.values());
    const variance = this.calculateVariance(confidenceValues);
    
    return 1 - Math.min(variance, 1);
  }

  private calculateDataConsistency(processedData: any): number {
    let consistencyScore = 1;
    
    // Check for data inconsistencies
    if (processedData.rooms) {
      // Check for overlapping rooms
      const overlaps = this.findOverlappingRooms(processedData.rooms);
      consistencyScore -= overlaps.length * 0.1;
    }
    
    return Math.max(consistencyScore, 0);
  }

  private findOverlappingRooms(rooms: Room[]): any[] {
    const overlaps = [];
    
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (this.roomsOverlap(rooms[i], rooms[j])) {
          overlaps.push([rooms[i], rooms[j]]);
        }
      }
    }
    
    return overlaps;
  }

  private roomsOverlap(room1: Room, room2: Room): boolean {
    if (!room1.polygon || !room2.polygon) return false;
    
    // Simplified overlap check
    const bounds1 = this.getPolygonBounds(room1.polygon.vertices);
    const bounds2 = this.getPolygonBounds(room2.polygon.vertices);
    
    return !(bounds1.x + bounds1.width < bounds2.x ||
             bounds2.x + bounds2.width < bounds1.x ||
             bounds1.y + bounds1.height < bounds2.y ||
             bounds2.y + bounds2.height < bounds1.y);
  }

  private runValidationRules(data: any): number {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const rule of this.validationRules.values()) {
      const score = rule.validate(data);
      totalScore += score * rule.weight;
      totalWeight += rule.weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private checkRoomFeatureConsistency(room: Room): boolean {
    // Simplified check
    return true;
  }

  private getSourceMultiplier(source: string): number {
    const multipliers: Record<string, number> = {
      'gpt': 0.95,
      'yolo': 0.9,
      'vision': 0.85,
      'ocr': 0.8,
      'manual': 1.0
    };
    
    return multipliers[source] || 0.7;
  }

  private evaluateDataQuality(data: any): number {
    // Simplified quality evaluation
    if (!data) return 0.5;
    
    let quality = 0.7;
    
    if (data.confidence !== undefined) {
      quality = data.confidence;
    }
    
    return quality;
  }

  private identifyIssues(metrics: ScoringMetrics, data: any): ConfidenceIssue[] {
    const issues: ConfidenceIssue[] = [];
    
    // Check for critical issues
    if (metrics.polygonClosure < 0.5) {
      issues.push({
        severity: 'critical',
        category: 'geometry',
        description: 'Room polygons are not properly closed',
        affectedData: data.rooms,
        impact: 0.3
      });
    }
    
    if (metrics.dimensionConsistency < 0.5) {
      issues.push({
        severity: 'warning',
        category: 'dimensions',
        description: 'Dimensions are inconsistent with room geometry',
        affectedData: data.dimensions,
        impact: 0.2
      });
    }
    
    if (metrics.modelAgreement < 0.6) {
      issues.push({
        severity: 'warning',
        category: 'validation',
        description: 'Low agreement between different models',
        affectedData: null,
        impact: 0.15
      });
    }
    
    return issues;
  }

  private generateRecommendations(issues: ConfidenceIssue[], metrics: ScoringMetrics): string[] {
    const recommendations: string[] = [];
    
    for (const issue of issues) {
      if (issue.severity === 'critical') {
        if (issue.category === 'geometry') {
          recommendations.push('Reprocess image with enhanced edge detection');
        } else if (issue.category === 'ocr') {
          recommendations.push('Improve image quality or use manual verification for text');
        }
      }
    }
    
    if (metrics.ocrConfidence < 0.6) {
      recommendations.push('Consider manual text verification for critical dimensions');
    }
    
    if (metrics.layoutCoherence < 0.5) {
      recommendations.push('Review room layout for logical connectivity');
    }
    
    return recommendations;
  }

  private determineReliabilityLevel(score: number): 'high' | 'medium' | 'low' | 'unreliable' {
    if (score >= 0.85) return 'high';
    if (score >= 0.7) return 'medium';
    if (score >= 0.5) return 'low';
    return 'unreliable';
  }

  private extractRoomTypes(results: Map<string, any>): Set<string>[] {
    const typeSets: Set<string>[] = [];
    
    for (const data of results.values()) {
      const types = new Set<string>();
      if (data.rooms) {
        for (const room of data.rooms) {
          types.add(room.type);
        }
      }
      typeSets.push(types);
    }
    
    return typeSets;
  }

  private calculateSetAgreement(sets: Set<string>[]): number {
    if (sets.length < 2) return 1;
    
    // Calculate Jaccard similarity
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const intersection = new Set([...sets[i]].filter(x => sets[j].has(x)));
        const union = new Set([...sets[i], ...sets[j]]);
        
        const similarity = intersection.size / union.size;
        totalSimilarity += similarity;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private extractDimensions(results: Map<string, any>): Map<string, any[]> {
    const dimensions = new Map<string, any[]>();
    
    for (const [model, data] of results) {
      dimensions.set(model, data.dimensions || []);
    }
    
    return dimensions;
  }

  private calculateDimensionAgreement(dimensions: Map<string, any[]>): number {
    // Simplified dimension agreement calculation
    return 0.7;
  }

  private findConflicts(data1: any, data2: any): any[] {
    const conflicts = [];
    
    // Compare room counts
    if (Math.abs((data1.rooms?.length || 0) - (data2.rooms?.length || 0)) > 2) {
      conflicts.push({
        type: 'room_count',
        value1: data1.rooms?.length,
        value2: data2.rooms?.length
      });
    }
    
    return conflicts;
  }

  private deduplicateConflicts(conflicts: any[]): any[] {
    // Simplified deduplication
    return conflicts;
  }

  private buildConsensus(results: Map<string, any>): any {
    // Build consensus from multiple model results
    const consensus: any = {
      rooms: [],
      dimensions: [],
      confidence: 0
    };
    
    // Aggregate results with weighted voting
    // Simplified implementation
    
    return consensus;
  }
}

// Export singleton instance
export const confidenceScorer = new ConfidenceScorer();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { confidenceScorer } from './services/ai/confidence-scorer';

// Calculate confidence for extracted data
const extractedData = [
  {
    source: 'ocr',
    confidence: 0.85,
    data: ocrResults,
    timestamp: new Date()
  },
  {
    source: 'vision',
    confidence: 0.78,
    data: visionResults,
    timestamp: new Date()
  },
  {
    source: 'yolo',
    confidence: 0.92,
    data: yoloResults,
    timestamp: new Date()
  }
];

const report = await confidenceScorer.calculateConfidence(
  extractedData,
  processedFloorPlan
);

console.log(`Overall Confidence: ${(report.overallScore * 100).toFixed(1)}%`);
console.log(`Reliability: ${report.reliabilityLevel}`);
console.log(`Issues Found: ${report.issues.length}`);

// Score individual extractions
const roomScore = confidenceScorer.scoreRoomDetection(room);
const dimScore = confidenceScorer.scoreDimensionExtraction(dimension);

// Compare model results
const modelResults = new Map([
  ['ocr', ocrData],
  ['vision', visionData],
  ['gpt', gptData]
]);

const comparison = confidenceScorer.compareModelResults(modelResults);
console.log(`Model Agreement: ${(comparison.agreement * 100).toFixed(1)}%`);
console.log(`Conflicts: ${comparison.conflicts.length}`);
*/