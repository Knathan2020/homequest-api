// Test file to check RealDetectionService constructor
console.log('🔧 Testing RealDetectionService constructor...');

import { RealDetectionService } from './src/services/real-detection.service';

try {
  console.log('✅ RealDetectionService imported successfully');
  console.log('🔧 Creating RealDetectionService instance...');
  
  const service = new RealDetectionService();
  console.log('✅ RealDetectionService instantiated successfully');
  
  // Check if enhanced detector is available
  console.log('🔍 Checking enhanced detector...');
  console.log('Enhanced detector type:', typeof (service as any).enhancedWallDetector);
  
} catch (error) {
  console.error('❌ Failed:', (error as Error).message);
  console.error('Stack trace:', (error as Error).stack);
}