"use strict";
// ========================================
// YOLO OBJECT DETECTION SERVICE - yolo.service.ts
// Detects fixtures, furniture, and architectural elements in floor plans
// ========================================
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.yoloService = exports.YOLOService = void 0;
var sharp = require("sharp");
var tf = require("@tensorflow/tfjs-node");
// Class labels for floor plan objects
var FLOOR_PLAN_CLASSES = {
    // Bathroom fixtures
    0: 'toilet',
    1: 'sink',
    2: 'bathtub',
    3: 'shower',
    4: 'bidet',
    // Kitchen fixtures
    5: 'kitchen_sink',
    6: 'kitchen_island',
    7: 'kitchen_counter',
    // Appliances
    8: 'refrigerator',
    9: 'stove',
    10: 'oven',
    11: 'microwave',
    12: 'dishwasher',
    13: 'washer',
    14: 'dryer',
    // Furniture
    15: 'bed',
    16: 'sofa',
    17: 'chair',
    18: 'dining_table',
    19: 'desk',
    20: 'cabinet',
    21: 'dresser',
    22: 'nightstand',
    23: 'bookshelf',
    24: 'wardrobe',
    // Architectural elements
    25: 'door',
    26: 'window',
    27: 'stairs',
    28: 'elevator',
    29: 'fireplace',
    30: 'column',
    // HVAC
    31: 'hvac_unit',
    32: 'radiator',
    33: 'ceiling_fan',
    // Other
    34: 'water_heater',
    35: 'electrical_panel',
    36: 'closet',
    37: 'pantry'
};
var YOLOService = /** @class */ (function () {
    function YOLOService(modelPath) {
        this.model = null;
        this.isInitialized = false;
        this.inputSize = 640; // YOLO input size
        this.confidenceThreshold = 0.5;
        this.iouThreshold = 0.45;
        // Use custom model path or default to pre-trained model
        this._modelPath = modelPath || 'https://tfhub.dev/tensorflow/tfjs-model/yolov5/1';
    }
    /**
     * Initialize YOLO model
     */
    YOLOService.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.isInitialized)
                            return [2 /*return*/];
                        console.log('🚀 Initializing YOLO object detection model...');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        // For production, you would load a custom-trained YOLO model
                        // This is a placeholder for the actual model loading
                        _a = this;
                        return [4 /*yield*/, this.loadCustomModel()];
                    case 2:
                        // For production, you would load a custom-trained YOLO model
                        // This is a placeholder for the actual model loading
                        _a.model = _b.sent();
                        this.isInitialized = true;
                        console.log('✅ YOLO model initialized successfully');
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        console.error('❌ Failed to initialize YOLO model:', error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Load custom YOLO model trained on floor plan objects
     */
    YOLOService.prototype.loadCustomModel = function () {
        return __awaiter(this, void 0, void 0, function () {
            var model;
            return __generator(this, function (_a) {
                model = tf.sequential({
                    layers: [
                        tf.layers.conv2d({
                            inputShape: [this.inputSize, this.inputSize, 3],
                            filters: 32,
                            kernelSize: 3,
                            activation: 'relu'
                        }),
                        tf.layers.maxPooling2d({ poolSize: 2 }),
                        tf.layers.conv2d({
                            filters: 64,
                            kernelSize: 3,
                            activation: 'relu'
                        }),
                        tf.layers.maxPooling2d({ poolSize: 2 }),
                        tf.layers.flatten(),
                        tf.layers.dense({
                            units: 128,
                            activation: 'relu'
                        }),
                        tf.layers.dense({
                            units: Object.keys(FLOOR_PLAN_CLASSES).length * 5, // classes * (x, y, w, h, confidence)
                            activation: 'sigmoid'
                        })
                    ]
                });
                return [2 /*return*/, model];
            });
        });
    };
    /**
     * Detect objects in floor plan image
     */
    YOLOService.prototype.detectObjects = function (imageBuffer_1) {
        return __awaiter(this, arguments, void 0, function (imageBuffer, options) {
            var startTime, confidence, iou, maxDetections, metadata, originalWidth, originalHeight, preprocessed, predictions, detections, filteredDetections, result, error_2;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        if (!!this.isInitialized) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        confidence = options.confidenceThreshold || this.confidenceThreshold;
                        iou = options.iouThreshold || this.iouThreshold;
                        maxDetections = options.maxDetections || 100;
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 8, , 9]);
                        return [4 /*yield*/, sharp(imageBuffer).metadata()];
                    case 4:
                        metadata = _a.sent();
                        originalWidth = metadata.width || 0;
                        originalHeight = metadata.height || 0;
                        // Preprocess image for YOLO
                        console.log('🔧 Preprocessing image for YOLO...');
                        return [4 /*yield*/, this.preprocessImage(imageBuffer)];
                    case 5:
                        preprocessed = _a.sent();
                        // Run detection
                        console.log('🎯 Running object detection...');
                        return [4 /*yield*/, this.runInference(preprocessed)];
                    case 6:
                        predictions = _a.sent();
                        return [4 /*yield*/, this.postProcess(predictions, originalWidth, originalHeight, confidence, iou, maxDetections)];
                    case 7:
                        detections = _a.sent();
                        filteredDetections = detections;
                        if (options.targetClasses && options.targetClasses.length > 0) {
                            filteredDetections = detections.filter(function (d) {
                                return options.targetClasses.includes(d.class);
                            });
                        }
                        result = this.categorizeDetections(filteredDetections);
                        return [2 /*return*/, __assign(__assign({}, result), { metadata: {
                                    processingTime: Date.now() - startTime,
                                    imageSize: { width: originalWidth, height: originalHeight },
                                    modelVersion: '1.0.0',
                                    totalObjects: filteredDetections.length
                                } })];
                    case 8:
                        error_2 = _a.sent();
                        console.error('❌ Object detection failed:', error_2);
                        throw error_2;
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Preprocess image for YOLO input
     */
    YOLOService.prototype.preprocessImage = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var resized, tensor, normalized;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, sharp)(imageBuffer)
                            .resize(this.inputSize, this.inputSize, {
                            fit: 'fill',
                            kernel: sharp.kernel.lanczos3
                        })
                            .raw()
                            .toBuffer()];
                    case 1:
                        resized = _a.sent();
                        tensor = tf.node.decodeImage(resized, 3);
                        normalized = tensor.div(255.0);
                        return [2 /*return*/, normalized];
                }
            });
        });
    };
    /**
     * Run inference on preprocessed image
     */
    YOLOService.prototype.runInference = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var batched, predictions;
            return __generator(this, function (_a) {
                if (!this.model) {
                    throw new Error('Model not initialized');
                }
                batched = input.expandDims(0);
                predictions = this.model.predict(batched);
                // Clean up
                batched.dispose();
                return [2 /*return*/, predictions];
            });
        });
    };
    /**
     * Post-process YOLO predictions
     */
    YOLOService.prototype.postProcess = function (predictions, originalWidth, originalHeight, confidenceThreshold, iouThreshold, maxDetections) {
        return __awaiter(this, void 0, void 0, function () {
            var detections, data, i, confidence, classId, className, x, y, width, height, nmsDetections;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        detections = [];
                        return [4 /*yield*/, predictions.array()];
                    case 1:
                        data = _a.sent();
                        // Parse predictions (simplified)
                        for (i = 0; i < data[0].length; i += 5) {
                            confidence = data[0][i + 4];
                            if (confidence > confidenceThreshold) {
                                classId = Math.floor(i / 5) % Object.keys(FLOOR_PLAN_CLASSES).length;
                                className = FLOOR_PLAN_CLASSES[classId];
                                x = data[0][i] * originalWidth;
                                y = data[0][i + 1] * originalHeight;
                                width = data[0][i + 2] * originalWidth;
                                height = data[0][i + 3] * originalHeight;
                                detections.push({
                                    id: "obj_".concat(Math.random().toString(36).substring(2, 11)),
                                    class: className,
                                    label: this.formatLabel(className),
                                    confidence: confidence,
                                    bbox: {
                                        x: x - width / 2,
                                        y: y - height / 2,
                                        width: width,
                                        height: height
                                    },
                                    center: { x: x, y: y },
                                    polygon: this.bboxToPolygon(x - width / 2, y - height / 2, width, height)
                                });
                            }
                        }
                        return [4 /*yield*/, this.nonMaxSuppression(detections, iouThreshold, maxDetections)];
                    case 2:
                        nmsDetections = _a.sent();
                        // Clean up
                        predictions.dispose();
                        return [2 /*return*/, nmsDetections];
                }
            });
        });
    };
    /**
     * Non-Maximum Suppression to remove overlapping detections
     */
    YOLOService.prototype.nonMaxSuppression = function (detections, iouThreshold, maxDetections) {
        return __awaiter(this, void 0, void 0, function () {
            var selected, used, i, current, j, iou;
            return __generator(this, function (_a) {
                // Sort by confidence
                detections.sort(function (a, b) { return b.confidence - a.confidence; });
                selected = [];
                used = new Set();
                for (i = 0; i < detections.length && selected.length < maxDetections; i++) {
                    if (used.has(i))
                        continue;
                    current = detections[i];
                    selected.push(current);
                    used.add(i);
                    // Suppress overlapping detections
                    for (j = i + 1; j < detections.length; j++) {
                        if (used.has(j))
                            continue;
                        iou = this.calculateIOU(current.bbox, detections[j].bbox);
                        if (iou > iouThreshold && current.class === detections[j].class) {
                            used.add(j);
                        }
                    }
                }
                return [2 /*return*/, selected];
            });
        });
    };
    /**
     * Calculate Intersection over Union
     */
    YOLOService.prototype.calculateIOU = function (box1, box2) {
        var x1 = Math.max(box1.x, box2.x);
        var y1 = Math.max(box1.y, box2.y);
        var x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        var y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
        if (x2 < x1 || y2 < y1) {
            return 0;
        }
        var intersection = (x2 - x1) * (y2 - y1);
        var area1 = box1.width * box1.height;
        var area2 = box2.width * box2.height;
        var union = area1 + area2 - intersection;
        return intersection / union;
    };
    /**
     * Categorize detected objects
     */
    YOLOService.prototype.categorizeDetections = function (detections) {
        var fixtures = [];
        var furniture = [];
        var appliances = [];
        for (var _i = 0, detections_1 = detections; _i < detections_1.length; _i++) {
            var detection = detections_1[_i];
            // Categorize based on class
            if (this.isFixture(detection.class)) {
                fixtures.push(__assign(__assign({}, detection), { fixtureType: detection.class, material: this.estimateMaterial(detection.class), brand: this.estimateBrand(detection.class) }));
            }
            else if (this.isFurniture(detection.class)) {
                furniture.push(__assign(__assign({}, detection), { furnitureType: detection.class, dimensions: this.estimateDimensions(detection.bbox), material: this.estimateMaterial(detection.class), color: this.estimateColor(detection.class) }));
            }
            else if (this.isAppliance(detection.class)) {
                appliances.push(__assign(__assign({}, detection), { applianceType: detection.class, energyRating: this.estimateEnergyRating(detection.class), brand: this.estimateBrand(detection.class) }));
            }
        }
        return {
            objects: detections,
            fixtures: fixtures,
            furniture: furniture,
            appliances: appliances
        };
    };
    /**
     * Track objects across multiple frames (for video processing)
     */
    YOLOService.prototype.trackObjects = function (videoFrames_1) {
        return __awaiter(this, arguments, void 0, function (videoFrames, options) {
            var results, tracks, previousDetections, frameIdx, detection;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        results = [];
                        tracks = new Map();
                        previousDetections = [];
                        frameIdx = 0;
                        _a.label = 1;
                    case 1:
                        if (!(frameIdx < videoFrames.length)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.detectObjects(videoFrames[frameIdx])];
                    case 2:
                        detection = _a.sent();
                        // Match with previous frame
                        if (frameIdx > 0) {
                            this.matchDetections(previousDetections, detection.objects, tracks, options.trackingMethod || 'iou', options.maxDistance || 50);
                        }
                        results.push({
                            frame: frameIdx,
                            detections: detection.objects,
                            tracks: new Map(tracks)
                        });
                        previousDetections = detection.objects;
                        _a.label = 3;
                    case 3:
                        frameIdx++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Match detections between frames for tracking
     */
    YOLOService.prototype.matchDetections = function (previous, current, tracks, method, maxDistance) {
        var matched = new Set();
        for (var _i = 0, previous_1 = previous; _i < previous_1.length; _i++) {
            var prevObj = previous_1[_i];
            var bestMatch = null;
            var bestScore = 0;
            for (var i = 0; i < current.length; i++) {
                if (matched.has(i))
                    continue;
                var currObj = current[i];
                // Must be same class
                if (prevObj.class !== currObj.class)
                    continue;
                var score = 0;
                if (method === 'iou') {
                    score = this.calculateIOU(prevObj.bbox, currObj.bbox);
                }
                else if (method === 'centroid') {
                    var distance = Math.sqrt(Math.pow(prevObj.center.x - currObj.center.x, 2) +
                        Math.pow(prevObj.center.y - currObj.center.y, 2));
                    score = distance < maxDistance ? 1 - (distance / maxDistance) : 0;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = currObj;
                }
            }
            if (bestMatch && bestScore > 0.3) {
                // Continue track
                var trackId = prevObj.id;
                if (!tracks.has(trackId)) {
                    tracks.set(trackId, [prevObj.id]);
                }
                tracks.get(trackId).push(bestMatch.id);
                matched.add(current.indexOf(bestMatch));
            }
        }
        // Create new tracks for unmatched detections
        for (var i = 0; i < current.length; i++) {
            if (!matched.has(i)) {
                tracks.set(current[i].id, [current[i].id]);
            }
        }
    };
    /**
     * Detect specific object types
     */
    YOLOService.prototype.detectFixtures = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.detectObjects(imageBuffer, {
                            targetClasses: ['toilet', 'sink', 'bathtub', 'shower', 'bidet', 'faucet']
                        })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.fixtures];
                }
            });
        });
    };
    YOLOService.prototype.detectFurniture = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.detectObjects(imageBuffer, {
                            targetClasses: ['bed', 'sofa', 'chair', 'table', 'desk', 'cabinet', 'dresser']
                        })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.furniture];
                }
            });
        });
    };
    YOLOService.prototype.detectAppliances = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.detectObjects(imageBuffer, {
                            targetClasses: ['refrigerator', 'stove', 'oven', 'microwave', 'dishwasher', 'washer', 'dryer']
                        })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.appliances];
                }
            });
        });
    };
    /**
     * Generate object segmentation masks
     */
    YOLOService.prototype.generateSegmentationMask = function (imageBuffer, detections) {
        return __awaiter(this, void 0, void 0, function () {
            var metadata, width, height, maskData, _i, detections_2, detection, color, bbox, y, x, idx, mask;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, sharp)(imageBuffer).metadata()];
                    case 1:
                        metadata = _a.sent();
                        width = metadata.width || 0;
                        height = metadata.height || 0;
                        maskData = Buffer.alloc(width * height * 4);
                        // Draw each detection on mask
                        for (_i = 0, detections_2 = detections; _i < detections_2.length; _i++) {
                            detection = detections_2[_i];
                            color = this.getClassColor(detection.class);
                            bbox = detection.bbox;
                            for (y = Math.floor(bbox.y); y < bbox.y + bbox.height && y < height; y++) {
                                for (x = Math.floor(bbox.x); x < bbox.x + bbox.width && x < width; x++) {
                                    idx = (y * width + x) * 4;
                                    maskData[idx] = color.r;
                                    maskData[idx + 1] = color.g;
                                    maskData[idx + 2] = color.b;
                                    maskData[idx + 3] = Math.floor(detection.confidence * 255);
                                }
                            }
                        }
                        return [4 /*yield*/, (0, sharp)(maskData, {
                                raw: {
                                    width: width,
                                    height: height,
                                    channels: 4
                                }
                            }).png().toBuffer()];
                    case 2:
                        mask = _a.sent();
                        return [2 /*return*/, mask];
                }
            });
        });
    };
    /**
     * Helper methods
     */
    YOLOService.prototype.bboxToPolygon = function (x, y, width, height) {
        return [
            { x: x, y: y },
            { x: x + width, y: y },
            { x: x + width, y: y + height },
            { x: x, y: y + height }
        ];
    };
    YOLOService.prototype.formatLabel = function (className) {
        return className
            .replace(/_/g, ' ')
            .replace(/\b\w/g, function (l) { return l.toUpperCase(); });
    };
    YOLOService.prototype.isFixture = function (className) {
        var fixtureClasses = ['toilet', 'sink', 'bathtub', 'shower', 'bidet', 'faucet', 'drain', 'kitchen_sink'];
        return fixtureClasses.includes(className);
    };
    YOLOService.prototype.isFurniture = function (className) {
        var furnitureClasses = ['bed', 'sofa', 'chair', 'dining_table', 'desk', 'cabinet', 'dresser', 'nightstand', 'bookshelf', 'wardrobe'];
        return furnitureClasses.includes(className);
    };
    YOLOService.prototype.isAppliance = function (className) {
        var applianceClasses = ['refrigerator', 'stove', 'oven', 'microwave', 'dishwasher', 'washer', 'dryer', 'water_heater', 'hvac_unit'];
        return applianceClasses.includes(className);
    };
    YOLOService.prototype.estimateMaterial = function (className) {
        var materials = {
            'toilet': 'porcelain',
            'sink': 'porcelain',
            'bathtub': 'acrylic',
            'bed': 'wood',
            'sofa': 'fabric',
            'chair': 'wood',
            'refrigerator': 'stainless steel'
        };
        return materials[className] || 'unknown';
    };
    YOLOService.prototype.estimateBrand = function (_className) {
        // In production, this could use additional ML models
        return 'generic';
    };
    YOLOService.prototype.estimateDimensions = function (bbox) {
        // Estimate 3D dimensions from 2D bbox (simplified)
        return {
            width: bbox.width,
            height: bbox.height,
            depth: bbox.width * 0.6 // Rough estimate
        };
    };
    YOLOService.prototype.estimateColor = function (_className) {
        // Could use color detection on the actual image region
        return 'unknown';
    };
    YOLOService.prototype.estimateEnergyRating = function (_className) {
        // Could be determined by model detection
        return 'A+';
    };
    YOLOService.prototype.getClassColor = function (className) {
        var colors = {
            'toilet': { r: 255, g: 255, b: 255 },
            'sink': { r: 200, g: 200, b: 255 },
            'bed': { r: 139, g: 69, b: 19 },
            'sofa': { r: 128, g: 128, b: 128 },
            'refrigerator': { r: 192, g: 192, b: 192 },
            'door': { r: 165, g: 42, b: 42 },
            'window': { r: 135, g: 206, b: 235 }
        };
        return colors[className] || { r: 128, g: 128, b: 128 };
    };
    /**
     * Clean up resources
     */
    YOLOService.prototype.cleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.model) {
                    this.model.dispose();
                    this.model = null;
                }
                this.isInitialized = false;
                console.log('✅ YOLO service cleaned up');
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get service statistics
     */
    YOLOService.prototype.getStats = function () {
        return {
            initialized: this.isInitialized,
            modelLoaded: this.model !== null,
            inputSize: this.inputSize,
            classCount: Object.keys(FLOOR_PLAN_CLASSES).length,
            confidenceThreshold: this.confidenceThreshold,
            iouThreshold: this.iouThreshold
        };
    };
    return YOLOService;
}());
exports.YOLOService = YOLOService;
// Export singleton instance
exports.yoloService = new YOLOService();
