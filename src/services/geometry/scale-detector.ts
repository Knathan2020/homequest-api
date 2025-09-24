// ========================================
// SCALE DETECTOR SERVICE - scale-detector.ts
// Auto-detect floor plan scale from text/rulers
// ========================================

import { DimensionCalculator, LengthUnit, UnitSystem } from './dimension-calculator';
import { Point2D } from '../../types/floor-plan.types';

interface ScaleIndicator {
  type: 'text' | 'ruler' | 'grid' | 'dimension' | 'standard';
  value: string;
  location?: Point2D;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

interface RulerDetection {
  start: Point2D;
  end: Point2D;
  pixelLength: number;
  markedLength: number;
  unit: LengthUnit;
  orientation: 'horizontal' | 'vertical';
  confidence: number;
}

interface DetectedScale {
  scale: number; // e.g., 50 for 1:50
  ratio: string; // e.g., "1:50", "1/4\" = 1'"
  pixelsPerUnit: number;
  unit: LengthUnit;
  system: UnitSystem;
  confidence: number;
  source: ScaleIndicator;
  alternativeScales?: DetectedScale[];
}

interface StandardDimension {
  name: string;
  minValue: number;
  maxValue: number;
  unit: LengthUnit;
  commonValues: number[];
}

export class ScaleDetector {
  private dimensionCalculator: DimensionCalculator;
  
  // Common architectural scales
  private readonly COMMON_SCALES = {
    metric: [
      { ratio: '1:50', scale: 50, unit: LengthUnit.METERS },
      { ratio: '1:100', scale: 100, unit: LengthUnit.METERS },
      { ratio: '1:200', scale: 200, unit: LengthUnit.METERS },
      { ratio: '1:500', scale: 500, unit: LengthUnit.METERS },
      { ratio: '1:20', scale: 20, unit: LengthUnit.METERS },
      { ratio: '1:25', scale: 25, unit: LengthUnit.METERS }
    ],
    imperial: [
      { ratio: '1/4" = 1\'', scale: 48, unit: LengthUnit.FEET },
      { ratio: '1/8" = 1\'', scale: 96, unit: LengthUnit.FEET },
      { ratio: '3/8" = 1\'', scale: 32, unit: LengthUnit.FEET },
      { ratio: '1/2" = 1\'', scale: 24, unit: LengthUnit.FEET },
      { ratio: '1" = 10\'', scale: 120, unit: LengthUnit.FEET },
      { ratio: '1" = 20\'', scale: 240, unit: LengthUnit.FEET }
    ]
  };

  // Standard architectural dimensions for validation
  private readonly STANDARD_DIMENSIONS: StandardDimension[] = [
    {
      name: 'door_width',
      minValue: 24,
      maxValue: 48,
      unit: LengthUnit.INCHES,
      commonValues: [24, 28, 30, 32, 36]
    },
    {
      name: 'door_height',
      minValue: 78,
      maxValue: 96,
      unit: LengthUnit.INCHES,
      commonValues: [78, 80, 84, 96]
    },
    {
      name: 'ceiling_height',
      minValue: 7,
      maxValue: 12,
      unit: LengthUnit.FEET,
      commonValues: [8, 9, 10]
    },
    {
      name: 'hallway_width',
      minValue: 3,
      maxValue: 6,
      unit: LengthUnit.FEET,
      commonValues: [3, 3.5, 4, 5]
    },
    {
      name: 'room_dimension',
      minValue: 8,
      maxValue: 30,
      unit: LengthUnit.FEET,
      commonValues: [10, 12, 14, 16, 18, 20]
    },
    {
      name: 'bathroom_width',
      minValue: 5,
      maxValue: 10,
      unit: LengthUnit.FEET,
      commonValues: [5, 6, 7, 8]
    }
  ];

  constructor() {
    this.dimensionCalculator = new DimensionCalculator();
  }

