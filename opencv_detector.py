#!/usr/bin/env python3
"""
OpenCV Floor Plan Detector
Provides accurate edge detection and contour finding for floor plans
"""

import cv2
import numpy as np
import json
import sys
import base64
from typing import List, Dict, Tuple, Any
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FloorPlanDetector:
    def __init__(self):
        self.min_room_area = 1000  # Minimum area for a valid room
        self.max_room_area = 100000  # Maximum area for a valid room
        
    def detect_rooms_and_walls(self, image_path: str) -> Dict[str, Any]:
        """
        Detect rooms and walls in a floor plan image
        Returns normalized coordinates (0-1 range)
        """
        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not read image: {image_path}")
                
            height, width = img.shape[:2]
            logger.info(f"Image dimensions: {width}x{height}")
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply adaptive threshold to get binary image
            # This handles varying lighting conditions better
            binary = cv2.adaptiveThreshold(
                gray, 255, 
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY_INV,
                11, 2
            )
            
            # Denoise
            kernel = np.ones((3,3), np.uint8)
            cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
            cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
            
            # Detect rooms using contours
            rooms = self._detect_rooms(cleaned, width, height)
            
            # Detect walls using line detection
            walls = self._detect_walls(cleaned, width, height)
            
            logger.info(f"Detected {len(rooms)} rooms and {len(walls)} walls")
            
            return {
                "success": True,
                "rooms": rooms,
                "walls": walls,
                "image_size": {"width": width, "height": height}
            }
            
        except Exception as e:
            logger.error(f"Detection error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "rooms": [],
                "walls": []
            }
    
    def _detect_rooms(self, binary: np.ndarray, width: int, height: int) -> List[Dict]:
        """Detect rooms using contour detection"""
        rooms = []
        
        # Find contours
        contours, hierarchy = cv2.findContours(
            binary, 
            cv2.RETR_EXTERNAL,  # Only external contours (rooms)
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        for i, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            
            # Filter by area
            if self.min_room_area < area < self.max_room_area:
                # Approximate polygon to reduce points
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                # Get bounding box for additional info
                x, y, w, h = cv2.boundingRect(contour)
                
                # Convert to normalized coordinates (0-1)
                # Direct normalization without flipping
                normalized_coords = []
                for point in approx:
                    nx = point[0][0] / width  # Direct normalization, no flip
                    ny = point[0][1] / height
                    normalized_coords.append([nx, ny])
                
                # Ensure polygon is closed
                if normalized_coords and normalized_coords[0] != normalized_coords[-1]:
                    normalized_coords.append(normalized_coords[0])
                
                # Calculate center point
                M = cv2.moments(contour)
                if M["m00"] != 0:
                    cx = M["m10"] / M["m00"] / width  # Direct normalization, no flip
                    cy = M["m01"] / M["m00"] / height
                else:
                    cx = (x + w/2) / width  # Direct normalization, no flip
                    cy = (y + h/2) / height
                
                room = {
                    "id": f"room_{i}",
                    "coordinates": normalized_coords,
                    "area": area,
                    "center": [cx, cy],
                    "bbox": {
                        "x": x / width,  # Direct normalization, no flip
                        "y": y / height,
                        "width": w / width,
                        "height": h / height
                    }
                }
                rooms.append(room)
                
        return rooms
    
    def _detect_walls(self, binary: np.ndarray, width: int, height: int) -> List[Dict]:
        """Detect walls using Hough line detection"""
        walls = []
        
        # Detect edges for line detection
        edges = cv2.Canny(binary, 50, 150, apertureSize=3)
        
        # Detect lines using Probabilistic Hough Transform
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=80,
            minLineLength=50,
            maxLineGap=10
        )
        
        if lines is not None:
            # Merge similar lines and filter
            merged_lines = self._merge_similar_lines(lines)
            
            for i, line in enumerate(merged_lines):
                x1, y1, x2, y2 = line
                
                # Calculate line properties
                length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                angle = np.arctan2(y2-y1, x2-x1) * 180 / np.pi
                
                # Determine if horizontal or vertical
                is_horizontal = abs(angle) < 10 or abs(angle) > 170
                is_vertical = 80 < abs(angle) < 100
                
                # Only keep clean horizontal and vertical lines
                if (is_horizontal or is_vertical) and length > 30:
                    # Convert to normalized coordinates without flip
                    wall = {
                        "id": f"wall_{i}",
                        "start": [x1/width, y1/height],  # Direct normalization, no flip
                        "end": [x2/width, y2/height],  # Direct normalization, no flip
                        "thickness": 0.01,  # Normalized thickness
                        "length": length,
                        "type": "horizontal" if is_horizontal else "vertical"
                    }
                    walls.append(wall)
        
        return walls
    
    def _merge_similar_lines(self, lines: np.ndarray, threshold: float = 10) -> List[List[int]]:
        """Merge lines that are close and parallel"""
        if lines is None or len(lines) == 0:
            return []
            
        merged = []
        used = set()
        
        for i, line1 in enumerate(lines):
            if i in used:
                continue
                
            x1, y1, x2, y2 = line1[0]
            merged_line = [x1, y1, x2, y2]
            used.add(i)
            
            # Try to merge with other lines
            for j, line2 in enumerate(lines):
                if j in used or i == j:
                    continue
                    
                x3, y3, x4, y4 = line2[0]
                
                # Check if lines are close and parallel
                if self._are_lines_similar(merged_line, [x3, y3, x4, y4], threshold):
                    # Extend the merged line
                    all_points = [(merged_line[0], merged_line[1]), 
                                  (merged_line[2], merged_line[3]),
                                  (x3, y3), (x4, y4)]
                    
                    # Find extreme points
                    xs = [p[0] for p in all_points]
                    ys = [p[1] for p in all_points]
                    
                    # Use the most extreme points
                    if abs(max(xs) - min(xs)) > abs(max(ys) - min(ys)):
                        # Horizontal line
                        merged_line = [min(xs), np.mean(ys), max(xs), np.mean(ys)]
                    else:
                        # Vertical line
                        merged_line = [np.mean(xs), min(ys), np.mean(xs), max(ys)]
                    
                    used.add(j)
            
            merged.append(merged_line)
        
        return merged
    
    def _are_lines_similar(self, line1: List[int], line2: List[int], threshold: float) -> bool:
        """Check if two lines are similar (parallel and close)"""
        x1, y1, x2, y2 = line1
        x3, y3, x4, y4 = line2
        
        # Calculate angles
        angle1 = np.arctan2(y2-y1, x2-x1)
        angle2 = np.arctan2(y4-y3, x4-x3)
        
        # Check if parallel (similar angles)
        angle_diff = abs(angle1 - angle2) * 180 / np.pi
        if angle_diff > 10 and angle_diff < 170:
            return False
        
        # Check distance between lines
        # Calculate perpendicular distance from line2's midpoint to line1
        mid_x = (x3 + x4) / 2
        mid_y = (y3 + y4) / 2
        
        # Distance from point to line formula
        distance = abs((y2-y1)*mid_x - (x2-x1)*mid_y + x2*y1 - y2*x1) / np.sqrt((y2-y1)**2 + (x2-x1)**2)
        
        return distance < threshold


def main():
    """Main entry point for the detector"""
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python opencv_detector.py <image_path>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    detector = FloorPlanDetector()
    result = detector.detect_rooms_and_walls(image_path)
    
    # Output JSON result
    print(json.dumps(result))


if __name__ == "__main__":
    main()