// ========================================
// AREA CALCULATOR SERVICE - area-calculator.ts
// Calculate square footage and room areas
// ========================================

import { Point2D, Room } from '../../types/floor-plan.types';
import { DimensionCalculator, LengthUnit, AreaUnit, UnitSystem } from './dimension-calculator';

interface AreaCalculation {
  value: number;
  unit: AreaUnit;
  formatted: string;
  system: UnitSystem;
  method: 'polygon' | 'dimensions' | 'estimated';
  confidence: number;
}

interface RoomAreaAnalysis {
  room: Room;
  grossArea: AreaCalculation;
  netArea: AreaCalculation;
  perimeter: number;
  dimensions: {
    length: number;
    width: number;
    unit: LengthUnit;
  };
  shape: 'rectangular' | 'L-shaped' | 'irregular' | 'circular';
  efficiency: number; // Ratio of net to gross area
}

interface FloorPlanSummary {
  totalArea: AreaCalculation;
  livingArea: AreaCalculation;
  roomBreakdown: Array<{
    type: string;
    count: number;
    totalArea: AreaCalculation;
    averageArea: AreaCalculation;
  }>;
  efficiency: number;
  statistics: {
    largestRoom: RoomAreaAnalysis;
    smallestRoom: RoomAreaAnalysis;
    averageRoomSize: AreaCalculation;
  };
}

interface VolumeCalculation {
  value: number;
  unit: 'cubic_feet' | 'cubic_meters';
  formatted: string;
  ceilingHeight: number;
  heightUnit: LengthUnit;
}

export class AreaCalculator {
  private dimensionCalculator: DimensionCalculator;
  private defaultAreaUnit: AreaUnit = AreaUnit.SQUARE_FEET;
  private precision: number = 1;

  constructor() {
    this.dimensionCalculator = new DimensionCalculator();
  }

  /**
   * Calculate area from polygon points
   */
  calculatePolygonArea(
    points: Point2D[],
    unit?: AreaUnit
  ): AreaCalculation {
    if (points.length < 3) {
      return {
        value: 0,
        unit: unit || this.defaultAreaUnit,
        formatted: '0',
        system: this.getAreaUnitSystem(unit || this.defaultAreaUnit),
        method: 'polygon',
        confidence: 0
      };
    }

    // Calculate pixel area using Shoelace formula
    let pixelArea = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pixelArea += points[i].x * points[j].y;
      pixelArea -= points[j].x * points[i].y;
    }

    pixelArea = Math.abs(pixelArea / 2);

    // Convert to real-world area
    const scale = this.dimensionCalculator.getScale();
    if (!scale) {
      throw new Error('Scale not set. Call setScale() on dimensionCalculator first');
    }

    // Convert pixel area to square units
    const areaInScaleUnits = pixelArea / (scale.pixelsPerUnit * scale.pixelsPerUnit);

    // Convert to target unit
    const targetUnit = unit || this.defaultAreaUnit;
    const convertedArea = this.convertAreaUnits(
      areaInScaleUnits,
      this.lengthToAreaUnit(scale.unit),
      targetUnit
    );

