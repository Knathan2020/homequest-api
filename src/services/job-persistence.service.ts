/**
 * Job Persistence Service
 * Saves and loads jobs from disk to survive server restarts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProcessingJob } from './job-processor.service';

export class JobPersistenceService {
  private static readonly JOBS_DIR = path.join(process.cwd(), 'data', 'jobs');
  private static readonly JOBS_FILE = path.join(JobPersistenceService.JOBS_DIR, 'jobs.json');
  
  /**
   * Initialize the persistence service and ensure directories exist
   */
  static initialize(): void {
    // Create jobs directory if it doesn't exist
    if (!fs.existsSync(this.JOBS_DIR)) {
      fs.mkdirSync(this.JOBS_DIR, { recursive: true });
      console.log('📁 Created jobs directory:', this.JOBS_DIR);
    }
    
    // Load existing jobs from disk
    this.loadJobs();
  }
  
  /**
   * Save all jobs to disk
   */
  static saveJobs(): void {
    try {
      const jobs = global.floorPlanJobs || new Map();
      
      // Convert Map to array for JSON serialization
      const jobsArray = Array.from(jobs.entries()).map(([id, job]) => ({
        id,
        ...job
      }));
      
      // Save to disk
      fs.writeFileSync(this.JOBS_FILE, JSON.stringify(jobsArray, null, 2));
      console.log(`💾 Saved ${jobsArray.length} jobs to disk`);
    } catch (error) {
      console.error('❌ Failed to save jobs to disk:', error);
    }
  }
  
  /**
   * Load jobs from disk
   */
  static loadJobs(): void {
    try {
      if (!fs.existsSync(this.JOBS_FILE)) {
        console.log('📄 No existing jobs file found, starting fresh');
        global.floorPlanJobs = new Map();
        return;
      }
      
      const data = fs.readFileSync(this.JOBS_FILE, 'utf-8');
      const jobsArray = JSON.parse(data);
      
      // Convert array back to Map
      const jobs = new Map();
      for (const job of jobsArray) {
        // Filter out old completed/failed jobs (older than 1 hour)
        const oneHourAgo = Date.now() - 3600000;
        if (job.timestamp && job.timestamp < oneHourAgo && 
            (job.status === 'completed' || job.status === 'failed')) {
          continue;
        }
        
        jobs.set(job.id, job);
      }
      
      global.floorPlanJobs = jobs;
      console.log(`📥 Loaded ${jobs.size} jobs from disk`);
      
      // Log active jobs
      const activeJobs = Array.from(jobs.values()).filter(j => 
        j.status === 'pending' || j.status === 'processing'
      );
      if (activeJobs.length > 0) {
        console.log(`🔄 Active jobs: ${activeJobs.map(j => j.id).join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Failed to load jobs from disk:', error);
      global.floorPlanJobs = new Map();
    }
  }
  
  /**
   * Save a single job
   */
  static saveJob(jobId: string, job: ProcessingJob): void {
    const jobs = global.floorPlanJobs || new Map();
    jobs.set(jobId, job);
    global.floorPlanJobs = jobs;
    
    // Save to disk
    this.saveJobs();
  }
  
  /**
   * Get a job by ID
   */
  static getJob(jobId: string): ProcessingJob | undefined {
    const jobs = global.floorPlanJobs || new Map();
    return jobs.get(jobId);
  }
  
  /**
   * Delete a job
   */
  static deleteJob(jobId: string): void {
    const jobs = global.floorPlanJobs || new Map();
    jobs.delete(jobId);
    global.floorPlanJobs = jobs;
    
    // Save to disk
    this.saveJobs();
  }
  
  /**
   * Clean up old jobs
   */
  static cleanupOldJobs(): number {
    const oneHourAgo = Date.now() - 3600000;
    const jobs = global.floorPlanJobs || new Map();
    let cleanedCount = 0;
    
    for (const [jobId, job] of jobs.entries()) {
      if (job.timestamp && job.timestamp < oneHourAgo) {
        jobs.delete(jobId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      global.floorPlanJobs = jobs;
      this.saveJobs();
      console.log(`🧹 Cleaned up ${cleanedCount} old jobs`);
    }
    
    return cleanedCount;
  }
}

// Export for use in other modules
export default JobPersistenceService;