  /**
   * Auto-detect scale from multiple sources
   */
  async detectScale(
    ocrText: string[],
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>,
    imageMetadata?: { width: number; height: number },
    options?: {
      preferredSystem?: UnitSystem;
      knownDimensions?: Array<{ pixels: number; value: number; unit: LengthUnit }>;
    }
  ): Promise<DetectedScale> {
    console.log('🔍 Detecting floor plan scale...');

    const detectedScales: DetectedScale[] = [];

    // Method 1: Detect from explicit scale text
    const textScale = this.detectScaleFromText(ocrText);
    if (textScale) {
      detectedScales.push(textScale);
    }

    // Method 2: Detect from ruler/scale bar
    const rulerScale = await this.detectScaleFromRuler(ocrText, dimensions);
    if (rulerScale) {
      detectedScales.push(rulerScale);
    }

    // Method 3: Detect from grid patterns
    if (imageMetadata) {
      const gridScale = this.detectScaleFromGrid(dimensions, imageMetadata);
      if (gridScale) {
        detectedScales.push(gridScale);
      }
    }

    // Method 4: Estimate from known dimensions
    if (options?.knownDimensions && options.knownDimensions.length > 0) {
      const knownScale = this.calculateScaleFromKnownDimensions(options.knownDimensions);
      if (knownScale) {
        detectedScales.push(knownScale);
      }
    }

    // Method 5: Estimate from standard dimensions
    const standardScale = this.estimateScaleFromStandardDimensions(dimensions);
    if (standardScale) {
      detectedScales.push(standardScale);
    }

    // Select best scale based on confidence
    if (detectedScales.length === 0) {
      // Fallback to default scale
      return this.getDefaultScale(options?.preferredSystem);
    }

    // Sort by confidence
    detectedScales.sort((a, b) => b.confidence - a.confidence);

    // Return best scale with alternatives
    const bestScale = detectedScales[0];
    bestScale.alternativeScales = detectedScales.slice(1, 4); // Top 3 alternatives

    // Set the scale in dimension calculator
    this.dimensionCalculator.setScale({
      pixelsPerUnit: bestScale.pixelsPerUnit,
      unit: bestScale.unit,
      confidence: bestScale.confidence,
      source: 'detected'
    });

    console.log(`✅ Scale detected: ${bestScale.ratio} (${bestScale.confidence * 100}% confidence)`);
    
    return bestScale;
  }

