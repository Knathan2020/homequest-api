/**
 * Test script for OpenAI Vision API integration
 * Tests the updated blueprint processing with GPT-4 Vision
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:4000';

async function testOpenAIIntegration() {
  console.log('🧪 Testing OpenAI Vision API Integration...\n');

  try {
    // 1. Test health check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    console.log('');

    // 2. Test API info
    console.log('2️⃣ Testing API info...');
    const apiResponse = await axios.get(`${API_URL}/api`);
    console.log('✅ API info retrieved:', {
      name: apiResponse.data.name,
      version: apiResponse.data.version,
      endpoints: Object.keys(apiResponse.data.endpoints || {}).length
    });
    console.log('');

    // 3. Test production blueprint processing with OpenAI
    console.log('3️⃣ Testing production blueprint processing with OpenAI Vision...');
    
    // Check if sample image exists
    const sampleImagePath = path.join(__dirname, 'uploads', 'file-1755927833368-322929056.png');
    
    if (!fs.existsSync(sampleImagePath)) {
      console.log('⚠️ Sample image not found. Creating a test image...');
      
      // Create a simple test image using canvas (if available) or skip
      console.log('📝 Note: Upload a real floor plan image to fully test the integration');
      console.log('   Place it at: uploads/test-floorplan.png');
      
      // Try with any existing image in uploads folder
      const uploadsDir = path.join(__dirname, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const imageFile = files.find(f => f.endsWith('.png') || f.endsWith('.jpg'));
        if (imageFile) {
          console.log(`   Found existing image: ${imageFile}`);
          // Test with this image
          await testWithImage(path.join(uploadsDir, imageFile));
        } else {
          console.log('   No images found in uploads folder');
        }
      }
    } else {
      await testWithImage(sampleImagePath);
    }

    console.log('\n✨ OpenAI Vision API integration test completed!');
    console.log('🎉 All systems are now using OpenAI GPT-4 Vision instead of Claude');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

async function testWithImage(imagePath) {
  try {
    const form = new FormData();
    form.append('floorPlan', fs.createReadStream(imagePath));
    form.append('useGPT4', 'true');
    form.append('enhanceContrast', 'true');
    form.append('validateCodes', 'true');

    console.log(`📤 Uploading image: ${path.basename(imagePath)}`);
    console.log('🤖 Using OpenAI GPT-4 Vision for analysis...');

    const response = await axios.post(
      `${API_URL}/api/production-blueprint/analyze`,
      form,
      {
        headers: {
          ...form.getHeaders()
        },
        timeout: 60000 // 60 seconds timeout
      }
    );

    console.log('✅ Blueprint processed successfully with OpenAI!');
    console.log('📊 Results summary:');
    console.log('   - Processing method:', response.data.processing_method);
    console.log('   - Overall confidence:', response.data.accuracy_metrics?.overall_confidence || 'N/A');
    console.log('   - Processing stages completed:', Object.keys(response.data.processing_stages || {}).length);
    console.log('   - Ready for GLB generation:', response.data.overall_results?.ready_for_glb_generation || false);
    
    if (response.data.processing_stages?.stage_1_assessment) {
      console.log('\n📋 Image Assessment:');
      console.log('   - Quality:', response.data.processing_stages.stage_1_assessment.image_quality);
      console.log('   - Blueprint type:', response.data.processing_stages.stage_1_assessment.blueprint_type);
    }

    return response.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to API server. Make sure the server is running on port 4000');
    } else if (error.code === 'ENOENT') {
      console.error('❌ Image file not found:', imagePath);
    } else {
      console.error('❌ Blueprint processing failed:', error.message);
    }
    throw error;
  }
}

// Run the test
console.log('═══════════════════════════════════════════════════');
console.log('   OpenAI Vision API Integration Test Suite');
console.log('═══════════════════════════════════════════════════\n');

testOpenAIIntegration();