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
      // Use a persistent bucket instead of creating new ones
      const bucketKey = 'homequest_floorplans';
      const objectKey = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      console.log(`📤 Uploading ${fileName} to Autodesk...`);

      // Create bucket only once (or use existing)
      try {
        await axios.post(
          `${this.baseUrl}/oss/v2/buckets`,
          {
            bucketKey,
            policyKey: 'persistent' // Keep files, don't auto-delete
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
          console.error('❌ Bucket creation failed:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
          });
          throw error;
        }
      }

      // Upload file to bucket using signed S3 URL (new method)
      // Step 1: Get signed S3 upload URL
      console.log('📝 Getting signed S3 upload URL...');
      const signedUrlResponse = await axios.get(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const uploadKey = signedUrlResponse.data.uploadKey;
      const urls = signedUrlResponse.data.urls;

      if (!urls || urls.length === 0) {
        throw new Error('No signed S3 URLs returned');
      }

      // Step 2: Upload to S3 directly (single part for files under 5MB)
      console.log('📤 Uploading to S3...');
      await axios.put(urls[0], fileBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });

      // Step 3: Complete the upload
      console.log('✅ Completing upload...');
      const completeResponse = await axios.post(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`,
        {
          uploadKey,
          size: fileBuffer.length
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const objectId = completeResponse.data.objectId;
      const urn = Buffer.from(objectId).toString('base64').replace(/=/g, '');

      console.log(`✅ File uploaded. URN: ${urn}`);
      return urn;

    } catch (error: any) {
      console.error('❌ Upload failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url
      });
      throw new Error(`Failed to upload file to Autodesk: ${error.response?.data?.detail || error.message}`);
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
   * Will retry if properties are still being generated (202 status)
   */
  async getModelProperties(urn: string, guid: string, maxRetries: number = 5): Promise<any> {
    const token = await this.getAccessToken();
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        console.log(`🏗️ Fetching properties for GUID: ${guid} (attempt ${retryCount + 1}/${maxRetries})`);

        const response = await axios.get(
          `${this.baseUrl}/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            },
            validateStatus: (status) => status === 200 || status === 202 // Accept both 200 and 202
          }
        );

        // Log the full response to see structure
        console.log('📋 Raw response status:', response.status);
        console.log('📋 Response data keys:', response.data ? Object.keys(response.data) : 'no data');

        // If 202 (Accepted), properties are still being generated - retry
        if (response.status === 202) {
          console.log('⏳ Properties still being generated (202), waiting 3 seconds before retry...');
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
            continue;
          } else {
            console.warn('⚠️ Max retries reached, properties may not be complete');
            return response.data; // Return what we have
          }
        }

        // 200 OK - properties are ready
        if (response.data.data) {
          console.log('✅ Properties ready! Using response.data.data');
          return response.data.data;
        } else if (response.data.collection) {
          console.log('✅ Properties ready! Using response.data.collection');
          return { collection: response.data.collection };
        } else {
          console.log('✅ Properties ready! Using full response.data');
          return response.data;
        }

      } catch (error: any) {
        console.error('❌ Failed to get properties:', error.response?.data || error.message);
        throw new Error('Failed to get model properties');
      }
    }

    throw new Error('Failed to get properties after max retries');
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
      // Handle undefined/null properties
      if (!properties) {
        console.warn('⚠️ Properties is null/undefined');
        return { walls, doors, windows, stairs, rooms, measurements: { totalArea: 0, totalRooms: 0, totalWalls: 0, totalDoors: 0, totalWindows: 0, totalStairs: 0 } };
      }

      // Check if collection exists directly or nested
      // Autodesk API can return: collection, data.collection, or result (when still processing)
      const collection = properties.collection || properties.data?.collection || properties.result || null;

      if (!collection) {
        console.warn('⚠️ No collection found in properties. Keys:', Object.keys(properties));
        console.warn('📋 Full properties object:', JSON.stringify(properties).substring(0, 500));
        return { walls, doors, windows, stairs, rooms, measurements: { totalArea: 0, totalRooms: 0, totalWalls: 0, totalDoors: 0, totalWindows: 0, totalStairs: 0 } };
      }

      // If result is "Accepted" (202 status), properties are still being generated
      if (collection === 'Accepted' || typeof collection === 'string') {
        console.warn('⚠️ Properties still being generated (202 Accepted). Retry in a few seconds.');
        return { walls, doors, windows, stairs, rooms, measurements: { totalArea: 0, totalRooms: 0, totalWalls: 0, totalDoors: 0, totalWindows: 0, totalStairs: 0 } };
      }

      if (collection) {
        console.log(`📊 Processing ${collection.length} items from collection`);

        // Log first few items to see structure
        if (collection.length > 0) {
          console.log('📋 Sample item structure:', JSON.stringify(collection[0]).substring(0, 500));
        }

        // Track unique layers
        const layersFound = new Set<string>();

        for (const item of collection) {
          const props = item.properties || {};
          const name = item.name?.toLowerCase() || '';
          const category = props.Category?.toLowerCase() || '';

          // AutoCAD nests properties under "General" - check both locations
          const generalProps = props.General || {};
          const layer = (generalProps.Layer || props.Layer || '').toUpperCase();
          const entityType = generalProps.Name || props['Entity Type'] || '';

          // Debug: Log first wall entity's full properties to see what's available
          if (walls.length === 0 && (layer.includes('WALL') || layer.includes('A-WALL'))) {
            console.log('🔍 DEBUG - First wall entity properties:');
            console.log('  General props keys:', Object.keys(generalProps));
            console.log('  Props keys:', Object.keys(props));
            console.log('  Full generalProps:', JSON.stringify(generalProps).substring(0, 1000));
          }

          // Track layers for debugging
          if (layer) layersFound.add(layer);

          // AutoCAD classification - check Layer names (most important for DWG files!)
          const isWallLayer = layer.includes('WALL') || layer.includes('A-WALL') || layer.includes('ARCH-WALL');
          const isDoorLayer = layer.includes('DOOR') || layer.includes('A-DOOR');
          const isWindowLayer = layer.includes('WINDOW') || layer.includes('WIND') || layer.includes('A-WIND');
          const isStairLayer = layer.includes('STAIR') || layer.includes('STRS') || layer.includes('A-FLOR');

          // Classify elements (check Layer first for AutoCAD, then Category for Revit)
          if (isWallLayer || category.includes('wall') || name.includes('wall') || entityType === 'AcDbLine' || entityType === 'AcDbPolyline') {
            // Extract geometry coordinates
            const startPoint = generalProps['Start Point'] || props['Start Point'] || generalProps.StartPoint || props.StartPoint;
            const endPoint = generalProps['End Point'] || props['End Point'] || generalProps.EndPoint || props.EndPoint;
            const positionX = generalProps['Position X'] || props['Position X'] || generalProps.PositionX || props.PositionX;
            const positionY = generalProps['Position Y'] || props['Position Y'] || generalProps.PositionY || props.PositionY;

            // Parse coordinates - they might be strings like "123.456, 789.012, 0.000"
            let start = null;
            let end = null;

            if (startPoint && endPoint) {
              // Parse coordinate strings
              const parseCoords = (coordStr: any) => {
                if (typeof coordStr === 'string') {
                  const parts = coordStr.split(',').map(s => parseFloat(s.trim()));
                  return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
                } else if (coordStr && typeof coordStr === 'object' && 'x' in coordStr) {
                  return { x: coordStr.x || 0, y: coordStr.y || 0, z: coordStr.z || 0 };
                }
                return null;
              };

              start = parseCoords(startPoint);
              end = parseCoords(endPoint);
            } else if (positionX !== undefined && positionY !== undefined) {
              // Single position - assume it's a point entity
              start = { x: positionX, y: positionY, z: 0 };
              end = { x: positionX + (props.Length || 100), y: positionY, z: 0 }; // Estimate end point
            }

            walls.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || entityType || 'unknown',
              length: props.Length || 0,
              height: props.Height || props.Thickness || generalProps.Thickness || 96, // Default 96 inches if not found
              thickness: props.Width || props.Thickness || generalProps.Thickness || 6,
              material: props.Material || 'unknown',
              layer: props.Layer || 'default',
              entityType: entityType,
              start,
              end
            });
          } else if (isDoorLayer || category.includes('door') || name.includes('door')) {
            // Extract door position
            const positionX = generalProps['Position X'] || props['Position X'] || generalProps.PositionX || props.PositionX;
            const positionY = generalProps['Position Y'] || props['Position Y'] || generalProps.PositionY || props.PositionY;
            const positionZ = generalProps['Position Z'] || props['Position Z'] || generalProps.PositionZ || props.PositionZ || 0;

            doors.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              width: props.Width || 36,
              height: props.Height || 80,
              layer: props.Layer || 'default',
              position: (positionX !== undefined && positionY !== undefined) ?
                { x: positionX, y: positionY, z: positionZ } : null
            });
          } else if (isWindowLayer || category.includes('window') || name.includes('window')) {
            // Extract window position
            const positionX = generalProps['Position X'] || props['Position X'] || generalProps.PositionX || props.PositionX;
            const positionY = generalProps['Position Y'] || props['Position Y'] || generalProps.PositionY || props.PositionY;
            const positionZ = generalProps['Position Z'] || props['Position Z'] || generalProps.PositionZ || props.PositionZ || 48;

            windows.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              width: props.Width || 36,
              height: props.Height || 48,
              layer: props.Layer || 'default',
              position: (positionX !== undefined && positionY !== undefined) ?
                { x: positionX, y: positionY, z: positionZ } : null
            });
          } else if (isStairLayer || category.includes('stair') || name.includes('stair') || category.includes('ramp')) {
            // Extract stair position
            const positionX = generalProps['Position X'] || props['Position X'] || generalProps.PositionX || props.PositionX;
            const positionY = generalProps['Position Y'] || props['Position Y'] || generalProps.PositionY || props.PositionY;
            const positionZ = generalProps['Position Z'] || props['Position Z'] || generalProps.PositionZ || props.PositionZ || 0;

            stairs.push({
              id: item.objectid,
              name: item.name,
              type: props['Type Name'] || 'unknown',
              numberOfRisers: props['Actual Number of Risers'] || props['Number of Risers'] || 12,
              numberOfTreads: props['Actual Number of Treads'] || 11,
              height: props.Height || props['Actual Riser Height'] || 7,
              width: props.Width || props['Actual Tread Depth'] || 36,
              level: props.Level || props['Base Level'] || 'Unknown',
              layer: props.Layer || 'default',
              position: (positionX !== undefined && positionY !== undefined) ?
                { x: positionX, y: positionY, z: positionZ } : null
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

        // Log layers found for debugging
        console.log(`📋 Layers found in DWG: [${Array.from(layersFound).join(', ')}]`);
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
      } while ((status.status === 'inprogress' || status.status === 'pending') && attempts < maxAttempts);

      if (status.status !== 'success') {
        throw new Error(`Translation ${status.status}: ${status.progress}`);
      }

      // Step 4: Get metadata (optional - PDFs may not have extractable metadata)
      let metadata: any[] = [];
      let floorplanData = null;

      try {
        metadata = await this.getModelMetadata(urn);
        console.log(`📊 Metadata retrieved: ${metadata.length} items`);

        // Step 5: Get properties for first view (usually the main model)
        if (metadata.length > 0 && metadata[0].guid) {
          const properties = await this.getModelProperties(urn, metadata[0].guid);
          console.log('📋 Properties response type:', typeof properties);
          console.log('📋 Properties keys:', properties ? Object.keys(properties) : 'null/undefined');
          floorplanData = this.extractFloorplanData(properties);
        }
      } catch (error: any) {
        console.warn(`⚠️ Metadata extraction failed (expected for PDFs): ${error.message}`);
        // Continue anyway - viewer will still work with just the URN
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