  /**
   * Detect scale from text annotations
   */
  private detectScaleFromText(ocrText: string[]): DetectedScale | null {
    const scalePatterns = [
      // Metric scales
      /scale\s*:?\s*1\s*:\s*(\d+)/i,
      /1\s*:\s*(\d+)/,
      /échelle\s*:?\s*1\s*:\s*(\d+)/i, // French
      /escala\s*:?\s*1\s*:\s*(\d+)/i, // Spanish
      
      // Imperial scales
      /(\d+\/\d+)["']\s*=\s*1\s*['ft]/i,
      /(\d+)["']\s*=\s*(\d+)\s*['ft]/i,
      /scale.*?(\d+\/\d+).*?inch.*?foot/i
    ];

    for (const text of ocrText) {
      for (const pattern of scalePatterns) {
        const match = text.match(pattern);
        if (match) {
          return this.parseScaleText(match[0], match[1]);
        }
      }
    }

    return null;
  }

  /**
   * Parse scale text into DetectedScale
   */
  private parseScaleText(fullMatch: string, scaleValue: string): DetectedScale | null {
    // Check if metric scale (1:X format)
    if (fullMatch.includes(':')) {
      const scale = parseInt(scaleValue);
      if (scale > 0 && scale <= 1000) {
        // Determine unit based on scale magnitude
        let unit = LengthUnit.CENTIMETERS;
        let pixelsPerUnit = 100 / scale; // Assume 100 pixels = 1m at 1:1
        
        if (scale <= 50) {
          unit = LengthUnit.CENTIMETERS;
          pixelsPerUnit = 100 / scale;
        } else {
          unit = LengthUnit.METERS;
          pixelsPerUnit = 10000 / scale;
        }

        return {
          scale,
          ratio: `1:${scale}`,
          pixelsPerUnit,
          unit,
          system: UnitSystem.METRIC,
          confidence: 0.95,
          source: {
            type: 'text',
            value: fullMatch,
            confidence: 0.95
          }
        };
      }
    }

    // Check if imperial scale (X" = Y' format)
    if (fullMatch.includes('=')) {
      const imperialMatch = fullMatch.match(/(\d+(?:\/\d+)?)["']\s*=\s*(\d+)/);
      if (imperialMatch) {
        const drawingInches = this.parseFraction(imperialMatch[1]);
        const realFeet = parseFloat(imperialMatch[2]);
        
        const scale = (realFeet * 12) / drawingInches;
        const pixelsPerUnit = 96 / scale; // Assume 96 DPI

        return {
          scale,
          ratio: fullMatch.trim(),
          pixelsPerUnit,
          unit: LengthUnit.FEET,
          system: UnitSystem.IMPERIAL,
          confidence: 0.9,
          source: {
            type: 'text',
            value: fullMatch,
            confidence: 0.9
          }
        };
      }
    }

    return null;
  }

  /**
   * Detect scale from ruler or scale bar
   */
  private async detectScaleFromRuler(
    ocrText: string[],
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>
  ): Promise<DetectedScale | null> {
    // Look for ruler patterns in text
    const rulerPatterns = [
      /0\s+(\d+)\s+(\d+)\s+(\d+)/,  // Sequential numbers
      /\|+/,  // Tick marks
      /scale\s*bar/i,
      /ruler/i
    ];

    let rulerDetection: RulerDetection | null = null;

    // Find ruler indicators
    for (const text of ocrText) {
      for (const pattern of rulerPatterns) {
        if (pattern.test(text)) {
          // Extract ruler measurements
          rulerDetection = this.extractRulerMeasurements(text, dimensions);
          if (rulerDetection) break;
        }
      }
      if (rulerDetection) break;
    }

    if (!rulerDetection) {
      // Try to detect visual ruler from dimensions
      rulerDetection = this.detectVisualRuler(dimensions);
    }

    if (rulerDetection) {
      const pixelsPerUnit = rulerDetection.pixelLength / rulerDetection.markedLength;
      
      return {
        scale: rulerDetection.markedLength,
        ratio: `Ruler: ${rulerDetection.markedLength} ${rulerDetection.unit}`,
        pixelsPerUnit,
        unit: rulerDetection.unit,
        system: this.getUnitSystem(rulerDetection.unit),
        confidence: rulerDetection.confidence,
        source: {
          type: 'ruler',
          value: `${rulerDetection.markedLength} ${rulerDetection.unit}`,
          confidence: rulerDetection.confidence
        }
      };
    }

    return null;
  }

  /**
   * Extract ruler measurements from text
   */
  private extractRulerMeasurements(
    text: string,
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>
  ): RulerDetection | null {
    // Look for sequential measurements
    const numbers = text.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      const values = numbers.map(n => parseInt(n));
      
      // Check if sequential
      let isSequential = true;
      let interval = values[1] - values[0];
      
      for (let i = 2; i < values.length; i++) {
        if (values[i] - values[i-1] !== interval) {
          isSequential = false;
          break;
        }
      }

      if (isSequential && interval > 0) {
        // Estimate pixel length from dimensions
        const relatedDim = dimensions.find(d => d.text.includes(text));
        const pixelLength = relatedDim?.pixels || 100;

        return {
          start: { x: 0, y: 0 },
          end: { x: pixelLength, y: 0 },
          pixelLength,
          markedLength: values[values.length - 1],
          unit: this.inferUnit(values[values.length - 1]),
          orientation: 'horizontal',
          confidence: 0.7
        };
      }
    }

    return null;
  }

  /**
   * Detect visual ruler from dimension patterns
   */
  private detectVisualRuler(
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>
  ): RulerDetection | null {
    // Look for regularly spaced dimensions that might indicate a ruler
    const sortedDims = dimensions
      .filter(d => d.location && d.pixels)
      .sort((a, b) => (a.location?.x || 0) - (b.location?.x || 0));

    if (sortedDims.length >= 3) {
      // Check for regular spacing
      const spacings: number[] = [];
      for (let i = 1; i < sortedDims.length; i++) {
        const spacing = (sortedDims[i].location?.x || 0) - (sortedDims[i-1].location?.x || 0);
        spacings.push(spacing);
      }

      const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
      const variance = spacings.reduce((sum, s) => sum + Math.pow(s - avgSpacing, 2), 0) / spacings.length;
      
      if (variance < avgSpacing * 0.1) { // Low variance indicates regular spacing
        const totalPixels = (sortedDims[sortedDims.length - 1].location?.x || 0) - (sortedDims[0].location?.x || 0);
        const parsedDim = this.dimensionCalculator.parseDimensionString(sortedDims[sortedDims.length - 1].text);
        
        return {
          start: sortedDims[0].location!,
          end: sortedDims[sortedDims.length - 1].location!,
          pixelLength: totalPixels,
          markedLength: parsedDim.value,
          unit: parsedDim.unit,
          orientation: 'horizontal',
          confidence: 0.6
        };
      }
    }

    return null;
  }

  /**
   * Detect scale from grid patterns
   */
  private detectScaleFromGrid(
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>,
    imageMetadata: { width: number; height: number }
  ): DetectedScale | null {
    // Analyze dimension spacing to detect grid
    const horizontalSpacings: number[] = [];
    const verticalSpacings: number[] = [];

    for (let i = 0; i < dimensions.length; i++) {
      for (let j = i + 1; j < dimensions.length; j++) {
        const locationI = dimensions[i].location;
        const locationJ = dimensions[j].location;
        if (locationI && locationJ) {
          const dx = Math.abs((locationJ.x || 0) - (locationI.x || 0));
          const dy = Math.abs((locationJ.y || 0) - (locationI.y || 0));
          
          if (dx > 10 && dy < 10) { // Horizontal alignment
            horizontalSpacings.push(dx);
          }
          if (dy > 10 && dx < 10) { // Vertical alignment
            verticalSpacings.push(dy);
          }
        }
      }
    }

    // Find common grid spacing
    const gridSpacing = this.findCommonSpacing([...horizontalSpacings, ...verticalSpacings]);
    
    if (gridSpacing) {
      // Estimate grid unit (commonly 1ft or 1m)
      const gridUnit = this.estimateGridUnit(gridSpacing, imageMetadata);
      
      return {
        scale: Math.round(gridSpacing),
        ratio: `Grid: ${gridUnit.value} ${gridUnit.unit}`,
        pixelsPerUnit: gridSpacing / gridUnit.value,
        unit: gridUnit.unit,
        system: this.getUnitSystem(gridUnit.unit),
        confidence: 0.5,
        source: {
          type: 'grid',
          value: `${gridSpacing}px grid`,
          confidence: 0.5
        }
      };
    }

    return null;
  }

  /**
   * Calculate scale from known dimensions
   */
  private calculateScaleFromKnownDimensions(
    knownDimensions: Array<{ pixels: number; value: number; unit: LengthUnit }>
  ): DetectedScale | null {
    if (knownDimensions.length === 0) return null;

    const scales: number[] = [];
    let totalConfidence = 0;

    for (const dim of knownDimensions) {
      const pixelsPerUnit = dim.pixels / dim.value;
      scales.push(pixelsPerUnit);
      
      // Check if dimension is reasonable
      const isReasonable = this.isDimensionReasonable(dim.value, dim.unit);
      totalConfidence += isReasonable ? 0.9 : 0.5;
    }

    const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
    const avgConfidence = totalConfidence / knownDimensions.length;

    // Check consistency
    const variance = scales.reduce((sum, s) => sum + Math.pow(s - avgScale, 2), 0) / scales.length;
    const consistencyFactor = 1 - Math.min(variance / (avgScale * avgScale), 0.5);

    const finalConfidence = avgConfidence * consistencyFactor;
    const primaryUnit = knownDimensions[0].unit;

    return {
      scale: Math.round(avgScale),
      ratio: `Calculated: ${avgScale.toFixed(1)} pixels/${this.getUnitAbbreviation(primaryUnit)}`,
      pixelsPerUnit: avgScale,
      unit: primaryUnit,
      system: this.getUnitSystem(primaryUnit),
      confidence: finalConfidence,
      source: {
        type: 'dimension',
        value: `${knownDimensions.length} known dimensions`,
        confidence: finalConfidence
      }
    };
  }

  /**
   * Estimate scale from standard architectural dimensions
   */
  private estimateScaleFromStandardDimensions(
    dimensions: Array<{ text: string; location?: Point2D; pixels?: number }>
  ): DetectedScale | null {
    const candidates: Array<{ scale: number; unit: LengthUnit; confidence: number }> = [];

    for (const dim of dimensions) {
      if (!dim.pixels) continue;

      try {
        const parsed = this.dimensionCalculator.parseDimensionString(dim.text);
        
        // Check against standard dimensions
        for (const standard of this.STANDARD_DIMENSIONS) {
          // Convert to same unit for comparison
          const valueInStandardUnit = this.dimensionCalculator.convertLength(
            parsed.value,
            parsed.unit,
            standard.unit
          );

          if (valueInStandardUnit >= standard.minValue && 
              valueInStandardUnit <= standard.maxValue) {
            
            // Check if close to common value
            const closestCommon = standard.commonValues.reduce((prev, curr) => 
              Math.abs(curr - valueInStandardUnit) < Math.abs(prev - valueInStandardUnit) ? curr : prev
            );

            if (Math.abs(closestCommon - valueInStandardUnit) / closestCommon < 0.1) {
              // Use this as reference
              const pixelsPerUnit = dim.pixels / parsed.value;
              candidates.push({
                scale: pixelsPerUnit,
                unit: parsed.unit,
                confidence: 0.7
              });
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (candidates.length > 0) {
      // Average similar scales
      const avgScale = candidates.reduce((sum, c) => sum + c.scale, 0) / candidates.length;
      const avgConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;
      const primaryUnit = candidates[0].unit;

      return {
        scale: Math.round(avgScale),
        ratio: `Estimated: ${avgScale.toFixed(1)} pixels/${this.getUnitAbbreviation(primaryUnit)}`,
        pixelsPerUnit: avgScale,
        unit: primaryUnit,
        system: this.getUnitSystem(primaryUnit),
        confidence: avgConfidence * 0.8, // Reduce confidence for estimation
        source: {
          type: 'standard',
          value: 'Standard dimensions',
          confidence: avgConfidence * 0.8
        }
      };
    }

    return null;
  }

  /**
   * Validate detected scale
   */
  validateScale(
    detectedScale: DetectedScale,
    dimensions: Array<{ text: string; pixels: number }>
  ): {
    isValid: boolean;
    confidence: number;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let validCount = 0;
    let totalCount = 0;

    // Set scale for validation
    this.dimensionCalculator.setScale({
      pixelsPerUnit: detectedScale.pixelsPerUnit,
      unit: detectedScale.unit,
      confidence: detectedScale.confidence,
      source: 'detected'
    });

    for (const dim of dimensions) {
      try {
        const parsed = this.dimensionCalculator.parseDimensionString(dim.text);
        const calculated = this.dimensionCalculator.pixelsToRealWorld(dim.pixels, parsed.unit);
        
        const difference = Math.abs(calculated.value - parsed.value) / parsed.value;
        
        if (difference < 0.15) { // Within 15% tolerance
          validCount++;
        } else if (difference < 0.3) {
          issues.push(`Dimension "${dim.text}" has ${(difference * 100).toFixed(1)}% error`);
        } else {
          issues.push(`Dimension "${dim.text}" has significant error (${(difference * 100).toFixed(1)}%)`);
        }
        
        totalCount++;
      } catch (e) {
        // Ignore parse errors
      }
    }

    const validationConfidence = totalCount > 0 ? validCount / totalCount : 0;
    const isValid = validationConfidence > 0.7 && issues.length < dimensions.length * 0.3;

    if (!isValid) {
      suggestions.push('Consider manually calibrating the scale using a known dimension');
      suggestions.push('Check if the floor plan image is distorted or skewed');
      
      if (detectedScale.alternativeScales && detectedScale.alternativeScales.length > 0) {
        suggestions.push(`Try alternative scale: ${detectedScale.alternativeScales[0].ratio}`);
      }
    }

    return {
      isValid,
      confidence: validationConfidence * detectedScale.confidence,
      issues,
      suggestions
    };
  }

  /**
   * Manual scale calibration
   */
  calibrateScale(
    point1: Point2D,
    point2: Point2D,
    realWorldDistance: number,
    unit: LengthUnit
  ): DetectedScale {
    const pixelDistance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );

    const pixelsPerUnit = pixelDistance / realWorldDistance;

    // Find closest standard scale
    const system = this.getUnitSystem(unit);
    const standardScales = system === UnitSystem.METRIC ? 
      this.COMMON_SCALES.metric : this.COMMON_SCALES.imperial;
    
    let minDifference = Infinity;

    for (const standard of standardScales) {
      const standardPixelsPerUnit = this.calculatePixelsPerUnit(standard);
      const difference = Math.abs(standardPixelsPerUnit - pixelsPerUnit);
      
      if (difference < minDifference) {
        minDifference = difference;
        // Found a closer standard scale
      }
    }

    const scale: DetectedScale = {
      scale: Math.round(pixelsPerUnit),
      ratio: `Manual: ${realWorldDistance} ${unit}`,
      pixelsPerUnit,
      unit,
      system,
      confidence: 1.0, // Maximum confidence for manual calibration
      source: {
        type: 'dimension',
        value: `Manual calibration: ${realWorldDistance} ${unit}`,
        confidence: 1.0
      }
    };

    // Set the scale
    this.dimensionCalculator.setScale({
      pixelsPerUnit,
      unit,
      confidence: 1.0,
      source: 'manual'
    });

    return scale;
  }

  /**
   * Helper methods
   */

  private parseFraction(fraction: string): number {
    if (fraction.includes('/')) {
      const parts = fraction.split('/');
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(fraction);
  }

  private inferUnit(value: number): LengthUnit {
    // Infer unit based on magnitude
    if (value <= 12) {
      return LengthUnit.FEET; // Likely feet for small values
    } else if (value <= 100) {
      return LengthUnit.METERS; // Likely meters for medium values
    } else {
      return LengthUnit.CENTIMETERS; // Likely centimeters for large values
    }
  }

  private getUnitSystem(unit: LengthUnit): UnitSystem {
    const imperialUnits = [
      LengthUnit.INCHES,
      LengthUnit.FEET,
      LengthUnit.YARDS,
      LengthUnit.MILES
    ];

    return imperialUnits.includes(unit) ? UnitSystem.IMPERIAL : UnitSystem.METRIC;
  }

  private getUnitAbbreviation(unit: LengthUnit): string {
    const abbreviations: Record<LengthUnit, string> = {
      [LengthUnit.INCHES]: 'in',
      [LengthUnit.FEET]: 'ft',
      [LengthUnit.YARDS]: 'yd',
      [LengthUnit.MILES]: 'mi',
      [LengthUnit.MILLIMETERS]: 'mm',
      [LengthUnit.CENTIMETERS]: 'cm',
      [LengthUnit.METERS]: 'm',
      [LengthUnit.KILOMETERS]: 'km'
    };

    return abbreviations[unit];
  }

  private findCommonSpacing(spacings: number[]): number | null {
    if (spacings.length === 0) return null;

    // Cluster spacings to find common value
    const clusters: Array<{ value: number; count: number }> = [];
    const tolerance = 5; // pixels

    for (const spacing of spacings) {
      let added = false;
      
      for (const cluster of clusters) {
        if (Math.abs(cluster.value - spacing) < tolerance) {
          cluster.value = (cluster.value * cluster.count + spacing) / (cluster.count + 1);
          cluster.count++;
          added = true;
          break;
        }
      }
      
      if (!added) {
        clusters.push({ value: spacing, count: 1 });
      }
    }

    // Return most common spacing
    clusters.sort((a, b) => b.count - a.count);
    
    return clusters.length > 0 && clusters[0].count >= 3 ? 
      clusters[0].value : null;
  }

  private estimateGridUnit(
    gridSpacing: number,
    imageMetadata: { width: number; height: number }
  ): { value: number; unit: LengthUnit } {
    // Estimate based on typical floor plan sizes
    const gridCount = Math.max(imageMetadata.width, imageMetadata.height) / gridSpacing;
    
    if (gridCount > 50) {
      // Likely metric with small units
      return { value: 0.1, unit: LengthUnit.METERS };
    } else if (gridCount > 20) {
      // Likely 1 foot or 1 meter grid
      return { value: 1, unit: LengthUnit.FEET };
    } else {
      // Likely larger grid
      return { value: 2, unit: LengthUnit.METERS };
    }
  }

  private isDimensionReasonable(value: number, unit: LengthUnit): boolean {
    // Convert to feet for comparison
    const feet = this.dimensionCalculator.convertLength(value, unit, LengthUnit.FEET);
    
    // Check if within reasonable architectural range
    return feet >= 1 && feet <= 1000;
  }

  private calculatePixelsPerUnit(
    scale: { ratio: string; scale: number; unit: LengthUnit }
  ): number {
    // Simplified calculation - would need more context in reality
    return 100 / scale.scale;
  }

  private getDefaultScale(preferredSystem?: UnitSystem): DetectedScale {
    const system = preferredSystem || UnitSystem.IMPERIAL;
    
    if (system === UnitSystem.METRIC) {
      return {
        scale: 100,
        ratio: '1:100',
        pixelsPerUnit: 1, // 1 pixel per cm at 1:100
        unit: LengthUnit.CENTIMETERS,
        system: UnitSystem.METRIC,
        confidence: 0.3,
        source: {
          type: 'standard',
          value: 'Default 1:100',
          confidence: 0.3
        }
      };
    } else {
      return {
        scale: 48,
        ratio: '1/4" = 1\'',
        pixelsPerUnit: 48, // 48 pixels per foot
        unit: LengthUnit.FEET,
        system: UnitSystem.IMPERIAL,
        confidence: 0.3,
        source: {
          type: 'standard',
          value: 'Default 1/4" = 1\'',
          confidence: 0.3
        }
      };
    }
  }

  /**
   * Get scale detection confidence factors
   */
  getConfidenceFactors(): Record<string, number> {
    return {
      explicitText: 0.95,      // Scale explicitly written
      ruler: 0.85,             // Scale bar detected
      knownDimension: 0.80,    // Calculated from known dimensions
      grid: 0.60,              // Detected from grid pattern
      standard: 0.50,          // Estimated from standard dimensions
      default: 0.30            // Fallback default
    };
  }
}

// Export singleton instance
export const scaleDetector = new ScaleDetector();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { scaleDetector } from './services/geometry/scale-detector';

// Auto-detect scale
const detectedScale = await scaleDetector.detectScale(
  ocrTextArray,
  [
    { text: "12'6\"", location: { x: 100, y: 200 }, pixels: 150 },
    { text: "10 ft", location: { x: 300, y: 200 }, pixels: 120 },
    { text: "Scale: 1:100", location: { x: 50, y: 50 } }
  ],
  { width: 1920, height: 1080 },
  {
    preferredSystem: UnitSystem.IMPERIAL,
    knownDimensions: [
      { pixels: 150, value: 12.5, unit: LengthUnit.FEET }
    ]
  }
);

console.log(`Detected scale: ${detectedScale.ratio}`);
console.log(`Confidence: ${(detectedScale.confidence * 100).toFixed(1)}%`);
console.log(`System: ${detectedScale.system}`);

// Validate scale
const validation = scaleDetector.validateScale(
  detectedScale,
  [
    { text: "12'6\"", pixels: 150 },
    { text: "10 ft", pixels: 120 }
  ]
);

console.log(`Scale valid: ${validation.isValid}`);
console.log(`Validation confidence: ${(validation.confidence * 100).toFixed(1)}%`);

// Manual calibration
const calibratedScale = scaleDetector.calibrateScale(
  { x: 100, y: 100 },
  { x: 250, y: 100 },
  10,
  LengthUnit.FEET
);

console.log(`Calibrated scale: ${calibratedScale.pixelsPerUnit} pixels per ${calibratedScale.unit}`);
*/