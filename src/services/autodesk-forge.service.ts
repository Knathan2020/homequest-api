import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

/**
 * Autodesk Platform Services (APS) Integration
 * Formerly known as Autodesk Forge
 *
 * Provides:
 * - 2D/3D model viewing
 * - CAD file conversion (DWG, RVT, SKP, IFC, etc.)
 * - Metadata extraction
 * - Geometry and measurement data
 */

interface AutodeskToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

interface ModelDerivativeJob {
  urn: string;
  status: 'pending' | 'inprogress' | 'success' | 'failed' | 'timeout';
  progress: string;
  hasThumbnail: string;
  derivatives?: any[];
}

interface ModelMetadata {
  type: string;
  name: string;
  role: string;
  guid?: string;
  properties?: Record<string, any>;
}

export class AutodeskForgeService {
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://developer.api.autodesk.com';
  private tokenCache: AutodeskToken | null = null;

  constructor() {
    this.clientId = process.env.AUTODESK_CLIENT_ID || '';
    this.clientSecret = process.env.AUTODESK_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️ Autodesk credentials not configured');
    }
  }

  /**
   * Get OAuth 2.0 token for API authentication
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.tokenCache && this.tokenCache.expires_at > Date.now()) {
      return this.tokenCache.access_token;
    }

    try {
      console.log('🔑 Getting Autodesk access token...');

      const response = await axios.post(
        `${this.baseUrl}/authentication/v2/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: 'data:read data:write data:create bucket:create bucket:read viewables:read'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.tokenCache = {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        expires_at: Date.now() + (response.data.expires_in * 1000) - 60000 // Subtract 1 min buffer
      };

      console.log('✅ Autodesk token obtained');
      return this.tokenCache.access_token;

    } catch (error: any) {
      console.error('❌ Failed to get Autodesk token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Autodesk');
    }
  }

  /**
   * Upload CAD file to Autodesk and get URN
   */
  async uploadFile(fileBuffer: Buffer, fileName: string): Promise<string> {
    try {
      const token = await this.getAccessToken();
      const bucketKey = `homequest_${Date.now()}`.toLowerCase();
      const objectKey = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

      console.log(`📤 Uploading ${fileName} to Autodesk...`);

      // Create bucket (or use existing)
      try {
        await axios.post(
          `${this.baseUrl}/oss/v2/buckets`,
          {
            bucketKey,
            policyKey: 'transient' // Files auto-delete after 24 hours
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ Created bucket: ${bucketKey}`);
      } catch (error: any) {
        if (error.response?.status === 409) {
          console.log(`📦 Using existing bucket: ${bucketKey}`);
        } else {
          throw error;
        }
      }

      // Upload file to bucket
      const uploadResponse = await axios.put(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}`,
        fileBuffer,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileBuffer.length
          }
        }
      );

      const objectId = uploadResponse.data.objectId;
      const urn = Buffer.from(objectId).toString('base64').replace(/=/g, '');

      console.log(`✅ File uploaded. URN: ${urn}`);
      return urn;

    } catch (error: any) {
      console.error('❌ Upload failed:', error.response?.data || error.message);
      throw new Error('Failed to upload file to Autodesk');
    }
  }

  /**
   * Convert uploaded file to viewable format
   */
  async translateFile(urn: string): Promise<ModelDerivativeJob> {
    try {
      const token = await this.getAccessToken();

      console.log(`🔄 Starting translation for URN: ${urn}`);

      const response = await axios.post(
        `${this.baseUrl}/modelderivative/v2/designdata/job`,
        {
          input: {
            urn
          },
          output: {
            formats: [
              {
                type: 'svf',
                views: ['2d', '3d']
              }
            ]
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true'
          }
        }
      );

      console.log(`✅ Translation started`);
      return {
        urn,
        status: 'inprogress',
        progress: response.data.progress || 'starting',
        hasThumbnail: 'false'
      };

    } catch (error: any) {
      console.error('❌ Translation failed:', error.response?.data || error.message);
      throw new Error('Failed to translate file');
    }
  }

  /**
   * Check translation status
   */
  async getTranslationStatus(urn: string): Promise<ModelDerivativeJob> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/manifest`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      return {
        urn,
        status: response.data.status,
        progress: response.data.progress || 'complete',
        hasThumbnail: response.data.hasThumbnail || 'false',
        derivatives: response.data.derivatives
      };

    } catch (error: any) {
      console.error('❌ Failed to get status:', error.response?.data || error.message);
      throw new Error('Failed to get translation status');
    }
  }

  /**
   * Get model metadata (geometry tree, properties, etc.)
   */
  async getModelMetadata(urn: string): Promise<ModelMetadata[]> {
    try {
      const token = await this.getAccessToken();

      console.log(`📊 Fetching metadata for URN: ${urn}`);

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log(`✅ Metadata retrieved`);
      return response.data.data.metadata || [];

    } catch (error: any) {
      console.error('❌ Failed to get metadata:', error.response?.data || error.message);
      throw new Error('Failed to get model metadata');
    }
  }

  /**
   * Get properties for specific model view (guid)
   */
  async getModelProperties(urn: string, guid: string): Promise<any> {
    try {
      const token = await this.getAccessToken();

      console.log(`🏗️ Fetching properties for GUID: ${guid}`);

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      return response.data.data;

    } catch (error: any) {
      console.error('❌ Failed to get properties:', error.response?.data || error.message);
      throw new Error('Failed to get model properties');
    }
  }

  /**
   * Extract floorplan data from model properties
   */
  extractFloorplanData(properties: any): {
    walls: any[];
    doors: any[];
    windows: any[];
    stairs: any[];
    rooms: any[];
    measurements: any;
  } {
    const walls: any[] = [];
    const doors: any[] = [];
    const windows: any[] = [];
    const stairs: any[] = [];
    const rooms: any[] = [];
    let totalArea = 0;

    try {
      if (properties.collection) {
        for (const item of properties.collection) {
          const props = item.properties || {};
          const name = item.name?.toLowerCase() || '';
          const category = props.Category?.toLowerCase() || '';

          // Classify elements
          if (category.includes('wall') || name.includes('wall')) {
            walls.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              length: props.Length || 0,
              height: props.Height || 0,
              thickness: props.Width || 0,
              material: props.Material || 'unknown',
              layer: props.Layer || 'default'
            });
          } else if (category.includes('door') || name.includes('door')) {
            doors.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              width: props.Width || 0,
              height: props.Height || 0,
              layer: props.Layer || 'default'
            });
          } else if (category.includes('window') || name.includes('window')) {
            windows.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              width: props.Width || 0,
              height: props.Height || 0,
              layer: props.Layer || 'default'
            });
          } else if (category.includes('stair') || name.includes('stair') || category.includes('ramp')) {
            stairs.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              numberOfRisers: props['Actual Number of Risers'] || props['Number of Risers'] || 0,
              numberOfTreads: props['Actual Number of Treads'] || 0,
              height: props.Height || props['Actual Riser Height'] || 0,
              width: props.Width || props['Actual Tread Depth'] || 0,
              level: props.Level || props['Base Level'] || 'Unknown',
              layer: props.Layer || 'default'
            });
          } else if (category.includes('room') || category.includes('space')) {
            const area = props.Area || 0;
            totalArea += area;

            rooms.push({
              id: item.objectid,
              name: item.name || props.Name || 'Unnamed Room',
              area,
              perimeter: props.Perimeter || 0,
              volume: props.Volume || 0,
              level: props.Level || 'Ground Floor',
              number: props.Number || props['Room Number'] || '',
              type: props['Room Type'] || 'general'
            });
          }
        }
      }

      console.log(`📊 Extracted: ${walls.length} walls, ${doors.length} doors, ${windows.length} windows, ${stairs.length} stairs, ${rooms.length} rooms`);

    } catch (error) {
      console.warn('⚠️ Error extracting floorplan data:', error);
    }

    return {
      walls,
      doors,
      windows,
      stairs,
      rooms,
      measurements: {
        totalArea,
        totalRooms: rooms.length,
        totalWalls: walls.length,
        totalDoors: doors.length,
        totalWindows: windows.length,
        totalStairs: stairs.length
      }
    };
  }

  /**
   * Full processing pipeline: upload → translate → extract data
   */
  async processCADFile(fileBuffer: Buffer, fileName: string): Promise<{
    success: boolean;
    urn: string;
    viewerUrl?: string;
    floorplanData?: any;
    metadata?: any;
    status: string;
    error?: string;
  }> {
    try {
      console.log(`\n🏗️ Starting Autodesk processing for: ${fileName}`);

      // Step 1: Upload
      const urn = await this.uploadFile(fileBuffer, fileName);

      // Step 2: Translate
      await this.translateFile(urn);

      // Step 3: Wait for translation (poll status)
      let status: ModelDerivativeJob;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max

      do {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        status = await this.getTranslationStatus(urn);
        attempts++;
        console.log(`⏳ Translation status: ${status.status} (${status.progress})`);
      } while (status.status === 'inprogress' && attempts < maxAttempts);

      if (status.status !== 'success') {
        throw new Error(`Translation ${status.status}: ${status.progress}`);
      }

      // Step 4: Get metadata
      const metadata = await this.getModelMetadata(urn);

      // Step 5: Get properties for first view (usually the main model)
      let floorplanData = null;
      if (metadata.length > 0 && metadata[0].guid) {
        const properties = await this.getModelProperties(urn, metadata[0].guid);
        floorplanData = this.extractFloorplanData(properties);
      }

      const token = await this.getAccessToken();

      console.log(`✅ Autodesk processing complete!\n`);

      return {
        success: true,
        urn,
        viewerUrl: `https://forge-viewer.autodesk.com/?urn=${urn}&token=${token}`,
        floorplanData,
        metadata,
        status: status.status
      };

    } catch (error: any) {
      console.error('❌ Autodesk processing failed:', error.message);
      return {
        success: false,
        urn: '',
        status: 'failed',
        error: error.message
      };
    }
  }
}

export default new AutodeskForgeService();
