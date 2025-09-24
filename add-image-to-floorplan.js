const fs = require('fs');
const path = require('path');

// Read the image and convert to base64
const imagePath = path.join(__dirname, 'uploads/floor-plans/8a568925-4ee8-466a-a282-6c2d97a9da4f/original/delano floor plan.png');
const imageBuffer = fs.readFileSync(imagePath);
const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

// Read the floor plan JSON
const floorPlanPath = path.join(__dirname, 'data/floor-plans/fp_1756405239189_3ybwaqu99.json');
const floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));

// Add the image data
floorPlanData.imageData = base64Image;
floorPlanData.image_url = base64Image;

// Write back the updated floor plan
fs.writeFileSync(floorPlanPath, JSON.stringify(floorPlanData, null, 2));

console.log('✅ Successfully added image to floor plan fp_1756405239189_3ybwaqu99');
console.log(`Image size: ${(base64Image.length / 1024 / 1024).toFixed(2)} MB`);