    return {
      value: convertedArea,
      unit: targetUnit,
      formatted: this.formatArea(convertedArea, targetUnit),
      system: this.getAreaUnitSystem(targetUnit),
      method: 'polygon',
      confidence: this.calculatePolygonConfidence(points)
    };
  }

  /**
   * Calculate area from dimensions
   */
  calculateAreaFromDimensions(
    width: number,
    height: number,
    unit: LengthUnit,
    targetAreaUnit?: AreaUnit
  ): AreaCalculation {
    const area = width * height;
    const sourceAreaUnit = this.lengthToAreaUnit(unit);
    const targetUnit = targetAreaUnit || this.defaultAreaUnit;

    const convertedArea = this.dimensionCalculator.convertArea(
      area,
      sourceAreaUnit,
      targetUnit
    );

    return {
      value: convertedArea,
      unit: targetUnit,
      formatted: this.formatArea(convertedArea, targetUnit),
      system: this.getAreaUnitSystem(targetUnit),
      method: 'dimensions',
      confidence: 0.95
    };
  }

  /**
   * Calculate room area with analysis
   */
  analyzeRoomArea(room: Room): RoomAreaAnalysis {
    // Calculate gross area from polygon
    let grossArea: AreaCalculation;
    
    if (room.polygon && room.polygon.vertices && room.polygon.vertices.length >= 3) {
      grossArea = this.calculatePolygonArea(room.polygon.vertices);
    } else if (room.dimensions) {
      // Parse dimensions
      const width = this.parseDimension(room.dimensions.width.value.toString());
      const height = this.parseDimension(room.dimensions.height.value.toString());
      
      grossArea = this.calculateAreaFromDimensions(
        width.value,
        height.value,
        width.unit
      );
    } else if (room.polygon?.area) {
      // Use provided area
      grossArea = {
        value: room.polygon.area,
        unit: AreaUnit.SQUARE_FEET,
        formatted: this.formatArea(room.polygon.area, AreaUnit.SQUARE_FEET),
        system: UnitSystem.IMPERIAL,
        method: 'estimated',
        confidence: 0.7
      };
    } else {
      // No area information available
      grossArea = {
        value: 0,
        unit: this.defaultAreaUnit,
        formatted: '0',
        system: UnitSystem.IMPERIAL,
        method: 'estimated',
        confidence: 0
      };
    }

    // Calculate net area (subtract wall thickness)
    const netArea = this.calculateNetArea(room, grossArea);

    // Calculate perimeter
    const perimeter = room.polygon ? 
      this.calculatePerimeter(room.polygon.vertices) : 
      this.estimatePerimeter(grossArea.value, grossArea.unit);

    // Determine room dimensions and shape
    const dimensions = this.extractRoomDimensions(room, grossArea);
    const shape = this.determineRoomShape(room.polygon?.vertices || []);

    // Calculate efficiency
    const efficiency = grossArea.value > 0 ? netArea.value / grossArea.value : 0;

    return {
      room,
      grossArea,
      netArea,
      perimeter,
      dimensions,
      shape,
      efficiency
    };
  }

  /**
   * Calculate total floor plan area and statistics
   */
  calculateFloorPlanSummary(rooms: Room[]): FloorPlanSummary {
    const roomAnalyses = rooms.map(room => this.analyzeRoomArea(room));

    // Calculate total area
    const totalAreaValue = roomAnalyses.reduce(
      (sum, analysis) => sum + analysis.grossArea.value,
      0
    );

    const totalArea: AreaCalculation = {
      value: totalAreaValue,
      unit: this.defaultAreaUnit,
      formatted: this.formatArea(totalAreaValue, this.defaultAreaUnit),
      system: this.getAreaUnitSystem(this.defaultAreaUnit),
      method: 'polygon',
      confidence: this.calculateAverageConfidence(roomAnalyses)
    };

    // Calculate living area (exclude garage, storage, etc.)
    const livingRooms = roomAnalyses.filter(a => 
      !['garage', 'storage', 'utility', 'mechanical'].includes(a.room.type.toLowerCase())
    );

    const livingAreaValue = livingRooms.reduce(
      (sum, analysis) => sum + analysis.netArea.value,
      0
    );

    const livingArea: AreaCalculation = {
      value: livingAreaValue,
      unit: this.defaultAreaUnit,
      formatted: this.formatArea(livingAreaValue, this.defaultAreaUnit),
      system: this.getAreaUnitSystem(this.defaultAreaUnit),
      method: 'polygon',
      confidence: this.calculateAverageConfidence(livingRooms)
    };

    // Group rooms by type
    const roomBreakdown = this.calculateRoomBreakdown(roomAnalyses);

    // Calculate statistics
    const statistics = this.calculateStatistics(roomAnalyses);

    // Calculate overall efficiency
    const efficiency = totalAreaValue > 0 ? livingAreaValue / totalAreaValue : 0;

    return {
      totalArea,
      livingArea,
      roomBreakdown,
      efficiency,
      statistics
    };
  }

  /**
   * Calculate volume from area and ceiling height
   */
  calculateVolume(
    area: AreaCalculation,
    ceilingHeight: number,
    heightUnit: LengthUnit = LengthUnit.FEET
  ): VolumeCalculation {
    // Convert area to square feet
    const areaInSqFt = this.dimensionCalculator.convertArea(
      area.value,
      area.unit,
      AreaUnit.SQUARE_FEET
    );

    // Convert height to feet
    const heightInFeet = this.dimensionCalculator.convertLength(
      ceilingHeight,
      heightUnit,
      LengthUnit.FEET
    );

    const volumeInCubicFeet = areaInSqFt * heightInFeet;

    // Determine output unit based on area system
    const isMetric = area.system === UnitSystem.METRIC;
    
    if (isMetric) {
      const volumeInCubicMeters = volumeInCubicFeet * 0.0283168;
      return {
        value: volumeInCubicMeters,
        unit: 'cubic_meters',
        formatted: `${volumeInCubicMeters.toFixed(1)} m³`,
        ceilingHeight,
        heightUnit
      };
    } else {
      return {
        value: volumeInCubicFeet,
        unit: 'cubic_feet',
        formatted: `${volumeInCubicFeet.toFixed(0)} ft³`,
        ceilingHeight,
        heightUnit
      };
    }
  }

  /**
   * Calculate usable area (subtract closets, etc.)
   */
  calculateUsableArea(
    room: Room,
    excludeFeatures?: string[]
  ): AreaCalculation {
    const totalArea = this.analyzeRoomArea(room).netArea;
    
    if (!excludeFeatures || excludeFeatures.length === 0) {
      return totalArea;
    }

    let excludedArea = 0;
    const featuresToExclude = excludeFeatures || ['closet', 'pantry', 'storage'];

    // Estimate area of features to exclude
    if (room.features?.fixtures) {
      for (const fixture of room.features.fixtures) {
        if (featuresToExclude.some(f => fixture.type.toLowerCase().includes(f))) {
          // Estimate fixture area (simplified)
          excludedArea += this.estimateFixtureArea(fixture);
        }
      }
    }

    const usableAreaValue = Math.max(0, totalArea.value - excludedArea);

    return {
      value: usableAreaValue,
      unit: totalArea.unit,
      formatted: this.formatArea(usableAreaValue, totalArea.unit),
      system: totalArea.system,
      method: totalArea.method,
      confidence: totalArea.confidence * 0.9
    };
  }

  /**
   * Compare areas
   */
  compareAreas(
    area1: AreaCalculation,
    area2: AreaCalculation
  ): {
    difference: number;
    percentageDifference: number;
    ratio: number;
    larger: 'first' | 'second' | 'equal';
  } {
    // Convert to same unit
    const area2InUnit1 = this.dimensionCalculator.convertArea(
      area2.value,
      area2.unit,
      area1.unit
    );

    const difference = area1.value - area2InUnit1;
    const percentageDifference = area1.value > 0 ? 
      (difference / area1.value) * 100 : 0;
    const ratio = area2InUnit1 > 0 ? area1.value / area2InUnit1 : 0;

    let larger: 'first' | 'second' | 'equal';
    if (Math.abs(difference) < 0.01) {
      larger = 'equal';
    } else if (difference > 0) {
      larger = 'first';
    } else {
      larger = 'second';
    }

    return {
      difference: Math.abs(difference),
      percentageDifference: Math.abs(percentageDifference),
      ratio,
      larger
    };
  }

  /**
   * Calculate area from irregular shape
   */
  calculateIrregularArea(
    points: Point2D[],
    method: 'triangulation' | 'monte-carlo' | 'grid' = 'triangulation'
  ): AreaCalculation {
    let pixelArea = 0;

    switch (method) {
      case 'triangulation':
        pixelArea = this.triangulateArea(points);
        break;
      
      case 'monte-carlo':
        pixelArea = this.monteCarloArea(points);
        break;
      
      case 'grid':
        pixelArea = this.gridArea(points);
        break;
    }

    // Convert to real-world area
    const scale = this.dimensionCalculator.getScale();
    if (!scale) {
      throw new Error('Scale not set');
    }

    const areaInScaleUnits = pixelArea / (scale.pixelsPerUnit * scale.pixelsPerUnit);
    const targetUnit = this.lengthToAreaUnit(scale.unit);

    return {
      value: areaInScaleUnits,
      unit: targetUnit,
      formatted: this.formatArea(areaInScaleUnits, targetUnit),
      system: this.getAreaUnitSystem(targetUnit),
      method: 'polygon',
      confidence: 0.85
    };
  }

  /**
   * Validate area calculations
   */
  validateArea(
    calculatedArea: AreaCalculation,
    expectedArea?: number,
    tolerance: number = 0.1
  ): {
    isValid: boolean;
    deviation?: number;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for reasonable values
    if (calculatedArea.value <= 0) {
      issues.push('Area is zero or negative');
    }

    // Check against expected if provided
    if (expectedArea !== undefined) {
      const deviation = Math.abs(calculatedArea.value - expectedArea) / expectedArea;
      
      if (deviation > tolerance) {
        issues.push(`Area deviates by ${(deviation * 100).toFixed(1)}% from expected`);
      }

      return {
        isValid: deviation <= tolerance && issues.length === 0,
        deviation,
        issues
      };
    }

    // Check for reasonable room sizes
    const sqFt = this.dimensionCalculator.convertArea(
      calculatedArea.value,
      calculatedArea.unit,
      AreaUnit.SQUARE_FEET
    );

    if (sqFt < 10) {
      issues.push('Area seems too small for a room (< 10 sq ft)');
    } else if (sqFt > 5000) {
      issues.push('Area seems too large for a single room (> 5000 sq ft)');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Helper methods
   */

  private calculatePolygonConfidence(points: Point2D[]): number {
    // Base confidence on polygon properties
    let confidence = 0.5;

    // Check if polygon is closed
    const first = points[0];
    const last = points[points.length - 1];
    const isClosed = Math.abs(first.x - last.x) < 5 && Math.abs(first.y - last.y) < 5;
    
    if (isClosed) confidence += 0.2;

    // Check for reasonable number of points
    if (points.length >= 4 && points.length <= 20) {
      confidence += 0.2;
    }

    // Check for convexity (simplified)
    if (this.isConvex(points)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1);
  }

  private isConvex(points: Point2D[]): boolean {
    if (points.length < 3) return false;

    let sign = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];

      const crossProduct = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
      
      if (crossProduct !== 0) {
        const newSign = crossProduct > 0 ? 1 : -1;
        if (sign === 0) {
          sign = newSign;
        } else if (sign !== newSign) {
          return false;
        }
      }
    }

    return true;
  }

  private lengthToAreaUnit(lengthUnit: LengthUnit): AreaUnit {
    const mapping: Record<LengthUnit, AreaUnit> = {
      [LengthUnit.INCHES]: AreaUnit.SQUARE_INCHES,
      [LengthUnit.FEET]: AreaUnit.SQUARE_FEET,
      [LengthUnit.YARDS]: AreaUnit.SQUARE_YARDS,
      [LengthUnit.MILES]: AreaUnit.ACRES,
      [LengthUnit.MILLIMETERS]: AreaUnit.SQUARE_MILLIMETERS,
      [LengthUnit.CENTIMETERS]: AreaUnit.SQUARE_CENTIMETERS,
      [LengthUnit.METERS]: AreaUnit.SQUARE_METERS,
      [LengthUnit.KILOMETERS]: AreaUnit.HECTARES
    };

    return mapping[lengthUnit] || AreaUnit.SQUARE_FEET;
  }

  private getAreaUnitSystem(unit: AreaUnit): UnitSystem {
    const imperialUnits = [
      AreaUnit.SQUARE_INCHES,
      AreaUnit.SQUARE_FEET,
      AreaUnit.SQUARE_YARDS,
      AreaUnit.ACRES
    ];

    return imperialUnits.includes(unit) ? UnitSystem.IMPERIAL : UnitSystem.METRIC;
  }

  private formatArea(value: number, unit: AreaUnit): string {
    const rounded = value.toFixed(this.precision);
    const unitStr = this.getAreaUnitAbbreviation(unit);
    return `${rounded} ${unitStr}`;
  }

  private getAreaUnitAbbreviation(unit: AreaUnit): string {
    const abbreviations: Record<AreaUnit, string> = {
      [AreaUnit.SQUARE_INCHES]: 'sq in',
      [AreaUnit.SQUARE_FEET]: 'sq ft',
      [AreaUnit.SQUARE_YARDS]: 'sq yd',
      [AreaUnit.ACRES]: 'acres',
      [AreaUnit.SQUARE_MILLIMETERS]: 'mm²',
      [AreaUnit.SQUARE_CENTIMETERS]: 'cm²',
      [AreaUnit.SQUARE_METERS]: 'm²',
      [AreaUnit.HECTARES]: 'ha'
    };

    return abbreviations[unit];
  }

  private parseDimension(dimensionStr: string): { value: number; unit: LengthUnit } {
    try {
      const parsed = this.dimensionCalculator.parseDimensionString(dimensionStr);
      return { value: parsed.value, unit: parsed.unit };
    } catch {
      // Default fallback
      return { value: 0, unit: LengthUnit.FEET };
    }
  }

  private calculateNetArea(room: Room, grossArea: AreaCalculation): AreaCalculation {
    // Estimate wall thickness impact (simplified)
    const wallThickness = 0.5; // feet
    const perimeter = room.polygon ? 
      this.calculatePerimeter(room.polygon.vertices) : 
      this.estimatePerimeter(grossArea.value, grossArea.unit);
    
    const wallArea = perimeter * wallThickness;
    const netValue = Math.max(0, grossArea.value - wallArea);

    return {
      value: netValue,
      unit: grossArea.unit,
      formatted: this.formatArea(netValue, grossArea.unit),
      system: grossArea.system,
      method: grossArea.method,
      confidence: grossArea.confidence * 0.95
    };
  }

  private calculatePerimeter(points: Point2D[]): number {
    if (points.length < 2) return 0;

    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const distance = Math.sqrt(
        Math.pow(points[j].x - points[i].x, 2) +
        Math.pow(points[j].y - points[i].y, 2)
      );
      perimeter += distance;
    }

    // Convert pixels to real units
    const scale = this.dimensionCalculator.getScale();
    if (scale) {
      perimeter = perimeter / scale.pixelsPerUnit;
    }

    return perimeter;
  }

  private estimatePerimeter(area: number, unit: AreaUnit): number {
    // Estimate perimeter assuming square shape
    const sideLength = Math.sqrt(area);
    return sideLength * 4;
  }

  private extractRoomDimensions(
    room: Room,
    area: AreaCalculation
  ): { length: number; width: number; unit: LengthUnit } {
    if (room.dimensions) {
      const width = this.parseDimension(room.dimensions.width?.value.toString() || '0');
      const height = this.parseDimension(room.dimensions.height?.value.toString() || '0');
      
      return {
        length: Math.max(width.value, height.value),
        width: Math.min(width.value, height.value),
        unit: width.unit
      };
    }

    // Estimate from area assuming rectangular
    const sqrtArea = Math.sqrt(area.value);
    
    return {
      length: sqrtArea * 1.2, // Assume slightly rectangular
      width: sqrtArea * 0.83,
      unit: LengthUnit.FEET
    };
  }

  private determineRoomShape(points: Point2D[]): 'rectangular' | 'L-shaped' | 'irregular' | 'circular' {
    if (points.length === 0) return 'irregular';
    
    if (points.length === 4) {
      if (this.isRectangular(points)) {
        return 'rectangular';
      }
    } else if (points.length === 6 || points.length === 8) {
      if (this.isLShaped(points)) {
        return 'L-shaped';
      }
    }

    if (this.isCircular(points)) {
      return 'circular';
    }

    return 'irregular';
  }

  private isRectangular(points: Point2D[]): boolean {
    if (points.length !== 4) return false;

    // Check if angles are approximately 90 degrees
    for (let i = 0; i < 4; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 4];
      const p3 = points[(i + 2) % 4];

      const angle = this.calculateAngle(p1, p2, p3);
      if (Math.abs(angle - 90) > 10) { // 10 degree tolerance
        return false;
      }
    }

    return true;
  }

  private isLShaped(points: Point2D[]): boolean {
    // Simplified check for L-shape
    return points.length === 6 || points.length === 8;
  }

  private isCircular(points: Point2D[]): boolean {
    if (points.length < 8) return false;

    // Check if points are roughly equidistant from center
    const center = this.calculateCentroid(points);
    const distances = points.map(p => 
      Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2))
    );

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
    
    return variance / (avgDistance * avgDistance) < 0.1;
  }

  private calculateAngle(p1: Point2D, p2: Point2D, p3: Point2D): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const det = v1.x * v2.y - v1.y * v2.x;
    
    const angle = Math.atan2(det, dot) * 180 / Math.PI;
    return Math.abs(angle);
  }

  private calculateCentroid(points: Point2D[]): Point2D {
    const sum = points.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  private calculateAverageConfidence(analyses: RoomAreaAnalysis[]): number {
    if (analyses.length === 0) return 0;
    
    const sum = analyses.reduce((total, a) => total + a.grossArea.confidence, 0);
    return sum / analyses.length;
  }

  private calculateRoomBreakdown(
    analyses: RoomAreaAnalysis[]
  ): Array<{
    type: string;
    count: number;
    totalArea: AreaCalculation;
    averageArea: AreaCalculation;
  }> {
    const groupedByType = new Map<string, RoomAreaAnalysis[]>();

    for (const analysis of analyses) {
      const type = analysis.room.type;
      if (!groupedByType.has(type)) {
        groupedByType.set(type, []);
      }
      groupedByType.get(type)!.push(analysis);
    }

    const breakdown = [];
    for (const [type, rooms] of groupedByType) {
      const totalValue = rooms.reduce((sum, r) => sum + r.grossArea.value, 0);
      const avgValue = totalValue / rooms.length;

      breakdown.push({
        type,
        count: rooms.length,
        totalArea: {
          value: totalValue,
          unit: this.defaultAreaUnit,
          formatted: this.formatArea(totalValue, this.defaultAreaUnit),
          system: this.getAreaUnitSystem(this.defaultAreaUnit),
          method: 'polygon' as const,
          confidence: this.calculateAverageConfidence(rooms)
        },
        averageArea: {
          value: avgValue,
          unit: this.defaultAreaUnit,
          formatted: this.formatArea(avgValue, this.defaultAreaUnit),
          system: this.getAreaUnitSystem(this.defaultAreaUnit),
          method: 'polygon' as const,
          confidence: this.calculateAverageConfidence(rooms)
        }
      });
    }

    return breakdown;
  }

  private calculateStatistics(analyses: RoomAreaAnalysis[]): {
    largestRoom: RoomAreaAnalysis;
    smallestRoom: RoomAreaAnalysis;
    averageRoomSize: AreaCalculation;
  } {
    if (analyses.length === 0) {
      throw new Error('No rooms to calculate statistics');
    }

    const sorted = [...analyses].sort((a, b) => b.grossArea.value - a.grossArea.value);
    const totalArea = analyses.reduce((sum, a) => sum + a.grossArea.value, 0);
    const avgValue = totalArea / analyses.length;

    return {
      largestRoom: sorted[0],
      smallestRoom: sorted[sorted.length - 1],
      averageRoomSize: {
        value: avgValue,
        unit: this.defaultAreaUnit,
        formatted: this.formatArea(avgValue, this.defaultAreaUnit),
        system: this.getAreaUnitSystem(this.defaultAreaUnit),
        method: 'polygon',
        confidence: this.calculateAverageConfidence(analyses)
      }
    };
  }

  private estimateFixtureArea(fixture: any): number {
    // Simplified fixture area estimation
    const fixtureAreas: Record<string, number> = {
      'closet': 15,
      'pantry': 20,
      'storage': 25,
      'bathroom': 5,
      'kitchen': 10
    };

    const type = fixture.type.toLowerCase();
    for (const [key, area] of Object.entries(fixtureAreas)) {
      if (type.includes(key)) {
        return area;
      }
    }

    return 10; // Default fixture area
  }

  private triangulateArea(points: Point2D[]): number {
    // Ear clipping triangulation
    if (points.length < 3) return 0;
    
    let area = 0;
    const triangles = this.triangulate(points);
    
    for (const triangle of triangles) {
      area += this.triangleArea(triangle[0], triangle[1], triangle[2]);
    }
    
    return area;
  }

  private triangulate(points: Point2D[]): Array<[Point2D, Point2D, Point2D]> {
    // Simplified triangulation - would use ear clipping in production
    const triangles: Array<[Point2D, Point2D, Point2D]> = [];
    
    if (points.length < 3) return triangles;
    
    const p0 = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      triangles.push([p0, points[i], points[i + 1]]);
    }
    
    return triangles;
  }

  private triangleArea(p1: Point2D, p2: Point2D, p3: Point2D): number {
    return Math.abs(
      (p1.x * (p2.y - p3.y) + 
       p2.x * (p3.y - p1.y) + 
       p3.x * (p1.y - p2.y)) / 2
    );
  }

  private monteCarloArea(points: Point2D[]): number {
    // Monte Carlo method for area estimation
    const bounds = this.getBounds(points);
    const samples = 10000;
    let inside = 0;

    for (let i = 0; i < samples; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      
      if (this.isPointInPolygon({ x, y }, points)) {
        inside++;
      }
    }

    const boundArea = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    return (inside / samples) * boundArea;
  }

  private gridArea(points: Point2D[]): number {
    // Grid-based area calculation
    const bounds = this.getBounds(points);
    const gridSize = 1; // pixel
    let area = 0;

    for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
      for (let y = bounds.minY; y <= bounds.maxY; y += gridSize) {
        if (this.isPointInPolygon({ x, y }, points)) {
          area += gridSize * gridSize;
        }
      }
    }

    return area;
  }

  private getBounds(points: Point2D[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, maxX, minY, maxY };
  }

  private isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
    let inside = false;
    const n = polygon.length;
    
    let p1x = polygon[0].x;
    let p1y = polygon[0].y;
    
    for (let i = 1; i <= n; i++) {
      const p2x = polygon[i % n].x;
      const p2y = polygon[i % n].y;
      
      if (point.y > Math.min(p1y, p2y)) {
        if (point.y <= Math.max(p1y, p2y)) {
          if (point.x <= Math.max(p1x, p2x)) {
            let xinters: number;
            if (p1y !== p2y) {
              xinters = (point.y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
            } else {
              xinters = point.x;
            }
            if (p1x === p2x || point.x <= xinters) {
              inside = !inside;
            }
          }
        }
      }
      
      p1x = p2x;
      p1y = p2y;
    }
    
    return inside;
  }

  private convertAreaUnits(
    value: number,
    fromUnit: AreaUnit,
    toUnit: AreaUnit
  ): number {
    if (fromUnit === toUnit) return value;
    return this.dimensionCalculator.convertArea(value, fromUnit, toUnit);
  }
}

