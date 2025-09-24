import { Request, Response, NextFunction } from 'express';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { StorageService } from '../services/storage.service';
import { Export3DService } from '../services/3d/export.service';
import JobDatabaseService from '../services/job-database.service';
import { 
  FloorPlan, 
  ProcessingStatus, 
  ProcessingResult,
  ProcessingOptions,
  ValidationError
} from '../types/floor-plan.types';


interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

interface ProcessingJob {
  id: string;
  floorPlanId: string;
  status: ProcessingStatus;
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  result?: ProcessingResult;
  error?: string;
}

export class FloorPlanController {
  private storageService: StorageService;
  private export3DService: Export3DService;
  private processingQueue: Queue;
  private jobs: Map<string, ProcessingJob>;
  private supabase: any;

  constructor(processingQueue: Queue) {
    this.storageService = new StorageService();
    this.export3DService = new Export3DService();
    this.processingQueue = processingQueue;
    this.jobs = new Map();
    
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    ) as any;

    this.setupQueueListeners();
  }

  private setupQueueListeners(): void {
    this.processingQueue.on('progress', (job, progress) => {
      const processingJob = this.jobs.get(job.id.toString());
      if (processingJob) {
        processingJob.progress = progress;
      }
    });

    this.processingQueue.on('completed', (job, result) => {
      const processingJob = this.jobs.get(job.id.toString());
      if (processingJob) {
        processingJob.status = ProcessingStatus.COMPLETED;
        processingJob.progress = 100;
        processingJob.completedAt = new Date();
        processingJob.result = result;
      }
    });

    this.processingQueue.on('failed', (job, err) => {
      const processingJob = this.jobs.get(job.id.toString());
      if (processingJob) {
        processingJob.status = ProcessingStatus.FAILED;
        processingJob.completedAt = new Date();
        processingJob.error = err.message;
      }
    });
  }

  async uploadFloorPlan(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          error: 'No file uploaded',
          code: 'FILE_MISSING'
        });
        return;
      }

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        res.status(400).json({
          error: 'Invalid file type. Supported formats: JPEG, PNG, WebP, TIFF, PDF',
          code: 'INVALID_FILE_TYPE'
        });
        return;
      }

      const maxFileSize = 50 * 1024 * 1024; // 50MB
      if (req.file.size > maxFileSize) {
        res.status(400).json({
          error: 'File size exceeds 50MB limit',
          code: 'FILE_TOO_LARGE'
        });
        return;
      }

      const floorPlanId = uuidv4();
      const uploadPath = `${floorPlanId}/original/${req.file.originalname}`;

      let processedBuffer = req.file.buffer;
      let metadata: any = {};

      if (req.file.mimetype !== 'application/pdf') {
        const image = sharp(req.file.buffer);
        metadata = await image.metadata();
        
        if (metadata.width && metadata.height) {
          const maxDimension = 4096;
          if (metadata.width > maxDimension || metadata.height > maxDimension) {
            processedBuffer = await image
              .resize(maxDimension, maxDimension, { 
                fit: 'inside',
                withoutEnlargement: true 
              })
              .toBuffer();
          }
        }
      }

      const uploadResult = await this.storageService.uploadFile(
        uploadPath,
        processedBuffer,
        req.file.mimetype
      );

      const floorPlan: Partial<FloorPlan> = {
        id: floorPlanId,
        originalUrl: uploadResult.url,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        width: metadata.width,
        height: metadata.height,
        status: ProcessingStatus.PENDING,
        uploadedAt: new Date(),
        metadata: {
          format: metadata.format,
          space: metadata.space,
          channels: metadata.channels,
          depth: metadata.depth,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha
        }
      };

      // Skip database save for now - just store in memory or local file
      console.log('✅ Floor plan ready for processing:', floorPlanId);
      
      // Store job using database service
      await JobDatabaseService.saveJob(floorPlanId, {
        ...floorPlan,
        id: floorPlanId,  // Ensure id is set
        status: 'pending',  // Start as pending, will be processed on first check
        progress: 0,
        filename: req.file.originalname,  // Store actual filename
        uploadPath: uploadPath,
        timestamp: Date.now()
      });

      res.status(201).json({
        id: floorPlanId,
        jobId: floorPlanId,  // Frontend expects this for polling
        message: 'Floor plan uploaded successfully',
        data: {
          id: floorPlanId,
          filename: req.file.originalname,
          size: req.file.size,
          url: uploadResult.url,
          path: uploadResult.path,
          status: 'uploaded',
          metadata
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async processFloorPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const options: ProcessingOptions = req.body;

      const { data: floorPlan, error } = await this.supabase
        .from('floor_plans')
        .select('*')
        .eq('id', id)
        .single() as { data: any; error: any };

      if (error || !floorPlan) {
        res.status(404).json({
          error: 'Floor plan not found',
          code: 'NOT_FOUND'
        });
        return;
      }

      if (floorPlan.status === 'processing') {
        res.status(409).json({
          error: 'Floor plan is already being processed',
          code: 'ALREADY_PROCESSING'
        });
        return;
      }

      const jobId = uuidv4();
      void await this.processingQueue.add('process-floor-plan', {
        floorPlanId: id,
        options: {
          enableOCR: options.enableOCR ?? true,
          enableObjectDetection: options.enableObjectDetection ?? true,
          enableAI: options.enableAI ?? true,
          enableGeometry: options.enableGeometry ?? true,
          enable3D: options.enable3D ?? true,
          outputFormats: options.outputFormats ?? ['json', 'gltf'],
          language: options.language ?? 'en',
          units: options.units ?? 'imperial',
          scale: options.scale,
          confidence: {
            min: options.confidence?.min ?? 0.7,
            required: options.confidence?.required ?? 0.8
          }
        }
      }, {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: false,
        removeOnFail: false
      });

      const processingJob: ProcessingJob = {
        id: jobId,
        floorPlanId: id,
        status: ProcessingStatus.ANALYZING,
        progress: 0,
        startedAt: new Date()
      };

      this.jobs.set(jobId, processingJob);

      await this.supabase
        .from('floor_plans')
        .update({ 
          status: ProcessingStatus.ANALYZING,
          processingStartedAt: new Date()
        })
        .eq('id', id);

      res.status(202).json({
        jobId,
        message: 'Floor plan processing started',
        status: ProcessingStatus.ANALYZING,
        checkStatusUrl: `/api/floor-plans/${id}/status/${jobId}`
      });
    } catch (error) {
      next(error);
    }
  }

  async getProcessingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, jobId } = req.params;

      const job = this.jobs.get(jobId);
      if (!job || job.floorPlanId !== id) {
        const bullJob = await this.processingQueue.getJob(jobId);
        if (!bullJob) {
          res.status(404).json({
            error: 'Job not found',
            code: 'JOB_NOT_FOUND'
          });
          return;
        }

        const progress = bullJob.progress();
        const state = await bullJob.getState();
        
        res.json({
          jobId,
          floorPlanId: id,
          status: state,
          progress: typeof progress === 'number' ? progress : 0,
          startedAt: bullJob.timestamp,
          completedAt: bullJob.finishedOn,
          result: bullJob.returnvalue,
          error: bullJob.failedReason
        });
        return;
      }

      const response: any = {
        jobId: job.id,
        floorPlanId: job.floorPlanId,
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      };

      if (job.status === 'completed' && job.result) {
        response.result = {
          rooms: job.result.rooms?.length ?? 0,
          walls: job.result.walls?.length ?? 0,
          doors: job.result.doors?.length ?? 0,
          windows: job.result.windows?.length ?? 0,
          fixtures: job.result.fixtures?.length ?? 0,
          dimensions: job.result.dimensions,
          area: job.result.area,
          confidence: job.result.confidence
        };
      } else if (job.status === 'failed' && job.error) {
        response.error = job.error;
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async getProcessingResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { format = 'json', download = false } = req.query;

      const { data: floorPlan, error } = await this.supabase
        .from('floor_plans')
        .select('*')
        .eq('id', id)
        .single() as { data: any; error: any };

      if (error || !floorPlan) {
        res.status(404).json({
          error: 'Floor plan not found',
          code: 'NOT_FOUND'
        });
        return;
      }

      if (floorPlan.status !== ProcessingStatus.COMPLETED && floorPlan.status !== 'completed') {
        res.status(400).json({
          error: `Floor plan processing not completed. Current status: ${floorPlan.status}`,
          code: 'NOT_COMPLETED'
        });
        return;
      }

      const { data: results, error: resultsError } = await this.supabase
        .from('processing_results')
        .select('*')
        .eq('floor_plan_id', id)
        .single() as { data: any; error: any };

      if (resultsError || !results) {
        res.status(404).json({
          error: 'Processing results not found',
          code: 'RESULTS_NOT_FOUND'
        });
        return;
      }

      if (format === 'json') {
        if (download === 'true') {
          res.setHeader('Content-Disposition', `attachment; filename="floor-plan-${id}.json"`);
          res.setHeader('Content-Type', 'application/json');
        }
        res.json(results.data);
      } else if (['gltf', 'obj', 'stl', 'ply', 'dae'].includes(format as string)) {
        const exportResult = await this.export3DService.export(
          results.data,
          format as any
        );

        const mimeTypes: Record<string, string> = {
          gltf: 'model/gltf+json',
          obj: 'model/obj',
          stl: 'model/stl',
          ply: 'model/ply',
          dae: 'model/vnd.collada+xml'
        };

        res.setHeader('Content-Type', mimeTypes[format as string] || 'application/octet-stream');
        if (download === 'true') {
          res.setHeader('Content-Disposition', `attachment; filename="floor-plan-${id}.${format}"`);
        }

        if (exportResult.data) {
          if (typeof exportResult.data === 'string') {
            res.send(exportResult.data);
          } else {
            res.send(Buffer.from(exportResult.data as ArrayBuffer));
          }
        } else {
          res.status(500).json({ error: 'Failed to generate export data' });
        }
      } else {
        res.status(400).json({
          error: 'Invalid format. Supported formats: json, gltf, obj, stl, ply, dae',
          code: 'INVALID_FORMAT'
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async getAllFloorPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        sortBy = 'uploadedAt', 
        order = 'desc' 
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      let query = this.supabase
        .from('floor_plans')
        .select('*', { count: 'exact' }) as any;

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order(sortBy as string, { ascending: order === 'asc' })
        .range(offset, offset + Number(limit) - 1);

      if (error) {
        throw new Error(`Failed to fetch floor plans: ${error.message}`);
      }

      res.json({
        data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: count,
          totalPages: Math.ceil((count || 0) / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFloorPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const { data: floorPlan, error: fetchError } = await this.supabase
        .from('floor_plans')
        .select('*')
        .eq('id', id)
        .single() as { data: any; error: any };

      if (fetchError || !floorPlan) {
        res.status(404).json({
          error: 'Floor plan not found',
          code: 'NOT_FOUND'
        });
        return;
      }

      if (floorPlan.status === 'processing') {
        const jobs = await this.processingQueue.getJobs(['active', 'waiting', 'delayed']);
        const activeJob = jobs.find(job => job.data.floorPlanId === id);
        if (activeJob) {
          await activeJob.remove();
        }
      }

      if (floorPlan.originalUrl) {
        const path = floorPlan.originalUrl.split('/').slice(-3).join('/');
        await this.storageService.deleteFile(path);
      }

      const { error: deleteResultsError } = await this.supabase
        .from('processing_results')
        .delete()
        .eq('floor_plan_id', id);

      if (deleteResultsError) {
        console.error('Failed to delete processing results:', deleteResultsError);
      }

      const { error: deleteError } = await this.supabase
        .from('floor_plans')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw new Error(`Failed to delete floor plan: ${deleteError.message}`);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async retryProcessing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, jobId } = req.params;

      const job = await this.processingQueue.getJob(jobId);
      if (!job) {
        res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND'
        });
        return;
      }

      const state = await job.getState();
      if (state !== 'failed') {
        res.status(400).json({
          error: `Cannot retry job in ${state} state`,
          code: 'INVALID_STATE'
        });
        return;
      }

      await job.retry();

      res.json({
        message: 'Job retry initiated',
        jobId,
        floorPlanId: id
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelProcessing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, jobId } = req.params;

      const job = await this.processingQueue.getJob(jobId);
      if (!job) {
        res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND'
        });
        return;
      }

      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        res.status(400).json({
          error: `Cannot cancel job in ${state} state`,
          code: 'INVALID_STATE'
        });
        return;
      }

      await job.remove();

      await this.supabase
        .from('floor_plans')
        .update({ 
          status: ProcessingStatus.CANCELLED,
          processingCompletedAt: new Date()
        })
        .eq('id', id);

      res.json({
        message: 'Processing cancelled',
        jobId,
        floorPlanId: id
      });
    } catch (error) {
      next(error);
    }
  }

  async validateFloorPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const { data: results, error } = await this.supabase
        .from('processing_results')
        .select('data')
        .eq('floor_plan_id', id)
        .single() as { data: any; error: any };

      if (error || !results) {
        res.status(404).json({
          error: 'Processing results not found',
          code: 'RESULTS_NOT_FOUND'
        });
        return;
      }

      const validationErrors: ValidationError[] = [];
      const processingResult = results.data as ProcessingResult;

      if (!processingResult.rooms || processingResult.rooms.length === 0) {
        validationErrors.push({
          field: 'rooms',
          message: 'No rooms detected',
          severity: 'error'
        });
      }

      if (!processingResult.walls || processingResult.walls.length === 0) {
        validationErrors.push({
          field: 'walls',
          message: 'No walls detected',
          severity: 'error'
        });
      }

      if (!processingResult.scale || processingResult.scale === 0) {
        validationErrors.push({
          field: 'scale',
          message: 'Scale not determined',
          severity: 'warning'
        });
      }

      if (processingResult.confidence && processingResult.confidence.overall < 0.7) {
        validationErrors.push({
          field: 'confidence',
          message: `Low confidence score: ${processingResult.confidence.overall}`,
          severity: 'warning'
        });
      }

      processingResult.rooms?.forEach((room: any, index: number) => {
        if (!room.boundaries || (room.boundaries && room.boundaries.length < 3)) {
          validationErrors.push({
            field: `rooms[${index}].boundaries`,
            message: `Room ${room.name || index} has invalid boundaries`,
            severity: 'error'
          });
        }

        if (!room.area || room.area <= 0) {
          validationErrors.push({
            field: `rooms[${index}].area`,
            message: `Room ${room.name || index} has invalid area`,
            severity: 'warning'
          });
        }
      });

      const disconnectedRooms = processingResult.rooms?.filter((room: any) => {
        const hasConnection = processingResult.doors?.some((door: any) => 
          door.connectedRooms?.includes(room.id!)
        );
        return !hasConnection && processingResult.rooms!.length > 1;
      });

      if (disconnectedRooms && disconnectedRooms.length > 0) {
        validationErrors.push({
          field: 'connectivity',
          message: `${disconnectedRooms.length} disconnected room(s) found`,
          severity: 'warning'
        });
      }

      const isValid = !validationErrors.some(error => error.severity === 'error');

      res.json({
        valid: isValid,
        errors: validationErrors,
        summary: {
          totalErrors: validationErrors.filter(e => e.severity === 'error').length,
          totalWarnings: validationErrors.filter(e => e.severity === 'warning').length,
          rooms: processingResult.rooms?.length ?? 0,
          walls: processingResult.walls?.length ?? 0,
          doors: processingResult.doors?.length ?? 0,
          windows: processingResult.windows?.length ?? 0,
          confidence: processingResult.confidence?.overall ?? 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
}