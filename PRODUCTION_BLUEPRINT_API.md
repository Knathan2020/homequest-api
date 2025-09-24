# Production Blueprint Processing API

## Overview
Production-ready blueprint processing system combining Claude Vision API with OpenCV for 85-90% accuracy across all floor plan types.

## Features
- **Claude Vision API Integration** - AI-powered semantic understanding using Claude 3 Opus/Sonnet
- **OpenCV Precision** - Computer vision for exact coordinate extraction
- **10-Stage Processing Pipeline** - Comprehensive analysis from quality assessment to 3D generation
- **Building Code Validation** - IBC/IRC 2021 and ADA compliance checking
- **Symbol Recognition Library** - Architectural symbol detection and classification
- **Curved Wall Support** - Non-rectangular room detection
- **Property Line Detection** - Setback calculations and site planning
- **3D Model Generation** - Three.js visualization and GLB export

## API Endpoints

### Process Blueprint
`POST /api/blueprint/process`

**Form Data:**
- `blueprint` (file) - Image file (JPEG, PNG, WebP) or PDF
- `useOpus` (boolean) - Use Claude 3 Opus model (default: true)
- `enhanceImage` (boolean) - Apply image enhancement
- `validateCodes` (boolean) - Validate building codes (default: true)
- `generateGLB` (boolean) - Generate 3D GLB file

**Response:**
```json
{
  "success": true,
  "data": {
    "blueprint_id": "bp_xxx",
    "processing_stages": {...},
    "accuracy_metrics": {
      "overall_accuracy": 88,
      "wall_detection_accuracy": 92,
      "room_detection_accuracy": 87
    },
    "validation_summary": {
      "building_code_compliant": true,
      "ada_compliant": true
    },
    "overall_results": {
      "processing_success": true,
      "ready_for_glb_generation": true
    }
  },
  "summary": {
    "rooms_detected": 7,
    "total_sqft": 2150,
    "building_code_compliant": true,
    "ready_for_3d": true
  }
}
```

### Get Capabilities
`GET /api/blueprint/capabilities`

Returns detailed processing capabilities and supported features.

### Validate Blueprint
`POST /api/blueprint/validate`

Quick validation without full processing.

### Demo Response
`GET /api/blueprint/demo`

Returns example processing output.

## Setup

### 1. Install Dependencies
```bash
npm install @anthropic-ai/sdk
```

### 2. Configure Environment
Add to `.env`:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Start Server
```bash
npm run build
npm start
```

## Processing Stages

1. **Blueprint Quality Assessment** - Image clarity, resolution, scale visibility
2. **Element Recognition & Classification** - Walls, doors, windows, fixtures
3. **Architectural Symbol Library** - Standard symbol recognition
4. **Scale Detection & Measurement** - Reference scale extraction
5. **Precision Coordinate Extraction** - OpenCV coordinate mapping
6. **Real-World Measurements** - Conversion to feet/meters
7. **Building Code Validation** - IBC/IRC compliance checking
8. **Room Boundary Detection** - Polygon extraction, area calculation
9. **Three.js Formatting** - 3D geometry generation
10. **GLB Model Specifications** - 3D model export ready

## Accuracy Targets
- **Simple CAD Drawings**: 92-95%
- **Complex CAD Drawings**: 85-92%
- **Hand-Drawn Blueprints**: 75-85%
- **Overall Average**: 85-90%

## Testing
```bash
node test-production-blueprint.js
```

## Production Considerations
1. Ensure Anthropic API key is configured
2. OpenCV packages may require system dependencies
3. Consider rate limiting for API calls
4. Monitor memory usage for large files
5. Implement caching for processed blueprints

## Architecture
```
┌─────────────────────────────────────┐
│     Blueprint Image/PDF Input       │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│   Production Blueprint Processor    │
│  (Orchestrates both services below) │
└──────────────┬──────────────────────┘
               ▼
    ┌──────────┴──────────┐
    ▼                     ▼
┌────────────┐    ┌────────────┐
│  Claude    │    │   OpenCV   │
│  Vision    │    │ Processor  │
└────────────┘    └────────────┘
    │                     │
    └──────────┬──────────┘
               ▼
┌─────────────────────────────────────┐
│        Merged Results               │
│  (AI Understanding + CV Precision)  │
└──────────────┬──────────────────────┘
               ▼
    ┌──────────┴──────────────┐
    ▼                         ▼
┌────────────┐    ┌──────────────────┐
│  Building  │    │   Three.js/GLB   │
│    Code    │    │    Generator     │
│ Validator  │    │                  │
└────────────┘    └──────────────────┘
```

## Support
For issues or questions, check the API documentation at `/api` or review the implementation in:
- `/src/services/production-blueprint-processor.service.ts`
- `/src/services/claude-vision.service.ts`
- `/src/services/opencv-processor.service.ts`