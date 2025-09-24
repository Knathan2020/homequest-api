#!/usr/bin/env python3
"""
Floor Plan Analyzer - Real image processing backend
Provides accurate measurements, room detection, and 3D model generation
"""

try:
    import cv2
except ImportError:
    # Use headless version if regular cv2 fails
    import sys
    sys.modules['cv2'] = __import__('cv2.cv2')
    import cv2
import numpy as np
import pytesseract
from PIL import Image
import json
import base64
import io
from typing import Dict, List, Tuple, Any
import requests
import os
from dataclasses import dataclass, asdict
import math

# Configure OpenAI API (set your key as environment variable)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

@dataclass
class Room:
    """Represents a detected room in the floor plan"""
    id: str
    type: str
    vertices: List[Tuple[float, float]]
    area: float
    perimeter: float
    center: Tuple[float, float]
    dimensions: Tuple[float, float]  # width, height
    
@dataclass
class Wall:
    """Represents a wall segment"""
    id: str
    start: Tuple[float, float]
    end: Tuple[float, float]
    thickness: float
    length: float
    is_exterior: bool
    
@dataclass
class Feature:
    """Represents doors, windows, etc."""
    id: str
    type: str  # 'door', 'window', 'stairs'
    position: Tuple[float, float]
    dimensions: Tuple[float, float]
    wall_id: str = None

