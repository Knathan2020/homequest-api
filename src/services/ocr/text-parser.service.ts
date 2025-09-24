/**
 * Text Parser Service
 * Parse room labels and dimensions from OCR text (handles various formats)
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Room type mapping
 */
export const ROOM_TYPE_PATTERNS: Record<string, RegExp[]> = {
  'living_room': [
    /living\s*room/i,
    /lounge/i,
    /family\s*room/i,
    /great\s*room/i,
    /l\.r\./i,
    /salon/i,
    /sitting\s*room/i
  ],
  'bedroom': [
    /bed\s*room/i,
    /master\s*bed/i,
    /guest\s*room/i,
    /b\.r\./i,
    /bdrm/i,
    /sleeping/i,
    /chambre/i
  ],
  'bathroom': [
    /bath\s*room/i,
    /bath/i,
    /w\.c\./i,
    /toilet/i,
    /powder\s*room/i,
    /ensuite/i,
    /lavatory/i,
    /restroom/i
  ],
  'kitchen': [
    /kitchen/i,
    /kit\./i,
    /cuisine/i,
    /pantry/i,
    /galley/i,
    /cookhouse/i
  ],
  'dining_room': [
    /dining\s*room/i,
    /dining/i,
    /d\.r\./i,
    /dinette/i,
    /breakfast\s*nook/i,
    /eating\s*area/i
  ],
  'office': [
    /office/i,
    /study/i,
    /den/i,
    /library/i,
    /work\s*room/i,
    /bureau/i
  ],
  'garage': [
    /garage/i,
    /gar\./i,
    /carport/i,
    /parking/i,
    /car\s*space/i
  ],
  'hallway': [
    /hall\s*way/i,
    /hall/i,
    /corridor/i,
    /foyer/i,
    /entry/i,
    /vestibule/i,
    /passage/i
  ],
  'closet': [
    /closet/i,
    /cl\./i,
    /wardrobe/i,
    /walk-in/i,
    /storage/i,
    /utility/i
  ],
  'laundry': [
    /laundry/i,
    /utility\s*room/i,
    /mud\s*room/i,
    /wash\s*room/i,
    /service\s*room/i
  ],
  'balcony': [
    /balcony/i,
    /balc\./i,
    /terrace/i,
    /deck/i,
    /patio/i,
    /veranda/i,
    /porch/i
  ]
};

/**
 * Dimension patterns for various formats
 */
