import axios from 'axios';
import AdmZip from 'adm-zip';

/**
 * Autodesk Design Automation Service
 * Runs AutoCAD in the cloud to convert 2D DWG to 3D
 * API Docs: https://aps.autodesk.com/en/docs/design-automation/v3
 */
export class DesignAutomationService {
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://developer.api.autodesk.com';
  private tokenCache: { access_token: string; expires_at: number } | null = null;
  private nickname = 'homequest'; // Your unique app nickname

  constructor() {
    this.clientId = process.env.AUTODESK_CLIENT_ID || '';
    this.clientSecret = process.env.AUTODESK_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️ Autodesk credentials not configured');
    }
  }

  /**
   * Get OAuth token with code:all scope
   */
  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expires_at > Date.now()) {
      return this.tokenCache.access_token;
    }

    try {
      console.log('🔑 Getting Autodesk access token for Design Automation...');

      const response = await axios.post(
        `${this.baseUrl}/authentication/v2/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: 'code:all data:write data:read bucket:create bucket:read'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.tokenCache = {
        access_token: response.data.access_token,
        expires_at: Date.now() + (response.data.expires_in * 1000) - 60000
      };

      console.log('✅ Token obtained with code:all scope');
      return this.tokenCache.access_token;
    } catch (error: any) {
      console.error('❌ Failed to get token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Autodesk');
    }
  }

  /**
   * Upload file to OSS bucket
   */
  private async uploadToOss(fileBuffer: Buffer, fileName: string): Promise<string> {
    try {
      const token = await this.getAccessToken();
      const bucketKey = 'homequest_designautomation';
      const objectKey = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      console.log(`📤 Uploading ${fileName} to OSS...`);

      // Create bucket (or use existing)
      try {
        await axios.post(
          `${this.baseUrl}/oss/v2/buckets`,
          { bucketKey, policyKey: 'persistent' },
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

      // Get signed S3 URL
      const signedUrlResponse = await axios.get(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // Upload to S3
      await axios.put(signedUrlResponse.data.urls[0], fileBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      // Complete upload
      const completeResponse = await axios.post(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`,
        {
          uploadKey: signedUrlResponse.data.uploadKey,
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
      console.log(`✅ Uploaded: ${objectId}`);
      return objectId;
    } catch (error: any) {
      console.error('❌ Upload failed:', error.response?.data || error.message);
      throw new Error('Failed to upload to OSS');
    }
  }

  /**
   * Create signed URL for reading
   */
  private async createSignedUrl(objectId: string, access: 'read' | 'write' = 'read'): Promise<string> {
    try {
      const token = await this.getAccessToken();
      const [, bucketKey, objectKey] = objectId.match(/urn:adsk\.objects:os\.object:([^\/]+)\/(.+)/) || [];

      if (!bucketKey || !objectKey) {
        throw new Error('Invalid object ID');
      }

      const response = await axios.post(
        `${this.baseUrl}/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signed`,
        { minutesExpiration: 60 },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.signedUrl;
    } catch (error: any) {
      console.error('❌ Failed to create signed URL:', error.response?.data || error.message);
      throw new Error('Failed to create signed URL');
    }
  }

  /**
   * Create AutoCAD script to convert 2D to 3D
   */
  private createAutoCADScript(): string {
    // AutoCAD Script (.scr) that:
    // 1. Opens the input DWG
    // 2. Selects all closed polylines
    // 3. Extrudes them to create 3D walls
    // 4. Saves as output DWG
    return `
; AutoCAD Script to convert 2D floor plan to 3D
; This script extrudes all closed polylines to create 3D walls

; Set units and environment
UNITS 2 4

; Select all closed polylines (walls)
; Filter for closed LWPOLYLINEs and POLYLINEs
(setq ss (ssget "_X" '((0 . "LWPOLYLINE,POLYLINE") (-4 . "&") (70 . 1))))

; If polylines found, extrude them
(if ss
  (progn
    (setq i 0)
    (repeat (sslength ss)
      (setq ent (ssname ss i))
      (command "._EXTRUDE" ent "" "96" "") ; Extrude to 96 inches (8 feet)
      (setq i (1+ i))
    )
  )
)

; Save and close
QSAVE
QUIT Y
`.trim();
  }

  /**
   * Create app bundle containing AutoCAD script
   */
  private async createAppBundle(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const appBundleBaseName = 'convert2dto3dbundle'; // Base name (no owner prefix)
      const appBundleFullId = `${this.nickname}.${appBundleBaseName}+prod`; // Fully qualified ID

      console.log('📦 Creating app bundle...');

      // Check if app bundle exists (check base name first)
      try {
        const existing = await axios.get(
          `${this.baseUrl}/da/us-east/v3/appbundles/${appBundleBaseName}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        console.log('✅ App bundle already exists, using existing bundle');
        return;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          console.log('⚠️ Error checking bundle, attempting to use existing:', error.message);
          return; // Assume it exists if we can't check
        }
        console.log('📝 App bundle not found, creating new one...');
      }

      // Create PackageContents.xml
      const packageXml = `<?xml version="1.0" encoding="utf-8"?>
<ApplicationPackage
  Name="Convert2Dto3D"
  Description="Converts 2D DWG floor plans to 3D"
  Author="HomeQuest"
  ProductCode="{12345678-1234-1234-1234-123456789012}"
  HelpFile="./help.txt"
  ProductVersion="1.0.0"
  SchemaVersion="1.0">
  <CompanyDetails
    Name="HomeQuest"
    Url="https://homequesttech.com"
    Email="support@homequesttech.com" />
  <RuntimeRequirements
    OS="Win64"
    Platform="AutoCAD"
    SeriesMin="R24.0"
    SeriesMax="R24.0" />
  <Components>
    <RuntimeRequirements
      OS="Win64"
      Platform="AutoCAD" />
  </Components>
</ApplicationPackage>`;

      // Create zip file with script
      const zip = new AdmZip();
      zip.addFile('PackageContents.xml', Buffer.from(packageXml));
      zip.addFile('convert2dto3d.scr', Buffer.from(this.createAutoCADScript()));

      const zipBuffer = zip.toBuffer();

      // Create app bundle (use base name only when creating)
      const response = await axios.post(
        `${this.baseUrl}/da/us-east/v3/appbundles`,
        {
          id: appBundleBaseName,
          engine: 'Autodesk.AutoCAD+25_0',  // AutoCAD 2025 - exact format from Autodesk docs
          description: 'Converts 2D floor plans to 3D by extruding polylines'
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Upload bundle to signed URL
      console.log('📋 App bundle response:', JSON.stringify(response.data).substring(0, 300));

      const uploadParams = response.data.uploadParameters;
      if (!uploadParams || !uploadParams.url) {
        console.error('❌ No upload parameters in response:', response.data);
        throw new Error('No upload URL provided by Autodesk');
      }

      const uploadUrl = uploadParams.url;
      const formData = uploadParams.formData || {};

      console.log('📤 Uploading app bundle to:', uploadUrl.substring(0, 50) + '...');

      const form = new (require('form-data'))();
      Object.keys(formData).forEach(key => form.append(key, formData[key]));
      form.append('file', zipBuffer, 'bundle.zip');

      await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log('✅ App bundle uploaded successfully');

      // Mark the alias as ready
      await axios.post(
        `${this.baseUrl}/da/us-east/v3/appbundles/${appBundleBaseName}/aliases`,
        {
          id: 'prod',
          version: 1
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ App bundle created successfully');

    } catch (error: any) {
      console.error('❌ Failed to create app bundle:', error.response?.data || error.message);
      throw new Error('Failed to create app bundle');
    }
  }

  /**
   * Create activity that runs the app bundle
   */
  private async createActivity(): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const activityBaseName = 'convert2dto3dactivity'; // Base name only
      const appBundleBaseName = 'convert2dto3dbundle'; // Base name only
      const activityFullId = `${this.nickname}.${activityBaseName}+prod`;

      console.log('⚙️ Setting up activity...');

      // Check if activity+alias combo exists
      try {
        await axios.get(
          `${this.baseUrl}/da/us-east/v3/activities/${activityFullId}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        console.log('✅ Activity with alias already exists');
        return;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          console.log(`⚠️ Error checking activity+alias (${error.response?.status}), will check base activity`);
        }
      }

      // Check if base activity exists (without alias)
      let activityExists = false;
      try {
        await axios.get(
          `${this.baseUrl}/da/us-east/v3/activities/${this.nickname}.${activityBaseName}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        console.log('✅ Base activity exists, will create/update alias');
        activityExists = true;
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.log('📝 Base activity not found, creating new one...');
        } else {
          console.log(`⚠️ Error checking base activity (${error.response?.status}), assuming it exists`);
          activityExists = true;
        }
      }

      // Create activity if it doesn't exist
      if (!activityExists) {
        await axios.post(
          `${this.baseUrl}/da/us-east/v3/activities`,
          {
            id: activityBaseName,
            commandLine: ['$(engine.path)\\accoreconsole.exe /i "$(args[inputFile].path)" /s "$(appbundles[' + appBundleBaseName + '].path)\\convert2dto3d.scr" /o "$(args[outputFile].path)"'],
            engine: 'Autodesk.AutoCAD+25_0',
            appbundles: [`${this.nickname}.${appBundleBaseName}+prod`],
            parameters: {
              inputFile: {
                verb: 'get',
                description: 'Input 2D DWG file',
                required: true,
                localName: 'input.dwg'
              },
              outputFile: {
                verb: 'put',
                description: 'Output 3D DWG file',
                required: true,
                localName: 'output.dwg'
              }
            }
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('✅ Activity created');
      }

      // Create/update alias (use PATCH to update if exists)
      console.log('📝 Creating/updating alias...');
      try {
        await axios.patch(
          `${this.baseUrl}/da/us-east/v3/activities/${activityBaseName}/aliases/prod`,
          {
            version: 1
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('✅ Alias updated');
      } catch (error: any) {
        // If PATCH fails, try POST to create
        if (error.response?.status === 404) {
          await axios.post(
            `${this.baseUrl}/da/us-east/v3/activities/${activityBaseName}/aliases`,
            {
              id: 'prod',
              version: 1
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ Alias created');
        } else {
          throw error;
        }
      }

      console.log('✅ Activity created successfully');

      // Wait for alias to propagate
      console.log('⏳ Waiting 3 seconds for activity alias to propagate...');
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error: any) {
      console.error('❌ Failed to create activity:', error.response?.data || error.message);
      throw new Error('Failed to create activity');
    }
  }

  /**
   * Convert 2D DWG to 3D using Design Automation
   */
  async convert2DTo3D(dwgBuffer: Buffer, fileName: string): Promise<Buffer> {
    try {
      console.log(`\n🚀 Converting ${fileName} from 2D to 3D using AutoCAD...`);

      // Step 1: Setup app bundle and activity (one-time setup)
      await this.createAppBundle();
      await this.createActivity();

      // Step 2: Upload input DWG
      const inputObjectId = await this.uploadToOss(dwgBuffer, fileName);
      const inputUrl = await this.createSignedUrl(inputObjectId, 'read');

      // Step 3: Create output object
      const outputObjectId = await this.uploadToOss(Buffer.from(''), `output_${fileName}`);
      const outputUrl = await this.createSignedUrl(outputObjectId, 'write');

      // Step 4: Create workitem
      const token = await this.getAccessToken();
      const activityName = `${this.nickname}.convert2dto3dactivity+prod`;

      console.log(`⚙️ Creating workitem with activity: ${activityName}`);

      const workitemResponse = await axios.post(
        `${this.baseUrl}/da/us-east/v3/workitems`,
        {
          activityId: activityName,
          arguments: {
            inputFile: {
              url: inputUrl,
              verb: 'get'
            },
            outputFile: {
              url: outputUrl,
              verb: 'put'
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const workitemId = workitemResponse.data.id;
      console.log(`⏳ Workitem created: ${workitemId}`);

      // Step 5: Poll for completion
      let status = 'pending';
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while ((status === 'pending' || status === 'inprogress') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await axios.get(
          `${this.baseUrl}/da/us-east/v3/workitems/${workitemId}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        status = statusResponse.data.status;
        console.log(`⏳ Status: ${status}`);
        attempts++;
      }

      if (status !== 'success') {
        throw new Error(`Workitem failed with status: ${status}`);
      }

      // Step 6: Download result
      console.log('📥 Downloading 3D DWG...');
      const resultUrl = await this.createSignedUrl(outputObjectId, 'read');
      const resultResponse = await axios.get(resultUrl, { responseType: 'arraybuffer' });

      console.log('✅ 2D to 3D conversion complete!\n');
      return Buffer.from(resultResponse.data);

    } catch (error: any) {
      console.error('❌ Design Automation failed:', error.response?.data || error.message);
      console.log('⚠️ Falling back to original 2D file...');
      return dwgBuffer; // Return original if conversion fails
    }
  }
}

export default new DesignAutomationService();
