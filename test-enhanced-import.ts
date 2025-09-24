// Test file to check if EnhancedWallDetectorService can be imported
console.log('🔧 Testing import of EnhancedWallDetectorService...');

import { EnhancedWallDetectorService } from './src/services/enhanced-wall-detector.service';

try {
  console.log('✅ EnhancedWallDetectorService imported successfully');
  
  const service = new EnhancedWallDetectorService();
  console.log('✅ EnhancedWallDetectorService instantiated successfully');
} catch (error) {
  console.error('❌ Failed to import EnhancedWallDetectorService:', (error as Error).message);
  console.error('Stack trace:', (error as Error).stack);
}