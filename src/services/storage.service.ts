/**
 * Storage Service for Supabase
 * Handles floor plan uploads, metadata, processing results, and file retrieval
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Import types
import { 
  FloorPlanUpload, 
  ProcessedFloorPlan, 
  ProcessingStatus,
  FloorPlanMetadata,
  FloorPlanExportOptions,
  FloorPlanFormat
} from '../types/floor-plan.types';
import { Room } from '../types/room.types';
import { ProcessingResult, ProcessingMetrics } from '../types/processing.types';
import { ApiResponse, ApiSuccessResponse, HttpStatus, PaginatedResponse } from '../types/api.types';

// Load environment variables
dotenv.config();

/**
 * Database table names
 */
export enum TableName {
  FLOOR_PLANS = 'floor_plans',
  FLOOR_PLAN_METADATA = 'floor_plan_metadata',
  PROCESSING_JOBS = 'processing_jobs',
  PROCESSING_RESULTS = 'processing_results',
  ROOMS = 'rooms',
  FLOOR_PLAN_REVISIONS = 'floor_plan_revisions',
  USER_UPLOADS = 'user_uploads',
  ORGANIZATIONS = 'organizations',
  PROJECTS = 'projects'
}

/**
 * Storage bucket names
 */
export enum BucketName {
  FLOOR_PLANS = 'floor-plans',
  PROCESSED = 'processed-floor-plans',
  THUMBNAILS = 'thumbnails',
  EXPORTS = 'exports',
  TEMP = 'temp-uploads',
  ARCHIVES = 'archives'
}

/**
 * File upload options
 */
export interface UploadOptions {
  projectId: string;
  userId: string;
  organizationId?: string;
  metadata?: FloorPlanMetadata;
  tags?: string[];
  generateThumbnail?: boolean;
  processImmediately?: boolean;
  isPublic?: boolean;
  expiresAt?: Date;
}

/**
 * Query options for listing floor plans
 */
export interface QueryOptions {
  projectId?: string;
  userId?: string;
  organizationId?: string;
  status?: ProcessingStatus;
  tags?: string[];
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<string, number>;
  averageFileSize: number;
  storageUsed: number;
  storageLimit: number;
  oldestFile?: Date;
  newestFile?: Date;
}

/**
 * Supabase Storage Service
 */
