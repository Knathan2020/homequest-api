import CloudConvert from 'cloudconvert';

/**
 * CloudConvert Service for PDF to DWG conversion
 * API Docs: https://cloudconvert.com/api/v2
 */
export class CloudConvertService {
  private client: any;

  constructor() {
    const apiKey = process.env.CLOUDCONVERT_API_KEY || '';
    
    if (!apiKey) {
      console.warn('⚠️ CloudConvert API key not configured');
    }
    
    this.client = new CloudConvert(apiKey);
  }

  /**
   * Convert PDF to DWG
   */
  async convertPdfToDwg(pdfBuffer: Buffer, fileName: string): Promise<Buffer> {
    try {
      console.log(`🔄 Converting ${fileName} from PDF to DWG...`);

      // Create conversion job
      const job = await this.client.jobs.create({
        tasks: {
          'upload-pdf': {
            operation: 'import/upload'
          },
          'convert-to-dwg': {
            operation: 'convert',
            input: 'upload-pdf',
            output_format: 'dwg',
            engine: 'autocad'
          },
          'export-dwg': {
            operation: 'export/url',
            input: 'convert-to-dwg'
          }
        }
      });

      console.log('📤 Uploading PDF to CloudConvert...');

      // Upload PDF
      const uploadTask = job.tasks.filter((task: any) => task.name === 'upload-pdf')[0];
      await this.client.tasks.upload(uploadTask, pdfBuffer, fileName);

      // Wait for job completion
      console.log('⏳ Waiting for conversion to complete...');
      const completedJob = await this.client.jobs.wait(job.id);

      // Get export task
      const exportTask = completedJob.tasks.filter((task: any) => task.name === 'export-dwg')[0];

      if (!exportTask || !exportTask.result || !exportTask.result.files || exportTask.result.files.length === 0) {
        throw new Error('No DWG file in conversion result');
      }

      const file = exportTask.result.files[0];
      
      console.log('📥 Downloading converted DWG...');
      
      // Download converted DWG
      const fileBuffer = await this.client.tasks.download(file);

      console.log('✅ PDF to DWG conversion complete');
      return fileBuffer;

    } catch (error: any) {
      console.error('❌ CloudConvert conversion failed:', error.message);
      throw new Error(`PDF to DWG conversion failed: ${error.message}`);
    }
  }
}

export default new CloudConvertService();
