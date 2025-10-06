import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Autodesk Forge DWG Parser Service
 * Extracts walls, doors, windows, and room data from DWG files using Autodesk Forge API
 */

export interface AutodeskDWGFloorPlan {
  walls: Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    layer: string;
    thickness?: number;
    type: 'interior' | 'exterior' | 'unknown';
  }>;
  doors: Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    layer: string;
  }>;
  windows: Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    layer: string;
  }>;
  rooms: Array<{
    boundary: Array<{ x: number; y: number }>;
    label?: string;
    area?: number;
    layer: string;
  }>;
  dimensions: Array<{
    value: string;
    position: { x: number; y: number };
    layer: string;
  }>;
  textLabels: Array<{
    text: string;
    position: { x: number; y: number };
    height: number;
    layer: string;
  }>;
  metadata: {
    layers: string[];
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } };
    units: string;
    scale: number;
    urn: string;
    viewerUrl: string;
  };
}

export interface AutodeskAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AutodeskUploadResponse {
  bucketKey: string;
  objectId: string;
  objectKey: string;
  size: number;
  contentType: string;
  location: string;
}

export class AutodeskDWGParserService {
  private clientId: string;
  private clientSecret: string;
  private bucketName: string = 'homequest_floorplans';
  private baseUrl: string = 'https://developer.api.autodesk.com';

  private wallLayers = ['WALL', 'WALLS', 'A-WALL', 'ARCH-WALL', 'A-WALL-', '0'];
  private doorLayers = ['DOOR', 'DOORS', 'A-DOOR', 'ARCH-DOOR', 'A-DOOR-'];
  private windowLayers = ['WINDOW', 'WINDOWS', 'A-WIND', 'ARCH-WIND', 'A-GLAZ'];