class FloorPlanAnalyzer:
    """Main analyzer class for processing floor plans"""
    
    def __init__(self):
        self.scale_factor = 1.0  # pixels to feet conversion
        self.detected_scale = None
        self.rooms = []
        self.walls = []
        self.features = []
        
    def analyze_floor_plan(self, image_path: str, manual_scale: Dict[str, float] = None) -> Dict[str, Any]:
        """
        Main entry point for floor plan analysis
        Returns complete analysis with rooms, walls, measurements, and 3D data
        """
        print("\n" + "="*60)
        print("🔍 FLOOR PLAN ANALYSIS STARTING")
        print("="*60)
        
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            img = self._load_image_from_base64(image_path)
        
        original = img.copy()
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        print(f"📊 Image dimensions: {img.shape[1]}x{img.shape[0]} pixels")
        
        # Step 1: Detect scale from image (look for dimension text)
        print("\n📏 STEP 1: Detecting scale factor...")
        
        # Check if manual scale is provided
        if manual_scale:
            # manual_scale = {"pixels": 100, "feet": 10} means 100 pixels = 10 feet
            pixels = manual_scale.get('pixels', 1)
            feet = manual_scale.get('feet', 1)
            self.scale_factor = feet / pixels  # feet per pixel
            print(f"   ✅ Using MANUAL scale: {pixels} pixels = {feet} feet")
            print(f"   Scale factor: {self.scale_factor:.6f} feet/pixel")
            print(f"   (1 foot = {1/self.scale_factor:.2f} pixels)")
        else:
            self.scale_factor = self._detect_scale(original)
            print(f"   Scale factor: {self.scale_factor} (feet per pixel)")
        
        # Step 2: Preprocess image
        print("\n🖼️ STEP 2: Preprocessing image...")
        processed = self._preprocess_image(gray)
        
        # Step 3: Detect walls
        print("\n🧱 STEP 3: Detecting walls...")
        self.walls = self._detect_walls(processed)
        print(f"   Found {len(self.walls)} walls")
        for i, wall in enumerate(self.walls[:3]):  # Show first 3 walls
            print(f"   Wall {i}: Length={wall.length:.1f}ft, Exterior={wall.is_exterior}")
        
        # Step 4: Detect rooms
        print("\n🏠 STEP 4: Detecting rooms...")
        self.rooms = self._detect_rooms(processed, self.walls)
        print(f"   Found {len(self.rooms)} rooms")
        for room in self.rooms:
            print(f"   Room '{room.type}': Area={room.area:.1f} sq ft, Dimensions={room.dimensions[0]:.1f}x{room.dimensions[1]:.1f} ft")
        
        # Step 5: Detect features (doors, windows)
        print("\n🚪 STEP 5: Detecting features...")
        self.features = self._detect_features(processed, original)
        print(f"   Found {len(self.features)} features")
        door_count = len([f for f in self.features if f.type == 'door'])
        window_count = len([f for f in self.features if f.type == 'window'])
        print(f"   Doors: {door_count}, Windows: {window_count}")
        
        # Step 6: Extract text and dimensions using OCR
        print("\n📝 STEP 6: Extracting text with OCR...")
        text_data = self._extract_text(original)
        if text_data.get('dimensions'):
            print(f"   Found dimension text: {text_data['dimensions'][:3]}")
        
        # Step 7: Use AI for enhanced analysis (if API key available)
        print("\n🤖 STEP 7: AI Vision analysis...")
        ai_analysis = self._ai_vision_analysis(image_path) if OPENAI_API_KEY else None
        if ai_analysis:
            print("   ✅ AI analysis complete")
        else:
            print("   ⚠️ Skipped (no API key)")
        
        # Step 8: Generate 3D model data
        print("\n🎮 STEP 8: Generating 3D model...")
        model_3d = self._generate_3d_model()
        print(f"   Generated {model_3d['vertex_count']} vertices, {model_3d['face_count']} faces")
        
        # Calculate final measurements
        total_area = sum(room.area for room in self.rooms)
        total_perimeter = sum(wall.length for wall in self.walls if wall.is_exterior)
        
        print("\n" + "="*60)
        print("📊 FINAL MEASUREMENTS:")
        print(f"   Total Area: {total_area:.1f} sq ft")
        print(f"   Total Perimeter: {total_perimeter:.1f} ft")
        print(f"   Room Count: {len(self.rooms)}")
        print(f"   Scale Factor: {self.scale_factor}")
        print("="*60 + "\n")
        
        # Compile results
        return {
            'success': True,
            'analysis': {
                'rooms': [asdict(room) for room in self.rooms],
                'walls': [asdict(wall) for wall in self.walls],
                'features': [asdict(feature) for feature in self.features],
                'measurements': {
                    'total_area': sum(room.area for room in self.rooms),
                    'total_perimeter': sum(wall.length for wall in self.walls if wall.is_exterior),
                    'room_count': len(self.rooms),
                    'scale_factor': self.scale_factor,
                    'units': 'feet'
                },
                'text_extracted': text_data,
                'ai_enhanced': ai_analysis
            },
            'model_3d': model_3d
        }
    
    def _preprocess_image(self, gray: np.ndarray) -> np.ndarray:
        """Preprocess image for better line detection"""
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive threshold
        thresh = cv2.adaptiveThreshold(
            blurred, 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Morphological operations to clean up
        kernel = np.ones((3, 3), np.uint8)
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
        
        return cleaned
    
    def _detect_walls(self, processed: np.ndarray) -> List[Wall]:
        """Detect walls using line detection"""
        walls = []
        
        # Detect edges
        edges = cv2.Canny(processed, 50, 150, apertureSize=3)
        
        # Detect lines using HoughLinesP
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=100,
            minLineLength=50,
            maxLineGap=10
        )
        
        if lines is not None:
            wall_id = 0
            for line in lines:
                x1, y1, x2, y2 = line[0]
                
                # Calculate line properties
                length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                
                # Filter out very short lines
                if length < 30:
                    continue
                
                # Determine if wall is horizontal or vertical
                angle = np.abs(np.arctan2(y2-y1, x2-x1) * 180 / np.pi)
                is_horizontal = angle < 10 or angle > 170
                is_vertical = 80 < angle < 100
                
                # Only keep horizontal and vertical walls
                if is_horizontal or is_vertical:
                    # Determine if exterior wall (on image boundary)
                    h, w = processed.shape
                    is_exterior = (
                        x1 < 10 or x2 < 10 or 
                        x1 > w-10 or x2 > w-10 or
                        y1 < 10 or y2 < 10 or 
                        y1 > h-10 or y2 > h-10
                    )
                    
                    walls.append(Wall(
                        id=f"wall_{wall_id}",
                        start=(x1 * self.scale_factor, y1 * self.scale_factor),
                        end=(x2 * self.scale_factor, y2 * self.scale_factor),
                        thickness=0.5,  # Standard wall thickness in feet
                        length=length * self.scale_factor,
                        is_exterior=is_exterior
                    ))
                    wall_id += 1
        
        return walls
    
    def _detect_rooms(self, processed: np.ndarray, walls: List[Wall]) -> List[Room]:
        """Detect rooms using contour detection"""
        rooms = []
        
        # Invert image for contour detection
        inverted = cv2.bitwise_not(processed)
        
        # Find contours
        contours, _ = cv2.findContours(
            inverted, 
            cv2.RETR_EXTERNAL, 
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        print(f"   📐 Found {len(contours)} contours")
        
        room_id = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            
            # Filter out very small contours
            if area < 1000:  # Minimum room size in pixels
                continue
            
            # Approximate polygon
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(contour)
            
            # Calculate room properties
            vertices = [(pt[0][0] * self.scale_factor, pt[0][1] * self.scale_factor) 
                       for pt in approx]
            
            # Calculate actual area using scale factor
            area_pixels = area
            area_sq_ft = area * self.scale_factor**2
            
            print(f"   📏 Room {room_id} measurements:")
            print(f"      - Pixel area: {area_pixels:.0f} px²")
            print(f"      - Scale factor: {self.scale_factor}")
            print(f"      - Calculated area: {area_sq_ft:.1f} sq ft")
            print(f"      - Dimensions: {w:.0f}x{h:.0f} px = {w*self.scale_factor:.1f}x{h*self.scale_factor:.1f} ft")
            
            # Determine room type based on size and shape
            room_type = self._classify_room(area_sq_ft, w/h)
            
            rooms.append(Room(
                id=f"room_{room_id}",
                type=room_type,
                vertices=vertices,
                area=area_sq_ft,
                perimeter=cv2.arcLength(contour, True) * self.scale_factor,
                center=((x + w/2) * self.scale_factor, (y + h/2) * self.scale_factor),
                dimensions=(w * self.scale_factor, h * self.scale_factor)
            ))
            room_id += 1
        
        return rooms
    
    def _detect_features(self, processed: np.ndarray, original: np.ndarray) -> List[Feature]:
        """Detect doors, windows, and other features"""
        features = []
        feature_id = 0
        
        # Use template matching for doors and windows
        # This is simplified - in production, use trained models
        
        # Detect gaps in walls (likely doors)
        h, w = processed.shape
        horizontal_projection = np.sum(processed == 0, axis=1)
        vertical_projection = np.sum(processed == 0, axis=0)
        
        # Find significant gaps
        threshold = w * 0.1  # 10% of width
        
        # Simple door detection based on gaps
        for i in range(len(horizontal_projection) - 20):
            if horizontal_projection[i] < threshold:
                window = horizontal_projection[i:i+20]
                if np.mean(window) < threshold * 0.5:
                    features.append(Feature(
                        id=f"door_{feature_id}",
                        type="door",
                        position=(w/2 * self.scale_factor, i * self.scale_factor),
                        dimensions=(3.0, 7.0)  # Standard door size in feet
                    ))
                    feature_id += 1
        
        return features
    
    def _classify_room(self, area: float, aspect_ratio: float) -> str:
        """Classify room type based on area and shape"""
        if area < 50:
            return "closet"
        elif area < 100:
            if aspect_ratio > 1.5 or aspect_ratio < 0.67:
                return "hallway"
            else:
                return "bathroom"
        elif area < 150:
            return "bedroom"
        elif area < 250:
            if aspect_ratio > 1.3:
                return "kitchen"
            else:
                return "bedroom"
        else:
            return "living_room"
    
    def _detect_scale(self, img: np.ndarray) -> float:
        """Detect scale from dimension text in image"""
        print("   🔍 Attempting to detect scale from image...")
        
        # First try: Use AI Vision if available
        if OPENAI_API_KEY:
            print("   🤖 Using OpenAI Vision for scale detection...")
            scale = self._detect_scale_with_ai(img)
            if scale and scale != 1.0:
                print(f"   ✅ AI detected scale: 1 pixel = {1/scale:.4f} feet")
                return scale
        
        # Second try: Enhanced OCR with preprocessing
        try:
            import re
            
            # Preprocess image for better OCR
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
            
            # Try different preprocessing techniques
            preprocessed_images = [
                gray,  # Original
                cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],  # OTSU
                cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2),  # Adaptive
            ]
            
            all_dimensions = []
            dimension_patterns = [
                r'(\d+)[\'\'`]\s*[-–—]\s*(\d+)["\"]',  # 10'-6" format
                r'(\d+\.?\d*)\s*(?:ft|feet|FT|FEET)',  # 10 ft, 10.5 feet
                r'(\d+\.?\d*)\s*(?:m|meters?|M)',  # 10m, 10.5 meters
                r'(\d+)[\'\'`]',  # 10' format
                r'(\d+)\s*[-–—x×]\s*(\d+)',  # 10x20, 10-20
            ]
            
            for processed in preprocessed_images:
                text = pytesseract.image_to_string(processed, config='--psm 11')
                print(f"   📝 OCR extracted text sample: {text[:100].replace(chr(10), ' ')}")
                
                for pattern in dimension_patterns:
                    matches = re.findall(pattern, text, re.IGNORECASE)
                    if matches:
                        all_dimensions.extend(matches)
            
            if all_dimensions:
                print(f"   📏 Found dimensions in text: {all_dimensions[:5]}")
                
                # Try to find corresponding lines in image
                edges = cv2.Canny(gray, 50, 150)
                lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)
                
                if lines is not None and len(all_dimensions) > 0:
                    # Get the longest line as reference
                    longest_line = max(lines, key=lambda l: np.sqrt((l[0][2]-l[0][0])**2 + (l[0][3]-l[0][1])**2))
                    line_length_pixels = np.sqrt((longest_line[0][2]-longest_line[0][0])**2 + (longest_line[0][3]-longest_line[0][1])**2)
                    
                    # Try to match with a dimension
                    try:
                        # Extract first numeric dimension
                        first_dim = all_dimensions[0]
                        if isinstance(first_dim, tuple):
                            dim_value = float(first_dim[0])
                        else:
                            dim_value = float(first_dim)
                        
                        # Calculate scale: pixels per foot
                        if dim_value > 0:
                            scale = line_length_pixels / dim_value
                            print(f"   ✅ Calculated scale from OCR: {scale:.2f} pixels = 1 foot")
                            print(f"      (Line: {line_length_pixels:.0f}px = {dim_value}ft)")
                            return 1.0 / scale  # Return feet per pixel
                    except (ValueError, IndexError):
                        pass
            
        except Exception as e:
            print(f"   ⚠️ OCR scale detection error: {e}")
        
        # Default: Estimate based on image size (assuming typical floor plan)
        h, w = img.shape[:2]
        
        # Typical floor plan assumptions:
        # - House is usually 30-60 feet wide
        # - Image is usually the full floor plan with some margin
        estimated_width_feet = 40  # Assume 40 feet wide house
        margin_factor = 0.9  # Account for margins
        
        pixels_per_foot = (w * margin_factor) / estimated_width_feet
        default_scale = 1.0 / pixels_per_foot
        
        print(f"   ⚠️ Using estimated scale: {pixels_per_foot:.2f} pixels = 1 foot")
        print(f"      (Based on {w}px width ≈ {estimated_width_feet}ft house)")
        
        return default_scale  # Return feet per pixel
    
    def _extract_text(self, img: np.ndarray) -> Dict[str, Any]:
        """Extract text from floor plan using OCR"""
        try:
            # Convert to PIL Image
            pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            
            # Get OCR data with bounding boxes
            data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)
            
            # Filter for meaningful text
            extracted = {
                'room_labels': [],
                'dimensions': [],
                'other_text': []
            }
            
            for i, text in enumerate(data['text']):
                if text.strip():
                    confidence = int(data['conf'][i])
                    if confidence > 30:  # Confidence threshold
                        text_lower = text.lower()
                        
                        # Categorize text
                        if any(room in text_lower for room in ['bedroom', 'kitchen', 'bath', 'living', 'dining']):
                            extracted['room_labels'].append(text)
                        elif any(char in text for char in ['\'', '"', 'ft', 'm']):
                            extracted['dimensions'].append(text)
                        else:
                            extracted['other_text'].append(text)
            
            return extracted
        except Exception as e:
            return {'error': str(e)}
    
    def _detect_scale_with_ai(self, img: np.ndarray) -> float:
        """Use OpenAI Vision to detect scale from dimensions in image"""
        if not OPENAI_API_KEY:
            return 1.0
        
        try:
            # Convert image to base64
            _, buffer = cv2.imencode('.png', img)
            base64_image = base64.b64encode(buffer).decode('utf-8')
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}"
            }
            
            payload = {
                "model": "gpt-4-vision-preview",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analyze this floor plan image and find dimension annotations.
                                Look for measurements like '30 ft', '10m', '15'-6"', etc.
                                Return ONLY a JSON object with:
                                {
                                    "longest_dimension_text": "the dimension text (e.g., '30 ft')",
                                    "longest_dimension_value": numeric value in feet,
                                    "image_width_pixels": estimated pixel width of that dimension line,
                                    "confidence": 0.0 to 1.0
                                }
                                If no dimensions found, return {"confidence": 0}"""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 200
            }
            
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_response = result['choices'][0]['message']['content']
                
                # Parse JSON response
                import json
                data = json.loads(ai_response)
                
                if data.get('confidence', 0) > 0.5 and data.get('longest_dimension_value'):
                    dim_feet = float(data['longest_dimension_value'])
                    pixels = float(data.get('image_width_pixels', img.shape[1] * 0.8))
                    
                    scale = 1.0 / (pixels / dim_feet)  # feet per pixel
                    print(f"   🤖 AI detected: {data['longest_dimension_text']} = {pixels:.0f}px")
                    return scale
        except Exception as e:
            print(f"   ⚠️ AI scale detection error: {e}")
        
        return 1.0
    
    def _ai_vision_analysis(self, image_path: str) -> Dict[str, Any]:
        """Use OpenAI Vision API for enhanced analysis"""
        if not OPENAI_API_KEY:
            return None
        
        try:
            # Read and encode image
            with open(image_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}"
            }
            
            payload = {
                "model": "gpt-4-vision-preview",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analyze this floor plan image in detail. Provide accurate measurements and room information.
                                Return a JSON object with:
                                {
                                    "rooms": [
                                        {"type": "room type", "dimensions": "WxL in feet", "area_sqft": number}
                                    ],
                                    "total_sqft": number,
                                    "bedrooms": number,
                                    "bathrooms": number,
                                    "dimensions": {
                                        "width_ft": number,
                                        "length_ft": number
                                    },
                                    "special_features": ["list of features"],
                                    "scale_info": "any scale or dimension annotations found"
                                }"""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 300
            }
            
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_response = result['choices'][0]['message']['content']
                
                # Try to parse as JSON, otherwise return as text
                try:
                    return json.loads(ai_response)
                except:
                    return {'raw_analysis': ai_response}
            else:
                return {'error': f"API error: {response.status_code}"}
                
        except Exception as e:
            return {'error': str(e)}
    
    def _generate_3d_model(self) -> Dict[str, Any]:
        """Generate 3D model data from detected floor plan"""
        vertices = []
        faces = []
        vertex_index = 0
        
        # Standard ceiling height
        ceiling_height = 10.0  # feet
        
        # Generate 3D geometry for each room
        for room in self.rooms:
            room_vertices = []
            
            # Create floor vertices
            for x, y in room.vertices:
                vertices.append([float(x), 0.0, float(y)])  # Floor level
                room_vertices.append(vertex_index)
                vertex_index += 1
            
            # Create ceiling vertices
            ceiling_vertices = []
            for x, y in room.vertices:
                vertices.append([float(x), ceiling_height, float(y)])  # Ceiling level
                ceiling_vertices.append(vertex_index)
                vertex_index += 1
            
            # Create faces for floor
            if len(room_vertices) >= 3:
                faces.append(room_vertices)
            
            # Create faces for ceiling
            if len(ceiling_vertices) >= 3:
                faces.append(ceiling_vertices)
            
            # Create wall faces
            for i in range(len(room_vertices)):
                next_i = (i + 1) % len(room_vertices)
                # Wall face (2 triangles)
                faces.append([
                    room_vertices[i],
                    room_vertices[next_i],
                    ceiling_vertices[next_i],
                    ceiling_vertices[i]
                ])
        
        # Generate door geometries
        for feature in self.features:
            if feature.type == 'door':
                # Create door opening (simplified)
                x, y = feature.position
                w, h = feature.dimensions
                
                # Door vertices (4 corners)
                door_verts = [
                    [float(x - w/2), 0.0, float(y)],
                    [float(x + w/2), 0.0, float(y)],
                    [float(x + w/2), float(h), float(y)],
                    [float(x - w/2), float(h), float(y)]
                ]
                
                for v in door_verts:
                    vertices.append(v)
        
        return {
            'format': 'custom',
            'vertices': vertices,
            'faces': faces,
            'vertex_count': len(vertices),
            'face_count': len(faces),
            'materials': {
                'floor': {'color': '#8B7355', 'type': 'wood'},
                'walls': {'color': '#F5F5DC', 'type': 'paint'},
                'ceiling': {'color': '#FFFFFF', 'type': 'paint'}
            },
            'metadata': {
                'units': 'feet',
                'ceiling_height': ceiling_height,
                'generated_from': 'floor_plan_analysis'
            }
        }
    
    def _load_image_from_base64(self, base64_string: str) -> np.ndarray:
        """Load image from base64 string"""
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