export class StorageService {
  private supabase: SupabaseClient;
  private bucketPrefix: string;
  private maxFileSize: number;
  private allowedFormats: Set<string>;
  private signedUrlExpiry: number;

  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
    );

    // Configuration
    this.bucketPrefix = process.env.STORAGE_BUCKET_PREFIX || '';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '104857600'); // 100MB default
    this.allowedFormats = new Set(
      (process.env.ALLOWED_FORMATS || 'pdf,png,jpg,jpeg,tiff,bmp,dwg,dxf').split(',')
    );
    this.signedUrlExpiry = parseInt(process.env.SIGNED_URL_EXPIRY || '3600'); // 1 hour default
  }

  // ============================
  // BASIC FILE OPERATIONS
  // ============================

  /**
   * Upload a file to storage
   */
  async uploadFile(
    path: string,
    buffer: Buffer,
    mimeType: string,
    bucket: BucketName = BucketName.FLOOR_PLANS
  ): Promise<{ url: string; path: string }> {
    try {
      // Save locally instead of Supabase
      const fs = require('fs');
      const fsPath = require('path');
      
      // Create uploads directory if it doesn't exist
      const uploadsDir = fsPath.join(process.cwd(), 'uploads', bucket);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Save file locally
      const fullPath = fsPath.join(uploadsDir, path);
      const dir = fsPath.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, buffer);
      
      const publicUrl = `http://localhost:4000/uploads/${bucket}/${path}`;
      
      console.log('✅ File saved locally:', fullPath);
      
      return {
        url: publicUrl,
        path: fullPath
      };
    } catch (error: any) {
      console.error('❌ Storage upload error:', error);
      throw error;
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(
    path: string,
    bucket: BucketName = BucketName.FLOOR_PLANS
  ): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    } catch (error: any) {
      console.error('❌ Storage delete error:', error);
      throw error;
    }
  }

  // ============================
  // Upload Operations
  // ============================

  /**
   * Upload floor plan image to Supabase storage
   */
  async uploadFloorPlan(
    file: Buffer | Blob | File,
    filename: string,
    options: UploadOptions
  ): Promise<ApiResponse<FloorPlanUpload>> {
    try {
      // Validate file
      const validation = await this.validateFile(file, filename);
      if (!validation.valid) {
        return this.errorResponse(validation.error!, HttpStatus.BAD_REQUEST);
      }

      // Generate unique filename and path
      const fileExt = path.extname(filename).toLowerCase().substring(1);
      const uniqueId = uuidv4();
      const _timestamp = Date.now();
      const _sanitizedName = this.sanitizeFilename(filename);
      const filePath = this.generateFilePath(options.projectId, uniqueId, fileExt);

      // Calculate file hash for deduplication
      const fileHash = await this.calculateFileHash(file);

      // Check for duplicate
      const existingFile = await this.findByHash(fileHash);
      if (existingFile) {
        return this.successResponse(existingFile, 'File already exists');
      }

      // Upload to Supabase storage
      const { error: uploadError } = await this.supabase.storage
        .from(BucketName.FLOOR_PLANS)
        .upload(filePath, file, {
          contentType: this.getContentType(fileExt),
          upsert: false,
          cacheControl: '3600'
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return this.errorResponse('Failed to upload file', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(BucketName.FLOOR_PLANS)
        .getPublicUrl(filePath);

      // Prepare floor plan record
      const floorPlanRecord: Partial<FloorPlanUpload> = {
        id: uniqueId,
        projectId: options.projectId,
        userId: options.userId,
        originalFileName: filename,
        fileFormat: fileExt as FloorPlanFormat,
        fileSizeBytes: this.getFileSize(file),
        fileUrl: urlData.publicUrl,
        mimeType: this.getContentType(fileExt),
        uploadedAt: new Date(),
        metadata: options.metadata,
        tags: options.tags,
        checksum: fileHash,
        source: {
          type: 'api',
          userAgent: 'storage-service'
        }
      };

      // Save metadata to database
      const { data: dbData, error: dbError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .insert(floorPlanRecord)
        .select()
        .single();

      if (dbError) {
        // Rollback: delete uploaded file
        await this.supabase.storage
          .from(BucketName.FLOOR_PLANS)
          .remove([filePath]);
        
        console.error('Database insert error:', dbError);
        return this.errorResponse('Failed to save metadata', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Generate thumbnail if requested
      if (options.generateThumbnail) {
        this.generateThumbnailAsync(uniqueId, filePath, fileExt);
      }

      // Trigger processing if requested
      if (options.processImmediately) {
        this.triggerProcessingAsync(uniqueId);
      }

      return this.successResponse(dbData as FloorPlanUpload, 'Floor plan uploaded successfully');

    } catch (error) {
      console.error('Upload error:', error);
      return this.errorResponse('Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Upload processing results
   */
  async uploadProcessingResults(
    floorPlanId: string,
    results: ProcessingResult,
    metrics?: ProcessingMetrics
  ): Promise<ApiResponse<ProcessedFloorPlan>> {
    try {
      // Get existing floor plan
      const { data: floorPlan, error: fetchError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('*')
        .eq('id', floorPlanId)
        .single();

      if (fetchError || !floorPlan) {
        return this.errorResponse('Floor plan not found', HttpStatus.NOT_FOUND);
      }

      // Prepare processed floor plan record
      const processedRecord: Partial<ProcessedFloorPlan> = {
        id: uuidv4(),
        uploadId: floorPlanId,
        projectId: floorPlan.project_id,
        status: ProcessingStatus.COMPLETED,
        version: 1,
        processedAt: new Date(),
        processingDurationMs: metrics?.processingTime,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save processing results
      const { data: resultData, error: resultError } = await this.supabase
        .from(TableName.PROCESSING_RESULTS)
        .insert({
          ...processedRecord,
          results: results,
          metrics: metrics
        })
        .select()
        .single();

      if (resultError) {
        console.error('Save results error:', resultError);
        return this.errorResponse('Failed to save processing results', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Update floor plan status
      await this.supabase
        .from(TableName.FLOOR_PLANS)
        .update({ 
          status: ProcessingStatus.COMPLETED,
          processed_at: new Date()
        })
        .eq('id', floorPlanId);

      return this.successResponse(resultData as ProcessedFloorPlan, 'Processing results saved');

    } catch (error) {
      console.error('Save results error:', error);
      return this.errorResponse('Failed to save results', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Retrieval Operations
  // ============================

  /**
   * Get floor plan by ID
   */
  async getFloorPlan(id: string): Promise<ApiResponse<FloorPlanUpload>> {
    try {
      const { data, error } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .select(`
          *,
          metadata:floor_plan_metadata(*),
          processing_jobs(*),
          rooms(*)
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        return this.errorResponse('Floor plan not found', HttpStatus.NOT_FOUND);
      }

      return this.successResponse(data as FloorPlanUpload);

    } catch (error) {
      console.error('Get floor plan error:', error);
      return this.errorResponse('Failed to retrieve floor plan', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * List floor plans with filtering
   */
  async listFloorPlans(options: QueryOptions = {}): Promise<ApiResponse<FloorPlanUpload[]>> {
    try {
      let query = this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('*', { count: 'exact' });

      // Apply filters
      if (options.projectId) {
        query = query.eq('project_id', options.projectId);
      }
      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }
      if (options.organizationId) {
        query = query.eq('organization_id', options.organizationId);
      }
      if (options.status) {
        query = query.eq('status', options.status);
      }
      if (options.tags && options.tags.length > 0) {
        query = query.contains('tags', options.tags);
      }
      if (options.search) {
        query = query.or(`original_file_name.ilike.%${options.search}%,metadata->title.ilike.%${options.search}%`);
      }
      if (options.fromDate) {
        query = query.gte('uploaded_at', options.fromDate.toISOString());
      }
      if (options.toDate) {
        query = query.lte('uploaded_at', options.toDate.toISOString());
      }

      // Apply sorting
      const sortBy = options.sortBy || 'uploaded_at';
      const sortOrder = options.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const page = options.page || 1;
      const pageSize = options.pageSize || 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('List floor plans error:', error);
        return this.errorResponse('Failed to list floor plans', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        success: true,
        data: data as FloorPlanUpload[],
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          pageSize,
          totalItems: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        }
      } as PaginatedResponse<FloorPlanUpload>;

    } catch (error) {
      console.error('List error:', error);
      return this.errorResponse('Failed to list floor plans', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get processing results
   */
  async getProcessingResults(floorPlanId: string): Promise<ApiResponse<ProcessedFloorPlan>> {
    try {
      const { data, error } = await this.supabase
        .from(TableName.PROCESSING_RESULTS)
        .select(`
          *,
          rooms:rooms(*),
          floor_plan:floor_plans(*)
        `)
        .eq('upload_id', floorPlanId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return this.errorResponse('Processing results not found', HttpStatus.NOT_FOUND);
      }

      return this.successResponse(data as ProcessedFloorPlan);

    } catch (error) {
      console.error('Get results error:', error);
      return this.errorResponse('Failed to retrieve results', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get rooms for floor plan
   */
  async getRooms(floorPlanId: string): Promise<ApiResponse<Room[]>> {
    try {
      const { data, error } = await this.supabase
        .from(TableName.ROOMS)
        .select('*')
        .eq('floor_plan_id', floorPlanId)
        .order('name');

      if (error) {
        console.error('Get rooms error:', error);
        return this.errorResponse('Failed to retrieve rooms', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(data as Room[]);

    } catch (error) {
      console.error('Get rooms error:', error);
      return this.errorResponse('Failed to retrieve rooms', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generate signed URL for file access
   */
  async getSignedUrl(
    floorPlanId: string,
    expiresIn: number = this.signedUrlExpiry
  ): Promise<ApiResponse<string>> {
    try {
      // Get floor plan record
      const { data: floorPlan, error: fetchError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('file_path, bucket')
        .eq('id', floorPlanId)
        .single();

      if (fetchError || !floorPlan) {
        return this.errorResponse('Floor plan not found', HttpStatus.NOT_FOUND);
      }

      // Generate signed URL
      const { data, error } = await this.supabase.storage
        .from(floorPlan.bucket || BucketName.FLOOR_PLANS)
        .createSignedUrl(floorPlan.file_path, expiresIn);

      if (error) {
        console.error('Signed URL error:', error);
        return this.errorResponse('Failed to generate signed URL', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(data.signedUrl);

    } catch (error) {
      console.error('Signed URL error:', error);
      return this.errorResponse('Failed to generate URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Update Operations
  // ============================

  /**
   * Update floor plan metadata
   */
  async updateFloorPlanMetadata(
    id: string,
    metadata: Partial<FloorPlanMetadata>
  ): Promise<ApiResponse<FloorPlanUpload>> {
    try {
      const { data, error } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .update({ 
          metadata: metadata,
          updated_at: new Date()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Update metadata error:', error);
        return this.errorResponse('Failed to update metadata', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(data as FloorPlanUpload, 'Metadata updated successfully');

    } catch (error) {
      console.error('Update error:', error);
      return this.errorResponse('Failed to update metadata', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update processing status
   */
  async updateProcessingStatus(
    id: string,
    status: ProcessingStatus,
    message?: string
  ): Promise<ApiResponse<void>> {
    try {
      const { error } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .update({ 
          status: status,
          status_message: message,
          updated_at: new Date()
        })
        .eq('id', id);

      if (error) {
        console.error('Update status error:', error);
        return this.errorResponse('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(undefined, 'Status updated successfully');

    } catch (error) {
      console.error('Update status error:', error);
      return this.errorResponse('Failed to update status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update room data
   */
  async updateRoom(
    roomId: string,
    updates: Partial<Room>
  ): Promise<ApiResponse<Room>> {
    try {
      const { data, error } = await this.supabase
        .from(TableName.ROOMS)
        .update({
          ...updates,
          modified_at: new Date()
        })
        .eq('id', roomId)
        .select()
        .single();

      if (error) {
        console.error('Update room error:', error);
        return this.errorResponse('Failed to update room', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(data as Room, 'Room updated successfully');

    } catch (error) {
      console.error('Update room error:', error);
      return this.errorResponse('Failed to update room', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Delete Operations
  // ============================

  /**
   * Delete floor plan and all associated data
   */
  async deleteFloorPlan(id: string): Promise<ApiResponse<void>> {
    try {
      // Get floor plan details
      const { data: floorPlan, error: fetchError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('file_path, bucket')
        .eq('id', id)
        .single();

      if (fetchError || !floorPlan) {
        return this.errorResponse('Floor plan not found', HttpStatus.NOT_FOUND);
      }

      // Delete from storage
      const { error: storageError } = await this.supabase.storage
        .from(floorPlan.bucket || BucketName.FLOOR_PLANS)
        .remove([floorPlan.file_path]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
      }

      // Delete associated data (cascading delete should handle this)
      await this.supabase.from(TableName.ROOMS).delete().eq('floor_plan_id', id);
      await this.supabase.from(TableName.PROCESSING_RESULTS).delete().eq('upload_id', id);
      await this.supabase.from(TableName.PROCESSING_JOBS).delete().eq('resource_id', id);

      // Delete floor plan record
      const { error: deleteError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return this.errorResponse('Failed to delete floor plan', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(undefined, 'Floor plan deleted successfully');

    } catch (error) {
      console.error('Delete error:', error);
      return this.errorResponse('Failed to delete floor plan', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Bulk delete floor plans
   */
  async bulkDeleteFloorPlans(ids: string[]): Promise<ApiResponse<void>> {
    try {
      // Get file paths
      const { data: floorPlans, error: fetchError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('file_path, bucket')
        .in('id', ids);

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        return this.errorResponse('Failed to fetch floor plans', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Delete from storage
      if (floorPlans && floorPlans.length > 0) {
        const filePaths = floorPlans.map(fp => fp.file_path);
        const { error: storageError } = await this.supabase.storage
          .from(BucketName.FLOOR_PLANS)
          .remove(filePaths);

        if (storageError) {
          console.error('Bulk storage delete error:', storageError);
        }
      }

      // Delete records
      const { error: deleteError } = await this.supabase
        .from(TableName.FLOOR_PLANS)
        .delete()
        .in('id', ids);

      if (deleteError) {
        console.error('Bulk delete error:', deleteError);
        return this.errorResponse('Failed to delete floor plans', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(undefined, `${ids.length} floor plans deleted`);

    } catch (error) {
      console.error('Bulk delete error:', error);
      return this.errorResponse('Failed to delete floor plans', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Export Operations
  // ============================

  /**
   * Export floor plan in different formats
   */
  async exportFloorPlan(
    id: string,
    options: FloorPlanExportOptions
  ): Promise<ApiResponse<string>> {
    try {
      // Get floor plan and processing results
      const { data: results, error } = await this.supabase
        .from(TableName.PROCESSING_RESULTS)
        .select('*')
        .eq('upload_id', id)
        .single();

      if (error || !results) {
        return this.errorResponse('Processing results not found', HttpStatus.NOT_FOUND);
      }

      // Generate export based on format
      // This would typically call a processing service
      const exportId = uuidv4();
      const exportPath = `exports/${id}/${exportId}.${options.format}`;

      // For now, return a placeholder URL
      const { data: urlData } = this.supabase.storage
        .from(BucketName.EXPORTS)
        .getPublicUrl(exportPath);

      return this.successResponse(urlData.publicUrl, 'Export generated');

    } catch (error) {
      console.error('Export error:', error);
      return this.errorResponse('Export failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Utility Methods
  // ============================

  /**
   * Get storage statistics
   */
  async getStorageStats(projectId?: string): Promise<ApiResponse<StorageStats>> {
    try {
      let query = this.supabase
        .from(TableName.FLOOR_PLANS)
        .select('file_size_bytes, file_format, uploaded_at', { count: 'exact' });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Stats error:', error);
        return this.errorResponse('Failed to get statistics', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const stats: StorageStats = {
        totalFiles: count || 0,
        totalSize: data?.reduce((sum, file) => sum + (file.file_size_bytes || 0), 0) || 0,
        filesByType: {},
        averageFileSize: 0,
        storageUsed: 0,
        storageLimit: parseInt(process.env.STORAGE_LIMIT || '107374182400'), // 100GB default
        oldestFile: undefined,
        newestFile: undefined
      };

      if (data && data.length > 0) {
        // Calculate file type distribution
        data.forEach(file => {
          const format = file.file_format || 'unknown';
          stats.filesByType[format] = (stats.filesByType[format] || 0) + 1;
        });

        // Calculate average size
        stats.averageFileSize = stats.totalSize / stats.totalFiles;

        // Find oldest and newest
        const dates = data.map(f => new Date(f.uploaded_at)).sort((a, b) => a.getTime() - b.getTime());
        stats.oldestFile = dates[0];
        stats.newestFile = dates[dates.length - 1];
      }

      stats.storageUsed = stats.totalSize;

      return this.successResponse(stats);

    } catch (error) {
      console.error('Stats error:', error);
      return this.errorResponse('Failed to get statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Clean up old temporary files
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<ApiResponse<number>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

      // List files in temp bucket
      const { data: files, error: listError } = await this.supabase.storage
        .from(BucketName.TEMP)
        .list();

      if (listError) {
        console.error('List temp files error:', listError);
        return this.errorResponse('Failed to list temp files', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!files || files.length === 0) {
        return this.successResponse(0, 'No temp files to clean');
      }

      // Filter old files
      const oldFiles = files.filter(file => {
        const createdAt = new Date(file.created_at);
        return createdAt < cutoffDate;
      });

      if (oldFiles.length === 0) {
        return this.successResponse(0, 'No old temp files found');
      }

      // Delete old files
      const filePaths = oldFiles.map(f => f.name);
      const { error: deleteError } = await this.supabase.storage
        .from(BucketName.TEMP)
        .remove(filePaths);

      if (deleteError) {
        console.error('Delete temp files error:', deleteError);
        return this.errorResponse('Failed to delete temp files', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return this.successResponse(oldFiles.length, `${oldFiles.length} temp files cleaned`);

    } catch (error) {
      console.error('Cleanup error:', error);
      return this.errorResponse('Cleanup failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================
  // Private Helper Methods
  // ============================

  /**
   * Validate uploaded file
   */
  private async validateFile(
    file: Buffer | Blob | File,
    filename: string
  ): Promise<{ valid: boolean; error?: string }> {
    // Check file extension
    const ext = path.extname(filename).toLowerCase().substring(1);
    if (!this.allowedFormats.has(ext)) {
      return { valid: false, error: `File format not allowed: ${ext}` };
    }

    // Check file size
    const size = this.getFileSize(file);
    if (size > this.maxFileSize) {
      return { valid: false, error: `File too large: ${size} bytes (max: ${this.maxFileSize})` };
    }

    // Additional validation could include:
    // - File content verification
    // - Virus scanning
    // - Image dimension checks

    return { valid: true };
  }

  /**
   * Generate file path for storage
   */
  private generateFilePath(projectId: string, fileId: string, extension: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `${this.bucketPrefix}${projectId}/${year}/${month}/${fileId}.${extension}`;
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase()
      .substring(0, 100);
  }

  /**
   * Get content type from extension
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      tiff: 'image/tiff',
      bmp: 'image/bmp',
      dwg: 'application/acad',
      dxf: 'application/dxf',
      svg: 'image/svg+xml'
    };
    
    return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get file size
   */
  private getFileSize(file: Buffer | Blob | File): number {
    if (Buffer.isBuffer(file)) {
      return file.length;
    } else if ('size' in file) {
      return file.size;
    }
    return 0;
  }

  /**
   * Calculate file hash for deduplication
   */
  private async calculateFileHash(file: Buffer | Blob | File): Promise<string> {
    let buffer: Buffer;
    
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if ('arrayBuffer' in file) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      return '';
    }

    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Find file by hash
   */
  private async findByHash(hash: string): Promise<FloorPlanUpload | null> {
    const { data, error } = await this.supabase
      .from(TableName.FLOOR_PLANS)
      .select('*')
      .eq('checksum', hash)
      .single();

    if (error || !data) {
      return null;
    }

    return data as FloorPlanUpload;
  }

  /**
   * Generate thumbnail asynchronously
   */
  private async generateThumbnailAsync(
    floorPlanId: string,
    _filePath: string,
    _format: string
  ): Promise<void> {
    // This would typically trigger a background job
    // For now, just log
    console.log(`Generating thumbnail for ${floorPlanId}`);
  }

  /**
   * Trigger processing asynchronously
   */
  private async triggerProcessingAsync(floorPlanId: string): Promise<void> {
    // This would typically add a job to the processing queue
    // For now, just log
    console.log(`Triggering processing for ${floorPlanId}`);
  }

  /**
   * Create success response
   */
  private successResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create error response
   */
  private errorResponse(message: string, _status: HttpStatus): ApiResponse<any> {
    return {
      success: false,
      data: undefined,
      message,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export default new StorageService();