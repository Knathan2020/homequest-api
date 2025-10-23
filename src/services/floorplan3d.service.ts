import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import FormData from 'form-data';
import path from 'path';

interface FloorPlan3DResult {
  success: boolean;
  modelPath?: string;
  blendFile?: string;
  objFile?: string;
  glbFile?: string;
  message?: string;
  error?: string;
}

/**
 * Service for generating 3D models from 2D floor plan images
 * Uses FloorplanToBlender3d open-source tool via Docker API
 */
export class FloorPlan3DService {
  private apiUrl: string;
  private axiosInstance: AxiosInstance;
  private outputDir: string;

  constructor() {
    // FloorplanToBlender3d server runs on port 8000 (API) and 8001 (Swagger UI)
    this.apiUrl = process.env.FLOORPLAN_3D_API_URL || 'http://localhost:8000';
    this.outputDir = path.join(process.cwd(), 'floorplan-outputs');

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 180000, // 3 minutes - 3D generation can take time
    });
  }

  /**
   * Generate 3D model from floor plan image
   * @param imagePath Path to the floor plan image
   */
  async generate3DModel(imagePath: string): Promise<FloorPlan3DResult> {
    try {
      // Verify image exists
      await fs.access(imagePath);

      // Step 1: Create a new ID with the image
      const formData = new FormData();
      formData.append('file', createReadStream(imagePath));

      const createResponse = await this.axiosInstance.post(
        '/?func=create',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      const fileId = createResponse.data.id || createResponse.data.hash;

      if (!fileId) {
        return {
          success: false,
          error: 'Failed to create file ID from API response',
        };
      }

      // Step 2: Transform the image to 3D model
      // Output formats: obj, x3d, gltf, blend, etc.
      const transformResponse = await this.axiosInstance.post(
        '/',
        {
          func: 'transform',
          id: fileId,
          oformat: 'gltf', // GLB/GLTF format for web viewing
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (transformResponse.data.success || transformResponse.status === 200) {
        return {
          success: true,
          modelPath: transformResponse.data.path || `http://localhost:8000/storage/${fileId}.gltf`,
          glbFile: `http://localhost:8000/storage/${fileId}.gltf`,
          message: 'Successfully generated 3D model',
        };
      } else {
        return {
          success: false,
          error: transformResponse.data.error || 'Transform failed',
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: `API error: ${error.response?.data?.message || error.message}`,
        };
      }
      throw error;
    }
  }

  /**
   * Convert floor plan image to 3D and return Three.js compatible format
   * @param imagePath Path to the floor plan image
   * @param outputFormat Desired output format (obj, glb, blend)
   */
  async convertToThreeJS(
    imagePath: string,
    outputFormat: 'obj' | 'glb' | 'blend' = 'glb'
  ): Promise<FloorPlan3DResult> {
    const result = await this.generate3DModel(imagePath);

    if (!result.success) {
      return result;
    }

    // Return the appropriate file based on format
    let modelFile: string | undefined;
    switch (outputFormat) {
      case 'glb':
        modelFile = result.glbFile;
        break;
      case 'obj':
        modelFile = result.objFile;
        break;
      case 'blend':
        modelFile = result.blendFile;
        break;
    }

    return {
      ...result,
      modelPath: modelFile || result.modelPath,
    };
  }

  /**
   * Get model file as buffer for download
   * @param modelPath Path to the model file
   */
  async getModelFile(modelPath: string): Promise<Buffer> {
    try {
      // If it's a URL from the API, download it
      if (modelPath.startsWith('http')) {
        const response = await axios.get(modelPath, {
          responseType: 'arraybuffer',
        });
        return Buffer.from(response.data);
      }

      // Otherwise, read from local filesystem
      const fullPath = path.join(this.outputDir, modelPath);
      return await fs.readFile(fullPath);
    } catch (error) {
      throw new Error(`Failed to retrieve model file: ${error}`);
    }
  }

  /**
   * Check if the FloorplanToBlender3d service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate both 2D data and 3D model from a floor plan
   * Combines RasterScan (2D) and FloorplanToBlender3d (3D)
   * @param imagePath Path to floor plan image
   * @param rasterScanData Optional 2D data from RasterScan
   */
  async generateComplete(
    imagePath: string,
    rasterScanData?: any
  ): Promise<{
    floorPlan2D?: any;
    floorPlan3D?: FloorPlan3DResult;
  }> {
    const results: any = {};

    // If we have 2D data, include it
    if (rasterScanData) {
      results.floorPlan2D = rasterScanData;
    }

    // Generate 3D model
    try {
      const model3D = await this.convertToThreeJS(imagePath, 'glb');
      results.floorPlan3D = model3D;
    } catch (error) {
      results.floorPlan3D = {
        success: false,
        error: `3D generation failed: ${error}`,
      };
    }

    return results;
  }
}