  constructor() {
    this.clientId = process.env.AUTODESK_CLIENT_ID || '';
    this.clientSecret = process.env.AUTODESK_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️ Autodesk Forge credentials not configured');
    }
  }

  /**
   * Get OAuth2 access token from Autodesk Forge
   */
  private async getAccessToken(): Promise<string> {
    try {
      const response = await axios.post<AutodeskAuthResponse>(
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

      console.log('✅ Autodesk access token obtained');
      return response.data.access_token;
    } catch (error: any) {
      console.error('❌ Failed to get Autodesk access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Autodesk Forge');
    }
  }

  /**
   * Create or get bucket
   */
  private async ensureBucket(accessToken: string): Promise<void> {
    try {
      // Try to get bucket details (if it exists)
      await axios.get(
        `${this.baseUrl}/oss/v2/buckets/${this.bucketName}/details`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      console.log('✅ Bucket already exists:', this.bucketName);
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Bucket doesn't exist, create it
        try {
          await axios.post(
            `${this.baseUrl}/oss/v2/buckets`,
            {
              bucketKey: this.bucketName,
              policyKey: 'transient' // Files expire after 24 hours
            },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ Created new bucket:', this.bucketName);
        } catch (createError: any) {
          console.error('❌ Failed to create bucket:', createError.response?.data || createError.message);
          throw new Error('Failed to create Autodesk bucket');
        }
      } else {
        console.error('❌ Failed to check bucket:', error.response?.data || error.message);
        throw error;
      }
    }
  }

  /**
   * Upload DWG file to Autodesk Forge
   */
  private async uploadFile(filePath: string, accessToken: string): Promise<string> {
    try {
      const fileName = path.basename(filePath);
      const timestamp = Date.now();
      const objectKey = `${timestamp}_${fileName}`;

      console.log(`📤 Uploading file to Autodesk: ${fileName}`);

      const fileBuffer = fs.readFileSync(filePath);

      const response = await axios.put<AutodeskUploadResponse>(
        `${this.baseUrl}/oss/v2/buckets/${this.bucketName}/objects/${objectKey}`,
        fileBuffer,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileBuffer.length
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const objectId = response.data.objectId;
      console.log('✅ File uploaded successfully:', objectId);

      return objectId;
    } catch (error: any) {
      console.error('❌ File upload failed:', error.response?.data || error.message);
      throw new Error('Failed to upload file to Autodesk Forge');
    }
  }

  /**
   * Convert objectId to URN (Base64-encoded)
   */
  private objectIdToUrn(objectId: string): string {
    const urn = Buffer.from(objectId).toString('base64').replace(/=/g, '');
    return urn;
  }

  /**
   * Start translation job (DWG → SVF for viewer)
   */
  private async translateFile(urn: string, accessToken: string): Promise<void> {
    try {
      console.log('🔄 Starting translation job for URN:', urn);

      await axios.post(
        `${this.baseUrl}/modelderivative/v2/designdata/job`,
        {
          input: {
            urn: urn
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
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true'
          }
        }
      );

      console.log('✅ Translation job started');
    } catch (error: any) {
      // If translation already exists, that's okay
      if (error.response?.status === 409) {
        console.log('ℹ️ Translation already exists for this file');
      } else {
        console.error('❌ Translation job failed:', error.response?.data || error.message);
        throw new Error('Failed to start translation job');
      }
    }
  }

  /**
   * Wait for translation to complete
   */
  private async waitForTranslation(urn: string, accessToken: string, maxWaitTime: number = 120000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/modelderivative/v2/designdata/${urn}/manifest`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        const status = response.data.status;
        console.log(`🔄 Translation status: ${status}`);

        if (status === 'success') {
          console.log('✅ Translation completed successfully');
          return;
        } else if (status === 'failed') {
          throw new Error('Translation failed');
        }

        // Still in progress, wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        console.error('❌ Error checking translation status:', error.response?.data || error.message);
        throw error;
      }
    }

    throw new Error('Translation timeout - exceeded maximum wait time');
  }

  /**
   * Extract metadata and geometry from translated file
   */
  private async extractMetadata(urn: string, accessToken: string): Promise<any> {
    try {
      console.log('📊 Extracting metadata from translated file');

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to extract metadata:', error.response?.data || error.message);
      throw new Error('Failed to extract metadata');
    }
  }

  /**
   * Get object tree (hierarchy of objects in the model)
   */
  private async getObjectTree(urn: string, guid: string, accessToken: string): Promise<any> {
    try {
      console.log('🌳 Fetching object tree');

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata/${guid}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to get object tree:', error.response?.data || error.message);
      throw new Error('Failed to get object tree');
    }
  }

  /**
   * Get properties of objects (contains layer info, geometry, etc.)
   */
  private async getProperties(urn: string, guid: string, accessToken: string): Promise<any> {
    try {
      console.log('📝 Fetching object properties');

      const response = await axios.get(
        `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            forceget: true
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to get properties:', error.response?.data || error.message);
      throw new Error('Failed to get properties');
    }
  }

  /**
   * Parse properties data into floor plan structure
   */
  private parsePropertiesIntoFloorPlan(propertiesData: any, metadata: any, urn: string, accessToken: string): AutodeskDWGFloorPlan {
    const floorPlan: AutodeskDWGFloorPlan = {
      walls: [],
      doors: [],
      windows: [],
      rooms: [],
      dimensions: [],
      textLabels: [],
      metadata: {
        layers: [],
        bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
        units: 'unknown',
        scale: 1,
        urn: urn,
        viewerUrl: `https://forge-viewer.autodesk.com/?urn=${urn}&token=${accessToken}`
      }
    };

    const collection = propertiesData.data.collection;
    const layers = new Set<string>();

    console.log(`📊 Processing ${collection.length} objects from DWG file`);

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const object of collection) {
      const properties = object.properties;
      if (!properties) continue;

      // Extract layer name
      let layerName = '0';
      const layerProp = properties.find((p: any) => p.attributeName === 'Layer' || p.displayName === 'Layer');
      if (layerProp) {
        layerName = layerProp.displayValue || layerProp.value || '0';
        layers.add(layerName);
      }

      // Extract category/type
      const categoryProp = properties.find((p: any) => p.attributeName === 'Category' || p.displayName === 'Category');
      const category = categoryProp?.displayValue || categoryProp?.value || '';

      // Extract geometry (coordinates)
      const startXProp = properties.find((p: any) => p.displayName === 'Start X' || p.attributeName === 'Start.X');
      const startYProp = properties.find((p: any) => p.displayName === 'Start Y' || p.attributeName === 'Start.Y');
      const endXProp = properties.find((p: any) => p.displayName === 'End X' || p.attributeName === 'End.X');
      const endYProp = properties.find((p: any) => p.displayName === 'End Y' || p.attributeName === 'End.Y');

      // Check if it's a wall (LINE entity on wall layer)
      if (this.isWallLayer(layerName) && startXProp && startYProp && endXProp && endYProp) {
        const start = { x: Number(startXProp.displayValue), y: Number(startYProp.displayValue) };
        const end = { x: Number(endXProp.displayValue), y: Number(endYProp.displayValue) };

        floorPlan.walls.push({
          start,
          end,
          layer: layerName,
          type: this.classifyWallType(layerName)
        });

        // Update bounds
        minX = Math.min(minX, start.x, end.x);
        minY = Math.min(minY, start.y, end.y);
        maxX = Math.max(maxX, start.x, end.x);
        maxY = Math.max(maxY, start.y, end.y);
      }

      // Check for doors
      if (this.isDoorLayer(layerName) || category.toUpperCase().includes('DOOR')) {
        const posXProp = properties.find((p: any) => p.displayName === 'Position X' || p.attributeName === 'Position.X');
        const posYProp = properties.find((p: any) => p.displayName === 'Position Y' || p.attributeName === 'Position.Y');
        const widthProp = properties.find((p: any) => p.displayName === 'Width' || p.attributeName === 'Width');

        if (posXProp && posYProp) {
          floorPlan.doors.push({
            position: { x: Number(posXProp.displayValue), y: Number(posYProp.displayValue) },
            size: { width: widthProp ? Number(widthProp.displayValue) : 36, height: 80 },
            layer: layerName
          });
        }
      }

      // Check for windows
      if (this.isWindowLayer(layerName) || category.toUpperCase().includes('WINDOW')) {
        const posXProp = properties.find((p: any) => p.displayName === 'Position X' || p.attributeName === 'Position.X');
        const posYProp = properties.find((p: any) => p.displayName === 'Position Y' || p.attributeName === 'Position.Y');
        const widthProp = properties.find((p: any) => p.displayName === 'Width' || p.attributeName === 'Width');

        if (posXProp && posYProp) {
          floorPlan.windows.push({
            position: { x: Number(posXProp.displayValue), y: Number(posYProp.displayValue) },
            size: { width: widthProp ? Number(widthProp.displayValue) : 48, height: 48 },
            layer: layerName
          });
        }
      }

      // Check for text labels
      const textProp = properties.find((p: any) => p.displayName === 'Text' || p.attributeName === 'Text');
      if (textProp && textProp.displayValue) {
        const posXProp = properties.find((p: any) => p.displayName === 'Position X' || p.attributeName === 'Position.X');
        const posYProp = properties.find((p: any) => p.displayName === 'Position Y' || p.attributeName === 'Position.Y');

        if (posXProp && posYProp) {
          floorPlan.textLabels.push({
            text: textProp.displayValue,
            position: { x: Number(posXProp.displayValue), y: Number(posYProp.displayValue) },
            height: 1,
            layer: layerName
          });
        }
      }
    }

    // Set metadata
    floorPlan.metadata.layers = Array.from(layers);
    floorPlan.metadata.bounds = {
      min: { x: minX !== Infinity ? minX : 0, y: minY !== Infinity ? minY : 0 },
      max: { x: maxX !== -Infinity ? maxX : 0, y: maxY !== -Infinity ? maxY : 0 }
    };

    console.log(`✅ DWG processing complete:`, {
      walls: floorPlan.walls.length,
      doors: floorPlan.doors.length,
      windows: floorPlan.windows.length,
      textLabels: floorPlan.textLabels.length,
      layers: floorPlan.metadata.layers.length
    });

    return floorPlan;
  }

  /**
   * Main parsing method - Parse DWG file using Autodesk Forge API
   */
  async parseDWG(filePath: string): Promise<AutodeskDWGFloorPlan> {
    try {
      console.log(`🏗️ Parsing DWG file with Autodesk Forge: ${path.basename(filePath)}`);

      // Step 1: Get access token
      const accessToken = await this.getAccessToken();

      // Step 2: Ensure bucket exists
      await this.ensureBucket(accessToken);

      // Step 3: Upload file
      const objectId = await this.uploadFile(filePath, accessToken);

      // Step 4: Convert to URN
      const urn = this.objectIdToUrn(objectId);

      // Step 5: Start translation
      await this.translateFile(urn, accessToken);

      // Step 6: Wait for translation to complete
      await this.waitForTranslation(urn, accessToken);

      // Step 7: Extract metadata
      const metadata = await this.extractMetadata(urn, accessToken);

      // Step 8: Get the first viewable (usually the 2D floor plan)
      const guid = metadata.data.metadata[0]?.guid;
      if (!guid) {
        throw new Error('No viewable found in translated file');
      }

      // Step 9: Get properties
      const properties = await this.getProperties(urn, guid, accessToken);

      // Step 10: Parse into floor plan structure
      const floorPlan = this.parsePropertiesIntoFloorPlan(properties, metadata, urn, accessToken);

      return floorPlan;

    } catch (error: any) {
      console.error('❌ DWG parsing failed:', error.message);
      throw new Error(`Failed to parse DWG file: ${error.message}`);
    }
  }

  // Helper methods (same as DXF parser)
  private isWallLayer(layer: string): boolean {
    return this.wallLayers.some(wallLayer => layer.toUpperCase().includes(wallLayer));
  }

  private isDoorLayer(layer: string): boolean {
    return this.doorLayers.some(doorLayer => layer.toUpperCase().includes(doorLayer));
  }

  private isWindowLayer(layer: string): boolean {
    return this.windowLayers.some(windowLayer => layer.toUpperCase().includes(windowLayer));
  }

  private classifyWallType(layer: string): 'interior' | 'exterior' | 'unknown' {
    const layerUpper = layer.toUpperCase();
    if (layerUpper.includes('EXT') || layerUpper.includes('OUTER')) {
      return 'exterior';
    } else if (layerUpper.includes('INT') || layerUpper.includes('INNER')) {
      return 'interior';
    }
    return 'unknown';
  }
}

export default new AutodeskDWGParserService();
