// ========================================
// DIMENSION CALCULATOR SERVICE - dimension-calculator.ts
// Convert pixel measurements to real-world dimensions
// ========================================

import { Point2D } from '../../types/floor-plan.types';

export enum UnitSystem {
  IMPERIAL = 'imperial',
  METRIC = 'metric'
}

export enum LengthUnit {
  // Imperial
  INCHES = 'inches',
  FEET = 'feet',
  YARDS = 'yards',
  MILES = 'miles',
  
  // Metric
  MILLIMETERS = 'millimeters',
  CENTIMETERS = 'centimeters',
  METERS = 'meters',
  KILOMETERS = 'kilometers'
}

export enum AreaUnit {
  // Imperial
  SQUARE_INCHES = 'sq_in',
  SQUARE_FEET = 'sq_ft',
  SQUARE_YARDS = 'sq_yd',
  ACRES = 'acres',
  
  // Metric
  SQUARE_MILLIMETERS = 'sq_mm',
  SQUARE_CENTIMETERS = 'sq_cm',
  SQUARE_METERS = 'sq_m',
  HECTARES = 'hectares'
}

interface Dimension {
  value: number;
  unit: LengthUnit;
  pixels: number;
  confidence: number;
}

interface ConversionResult {
  value: number;
  unit: LengthUnit | AreaUnit;
  formatted: string;
  system: UnitSystem;
}

interface ScaleInfo {
  pixelsPerUnit: number;
  unit: LengthUnit;
  confidence: number;
  source: 'detected' | 'manual' | 'estimated';
}

interface DimensionString {
  raw: string;
  value: number;
  unit: LengthUnit;
  secondary?: {
    value: number;
    unit: LengthUnit;
  };
}

export class DimensionCalculator {
  private scaleInfo: ScaleInfo | null = null;
  private defaultUnit: LengthUnit = LengthUnit.FEET;
  private precision: number = 2;

  // Conversion factors to base units (meters for metric, feet for imperial)
  private readonly TO_METERS: Record<string, number> = {
    [LengthUnit.MILLIMETERS]: 0.001,
    [LengthUnit.CENTIMETERS]: 0.01,
    [LengthUnit.METERS]: 1,
    [LengthUnit.KILOMETERS]: 1000,
    [LengthUnit.INCHES]: 0.0254,
    [LengthUnit.FEET]: 0.3048,
    [LengthUnit.YARDS]: 0.9144,
    [LengthUnit.MILES]: 1609.344
  };

  private readonly TO_FEET: Record<string, number> = {
    [LengthUnit.INCHES]: 1 / 12,
    [LengthUnit.FEET]: 1,
    [LengthUnit.YARDS]: 3,
    [LengthUnit.MILES]: 5280,
    [LengthUnit.MILLIMETERS]: 0.00328084,
    [LengthUnit.CENTIMETERS]: 0.0328084,
    [LengthUnit.METERS]: 3.28084,
    [LengthUnit.KILOMETERS]: 3280.84
  };

  private readonly TO_SQUARE_FEET: Record<string, number> = {
    [AreaUnit.SQUARE_INCHES]: 1 / 144,
    [AreaUnit.SQUARE_FEET]: 1,
    [AreaUnit.SQUARE_YARDS]: 9,
    [AreaUnit.ACRES]: 43560,
    [AreaUnit.SQUARE_MILLIMETERS]: 0.0000107639,
    [AreaUnit.SQUARE_CENTIMETERS]: 0.00107639,
    [AreaUnit.SQUARE_METERS]: 10.7639,
    [AreaUnit.HECTARES]: 107639
  };

  /**
   * Set the scale for pixel to real-world conversion
   */
  setScale(scale: ScaleInfo): void {
    this.scaleInfo = scale;
    console.log(`📏 Scale set: ${scale.pixelsPerUnit} pixels per ${scale.unit}`);
  }

  /**
   * Get current scale info
   */
  getScale(): ScaleInfo | null {
    return this.scaleInfo;
  }

