// ========================================
// RAG LEARNING SERVICE - rag-learning.service.ts
// Saves wall detection data for continuous learning
// ========================================

import * as fs from 'fs';
import * as path from 'path';

interface FloorPlanLearningData {
  id: string;
  timestamp: Date;
  imageHash: string;
  walls: Array<{
    id: string;
    type: string;
    pattern?: string;
    source: string;
    coordinates: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
    thickness?: number;
    confidence: number;
    detectionPath?: string;
    isManual?: boolean;
    isDeleted?: boolean;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    type: string;
    squareFootage: number;
    isExterior: boolean;
    center?: { x: number; y: number };
    vertices?: Array<{ x: number; y: number }>;
    source: string;
    isManual?: boolean;
    isDeleted?: boolean;
    labelPosition?: { x: number; y: number };
  }>;
  doors: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    orientation?: string;
    swingDirection?: string;
    source: string;
    isManual?: boolean;
    isDeleted?: boolean;
  }>;
  windows: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    orientation?: string;
    source: string;
    isManual?: boolean;
    isDeleted?: boolean;
  }>;
  measurements: Array<{
    id: string;
    type: string;
    value: number;
    unit: string;
    location?: { x: number; y: number };
    source: string;
    isManual?: boolean;
    correctedFrom?: number;
  }>;
  metadata: {
    totalWalls: number;
    totalRooms: number;
    totalDoors: number;
    totalWindows: number;
    totalMeasurements: number;
    manualEdits: number;
    deletions: number;
    detectionMethods: string[];
    processingTime?: number;
    manualWalls?: number;
    aiWalls?: number;
    deletedWalls?: number;
  };
  userFeedback?: {
    accuracy: number;
    corrections: number;
    notes?: string;
  };
}

// Keep WallData as alias for backward compatibility
type WallData = FloorPlanLearningData;

export class RAGLearningService {
  private dataDir: string;
  private currentSession: WallData | null = null;
  
  constructor() {
    this.dataDir = path.join(process.cwd(), 'rag-learning-data');
    this.ensureDataDirectory();
  }
  
  /**
   * Ensure the data directory exists
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log('📚 Created RAG learning data directory');
    }
  }
  
  /**
   * Start a new learning session
   */
  startSession(imageHash: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    this.currentSession = {
      id: sessionId,
      timestamp: new Date(),
      imageHash,
      walls: [],
      rooms: [],
      doors: [],
      windows: [],
      measurements: [],
      metadata: {
        totalWalls: 0,
        totalRooms: 0,
        totalDoors: 0,
        totalWindows: 0,
        totalMeasurements: 0,
        manualEdits: 0,
        deletions: 0,
        detectionMethods: []
      }
    };
    
    console.log(`🎓 Started RAG learning session: ${sessionId}`);
    return sessionId;
  }
  
  /**
   * Add wall data to current session
   */
  addWallData(walls: any[], source: string = 'ai'): void {
    if (!this.currentSession) {
      console.warn('⚠️ No active RAG learning session');
      return;
    }
    
    walls.forEach(wall => {
      const wallData = {
        id: wall.id || `wall_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: wall.type || 'unknown',
        pattern: wall.pattern,
        source: wall.source || source,
        coordinates: {
          x1: wall.x1 || wall.start?.x,
          y1: wall.y1 || wall.start?.y,
          x2: wall.x2 || wall.end?.x,
          y2: wall.y2 || wall.end?.y
        },
        thickness: wall.thickness,
        confidence: wall.confidence || 0.8,
        detectionPath: wall.detectionPath,
        isManual: wall.source === 'manual',
        isDeleted: false
      };
      
      this.currentSession.walls.push(wallData);
      
      // Update metadata
      this.currentSession.metadata.totalWalls++;
      if (wallData.isManual) {
        this.currentSession.metadata.manualWalls++;
      } else {
        this.currentSession.metadata.aiWalls++;
      }
      
      if (wallData.detectionPath && !this.currentSession.metadata.detectionMethods.includes(wallData.detectionPath)) {
        this.currentSession.metadata.detectionMethods.push(wallData.detectionPath);
      }
    });
    
    console.log(`📊 Added ${walls.length} walls to RAG learning session`);
  }
  
  /**
   * Add room data to current session
   */
  addRoomData(rooms: any[], source: string = 'ai'): void {
    if (!this.currentSession) {
      console.warn('⚠️ No active RAG learning session');
      return;
    }
    
    rooms.forEach(room => {
      const roomData = {
        id: room.id || `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: room.name || 'Unknown',
        type: room.type || 'other',
        squareFootage: room.squareFootage || room.area || 0,
        isExterior: room.isExterior || false,
        center: room.center || room.centroid,
        vertices: room.vertices,
        source: room.source || source,
        isManual: source === 'manual',
        isDeleted: false,
        labelPosition: room.labelPosition
      };
      
      this.currentSession.rooms.push(roomData);
      this.currentSession.metadata.totalRooms++;
      if (roomData.isManual) {
        this.currentSession.metadata.manualEdits++;
      }
    });
    
    console.log(`📊 Added ${rooms.length} rooms to RAG learning session`);
  }
  