export const DIMENSION_PATTERNS = {
  // 12'6" x 10'8" (feet and inches)
  feetInches: /(\d+)[''2]\s*(\d+)?["3]?\s*[xX�]\s*(\d+)[''2]\s*(\d+)?["3]?/,
  
  // 12.5 x 10.8 (decimal feet)
  decimalFeet: /(\d+\.?\d*)\s*[xX�]\s*(\d+\.?\d*)/,
  
  // 3.8m x 3.2m (metric)
  metric: /(\d+\.?\d*)\s*m\s*[xX�]\s*(\d+\.?\d*)\s*m/i,
  
  // Single dimension: 150 sq ft or 15 m�
  area: /(\d+\.?\d*)\s*(sq\.?\s*ft|ft�|m�|sqm|square\s*feet|square\s*meters)/i,
  
  // Wall dimension: 10'-6"
  singleFeetInches: /(\d+)[''2]\s*[-]?\s*(\d+)?["3]?/,
  
  // Simple number (context-dependent)
  simpleNumber: /(\d+\.?\d*)/
};

/**
 * Scale patterns
 */
export const SCALE_PATTERNS = {
  // 1:100, 1/100, 1"=10'
  ratio: /1\s*[:\/=]\s*(\d+)/,
  inchToFeet: /1["3]\s*=\s*(\d+)[''2]/,
  metricScale: /1\s*:\s*(\d+)/
};

/**
 * Parsed room data
 */
export interface ParsedRoom {
  name: string;
  type: string;
  dimensions?: {
    width?: number;
    height?: number;
    area?: number;
    unit: 'feet' | 'meters';
  };
  confidence: number;
  rawText: string;
}

/**
 * Parsed dimension
 */
export interface ParsedDimension {
  value: number;
  unit: 'feet' | 'meters' | 'inches';
  type: 'width' | 'height' | 'area' | 'length';
  confidence: number;
  rawText: string;
}

/**
 * Parsed floor plan data
 */
export interface ParsedFloorPlanData {
  title?: string;
  rooms: ParsedRoom[];
  dimensions: ParsedDimension[];
  scale?: {
    ratio: number;
    unit: string;
  };
  totalArea?: {
    value: number;
    unit: string;
  };
  metadata: {
    architect?: string;
    date?: string;
    projectNumber?: string;
    address?: string;
  };
  rawText: string;
  confidence: number;
}

/**
 * Text Parser Service
 */
export class TextParserService {
  private defaultUnit: 'feet' | 'meters';
  private confidenceThreshold: number;

  constructor() {
    this.defaultUnit = (process.env.DEFAULT_UNIT as 'feet' | 'meters') || 'feet';
    this.confidenceThreshold = parseFloat(process.env.PARSER_CONFIDENCE_THRESHOLD || '0.6');
  }

  /**
   * Parse floor plan text from OCR
   */
  async parseFloorPlanText(
    rawText: string,
    regionResults?: any[]
  ): Promise<ParsedFloorPlanData> {
    console.log('=� Parsing floor plan text...');

    // Clean and normalize text
    const cleanedText = this.cleanText(rawText);
    const lines = cleanedText.split('\n').filter(line => line.trim());

    // Parse different components
    const title = this.extractTitle(lines);
    const rooms = this.extractRooms(lines, regionResults);
    const dimensions = this.extractDimensions(lines);
    const scale = this.extractScale(lines);
    const totalArea = this.calculateTotalArea(rooms, dimensions);
    const metadata = this.extractMetadata(lines);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(rooms, dimensions);

    return {
      title,
      rooms,
      dimensions,
      scale,
      totalArea,
      metadata,
      rawText,
      confidence
    };
  }

  /**
   * Parse room labels with dimensions
   */
  parseRoomLabel(text: string): ParsedRoom | null {
    const cleanedText = this.cleanText(text);
    
    // Detect room type
    const roomType = this.detectRoomType(cleanedText);
    if (!roomType) return null;

    // Extract room name
    const roomName = this.extractRoomName(cleanedText, roomType);

    // Extract dimensions if present
    const dimensions = this.extractRoomDimensions(cleanedText);

    return {
      name: roomName,
      type: roomType,
      dimensions,
      confidence: dimensions ? 0.9 : 0.7,
      rawText: text
    };
  }

  /**
   * Parse dimension string (handles various formats)
   */
  parseDimension(text: string): ParsedDimension | null {
    const cleanedText = this.cleanText(text);

    // Try feet and inches format (12'6" x 10'8")
    let match = cleanedText.match(DIMENSION_PATTERNS.feetInches);
    if (match) {
      const width = this.convertFeetInchesToDecimal(
        parseInt(match[1]),
        match[2] ? parseInt(match[2]) : 0
      );
      void this.convertFeetInchesToDecimal(
        parseInt(match[3]),
        match[4] ? parseInt(match[4]) : 0
      ); // Suppress unused variable

      return {
        value: width,
        unit: 'feet',
        type: 'width',
        confidence: 0.95,
        rawText: text
      };
    }

    // Try decimal feet format (12.5 x 10.8)
    match = cleanedText.match(DIMENSION_PATTERNS.decimalFeet);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: 'feet',
        type: 'width',
        confidence: 0.9,
        rawText: text
      };
    }

    // Try metric format (3.8m x 3.2m)
    match = cleanedText.match(DIMENSION_PATTERNS.metric);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: 'meters',
        type: 'width',
        confidence: 0.95,
        rawText: text
      };
    }

    // Try area format (150 sq ft)
    match = cleanedText.match(DIMENSION_PATTERNS.area);
    if (match) {
      const unit = match[2].toLowerCase().includes('m') ? 'meters' : 'feet';
      return {
        value: parseFloat(match[1]),
        unit,
        type: 'area',
        confidence: 0.9,
        rawText: text
      };
    }

    // Try single dimension
    match = cleanedText.match(DIMENSION_PATTERNS.singleFeetInches);
    if (match) {
      const value = this.convertFeetInchesToDecimal(
        parseInt(match[1]),
        match[2] ? parseInt(match[2]) : 0
      );
      return {
        value,
        unit: 'feet',
        type: 'length',
        confidence: 0.8,
        rawText: text
      };
    }

    return null;
  }

  /**
   * Parse multiple languages
   */
  async parseMultiLanguage(text: string, language: string = 'en'): Promise<ParsedFloorPlanData> {
    // Language-specific room patterns
    const languagePatterns: Record<string, Record<string, string>> = {
      'es': {
        'dormitorio': 'bedroom',
        'cocina': 'kitchen',
        'ba�o': 'bathroom',
        'sala': 'living_room'
      },
      'fr': {
        'chambre': 'bedroom',
        'cuisine': 'kitchen',
        'salle de bain': 'bathroom',
        'salon': 'living_room'
      },
      'de': {
        'schlafzimmer': 'bedroom',
        'k�che': 'kitchen',
        'badezimmer': 'bathroom',
        'wohnzimmer': 'living_room'
      }
    };

    // Apply language-specific parsing
    let processedText = text;
    if (language !== 'en' && languagePatterns[language]) {
      const patterns = languagePatterns[language];
      for (const [foreign, english] of Object.entries(patterns)) {
        processedText = processedText.replace(new RegExp(foreign, 'gi'), english);
      }
    }

    return await this.parseFloorPlanText(processedText);
  }

  // ============================
  // Private Methods
  // ============================

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .replace(/[^\w\s\d.,'"\-�x���()[\]{}<>:;\/\\|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract title from floor plan
   */
  private extractTitle(lines: string[]): string | undefined {
    // Look for common title patterns
    const titlePatterns = [
      /floor\s*plan/i,
      /ground\s*floor/i,
      /first\s*floor/i,
      /second\s*floor/i,
      /basement/i,
      /level\s*\d+/i,
      /unit\s*\w+/i
    ];

    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      for (const pattern of titlePatterns) {
        if (pattern.test(line)) {
          return line.trim();
        }
      }
    }

    return undefined;
  }

  /**
   * Extract rooms from text
   */
  private extractRooms(lines: string[], regionResults?: any[]): ParsedRoom[] {
    const rooms: ParsedRoom[] = [];
    const processedRooms = new Set<string>();

    // Process region-specific results first
    if (regionResults) {
      for (const region of regionResults) {
        if (region.region.label === 'rooms' && region.result) {
          const roomLines = region.result.text.split('\n');
          for (const line of roomLines) {
            const room = this.parseRoomLabel(line);
            if (room && !processedRooms.has(room.name)) {
              rooms.push(room);
              processedRooms.add(room.name);
            }
          }
        }
      }
    }

    // Process all lines
    for (const line of lines) {
      const room = this.parseRoomLabel(line);
      if (room && !processedRooms.has(room.name)) {
        rooms.push(room);
        processedRooms.add(room.name);
      }
    }

    return rooms;
  }

  /**
   * Extract dimensions from text
   */
  private extractDimensions(lines: string[]): ParsedDimension[] {
    const dimensions: ParsedDimension[] = [];

    for (const line of lines) {
      const dimension = this.parseDimension(line);
      if (dimension) {
        dimensions.push(dimension);
      }
    }

    return dimensions;
  }

  /**
   * Extract scale from floor plan
   */
  private extractScale(lines: string[]): { ratio: number; unit: string } | undefined {
    for (const line of lines) {
      // Check for ratio scale (1:100)
      let match = line.match(SCALE_PATTERNS.ratio);
      if (match) {
        return {
          ratio: parseInt(match[1]),
          unit: 'ratio'
        };
      }

      // Check for inch to feet scale (1"=10')
      match = line.match(SCALE_PATTERNS.inchToFeet);
      if (match) {
        return {
          ratio: parseInt(match[1]),
          unit: 'feet'
        };
      }
    }

    return undefined;
  }

  /**
   * Extract metadata from floor plan
   */
  private extractMetadata(lines: string[]): any {
    const metadata: any = {};

    // Common metadata patterns
    const patterns = {
      architect: /architect[:\s]+([^,\n]+)/i,
      date: /date[:\s]+([^,\n]+)/i,
      projectNumber: /project\s*(?:no|number)[:\s]+([^,\n]+)/i,
      address: /address[:\s]+([^,\n]+)/i
    };

    for (const line of lines) {
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          metadata[key] = match[1].trim();
        }
      }
    }

    return metadata;
  }

  /**
   * Detect room type from text
   */
  private detectRoomType(text: string): string | null {
    const lowerText = text.toLowerCase();

    for (const [roomType, patterns] of Object.entries(ROOM_TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerText)) {
          return roomType;
        }
      }
    }

    return null;
  }

  /**
   * Extract room name
   */
  private extractRoomName(text: string, roomType: string): string {
    // Try to extract a more specific name
    void text.split(/\s+/); // Suppress unused variable
    
    // Look for room numbers (e.g., "Bedroom 1", "Office 2")
    const numberMatch = text.match(/(\d+)/);
    if (numberMatch) {
      return `${this.formatRoomType(roomType)} ${numberMatch[1]}`;
    }

    // Look for descriptors (e.g., "Master Bedroom", "Guest Room")
    const descriptors = ['master', 'guest', 'main', 'primary', 'secondary'];
    for (const descriptor of descriptors) {
      if (text.toLowerCase().includes(descriptor)) {
        return `${this.capitalize(descriptor)} ${this.formatRoomType(roomType)}`;
      }
    }

    return this.formatRoomType(roomType);
  }

  /**
   * Extract room dimensions
   */
  private extractRoomDimensions(text: string): any {
    // Try to find dimensions in the same line as room name
    const dimension = this.parseDimension(text);
    
    if (dimension) {
      // Try to extract both width and height
      const match = text.match(/(\d+\.?\d*)\s*[xX�]\s*(\d+\.?\d*)/);
      if (match) {
        const width = parseFloat(match[1]);
        const height = parseFloat(match[2]);
        const area = width * height;

        return {
          width,
          height,
          area,
          unit: dimension.unit
        };
      }

      // Single dimension (might be area)
      if (dimension.type === 'area') {
        return {
          area: dimension.value,
          unit: dimension.unit
        };
      }
    }

    return undefined;
  }

  /**
   * Convert feet and inches to decimal feet
   */
  private convertFeetInchesToDecimal(feet: number, inches: number): number {
    return feet + (inches / 12);
  }

  /**
   * Calculate total area from rooms
   */
  private calculateTotalArea(
    rooms: ParsedRoom[],
    dimensions: ParsedDimension[]
  ): { value: number; unit: string } | undefined {
    let totalArea = 0;
    let unit = this.defaultUnit;

    // Sum up room areas
    for (const room of rooms) {
      if (room.dimensions?.area) {
        totalArea += room.dimensions.area;
        unit = room.dimensions.unit;
      }
    }

    // Look for explicit total area in dimensions
    const totalAreaDimension = dimensions.find(d => 
      d.type === 'area' && d.rawText.toLowerCase().includes('total')
    );

    if (totalAreaDimension) {
      return {
        value: totalAreaDimension.value,
        unit: totalAreaDimension.unit
      };
    }

    if (totalArea > 0) {
      return {
        value: totalArea,
        unit
      };
    }

    return undefined;
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(
    rooms: ParsedRoom[],
    dimensions: ParsedDimension[]
  ): number {
    if (rooms.length === 0 && dimensions.length === 0) {
      return 0;
    }

    let totalConfidence = 0;
    let count = 0;

    for (const room of rooms) {
      totalConfidence += room.confidence;
      count++;
    }

    for (const dimension of dimensions) {
      totalConfidence += dimension.confidence;
      count++;
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Format room type for display
   */
  private formatRoomType(type: string): string {
    return type
      .split('_')
      .map(word => this.capitalize(word))
      .join(' ');
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Validate parsed data
   */
  validateParsedData(data: ParsedFloorPlanData): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if any rooms were detected
    if (data.rooms.length === 0) {
      warnings.push('No rooms detected in floor plan');
    }

    // Check if dimensions make sense
    for (const room of data.rooms) {
      if (room.dimensions) {
        if (room.dimensions.width && room.dimensions.width > 100) {
          warnings.push(`Unusually large width for ${room.name}: ${room.dimensions.width}`);
        }
        if (room.dimensions.area && room.dimensions.area > 10000) {
          warnings.push(`Unusually large area for ${room.name}: ${room.dimensions.area}`);
        }
      }
    }

    // Check confidence levels
    if (data.confidence < this.confidenceThreshold) {
      warnings.push(`Low confidence score: ${data.confidence.toFixed(2)}`);
    }

    // Check for duplicate rooms
    const roomNames = data.rooms.map(r => r.name);
    const duplicates = roomNames.filter((name, index) => roomNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      warnings.push(`Duplicate room names detected: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format parsed data for output
   */
  formatOutput(data: ParsedFloorPlanData): string {
    let output = '';

    if (data.title) {
      output += `Title: ${data.title}\n\n`;
    }

    output += 'Rooms:\n';
    for (const room of data.rooms) {
      output += `  - ${room.name}`;
      if (room.dimensions) {
        if (room.dimensions.width && room.dimensions.height) {
          output += ` (${room.dimensions.width} x ${room.dimensions.height} ${room.dimensions.unit})`;
        } else if (room.dimensions.area) {
          output += ` (${room.dimensions.area} sq ${room.dimensions.unit})`;
        }
      }
      output += '\n';
    }

    if (data.totalArea) {
      output += `\nTotal Area: ${data.totalArea.value} sq ${data.totalArea.unit}\n`;
    }

    if (data.scale) {
      output += `Scale: 1:${data.scale.ratio}\n`;
    }

    if (Object.keys(data.metadata).length > 0) {
      output += '\nMetadata:\n';
      for (const [key, value] of Object.entries(data.metadata)) {
        output += `  ${key}: ${value}\n`;
      }
    }

    output += `\nConfidence: ${(data.confidence * 100).toFixed(1)}%`;

    return output;
  }
}

// Export singleton instance
export default new TextParserService();