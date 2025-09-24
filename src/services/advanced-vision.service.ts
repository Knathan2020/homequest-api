import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface Room {
  type: string;
  area: number;
  confidence: number;
  coordinates: number[][];
  label?: string;
}

interface Wall {
  start: number[];
  end: number[];
  thickness: number;
}

interface DetectionResult {
  rooms_detected: number;
  total_sqft: number;
  confidence: number;
  room_types: string[];
  wall_count: number;
  door_count: number;
  window_count: number;
  detailed_rooms: Room[];
  detailed_walls: Wall[];
  graph_edges?: string[][];
}

export class AdvancedVisionService {
  private pythonScript: string;
  
  constructor() {
    this.pythonScript = path.join(process.cwd(), 'advanced_floor_plan_detector.py');
  }
  
  async detectFloorPlan(imageBuffer: Buffer): Promise<DetectionResult> {
    console.log('🚀 Starting Advanced AI Detection (SAM + YOLO + OpenCV + OCR)...');
    
    return new Promise((resolve, reject) => {
      // Save image to temp file
      const tempPath = path.join(process.cwd(), `temp_floor_plan_${Date.now()}.png`);
      fs.writeFileSync(tempPath, imageBuffer);
      
      console.log('🧠 Running advanced detection pipeline...');
      console.log('  • SAM for room segmentation');
      console.log('  • YOLO for doors/windows');
      console.log('  • OpenCV for walls');
      console.log('  • EasyOCR for text');
      console.log('  • NetworkX for graph analysis');
      
      // Run Python detector
      const pythonProcess = spawn('python3', [this.pythonScript, tempPath]);
      
      let outputData = '';
      let errorData = '';
      let processTimeout: NodeJS.Timeout;
      
      // Set timeout for long-running process
      processTimeout = setTimeout(() => {
        pythonProcess.kill();
        fs.unlinkSync(tempPath);
        reject(new Error('Detection timeout after 30 seconds'));
      }, 30000);
      
      if (pythonProcess.stdout) {
        pythonProcess.stdout.on('data', (data) => {
          outputData += data.toString();
          // Log progress messages
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.includes('Step') || line.includes('Found') || line.includes('✅')) {
              console.log('  ' + line.trim());
            }
          }
        });
      }
      
      if (pythonProcess.stderr) {
        pythonProcess.stderr.on('data', (data) => {
          errorData += data.toString();
          // Log non-error stderr (Python logs)
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.includes('INFO') || line.includes('Step')) {
              console.log('  ' + line.trim());
            }
          }
        });
      }
      
      pythonProcess.on('close', (code) => {
        clearTimeout(processTimeout);
        
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error('Failed to delete temp file:', e);
        }
        
        if (code === 0) {
          try {
            // Extract JSON from output (may have log messages mixed in)
            const jsonMatch = outputData.match(/\{.*\}/s);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              if (result.success) {
                console.log(`✅ Advanced detection complete: ${result.rooms_detected} rooms, ${result.wall_count} walls`);
                console.log(`📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
                
                // Ensure proper format
                const formattedResult: DetectionResult = {
                  rooms_detected: result.rooms_detected || 0,
                  total_sqft: result.total_sqft || 0,
                  confidence: result.confidence || 0.85,
                  room_types: result.room_types || [],
                  wall_count: result.wall_count || 0,
                  door_count: result.door_count || 0,
                  window_count: result.window_count || 0,
                  detailed_rooms: result.detailed_rooms || [],
                  detailed_walls: result.detailed_walls || [],
                  graph_edges: result.graph_edges
                };
                
                resolve(formattedResult);
              } else {
                reject(new Error(result.error || 'Advanced detection failed'));
              }
            } else {
              reject(new Error('Invalid JSON output from detector'));
            }
          } catch (parseError) {
            console.error('Parse error:', parseError);
            console.error('Output was:', outputData.substring(0, 500));
            reject(new Error('Failed to parse detector output'));
          }
        } else {
          console.error('Python process error:', errorData);
          reject(new Error('Python process exited with code ' + code));
        }
      });
      
      pythonProcess.on('error', (err) => {
        clearTimeout(processTimeout);
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          // Ignore
        }
        reject(err);
      });
    });
  }
  
  /**
   * Get a fallback detection result for testing
   */
  getFallbackDetection(): DetectionResult {
    return {
      rooms_detected: 8,
      total_sqft: 2200,
      confidence: 0.92,
      room_types: ['bedroom', 'bathroom', 'kitchen', 'living', 'office'],
      wall_count: 24,
      door_count: 7,
      window_count: 8,
      detailed_rooms: [
        {
          type: 'living',
          area: 400,
          confidence: 0.95,
          coordinates: [[0.15, 0.15], [0.45, 0.15], [0.45, 0.35], [0.15, 0.35], [0.15, 0.15]],
          label: 'LIVING ROOM'
        },
        {
          type: 'kitchen',
          area: 250,
          confidence: 0.93,
          coordinates: [[0.45, 0.15], [0.65, 0.15], [0.65, 0.35], [0.45, 0.35], [0.45, 0.15]],
          label: 'KITCHEN'
        },
        {
          type: 'bedroom',
          area: 300,
          confidence: 0.91,
          coordinates: [[0.15, 0.45], [0.35, 0.45], [0.35, 0.65], [0.15, 0.65], [0.15, 0.45]],
          label: 'MASTER BEDROOM'
        },
        {
          type: 'bedroom',
          area: 200,
          confidence: 0.89,
          coordinates: [[0.45, 0.45], [0.60, 0.45], [0.60, 0.65], [0.45, 0.65], [0.45, 0.45]],
          label: 'BEDROOM 2'
        },
        {
          type: 'bathroom',
          area: 80,
          confidence: 0.88,
          coordinates: [[0.35, 0.45], [0.45, 0.45], [0.45, 0.55], [0.35, 0.55], [0.35, 0.45]],
          label: 'BATHROOM'
        },
        {
          type: 'office',
          area: 150,
          confidence: 0.87,
          coordinates: [[0.65, 0.45], [0.80, 0.45], [0.80, 0.60], [0.65, 0.60], [0.65, 0.45]],
          label: 'OFFICE'
        },
        {
          type: 'hallway',
          area: 100,
          confidence: 0.85,
          coordinates: [[0.35, 0.35], [0.45, 0.35], [0.45, 0.45], [0.35, 0.45], [0.35, 0.35]],
          label: 'HALLWAY'
        },
        {
          type: 'garage',
          area: 400,
          confidence: 0.90,
          coordinates: [[0.70, 0.15], [0.85, 0.15], [0.85, 0.40], [0.70, 0.40], [0.70, 0.15]],
          label: 'GARAGE'
        }
      ],
      detailed_walls: this.generateWallsFromRooms([
        [[0.15, 0.15], [0.45, 0.15], [0.45, 0.35], [0.15, 0.35], [0.15, 0.15]],
        [[0.45, 0.15], [0.65, 0.15], [0.65, 0.35], [0.45, 0.35], [0.45, 0.15]],
        [[0.15, 0.45], [0.35, 0.45], [0.35, 0.65], [0.15, 0.65], [0.15, 0.45]],
        [[0.45, 0.45], [0.60, 0.45], [0.60, 0.65], [0.45, 0.65], [0.45, 0.45]],
        [[0.35, 0.45], [0.45, 0.45], [0.45, 0.55], [0.35, 0.55], [0.35, 0.45]],
        [[0.65, 0.45], [0.80, 0.45], [0.80, 0.60], [0.65, 0.60], [0.65, 0.45]],
        [[0.35, 0.35], [0.45, 0.35], [0.45, 0.45], [0.35, 0.45], [0.35, 0.35]],
        [[0.70, 0.15], [0.85, 0.15], [0.85, 0.40], [0.70, 0.40], [0.70, 0.15]]
      ])
    };
  }
  
  private generateWallsFromRooms(roomCoordinates: number[][][]): Wall[] {
    const walls: Wall[] = [];
    const addedWalls = new Set<string>();
    
    for (const coords of roomCoordinates) {
      for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        
        const key = `${start[0].toFixed(2)},${start[1].toFixed(2)}-${end[0].toFixed(2)},${end[1].toFixed(2)}`;
        const reverseKey = `${end[0].toFixed(2)},${end[1].toFixed(2)}-${start[0].toFixed(2)},${start[1].toFixed(2)}`;
        
        if (!addedWalls.has(key) && !addedWalls.has(reverseKey)) {
          walls.push({
            start: [start[0], start[1]],
            end: [end[0], end[1]],
            thickness: 0.01
          });
          addedWalls.add(key);
        }
      }
    }
    
    return walls;
  }
}