  /**
   * Add door data to current session
   */
  addDoorData(doors: any[], source: string = 'ai'): void {
    if (!this.currentSession) return;
    
    doors.forEach(door => {
      const doorData = {
        id: door.id || `door_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        position: door.position,
        width: door.width || 30,
        orientation: door.orientation,
        swingDirection: door.swingDirection,
        source: door.source || source,
        isManual: source === 'manual',
        isDeleted: false
      };
      
      this.currentSession.doors.push(doorData);
      this.currentSession.metadata.totalDoors++;
      if (doorData.isManual) {
        this.currentSession.metadata.manualEdits++;
      }
    });
    
    console.log(`🚪 Added ${doors.length} doors to RAG learning session`);
  }
  
  /**
   * Add window data to current session
   */
  addWindowData(windows: any[], source: string = 'ai'): void {
    if (!this.currentSession) return;
    
    windows.forEach(window => {
      const windowData = {
        id: window.id || `window_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        position: window.position,
        width: window.width || 40,
        orientation: window.orientation,
        source: window.source || source,
        isManual: source === 'manual',
        isDeleted: false
      };
      
      this.currentSession.windows.push(windowData);
      this.currentSession.metadata.totalWindows++;
      if (windowData.isManual) {
        this.currentSession.metadata.manualEdits++;
      }
    });
    
    console.log(`🪟 Added ${windows.length} windows to RAG learning session`);
  }
  
