#!/usr/bin/env node

/**
 * Universal OpenCV Wall Detection Script
 * Direct thick line detection for maximum accuracy across all floor plan formats
 */

const cv = require('opencv4nodejs');
const { createWorker } = require('tesseract.js');

async function extractDimensionsFromImage(imagePath) {
    try {
        console.log('🔍 Extracting dimensions from floor plan...');
        
        const worker = await createWorker('eng', 1, {
            logger: () => {} // Disable verbose logging
        });
        
        // Configure Tesseract for architectural drawings
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789.\'-"ft ',
            tessedit_pageseg_mode: '6' // Uniform block of text
        });
        
        const { data: { text } } = await worker.recognize(imagePath);
        await worker.terminate();
        
        // Extract dimension patterns
        const dimensions = [];
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        const dimensionPatterns = [
            /(\d+(?:\.\d+)?)\s*['′]\s*-?\s*(\d+(?:\.\d+)?)?/g, // 12'-6, 12'
            /(\d+(?:\.\d+)?)\s*(ft|feet|foot)/gi,              // 12 ft, 12feet
            /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/gi,        // 12x16
            /(\d+(?:\.\d+)?)["″]/g                             // 6" 
        ];
        
        for (const line of lines) {
            for (const pattern of dimensionPatterns) {
                let match;
                while ((match = pattern.exec(line)) !== null) {
                    let feet = parseFloat(match[1]);
                    
                    // Convert inches to feet if needed
                    if (match[0].includes('"') || match[0].includes('″')) {
                        feet = feet / 12;
                    }
                    
                    // Add inches if present (like 12'-6)
                    if (match[2] && !match[0].includes('x')) {
                        feet += parseFloat(match[2]) / 12;
                    }
                    
                    if (feet > 0 && feet < 100) { // Reasonable range for room dimensions
                        dimensions.push({
                            value: feet,
                            text: match[0],
                            line: line.trim()
                        });
                    }
                }
            }
        }
        
        console.log(`📏 Found ${dimensions.length} dimension references in floor plan`);
        return dimensions;
        
    } catch (error) {
        console.log('⚠️  OCR dimension extraction failed, will use pixel estimation');
        return [];
    }
}

function detectGridPattern(image) {
    try {
        console.log('🔍 Detecting grid pattern for automatic scaling...');
        
        // Convert to grayscale for grid detection
        const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
        
        // Multi-level approach: try different thresholds to catch various grid intensities
        const thresholds = [250, 240, 230, 220]; // From lightest to darker grids
        let bestGrid = null;
        let bestScore = 0;
        
        for (const threshold of thresholds) {
            const gridResult = tryGridDetectionAtThreshold(gray, threshold);
            if (gridResult && gridResult.score > bestScore) {
                bestGrid = gridResult;
                bestScore = gridResult.score;
            }
        }
        
        if (!bestGrid) {
            console.log('⚠️ No reliable grid pattern detected at any threshold');
            return null;
        }
        
        console.log(`📐 Perfect grid detected: ${bestGrid.spacing.toFixed(1)} pixels per grid square`);
        console.log(`📊 Grid quality: ${bestGrid.horizontalLines} H-lines, ${bestGrid.verticalLines} V-lines (score: ${bestGrid.score.toFixed(2)})`);
        
        return {
            pixelsPerGridSquare: bestGrid.spacing,
            horizontalLines: bestGrid.horizontalLines,
            verticalLines: bestGrid.verticalLines,
            confidence: Math.min(bestGrid.score, 1.0),
            detectionMethod: 'multi-threshold-perfect'
        };
        
    } catch (error) {
        console.log('⚠️ Grid detection failed:', error.message);
        return null;
    }
}

