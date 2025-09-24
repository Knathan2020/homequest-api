#!/usr/bin/env python3
"""
Fuzzy Wall Detector Service
Fast Canny + Hough + Fuzzy Angle detection
Designed to complement the TypeScript parallel wall detector
"""

import cv2
import numpy as np
import json
import sys
from typing import List, Dict, Any

class FuzzyWallDetector:
    def __init__(self):
        """Initialize detector with optimal parameters"""
        pass
    
    def detect_walls_fuzzy(self, image_path: str) -> Dict[str, Any]:
        """Fast fuzzy wall detection using enhanced Canny + Hough"""
        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not read image: {image_path}")
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            height, width = gray.shape
            
            # Multi-scale edge detection (your improvement!)
            edges_low = cv2.Canny(gray, 30, 100)    # Sketchy drawings
            edges_med = cv2.Canny(gray, 50, 150)    # Standard quality  
            edges_high = cv2.Canny(gray, 80, 200)   # Clean CAD files
            
            # Combine all edge maps
            combined_edges = cv2.bitwise_or(edges_low, cv2.bitwise_or(edges_med, edges_high))
            
            # Apply morphology to connect broken lines
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            combined_edges = cv2.morphologyEx(combined_edges, cv2.MORPH_CLOSE, kernel)
            
            # Adaptive Hough Line detection
            contrast = np.std(gray)
            if contrast < 30:  # Low contrast sketch
                hough_params = {'threshold': 50, 'minLineLength': 30, 'maxLineGap': 20}
            elif contrast > 100:  # High contrast CAD
                hough_params = {'threshold': 150, 'minLineLength': 80, 'maxLineGap': 5}
            else:  # Medium quality
                hough_params = {'threshold': 100, 'minLineLength': 50, 'maxLineGap': 10}
            
            # Detect lines
            lines = cv2.HoughLinesP(
                combined_edges,
                rho=1,
                theta=np.pi/180,
                **hough_params
            )
            
            walls = []
            if lines is not None:
                # Step 1: Initial filtering and classification
                candidate_walls = []
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    
                    # Calculate properties
                    length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                    angle = np.arctan2(y2-y1, x2-x1) * 180 / np.pi
                    
                    # Enhanced fuzzy angle matching
                    is_horizontal, is_vertical, is_diagonal, confidence = self.classify_angle_fuzzy(angle)
                    
                    # MUCH STRICTER FILTERING: Only accept substantial walls
                    if (is_horizontal or is_vertical or is_diagonal) and length > 100:  # Much longer minimum length
                        wall_type = 'horizontal' if is_horizontal else ('vertical' if is_vertical else 'diagonal')
                        thickness = float(self.estimate_thickness(x1, y1, x2, y2, gray))
                        
                        candidate_walls.append({
                            'start': [int(x1), int(y1)],
                            'end': [int(x2), int(y2)],
                            'length': float(length),
                            'angle': float(angle),
                            'type': wall_type,
                            'confidence': float(confidence),
                            'is_sketchy': bool(confidence < 0.8),
                            'thickness': thickness,
                            'source': 'fuzzy_canny'
                        })
                
                # Step 2: Consolidate line segments into actual walls
                consolidated_walls = self.consolidate_wall_segments(candidate_walls)
                
                # Step 3: Advanced filtering to remove noise
                filtered_walls = self.apply_intelligent_filtering(consolidated_walls, gray)
                walls = filtered_walls
            
            # Step 3: Detect doors, windows, and arches
            doors = self.detect_doors(gray, walls)
            windows = self.detect_windows(gray, walls) 
            arches = self.detect_arches(gray, walls)
            
            return {
                "success": True,
                "walls": walls,
                "doors": doors,
                "windows": windows,
                "arches": arches,
                "method": "fuzzy_canny_complete",
                "image_stats": {
                    "width": width,
                    "height": height,
                    "contrast": float(contrast)
                },
                "totals": {
                    "walls": len(walls),
                    "doors": len(doors),
                    "windows": len(windows),
                    "arches": len(arches)
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "walls": []
            }
    
    def detect_doors(self, gray_img: np.ndarray, walls: list) -> list:
        """Detect doors by finding gaps in walls and door symbols"""
        doors = []
        height, width = gray_img.shape
        
        try:
            # Method 1: Find door openings (gaps in walls)
            door_openings = self.find_door_openings(walls, gray_img)
            doors.extend(door_openings)
            
            # Method 2: Detect door swing arcs (curved lines)
            door_swings = self.find_door_swings(gray_img)
            doors.extend(door_swings)
            
            # Method 3: Look for door symbols (rectangles at wall openings)
            door_symbols = self.find_door_symbols(gray_img, walls)
            doors.extend(door_symbols)
            
            # Remove duplicates and apply realistic limits
            doors = self.filter_duplicate_doors(doors)
            
            # REALISTIC CAP: Houses typically have 8-20 doors max
            if len(doors) > 20:
                doors.sort(key=lambda d: d.get('confidence', 0), reverse=True)
                doors = doors[:20]
            
        except Exception as e:
            print(f"Door detection error: {e}")
            
        return doors
    
    def detect_windows(self, gray_img: np.ndarray, walls: list) -> list:
        """Detect windows by finding rectangular openings in walls"""
        windows = []
        
        try:
            # Method 1: Find rectangular shapes along walls (window symbols)
            window_rectangles = self.find_window_rectangles(gray_img, walls)
            windows.extend(window_rectangles)
            
            # Method 2: Detect parallel lines in walls (double-line windows)
            window_lines = self.find_window_parallel_lines(gray_img, walls)
            windows.extend(window_lines)
            
            # Remove duplicates
            windows = self.filter_duplicate_windows(windows)
            
        except Exception as e:
            print(f"Window detection error: {e}")
            
        return windows
    
    def detect_arches(self, gray_img: np.ndarray, walls: list) -> list:
        """Detect arches and wide openings"""
        arches = []
        
        try:
            # Method 1: Find curved lines (arch tops)
            curved_arches = self.find_curved_arches(gray_img)
            arches.extend(curved_arches)
            
            # Method 2: Find wide openings between walls
            wide_openings = self.find_wide_openings(walls, gray_img)
            arches.extend(wide_openings)
            
            # Remove duplicates and apply realistic limits
            arches = self.filter_duplicate_arches(arches)
            
            # REALISTIC CAP: Houses typically have 5-15 arches/openings max
            if len(arches) > 15:
                arches.sort(key=lambda a: a.get('confidence', 0), reverse=True)
                arches = arches[:15]
            
        except Exception as e:
            print(f"Arch detection error: {e}")
            
        return arches
    
    def find_door_openings(self, walls: list, gray_img: np.ndarray) -> list:
        """Find door openings by analyzing gaps in parallel walls"""
        doors = []
        
        # Look for gaps in walls that could be doors (30-48 inches = 60-96 pixels typical)
        for i, wall1 in enumerate(walls):
            for j, wall2 in enumerate(walls[i+1:], i+1):
                # Check if walls are parallel and close
                if self.are_walls_parallel(wall1, wall2):
                    gap_size = self.wall_distance(wall1, wall2)
                    
                    # Door gap size - STRICTER (typical 30-36 inches)
                    if 50 < gap_size < 100:  # Narrower range for door openings
                        # Check if gap has door-like characteristics
                        if self.looks_like_door_opening(wall1, wall2, gray_img):
                            door = {
                                'type': 'opening',
                                'position': self.get_opening_center(wall1, wall2),
                                'width': float(gap_size),
                                'wall1': wall1,
                                'wall2': wall2,
                                'confidence': 0.7,
                                'swing': None  # Will be detected separately
                            }
                            doors.append(door)
        
        return doors
    
    def find_door_swings(self, gray_img: np.ndarray) -> list:
        """Detect door swing arcs using multiple methods"""
        doors = []
        
        # Method 1: HoughCircles for quarter-circle arcs
        try:
            circles = cv2.HoughCircles(
                gray_img,
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=60,    # Allow closer together  
                param1=80,     # Lower edge threshold
                param2=35,     # Lower accumulator threshold
                minRadius=20,  # Smaller minimum radius
                maxRadius=80   # Larger maximum radius
            )
            
            if circles is not None:
                circles = np.uint16(np.around(circles))
                for circle in circles[0, :]:
                    x, y, r = circle
                    
                    if self.is_door_swing_arc(gray_img, x, y, r):
                        doors.append({
                            'type': 'swing',
                            'position': [int(x), int(y)],
                            'radius': int(r),
                            'confidence': 0.8,
                            'swing_direction': self.determine_swing_direction(gray_img, x, y, r)
                        })
                        
        except Exception as e:
            pass
        
        # Method 2: Look for curved lines (door swing arcs)
        doors.extend(self.find_door_swing_curves(gray_img))
        
        return doors
    
    def find_door_swing_curves(self, gray_img: np.ndarray) -> list:
        """Find curved lines that could be door swings"""
        doors = []
        
        # Find contours that might be curved door swings
        edges = cv2.Canny(gray_img, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            # Check if contour is arc-shaped
            arc_length = cv2.arcLength(contour, False)
            if 60 < arc_length < 300:  # Door swing arc length
                
                # Fit circle to contour to check if it's arc-like
                if len(contour) >= 5:
                    try:
                        (x, y), radius = cv2.minEnclosingCircle(contour)
                        
                        # Check if it's a partial circle (door swing)
                        if 25 < radius < 85 and self.is_partial_circle(contour, (int(x), int(y)), radius):
                            doors.append({
                                'type': 'swing_curve',
                                'position': [int(x), int(y)],
                                'radius': int(radius),
                                'confidence': 0.7,
                                'swing_direction': self.estimate_swing_direction_from_contour(contour)
                            })
                    except:
                        pass
        
        return doors
    
    def is_partial_circle(self, contour, center, radius) -> bool:
        """Check if contour is a partial circle (arc)"""
        try:
            cx, cy = center
            total_points = len(contour)
            if total_points < 5:
                return False
                
            # Check what fraction of full circle this contour covers
            angles = []
            for point in contour:
                px, py = point[0]
                angle = np.arctan2(py - cy, px - cx)
                angles.append(angle)
            
            if len(angles) > 3:
                angle_range = max(angles) - min(angles)
                # Door swings typically cover 60-120 degrees
                return np.pi/3 < angle_range < 2*np.pi/3
                
        except:
            pass
        return False
    
    def estimate_swing_direction_from_contour(self, contour) -> str:
        """Estimate swing direction from contour shape"""
        if len(contour) < 3:
            return 'unknown'
            
        # Simple heuristic based on contour orientation
        start_point = contour[0][0]
        end_point = contour[-1][0] 
        
        if start_point[0] < end_point[0]:
            return 'clockwise'
        else:
            return 'counterclockwise'
    
    def find_door_symbols(self, gray_img: np.ndarray, walls: list) -> list:
        """Find door symbols (small rectangles) near wall openings"""
        doors = []
        
        # Find small rectangles that could be door symbols
        contours, _ = cv2.findContours(
            cv2.threshold(gray_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        for contour in contours:
            # Check if contour is door-sized rectangle
            area = cv2.contourArea(contour)
            if 200 < area < 2000:  # Door symbol size
                rect = cv2.boundingRect(contour)
                x, y, w, h = rect
                
                # Check aspect ratio (doors are typically taller than wide)
                aspect_ratio = h / w if w > 0 else 0
                if 1.5 < aspect_ratio < 3.0:  # Door-like proportions
                    # Check if it's near a wall
                    if self.is_near_wall([x + w//2, y + h//2], walls):
                        door = {
                            'type': 'symbol',
                            'position': [int(x + w//2), int(y + h//2)],
                            'width': int(w),
                            'height': int(h),
                            'confidence': 0.6
                        }
                        doors.append(door)
        
        return doors
    
    def find_window_rectangles(self, gray_img: np.ndarray, walls: list) -> list:
        """Find window rectangles along walls - both dark symbols and white gaps"""
        windows = []
        
        # Method 1: Find dark rectangular window symbols
        binary_inv = cv2.threshold(gray_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        contours1, _ = cv2.findContours(binary_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours1:
            area = cv2.contourArea(contour)
            if 50 < area < 1500:  # Window symbol size range
                rect = cv2.boundingRect(contour)
                x, y, w, h = rect
                
                aspect_ratio = w / h if h > 0 else 0
                if 0.5 < aspect_ratio < 5.0:  # Window proportions
                    if self.is_near_wall([x + w//2, y + h//2], walls, tolerance=20):
                        windows.append({
                            'type': 'dark_rectangle',
                            'position': [int(x + w//2), int(y + h//2)],
                            'width': int(w), 'height': int(h),
                            'confidence': 0.8
                        })
        
        # Method 2: Find gaps along walls (window openings in architectural drawings)
        for wall in walls:
            wall_windows = self.find_windows_along_wall(wall, gray_img)
            windows.extend(wall_windows)
        
        return windows
    
    def find_windows_along_wall(self, wall: dict, gray_img: np.ndarray) -> list:
        """Find windows as breaks/patterns along a wall"""
        windows = []
        x1, y1 = wall['start']
        x2, y2 = wall['end']
        
        # Sample along the wall looking for window patterns
        wall_length = wall['length']
        if wall_length < 50:  # Skip very short walls
            return windows
            
        num_samples = max(15, int(wall_length // 15))
        
        for i in range(1, num_samples - 1):  # Skip endpoints
            t = i / num_samples
            px = int(x1 + t * (x2 - x1))
            py = int(y1 + t * (y2 - y1))
            
            # Check for window pattern at this point
            if self.has_window_break_pattern(px, py, wall, gray_img):
                # Found potential window - check if it's not too close to existing ones
                too_close = any(
                    abs(w['position'][0] - px) < 30 and abs(w['position'][1] - py) < 30
                    for w in windows
                )
                
                if not too_close:
                    windows.append({
                        'type': 'wall_break',
                        'position': [px, py],
                        'width': 30,  # Estimated window width
                        'height': 15,  # Estimated window height  
                        'confidence': 0.6,
                        'wall': wall
                    })
        
        return windows
    
    def has_window_break_pattern(self, px: int, py: int, wall: dict, gray_img: np.ndarray) -> bool:
        """Check for window pattern - break in wall line or double-line pattern"""
        try:
            # Sample perpendicular to the wall to check for window patterns
            angle = wall.get('angle', 0)
            
            # Create perpendicular sampling line - longer for better detection
            perp_angle = angle + 90
            sample_length = 20  # Increased for better window detection
            
            dx = int(sample_length * np.cos(np.radians(perp_angle)))
            dy = int(sample_length * np.sin(np.radians(perp_angle))) 
            
            h, w = gray_img.shape
            x_start = max(0, min(w-1, px - dx))
            x_end = max(0, min(w-1, px + dx))
            y_start = max(0, min(h-1, py - dy))
            y_end = max(0, min(h-1, py + dy))
            
            if x_start == x_end and y_start == y_end:
                return False
                
            # Sample intensity across wall thickness
            if abs(dx) > abs(dy):  # More horizontal sampling
                if y_start < y_end:
                    profile = gray_img[y_start:y_end, px]
                else:
                    profile = gray_img[y_end:y_start, px]
            else:  # More vertical sampling
                if x_start < x_end:
                    profile = gray_img[py, x_start:x_end]
                else:
                    profile = gray_img[py, x_end:x_start]
            
            if len(profile) < 7:
                return False
                
            # Look for double-line pattern (dark-light-dark) typical of windows
            if len(profile) >= 10:
                # Check for window frame pattern in profile
                return self.detect_window_frame_pattern(profile)
            else:
                # Fallback to brightness variation
                profile_std = np.std(profile)
                profile_mean = np.mean(profile)
                return profile_std > 20 and profile_mean > 120
            
        except:
            return False
    
    def detect_window_frame_pattern(self, intensity_profile: np.ndarray) -> bool:
        """Detect window frame pattern in intensity profile"""
        if len(intensity_profile) < 7:
            return False
            
        # Look for dark-light-dark pattern (window frame with opening)
        # Or light-dark-light pattern (window opening with frame)
        
        # Smooth profile to reduce noise
        smoothed = np.convolve(intensity_profile, np.ones(3)/3, mode='same')
        
        # Find local minima and maxima
        peaks = []
        valleys = []
        
        for i in range(1, len(smoothed) - 1):
            if smoothed[i] > smoothed[i-1] and smoothed[i] > smoothed[i+1]:
                peaks.append(i)
            elif smoothed[i] < smoothed[i-1] and smoothed[i] < smoothed[i+1]:
                valleys.append(i)
        
        # Window pattern: should have alternating peaks/valleys
        if len(peaks) >= 1 and len(valleys) >= 2:
            # Check if intensity variation is significant enough
            max_val = np.max(smoothed)
            min_val = np.min(smoothed)
            contrast = max_val - min_val
            
            # Strong contrast suggests window frame pattern
            return contrast > 30
            
        return False
    
    def find_window_parallel_lines(self, gray_img: np.ndarray, walls: list) -> list:
        """Find windows as parallel lines in walls (double-line windows for architectural drawings)"""
        windows = []
        
        # Look for parallel line patterns that indicate window frames
        for wall in walls:
            # Sample along the wall to find window frame patterns
            wall_windows = self.detect_window_patterns_on_wall(wall, gray_img)
            windows.extend(wall_windows)
        
        return windows
    
    def detect_window_patterns_on_wall(self, wall: dict, gray_img: np.ndarray) -> list:
        """Detect window patterns along a specific wall"""
        windows = []
        x1, y1 = wall['start']
        x2, y2 = wall['end']
        
        # Sample points along the wall
        num_samples = max(10, int(wall['length'] // 20))
        for i in range(num_samples):
            t = i / num_samples
            px = int(x1 + t * (x2 - x1))
            py = int(y1 + t * (y2 - y1))
            
            # Look perpendicular to wall for double-line pattern
            if self.has_window_pattern_at_point(px, py, wall, gray_img):
                windows.append({
                    'type': 'parallel_lines',
                    'position': [px, py],
                    'width': 40,  # Estimated window width
                    'wall': wall,
                    'confidence': 0.6
                })
        
        return windows
    
    def has_window_pattern_at_point(self, px: int, py: int, wall: dict, gray_img: np.ndarray) -> bool:
        """Check if there's a window pattern (double line) at this point"""
        try:
            # Get perpendicular direction to wall
            angle = wall.get('angle', 0)
            perp_angle = angle + 90
            
            dx = int(15 * np.cos(np.radians(perp_angle)))
            dy = int(15 * np.sin(np.radians(perp_angle)))
            
            # Sample perpendicular line
            h, w = gray_img.shape
            x_start, x_end = max(0, px - dx), min(w-1, px + dx)
            y_start, y_end = max(0, py - dy), min(h-1, py + dy)
            
            if x_start < x_end and y_start < y_end:
                # Check for dark-light-dark pattern (window frame)
                profile = gray_img[y_start:y_end, x_start:x_end].mean(axis=1 if abs(dx) > abs(dy) else 0)
                if len(profile) >= 5:
                    # Look for pattern where center is lighter than edges
                    center_val = profile[len(profile)//2]
                    edge_vals = (profile[0] + profile[-1]) / 2
                    return center_val > edge_vals + 20  # Window opening is lighter
                    
        except:
            pass
        return False
    
    # Helper methods for doors/windows detection
    def are_walls_parallel(self, wall1: dict, wall2: dict) -> bool:
        """Check if two walls are parallel"""
        angle_diff = abs(wall1.get('angle', 0) - wall2.get('angle', 0))
        return angle_diff < 15 or angle_diff > 165  # Allow for some imprecision
    
    def looks_like_door_opening(self, wall1: dict, wall2: dict, gray_img: np.ndarray) -> bool:
        """Check if gap between walls looks like a door opening"""
        # Simple check: area between walls should be relatively clear
        center = self.get_opening_center(wall1, wall2)
        x, y = int(center[0]), int(center[1])
        
        # Sample small area at opening center
        if 0 <= x < gray_img.shape[1] and 0 <= y < gray_img.shape[0]:
            region = gray_img[max(0, y-10):min(gray_img.shape[0], y+10),
                              max(0, x-10):min(gray_img.shape[1], x+10)]
            
            if region.size > 0:
                # Opening should be lighter than walls
                return np.mean(region) > 200
        
        return False
    
    def get_opening_center(self, wall1: dict, wall2: dict) -> list:
        """Get center point of opening between two walls"""
        w1_center = [(wall1['start'][0] + wall1['end'][0]) / 2,
                     (wall1['start'][1] + wall1['end'][1]) / 2]
        w2_center = [(wall2['start'][0] + wall2['end'][0]) / 2,
                     (wall2['start'][1] + wall2['end'][1]) / 2]
        
        return [(w1_center[0] + w2_center[0]) / 2,
                (w1_center[1] + w2_center[1]) / 2]
    
    def is_door_swing_arc(self, gray_img: np.ndarray, x: int, y: int, r: int) -> bool:
        """Check if detected circle is actually a door swing arc"""
        # Sample points along the circle to see if it's a partial arc
        arc_points = 0
        total_points = 12
        
        for i in range(total_points):
            angle = 2 * np.pi * i / total_points
            px = int(x + r * np.cos(angle))
            py = int(y + r * np.sin(angle))
            
            if (0 <= px < gray_img.shape[1] and 
                0 <= py < gray_img.shape[0] and 
                gray_img[py, px] < 100):  # Dark pixel (line)
                arc_points += 1
        
        # Door swing should have arc in one quadrant (25-50% of circle)
        return 0.2 < arc_points / total_points < 0.6
    
    def determine_swing_direction(self, gray_img: np.ndarray, x: int, y: int, r: int) -> str:
        """Determine which direction door swings"""
        # Check which quadrant has the most arc pixels
        quadrant_counts = [0, 0, 0, 0]
        
        for i in range(32):
            angle = 2 * np.pi * i / 32
            px = int(x + r * np.cos(angle))
            py = int(y + r * np.sin(angle))
            
            if (0 <= px < gray_img.shape[1] and 
                0 <= py < gray_img.shape[0] and 
                gray_img[py, px] < 100):
                
                # Determine quadrant
                if angle < np.pi/2:
                    quadrant_counts[0] += 1  # Top-right
                elif angle < np.pi:
                    quadrant_counts[1] += 1  # Top-left
                elif angle < 3*np.pi/2:
                    quadrant_counts[2] += 1  # Bottom-left
                else:
                    quadrant_counts[3] += 1  # Bottom-right
        
        max_quadrant = quadrant_counts.index(max(quadrant_counts))
        directions = ['right', 'left', 'left', 'right']
        return directions[max_quadrant]
    
    def is_near_wall(self, point: list, walls: list) -> bool:
        """Check if point is near any wall"""
        px, py = point
        
        for wall in walls:
            # Calculate distance from point to wall line
            wall_dist = self.point_to_line_distance(px, py, wall)
            if wall_dist < 20:  # Within 20 pixels of wall
                return True
        
        return False
    
    def is_on_wall(self, point: list, walls: list) -> bool:
        """Check if point is on any wall"""
        px, py = point
        
        for wall in walls:
            # Check if point is very close to wall
            wall_dist = self.point_to_line_distance(px, py, wall)
            if wall_dist < 10:  # Very close to wall
                return True
        
        return False
    
    def is_near_wall(self, point: list, walls: list, tolerance: int = 15) -> bool:
        """Check if point is near any wall (more lenient than is_on_wall)"""
        px, py = point
        
        for wall in walls:
            # Check if point is close to wall
            wall_dist = self.point_to_line_distance(px, py, wall)
            if wall_dist < tolerance:
                return True
        
        return False
    
    def point_to_line_distance(self, px: int, py: int, wall: dict) -> float:
        """Calculate distance from point to wall line"""
        x1, y1 = wall['start']
        x2, y2 = wall['end']
        
        # Line formula: ax + by + c = 0
        A = y2 - y1
        B = x1 - x2
        C = x2*y1 - x1*y2
        
        if A == 0 and B == 0:
            return float('inf')
        
        return abs(A*px + B*py + C) / np.sqrt(A*A + B*B)
    
    def find_double_line_segments(self, wall: dict, gray_img: np.ndarray) -> list:
        """Find double-line segments along a wall (window frames)"""
        segments = []
        # This would involve sampling perpendicular to the wall
        # and looking for patterns like: dark-light-dark (window frame)
        # Simplified implementation for now
        return segments
    
    def find_curved_arches(self, gray_img: np.ndarray) -> list:
        """Find curved arch tops"""
        arches = []
        # Would use contour analysis to find arch-like curves
        # Simplified for now
        return arches
    
    def find_wide_openings(self, walls: list, gray_img: np.ndarray) -> list:
        """Find wide openings between rooms (arches, wide passages)"""
        openings = []
        
        # Look for larger gaps between walls
        for i, wall1 in enumerate(walls):
            for j, wall2 in enumerate(walls[i+1:], i+1):
                if self.are_walls_parallel(wall1, wall2):
                    gap_size = self.wall_distance(wall1, wall2)
                    
                    # Wide opening - MUCH STRICTER (wider than door) 
                    if 150 < gap_size < 250:  # Narrower range for arches
                        opening = {
                            'type': 'wide_opening',
                            'position': self.get_opening_center(wall1, wall2),
                            'width': float(gap_size),
                            'wall1': wall1,
                            'wall2': wall2,
                            'confidence': 0.6
                        }
                        openings.append(opening)
        
        return openings
    
    def filter_duplicate_doors(self, doors: list) -> list:
        """Remove duplicate door detections"""
        if len(doors) <= 1:
            return doors
            
        filtered = []
        for door in doors:
            is_duplicate = False
            door_pos = door['position']
            
            for existing in filtered:
                existing_pos = existing['position'] 
                distance = np.sqrt((door_pos[0] - existing_pos[0])**2 + 
                                 (door_pos[1] - existing_pos[1])**2)
                
                if distance < 30:  # Within 30 pixels
                    is_duplicate = True
                    # Keep the one with higher confidence
                    if door.get('confidence', 0) > existing.get('confidence', 0):
                        filtered.remove(existing)
                        filtered.append(door)
                    break
            
            if not is_duplicate:
                filtered.append(door)
                
        return filtered
    
    def filter_duplicate_windows(self, windows: list) -> list:
        """Remove duplicate window detections"""
        return self.filter_duplicate_doors(windows)  # Same logic
    
    def filter_duplicate_arches(self, arches: list) -> list:
        """Remove duplicate arch detections"""
        return self.filter_duplicate_doors(arches)  # Same logic

    def classify_angle_fuzzy(self, angle: float) -> tuple:
        """Fuzzy angle classification with confidence scoring"""
        # Allow ±15° tolerance for imperfect drawings
        is_horizontal = (abs(angle) < 15 or abs(angle) > 165)
        is_vertical = (75 < abs(angle) < 105)
        is_diagonal = (35 < abs(angle) < 55) or (125 < abs(angle) < 145)
        
        # Calculate confidence based on how close to perfect angle
        confidence = 1.0
        if is_horizontal:
            deviation = min(abs(angle), abs(abs(angle) - 180))
            confidence = max(0.5, 1.0 - deviation / 15.0)
        elif is_vertical:
            deviation = abs(abs(angle) - 90)
            confidence = max(0.5, 1.0 - deviation / 15.0)
        elif is_diagonal:
            deviation = min(abs(abs(angle) - 45), abs(abs(angle) - 135))
            confidence = max(0.4, 1.0 - deviation / 20.0)
        
        return is_horizontal, is_vertical, is_diagonal, confidence
    
    def estimate_thickness(self, x1: int, y1: int, x2: int, y2: int, gray_img: np.ndarray) -> float:
        """Quick thickness estimation"""
        # Calculate perpendicular direction
        length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
        if length == 0:
            return 6.0
            
        # Unit vector along the line
        dx = (x2 - x1) / length
        dy = (y2 - y1) / length
        
        # Perpendicular unit vector
        perp_dx = -dy
        perp_dy = dx
        
        # Sample points along the line
        mid_x = (x1 + x2) // 2
        mid_y = (y1 + y2) // 2
        
        # Quick thickness estimation by sampling perpendicular
        thickness = 6.0
        try:
            for offset in range(3, 20):
                sample_x = int(mid_x + offset * perp_dx)
                sample_y = int(mid_y + offset * perp_dy)
                
                if (0 <= sample_x < gray_img.shape[1] and 
                    0 <= sample_y < gray_img.shape[0]):
                    intensity = gray_img[sample_y, sample_x]
                    
                    # If we hit a bright pixel, we've found the wall edge
                    if intensity > 200:
                        thickness = offset * 2  # Both sides
                        break
                        
        except:
            thickness = 6.0
            
        return min(max(thickness, 3), 25)  # Clamp between 3-25 pixels
    
    def consolidate_wall_segments(self, line_segments: list) -> list:
        """Consolidate multiple line segments into actual walls"""
        if not line_segments:
            return []
        
        print(f"🔧 Consolidating {len(line_segments)} line segments into walls...")
        
        # Step 1: Group parallel lines that are close together (wall edges)
        wall_groups = self.group_parallel_lines(line_segments)
        
        # Step 2: Merge collinear segments (broken walls)  
        consolidated_walls = []
        for group in wall_groups:
            merged_walls = self.merge_collinear_segments(group)
            consolidated_walls.extend(merged_walls)
        
        # Step 3: Calculate wall thickness from grouped lines
        thickness_walls = self.calculate_wall_thickness_from_groups(consolidated_walls)
        
        # Step 4: Apply structural focus - prioritize real walls over decorative lines
        final_walls = self.apply_structural_focus(thickness_walls)
        
        print(f"✅ Consolidated into {len(final_walls)} structural walls")
        return final_walls
    
    def group_parallel_lines(self, lines: list) -> list:
        """Group parallel lines that represent wall edges - more aggressive for all floor plans"""
        groups = []
        used = set()
        
        for i, line1 in enumerate(lines):
            if i in used:
                continue
                
            # Start new group with this line
            group = [line1]
            used.add(i)
            
            # Find all parallel lines close to ANY line in the current group (transitive grouping)
            added_to_group = True
            while added_to_group:
                added_to_group = False
                for existing_line in group:
                    for j, candidate_line in enumerate(lines):
                        if j in used:
                            continue
                            
                        if self.are_parallel_and_close(existing_line, candidate_line):
                            group.append(candidate_line)
                            used.add(j)
                            added_to_group = True
            
            # Only keep groups that make sense as walls
            if len(group) > 0:
                groups.append(group)
        
        print(f"  Grouped {len(lines)} lines into {len(groups)} wall groups")
        return groups
    
    def are_parallel_and_close(self, line1: dict, line2: dict) -> bool:
        """Check if two lines are parallel and close enough to be same wall"""
        # Check if angles are similar (parallel) - more lenient for all floor plans
        angle1 = line1.get('angle', 0)
        angle2 = line2.get('angle', 0)
        angle_diff = abs(angle1 - angle2)
        
        # Handle angle wraparound (e.g., 355° vs 5°)
        if angle_diff > 180:
            angle_diff = 360 - angle_diff
            
        if angle_diff > 15:  # More tolerant for hand-drawn style CAD
            return False
        
        # Check if lines are close to each other - adaptive to image scale
        distance = self.line_to_line_distance(line1, line2)
        
        # Scale-adaptive wall thickness detection
        avg_length = (line1['length'] + line2['length']) / 2
        if avg_length > 500:  # Large scale drawing
            max_thickness = 50
        elif avg_length > 200:  # Medium scale  
            max_thickness = 30
        else:  # Small scale
            max_thickness = 15
            
        return 1 < distance < max_thickness
    
    def line_to_line_distance(self, line1: dict, line2: dict) -> float:
        """Calculate minimum distance between two line segments"""
        # Use midpoints for simplicity
        mid1_x = (line1['start'][0] + line1['end'][0]) / 2
        mid1_y = (line1['start'][1] + line1['end'][1]) / 2
        mid2_x = (line2['start'][0] + line2['end'][0]) / 2
        mid2_y = (line2['start'][1] + line2['end'][1]) / 2
        
        return ((mid2_x - mid1_x)**2 + (mid2_y - mid1_y)**2)**0.5
    
    def merge_collinear_segments(self, line_group: list) -> list:
        """Merge collinear line segments into continuous walls"""
        if not line_group:
            return []
            
        # If group has multiple parallel lines, represent as single wall with thickness
        if len(line_group) > 1:
            # Find the longest/most representative line
            main_line = max(line_group, key=lambda l: l['length'])
            # Calculate thickness from group spread
            thickness = self.calculate_group_thickness(line_group)
            
            return [{
                'start': main_line['start'],
                'end': main_line['end'], 
                'length': main_line['length'],
                'angle': main_line['angle'],
                'type': main_line['type'],
                'confidence': min(1.0, main_line['confidence'] * 1.2),  # Boost confidence
                'is_sketchy': False,
                'thickness': thickness,
                'source': 'consolidated'
            }]
        else:
            # Single line - just pass through
            return line_group
    
    def calculate_group_thickness(self, line_group: list) -> float:
        """Calculate wall thickness from a group of parallel lines"""
        if len(line_group) < 2:
            return 6.0  # Default thickness
            
        # Find min and max distances to estimate thickness
        distances = []
        for i in range(len(line_group)):
            for j in range(i+1, len(line_group)):
                dist = self.line_to_line_distance(line_group[i], line_group[j])
                distances.append(dist)
        
        if distances:
            thickness = max(distances)
            return min(max(thickness, 4), 25)  # Reasonable wall thickness range
        
        return 6.0
    
    def calculate_wall_thickness_from_groups(self, walls: list) -> list:
        """Final pass to ensure proper wall thickness"""
        return walls  # Already calculated in merge step
    
    def apply_structural_focus(self, walls: list) -> list:
        """Filter for structural walls vs decorative elements - works for all floor plans"""
        if not walls:
            return []
            
        print(f"🏗️ Applying structural focus to {len(walls)} walls...")
        
        # Categorize walls by structural importance
        structural_walls = []
        
        for wall in walls:
            importance_score = self.calculate_structural_importance(wall)
            wall['structural_score'] = importance_score
            
            # Only keep walls that meet structural criteria
            if importance_score > 0.3:  # Adjustable threshold
                structural_walls.append(wall)
        
        # Sort by structural importance and keep most significant
        structural_walls.sort(key=lambda w: w['structural_score'], reverse=True)
        
        # Adaptive cap based on drawing size - larger drawings need more walls
        max_walls = self.calculate_realistic_wall_count(structural_walls)
        
        final_walls = structural_walls[:max_walls] if len(structural_walls) > max_walls else structural_walls
        
        print(f"  📐 Filtered to {len(final_walls)} structural walls (from {len(walls)})")
        return final_walls
    
    def calculate_structural_importance(self, wall: dict) -> float:
        """Calculate how structurally important this wall is"""
        score = 0.0
        
        # 1. Length importance - longer walls are more structural
        length = wall.get('length', 0)
        if length > 300:
            score += 0.4  # Very long walls
        elif length > 150:
            score += 0.3  # Long walls  
        elif length > 100:
            score += 0.2  # Medium walls
        elif length > 50:
            score += 0.1  # Short walls
        # Very short walls get 0 points
        
        # 2. Thickness importance - thicker walls are more structural
        thickness = wall.get('thickness', 0)
        if thickness > 15:
            score += 0.2  # Thick walls (load-bearing)
        elif thickness > 8:
            score += 0.15  # Medium thickness
        elif thickness > 4:
            score += 0.1   # Thin walls
            
        # 3. Consolidation bonus - grouped walls are more likely to be real
        if wall.get('source') == 'consolidated':
            score += 0.25
            
        # 4. Position importance - perimeter walls are structural
        if self.is_perimeter_wall(wall):
            score += 0.2
            
        # 5. Confidence bonus
        confidence = wall.get('confidence', 0)
        score += confidence * 0.1
        
        return min(score, 1.0)  # Cap at 1.0
    
    def is_perimeter_wall(self, wall: dict) -> bool:
        """Check if wall is likely on building perimeter"""
        # Simple heuristic - walls very close to image edges
        start_x, start_y = wall['start']
        end_x, end_y = wall['end']
        
        # Assume typical image dimensions (will be adaptive in practice)
        edge_threshold = 50  # pixels from edge
        
        # Check if wall is near any edge
        near_edge = (start_x < edge_threshold or end_x < edge_threshold or 
                    start_y < edge_threshold or end_y < edge_threshold)
        
        return near_edge and wall.get('length', 0) > 200  # Long walls near edges
    
    def calculate_realistic_wall_count(self, walls: list) -> int:
        """Calculate realistic wall count based on drawing characteristics"""
        if not walls:
            return 0
            
        # Base calculation on drawing complexity and size
        total_wall_length = sum(w.get('length', 0) for w in walls)
        avg_wall_length = total_wall_length / len(walls) if walls else 100
        
        # Scale-based realistic count
        if avg_wall_length > 400:  # Large scale drawing
            base_count = 35
        elif avg_wall_length > 200:  # Medium scale
            base_count = 30  
        else:  # Small scale
            base_count = 25
            
        # Adjust based on actual wall distribution
        high_importance = sum(1 for w in walls if w.get('structural_score', 0) > 0.7)
        medium_importance = sum(1 for w in walls if 0.4 < w.get('structural_score', 0) <= 0.7)
        
        # Prioritize high importance walls
        realistic_count = min(high_importance + (medium_importance // 2), base_count)
        
        return max(realistic_count, 15)  # Minimum 15 walls for any floor plan
    
    def apply_intelligent_filtering(self, candidate_walls: list, gray_img: np.ndarray) -> list:
        """Apply intelligent filtering to remove text lines, dimension lines, and noise"""
        height, width = gray_img.shape
        filtered_walls = []
        
        # 1. Remove walls that are too close to each other (likely text lines)
        clustered_walls = self.remove_text_clusters(candidate_walls)
        
        # 2. Filter by confidence and length - MUCH STRICTER
        quality_walls = []
        for wall in clustered_walls:
            # Only keep very high-quality walls
            if (wall['confidence'] > 0.8 and wall['length'] > 120) or wall['length'] > 200:
                quality_walls.append(wall)
        
        # 3. Remove walls in high-density areas (likely text/dimensions)
        for wall in quality_walls:
            if not self.is_in_text_area(wall, gray_img):
                filtered_walls.append(wall)
        
        # 4. Trust consolidation process - let wall grouping determine realistic count
        # Sort by structural importance but don't impose arbitrary caps
        filtered_walls.sort(key=lambda w: w['confidence'] * w['length'], reverse=True)
        
        return filtered_walls
    
    def remove_text_clusters(self, walls: list) -> list:
        """Remove walls that are clustered together (likely text lines)"""
        if len(walls) < 3:
            return walls
            
        # Group parallel walls that are very close
        clusters = []
        used = set()
        
        for i, wall1 in enumerate(walls):
            if i in used:
                continue
                
            cluster = [wall1]
            used.add(i)
            
            for j, wall2 in enumerate(walls[i+1:], i+1):
                if j in used:
                    continue
                    
                # Check if walls are parallel and close
                if (abs(wall1['angle'] - wall2['angle']) < 10 and 
                    self.wall_distance(wall1, wall2) < 30):
                    cluster.append(wall2)
                    used.add(j)
            
            clusters.append(cluster)
        
        # Filter clusters: if more than 4 similar lines close together, likely text
        filtered_walls = []
        for cluster in clusters:
            if len(cluster) <= 4:  # Keep small clusters
                filtered_walls.extend(cluster)
            else:
                # From large clusters, only keep the longest walls
                cluster.sort(key=lambda w: w['length'], reverse=True)
                filtered_walls.extend(cluster[:2])  # Keep top 2 longest
                
        return filtered_walls
    
    def wall_distance(self, wall1: dict, wall2: dict) -> float:
        """Calculate minimum distance between two wall segments"""
        # Simplified distance calculation between wall midpoints
        mid1_x = (wall1['start'][0] + wall1['end'][0]) / 2
        mid1_y = (wall1['start'][1] + wall1['end'][1]) / 2
        mid2_x = (wall2['start'][0] + wall2['end'][0]) / 2
        mid2_y = (wall2['start'][1] + wall2['end'][1]) / 2
        
        return np.sqrt((mid2_x - mid1_x)**2 + (mid2_y - mid1_y)**2)
    
    def is_in_text_area(self, wall: dict, gray_img: np.ndarray) -> bool:
        """Check if wall is likely in a text area"""
        try:
            # Sample area around the wall
            mid_x = int((wall['start'][0] + wall['end'][0]) / 2)
            mid_y = int((wall['start'][1] + wall['end'][1]) / 2)
            
            # Define sampling region
            region_size = 50
            x1 = max(0, mid_x - region_size)
            y1 = max(0, mid_y - region_size)
            x2 = min(gray_img.shape[1], mid_x + region_size)
            y2 = min(gray_img.shape[0], mid_y + region_size)
            
            if x2 <= x1 or y2 <= y1:
                return False
                
            region = gray_img[y1:y2, x1:x2]
            
            # Text areas have lots of small edges and intermediate gray values
            edges = cv2.Canny(region, 50, 150)
            edge_density = np.sum(edges > 0) / (region.shape[0] * region.shape[1])
            
            # High edge density suggests text/complex details
            return edge_density > 0.15
            
        except Exception:
            return False


def main():
    """Command line interface"""
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python fuzzy-wall-detector.py <image_path>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    detector = FuzzyWallDetector()
    result = detector.detect_walls_fuzzy(image_path)
    
    print(json.dumps(result))


if __name__ == "__main__":
    main()