// Export singleton instance
export const areaCalculator = new AreaCalculator();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { areaCalculator, AreaUnit } from './services/geometry/area-calculator';
import { dimensionCalculator, LengthUnit } from './services/geometry/dimension-calculator';

// Set scale first
dimensionCalculator.setScale({
  pixelsPerUnit: 10,
  unit: LengthUnit.FEET,
  confidence: 0.95,
  source: 'detected'
});

// Calculate area from polygon
const roomPolygon = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 100 },
  { x: 0, y: 100 }
];

const area = areaCalculator.calculatePolygonArea(roomPolygon, AreaUnit.SQUARE_FEET);
console.log(`Room area: ${area.formatted}`); // "120.0 sq ft"

// Calculate area from dimensions
const areaFromDims = areaCalculator.calculateAreaFromDimensions(
  12,
  10,
  LengthUnit.FEET,
  AreaUnit.SQUARE_FEET
);
console.log(`Area: ${areaFromDims.formatted}`); // "120.0 sq ft"

// Analyze room area
const roomAnalysis = areaCalculator.analyzeRoomArea(room);
console.log(`Gross area: ${roomAnalysis.grossArea.formatted}`);
console.log(`Net area: ${roomAnalysis.netArea.formatted}`);
console.log(`Shape: ${roomAnalysis.shape}`);
console.log(`Efficiency: ${(roomAnalysis.efficiency * 100).toFixed(1)}%`);

