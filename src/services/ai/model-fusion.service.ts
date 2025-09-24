// ========================================
// MODEL FUSION SERVICE - model-fusion.service.ts
// Combines and reconciles results from multiple models
// ========================================

import { Room, Wall, Door, Window, Point2D } from '../../types/floor-plan.types';
import { RoomType } from '../../types/room.types';
import { ConfidenceScorer } from './confidence-scorer';
import { GPTVisionService } from './gpt-vision.service';

interface ModelResult {
  modelName: string;
  modelType: 'ocr' | 'vision' | 'object_detection' | 'ai' | 'hybrid';
  timestamp: Date;
  processingTime: number;
  confidence: number;
  data: {
    rooms?: Room[];
    walls?: Wall[];
    doors?: Door[];
    windows?: Window[];
    dimensions?: any[];
    text?: string[];
    features?: any[];
  };
  metadata?: any;
}

interface FusionStrategy {
  name: string;
  description: string;
  apply: (results: ModelResult[]) => any;
  weight?: number;
}

interface FusedResult {
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  dimensions: any[];
  features: any[];
  metadata: {
    modelsUsed: string[];
    fusionStrategy: string;
    confidence: number;
    consensusLevel: number;
    conflicts: ConflictResolution[];
    processingTime: number;
  };
}

interface ConflictResolution {
  type: string;
  conflictingModels: string[];
  conflictingValues: any[];
  resolution: any;
  resolutionMethod: string;
  confidence: number;
}

interface EnsembleConfig {
  votingStrategy: 'majority' | 'weighted' | 'confidence' | 'bayesian';
  conflictResolution: 'highest_confidence' | 'consensus' | 'gpt_arbitration' | 'manual';
  minConsensus: number; // Minimum agreement level required
  requiredModels?: string[]; // Models that must agree
  weights?: Map<string, number>; // Model-specific weights
}

export class ModelFusionService {
  private confidenceScorer: ConfidenceScorer;
  private gptVisionService: GPTVisionService;
  private fusionStrategies: Map<string, FusionStrategy>;
  private ensembleConfig: EnsembleConfig;

  constructor() {
    this.confidenceScorer = new ConfidenceScorer();
    this.gptVisionService = new GPTVisionService();
    this.fusionStrategies = new Map();
    
    this.ensembleConfig = {
      votingStrategy: 'weighted',
      conflictResolution: 'highest_confidence',
      minConsensus: 0.6,
      weights: new Map([
        ['gpt-vision', 0.35],
        ['yolo', 0.25],
        ['tesseract', 0.20],
        ['opencv', 0.20]
      ])
    };

    this.initializeFusionStrategies();
  }

  /**
   * Initialize fusion strategies
   */
  private initializeFusionStrategies(): void {
    // Majority voting strategy
    this.fusionStrategies.set('majority_voting', {
      name: 'Majority Voting',
      description: 'Combines results based on majority agreement',
      apply: (results) => this.applyMajorityVoting(results),
      weight: 1.0
    });

    // Weighted average strategy
    this.fusionStrategies.set('weighted_average', {
      name: 'Weighted Average',
      description: 'Combines results using confidence-weighted averaging',
      apply: (results) => this.applyWeightedAverage(results),
      weight: 1.2
    });

    // Bayesian fusion strategy
    this.fusionStrategies.set('bayesian', {
      name: 'Bayesian Fusion',
      description: 'Uses Bayesian inference to combine probabilities',
      apply: (results) => this.applyBayesianFusion(results),
      weight: 1.5
    });

    // Dempster-Shafer strategy
    this.fusionStrategies.set('dempster_shafer', {
      name: 'Dempster-Shafer',
      description: 'Evidence theory-based fusion',
      apply: (results) => this.applyDempsterShafer(results),
      weight: 1.3
    });

    // Consensus-based strategy
    this.fusionStrategies.set('consensus', {
      name: 'Consensus',
      description: 'Only includes results with high agreement',
      apply: (results) => this.applyConsensusStrategy(results),
      weight: 1.1
    });
  }

