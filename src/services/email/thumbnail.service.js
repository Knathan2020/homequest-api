const sharp = require('sharp');
const pdf2pic = require('pdf2pic');
const path = require('path');
const fs = require('fs').promises;

class ThumbnailService {
  constructor() {
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };
  }

  async generateThumbnail(filePath, outputPath, options = {}) {
    const {
      size = 'medium',
      format = 'jpeg',
      quality = 80
    } = options;

    const fileExt = path.extname(filePath).toLowerCase();
    const dimensions = this.thumbnailSizes[size];

    try {
      if (fileExt === '.pdf') {
        return await this.generatePdfThumbnail(filePath, outputPath, dimensions, format, quality);
      } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt)) {
        return await this.generateImageThumbnail(filePath, outputPath, dimensions, format, quality);
      } else if (['.doc', '.docx', '.xls', '.xlsx'].includes(fileExt)) {
        return await this.generateOfficeThumbnail(filePath, outputPath, dimensions);
      } else {
        return await this.generateGenericThumbnail(fileExt, outputPath, dimensions);
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw error;
    }
  }

  async generateImageThumbnail(inputPath, outputPath, dimensions, format, quality) {
    await sharp(inputPath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'cover',
        position: 'center'
      })
      .toFormat(format, { quality })
      .toFile(outputPath);
    
    return outputPath;
  }

  async generatePdfThumbnail(inputPath, outputPath, dimensions, format, quality) {
    const options = {
      density: 100,
      saveFilename: path.basename(outputPath, path.extname(outputPath)),
      savePath: path.dirname(outputPath),
      format: format,
      width: dimensions.width,
      height: dimensions.height,
      page: 1
    };

    const convert = pdf2pic.fromPath(inputPath, options);
    const result = await convert(1);
    
    // Optimize with sharp
    await sharp(result.path)
      .resize(dimensions.width, dimensions.height, { fit: 'cover' })
      .toFormat(format, { quality })
      .toFile(outputPath);
    
    // Clean up temp file
    await fs.unlink(result.path).catch(() => {});
    
    return outputPath;
  }

  async generateOfficeThumbnail(filePath, outputPath, dimensions) {
    // For office documents, create a placeholder with document type icon
    const fileExt = path.extname(filePath).toLowerCase();
    const iconColors = {
      '.doc': '#2B579A',
      '.docx': '#2B579A',
      '.xls': '#207245',
      '.xlsx': '#207245'
    };

    const svg = `
      <svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${iconColors[fileExt] || '#666'}"/>
        <text x="50%" y="50%" font-size="48" fill="white" text-anchor="middle" dy=".3em">
          ${fileExt.substring(1).toUpperCase()}
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .toFile(outputPath);
    
    return outputPath;
  }

  async generateGenericThumbnail(fileExt, outputPath, dimensions) {
    const svg = `
      <svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#374151"/>
        <rect x="20%" y="20%" width="60%" height="60%" fill="#4B5563" rx="8"/>
        <text x="50%" y="50%" font-size="24" fill="#9CA3AF" text-anchor="middle" dy=".3em">
          ${fileExt.substring(1).toUpperCase()}
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .toFile(outputPath);
    
    return outputPath;
  }

  async batchGenerateThumbnails(files, options = {}) {
    const results = [];
    
    for (const file of files) {
      try {
        const outputPath = path.join(
          options.outputDir || path.dirname(file.path),
          'thumbnails',
          `${path.basename(file.path, path.extname(file.path))}_thumb.jpg`
        );
        
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        const thumbnail = await this.generateThumbnail(
          file.path,
          outputPath,
          options
        );
        
        results.push({
          originalFile: file.path,
          thumbnail,
          success: true
        });
      } catch (error) {
        results.push({
          originalFile: file.path,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }

  async extractDocumentPreview(filePath, maxPages = 3) {
    const fileExt = path.extname(filePath).toLowerCase();
    const previews = [];

    if (fileExt === '.pdf') {
      const outputDir = path.join(path.dirname(filePath), 'previews');
      await fs.mkdir(outputDir, { recursive: true });

      for (let i = 1; i <= maxPages; i++) {
        const outputPath = path.join(outputDir, `page_${i}.jpg`);
        
        try {
          const options = {
            density: 150,
            saveFilename: `page_${i}`,
            savePath: outputDir,
            format: 'jpeg',
            width: 800,
            page: i
          };

          const convert = pdf2pic.fromPath(filePath, options);
          const result = await convert(i);
          
          previews.push({
            page: i,
            path: result.path
          });
        } catch (error) {
          break; // No more pages
        }
      }
    }

    return previews;
  }
}

module.exports = new ThumbnailService();