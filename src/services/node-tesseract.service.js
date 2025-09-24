"use strict";
/**
 * Node.js Compatible Tesseract Service
 * Uses tesseract.js in a Node.js environment without browser dependencies
 */
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
exports.NodeTesseractService = void 0;
var Tesseract = require("tesseract.js");
var sharp = require("sharp");
var fs = require("fs");
var NodeTesseractService = /** @class */ (function () {
    function NodeTesseractService() {
        this.isInitialized = false;
        console.log('📝 Node Tesseract Service initialized');
    }
    /**
     * Process image with OCR
     */
    NodeTesseractService.prototype.processImage = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var tempPath, processedBuffer, result, ocrResult, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        console.log('🔍 Starting OCR processing...');
                        tempPath = "/tmp/ocr_".concat(Date.now(), ".png");
                        return [4 /*yield*/, this.preprocessImage(imageBuffer)];
                    case 1:
                        processedBuffer = _a.sent();
                        fs.writeFileSync(tempPath, processedBuffer);
                        return [4 /*yield*/, Tesseract.recognize(tempPath, 'eng', {
                                logger: function (m) {
                                    if (m.status === 'recognizing text') {
                                        console.log("   OCR Progress: ".concat(Math.round((m.progress || 0) * 100), "%"));
                                    }
                                }
                            })];
                    case 2:
                        result = _a.sent();
                        // Clean up temp file
                        try {
                            fs.unlinkSync(tempPath);
                        }
                        catch (e) {
                            console.error('Error deleting temp file:', e);
                        }
                        ocrResult = this.parseResults(result.data);
                        console.log("\u2705 OCR complete: ".concat(ocrResult.words.length, " words found"));
                        return [2 /*return*/, ocrResult];
                    case 3:
                        error_1 = _a.sent();
                        console.error('❌ OCR processing error:', error_1);
                        return [2 /*return*/, {
                                text: '',
                                confidence: 0,
                                words: [],
                                parsedData: {
                                    rooms: [],
                                    dimensions: []
                                }
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Preprocess image for better OCR
     */
    NodeTesseractService.prototype.preprocessImage = function (buffer) {
        return __awaiter(this, void 0, void 0, function () {
            var processed, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, sharp(buffer)
                                .grayscale() // Convert to grayscale
                                .normalize() // Enhance contrast
                                .sharpen() // Sharpen text
                                .threshold(128) // Binary threshold for cleaner text
                                .toBuffer()];
                    case 1:
                        processed = _a.sent();
                        return [2 /*return*/, processed];
                    case 2:
                        error_2 = _a.sent();
                        console.error('Image preprocessing error:', error_2);
                        return [2 /*return*/, buffer];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Parse Tesseract results
     */
    NodeTesseractService.prototype.parseResults = function (data) {
        var _this = this;
        var words = [];
        var rooms = [];
        var dimensions = [];
        // Extract words with bounding boxes
        if (data.words) {
            data.words.forEach(function (word) {
                if (word.text && word.confidence > 30) { // Filter low confidence
                    words.push({
                        text: word.text,
                        confidence: word.confidence,
                        bbox: {
                            x0: word.bbox.x0,
                            y0: word.bbox.y0,
                            x1: word.bbox.x1,
                            y1: word.bbox.y1
                        }
                    });
                    // Detect room labels
                    if (_this.isRoomLabel(word.text)) {
                        rooms.push({
                            text: word.text,
                            bbox: word.bbox
                        });
                    }
                    // Detect dimensions
                    var dimension = _this.extractDimension(word.text);
                    if (dimension) {
                        dimensions.push(__assign(__assign({}, dimension), { x: word.bbox.x0, y: word.bbox.y0 }));
                    }
                }
            });
        }
        return {
            text: data.text || '',
            confidence: data.confidence || 0,
            words: words,
            parsedData: {
                rooms: rooms,
                dimensions: dimensions
            }
        };
    };
    /**
     * Check if text is a room label
     */
    NodeTesseractService.prototype.isRoomLabel = function (text) {
        var roomKeywords = [
            'bedroom', 'bed', 'br',
            'bathroom', 'bath', 'ba',
            'kitchen', 'kit',
            'living', 'lounge',
            'dining', 'din',
            'office', 'study',
            'garage', 'gar',
            'closet', 'storage', 'stor',
            'hallway', 'hall',
            'foyer', 'entry',
            'laundry', 'utility'
        ];
        var lower = text.toLowerCase().trim();
        return roomKeywords.some(function (keyword) { return lower.includes(keyword); });
    };
    /**
     * Extract dimension from text
     */
    NodeTesseractService.prototype.extractDimension = function (text) {
        var _a;
        // Match patterns like "12'6"", "3.5m", "150 sq ft"
        var patterns = [
            /(\d+)'(\d+)"?/, // Feet and inches
            /(\d+\.?\d*)\s*(ft|feet|m|meter|cm|mm|in|inch)/i,
            /(\d+\.?\d*)\s*(sq\.?\s*ft|square\s*feet)/i
        ];
        for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
            var pattern = patterns_1[_i];
            var match = text.match(pattern);
            if (match) {
                var value = 0;
                var unit = 'ft';
                if (match[0].includes("'")) {
                    // Feet and inches
                    value = parseFloat(match[1]) + (parseFloat(match[2] || '0') / 12);
                    unit = 'ft';
                }
                else {
                    value = parseFloat(match[1]);
                    unit = ((_a = match[2]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'ft';
                }
                if (!isNaN(value)) {
                    return { value: value, unit: unit };
                }
            }
        }
        return null;
    };
    return NodeTesseractService;
}());
exports.NodeTesseractService = NodeTesseractService;
// Export for use in real-detection service
exports.default = NodeTesseractService;