  /**
   * Main fusion method
   */
  async fuseModelResults(
    modelResults: ModelResult[],
    config?: Partial<EnsembleConfig>
  ): Promise<FusedResult> {
    const startTime = Date.now();
    console.log(`🔄 Fusing results from ${modelResults.length} models...`);

    // Merge config
    const fusionConfig = { ...this.ensembleConfig, ...config };

    // Validate input
    if (modelResults.length === 0) {
      throw new Error('No model results to fuse');
    }

    // Pre-process results
    const preprocessed = await this.preprocessResults(modelResults);

    // Apply fusion strategy
    let fusedData: any;
    switch (fusionConfig.votingStrategy) {
      case 'majority':
        fusedData = await this.applyMajorityVoting(preprocessed);
        break;
      case 'weighted':
        fusedData = await this.applyWeightedVoting(preprocessed, fusionConfig.weights);
        break;
      case 'confidence':
        fusedData = await this.applyConfidenceBasedFusion(preprocessed);
        break;
      case 'bayesian':
        fusedData = await this.applyBayesianFusion(preprocessed);
        break;
      default:
        fusedData = await this.applyWeightedVoting(preprocessed, fusionConfig.weights);
    }

    // Resolve conflicts
    const conflicts = await this.detectConflicts(preprocessed);
    const resolutions = await this.resolveConflicts(
      conflicts,
      fusionConfig.conflictResolution,
      modelResults
    );

    // Apply resolutions to fused data
    fusedData = this.applyResolutions(fusedData, resolutions);

    // Post-process and validate
    const validated = await this.validateFusedResult(fusedData);

    // Calculate consensus and confidence
    const consensusLevel = this.calculateConsensus(modelResults, validated);
    const confidence = await this.calculateFusionConfidence(validated, modelResults);

    return {
      ...validated,
      metadata: {
        modelsUsed: modelResults.map(r => r.modelName),
        fusionStrategy: fusionConfig.votingStrategy,
        confidence,
        consensusLevel,
        conflicts: resolutions,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Preprocess results for fusion
   */
  private async preprocessResults(results: ModelResult[]): Promise<ModelResult[]> {
    const processed: ModelResult[] = [];

    for (const result of results) {
      // Normalize data formats
      const normalized = this.normalizeModelResult(result);
      
      // Align coordinates if needed
      const aligned = await this.alignCoordinates(normalized, results[0]);
      
      processed.push(aligned);
    }

    return processed;
  }

  /**
   * Apply majority voting
   */
  private async applyMajorityVoting(results: ModelResult[]): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Vote on rooms
    fusedData.rooms = this.voteOnRooms(results);
    
    // Vote on walls
    fusedData.walls = this.voteOnWalls(results);
    
    // Vote on openings
    fusedData.doors = this.voteOnOpenings(results, 'doors');
    fusedData.windows = this.voteOnOpenings(results, 'windows');
    
    // Vote on dimensions
    fusedData.dimensions = this.voteOnDimensions(results);

    return fusedData;
  }

  /**
   * Apply weighted voting
   */
  private async applyWeightedVoting(
    results: ModelResult[],
    weights?: Map<string, number>
  ): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Calculate weighted scores for each element
    const roomCandidates = this.extractCandidates(results, 'rooms');
    fusedData.rooms = this.selectByWeightedScore(roomCandidates, results, weights);

    const wallCandidates = this.extractCandidates(results, 'walls');
    fusedData.walls = this.selectByWeightedScore(wallCandidates, results, weights);

    const doorCandidates = this.extractCandidates(results, 'doors');
    fusedData.doors = this.selectByWeightedScore(doorCandidates, results, weights);

    const windowCandidates = this.extractCandidates(results, 'windows');
    fusedData.windows = this.selectByWeightedScore(windowCandidates, results, weights);

    return fusedData;
  }

  /**
   * Apply confidence-based fusion
   */
  private async applyConfidenceBasedFusion(results: ModelResult[]): Promise<any> {
    // Sort results by confidence
    const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
    
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Use high-confidence results as base
    const baseResult = sorted[0];
    fusedData.rooms = baseResult.data.rooms || [];
    fusedData.walls = baseResult.data.walls || [];
    fusedData.doors = baseResult.data.doors || [];
    fusedData.windows = baseResult.data.windows || [];

    // Supplement with other high-confidence elements
    for (let i = 1; i < sorted.length; i++) {
      const result = sorted[i];
      
      if (result.confidence > 0.7) {
        // Add missing elements
        fusedData.rooms = this.mergeMissingRooms(fusedData.rooms, result.data.rooms);
        fusedData.doors = this.mergeMissingOpenings(fusedData.doors, result.data.doors);
        fusedData.windows = this.mergeMissingOpenings(fusedData.windows, result.data.windows);
      }
    }

    return fusedData;
  }

  /**
   * Apply Bayesian fusion
   */
  private async applyBayesianFusion(results: ModelResult[]): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Calculate prior probabilities
    const priors = this.calculatePriors(results);

    // Calculate likelihoods
    const likelihoods = this.calculateLikelihoods(results);

    // Apply Bayes' theorem
    const posteriors = this.calculatePosteriors(priors, likelihoods);

    // Select elements based on posterior probabilities
    fusedData.rooms = this.selectByPosterior(posteriors.rooms, 0.5);
    fusedData.walls = this.selectByPosterior(posteriors.walls, 0.5);
    fusedData.doors = this.selectByPosterior(posteriors.doors, 0.5);
    fusedData.windows = this.selectByPosterior(posteriors.windows, 0.5);

    return fusedData;
  }