def process_floor_plan(image_path: str, manual_scale: Dict[str, float] = None) -> Dict[str, Any]:
    """Main entry point for processing a floor plan
    
    Args:
        image_path: Path to the floor plan image
        manual_scale: Optional dict with 'pixels' and 'feet' keys
                     Example: {"pixels": 100, "feet": 10} means 100 pixels = 10 feet
    """
    analyzer = FloorPlanAnalyzer()
    return analyzer.analyze_floor_plan(image_path, manual_scale)


def convert_to_serializable(obj):
    """Convert numpy types to Python native types for JSON serialization"""
    # Handle numpy scalar types
    if hasattr(obj, 'item'):
        return obj.item()
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_to_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_to_serializable(item) for item in obj)
    return obj

if __name__ == "__main__":
    # Test with a sample image
    import sys
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        
        # Check for manual scale arguments
        manual_scale = None
        if len(sys.argv) >= 4:
            try:
                pixels = float(sys.argv[2])
                feet = float(sys.argv[3])
                manual_scale = {"pixels": pixels, "feet": feet}
                print(f"Using manual scale: {pixels} pixels = {feet} feet", file=sys.stderr)
            except ValueError:
                print("Warning: Invalid scale values, using auto-detection", file=sys.stderr)
        
        result = process_floor_plan(image_path, manual_scale)
        # Convert numpy types to native Python types
        result = convert_to_serializable(result)
        # Output JSON without indentation for parsing
        print(json.dumps(result))
        sys.stdout.flush()
    else:
        print("Usage: python floor_plan_analyzer.py <image_path> [pixels feet]")
        print("Example: python floor_plan_analyzer.py plan.png 100 10")
        print("         (means 100 pixels = 10 feet)")