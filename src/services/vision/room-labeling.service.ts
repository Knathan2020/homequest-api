// ========================================
// ROOM LABELING SERVICE - room-labeling.service.ts
// Identifies and labels room types using AI and pattern recognition
// ========================================

import * as tf from '@tensorflow/tfjs';
import { EnhancedOCRService } from '../enhanced-ocr.service';

export interface RoomFeatures {
  area: number;
  perimeter: number;
  aspectRatio: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  hasFixtures?: boolean;
  nearKitchen?: boolean;
  nearBathroom?: boolean;
  textLabels?: string[];
  position?: 'corner' | 'center' | 'edge';
  adjacentRooms?: string[];
}

export interface LabeledRoom {
  id: string;
  type: string;
  confidence: number;
  features: RoomFeatures;
  alternativeLabels?: { type: string; confidence: number }[];
  boundary?: { x: number; y: number; width: number; height: number };
}

export class RoomLabelingService {
  private ocrService: EnhancedOCRService;
  private roomPatterns: Map<string, Partial<RoomFeatures>>;
  
  constructor() {
    this.ocrService = new EnhancedOCRService();
    this.roomPatterns = this.initializeRoomPatterns();
  }

  /**
   * Initialize typical room patterns for classification
   */
  private initializeRoomPatterns(): Map<string, Partial<RoomFeatures>> {
    const patterns = new Map<string, Partial<RoomFeatures>>();
    
    // Bedroom patterns
    patterns.set('bedroom', {
      area: 120, // avg sq ft
      aspectRatio: 1.2,
      doorCount: 1,
      windowCount: 1,
      wallCount: 4
    });
    
    patterns.set('master_bedroom', {
      area: 200,
      aspectRatio: 1.3,
      doorCount: 2, // includes bathroom door
      windowCount: 2,
      wallCount: 4
    });
    
    // Bathroom patterns
    patterns.set('bathroom', {
      area: 40,
      aspectRatio: 1.5,
      doorCount: 1,
      windowCount: 0,
      hasFixtures: true,
      wallCount: 4
    });
    
    patterns.set('master_bathroom', {
      area: 80,
      aspectRatio: 1.2,
      doorCount: 1,
      windowCount: 1,
      hasFixtures: true,
      nearBathroom: false
    });
    
    // Kitchen patterns
    patterns.set('kitchen', {
      area: 150,
      aspectRatio: 1.4,
      doorCount: 2,
      windowCount: 1,
      hasFixtures: true,
      wallCount: 4
    });
    
    // Living areas
    patterns.set('living_room', {
      area: 250,
      aspectRatio: 1.5,
      doorCount: 2,
      windowCount: 2,
      position: 'center',
      wallCount: 4
    });
    
    patterns.set('dining_room', {
      area: 140,
      aspectRatio: 1.2,
      doorCount: 2,
      windowCount: 1,
      nearKitchen: true,
      wallCount: 4
    });
    
    // Utility rooms
    patterns.set('laundry', {
      area: 35,
      aspectRatio: 1.0,
      doorCount: 1,
      windowCount: 0,
      hasFixtures: true,
      wallCount: 4
    });
    
    patterns.set('closet', {
      area: 20,
      aspectRatio: 2.0,
      doorCount: 1,
      windowCount: 0,
      wallCount: 3
    });
    
    patterns.set('garage', {
      area: 400,
      aspectRatio: 1.5,
      doorCount: 2,
      windowCount: 0,
      position: 'edge',
      wallCount: 4
    });
    
    patterns.set('hallway', {
      area: 50,
      aspectRatio: 3.0,
      doorCount: 3,
      windowCount: 0,
      position: 'center',
      wallCount: 4
    });
    
    patterns.set('office', {
      area: 100,
      aspectRatio: 1.1,
      doorCount: 1,
      windowCount: 1,
      wallCount: 4
    });
    
    patterns.set('pantry', {
      area: 25,
      aspectRatio: 1.5,
      doorCount: 1,
      windowCount: 0,
      nearKitchen: true,
      wallCount: 4
    });
    
    return patterns;
  }