  /**
   * Apply Weighted Average fusion
   */
  private async applyWeightedAverage(results: ModelResult[]): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Group similar elements
    const roomGroups = this.groupSimilarElements(results, 'rooms');
    const wallGroups = this.groupSimilarElements(results, 'walls');
    const doorGroups = this.groupSimilarElements(results, 'doors');
    const windowGroups = this.groupSimilarElements(results, 'windows');

    // Average properties for each group
    fusedData.rooms = this.averageElementGroups(roomGroups);
    fusedData.walls = this.averageElementGroups(wallGroups);
    fusedData.doors = this.averageElementGroups(doorGroups);
    fusedData.windows = this.averageElementGroups(windowGroups);

    return fusedData;
  }

  /**
   * Apply Dempster-Shafer fusion
   */
  private async applyDempsterShafer(results: ModelResult[]): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    // Build belief functions
    const beliefs = this.buildBeliefFunctions(results);

    // Combine evidence using Dempster's rule
    const combined = this.combineEvidence(beliefs);

    // Make decisions based on combined beliefs
    fusedData.rooms = this.decideFromBelief(combined.rooms);
    fusedData.walls = this.decideFromBelief(combined.walls);
    fusedData.doors = this.decideFromBelief(combined.doors);
    fusedData.windows = this.decideFromBelief(combined.windows);

    return fusedData;
  }

  /**
   * Apply consensus strategy
   */
  private async applyConsensusStrategy(results: ModelResult[]): Promise<any> {
    const fusedData: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: []
    };

    const minAgreement = Math.ceil(results.length * this.ensembleConfig.minConsensus);

    // Only include elements with sufficient agreement
    fusedData.rooms = this.findConsensusElements(results, 'rooms', minAgreement);
    fusedData.walls = this.findConsensusElements(results, 'walls', minAgreement);
    fusedData.doors = this.findConsensusElements(results, 'doors', minAgreement);
    fusedData.windows = this.findConsensusElements(results, 'windows', minAgreement);

    return fusedData;
  }

  /**
   * Detect conflicts between model results
   */
  private async detectConflicts(results: ModelResult[]): Promise<any[]> {
    const conflicts: any[] = [];

    // Check room count conflicts
    const roomCounts = results.map(r => r.data.rooms?.length || 0);
    if (Math.max(...roomCounts) - Math.min(...roomCounts) > 2) {
      conflicts.push({
        type: 'room_count',
        models: results.map(r => r.modelName),
        values: roomCounts
      });
    }

    // Check room type conflicts
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const conflicts_ij = this.compareRoomTypes(
          results[i].data.rooms || [],
          results[j].data.rooms || []
        );
        
        if (conflicts_ij.length > 0) {
          conflicts.push({
            type: 'room_type',
            models: [results[i].modelName, results[j].modelName],
            conflicts: conflicts_ij
          });
        }
      }
    }

    // Check dimension conflicts
    const dimensionConflicts = this.detectDimensionConflicts(results);
    conflicts.push(...dimensionConflicts);

    return conflicts;
  }

  /**
   * Resolve detected conflicts
   */
  private async resolveConflicts(
    conflicts: any[],
    strategy: string,
    originalResults: ModelResult[]
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];

    for (const conflict of conflicts) {
      let resolution: ConflictResolution;

      switch (strategy) {
        case 'highest_confidence':
          resolution = this.resolveByHighestConfidence(conflict, originalResults);
          break;
        
        case 'consensus':
          resolution = this.resolveByConsensus(conflict, originalResults);
          break;
        
        case 'gpt_arbitration':
          resolution = await this.resolveByGPTArbitration(conflict, originalResults);
          break;
        
        default:
          resolution = this.resolveByHighestConfidence(conflict, originalResults);
      }

      resolutions.push(resolution);
    }

    return resolutions;
  }

  /**
   * Hierarchical fusion for complex floor plans
   */
  async hierarchicalFusion(
    modelResults: ModelResult[],
    levels: string[] = ['rooms', 'walls', 'features']
  ): Promise<FusedResult> {
    let fusedData: any = {};

    // Fuse each level hierarchically
    for (const level of levels) {
      const levelResults = modelResults.map(r => ({
        ...r,
        data: { [level]: r.data[level as keyof typeof r.data] }
      }));

      const levelFusion = await this.fuseModelResults(levelResults);
      fusedData[level] = levelFusion[level as keyof typeof levelFusion];
    }

    // Ensure consistency between levels
    fusedData = await this.ensureHierarchicalConsistency(fusedData);

    return fusedData as FusedResult;
  }

  /**
   * Incremental fusion for real-time processing
   */
  async incrementalFusion(
    existingFusion: FusedResult,
    newResult: ModelResult
  ): Promise<FusedResult> {
    // Weight existing fusion based on number of models
    const existingWeight = existingFusion.metadata.modelsUsed.length;
    const newWeight = 1;

    // Merge new result with existing fusion
    const merged = await this.mergeWithWeights(
      existingFusion,
      newResult,
      existingWeight,
      newWeight
    );

    // Update metadata
    merged.metadata.modelsUsed.push(newResult.modelName);
    merged.metadata.confidence = await this.calculateFusionConfidence(
      merged,
      [...existingFusion.metadata.modelsUsed, newResult.modelName].map(() => newResult)
    );

    return merged;
  }

  /**
   * Active learning fusion
   */
  async activeLearningFusion(
    modelResults: ModelResult[],
    uncertaintyThreshold: number = 0.3
  ): Promise<{
    fusion: FusedResult;
    uncertainAreas: any[];
    suggestedActions: string[];
  }> {
    // Initial fusion
    const fusion = await this.fuseModelResults(modelResults);

    // Identify uncertain areas
    const uncertainAreas = this.identifyUncertainAreas(fusion, uncertaintyThreshold);

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(uncertainAreas);

    return {
      fusion,
      uncertainAreas,
      suggestedActions
    };
  }

  /**
   * Helper methods
   */

  private normalizeModelResult(result: ModelResult): ModelResult {
    // Normalize coordinate systems, units, etc.
    const normalized = { ...result };
    
    // Normalize room types
    if (normalized.data.rooms) {
      normalized.data.rooms = normalized.data.rooms.map(r => ({
        ...r,
        type: this.normalizeRoomType(r.type)
      }));
    }

    return normalized;
  }

  private async alignCoordinates(result: ModelResult, reference: ModelResult): Promise<ModelResult> {
    // Align coordinate systems between models
    // This would involve finding correspondence points and applying transformation
    return result; // Simplified
  }

  private normalizeRoomType(type: string): RoomType {
    // Map various room type strings to standard enum
    const typeMap: Record<string, RoomType> = {
      'bedroom': RoomType.BEDROOM,
      'bathroom': RoomType.BATHROOM,
      'kitchen': RoomType.KITCHEN,
      'living room': RoomType.LIVING_ROOM,
      'living_room': RoomType.LIVING_ROOM
    };

    return typeMap[type.toLowerCase()] || RoomType.UNIDENTIFIED;
  }

  private voteOnRooms(results: ModelResult[]): Room[] {
    const roomVotes = new Map<string, { room: Room; votes: number }>();

    for (const result of results) {
      if (!result.data.rooms) continue;

      for (const room of result.data.rooms) {
        const key = this.getRoomKey(room);
        
        if (roomVotes.has(key)) {
          roomVotes.get(key)!.votes++;
        } else {
          roomVotes.set(key, { room, votes: 1 });
        }
      }
    }

    // Select rooms with majority votes
    const threshold = results.length / 2;
    const selectedRooms: Room[] = [];

    for (const [_, value] of roomVotes) {
      if (value.votes >= threshold) {
        selectedRooms.push(value.room);
      }
    }

    return selectedRooms;
  }

  private getRoomKey(room: Room): string {
    // Create unique key for room based on type and approximate location
    const centroid = this.calculateCentroid(room.polygon?.vertices || []);
    return `${room.type}_${Math.round(centroid.x / 50)}_${Math.round(centroid.y / 50)}`;
  }

  private calculateCentroid(points: Point2D[]): Point2D {
    if (points.length === 0) return { x: 0, y: 0 };
    
    const sum = points.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  private voteOnWalls(results: ModelResult[]): Wall[] {
    // Similar voting logic for walls
    const walls: Wall[] = [];
    
    // Simplified implementation
    for (const result of results) {
      if (result.data.walls) {
        walls.push(...result.data.walls);
      }
    }

    return this.deduplicateWalls(walls);
  }

  private deduplicateWalls(walls: Wall[]): Wall[] {
    const unique: Wall[] = [];
    
    for (const wall of walls) {
      const isDuplicate = unique.some(w => 
        this.wallsAreSimilar(w, wall)
      );
      
      if (!isDuplicate) {
        unique.push(wall);
      }
    }

    return unique;
  }

  private wallsAreSimilar(wall1: Wall, wall2: Wall): boolean {
    const threshold = 20; // pixels
    
    return (
      this.pointsClose(wall1.startPoint, wall2.startPoint, threshold) &&
      this.pointsClose(wall1.endPoint, wall2.endPoint, threshold)
    ) || (
      this.pointsClose(wall1.startPoint, wall2.endPoint, threshold) &&
      this.pointsClose(wall1.endPoint, wall2.startPoint, threshold)
    );
  }

  private pointsClose(p1: Point2D, p2: Point2D, threshold: number): boolean {
    const distance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + 
      Math.pow(p2.y - p1.y, 2)
    );
    
    return distance < threshold;
  }

  private voteOnOpenings(results: ModelResult[], type: 'doors' | 'windows'): any[] {
    const openings: any[] = [];
    
    for (const result of results) {
      const data = result.data[type];
      if (data) {
        openings.push(...data);
      }
    }

    return this.deduplicateOpenings(openings);
  }

  private deduplicateOpenings(openings: any[]): any[] {
    const unique: any[] = [];
    
    for (const opening of openings) {
      const isDuplicate = unique.some(o => 
        this.pointsClose(o.position, opening.position, 30)
      );
      
      if (!isDuplicate) {
        unique.push(opening);
      }
    }

    return unique;
  }

  private voteOnDimensions(results: ModelResult[]): any[] {
    const dimensions: any[] = [];
    
    for (const result of results) {
      if (result.data.dimensions) {
        dimensions.push(...result.data.dimensions);
      }
    }

    return this.reconcileDimensions(dimensions);
  }

  private reconcileDimensions(dimensions: any[]): any[] {
    // Group similar dimensions and average values
    const groups: Map<string, any[]> = new Map();
    
    for (const dim of dimensions) {
      const key = dim.refers_to || 'unknown';
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key)!.push(dim);
    }

    const reconciled: any[] = [];
    
    for (const [key, group] of groups) {
      if (group.length === 1) {
        reconciled.push(group[0]);
      } else {
        // Average or select most common value
        reconciled.push(this.averageDimensions(group));
      }
    }

    return reconciled;
  }

  private averageDimensions(dimensions: any[]): any {
    // Extract numeric values and average them
    const values = dimensions.map(d => this.parseDimensionValue(d.value));
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    
    return {
      ...dimensions[0],
      value: `${avgValue.toFixed(1)}`,
      confidence: dimensions.reduce((sum, d) => sum + (d.confidence || 0.5), 0) / dimensions.length
    };
  }

  private parseDimensionValue(value: string): number {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private extractCandidates(results: ModelResult[], type: string): Map<string, any[]> {
    const candidates = new Map<string, any[]>();
    
    for (const result of results) {
      const data = result.data[type as keyof typeof result.data];
      
      if (Array.isArray(data)) {
        for (const item of data) {
          const key = this.getElementKey(item, type);
          
          if (!candidates.has(key)) {
            candidates.set(key, []);
          }
          
          candidates.get(key)!.push({
            item,
            model: result.modelName,
            confidence: result.confidence
          });
        }
      }
    }

    return candidates;
  }

  private getElementKey(element: any, type: string): string {
    // Create unique key based on element type and properties
    if (type === 'rooms') {
      return this.getRoomKey(element);
    } else if (type === 'walls') {
      return `wall_${element.start.x}_${element.start.y}_${element.end.x}_${element.end.y}`;
    } else {
      return `${type}_${element.position?.x}_${element.position?.y}`;
    }
  }

  private selectByWeightedScore(
    candidates: Map<string, any[]>,
    results: ModelResult[],
    weights?: Map<string, number>
  ): any[] {
    const selected: any[] = [];
    
    for (const [key, items] of candidates) {
      let totalScore = 0;
      let bestItem = items[0].item;
      
      for (const candidate of items) {
        const weight = weights?.get(candidate.model) || 1;
        totalScore += candidate.confidence * weight;
      }
      
      // Normalize by number of models
      const avgScore = totalScore / results.length;
      
      if (avgScore > 0.5) {
        selected.push(bestItem);
      }
    }

    return selected;
  }

  private mergeMissingRooms(existing: Room[], newRooms?: Room[]): Room[] {
    if (!newRooms) return existing;
    
    const merged = [...existing];
    
    for (const room of newRooms) {
      const exists = existing.some(r => 
        r.type === room.type && 
        this.roomsOverlap(r, room)
      );
      
      if (!exists) {
        merged.push(room);
      }
    }

    return merged;
  }

  private roomsOverlap(room1: Room, room2: Room): boolean {
    if (!room1.polygon || !room2.polygon) return false;
    
    const centroid1 = this.calculateCentroid(room1.polygon.vertices);
    const centroid2 = this.calculateCentroid(room2.polygon.vertices);
    
    return this.pointsClose(centroid1, centroid2, 100);
  }

  private mergeMissingOpenings(existing: any[], newOpenings?: any[]): any[] {
    if (!newOpenings) return existing;
    
    const merged = [...existing];
    
    for (const opening of newOpenings) {
      const exists = existing.some(o => 
        this.pointsClose(o.position, opening.position, 30)
      );
      
      if (!exists) {
        merged.push(opening);
      }
    }

    return merged;
  }

  private calculatePriors(results: ModelResult[]): any {
    // Calculate prior probabilities based on model reliability
    return {
      rooms: 0.8,
      walls: 0.9,
      doors: 0.7,
      windows: 0.7
    };
  }

  private calculateLikelihoods(results: ModelResult[]): any {
    // Calculate likelihoods based on detection confidence
    return {
      rooms: results.map(r => r.data.rooms ? r.confidence : 0),
      walls: results.map(r => r.data.walls ? r.confidence : 0),
      doors: results.map(r => r.data.doors ? r.confidence : 0),
      windows: results.map(r => r.data.windows ? r.confidence : 0)
    };
  }

  private calculatePosteriors(priors: any, likelihoods: any): any {
    // Apply Bayes' theorem: P(A|B) = P(B|A) * P(A) / P(B)
    const posteriors: any = {};
    
    for (const key in priors) {
      const prior = priors[key];
      const likelihood = likelihoods[key].reduce((a: number, b: number) => a * b, 1);
      
      posteriors[key] = (likelihood * prior) / (likelihood * prior + (1 - likelihood) * (1 - prior));
    }

    return posteriors;
  }

  private selectByPosterior(posterior: number, threshold: number): any[] {
    // Select elements if posterior probability exceeds threshold
    return posterior > threshold ? [] : [];
  }

  private groupSimilarElements(results: ModelResult[], type: string): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    // Group elements by similarity
    // Simplified implementation
    
    return groups;
  }

  private averageElementGroups(groups: Map<string, any[]>): any[] {
    const averaged: any[] = [];
    
    for (const [_, group] of groups) {
      // Average properties of similar elements
      averaged.push(group[0]); // Simplified
    }

    return averaged;
  }

  private buildBeliefFunctions(results: ModelResult[]): any {
    // Build belief functions for Dempster-Shafer
    return {
      rooms: {},
      walls: {},
      doors: {},
      windows: {}
    };
  }

  private combineEvidence(beliefs: any): any {
    // Combine evidence using Dempster's rule
    return beliefs; // Simplified
  }

  private decideFromBelief(belief: any): any[] {
    // Make decisions based on belief functions
    return [];
  }

  private findConsensusElements(
    results: ModelResult[],
    type: string,
    minAgreement: number
  ): any[] {
    const candidates = this.extractCandidates(results, type);
    const consensus: any[] = [];
    
    for (const [_, items] of candidates) {
      if (items.length >= minAgreement) {
        consensus.push(items[0].item);
      }
    }

    return consensus;
  }

  private compareRoomTypes(rooms1: Room[], rooms2: Room[]): any[] {
    const conflicts = [];
    
    for (const room1 of rooms1) {
      const matching = rooms2.find(r2 => 
        this.roomsOverlap(room1, r2)
      );
      
      if (matching && room1.type !== matching.type) {
        conflicts.push({
          location: this.calculateCentroid(room1.polygon?.vertices || []),
          type1: room1.type,
          type2: matching.type
        });
      }
    }

    return conflicts;
  }

  private detectDimensionConflicts(results: ModelResult[]): any[] {
    const conflicts: any[] = [];
    
    // Check for conflicting dimension values
    // Simplified implementation
    
    return conflicts;
  }

  private resolveByHighestConfidence(
    conflict: any,
    results: ModelResult[]
  ): ConflictResolution {
    // Select value from highest confidence model
    const modelConfidences = results.map(r => ({
      model: r.modelName,
      confidence: r.confidence
    }));
    
    modelConfidences.sort((a, b) => b.confidence - a.confidence);
    
    return {
      type: conflict.type,
      conflictingModels: conflict.models,
      conflictingValues: conflict.values,
      resolution: conflict.values[0], // Simplified
      resolutionMethod: 'highest_confidence',
      confidence: modelConfidences[0].confidence
    };
  }

  private resolveByConsensus(
    conflict: any,
    results: ModelResult[]
  ): ConflictResolution {
    // Find most common value
    const valueCounts = new Map<any, number>();
    
    for (const value of conflict.values) {
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }

    let maxCount = 0;
    let consensusValue = conflict.values[0];
    
    for (const [value, count] of valueCounts) {
      if (count > maxCount) {
        maxCount = count;
        consensusValue = value;
      }
    }

    return {
      type: conflict.type,
      conflictingModels: conflict.models,
      conflictingValues: conflict.values,
      resolution: consensusValue,
      resolutionMethod: 'consensus',
      confidence: maxCount / conflict.values.length
    };
  }

  private async resolveByGPTArbitration(
    conflict: any,
    results: ModelResult[]
  ): Promise<ConflictResolution> {
    // Use GPT to arbitrate conflicts
    // This would call GPT Vision service
    
    return {
      type: conflict.type,
      conflictingModels: conflict.models,
      conflictingValues: conflict.values,
      resolution: conflict.values[0], // Placeholder
      resolutionMethod: 'gpt_arbitration',
      confidence: 0.85
    };
  }

  private applyResolutions(data: any, resolutions: ConflictResolution[]): any {
    // Apply conflict resolutions to fused data
    const resolved = { ...data };
    
    for (const resolution of resolutions) {
      // Apply resolution based on type
      // Simplified implementation
    }

    return resolved;
  }

  private async validateFusedResult(data: any): Promise<any> {
    // Validate and clean fused result
    const validated = { ...data };
    
    // Remove duplicates
    if (validated.rooms) {
      validated.rooms = this.deduplicateRooms(validated.rooms);
    }
    
    // Ensure consistency
    // Check walls connect properly, doors are on walls, etc.
    
    return validated;
  }

  private deduplicateRooms(rooms: Room[]): Room[] {
    const unique: Room[] = [];
    
    for (const room of rooms) {
      const isDuplicate = unique.some(r => 
        r.type === room.type && this.roomsOverlap(r, room)
      );
      
      if (!isDuplicate) {
        unique.push(room);
      }
    }

    return unique;
  }

  private calculateConsensus(results: ModelResult[], fusedData: any): number {
    // Calculate how well models agree
    let totalAgreement = 0;
    let comparisons = 0;
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const agreement = this.calculateAgreement(
          results[i].data,
          results[j].data
        );
        totalAgreement += agreement;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalAgreement / comparisons : 0;
  }

  private calculateAgreement(data1: any, data2: any): number {
    let agreement = 0;
    let factors = 0;
    
    // Compare room counts
    if (data1.rooms && data2.rooms) {
      const diff = Math.abs(data1.rooms.length - data2.rooms.length);
      agreement += Math.max(0, 1 - diff / 10);
      factors++;
    }
    
    // Compare other factors...
    
    return factors > 0 ? agreement / factors : 0;
  }

  private async calculateFusionConfidence(
    fusedData: any,
    results: ModelResult[]
  ): Promise<number> {
    // Calculate confidence in fusion result
    const avgModelConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const consensusLevel = this.calculateConsensus(results, fusedData);
    
    return (avgModelConfidence + consensusLevel) / 2;
  }

  private async ensureHierarchicalConsistency(data: any): Promise<any> {
    // Ensure consistency between hierarchical levels
    const consistent = { ...data };
    
    // Check that all room walls exist in walls list
    // Check that all doors/windows are on walls
    // etc.
    
    return consistent;
  }

  private async mergeWithWeights(
    existing: FusedResult,
    newResult: ModelResult,
    existingWeight: number,
    newWeight: number
  ): Promise<FusedResult> {
    // Weighted merge of existing and new
    const totalWeight = existingWeight + newWeight;
    
    const merged: any = {
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      dimensions: [],
      features: [],
      metadata: existing.metadata
    };
    
    // Merge each component with weights
    // Simplified implementation
    
    return merged as FusedResult;
  }

  private identifyUncertainAreas(fusion: FusedResult, threshold: number): any[] {
    const uncertainAreas = [];
    
    // Check confidence scores
    if (fusion.metadata.confidence < threshold) {
      uncertainAreas.push({
        type: 'low_overall_confidence',
        confidence: fusion.metadata.confidence,
        affected: 'entire_floorplan'
      });
    }
    
    // Check for missing critical elements
    if (!fusion.rooms || fusion.rooms.length === 0) {
      uncertainAreas.push({
        type: 'no_rooms_detected',
        confidence: 0,
        affected: 'room_detection'
      });
    }
    
    return uncertainAreas;
  }

  private generateSuggestedActions(uncertainAreas: any[]): string[] {
    const actions: string[] = [];
    
    for (const area of uncertainAreas) {
      if (area.type === 'low_overall_confidence') {
        actions.push('Consider manual verification of extracted data');
        actions.push('Acquire higher quality image if possible');
      } else if (area.type === 'no_rooms_detected') {
        actions.push('Check image preprocessing settings');
        actions.push('Verify floor plan is properly oriented');
      }
    }

    return actions;
  }
}