  /**
   * Convert pixels to real-world dimension
   */
  pixelsToRealWorld(
    pixels: number,
    targetUnit?: LengthUnit
  ): ConversionResult {
    if (!this.scaleInfo) {
      throw new Error('Scale not set. Call setScale() first or use estimateScale()');
    }

    // Calculate value in scale units
    const valueInScaleUnit = pixels / this.scaleInfo.pixelsPerUnit;

    // Convert to target unit if specified
    const unit = targetUnit || this.scaleInfo.unit;
    const value = this.convertLength(
      valueInScaleUnit,
      this.scaleInfo.unit,
      unit
    );

    return {
      value,
      unit,
      formatted: this.formatDimension(value, unit),
      system: this.getUnitSystem(unit)
    };
  }

  /**
   * Convert real-world dimension to pixels
   */
  realWorldToPixels(
    value: number,
    unit: LengthUnit
  ): number {
    if (!this.scaleInfo) {
      throw new Error('Scale not set. Call setScale() first');
    }

    // Convert to scale unit
    const valueInScaleUnit = this.convertLength(
      value,
      unit,
      this.scaleInfo.unit
    );

    // Convert to pixels
    return valueInScaleUnit * this.scaleInfo.pixelsPerUnit;
  }

  /**
   * Calculate distance between two points
   */
  calculateDistance(
    point1: Point2D,
    point2: Point2D,
    unit?: LengthUnit
  ): ConversionResult {
    const pixelDistance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );

    return this.pixelsToRealWorld(pixelDistance, unit);
  }

  /**
   * Calculate perimeter of a polygon
   */
  calculatePerimeter(
    points: Point2D[],
    unit?: LengthUnit
  ): ConversionResult {
    if (points.length < 2) {
      return {
        value: 0,
        unit: unit || this.defaultUnit,
        formatted: '0',
        system: this.getUnitSystem(unit || this.defaultUnit)
      };
    }

    let totalPixels = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const distance = Math.sqrt(
        Math.pow(points[j].x - points[i].x, 2) +
        Math.pow(points[j].y - points[i].y, 2)
      );
      totalPixels += distance;
    }

    return this.pixelsToRealWorld(totalPixels, unit);
  }

  /**
   * Parse dimension string (e.g., "12'6"", "3.5m", "150 sq ft")
   */
  parseDimensionString(dimensionStr: string): DimensionString {
    const str = dimensionStr.trim();
    
    // Pattern for feet and inches: 12'6" or 12' 6"
    const feetInchesPattern = /^(\d+(?:\.\d+)?)'?\s*(\d+(?:\.\d+)?)?[""]?$/;
    
    // Pattern for single value with unit: 3.5m, 150cm, 10ft
    const singleValuePattern = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/;
    
    // Pattern for just a number (assume default unit)
    const numberOnlyPattern = /^(\d+(?:\.\d+)?)$/;

    let match = str.match(feetInchesPattern);
    if (match) {
      const feet = parseFloat(match[1]);
      const inches = match[2] ? parseFloat(match[2]) : 0;
      
      return {
        raw: str,
        value: feet + inches / 12,
        unit: LengthUnit.FEET,
        secondary: inches > 0 ? {
          value: inches,
          unit: LengthUnit.INCHES
        } : undefined
      };
    }

    match = str.match(singleValuePattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unitStr = match[2].toLowerCase();
      const unit = this.parseUnitString(unitStr);
      
      return {
        raw: str,
        value,
        unit
      };
    }

    match = str.match(numberOnlyPattern);
    if (match) {
      return {
        raw: str,
        value: parseFloat(match[1]),
        unit: this.defaultUnit
      };
    }

    throw new Error(`Unable to parse dimension string: ${str}`);
  }

  /**
   * Convert between length units
   */
  convertLength(
    value: number,
    fromUnit: LengthUnit,
    toUnit: LengthUnit
  ): number {
    if (fromUnit === toUnit) return value;

    // Convert through common base unit
    const fromSystem = this.getUnitSystem(fromUnit);
    const toSystem = this.getUnitSystem(toUnit);

    if (fromSystem === UnitSystem.METRIC && toSystem === UnitSystem.METRIC) {
      // Both metric: convert through meters
      const meters = value * this.TO_METERS[fromUnit];
      return meters / this.TO_METERS[toUnit];
    } else if (fromSystem === UnitSystem.IMPERIAL && toSystem === UnitSystem.IMPERIAL) {
      // Both imperial: convert through feet
      const feet = value * this.TO_FEET[fromUnit];
      return feet / this.TO_FEET[toUnit];
    } else {
      // Cross-system: convert through meters
      const meters = value * this.TO_METERS[fromUnit];
      return meters / this.TO_METERS[toUnit];
    }
  }

  /**
   * Convert between area units
   */
  convertArea(
    value: number,
    fromUnit: AreaUnit,
    toUnit: AreaUnit
  ): number {
    if (fromUnit === toUnit) return value;

    // Convert through square feet
    const squareFeet = value * this.TO_SQUARE_FEET[fromUnit];
    return squareFeet / this.TO_SQUARE_FEET[toUnit];
  }

  /**
   * Format dimension with appropriate precision and unit
   */
  formatDimension(
    value: number,
    unit: LengthUnit,
    options?: {
      precision?: number;
      includeUnit?: boolean;
      feetInches?: boolean;
    }
  ): string {
    const opts = {
      precision: options?.precision ?? this.precision,
      includeUnit: options?.includeUnit ?? true,
      feetInches: options?.feetInches ?? false
    };

    // Handle feet-inches format
    if (unit === LengthUnit.FEET && opts.feetInches && value > 0) {
      const feet = Math.floor(value);
      const inches = Math.round((value - feet) * 12);
      
      if (inches === 12) {
        return `${feet + 1}'`;
      } else if (inches === 0) {
        return `${feet}'`;
      } else {
        return `${feet}' ${inches}"`;
      }
    }

    // Regular format
    const rounded = this.roundToPrecision(value, opts.precision);
    const unitStr = opts.includeUnit ? ` ${this.getUnitAbbreviation(unit)}` : '';
    
    return `${rounded}${unitStr}`;
  }

  /**
   * Format area with appropriate unit
   */
  formatArea(
    value: number,
    unit: AreaUnit,
    options?: {
      precision?: number;
      includeUnit?: boolean;
    }
  ): string {
    const opts = {
      precision: options?.precision ?? this.precision,
      includeUnit: options?.includeUnit ?? true
    };

    const rounded = this.roundToPrecision(value, opts.precision);
    const unitStr = opts.includeUnit ? ` ${this.getAreaUnitAbbreviation(unit)}` : '';
    
    return `${rounded}${unitStr}`;
  }

  /**
   * Estimate scale from known dimension
   */
  estimateScale(
    pixelDistance: number,
    realWorldDistance: number,
    unit: LengthUnit
  ): ScaleInfo {
    const pixelsPerUnit = pixelDistance / realWorldDistance;
    
    const scale: ScaleInfo = {
      pixelsPerUnit,
      unit,
      confidence: 0.9, // High confidence for manual calibration
      source: 'manual'
    };

    this.setScale(scale);
    return scale;
  }

  /**
   * Calculate scale from two reference points
   */
  calculateScaleFromReference(
    point1: Point2D,
    point2: Point2D,
    realWorldDistance: number,
    unit: LengthUnit
  ): ScaleInfo {
    const pixelDistance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );

    return this.estimateScale(pixelDistance, realWorldDistance, unit);
  }

  /**
   * Validate dimension consistency
   */
  validateDimensions(
    dimensions: Dimension[]
  ): {
    isConsistent: boolean;
    issues: string[];
    suggestedScale?: ScaleInfo;
  } {
    if (dimensions.length < 2) {
      return {
        isConsistent: true,
        issues: []
      };
    }

    const issues: string[] = [];
    const scales: number[] = [];

    // Calculate implied scale for each dimension
    for (const dim of dimensions) {
      const impliedScale = dim.pixels / dim.value;
      scales.push(impliedScale);
    }

    // Check consistency
    const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
    const maxDeviation = Math.max(...scales.map(s => Math.abs(s - avgScale) / avgScale));

    if (maxDeviation > 0.1) { // More than 10% deviation
      issues.push(`Inconsistent scales detected. Max deviation: ${(maxDeviation * 100).toFixed(1)}%`);
    }

    // Check for unrealistic dimensions
    for (const dim of dimensions) {
      if (dim.unit === LengthUnit.FEET) {
        if (dim.value < 1 || dim.value > 100) {
          issues.push(`Unrealistic dimension: ${dim.value} ${dim.unit}`);
        }
      } else if (dim.unit === LengthUnit.METERS) {
        if (dim.value < 0.3 || dim.value > 30) {
          issues.push(`Unrealistic dimension: ${dim.value} ${dim.unit}`);
        }
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues,
      suggestedScale: issues.length > 0 ? {
        pixelsPerUnit: avgScale,
        unit: dimensions[0].unit,
        confidence: 0.6,
        source: 'estimated'
      } : undefined
    };
  }

  /**
   * Convert dimension to different unit systems
   */
  convertToSystem(
    value: number,
    currentUnit: LengthUnit,
    targetSystem: UnitSystem
  ): ConversionResult {
    const currentSystem = this.getUnitSystem(currentUnit);
    
    if (currentSystem === targetSystem) {
      return {
        value,
        unit: currentUnit,
        formatted: this.formatDimension(value, currentUnit),
        system: targetSystem
      };
    }

    // Determine target unit
    let targetUnit: LengthUnit;
    if (targetSystem === UnitSystem.METRIC) {
      // Convert to meters by default
      targetUnit = LengthUnit.METERS;
      
      // Use more appropriate unit based on magnitude
      const meters = this.convertLength(value, currentUnit, LengthUnit.METERS);
      if (meters < 0.01) {
        targetUnit = LengthUnit.MILLIMETERS;
      } else if (meters < 1) {
        targetUnit = LengthUnit.CENTIMETERS;
      } else if (meters > 1000) {
        targetUnit = LengthUnit.KILOMETERS;
      }
    } else {
      // Convert to feet by default
      targetUnit = LengthUnit.FEET;
      
      // Use more appropriate unit based on magnitude
      const feet = this.convertLength(value, currentUnit, LengthUnit.FEET);
      if (feet < 1) {
        targetUnit = LengthUnit.INCHES;
      } else if (feet > 5280) {
        targetUnit = LengthUnit.MILES;
      }
    }

    const convertedValue = this.convertLength(value, currentUnit, targetUnit);

    return {
      value: convertedValue,
      unit: targetUnit,
      formatted: this.formatDimension(convertedValue, targetUnit),
      system: targetSystem
    };
  }

  /**
   * Batch convert dimensions
   */
  batchConvert(
    dimensions: Array<{ value: number; unit: LengthUnit }>,
    targetUnit: LengthUnit
  ): ConversionResult[] {
    return dimensions.map(dim => {
      const converted = this.convertLength(dim.value, dim.unit, targetUnit);
      return {
        value: converted,
        unit: targetUnit,
        formatted: this.formatDimension(converted, targetUnit),
        system: this.getUnitSystem(targetUnit)
      };
    });
  }

  /**
   * Calculate dimension ratios
   */
  calculateRatio(
    dimension1: { value: number; unit: LengthUnit },
    dimension2: { value: number; unit: LengthUnit }
  ): number {
    // Convert both to same unit
    const value2InUnit1 = this.convertLength(
      dimension2.value,
      dimension2.unit,
      dimension1.unit
    );

    return dimension1.value / value2InUnit1;
  }

  /**
   * Helper methods
   */

  private parseUnitString(unitStr: string): LengthUnit {
    const unitMap: Record<string, LengthUnit> = {
      // Imperial
      'in': LengthUnit.INCHES,
      'inch': LengthUnit.INCHES,
      'inches': LengthUnit.INCHES,
      '"': LengthUnit.INCHES,
      'ft': LengthUnit.FEET,
      'feet': LengthUnit.FEET,
      'foot': LengthUnit.FEET,
      "'": LengthUnit.FEET,
      'yd': LengthUnit.YARDS,
      'yard': LengthUnit.YARDS,
      'yards': LengthUnit.YARDS,
      'mi': LengthUnit.MILES,
      'mile': LengthUnit.MILES,
      'miles': LengthUnit.MILES,
      
      // Metric
      'mm': LengthUnit.MILLIMETERS,
      'millimeter': LengthUnit.MILLIMETERS,
      'millimeters': LengthUnit.MILLIMETERS,
      'cm': LengthUnit.CENTIMETERS,
      'centimeter': LengthUnit.CENTIMETERS,
      'centimeters': LengthUnit.CENTIMETERS,
      'm': LengthUnit.METERS,
      'meter': LengthUnit.METERS,
      'meters': LengthUnit.METERS,
      'km': LengthUnit.KILOMETERS,
      'kilometer': LengthUnit.KILOMETERS,
      'kilometers': LengthUnit.KILOMETERS
    };

    const unit = unitMap[unitStr.toLowerCase()];
    if (!unit) {
      throw new Error(`Unknown unit: ${unitStr}`);
    }

    return unit;
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

  private roundToPrecision(value: number, precision: number): string {
    if (precision === 0) {
      return Math.round(value).toString();
    }

    const multiplier = Math.pow(10, precision);
    const rounded = Math.round(value * multiplier) / multiplier;
    
    // Format with fixed decimals if needed
    if (precision > 0 && rounded % 1 !== 0) {
      return rounded.toFixed(precision);
    }
    
    return rounded.toString();
  }

  /**
   * Get common scales for floor plans
   */
  getCommonScales(): Array<{ name: string; scale: ScaleInfo }> {
    return [
      {
        name: '1:50 (Metric)',
        scale: {
          pixelsPerUnit: 20,
          unit: LengthUnit.CENTIMETERS,
          confidence: 1,
          source: 'manual'
        }
      },
      {
        name: '1:100 (Metric)',
        scale: {
          pixelsPerUnit: 10,
          unit: LengthUnit.CENTIMETERS,
          confidence: 1,
          source: 'manual'
        }
      },
      {
        name: '1/4" = 1\' (Imperial)',
        scale: {
          pixelsPerUnit: 48,
          unit: LengthUnit.FEET,
          confidence: 1,
          source: 'manual'
        }
      },
      {
        name: '1/8" = 1\' (Imperial)',
        scale: {
          pixelsPerUnit: 96,
          unit: LengthUnit.FEET,
          confidence: 1,
          source: 'manual'
        }
      },
      {
        name: '1" = 10\' (Imperial)',
        scale: {
          pixelsPerUnit: 120,
          unit: LengthUnit.FEET,
          confidence: 1,
          source: 'manual'
        }
      }
    ];
  }
}

// Export singleton instance
export const dimensionCalculator = new DimensionCalculator();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { dimensionCalculator, LengthUnit, UnitSystem } from './services/geometry/dimension-calculator';

// Set scale (e.g., 10 pixels = 1 foot)
dimensionCalculator.setScale({
  pixelsPerUnit: 10,
  unit: LengthUnit.FEET,
  confidence: 0.95,
  source: 'detected'
});

// Convert pixel measurements
const realWorldDim = dimensionCalculator.pixelsToRealWorld(150);
console.log(`150 pixels = ${realWorldDim.formatted}`); // "15 ft"

// Calculate distance between points
const distance = dimensionCalculator.calculateDistance(
  { x: 100, y: 100 },
  { x: 200, y: 200 },
  LengthUnit.METERS
);
console.log(`Distance: ${distance.formatted}`); // "4.29 m"

// Parse dimension strings
const parsed = dimensionCalculator.parseDimensionString("12'6\"");
console.log(`Parsed: ${parsed.value} ${parsed.unit}`); // "12.5 feet"

// Convert between units
const meters = dimensionCalculator.convertLength(10, LengthUnit.FEET, LengthUnit.METERS);
console.log(`10 ft = ${meters.toFixed(2)} m`); // "3.05 m"

// Format dimensions
const formatted = dimensionCalculator.formatDimension(
  12.5,
  LengthUnit.FEET,
  { feetInches: true }
);
console.log(formatted); // "12' 6""

// Convert to different unit system
const metric = dimensionCalculator.convertToSystem(
  10,
  LengthUnit.FEET,
  UnitSystem.METRIC
);
console.log(`10 ft = ${metric.formatted}`); // "3.05 m"

// Validate dimension consistency
const dimensions = [
  { value: 10, unit: LengthUnit.FEET, pixels: 100, confidence: 0.9 },
  { value: 15, unit: LengthUnit.FEET, pixels: 150, confidence: 0.85 },
  { value: 8, unit: LengthUnit.FEET, pixels: 85, confidence: 0.8 }
];

const validation = dimensionCalculator.validateDimensions(dimensions);
console.log(`Dimensions consistent: ${validation.isConsistent}`);
*/