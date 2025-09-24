/**
 * Floor Plan Persistence Service
 * Handles saving and loading of detected floor plan data
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { decode } from 'base64-arraybuffer';

interface WallData {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  type: 'interior' | 'exterior' | 'load-bearing';
  color: 'black' | 'grey' | 'pattern';
  confidence: number;
  edited?: boolean;
}

interface FloorPlanData {
  id?: string;
  project_id: string;
  user_id?: string;
  image_url: string;
  walls: WallData[];
  doors: any[];
  windows: any[];
  rooms: any[];
  dimensions: {
    width: number;
    height: number;
    scale?: number;
  };
  metadata: {
    detected_at: string;
    last_edited?: string;
    version: number;
    detection_method: string;
  };
  edits_history?: Array<{
    timestamp: string;
    changes: any;
    user_id?: string;
  }>;
}

export class FloorPlanPersistenceService {
  private supabase: any;
  private localStoragePath: string;

  constructor() {
    // Initialize Supabase client if credentials are available
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder')) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    // Fallback to local file storage
    this.localStoragePath = path.join(process.cwd(), 'data', 'floor-plans');
    this.ensureLocalStorage();
  }

  /**
   * Ensure local storage directory exists
   */
  private async ensureLocalStorage() {
    try {
      await fs.mkdir(this.localStoragePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create local storage directory:', error);
    }
  }

  /**
   * Save floor plan detection results with image
   */
  async saveFloorPlan(data: FloorPlanData & { imageData?: string }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      // Add metadata
      if (!data.metadata) {
        data.metadata = {
          detected_at: new Date().toISOString(),
          version: 1,
          detection_method: 'canvas-detection'
        };
      }

      const id = data.id || `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let imageUrl = data.image_url;

      // If Supabase is configured, use it for both storage and database
      if (this.supabase) {
        // Upload image to Supabase Storage if imageData is provided
        if (data.imageData) {
          try {
            // Extract base64 data
            const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, '');
            const fileName = `${id}_${Date.now()}.png`;
            
            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await this.supabase.storage
              .from('floor-plans')
              .upload(`images/${fileName}`, decode(base64Data), {
                contentType: 'image/png',
                upsert: true
              });

            if (uploadError) {
              console.error('Failed to upload image:', uploadError);
            } else {
              // Get public URL
              const { data: urlData } = this.supabase.storage
                .from('floor-plans')
                .getPublicUrl(`images/${fileName}`);
              
              imageUrl = urlData.publicUrl;
              console.log('✅ Image uploaded to Supabase:', imageUrl);
            }
          } catch (imgError) {
            console.error('Image upload error:', imgError);
          }
        }

        // Save floor plan data to database
        const { data: savedData, error } = await this.supabase
          .from('floor_plans')
          .upsert({
            id,
            project_id: data.project_id,
            user_id: data.user_id,
            image_url: imageUrl,
            walls: data.walls,
            doors: data.doors,
            windows: data.windows,
            rooms: data.rooms,
            dimensions: data.dimensions,
            metadata: data.metadata,
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!error && savedData) {
          console.log('✅ Floor plan saved to Supabase:', savedData.id);
          return { success: true, id: savedData.id };
        } else if (error) {
          console.error('Supabase save error:', error);
        }
      }

      // Fallback to local storage if Supabase not available
      const filePath = path.join(this.localStoragePath, `${id}.json`);
      
      // Don't save the imageData in local JSON to avoid file size issues
      const { imageData, ...dataWithoutImage } = data;
      
      await fs.writeFile(filePath, JSON.stringify({
        ...dataWithoutImage,
        id,
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      }, null, 2));

      console.log('✅ Floor plan saved locally:', id);
      return { success: true, id };

    } catch (error) {
      console.error('❌ Failed to save floor plan:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Load floor plan data by ID
   */
  async loadFloorPlan(id: string): Promise<FloorPlanData | null> {
    try {
      // Try Supabase first
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('floor_plans')
          .select('*')
          .eq('id', id)
          .single();

        if (!error && data) {
          console.log('✅ Floor plan loaded from Supabase:', id);
          return data;
        }
      }

      // Try local storage
      const filePath = path.join(this.localStoragePath, `${id}.json`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      console.log('✅ Floor plan loaded from local storage:', id);
      return data;

    } catch (error) {
      console.error('❌ Failed to load floor plan:', error);
      return null;
    }
  }

  /**
   * Load all floor plans for a project
   */
  async loadProjectFloorPlans(projectId: string): Promise<FloorPlanData[]> {
    console.log(`🔍 Loading floor plans for project: ${projectId}`);
    try {
      // Always try Supabase first for multi-user access
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('floor_plans')
          .select('*')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false });

        if (!error && data) {
          console.log(`✅ Loaded ${data.length} floor plans from Supabase for project:`, projectId);
          return data;
        } else if (error) {
          console.error('Supabase load error:', error);
        }
      }

      // Try local storage
      console.log(`📂 Reading files from: ${this.localStoragePath}`);
      const files = await fs.readdir(this.localStoragePath);
      console.log(`📄 Found ${files.length} files:`, files);
      const floorPlans: FloorPlanData[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.localStoragePath, file);
          console.log(`📖 Reading file: ${filePath}`);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          console.log(`🔍 File project_id: "${data.project_id}" vs requested: "${projectId}"`);
          
          if (data.project_id === projectId) {
            console.log(`✅ Match! Adding floor plan: ${file}`);
            floorPlans.push(data);
          } else {
            console.log(`❌ No match, skipping: ${file}`);
          }
        }
      }

      console.log(`✅ Loaded ${floorPlans.length} floor plans from local storage for project:`, projectId);
      return floorPlans.sort((a, b) => 
        new Date(b.metadata?.detected_at || 0).getTime() - 
        new Date(a.metadata?.detected_at || 0).getTime()
      );

    } catch (error) {
      console.error('❌ Failed to load project floor plans:', error);
      return [];
    }
  }

  /**
   * Update floor plan with edits
   */
  async updateFloorPlan(
    id: string, 
    updates: any,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const existing = await this.loadFloorPlan(id);
      if (!existing) {
        return { success: false, error: 'Floor plan not found' };
      }

      // Handle updates that may come in different formats
      const actualUpdates = updates.updates || updates;
      
      // Process the updates to handle user modifications
      const processedUpdates: any = {};
      
      // Copy standard fields
      if (actualUpdates.walls !== undefined) processedUpdates.walls = actualUpdates.walls;
      if (actualUpdates.doors !== undefined) processedUpdates.doors = actualUpdates.doors;
      if (actualUpdates.windows !== undefined) processedUpdates.windows = actualUpdates.windows;
      if (actualUpdates.rooms !== undefined) processedUpdates.rooms = actualUpdates.rooms;
      if (actualUpdates.dimensions !== undefined) processedUpdates.dimensions = actualUpdates.dimensions;
      
      // Store user modifications in metadata for tracking
      if (actualUpdates.userAddedWalls !== undefined || actualUpdates.deletedWallIndices !== undefined) {
        processedUpdates.metadata = {
          ...existing.metadata,
          userAddedWalls: actualUpdates.userAddedWalls,
          deletedWallIndices: actualUpdates.deletedWallIndices
        };
      }

      // Add to edit history
      const editEntry = {
        timestamp: new Date().toISOString(),
        changes: actualUpdates,
        user_id: userId
      };

      const updatedData: FloorPlanData = {
        ...existing,
        ...processedUpdates,
        metadata: {
          ...existing.metadata,
          ...processedUpdates.metadata,
          last_edited: new Date().toISOString(),
          version: (existing.metadata?.version || 0) + 1
        },
        edits_history: [
          ...(existing.edits_history || []),
          editEntry
        ]
      };

      // Save the updated data
      return await this.saveFloorPlan(updatedData);

    } catch (error) {
      console.error('❌ Failed to update floor plan:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Delete floor plan data
   */
  async deleteFloorPlan(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Try Supabase first
      if (this.supabase) {
        const { error } = await this.supabase
          .from('floor_plans')
          .delete()
          .eq('id', id);

        if (!error) {
          console.log('✅ Floor plan deleted from Supabase:', id);
          return { success: true };
        }
      }

      // Try local storage
      const filePath = path.join(this.localStoragePath, `${id}.json`);
      await fs.unlink(filePath);
      
      console.log('✅ Floor plan deleted from local storage:', id);
      return { success: true };

    } catch (error) {
      console.error('❌ Failed to delete floor plan:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Auto-save detection results after processing
   */
  async autoSaveDetection(
    projectId: string,
    imageUrl: string,
    detectionResults: any,
    userId?: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const floorPlanData: FloorPlanData = {
      project_id: projectId,
      user_id: userId,
      image_url: imageUrl,
      walls: detectionResults.walls || [],
      doors: detectionResults.doors || [],
      windows: detectionResults.windows || [],
      rooms: detectionResults.rooms || [],
      dimensions: detectionResults.dimensions || {
        width: 0,
        height: 0
      },
      metadata: {
        detected_at: new Date().toISOString(),
        version: 1,
        detection_method: detectionResults.method || 'auto-detection'
      }
    };

    const result = await this.saveFloorPlan(floorPlanData);
    
    if (result.success) {
      console.log('🔄 Auto-saved floor plan detection:', result.id);
    }

    return result;
  }
}

export default new FloorPlanPersistenceService();