  /**
   * Add measurement data to current session
   */
  addMeasurementData(measurements: any[], source: string = 'manual'): void {
    if (!this.currentSession) return;
    
    measurements.forEach(measurement => {
      const measurementData = {
        id: measurement.id || `measurement_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: measurement.type || 'dimension',
        value: measurement.value,
        unit: measurement.unit || 'sq ft',
        location: measurement.location,
        source: measurement.source || source,
        isManual: source === 'manual',
        correctedFrom: measurement.correctedFrom
      };
      
      this.currentSession.measurements.push(measurementData);
      this.currentSession.metadata.totalMeasurements++;
      if (measurementData.isManual) {
        this.currentSession.metadata.manualEdits++;
      }
    });
    
    console.log(`📏 Added ${measurements.length} measurements to RAG learning session`);
  }
  
  /**
   * Mark wall as deleted (for learning from corrections)
   */
  markWallDeleted(wallId: string): void {
    if (!this.currentSession) return;
    
    const wall = this.currentSession.walls.find(w => w.id === wallId);
    if (wall) {
      wall.isDeleted = true;
      this.currentSession.metadata.deletions++;
      console.log(`🗑️ Marked wall ${wallId} as deleted for RAG learning`);
    }
  }
  
  /**
   * Mark room as deleted
   */
  markRoomDeleted(roomId: string): void {
    if (!this.currentSession) return;
    
    const room = this.currentSession.rooms.find(r => r.id === roomId);
    if (room) {
      room.isDeleted = true;
      this.currentSession.metadata.deletions++;
      console.log(`🗑️ Marked room ${roomId} as deleted for RAG learning`);
    }
  }
  
  /**
   * Mark door as deleted
   */
  markDoorDeleted(doorId: string): void {
    if (!this.currentSession) return;
    
    const door = this.currentSession.doors.find(d => d.id === doorId);
    if (door) {
      door.isDeleted = true;
      this.currentSession.metadata.deletions++;
      console.log(`🗑️ Marked door ${doorId} as deleted for RAG learning`);
    }
  }
  
  /**
   * Mark window as deleted
   */
  markWindowDeleted(windowId: string): void {
    if (!this.currentSession) return;
    
    const window = this.currentSession.windows.find(w => w.id === windowId);
    if (window) {
      window.isDeleted = true;
      this.currentSession.metadata.deletions++;
      console.log(`🗑️ Marked window ${windowId} as deleted for RAG learning`);
    }
  }
  
  /**
   * Add user feedback to session
   */
  addUserFeedback(accuracy: number, corrections: number, notes?: string): void {
    if (!this.currentSession) return;
    
    this.currentSession.userFeedback = {
      accuracy,
      corrections,
      notes
    };
    
    console.log(`📝 Added user feedback to RAG session: ${accuracy}% accuracy, ${corrections} corrections`);
  }
  
  /**
   * Save current session to disk
   */
  saveSession(processingTime?: number): string | null {
    if (!this.currentSession) {
      console.warn('⚠️ No active session to save');
      return null;
    }
    
    if (processingTime) {
      this.currentSession.metadata.processingTime = processingTime;
    }
    
    const filename = `${this.currentSession.id}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(this.currentSession, null, 2));
      console.log(`💾 Saved RAG learning session to ${filename}`);
      
      // Also append to master learning file
      this.appendToMasterFile(this.currentSession);
      
      return filepath;
    } catch (error) {
      console.error('❌ Failed to save RAG learning session:', error);
      return null;
    }
  }
  
  /**
   * Append session data to master learning file
   */
  private appendToMasterFile(session: WallData): void {
    const masterFile = path.join(this.dataDir, 'master_learning_data.jsonl');
    
    try {
      // Create simplified version for master file
      const simplified = {
        id: session.id,
        timestamp: session.timestamp,
        wallCount: session.metadata.totalWalls,
        manualCorrections: session.metadata.manualWalls,
        deletions: session.metadata.deletedWalls,
        accuracy: session.userFeedback?.accuracy || null,
        methods: session.metadata.detectionMethods
      };
      
      fs.appendFileSync(masterFile, JSON.stringify(simplified) + '\n');
      console.log('📚 Appended to master RAG learning file');
    } catch (error) {
      console.error('⚠️ Failed to append to master file:', error);
    }
  }
  
  /**
   * Load learning data for analysis
   */
  loadLearningData(limit: number = 100): WallData[] {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.startsWith('session_') && f.endsWith('.json'))
        .slice(-limit);
      
      const sessions: WallData[] = [];
      
      for (const file of files) {
        const filepath = path.join(this.dataDir, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        sessions.push(data);
      }
      
      console.log(`📖 Loaded ${sessions.length} RAG learning sessions`);
      return sessions;
    } catch (error) {
      console.error('❌ Failed to load learning data:', error);
      return [];
    }
  }
  
  /**
   * PATTERN ANALYZER - Analyzes learned patterns from sessions
   */
  analyzePatterns(): any {
    const sessions = this.loadLearningData();
    if (sessions.length < 3) {
      return { insufficient_data: true, message: 'Need at least 3 sessions for pattern analysis' };
    }

    // Analyze deletion patterns
    const deletionPatterns = {
      wallTypes: new Map<string, number>(),
      positions: [],
      avgConfidence: 0
    };

    // Analyze addition patterns
    const additionPatterns = {
      commonPositions: [],
      wallAngles: [],
      typicalThickness: []
    };

    // Analyze room patterns
    const roomPatterns = {
      nameMapping: new Map<string, string>(), // AI name -> User preferred name
      typicalSizes: new Map<string, number[]>(),
      frequentTypes: new Map<string, number>()
    };

    sessions.forEach(session => {
      // Analyze deleted walls
      session.walls?.filter(w => w.isDeleted).forEach(wall => {
        const type = wall.type || 'unknown';
        deletionPatterns.wallTypes.set(type, (deletionPatterns.wallTypes.get(type) || 0) + 1);
        if (wall.confidence) {
          deletionPatterns.avgConfidence += wall.confidence;
        }
      });

      // Analyze manually added walls
      session.walls?.filter(w => w.isManual && !w.isDeleted).forEach(wall => {
        additionPatterns.commonPositions.push({
          x1: wall.coordinates.x1,
          y1: wall.coordinates.y1,
          x2: wall.coordinates.x2,
          y2: wall.coordinates.y2
        });
      });

      // Analyze room patterns
      session.rooms?.forEach(room => {
        if (room.isManual) {
          roomPatterns.frequentTypes.set(room.type, (roomPatterns.frequentTypes.get(room.type) || 0) + 1);
          
          const sizes = roomPatterns.typicalSizes.get(room.type) || [];
          sizes.push(room.squareFootage);
          roomPatterns.typicalSizes.set(room.type, sizes);
        }
      });
    });

    return {
      totalSessions: sessions.length,
      deletionPatterns,
      additionPatterns,
      roomPatterns,
      confidence: Math.min(sessions.length / 20, 1) * 100 // Confidence increases with more sessions
    };
  }

