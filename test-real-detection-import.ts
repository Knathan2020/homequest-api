// Test file to check if RealDetectionService properly imports EnhancedWallDetectorService
console.log('🔧 Testing import of RealDetectionService...');

import { RealDetectionService } from './src/services/real-detection.service';

try {
  console.log('✅ RealDetectionService imported successfully');
  
  const service = new RealDetectionService();
  console.log('✅ RealDetectionService instantiated successfully');
} catch (error) {
  console.error('❌ Failed to import/instantiate RealDetectionService:', (error as Error).message);
  console.error('Stack trace:', (error as Error).stack);
}