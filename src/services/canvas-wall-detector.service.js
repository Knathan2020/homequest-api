"use strict";
/**
 * Canvas-based Wall Detection Service
 * Uses pixel analysis to detect actual walls in floor plans
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasWallDetectorService = void 0;
var canvas_1 = require("canvas");
var CanvasWallDetectorService = /** @class */ (function () {
    function CanvasWallDetectorService() {
        this.canvas = null;
        this.ctx = null;
    }
    /**
     * Detect walls, doors, and windows from a floor plan image
     */
    CanvasWallDetectorService.prototype.detectFeatures = function (imagePath) {
        return __awaiter(this, void 0, void 0, function () {
            var image, imageData, allWalls, doors, windows, walls, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        console.log('🖼️ Loading image for wall detection:', imagePath);
                        return [4 /*yield*/, (0, canvas_1.loadImage)(imagePath)];
                    case 1:
                        image = _a.sent();
                        // Create canvas
                        this.canvas = (0, canvas_1.createCanvas)(image.width, image.height);
                        this.ctx = this.canvas.getContext('2d');
                        // Draw image to canvas
                        this.ctx.drawImage(image, 0, 0);
                        imageData = this.ctx.getImageData(0, 0, image.width, image.height);
                        return [4 /*yield*/, this.detectWalls(imageData)];
                    case 2:
                        allWalls = _a.sent();
                        return [4 /*yield*/, this.detectDoors(allWalls, imageData)];
                    case 3:
                        doors = _a.sent();
                        return [4 /*yield*/, this.detectWindows(allWalls, imageData)];
                    case 4:
                        windows = _a.sent();
                        walls = this.filterWalls(allWalls, doors, windows);
                        console.log("\u2705 Detection complete: ".concat(walls.length, " walls (filtered from ").concat(allWalls.length, "), ").concat(doors.length, " doors, ").concat(windows.length, " windows"));
                        return [2 /*return*/, { walls: walls, doors: doors, windows: windows }];
                    case 5:
                        error_1 = _a.sent();
                        console.error('❌ Error detecting features:', error_1);
                        return [2 /*return*/, { walls: [], doors: [], windows: [] }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Filter walls to remove segments that are doors or windows
     */
    CanvasWallDetectorService.prototype.filterWalls = function (walls, doors, windows) {
        var _this = this;
        return walls.filter(function (wall) {
            var wallLength = _this.pointDistance(wall.start, wall.end);
            // Remove very short segments that might be noise
            if (wallLength < 50)
                return false;
            // Check if this wall segment overlaps with a door
            for (var _i = 0, doors_1 = doors; _i < doors_1.length; _i++) {
                var door = doors_1[_i];
                var distToStart = _this.pointToLineDistance(door.position, wall.start, wall.end);
                if (distToStart < door.width / 2) {
                    // This segment might be part of a door opening
                    var projectedPoint = _this.projectPointOntoLine(door.position, wall.start, wall.end);
                    var distAlongWall = _this.pointDistance(wall.start, projectedPoint);
                    if (distAlongWall > 10 && distAlongWall < wallLength - 10) {
                        // Door is in the middle of this wall, split the wall
                        return false; // Remove this wall, it will be split
                    }
                }
            }
            // Check if this wall segment overlaps with a window
            for (var _a = 0, windows_1 = windows; _a < windows_1.length; _a++) {
                var window_1 = windows_1[_a];
                var distToWindow = _this.pointToLineDistance(window_1.position, wall.start, wall.end);
                if (distToWindow < 10) {
                    // Window is on this wall, but don't remove the wall
                    // Windows don't break walls like doors do
                }
            }
            return true;
        });
    };
    /**
     * Calculate distance from point to line
     */
    CanvasWallDetectorService.prototype.pointToLineDistance = function (point, lineStart, lineEnd) {
        var A = point.x - lineStart.x;
        var B = point.y - lineStart.y;
        var C = lineEnd.x - lineStart.x;
        var D = lineEnd.y - lineStart.y;
        var dot = A * C + B * D;
        var lenSq = C * C + D * D;
        var param = -1;
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        var xx, yy;
        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        }
        else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        }
        else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }
        var dx = point.x - xx;
        var dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };
    /**
     * Project point onto line
     */
    CanvasWallDetectorService.prototype.projectPointOntoLine = function (point, lineStart, lineEnd) {
        var A = point.x - lineStart.x;
        var B = point.y - lineStart.y;
        var C = lineEnd.x - lineStart.x;
        var D = lineEnd.y - lineStart.y;
        var dot = A * C + B * D;
        var lenSq = C * C + D * D;
        var param = lenSq !== 0 ? dot / lenSq : 0;
        return {
            x: lineStart.x + param * C,
            y: lineStart.y + param * D
        };
    };
    /**
     * Detect walls using edge detection and Hough transform
     */
    CanvasWallDetectorService.prototype.detectWalls = function (imageData) {
        return __awaiter(this, void 0, void 0, function () {
            var walls, width, height, data, grayscale, i, gray, filledWalls, boldWalls, edges, lines, wallGroups, _loop_1, this_1, _i, wallGroups_1, group, _loop_2, _a, boldWalls_1, boldWall;
            var _this = this;
            return __generator(this, function (_b) {
                walls = [];
                width = imageData.width, height = imageData.height, data = imageData.data;
                grayscale = new Uint8Array(width * height);
                for (i = 0; i < data.length; i += 4) {
                    gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    grayscale[i / 4] = gray;
                }
                filledWalls = this.detectFilledWalls(imageData, grayscale);
                walls.push.apply(walls, filledWalls);
                boldWalls = this.detectBoldWalls(imageData, grayscale);
                edges = this.sobelEdgeDetection(grayscale, width, height);
                lines = this.houghTransform(edges, width, height);
                wallGroups = this.groupParallelLines(lines);
                _loop_1 = function (group) {
                    if (group.length >= 1) {
                        var wall_1 = this_1.createWallFromLines(group);
                        if (wall_1 && this_1.isRealWall(wall_1, imageData, grayscale)) {
                            // Check if this wall already exists from filled/bold detection
                            var exists = walls.some(function (w) {
                                return _this.wallsOverlap(w, wall_1);
                            });
                            if (!exists) {
                                walls.push(wall_1);
                            }
                        }
                    }
                };
                this_1 = this;
                // Create wall segments from groups
                for (_i = 0, wallGroups_1 = wallGroups; _i < wallGroups_1.length; _i++) {
                    group = wallGroups_1[_i];
                    _loop_1(group);
                }
                _loop_2 = function (boldWall) {
                    var exists = walls.some(function (w) { return _this.wallsOverlap(w, boldWall); });
                    if (!exists) {
                        walls.push(boldWall);
                    }
                };
                // Merge bold walls that aren't duplicates
                for (_a = 0, boldWalls_1 = boldWalls; _a < boldWalls_1.length; _a++) {
                    boldWall = boldWalls_1[_a];
                    _loop_2(boldWall);
                }
                return [2 /*return*/, walls];
            });
        });
    };
    /**
     * Detect walls with gray fill between parallel dark lines
     */
    CanvasWallDetectorService.prototype.detectFilledWalls = function (imageData, grayscale) {
        var walls = [];
        var width = imageData.width, height = imageData.height;
        // Scan for regions with gray fill (120-200) bounded by dark lines (<80)
        for (var y = 0; y < height; y += 10) {
            var inWall = false;
            var wallStart = -1;
            var grayPixels = 0;
            for (var x = 0; x < width; x++) {
                var gray = grayscale[y * width + x];
                if (gray < 80) {
                    // Dark pixel - potential wall boundary
                    if (!inWall && wallStart === -1) {
                        wallStart = x;
                        inWall = true;
                        grayPixels = 0;
                    }
                    else if (inWall && grayPixels > 5) {
                        // End of filled wall
                        var thickness = x - wallStart;
                        if (thickness > 8 && thickness < 40 && grayPixels > thickness * 0.6) {
                            // Found a filled wall segment
                            walls.push({
                                id: "wall_filled_".concat(walls.length),
                                start: { x: wallStart, y: y },
                                end: { x: x, y: y },
                                thickness: thickness,
                                type: thickness > 15 ? 'exterior' : 'interior',
                                confidence: 0.95
                            });
                        }
                        wallStart = x;
                        grayPixels = 0;
                    }
                }
                else if (gray > 120 && gray < 200 && inWall) {
                    // Gray fill between walls
                    grayPixels++;
                }
                else if (gray > 200) {
                    // White space - reset
                    if (inWall && grayPixels < 3) {
                        // Was just a single dark line, not a filled wall
                    }
                    inWall = false;
                    wallStart = -1;
                    grayPixels = 0;
                }
            }
        }
        // Similar scan for vertical walls
        for (var x = 0; x < width; x += 10) {
            var inWall = false;
            var wallStart = -1;
            var grayPixels = 0;
            for (var y = 0; y < height; y++) {
                var gray = grayscale[y * width + x];
                if (gray < 80) {
                    // Dark pixel - potential wall boundary
                    if (!inWall && wallStart === -1) {
                        wallStart = y;
                        inWall = true;
                        grayPixels = 0;
                    }
                    else if (inWall && grayPixels > 5) {
                        // End of filled wall
                        var thickness = y - wallStart;
                        if (thickness > 8 && thickness < 40 && grayPixels > thickness * 0.6) {
                            // Found a filled wall segment
                            walls.push({
                                id: "wall_filled_v_".concat(walls.length),
                                start: { x: x, y: wallStart },
                                end: { x: x, y: y },
                                thickness: thickness,
                                type: thickness > 15 ? 'exterior' : 'interior',
                                confidence: 0.95
                            });
                        }
                        wallStart = y;
                        grayPixels = 0;
                    }
                }
                else if (gray > 120 && gray < 200 && inWall) {
                    // Gray fill between walls
                    grayPixels++;
                }
                else if (gray > 200) {
                    // White space - reset
                    inWall = false;
                    wallStart = -1;
                    grayPixels = 0;
                }
            }
        }
        return walls;
    };
    /**
     * Detect bold/thick dark lines that are walls
     */
    CanvasWallDetectorService.prototype.detectBoldWalls = function (imageData, grayscale) {
        var walls = [];
        var width = imageData.width, height = imageData.height;
        // Scan for continuous thick dark lines
        // Horizontal scan
        for (var y = 5; y < height - 5; y += 8) {
            var lineStart = -1;
            var lineLength = 0;
            for (var x = 0; x < width; x++) {
                // Check thickness at this point
                var thickness = 0;
                for (var dy = -10; dy <= 10; dy++) {
                    if (y + dy >= 0 && y + dy < height) {
                        if (grayscale[(y + dy) * width + x] < 60) {
                            thickness++;
                        }
                    }
                }
                if (thickness >= 6) {
                    // Thick dark area
                    if (lineStart === -1) {
                        lineStart = x;
                        lineLength = 1;
                    }
                    else {
                        lineLength++;
                    }
                }
                else {
                    // End of thick line
                    if (lineStart !== -1 && lineLength > 50) {
                        walls.push({
                            id: "wall_bold_h_".concat(walls.length),
                            start: { x: lineStart, y: y },
                            end: { x: lineStart + lineLength, y: y },
                            thickness: thickness,
                            type: thickness > 10 ? 'exterior' : 'interior',
                            confidence: 0.9
                        });
                    }
                    lineStart = -1;
                    lineLength = 0;
                }
            }
        }
        // Vertical scan
        for (var x = 5; x < width - 5; x += 8) {
            var lineStart = -1;
            var lineLength = 0;
            for (var y = 0; y < height; y++) {
                // Check thickness at this point
                var thickness = 0;
                for (var dx = -10; dx <= 10; dx++) {
                    if (x + dx >= 0 && x + dx < width) {
                        if (grayscale[y * width + (x + dx)] < 60) {
                            thickness++;
                        }
                    }
                }
                if (thickness >= 6) {
                    // Thick dark area
                    if (lineStart === -1) {
                        lineStart = y;
                        lineLength = 1;
                    }
                    else {
                        lineLength++;
                    }
                }
                else {
                    // End of thick line
                    if (lineStart !== -1 && lineLength > 50) {
                        walls.push({
                            id: "wall_bold_v_".concat(walls.length),
                            start: { x: x, y: lineStart },
                            end: { x: x, y: lineStart + lineLength },
                            thickness: thickness,
                            type: thickness > 10 ? 'exterior' : 'interior',
                            confidence: 0.9
                        });
                    }
                    lineStart = -1;
                    lineLength = 0;
                }
            }
        }
        return walls;
    };
    /**
     * Check if detected line is a real wall based on darkness and thickness
     */
    CanvasWallDetectorService.prototype.isRealWall = function (wall, imageData, grayscale) {
        var width = imageData.width;
        // Sample points along the wall
        var samples = 20;
        var darkPixels = 0;
        var avgDarkness = 0;
        for (var i = 0; i < samples; i++) {
            var t = i / samples;
            var x = Math.round(wall.start.x + t * (wall.end.x - wall.start.x));
            var y = Math.round(wall.start.y + t * (wall.end.y - wall.start.y));
            if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
                var gray = grayscale[y * width + x];
                if (gray < 100) {
                    darkPixels++;
                    avgDarkness += gray;
                }
            }
        }
        // Wall should be consistently dark
        if (darkPixels < samples * 0.7)
            return false;
        // Average darkness should be very dark (bold lines)
        if (darkPixels > 0) {
            avgDarkness /= darkPixels;
            if (avgDarkness > 80)
                return false; // Not dark enough for a wall
        }
        // Check thickness is consistent with walls
        if (wall.thickness < 5)
            return false; // Too thin
        if (wall.thickness > 50)
            return false; // Too thick (might be a filled area)
        return true;
    };
    /**
     * Check if two walls overlap
     */
    CanvasWallDetectorService.prototype.wallsOverlap = function (wall1, wall2) {
        // Check if walls are parallel and close
        var angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
        var angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
        var angleDiff = Math.abs(angle1 - angle2);
        if (angleDiff > 0.2 && angleDiff < Math.PI - 0.2) {
            return false; // Not parallel
        }
        // Check if they overlap spatially
        var dist1 = this.pointToLineDistance(wall1.start, wall2.start, wall2.end);
        var dist2 = this.pointToLineDistance(wall1.end, wall2.start, wall2.end);
        return (dist1 < 20 && dist2 < 20);
    };
    /**
     * Sobel edge detection
     */
    CanvasWallDetectorService.prototype.sobelEdgeDetection = function (grayscale, width, height) {
        var edges = new Uint8Array(width * height);
        var sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        var sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        for (var y = 1; y < height - 1; y++) {
            for (var x = 1; x < width - 1; x++) {
                var gx = 0, gy = 0;
                for (var j = -1; j <= 1; j++) {
                    for (var i = -1; i <= 1; i++) {
                        var idx = (y + j) * width + (x + i);
                        var kernelIdx = (j + 1) * 3 + (i + 1);
                        gx += grayscale[idx] * sobelX[kernelIdx];
                        gy += grayscale[idx] * sobelY[kernelIdx];
                    }
                }
                var magnitude = Math.sqrt(gx * gx + gy * gy);
                edges[y * width + x] = magnitude > 150 ? 255 : 0; // Even higher threshold for walls only
            }
        }
        return edges;
    };
    /**
     * Simplified Hough transform for line detection with gap analysis
     */
    CanvasWallDetectorService.prototype.houghTransform = function (edges, width, height) {
        var lines = [];
        // Scan for horizontal lines with gap detection
        for (var y = 0; y < height; y += 5) {
            var lineStart = -1;
            var lineLength = 0;
            var gaps = [];
            var gapStart = -1;
            for (var x = 0; x < width; x++) {
                if (edges[y * width + x] > 0) {
                    if (lineStart === -1) {
                        lineStart = x;
                        lineLength = 1;
                    }
                    else {
                        lineLength++;
                        // Check if we're ending a gap
                        if (gapStart !== -1) {
                            var gapWidth = x - gapStart;
                            if (gapWidth > 15 && gapWidth < 80) { // Potential door/window gap
                                gaps.push({ start: gapStart, end: x });
                            }
                            gapStart = -1;
                        }
                    }
                }
                else {
                    // We're in empty space
                    if (lineStart !== -1 && gapStart === -1) {
                        gapStart = x; // Start tracking a gap
                    }
                    // Check if line segment is ending
                    if (lineStart !== -1 && x - (lineStart + lineLength) > 100) {
                        // Line has ended, save it if long enough
                        if (lineLength > 60) {
                            lines.push({
                                start: { x: lineStart, y: y },
                                end: { x: lineStart + lineLength, y: y },
                                angle: 0,
                                strength: lineLength,
                                gaps: gaps.length > 0 ? __spreadArray([], gaps, true) : undefined
                            });
                        }
                        lineStart = -1;
                        lineLength = 0;
                        gaps.length = 0;
                        gapStart = -1;
                    }
                }
            }
            // Save any remaining line
            if (lineStart !== -1 && lineLength > 60) {
                lines.push({
                    start: { x: lineStart, y: y },
                    end: { x: lineStart + lineLength, y: y },
                    angle: 0,
                    strength: lineLength,
                    gaps: gaps.length > 0 ? __spreadArray([], gaps, true) : undefined
                });
            }
        }
        // Scan for vertical lines with gap detection
        for (var x = 0; x < width; x += 5) {
            var lineStart = -1;
            var lineLength = 0;
            var gaps = [];
            var gapStart = -1;
            for (var y = 0; y < height; y++) {
                if (edges[y * width + x] > 0) {
                    if (lineStart === -1) {
                        lineStart = y;
                        lineLength = 1;
                    }
                    else {
                        lineLength++;
                        // Check if we're ending a gap
                        if (gapStart !== -1) {
                            var gapHeight = y - gapStart;
                            if (gapHeight > 15 && gapHeight < 80) { // Potential door/window gap
                                gaps.push({ start: gapStart, end: y });
                            }
                            gapStart = -1;
                        }
                    }
                }
                else {
                    // We're in empty space
                    if (lineStart !== -1 && gapStart === -1) {
                        gapStart = y; // Start tracking a gap
                    }
                    // Check if line segment is ending
                    if (lineStart !== -1 && y - (lineStart + lineLength) > 100) {
                        // Line has ended, save it if long enough
                        if (lineLength > 60) {
                            lines.push({
                                start: { x: x, y: lineStart },
                                end: { x: x, y: lineStart + lineLength },
                                angle: Math.PI / 2,
                                strength: lineLength,
                                gaps: gaps.length > 0 ? __spreadArray([], gaps, true) : undefined
                            });
                        }
                        lineStart = -1;
                        lineLength = 0;
                        gaps.length = 0;
                        gapStart = -1;
                    }
                }
            }
            // Save any remaining line
            if (lineStart !== -1 && lineLength > 60) {
                lines.push({
                    start: { x: x, y: lineStart },
                    end: { x: x, y: lineStart + lineLength },
                    angle: Math.PI / 2,
                    strength: lineLength,
                    gaps: gaps.length > 0 ? __spreadArray([], gaps, true) : undefined
                });
            }
        }
        return lines;
    };
    /**
     * Group parallel lines that might form walls
     */
    CanvasWallDetectorService.prototype.groupParallelLines = function (lines) {
        var groups = [];
        var used = new Set();
        // First, filter out lines that are too weak or have too many gaps
        var validLines = lines.filter(function (line) {
            // Strong continuous lines are more likely to be walls
            if (line.gaps && line.gaps.length > 2)
                return false; // Too many gaps, probably not a wall
            if (line.strength < 80)
                return false; // Too short/weak
            return true;
        });
        for (var i = 0; i < validLines.length; i++) {
            if (used.has(i))
                continue;
            var group = [validLines[i]];
            used.add(i);
            for (var j = i + 1; j < validLines.length; j++) {
                if (used.has(j))
                    continue;
                // Check if lines are parallel (similar angle)
                var angleDiff = Math.abs(validLines[i].angle - validLines[j].angle);
                if (angleDiff < 0.1 || angleDiff > Math.PI - 0.1) {
                    // Check if lines are close enough to be a wall
                    var distance = this.lineToLineDistance(validLines[i], validLines[j]);
                    if (distance < 30 && distance > 3) { // Wall thickness typically 3-30 pixels
                        // Additional check: lines should overlap in their primary direction
                        if (this.linesOverlap(validLines[i], validLines[j])) {
                            group.push(validLines[j]);
                            used.add(j);
                        }
                    }
                }
            }
            // Only keep groups that form substantial walls
            if (group.length >= 1 && this.calculateGroupStrength(group) > 100) {
                groups.push(group);
            }
        }
        return groups;
    };
    /**
     * Check if two lines overlap in their primary direction
     */
    CanvasWallDetectorService.prototype.linesOverlap = function (line1, line2) {
        if (Math.abs(line1.angle) < Math.PI / 4) {
            // Horizontal lines - check x overlap
            var x1Min = Math.min(line1.start.x, line1.end.x);
            var x1Max = Math.max(line1.start.x, line1.end.x);
            var x2Min = Math.min(line2.start.x, line2.end.x);
            var x2Max = Math.max(line2.start.x, line2.end.x);
            return !(x1Max < x2Min || x2Max < x1Min);
        }
        else {
            // Vertical lines - check y overlap
            var y1Min = Math.min(line1.start.y, line1.end.y);
            var y1Max = Math.max(line1.start.y, line1.end.y);
            var y2Min = Math.min(line2.start.y, line2.end.y);
            var y2Max = Math.max(line2.start.y, line2.end.y);
            return !(y1Max < y2Min || y2Max < y1Min);
        }
    };
    /**
     * Calculate total strength of a group of lines
     */
    CanvasWallDetectorService.prototype.calculateGroupStrength = function (group) {
        return group.reduce(function (sum, line) { return sum + line.strength; }, 0) / group.length;
    };
    /**
     * Calculate distance between two lines
     */
    CanvasWallDetectorService.prototype.lineToLineDistance = function (line1, line2) {
        // Simplified: use distance between start points
        var dx = line1.start.x - line2.start.x;
        var dy = line1.start.y - line2.start.y;
        return Math.sqrt(dx * dx + dy * dy);
    };
    /**
     * Create a wall segment from grouped lines
     */
    CanvasWallDetectorService.prototype.createWallFromLines = function (lines) {
        if (lines.length === 0)
            return null;
        // Use the longest line as the main wall
        var mainLine = lines.reduce(function (max, line) {
            return line.strength > max.strength ? line : max;
        }, lines[0]);
        // Calculate wall thickness from parallel lines
        var thickness = lines.length > 1
            ? this.lineToLineDistance(lines[0], lines[lines.length - 1])
            : 6; // Default thickness
        return {
            id: "wall_".concat(Math.random().toString(36).substr(2, 9)),
            start: mainLine.start,
            end: mainLine.end,
            thickness: thickness,
            type: thickness > 10 ? 'exterior' : 'interior',
            confidence: Math.min(mainLine.strength / 100, 0.95)
        };
    };
    /**
     * Detect doors from wall gaps and arc patterns
     */
    CanvasWallDetectorService.prototype.detectDoors = function (walls, imageData) {
        return __awaiter(this, void 0, void 0, function () {
            var doors, width, height, data, i, j, gap, hasArc, arcDoors, _loop_3, _i, arcDoors_1, arcDoor;
            return __generator(this, function (_a) {
                doors = [];
                width = imageData.width, height = imageData.height, data = imageData.data;
                // Method 1: Look for gaps between aligned walls
                for (i = 0; i < walls.length; i++) {
                    for (j = i + 1; j < walls.length; j++) {
                        gap = this.findWallGap(walls[i], walls[j]);
                        if (gap && gap.width > 25 && gap.width < 50) { // Typical door width
                            hasArc = this.checkForDoorArc(gap.center, gap.width, imageData);
                            doors.push({
                                id: "door_".concat(doors.length + 1),
                                position: gap.center,
                                width: gap.width,
                                orientation: gap.orientation,
                                confidence: hasArc ? 0.9 : 0.7
                            });
                        }
                    }
                }
                arcDoors = this.detectDoorArcs(imageData);
                _loop_3 = function (arcDoor) {
                    // Check if we already detected this door
                    var exists = doors.some(function (d) {
                        return Math.abs(d.position.x - arcDoor.position.x) < 30 &&
                            Math.abs(d.position.y - arcDoor.position.y) < 30;
                    });
                    if (!exists) {
                        doors.push(arcDoor);
                    }
                };
                for (_i = 0, arcDoors_1 = arcDoors; _i < arcDoors_1.length; _i++) {
                    arcDoor = arcDoors_1[_i];
                    _loop_3(arcDoor);
                }
                return [2 /*return*/, doors];
            });
        });
    };
    /**
     * Check for door arc pattern at a position
     */
    CanvasWallDetectorService.prototype.checkForDoorArc = function (center, width, imageData) {
        var data = imageData.data, imgWidth = imageData.width;
        var radius = width * 0.8;
        var arcPixels = 0;
        var totalChecked = 0;
        // Sample points along a quarter circle arc
        for (var angle = 0; angle < Math.PI / 2; angle += 0.1) {
            var x = Math.round(center.x + radius * Math.cos(angle));
            var y = Math.round(center.y + radius * Math.sin(angle));
            if (x >= 0 && x < imgWidth && y >= 0 && y < imageData.height) {
                var idx = (y * imgWidth + x) * 4;
                var gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (gray < 100)
                    arcPixels++; // Dark pixel (potential arc)
                totalChecked++;
            }
        }
        return totalChecked > 0 && (arcPixels / totalChecked) > 0.3;
    };
    /**
     * Detect door arcs in the image
     */
    CanvasWallDetectorService.prototype.detectDoorArcs = function (imageData) {
        var doors = [];
        var width = imageData.width, height = imageData.height;
        // Simplified arc detection - scan for quarter circle patterns
        // In a real implementation, this would use more sophisticated pattern matching
        return doors;
    };
    /**
     * Find gap between two walls
     */
    CanvasWallDetectorService.prototype.findWallGap = function (wall1, wall2) {
        // Check if walls are aligned
        var angle1 = Math.atan2(wall1.end.y - wall1.start.y, wall1.end.x - wall1.start.x);
        var angle2 = Math.atan2(wall2.end.y - wall2.start.y, wall2.end.x - wall2.start.x);
        if (Math.abs(angle1 - angle2) > 0.1)
            return null;
        // Calculate gap
        var dist1 = this.pointDistance(wall1.end, wall2.start);
        var dist2 = this.pointDistance(wall1.start, wall2.end);
        var minDist = Math.min(dist1, dist2);
        if (minDist < 20 || minDist > 60)
            return null;
        var center = {
            x: (wall1.end.x + wall2.start.x) / 2,
            y: (wall1.end.y + wall2.start.y) / 2
        };
        return {
            center: center,
            width: minDist,
            orientation: Math.abs(angle1) < Math.PI / 4 ? 'horizontal' : 'vertical'
        };
    };
    /**
     * Calculate distance between two points
     */
    CanvasWallDetectorService.prototype.pointDistance = function (p1, p2) {
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    };
    /**
     * Detect windows from wall patterns and double lines
     */
    CanvasWallDetectorService.prototype.detectWindows = function (walls, imageData) {
        return __awaiter(this, void 0, void 0, function () {
            var windows, width, height, data, _i, walls_1, wall, wallVector, wallLength, wallNormal, numChecks, _loop_4, this_2, out_i_1, i;
            return __generator(this, function (_a) {
                windows = [];
                width = imageData.width, height = imageData.height, data = imageData.data;
                for (_i = 0, walls_1 = walls; _i < walls_1.length; _i++) {
                    wall = walls_1[_i];
                    // Windows are typically in exterior walls (thicker)
                    if (wall.thickness > 8) {
                        wallVector = {
                            x: wall.end.x - wall.start.x,
                            y: wall.end.y - wall.start.y
                        };
                        wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
                        wallNormal = {
                            x: -wallVector.y / wallLength,
                            y: wallVector.x / wallLength
                        };
                        numChecks = Math.floor(wallLength / 20);
                        _loop_4 = function (i) {
                            var t = i / numChecks;
                            var checkPoint = {
                                x: wall.start.x + t * wallVector.x,
                                y: wall.start.y + t * wallVector.y
                            };
                            // Look for double parallel lines (window frame pattern)
                            if (this_2.checkForWindowPattern(checkPoint, wallNormal, imageData)) {
                                // Found potential window
                                var windowWidth = this_2.measureWindowWidth(checkPoint, wallVector, imageData);
                                if (windowWidth > 20 && windowWidth < 60) {
                                    // Check if we already have a window nearby
                                    var exists = windows.some(function (w) {
                                        return Math.abs(w.position.x - checkPoint.x) < 30 &&
                                            Math.abs(w.position.y - checkPoint.y) < 30;
                                    });
                                    if (!exists) {
                                        windows.push({
                                            id: "window_".concat(windows.length + 1),
                                            position: checkPoint,
                                            width: windowWidth,
                                            height: windowWidth * 1.2, // Windows are usually taller than wide
                                            confidence: 0.75
                                        });
                                        // Skip ahead to avoid duplicate detections
                                        i += Math.floor(windowWidth / 20);
                                    }
                                }
                            }
                            out_i_1 = i;
                        };
                        this_2 = this;
                        for (i = 0; i < numChecks; i++) {
                            _loop_4(i);
                            i = out_i_1;
                        }
                    }
                }
                return [2 /*return*/, windows];
            });
        });
    };
    /**
     * Check for window pattern (double lines)
     */
    CanvasWallDetectorService.prototype.checkForWindowPattern = function (point, normal, imageData) {
        var data = imageData.data, width = imageData.width;
        // Check for parallel lines perpendicular to wall
        var line1Found = false;
        var line2Found = false;
        for (var offset = -15; offset <= 15; offset++) {
            var x = Math.round(point.x + normal.x * offset);
            var y = Math.round(point.y + normal.y * offset);
            if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
                var idx = (y * width + x) * 4;
                var gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (gray < 100) { // Dark pixel
                    if (!line1Found) {
                        line1Found = true;
                    }
                    else if (Math.abs(offset) > 5) {
                        line2Found = true;
                    }
                }
            }
        }
        return line1Found && line2Found;
    };
    /**
     * Measure window width
     */
    CanvasWallDetectorService.prototype.measureWindowWidth = function (center, wallVector, imageData) {
        var data = imageData.data, width = imageData.width;
        var wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
        var unitVector = { x: wallVector.x / wallLength, y: wallVector.y / wallLength };
        var leftEdge = 0;
        var rightEdge = 0;
        // Find left edge
        for (var offset = 0; offset < 50; offset++) {
            var x = Math.round(center.x - unitVector.x * offset);
            var y = Math.round(center.y - unitVector.y * offset);
            if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
                var idx = (y * width + x) * 4;
                var gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (gray < 100) {
                    leftEdge = offset;
                    break;
                }
            }
        }
        // Find right edge
        for (var offset = 0; offset < 50; offset++) {
            var x = Math.round(center.x + unitVector.x * offset);
            var y = Math.round(center.y + unitVector.y * offset);
            if (x >= 0 && x < width && y >= 0 && y < imageData.height) {
                var idx = (y * width + x) * 4;
                var gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                if (gray < 100) {
                    rightEdge = offset;
                    break;
                }
            }
        }
        return leftEdge + rightEdge;
    };
    return CanvasWallDetectorService;
}());
exports.CanvasWallDetectorService = CanvasWallDetectorService;
exports.default = CanvasWallDetectorService;
