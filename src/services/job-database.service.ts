/**
 * Job Database Service
 * Stores jobs in Supabase database for shared access across all users
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProcessingJob } from './job-processor.service';

export class JobDatabaseService {
  private static supabase: SupabaseClient;
  private static readonly TABLE_NAME = 'floor_plan_jobs';
  
  /**
   * Initialize the Supabase client
   */
  static initialize(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase credentials not found. Using local storage fallback.');
      console.log('💡 Jobs will be stored locally and won\'t be shared between users.');
      return;
    }
    
    try {
      // Create client with anon key for public access
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      });
      console.log('🔌 Connected to Supabase database (public mode - no auth required)');
      
      // Create table if it doesn't exist
      this.ensureTableExists();
    } catch (error) {
      console.error('❌ Failed to connect to Supabase:', error);
    }
  }
  
  /**
   * Ensure the jobs table exists
   */
  private static async ensureTableExists(): Promise<void> {
    try {
      // Try to query the table
      const { error } = await this.supabase
        .from(this.TABLE_NAME)
        .select('id')
        .limit(1);
      
      if (error && error.code === 'PGRST116') {
        console.log('📋 Jobs table not found, creating...');
        // Table doesn't exist - in production, you'd create it via Supabase dashboard
        // For now, we'll just log that it needs to be created
        console.log(`
          Please create the following table in Supabase:
          
          CREATE TABLE ${this.TABLE_NAME} (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            filename TEXT,
            upload_path TEXT,
            image_path TEXT,
            result JSONB,
            error JSONB,
            metadata JSONB,
            uploaded_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            timestamp BIGINT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          
          CREATE INDEX idx_jobs_status ON ${this.TABLE_NAME}(status);
          CREATE INDEX idx_jobs_timestamp ON ${this.TABLE_NAME}(timestamp);
        `);
      } else if (!error) {
        console.log('✅ Jobs table exists');
      }
    } catch (error) {
      console.error('❌ Failed to check table existence:', error);
    }
  }
  
  /**
   * Save a job to the database
   */
  static async saveJob(jobId: string, job: ProcessingJob): Promise<void> {
    // First save to local memory for immediate access
    const jobs = global.floorPlanJobs || new Map();
    jobs.set(jobId, job);
    global.floorPlanJobs = jobs;
    
    // Then save to database if available
    if (!this.supabase) {
      console.log('📝 Saving job to local storage only (no database)');
      return;
    }
    
    try {
      const { error } = await this.supabase
        .from(this.TABLE_NAME)
        .upsert({
          id: jobId,
          status: job.status,
          progress: job.progress,
          filename: job.filename,
          upload_path: job.uploadPath,
          image_path: job.imagePath,
          result: job.result,
          error: job.error,
          metadata: job.metadata,
          uploaded_at: job.uploadedAt,
          started_at: job.startedAt,
          completed_at: job.completedAt,
          timestamp: job.timestamp,
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('❌ Failed to save job to database:', error);
      } else {
        console.log(`💾 Job ${jobId} saved to database`);
      }
    } catch (error) {
      console.error('❌ Error saving job to database:', error);
    }
  }
  
  /**
   * Get a job from the database
   */
  static async getJob(jobId: string): Promise<ProcessingJob | undefined> {
    // First check local memory
    const jobs = global.floorPlanJobs || new Map();
    let job = jobs.get(jobId);
    
    if (job) {
      return job;
    }
    
    // If not in memory and database is available, check database
    if (!this.supabase) {
      return undefined;
    }
    
    try {
      const { data, error } = await this.supabase
        .from(this.TABLE_NAME)
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (error) {
        if (error.code !== 'PGRST116') { // Not a "row not found" error
          console.error('❌ Failed to fetch job from database:', error);
        }
        return undefined;
      }
      
      if (data) {
        // Convert database format back to ProcessingJob
        job = {
          id: data.id,
          status: data.status,
          progress: data.progress,
          filename: data.filename,
          uploadPath: data.upload_path,
          imagePath: data.image_path,
          result: data.result,
          error: data.error,
          metadata: data.metadata,
          uploadedAt: data.uploaded_at ? new Date(data.uploaded_at) : undefined,
          startedAt: data.started_at ? new Date(data.started_at) : undefined,
          completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
          timestamp: data.timestamp
        };
        
        // Cache in memory
        jobs.set(jobId, job);
        global.floorPlanJobs = jobs;
        
        console.log(`📥 Job ${jobId} loaded from database`);
        return job;
      }
    } catch (error) {
      console.error('❌ Error fetching job from database:', error);
    }
    
    return undefined;
  }
  
  /**
   * Get all active jobs (pending or processing)
   */
  static async getActiveJobs(): Promise<ProcessingJob[]> {
    if (!this.supabase) {
      // Return from memory if no database
      const jobs = global.floorPlanJobs || new Map();
      return Array.from(jobs.values()).filter((j: ProcessingJob) => 
        j.status === 'pending' || j.status === 'processing'
      );
    }
    
    try {
      const { data, error } = await this.supabase
        .from(this.TABLE_NAME)
        .select('*')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Failed to fetch active jobs:', error);
        return [];
      }
      
      return data.map(d => ({
        id: d.id,
        status: d.status,
        progress: d.progress,
        filename: d.filename,
        uploadPath: d.upload_path,
        imagePath: d.image_path,
        result: d.result,
        error: d.error,
        metadata: d.metadata,
        uploadedAt: d.uploaded_at ? new Date(d.uploaded_at) : undefined,
        startedAt: d.started_at ? new Date(d.started_at) : undefined,
        completedAt: d.completed_at ? new Date(d.completed_at) : undefined,
        timestamp: d.timestamp
      }));
    } catch (error) {
      console.error('❌ Error fetching active jobs:', error);
      return [];
    }
  }
  
  /**
   * Delete a job
   */
  static async deleteJob(jobId: string): Promise<void> {
    // Remove from memory
    const jobs = global.floorPlanJobs || new Map();
    jobs.delete(jobId);
    global.floorPlanJobs = jobs;
    
    // Remove from database if available
    if (!this.supabase) {
      return;
    }
    
    try {
      const { error } = await this.supabase
        .from(this.TABLE_NAME)
        .delete()
        .eq('id', jobId);
      
      if (error) {
        console.error('❌ Failed to delete job from database:', error);
      } else {
        console.log(`🗑️ Job ${jobId} deleted from database`);
      }
    } catch (error) {
      console.error('❌ Error deleting job from database:', error);
    }
  }
  
  /**
   * Clean up old jobs
   */
  static async cleanupOldJobs(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    let cleanedCount = 0;
    
    if (!this.supabase) {
      // Clean up local memory only
      const jobs = global.floorPlanJobs || new Map();
      for (const [jobId, job] of jobs.entries()) {
        if (job.timestamp && job.timestamp < Date.now() - 3600000) {
          jobs.delete(jobId);
          cleanedCount++;
        }
      }
      global.floorPlanJobs = jobs;
      return cleanedCount;
    }
    
    try {
      // Delete old completed/failed jobs from database
      const { data, error } = await this.supabase
        .from(this.TABLE_NAME)
        .delete()
        .in('status', ['completed', 'failed'])
        .lt('created_at', oneHourAgo)
        .select('id');
      
      if (error) {
        console.error('❌ Failed to clean up old jobs:', error);
      } else if (data) {
        cleanedCount = data.length;
        console.log(`🧹 Cleaned up ${cleanedCount} old jobs from database`);
        
        // Also clean up local memory
        const jobs = global.floorPlanJobs || new Map();
        data.forEach(d => jobs.delete(d.id));
        global.floorPlanJobs = jobs;
      }
    } catch (error) {
      console.error('❌ Error cleaning up old jobs:', error);
    }
    
    return cleanedCount;
  }
}

// Export for use in other modules
export default JobDatabaseService;