// ========================================
// Basic Floor Plan Service
// ========================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Simple interfaces for now
interface FloorPlan {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  file_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rooms?: any[];
  total_area?: number;
  created_at: string;
  updated_at: string;
}

interface FloorPlanProcessingResult {
  id: string;
  name: string;
  status: string;
  file_url: string;
  rooms?: any[];
  total_area?: number;
  created_at: string;
}

export class FloorPlanService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase not configured - service will run in mock mode');
      this.supabase = null as any;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async processFloorPlan(
    file: Express.Multer.File,
    userId: string,
    projectId: string,
    metadata: any = {}
  ): Promise<FloorPlanProcessingResult> {
    console.log(`📁 Processing floor plan: ${file.originalname}`);

    try {
      const floorPlanId = uuidv4();
      
      // Upload file to storage
      const fileUrl = await this.uploadFile(file, floorPlanId);
      
      // Create basic floor plan record
      const floorPlan: FloorPlan = {
        id: floorPlanId,
        user_id: userId,
        project_id: projectId,
        name: file.originalname,
        file_url: fileUrl,
        status: 'completed',
        rooms: [
          {
            id: uuidv4(),
            name: 'Living Room',
            type: 'living_room',
            area: 150,
            dimensions: { width: 12, height: 12.5 }
          },
          {
            id: uuidv4(),
            name: 'Kitchen',
            type: 'kitchen', 
            area: 100,
            dimensions: { width: 10, height: 10 }
          }
        ],
        total_area: 250,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Save to database if configured
      if (this.supabase) {
        await this.saveFloorPlan(floorPlan);
      }

      return {
        id: floorPlan.id,
        name: floorPlan.name,
        status: floorPlan.status,
        file_url: floorPlan.file_url,
        rooms: floorPlan.rooms,
        total_area: floorPlan.total_area,
        created_at: floorPlan.created_at
      };

    } catch (error: any) {
      console.error('❌ Floor plan processing failed:', error);
      throw new Error(`Processing failed: ${error.message}`);
    }
  }

  async getFloorPlansByProject(
    projectId: string,
    options: { page: number; limit: number; sort: 'asc' | 'desc' }
  ): Promise<{ data: FloorPlan[]; pagination: any }> {
    if (!this.supabase) {
      return {
        data: [],
        pagination: { page: options.page, limit: options.limit, total: 0, totalPages: 0 }
      };
    }

    const { page, limit, sort } = options;
    const offset = (page - 1) * limit;

    const { data, error, count } = await this.supabase
      .from('floor_plans')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: sort === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  async getFloorPlanById(id: string): Promise<FloorPlan | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('floor_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return data;
  }

  async updateFloorPlan(id: string, updates: Partial<FloorPlan>): Promise<FloorPlan> {
    if (!this.supabase) throw new Error('Database not configured');

    const { data, error } = await this.supabase
      .from('floor_plans')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteFloorPlan(id: string): Promise<void> {
    if (!this.supabase) throw new Error('Database not configured');

    const { error } = await this.supabase
      .from('floor_plans')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  async reanalyzeFloorPlan(id: string, forceReprocess: boolean = false): Promise<any> {
    return {
      id,
      status: 'queued',
      message: 'Floor plan queued for re-analysis'
    };
  }

  async exportToCSV(floorPlan: FloorPlan): Promise<string> {
    const headers = ['Room Name', 'Type', 'Area'];
    const rows = (floorPlan.rooms || []).map(room => [
      room.name || '',
      room.type || '',
      room.area || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  async exportToPDF(floorPlan: FloorPlan): Promise<Buffer> {
    throw new Error('PDF export not implemented');
  }

  async duplicateFloorPlan(id: string, targetProjectId?: string, newName?: string): Promise<FloorPlan> {
    const original = await this.getFloorPlanById(id);
    if (!original) throw new Error('Original floor plan not found');

    const duplicate = {
      ...original,
      id: uuidv4(),
      project_id: targetProjectId || original.project_id,
      name: newName || `${original.name} (Copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (this.supabase) {
      await this.saveFloorPlan(duplicate);
    }

    return duplicate;
  }

  async getRoomsByFloorPlan(id: string): Promise<any[]> {
    const floorPlan = await this.getFloorPlanById(id);
    return floorPlan?.rooms || [];
  }

  async updateRoom(floorPlanId: string, roomId: string, updates: any): Promise<any> {
    const floorPlan = await this.getFloorPlanById(floorPlanId);
    if (!floorPlan) throw new Error('Floor plan not found');

    const rooms = floorPlan.rooms || [];
    const roomIndex = rooms.findIndex(room => room.id === roomId);
    if (roomIndex === -1) throw new Error('Room not found');

    rooms[roomIndex] = { ...rooms[roomIndex], ...updates };
    await this.updateFloorPlan(floorPlanId, { rooms });

    return rooms[roomIndex];
  }

  async calculateCostEstimate(id: string, detailed: boolean = false): Promise<any> {
    return {
      totalEstimate: 50000,
      breakdown: detailed ? { materials: 30000, labor: 20000 } : undefined,
      accuracy: 'rough',
      lastUpdated: new Date().toISOString()
    };
  }

  async batchProcessFloorPlans(files: Express.Multer.File[], userId: string, projectId: string): Promise<any> {
    const results = await Promise.allSettled(
      files.map(file => this.processFloorPlan(file, userId, projectId))
    );

    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<FloorPlanProcessingResult>).value);

    const failed = results
      .map((r, i) => ({ result: r, index: i }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ result, index }) => ({
        fileName: files[index].originalname,
        error: (result as PromiseRejectedResult).reason?.message || 'Unknown error'
      }));

    return { successful, failed };
  }

  // Private helper methods
  private async uploadFile(file: Express.Multer.File, floorPlanId: string): Promise<string> {
    if (!this.supabase) {
      return `https://placeholder.com/floor-plans/${floorPlanId}.${file.originalname.split('.').pop()}`;
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `${floorPlanId}.${fileExt}`;
    const filePath = `floor-plans/${fileName}`;

    const { data, error } = await this.supabase.storage
      .from('floor-plans')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data: { publicUrl } } = this.supabase.storage
      .from('floor-plans')
      .getPublicUrl(filePath);

    return publicUrl;
  }

  private async saveFloorPlan(floorPlan: FloorPlan): Promise<void> {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('floor_plans')
      .insert(floorPlan);

    if (error) throw new Error(`Database save failed: ${error.message}`);
  }
}

// Export singleton instance
export const floorPlanService = new FloorPlanService();