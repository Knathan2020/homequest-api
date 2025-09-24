/**
 * Simple in-memory job queue for tracking blueprint processing
 */

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  filename: string;
}

class JobQueueService {
  private jobs: Map<string, Job> = new Map();

  createJob(id: string, filename: string): Job {
    const job: Job = {
      id,
      status: 'processing',
      progress: 0,
      startedAt: new Date(),
      filename
    };
    this.jobs.set(id, job);
    return job;
  }

  updateProgress(id: string, progress: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = progress;
    }
  }

  completeJob(id: string, result: any): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.result = result;
      job.completedAt = new Date();
    }
  }

  failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = new Date();
    }
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  // Clean up old jobs after 1 hour
  cleanupOldJobs(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt < oneHourAgo) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobQueue = new JobQueueService();