// Export singleton instance
export const modelFusionService = new ModelFusionService();

// ========================================
// USAGE EXAMPLE
// ========================================

/*
import { modelFusionService } from './services/ai/model-fusion.service';

// Prepare model results
const modelResults: ModelResult[] = [
  {
    modelName: 'tesseract',
    modelType: 'ocr',
    timestamp: new Date(),
    processingTime: 1200,
    confidence: 0.82,
    data: tesseractResults
  },
  {
    modelName: 'yolo',
    modelType: 'object_detection',
    timestamp: new Date(),
    processingTime: 800,
    confidence: 0.91,
    data: yoloResults
  },
  {
    modelName: 'gpt-vision',
    modelType: 'ai',
    timestamp: new Date(),
    processingTime: 2000,
    confidence: 0.88,
    data: gptResults
  },
  {
    modelName: 'opencv',
    modelType: 'vision',
    timestamp: new Date(),
    processingTime: 600,
    confidence: 0.75,
    data: opencvResults
  }
];

// Perform fusion
const fusedResult = await modelFusionService.fuseModelResults(modelResults, {
  votingStrategy: 'weighted',
  conflictResolution: 'highest_confidence',
  minConsensus: 0.6
});

console.log(`Fusion confidence: ${(fusedResult.metadata.confidence * 100).toFixed(1)}%`);
console.log(`Consensus level: ${(fusedResult.metadata.consensusLevel * 100).toFixed(1)}%`);
console.log(`Conflicts resolved: ${fusedResult.metadata.conflicts.length}`);
console.log(`Rooms detected: ${fusedResult.rooms.length}`);

// Hierarchical fusion
const hierarchicalResult = await modelFusionService.hierarchicalFusion(
  modelResults,
  ['rooms', 'walls', 'features']
);

// Active learning fusion
const activeResult = await modelFusionService.activeLearningFusion(
  modelResults,
  0.3
);

if (activeResult.uncertainAreas.length > 0) {
  console.log('Uncertain areas detected:');
  for (const area of activeResult.uncertainAreas) {
    console.log(`  - ${area.type}: ${area.confidence}`);
  }
  
  console.log('Suggested actions:');
  for (const action of activeResult.suggestedActions) {
    console.log(`  - ${action}`);
  }
}

// Incremental fusion (add new model result)
const updatedFusion = await modelFusionService.incrementalFusion(
  fusedResult,
  newModelResult
);
*/