  /**
   * Label rooms based on their features
   */
  public async labelRooms(
    rooms: any[],
    imagePath?: string
  ): Promise<LabeledRoom[]> {
    const labeledRooms: LabeledRoom[] = [];
    
    // Extract text labels from image if provided
    let textLabels: string[] = [];
    if (imagePath) {
      try {
        const ocrResult = await this.ocrService.extractText(imagePath);
        textLabels = this.extractRoomLabelsFromText(ocrResult.text);
      } catch (error) {
        console.log('OCR text extraction failed, using pattern matching only');
      }
    }
    
    for (const room of rooms) {
      const features = this.extractRoomFeatures(room);
      const labeledRoom = this.classifyRoom(features, textLabels);
      labeledRooms.push(labeledRoom);
    }
    
    // Post-process to improve accuracy based on relationships
    this.refineLabelsBasedOnRelationships(labeledRooms);
    
    return labeledRooms;
  }

  /**
   * Extract features from a room object
   */
  private extractRoomFeatures(room: any): RoomFeatures {
    const features: RoomFeatures = {
      area: room.area || 0,
      perimeter: room.perimeter || 0,
      aspectRatio: this.calculateAspectRatio(room),
      wallCount: room.walls?.length || 4,
      doorCount: room.doors?.length || 0,
      windowCount: room.windows?.length || 0,
      hasFixtures: room.fixtures?.length > 0,
      position: this.determinePosition(room),
      textLabels: []
    };
    
    return features;
  }