// Calculate floor plan summary
const summary = areaCalculator.calculateFloorPlanSummary(rooms);
console.log(`Total area: ${summary.totalArea.formatted}`);
console.log(`Living area: ${summary.livingArea.formatted}`);
console.log(`Largest room: ${summary.statistics.largestRoom.room.type}`);
console.log(`Average room size: ${summary.statistics.averageRoomSize.formatted}`);

// Calculate volume
const volume = areaCalculator.calculateVolume(
  area,
  9,
  LengthUnit.FEET
);
console.log(`Room volume: ${volume.formatted}`); // "1080 ft³"

// Compare areas
const comparison = areaCalculator.compareAreas(area1, area2);
console.log(`Difference: ${comparison.difference.toFixed(1)} sq ft`);
console.log(`Percentage difference: ${comparison.percentageDifference.toFixed(1)}%`);

// Calculate irregular area
const irregularArea = areaCalculator.calculateIrregularArea(
  complexPolygon,
  'triangulation'
);
console.log(`Irregular area: ${irregularArea.formatted}`);

// Validate area
const validation = areaCalculator.validateArea(area, 120, 0.05);
console.log(`Area valid: ${validation.isValid}`);
if (validation.deviation) {
  console.log(`Deviation: ${(validation.deviation * 100).toFixed(1)}%`);
}
*/