  /**
   * PREDICTION ENGINE - Scores detected features based on learned patterns
   */
  predictConfidence(detectedFeatures: any): any {
    const patterns = this.analyzePatterns();
    
    if (patterns.insufficient_data) {
      return {
        walls: detectedFeatures.walls || [],
        rooms: detectedFeatures.rooms || [],
        confidence: 0,
        message: 'Not enough training data for predictions'
      };
    }

    // Score each wall based on deletion patterns
    const scoredWalls = (detectedFeatures.walls || []).map(wall => {
      let confidenceScore = 0.5; // Base confidence
      
      // Check if this wall type is frequently deleted
      const wallType = wall.type || 'unknown';
      const deletionCount = patterns.deletionPatterns.wallTypes.get(wallType) || 0;
      const deletionRate = deletionCount / Math.max(patterns.totalSessions, 1);
      
      // Lower confidence for frequently deleted wall types
      if (deletionRate > 0.5) {
        confidenceScore -= 0.3;
      } else if (deletionRate > 0.3) {
        confidenceScore -= 0.2;
      }
      
      // Check if wall position matches common manual additions
      const isNearManualPattern = patterns.additionPatterns.commonPositions.some(pos => {
        const distance = Math.sqrt(
          Math.pow(pos.x1 - (wall.x1 || wall.start?.x || 0), 2) +
          Math.pow(pos.y1 - (wall.y1 || wall.start?.y || 0), 2)
        );
        return distance < 50; // Within 50 pixels
      });
      
      if (isNearManualPattern) {
        confidenceScore += 0.2; // Boost confidence if near common manual additions
      }
      
      // Apply session count factor
      const sessionFactor = Math.min(patterns.totalSessions / 20, 1);
      confidenceScore = confidenceScore * (0.5 + sessionFactor * 0.5);
      
      return {
        ...wall,
        ragConfidence: Math.max(0, Math.min(1, confidenceScore)),
        ragPrediction: confidenceScore < 0.3 ? 'likely_incorrect' : 
                       confidenceScore > 0.7 ? 'likely_correct' : 'uncertain'
      };
    });

    // Score rooms based on patterns
    const scoredRooms = (detectedFeatures.rooms || []).map(room => {
      let suggestion = null;
      
      // Suggest room type based on size patterns
      patterns.roomPatterns.typicalSizes.forEach((sizes, type) => {
        const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        const roomSize = room.squareFootage || room.area || 0;
        
        if (Math.abs(roomSize - avgSize) < 50) { // Within 50 sq ft
          suggestion = { type, confidence: 0.7 };
        }
      });
      
      return {
        ...room,
        ragSuggestion: suggestion
      };
    });

    return {
      walls: scoredWalls,
      rooms: scoredRooms,
      doors: detectedFeatures.doors || [],
      windows: detectedFeatures.windows || [],
      confidence: patterns.confidence,
      predictionsApplied: true
    };
  }