  /**
   * Classify a room based on its features
   */
  private classifyRoom(
    features: RoomFeatures,
    textLabels: string[]
  ): LabeledRoom {
    const scores = new Map<string, number>();
    
    // Check for text label matches first
    const matchedLabel = this.findTextLabelMatch(features, textLabels);
    if (matchedLabel) {
      return {
        id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: matchedLabel,
        confidence: 0.9,
        features,
        alternativeLabels: []
      };
    }
    
    // Calculate similarity scores for each room type
    for (const [roomType, pattern] of this.roomPatterns.entries()) {
      const score = this.calculateSimilarityScore(features, pattern);
      scores.set(roomType, score);
    }
    
    // Sort by score
    const sortedScores = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]);
    
    // Get top match and alternatives
    const topMatch = sortedScores[0];
    const alternatives = sortedScores.slice(1, 4).map(([type, score]) => ({
      type,
      confidence: score
    }));
    
    return {
      id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: topMatch[0],
      confidence: topMatch[1],
      features,
      alternativeLabels: alternatives
    };
  }

  /**
   * Calculate similarity score between features and pattern
   */
  private calculateSimilarityScore(
    features: RoomFeatures,
    pattern: Partial<RoomFeatures>
  ): number {
    let score = 0;
    let weights = 0;
    
    // Area similarity (most important)
    if (pattern.area) {
      const areaDiff = Math.abs(features.area - pattern.area) / pattern.area;
      const areaScore = Math.max(0, 1 - areaDiff);
      score += areaScore * 3;
      weights += 3;
    }
    
    // Aspect ratio similarity
    if (pattern.aspectRatio) {
      const ratioDiff = Math.abs(features.aspectRatio - pattern.aspectRatio);
      const ratioScore = Math.max(0, 1 - ratioDiff);
      score += ratioScore * 2;
      weights += 2;
    }
    
    // Door count match
    if (pattern.doorCount !== undefined) {
      const doorMatch = features.doorCount === pattern.doorCount ? 1 : 0.5;
      score += doorMatch * 2;
      weights += 2;
    }
    
    // Window count match
    if (pattern.windowCount !== undefined) {
      const windowMatch = features.windowCount === pattern.windowCount ? 1 : 0.5;
      score += windowMatch * 1;
      weights += 1;
    }
    
    // Fixtures presence
    if (pattern.hasFixtures !== undefined) {
      const fixtureMatch = features.hasFixtures === pattern.hasFixtures ? 1 : 0;
      score += fixtureMatch * 2;
      weights += 2;
    }
    
    // Position match
    if (pattern.position && features.position) {
      const posMatch = features.position === pattern.position ? 1 : 0.3;
      score += posMatch * 1;
      weights += 1;
    }
    
    return weights > 0 ? score / weights : 0;
  }

  /**
   * Extract room labels from OCR text
   */
  private extractRoomLabelsFromText(text: string): string[] {
    const labels: string[] = [];
    const roomKeywords = [
      'bedroom', 'bed', 'br',
      'bathroom', 'bath', 'ba',
      'kitchen', 'kit',
      'living', 'living room', 'lr',
      'dining', 'dining room', 'dr',
      'office', 'study',
      'garage', 'gar',
      'closet', 'cl',
      'laundry', 'utility',
      'master', 'mbr',
      'guest',
      'hallway', 'hall',
      'pantry',
      'foyer', 'entry'
    ];
    
    const lowerText = text.toLowerCase();
    for (const keyword of roomKeywords) {
      if (lowerText.includes(keyword)) {
        labels.push(keyword);
      }
    }
    
    return labels;
  }

  /**
   * Find matching text label for room
   */
  private findTextLabelMatch(
    features: RoomFeatures,
    textLabels: string[]
  ): string | null {
    // Map text labels to standard room types
    const labelMap: { [key: string]: string } = {
      'bedroom': 'bedroom',
      'bed': 'bedroom',
      'br': 'bedroom',
      'master': 'master_bedroom',
      'mbr': 'master_bedroom',
      'bathroom': 'bathroom',
      'bath': 'bathroom',
      'ba': 'bathroom',
      'kitchen': 'kitchen',
      'kit': 'kitchen',
      'living': 'living_room',
      'lr': 'living_room',
      'dining': 'dining_room',
      'dr': 'dining_room',
      'office': 'office',
      'study': 'office',
      'garage': 'garage',
      'gar': 'garage',
      'closet': 'closet',
      'cl': 'closet',
      'laundry': 'laundry',
      'utility': 'laundry',
      'hallway': 'hallway',
      'hall': 'hallway',
      'pantry': 'pantry',
      'foyer': 'hallway',
      'entry': 'hallway'
    };
    
    for (const label of textLabels) {
      if (labelMap[label]) {
        return labelMap[label];
      }
    }
    
    return null;
  }

  /**
   * Calculate aspect ratio of room
   */
  private calculateAspectRatio(room: any): number {
    if (room.boundingBox) {
      const { width, height } = room.boundingBox;
      return Math.max(width, height) / Math.min(width, height);
    }
    return 1.0;
  }

  /**
   * Determine room position in floor plan
   */
  private determinePosition(room: any): 'corner' | 'center' | 'edge' {
    // Simple heuristic based on wall count and connections
    const wallCount = room.walls?.length || 0;
    const doorCount = room.doors?.length || 0;
    
    if (wallCount === 2) return 'corner';
    if (doorCount >= 3) return 'center';
    if (wallCount === 3) return 'edge';
    
    return 'center';
  }

  /**
   * Refine labels based on room relationships
   */
  private refineLabelsBasedOnRelationships(rooms: LabeledRoom[]): void {
    // Find kitchen
    const kitchen = rooms.find(r => r.type === 'kitchen');
    
    // Rooms near kitchen are likely dining room or pantry
    if (kitchen) {
      for (const room of rooms) {
        if (room.type === 'unknown' && room.features.area < 50) {
          // Small room near kitchen is likely pantry
          room.type = 'pantry';
          room.confidence = 0.7;
        }
      }
    }
    
    // Master bedroom should have attached bathroom
    const masterBedroom = rooms.find(r => r.type === 'master_bedroom');
    if (masterBedroom) {
      // Find adjacent bathrooms
      for (const room of rooms) {
        if (room.type === 'bathroom' && room.features.area > 60) {
          room.type = 'master_bathroom';
          room.confidence = 0.8;
        }
      }
    }
    
    // Hallways connect multiple rooms
    for (const room of rooms) {
      if (room.features.doorCount >= 3 && room.features.aspectRatio > 2) {
        room.type = 'hallway';
        room.confidence = 0.75;
      }
    }
  }

  /**
   * Get room type statistics
   */
  public getRoomTypeStats(rooms: LabeledRoom[]): Map<string, number> {
    const stats = new Map<string, number>();
    
    for (const room of rooms) {
      const count = stats.get(room.type) || 0;
      stats.set(room.type, count + 1);
    }
    
    return stats;
  }
}