function tryGridDetectionAtThreshold(gray, threshold) {
    try {
        // Threshold for this level
        const gridBinary = gray.threshold(threshold, 255, cv.THRESH_BINARY_INV);
        
        // Enhanced morphological operations for better grid line detection
        const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(30, 1));
        const verticalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 30));
        
        const horizontalGrid = gridBinary.morphologyEx(horizontalKernel, cv.MORPH_OPEN);
        const verticalGrid = gridBinary.morphologyEx(verticalKernel, cv.MORPH_OPEN);
        
        // More sensitive line detection for faint grids
        const hLines = horizontalGrid.houghLinesP(1, Math.PI / 180, 15, 15, 3);
        const vLines = verticalGrid.houghLinesP(1, Math.PI / 180, 15, 15, 3);
        
        if (hLines.length < 3 || vLines.length < 3) {
            return null; // Not enough lines
        }
        
        // Advanced spacing analysis with outlier removal
        const hSpacings = calculateCleanSpacings(hLines, 'horizontal');
        const vSpacings = calculateCleanSpacings(vLines, 'vertical');
        
        if (hSpacings.length < 2 || vSpacings.length < 2) {
            return null;
        }
        
        // Use median instead of average to be robust against outliers
        hSpacings.sort((a, b) => a - b);
        vSpacings.sort((a, b) => a - b);
        
        const medianHSpacing = hSpacings[Math.floor(hSpacings.length / 2)];
        const medianVSpacing = vSpacings[Math.floor(vSpacings.length / 2)];
        
        // More lenient spacing consistency check (real-world grids aren't perfect)
        const spacingRatio = Math.abs(medianHSpacing - medianVSpacing) / Math.max(medianHSpacing, medianVSpacing);
        const maxAllowedRatio = 0.25; // Allow up to 25% difference
        
        if (spacingRatio > maxAllowedRatio) {
            console.log(`⚠️ Grid spacing inconsistent at threshold ${threshold}: H=${medianHSpacing.toFixed(1)}, V=${medianVSpacing.toFixed(1)} (${(spacingRatio*100).toFixed(1)}% diff)`);
            return null;
        }
        
        const avgSpacing = (medianHSpacing + medianVSpacing) / 2;
        
        // Calculate confidence score based on consistency and line count
        const consistencyScore = 1.0 - spacingRatio; // Higher is better
        const lineCountScore = Math.min((hLines.length + vLines.length) / 20, 1.0); // Normalize to 0-1
        const spacingVarianceScore = calculateSpacingConsistency(hSpacings, vSpacings);
        
        const overallScore = (consistencyScore * 0.4) + (lineCountScore * 0.3) + (spacingVarianceScore * 0.3);
        
        return {
            spacing: avgSpacing,
            horizontalLines: hLines.length,
            verticalLines: vLines.length,
            score: overallScore,
            threshold: threshold,
            spacingRatio: spacingRatio
        };
        
    } catch (error) {
        return null;
    }
}