  /**
   * AUTO-APPLY LOGIC - Automatically applies learned corrections
   */
  autoApplyCorrections(detectedFeatures: any): any {
    const scoredFeatures = this.predictConfidence(detectedFeatures);
    
    if (scoredFeatures.confidence < 30) {
      // Not enough confidence to auto-apply
      return {
        ...scoredFeatures,
        autoApplied: false,
        message: 'Need more training data for auto-corrections'
      };
    }

    // Auto-remove low confidence walls
    const filteredWalls = scoredFeatures.walls.filter(wall => {
      if (wall.ragPrediction === 'likely_incorrect' && scoredFeatures.confidence > 50) {
        console.log(`🤖 RAG: Auto-removing low confidence wall ${wall.id}`);
        return false;
      }
      return true;
    });

    // Auto-suggest wall additions based on patterns
    const patterns = this.analyzePatterns();
    const suggestedWalls = [];
    
    if (patterns.additionPatterns.commonPositions.length > 5) {
      // Find clusters of manual additions
      const clusters = this.findPositionClusters(patterns.additionPatterns.commonPositions);
      
      clusters.forEach(cluster => {
        // Check if area already has a wall
        const hasWall = filteredWalls.some(wall => {
          const distance = Math.sqrt(
            Math.pow(cluster.center.x - (wall.x1 || wall.start?.x || 0), 2) +
            Math.pow(cluster.center.y - (wall.y1 || wall.start?.y || 0), 2)
          );
          return distance < 100;
        });
        
        if (!hasWall && cluster.frequency > patterns.totalSessions * 0.3) {
          suggestedWalls.push({
            id: `rag_suggested_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            start: { x: cluster.center.x, y: cluster.center.y },
            end: { x: cluster.center.x + 100, y: cluster.center.y },
            type: 'suggested',
            source: 'rag_learning',
            ragConfidence: cluster.frequency / patterns.totalSessions
          });
        }
      });
    }

    return {
      walls: [...filteredWalls, ...suggestedWalls],
      rooms: scoredFeatures.rooms,
      doors: scoredFeatures.doors,
      windows: scoredFeatures.windows,
      confidence: scoredFeatures.confidence,
      autoApplied: true,
      removedCount: scoredFeatures.walls.length - filteredWalls.length,
      suggestedCount: suggestedWalls.length
    };
  }

  /**
   * Helper: Find clusters in position data
   */
  private findPositionClusters(positions: any[], threshold: number = 100): any[] {
    const clusters = [];
    const visited = new Set();
    
    positions.forEach((pos, idx) => {
      if (visited.has(idx)) return;
      
      const cluster = {
        center: { x: pos.x1, y: pos.y1 },
        frequency: 1,
        positions: [pos]
      };
      
      visited.add(idx);
      
      // Find nearby positions
      positions.forEach((otherPos, otherIdx) => {
        if (visited.has(otherIdx)) return;
        
        const distance = Math.sqrt(
          Math.pow(pos.x1 - otherPos.x1, 2) +
          Math.pow(pos.y1 - otherPos.y1, 2)
        );
        
        if (distance < threshold) {
          cluster.positions.push(otherPos);
          cluster.frequency++;
          visited.add(otherIdx);
        }
      });
      
      // Calculate cluster center
      if (cluster.frequency > 1) {
        cluster.center.x = cluster.positions.reduce((sum, p) => sum + p.x1, 0) / cluster.frequency;
        cluster.center.y = cluster.positions.reduce((sum, p) => sum + p.y1, 0) / cluster.frequency;
      }
      
      clusters.push(cluster);
    });
    
    return clusters.filter(c => c.frequency > 1);
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): any {
    const sessions = this.loadLearningData();
    
    const stats = {
      totalSessions: sessions.length,
      totalWalls: 0,
      totalManualCorrections: 0,
      totalDeletions: 0,
      averageAccuracy: 0,
      detectionMethods: new Set<string>(),
      recentSessions: []
    };
    
    let accuracySum = 0;
    let accuracyCount = 0;
    
    sessions.forEach(session => {
      stats.totalWalls += session.metadata.totalWalls;
      stats.totalManualCorrections += session.metadata.manualWalls;
      stats.totalDeletions += session.metadata.deletedWalls;
      
      session.metadata.detectionMethods.forEach(method => {
        stats.detectionMethods.add(method);
      });
      
      if (session.userFeedback?.accuracy) {
        accuracySum += session.userFeedback.accuracy;
        accuracyCount++;
      }
    });
    
    if (accuracyCount > 0) {
      stats.averageAccuracy = accuracySum / accuracyCount;
    }
    
    // Get recent sessions
    stats.recentSessions = sessions.slice(-5).map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      walls: s.metadata.totalWalls,
      accuracy: s.userFeedback?.accuracy || null
    }));
    
    return {
      ...stats,
      detectionMethods: Array.from(stats.detectionMethods)
    };
  }
  
  /**
   * Clear current session
   */
  clearSession(): void {
    this.currentSession = null;
    console.log('🧹 Cleared RAG learning session');
  }
}

// Export singleton instance
export const ragLearningService = new RAGLearningService();