function calculateCleanSpacings(lines, direction) {
    const spacings = [];
    const isHorizontal = direction === 'horizontal';
    
    // Sort lines by position
    const sortedLines = lines
        .map(line => ({
            pos: isHorizontal ? (line.y + line.w) / 2 : (line.x + line.z) / 2,
            line: line
        }))
        .sort((a, b) => a.pos - b.pos);
    
    // Calculate all consecutive spacings
    for (let i = 1; i < sortedLines.length; i++) {
        const spacing = Math.abs(sortedLines[i].pos - sortedLines[i-1].pos);
        if (spacing > 8 && spacing < 150) { // Reasonable range for grid spacing
            spacings.push(spacing);
        }
    }
    
    if (spacings.length < 2) return [];
    
    // Remove outliers using IQR method
    spacings.sort((a, b) => a - b);
    const q1 = spacings[Math.floor(spacings.length * 0.25)];
    const q3 = spacings[Math.floor(spacings.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return spacings.filter(s => s >= lowerBound && s <= upperBound);
}

function calculateSpacingConsistency(hSpacings, vSpacings) {
    // Calculate coefficient of variation for spacing consistency
    const allSpacings = [...hSpacings, ...vSpacings];
    if (allSpacings.length < 3) return 0;
    
    const mean = allSpacings.reduce((a, b) => a + b) / allSpacings.length;
    const variance = allSpacings.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / allSpacings.length;
    const stdDev = Math.sqrt(variance);
    const coeffVar = stdDev / mean;
    
    // Lower coefficient of variation = higher consistency score
    return Math.max(0, 1.0 - coeffVar * 5); // Scale so that CV of 0.2 = score of 0
}

function createUniversalScalingSystem(walls, gridInfo = null, dimensions = null, extractedDimensions = []) {
    console.log('🌍 Creating Universal Scaling System...');
    
    const scalingMethods = [];
    
    // Method 1: Grid-based scaling (highest priority if reliable)
    if (gridInfo && gridInfo.confidence > 0.3) {
        const commonGridScales = [
            { feetPerSquare: 1, confidence: 0.9, name: '1\' grid' },      // 1 foot per grid square
            { feetPerSquare: 0.5, confidence: 0.8, name: '6" grid' },     // 6 inch grid
            { feetPerSquare: 2, confidence: 0.7, name: '2\' grid' },      // 2 foot grid
            { feetPerSquare: 0.25, confidence: 0.6, name: '3" grid' }     // 3 inch grid (1/4 scale)
        ];
        
        commonGridScales.forEach(scale => {
            scalingMethods.push({
                method: 'grid',
                pixelsPerFoot: gridInfo.pixelsPerGridSquare / scale.feetPerSquare,
                confidence: gridInfo.confidence * scale.confidence,
                name: `Grid-based (${scale.name})`,
                source: 'grid_detection'
            });
        });
    }
    
    // Method 2: OCR dimension-based scaling (high priority if text found)
    if (extractedDimensions && extractedDimensions.length > 0) {
        extractedDimensions.forEach((dim, index) => {
            if (dim.value > 0) {
                // Find walls that might correspond to this dimension
                const possibleWalls = walls.filter(w => {
                    const wallFeet = w.length / 10; // rough estimate
                    return Math.abs(wallFeet - dim.value) < dim.value * 0.3; // Within 30%
                });
                
                if (possibleWalls.length > 0) {
                    const avgPixelsForDim = possibleWalls.reduce((sum, w) => sum + w.length, 0) / possibleWalls.length;
                    scalingMethods.push({
                        method: 'ocr',
                        pixelsPerFoot: avgPixelsForDim / dim.value,
                        confidence: 0.85,
                        name: `OCR dimension (${dim.text})`,
                        source: 'text_extraction',
                        dimension: dim
                    });
                }
            }
        });
    }
    
    // Method 3: Architectural standards scaling (medium priority)
    if (walls.length > 0) {
        const horizontalWalls = walls.filter(w => Math.abs(w.angle) < 0.2 || Math.abs(w.angle - Math.PI) < 0.2);
        const verticalWalls = walls.filter(w => Math.abs(w.angle - Math.PI/2) < 0.2);
        
        horizontalWalls.sort((a, b) => b.length - a.length);
        verticalWalls.sort((a, b) => b.length - a.length);
        
        // Standard building dimensions for reference
        const standards = [
            { assumption: 'Large house width', feet: 60, confidence: 0.6 },
            { assumption: 'Medium house width', feet: 40, confidence: 0.7 },
            { assumption: 'Small house width', feet: 30, confidence: 0.6 },
            { assumption: 'Room width', feet: 15, confidence: 0.5 },
            { assumption: 'Large room width', feet: 20, confidence: 0.5 }
        ];
        
        if (horizontalWalls.length > 0) {
            const longestWall = horizontalWalls[0];
            standards.forEach(std => {
                scalingMethods.push({
                    method: 'architectural',
                    pixelsPerFoot: longestWall.length / std.feet,
                    confidence: std.confidence,
                    name: `Architectural (${std.assumption})`,
                    source: 'building_standards',
                    wallLength: longestWall.length
                });
            });
        }
    }
    
    // Method 4: Image size heuristics (lowest priority)
    if (dimensions) {
        const imageDiagonal = Math.sqrt(dimensions.width ** 2 + dimensions.height ** 2);
        const commonScales = [
            { pxPerFoot: imageDiagonal / 100, name: 'Large house', confidence: 0.3 },
            { pxPerFoot: imageDiagonal / 70, name: 'Medium house', confidence: 0.4 },
            { pxPerFoot: imageDiagonal / 50, name: 'Small house', confidence: 0.3 }
        ];
        
        commonScales.forEach(scale => {
            scalingMethods.push({
                method: 'heuristic',
                pixelsPerFoot: scale.pxPerFoot,
                confidence: scale.confidence,
                name: `Image heuristic (${scale.name})`,
                source: 'image_analysis'
            });
        });
    }
    
    // Sort by confidence and select the best scaling method
    scalingMethods.sort((a, b) => b.confidence - a.confidence);
    
    console.log('🎯 Universal Scaling Analysis:');
    scalingMethods.slice(0, 5).forEach((method, i) => {
        console.log(`  ${i + 1}. ${method.name}: ${method.pixelsPerFoot.toFixed(2)} px/ft (confidence: ${(method.confidence * 100).toFixed(1)}%)`);
    });
    
    const bestMethod = scalingMethods[0] || { pixelsPerFoot: 10, confidence: 0.1, name: 'Default fallback' };
    
    // Create consensus scaling if we have multiple high-confidence methods
    const highConfidenceMethods = scalingMethods.filter(m => m.confidence > 0.6);
    let finalScale = bestMethod;
    
    if (highConfidenceMethods.length > 1) {
        const avgScale = highConfidenceMethods.reduce((sum, m) => sum + m.pixelsPerFoot * m.confidence, 0) / 
                         highConfidenceMethods.reduce((sum, m) => sum + m.confidence, 0);
        finalScale = {
            ...bestMethod,
            pixelsPerFoot: avgScale,
            method: 'consensus',
            name: `Consensus (${highConfidenceMethods.length} methods)`,
            confidence: Math.min(0.95, bestMethod.confidence * 1.2)
        };
        console.log(`📊 Consensus scaling from ${highConfidenceMethods.length} methods: ${avgScale.toFixed(2)} px/ft`);
    }
    
    console.log(`🌍 Universal scale selected: ${finalScale.name} = ${finalScale.pixelsPerFoot.toFixed(2)} pixels per foot`);
    
    return {
        pixelsPerFoot: finalScale.pixelsPerFoot,
        confidence: finalScale.confidence,
        method: finalScale.method,
        name: finalScale.name,
        allMethods: scalingMethods,
        source: finalScale.source || 'unknown'
    };
}

async function detectWallsInImage(imagePath) {
    try {
        console.log('🔍 OpenCV Wall Detection Starting...');
        console.log(`📁 Processing image: ${imagePath}`);
        
        const img = cv.imread(imagePath);
        console.log(`📏 Original image dimensions: ${img.cols} x ${img.rows}`);
        
        // Step 1: Use full image for wall detection (no cropping to avoid coordinate issues)
        console.log(`📐 Using full image for wall detection: ${img.cols} x ${img.rows}`);
        
        // Work with the full image - no cropping needed
        const croppedImg = img;
        const offsetX = 0;
        const offsetY = 0;
        
        // Step 2: Universal thick wall detection
        const croppedGray = croppedImg.cvtColor(cv.COLOR_BGR2GRAY);
        
        // Enhanced preprocessing for thick black lines (walls)
        const blurred = croppedGray.gaussianBlur(new cv.Size(3, 3), 0);
        
        // Adaptive thresholding to handle varying lighting conditions
        const adaptive = blurred.adaptiveThreshold(255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 10);
        
        // Morphological operations to enhance thick lines and remove noise
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        const cleaned = adaptive.morphologyEx(kernel, cv.MORPH_CLOSE);
        const enhanced = cleaned.morphologyEx(kernel, cv.MORPH_OPEN);
        
        // Step 3: Direct line detection with strict parameters for structural walls only
        const lines = enhanced.houghLinesP(
            1,              // rho: 1 pixel resolution
            Math.PI / 180,  // theta: 1 degree resolution
            80,             // threshold: higher votes for stronger lines
            50,             // minLineLength: minimum 50 pixels for substantial walls
            15              // maxLineGap: maximum 15 pixel gap
        );
        
        console.log(`🔍 HoughLinesP detected ${lines.length} raw lines`);
        
        if (lines.length === 0) {
            throw new Error('No lines detected in floor plan');
        }
        
        // Step 4: Universal line filtering and classification
        const lineData = lines.map((line, index) => {
            const length = Math.sqrt(Math.pow(line.z - line.x, 2) + Math.pow(line.w - line.y, 2));
            let angle = Math.atan2(line.w - line.y, line.z - line.x);
            
            // Normalize angle to 0-π range
            if (angle < 0) angle += Math.PI;
            
            // Validate coordinates are within image bounds
            const startX = Math.round(line.x);
            const startY = Math.round(line.y);
            const endX = Math.round(line.z);
            const endY = Math.round(line.w);
            
            // Skip walls that extend beyond image boundaries
            if (startX < 0 || startX >= img.cols || startY < 0 || startY >= img.rows ||
                endX < 0 || endX >= img.cols || endY < 0 || endY >= img.rows) {
                return null; // Mark for filtering
            }
            
            return {
                id: `wall_${index}`,
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                length: Math.round(length),
                angle,
                thickness: 3,
                originalLine: line
            };
        });
        
        // Remove null entries (walls outside image bounds)
        const validWalls = lineData.filter(wall => wall !== null);
        console.log(`🔍 Filtered ${lineData.length - validWalls.length} out-of-bounds walls, ${validWalls.length} remain`);
        
        // Step 5: Filter for substantial architectural lines only
        const filteredWalls = validWalls.filter(line => {
            // Much stricter length filter - only significant structural elements
            if (line.length < 60) return false;
            
            // Very strict angle filter: accept only near-perfect horizontal and vertical lines
            const tolerance = 5 * Math.PI / 180; // Only 5 degrees tolerance
            const angle = line.angle;
            
            const isHorizontal = Math.abs(angle) < tolerance || 
                                Math.abs(angle - Math.PI) < tolerance;
            const isVertical = Math.abs(angle - Math.PI/2) < tolerance;
            
            return isHorizontal || isVertical;
        });
        
        // Step 6: Remove duplicate/overlapping lines
        const dedupedWalls = [];
        const OVERLAP_THRESHOLD = 30; // pixels
        
        for (const wall of filteredWalls) {
            let isDuplicate = false;
            
            for (const existing of dedupedWalls) {
                // Check if lines are similar (same angle, close positions)
                const angleDiff = Math.abs(wall.angle - existing.angle);
                const sameAngle = angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1;
                
                if (sameAngle) {
                    // Check positional overlap
                    const dist1 = Math.abs(wall.start.x - existing.start.x) + Math.abs(wall.start.y - existing.start.y);
                    const dist2 = Math.abs(wall.end.x - existing.end.x) + Math.abs(wall.end.y - existing.end.y);
                    
                    if (dist1 < OVERLAP_THRESHOLD && dist2 < OVERLAP_THRESHOLD) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
            
            if (!isDuplicate) {
                dedupedWalls.push(wall);
            }
        }
        
        console.log(`📐 Filtered to ${filteredWalls.length} architectural lines`);
        console.log(`📐 After deduplication: ${dedupedWalls.length} unique walls`);
        
        // Step 7: Classify walls as exterior vs interior
        const walls = dedupedWalls.map(wall => {
            // Simple heuristic: longer walls and walls near edges are likely exterior
            const distanceFromEdge = Math.min(
                wall.start.x,
                wall.start.y,
                croppedImg.cols - wall.end.x,
                croppedImg.rows - wall.end.y
            );
            
            const isExterior = wall.length > 80 || distanceFromEdge < 30;
            
            return {
                ...wall,
                type: isExterior ? 'exterior' : 'interior',
                confidence: isExterior ? 1.0 : 0.95,
                detectionMethod: 'direct-line-detection'
            };
        });
        
        console.log(`✅ Detected ${walls.length} walls using universal OpenCV algorithm`);
        
        // Step 7: Try to detect grid pattern for better scaling
        const gridInfo = detectGridPattern(img);
        
        // Step 8: Extract dimensions using OCR
        const extractedDimensions = await extractDimensionsFromImage(imagePath);
        
        // Step 9: Apply Universal Scaling System
        const universalScale = createUniversalScalingSystem(
            walls, 
            gridInfo, 
            { width: img.cols, height: img.rows }, 
            extractedDimensions
        );
        
        const scalePixelsPerFoot = universalScale.pixelsPerFoot;
        const widthFeet = Math.round((img.cols / scalePixelsPerFoot) * 10) / 10;
        const heightFeet = Math.round((img.rows / scalePixelsPerFoot) * 10) / 10;
        const totalArea = Math.round(widthFeet * heightFeet);
        
        console.log(`📐 Floor plan dimensions: ${widthFeet}' × ${heightFeet}' = ${totalArea} sq ft`);
        console.log(`📐 Total floor plan area: ${totalArea} sq ft`);
        console.log(`🌍 Universal scaling method: ${universalScale.name} (${(universalScale.confidence * 100).toFixed(1)}% confidence)`);
        
        return {
            success: true,
            walls: walls,
            totalArea: totalArea,
            dimensions: {
                width: img.cols,  // Use full image dimensions
                height: img.rows
            },
            scaling: {
                pixelsPerFoot: universalScale.pixelsPerFoot,
                method: universalScale.method,
                confidence: universalScale.confidence,
                name: universalScale.name,
                source: universalScale.source,
                allMethods: universalScale.allMethods?.length || 0
            },
            processingInfo: {
                processedSize: { width: img.cols, height: img.rows },
                scaleFactors: { x: 1, y: 1 },
                wallsDetected: walls.length,
                gridDetected: gridInfo ? true : false,
                ocrDimensions: extractedDimensions.length
            }
        };
        
    } catch (error) {
        console.error('❌ Wall detection error:', error.message);
        return {
            success: false,
            error: error.message,
            walls: [],
            totalArea: 0,
            dimensions: { width: 0, height: 0 }
        };
    }
}

// Main execution
async function main() {
    const imagePath = process.argv[2];
    if (!imagePath) {
        console.error('Usage: node opencv-wall-detector.js <image-path>');
        process.exit(1);
    }
    
    try {
        const result = await detectWallsInImage(imagePath);
        console.log('__RESULT_START__');
        console.log(JSON.stringify(result));
        console.log('__RESULT_END__');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { detectWallsInImage };