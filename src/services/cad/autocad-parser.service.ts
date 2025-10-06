import * as fs from 'fs';
import * as path from 'path';
const DXFParser = require('dxf-parser');

export interface DXFEntity {
  type: string;
  layer: string;
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  vertices?: Array<{ x: number; y: number; z?: number }>;
  center?: { x: number; y: number; z?: number };
  radius?: number;
  text?: string;
  height?: number;
}

export interface DXFFloorPlan {
  walls: Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    layer: string;
    thickness?: number;
    type: 'interior' | 'exterior' | 'unknown';
  }>;
  doors: Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    layer: string;
  }>;
  windows: Array<{
    position: { x: number; y: number };
    size: { width: number; height: number };
    layer: string;
  }>;
  stairs: Array<{
    position: { x: number; y: number };
    boundary?: Array<{ x: number; y: number }>;
    direction?: 'up' | 'down' | 'unknown';
    steps?: number;
    layer: string;
  }>;
  rooms: Array<{
    boundary: Array<{ x: number; y: number }>;
    label?: string;
    area?: number;
    layer: string;
  }>;
  dimensions: Array<{
    value: string;
    position: { x: number; y: number };
    layer: string;
  }>;
  textLabels: Array<{
    text: string;
    position: { x: number; y: number };
    height: number;
    layer: string;
  }>;
  metadata: {
    layers: string[];
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } };
    units: string;
    scale: number;
  };
}

export class AutoCADParserService {
  private wallLayers = ['WALL', 'WALLS', 'A-WALL', 'ARCH-WALL', '0'];
  private doorLayers = ['DOOR', 'DOORS', 'A-DOOR', 'ARCH-DOOR'];
  private windowLayers = ['WINDOW', 'WINDOWS', 'A-WIND', 'ARCH-WIND'];
  private stairLayers = ['STAIR', 'STAIRS', 'A-FLOR-STRS', 'ARCH-STAIR', 'STRS'];
  private textLayers = ['TEXT', 'NOTES', 'LABELS', 'DIMENSIONS'];

  async parseDXF(filePath: string): Promise<DXFFloorPlan> {
    try {
      console.log(`🔧 Parsing DXF file: ${path.basename(filePath)}`);
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parser = new DXFParser();
      const dxf = parser.parseSync(fileContent);

      if (!dxf) {
        throw new Error('Failed to parse DXF file');
      }

      console.log(`📊 DXF parsed successfully. Found ${dxf.entities?.length || 0} entities`);

      const floorPlan: DXFFloorPlan = {
        walls: [],
        doors: [],
        windows: [],
        stairs: [],
        rooms: [],
        dimensions: [],
        textLabels: [],
        metadata: {
          layers: this.extractLayers(dxf),
          bounds: this.calculateBounds(dxf.entities || []),
          units: this.extractUnits(dxf),
          scale: this.estimateScale(dxf.entities || [])
        }
      };

      // Process entities
      if (dxf.entities) {
        for (const entity of dxf.entities) {
          this.processEntity(entity, floorPlan);
        }
      }

      // Post-process to identify rooms from closed polylines
      this.identifyRooms(floorPlan);

      console.log(`✅ DXF processing complete:`, {
        walls: floorPlan.walls.length,
        doors: floorPlan.doors.length,
        windows: floorPlan.windows.length,
        stairs: floorPlan.stairs.length,
        rooms: floorPlan.rooms.length,
        dimensions: floorPlan.dimensions.length,
        textLabels: floorPlan.textLabels.length,
        layers: floorPlan.metadata.layers.length,
        units: floorPlan.metadata.units,
        scale: floorPlan.metadata.scale,
        bounds: `(${floorPlan.metadata.bounds.min.x}, ${floorPlan.metadata.bounds.min.y}) to (${floorPlan.metadata.bounds.max.x}, ${floorPlan.metadata.bounds.max.y})`
      });
      
      // Log detailed breakdown for debugging
      if (floorPlan.walls.length > 0) {
        console.log(`🧱 Wall details: ${floorPlan.walls.map(w => `${w.type} wall on layer "${w.layer}"`).join(', ')}`);
      }
      if (floorPlan.doors.length > 0) {
        console.log(`🚪 Door details: ${floorPlan.doors.map(d => `door on layer "${d.layer}"`).join(', ')}`);
      }
      if (floorPlan.windows.length > 0) {
        console.log(`🪟 Window details: ${floorPlan.windows.map(w => `window on layer "${w.layer}"`).join(', ')}`);
      }
      if (floorPlan.stairs.length > 0) {
        console.log(`🪜 Stair details: ${floorPlan.stairs.map(s => `stairs on layer "${s.layer}" (${s.steps || '?'} steps)`).join(', ')}`);
      }
      if (floorPlan.textLabels.length > 0) {
        console.log(`📝 Text labels: ${floorPlan.textLabels.map(t => `"${t.text}" at (${t.position.x}, ${t.position.y})`).slice(0, 10).join(', ')}${floorPlan.textLabels.length > 10 ? '...' : ''}`);
      }

      return floorPlan;

    } catch (error) {
      console.error('❌ Error parsing DXF file:', error);
      throw new Error(`Failed to parse DXF file: ${error.message}`);
    }
  }

  private processEntity(entity: any, floorPlan: DXFFloorPlan): void {
    const layer = entity.layer || '0';
    console.log(`🔧 Processing entity: ${entity.type} on layer: ${layer}`);
    
    switch (entity.type) {
      case 'LINE':
        this.processLine(entity, layer, floorPlan);
        break;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        this.processPolyline(entity, layer, floorPlan);
        break;
      case 'CIRCLE':
        this.processCircle(entity, layer, floorPlan);
        break;
      case 'ARC':
        this.processArc(entity, layer, floorPlan);
        break;
      case 'TEXT':
      case 'MTEXT':
        this.processText(entity, layer, floorPlan);
        break;
      case 'DIMENSION':
        this.processDimension(entity, layer, floorPlan);
        break;
      case 'INSERT':
        this.processBlock(entity, layer, floorPlan);
        break;
      default:
        console.log(`⚠️  Unhandled entity type: ${entity.type}`);
    }
  }

  private processLine(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    if (this.isWallLayer(layer) && entity.startPoint && entity.endPoint) {
      console.log(`🧱 Adding wall line: (${entity.startPoint.x}, ${entity.startPoint.y}) to (${entity.endPoint.x}, ${entity.endPoint.y})`);
      floorPlan.walls.push({
        start: { x: entity.startPoint.x, y: entity.startPoint.y },
        end: { x: entity.endPoint.x, y: entity.endPoint.y },
        layer,
        type: this.classifyWallType(layer),
        thickness: this.estimateWallThickness(entity)
      });
    } else {
      console.log(`⚠️  Line skipped - not a wall layer or missing points: layer=${layer}, hasStartPoint=${!!entity.startPoint}, hasEndPoint=${!!entity.endPoint}`);
    }
  }

  private processPolyline(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    if (!entity.vertices || entity.vertices.length < 2) {
      console.log(`⚠️  Polyline skipped - insufficient vertices: ${entity.vertices?.length || 0}`);
      return;
    }

    console.log(`📐 Processing polyline with ${entity.vertices.length} vertices on layer: ${layer}, closed: ${entity.closed}`);

    if (this.isWallLayer(layer)) {
      console.log(`🧱 Converting polyline to wall segments (${entity.vertices.length - 1} segments)`);
      // Convert polyline to individual wall segments
      for (let i = 0; i < entity.vertices.length - 1; i++) {
        const start = entity.vertices[i];
        const end = entity.vertices[i + 1];
        
        floorPlan.walls.push({
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          layer,
          type: this.classifyWallType(layer)
        });
      }

      // Close polyline if needed
      if (entity.closed && entity.vertices.length > 2) {
        console.log(`🔄 Closing polyline with final wall segment`);
        const start = entity.vertices[entity.vertices.length - 1];
        const end = entity.vertices[0];
        
        floorPlan.walls.push({
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          layer,
          type: this.classifyWallType(layer)
        });
      }
    } else if (this.isStairLayer(layer)) {
      // Stairs detected on stair layer
      console.log(`🪜 Adding stairs from polyline with ${entity.vertices.length} vertices`);
      const centroid = this.calculateCentroid(entity.vertices);
      const steps = this.estimateSteps(entity.vertices);
      floorPlan.stairs.push({
        position: centroid,
        boundary: entity.vertices.map((v: any) => ({ x: v.x, y: v.y })),
        steps,
        direction: 'unknown',
        layer
      });
    } else if (entity.closed && entity.vertices.length > 3) {
      // Could be a room boundary
      console.log(`🏠 Adding room boundary with ${entity.vertices.length} vertices`);
      floorPlan.rooms.push({
        boundary: entity.vertices.map((v: any) => ({ x: v.x, y: v.y })),
        layer,
        area: this.calculatePolygonArea(entity.vertices)
      });
    }
  }

  private processText(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    if (entity.text && entity.text.trim() && entity.startPoint && 
        entity.startPoint.x !== undefined && entity.startPoint.y !== undefined) {
      console.log(`📝 Adding text label: "${entity.text.trim()}" at (${entity.startPoint.x}, ${entity.startPoint.y})`);
      floorPlan.textLabels.push({
        text: entity.text.trim(),
        position: { x: entity.startPoint.x, y: entity.startPoint.y },
        height: entity.textHeight || 1,
        layer
      });
    } else {
      console.log(`⚠️  Text skipped - missing text or position: hasText=${!!entity.text}, hasStartPoint=${!!entity.startPoint}`);
    }
  }

  private processDimension(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    if (entity.text) {
      console.log(`📏 Adding dimension: "${entity.text}" at (${entity.textPosition?.x || 0}, ${entity.textPosition?.y || 0})`);
      floorPlan.dimensions.push({
        value: entity.text,
        position: { x: entity.textPosition?.x || 0, y: entity.textPosition?.y || 0 },
        layer
      });
    } else {
      console.log(`⚠️  Dimension skipped - no text value`);
    }
  }

  private processCircle(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    // Circles might represent columns, fixtures, or symbols
    console.log(`⭕ Processing circle: radius=${entity.radius}, center=(${entity.center?.x}, ${entity.center?.y}), layer=${layer}`);
    
    if (this.isDoorLayer(layer) || this.isWindowLayer(layer)) {
      const size = { width: entity.radius * 2, height: entity.radius * 2 };
      
      if (this.isDoorLayer(layer)) {
        console.log(`🚪 Adding door from circle: radius=${entity.radius}`);
        floorPlan.doors.push({
          position: { x: entity.center.x, y: entity.center.y },
          size,
          layer
        });
      } else {
        console.log(`🪟 Adding window from circle: radius=${entity.radius}`);
        floorPlan.windows.push({
          position: { x: entity.center.x, y: entity.center.y },
          size,
          layer
        });
      }
    } else {
      console.log(`⚠️  Circle ignored - not on door/window layer`);
    }
  }

  private processArc(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    // Arcs often represent door swings
    console.log(`🌙 Processing arc: radius=${entity.radius}, center=(${entity.center?.x}, ${entity.center?.y}), layer=${layer}`);
    
    if (this.isDoorLayer(layer)) {
      console.log(`🚪 Adding door from arc (door swing): radius=${entity.radius}`);
      floorPlan.doors.push({
        position: { x: entity.center.x, y: entity.center.y },
        size: { width: entity.radius * 2, height: entity.radius * 2 },
        layer
      });
    } else {
      console.log(`⚠️  Arc ignored - not on door layer`);
    }
  }

  private processBlock(entity: any, layer: string, floorPlan: DXFFloorPlan): void {
    // Block references might be doors, windows, or fixtures
    const blockName = entity.name?.toUpperCase() || '';
    console.log(`🧩 Processing block: name="${blockName}", position=(${entity.position?.x}, ${entity.position?.y}), layer=${layer}`);
    
    if (blockName.includes('DOOR') || this.isDoorLayer(layer)) {
      console.log(`🚪 Adding door from block: "${blockName}"`);
      floorPlan.doors.push({
        position: { x: entity.position.x, y: entity.position.y },
        size: { width: 36, height: 6 }, // Default door size
        layer
      });
    } else if (blockName.includes('WINDOW') || this.isWindowLayer(layer)) {
      console.log(`🪟 Adding window from block: "${blockName}"`);
      floorPlan.windows.push({
        position: { x: entity.position.x, y: entity.position.y },
        size: { width: 48, height: 6 }, // Default window size
        layer
      });
    } else if (blockName.includes('STAIR') || blockName.includes('STRS') || this.isStairLayer(layer)) {
      console.log(`🪜 Adding stairs from block: "${blockName}"`);
      floorPlan.stairs.push({
        position: { x: entity.position.x, y: entity.position.y },
        direction: 'unknown',
        layer
      });
    } else {
      console.log(`⚠️  Block ignored - not recognized as door/window/stair: "${blockName}"`);
    }
  }

  private identifyRooms(floorPlan: DXFFloorPlan): void {
    // Advanced room identification would require complex polygon analysis
    // For now, we'll use existing closed polylines and try to label them
    console.log(`🏠 Identifying rooms: ${floorPlan.rooms.length} room boundaries found`);
    
    for (const room of floorPlan.rooms) {
      // Find the closest text label to the room centroid
      const centroid = this.calculateCentroid(room.boundary);
      let closestLabel = '';
      let closestDistance = Infinity;

      for (const label of floorPlan.textLabels) {
        const distance = Math.sqrt(
          Math.pow(label.position.x - centroid.x, 2) + 
          Math.pow(label.position.y - centroid.y, 2)
        );

        if (distance < closestDistance && this.isRoomLabel(label.text)) {
          closestDistance = distance;
          closestLabel = label.text;
        }
      }

      if (closestLabel && closestDistance < 100) { // Within reasonable distance
        console.log(`🏷️  Room labeled: "${closestLabel}" (distance: ${closestDistance.toFixed(1)})`);
        room.label = closestLabel;
      } else {
        console.log(`⚠️  Room unlabeled: no suitable text found within 100 units`);
      }
    }
  }

  private isWallLayer(layer: string): boolean {
    return this.wallLayers.some(wallLayer => 
      layer.toUpperCase().includes(wallLayer)
    );
  }

  private isDoorLayer(layer: string): boolean {
    return this.doorLayers.some(doorLayer => 
      layer.toUpperCase().includes(doorLayer)
    );
  }

  private isWindowLayer(layer: string): boolean {
    return this.windowLayers.some(windowLayer =>
      layer.toUpperCase().includes(windowLayer)
    );
  }

  private isStairLayer(layer: string): boolean {
    return this.stairLayers.some(stairLayer =>
      layer.toUpperCase().includes(stairLayer)
    );
  }

  private classifyWallType(layer: string): 'interior' | 'exterior' | 'unknown' {
    const layerUpper = layer.toUpperCase();
    if (layerUpper.includes('EXT') || layerUpper.includes('OUTER')) {
      return 'exterior';
    } else if (layerUpper.includes('INT') || layerUpper.includes('INNER')) {
      return 'interior';
    }
    return 'unknown';
  }

  private estimateWallThickness(_entity: any): number {
    // Default wall thickness in inches
    return 6;
  }

  private extractLayers(dxf: any): string[] {
    const layers = [];
    if (dxf.tables?.layer?.layers) {
      for (const layerName in dxf.tables.layer.layers) {
        layers.push(layerName);
      }
    }
    console.log(`📋 Extracted layers: [${layers.join(', ')}]`);
    return layers;
  }

  private extractUnits(dxf: any): string {
    // Try to determine units from the header variables
    if (dxf.header && dxf.header.$INSUNITS) {
      const unitCode = dxf.header.$INSUNITS;
      let units = 'unknown';
      switch (unitCode) {
        case 1: units = 'inches'; break;
        case 2: units = 'feet'; break;
        case 4: units = 'millimeters'; break;
        case 5: units = 'centimeters'; break;
        case 6: units = 'meters'; break;
        default: units = 'unknown'; break;
      }
      console.log(`📐 Detected units: ${units} (code: ${unitCode})`);
      return units;
    }
    console.log(`📐 Units: unknown (no header info)`);
    return 'unknown';
  }

  private calculateBounds(entities: any[]): { min: { x: number; y: number }; max: { x: number; y: number } } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let validPoints = 0;

    for (const entity of entities) {
      const points = this.getEntityPoints(entity);
      for (const point of points) {
        if (point && point.x !== undefined && point.y !== undefined) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
          validPoints++;
        }
      }
    }

    const bounds = {
      min: { x: minX === Infinity ? 0 : minX, y: minY === Infinity ? 0 : minY },
      max: { x: maxX === -Infinity ? 0 : maxX, y: maxY === -Infinity ? 0 : maxY }
    };
    
    console.log(`📏 Calculated bounds from ${validPoints} points: min=(${bounds.min.x}, ${bounds.min.y}), max=(${bounds.max.x}, ${bounds.max.y})`);
    return bounds;
  }

  private getEntityPoints(entity: any): Array<{ x: number; y: number }> {
    switch (entity.type) {
      case 'LINE':
        const points = [];
        if (entity.startPoint && entity.startPoint.x !== undefined && entity.startPoint.y !== undefined) {
          points.push(entity.startPoint);
        }
        if (entity.endPoint && entity.endPoint.x !== undefined && entity.endPoint.y !== undefined) {
          points.push(entity.endPoint);
        }
        return points;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        return (entity.vertices || []).filter((v: any) => v && v.x !== undefined && v.y !== undefined);
      case 'CIRCLE':
      case 'ARC':
        if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined && entity.radius !== undefined) {
          return [
            { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
            { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius }
          ];
        }
        return [];
      case 'TEXT':
      case 'MTEXT':
        if (entity.startPoint && entity.startPoint.x !== undefined && entity.startPoint.y !== undefined) {
          return [entity.startPoint];
        }
        return [];
      default:
        return [];
    }
  }

  private estimateScale(entities: any[]): number {
    // Estimate scale based on typical room dimensions
    const bounds = this.calculateBounds(entities);
    const width = bounds.max.x - bounds.min.x;
    
    // Assume a typical floor plan is 20-50 feet wide
    if (width > 1000) {
      return 1/12; // Probably in inches, convert to feet
    } else if (width < 100) {
      return 1; // Probably already in appropriate units
    }
    return 1;
  }

  private calculatePolygonArea(vertices: Array<{ x: number; y: number }>): number {
    let area = 0;
    const n = vertices.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  private calculateCentroid(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
    const n = vertices.length;
    let cx = 0, cy = 0;

    for (const vertex of vertices) {
      cx += vertex.x;
      cy += vertex.y;
    }

    return { x: cx / n, y: cy / n };
  }

  private estimateSteps(vertices: Array<{ x: number; y: number }>): number {
    // Estimate number of steps based on polyline segments
    // Stairs typically have parallel line segments representing treads
    if (vertices.length < 3) return 0;

    // Count direction changes which often indicate steps
    let steps = 0;
    for (let i = 1; i < vertices.length - 1; i++) {
      const dx1 = vertices[i].x - vertices[i-1].x;
      const dy1 = vertices[i].y - vertices[i-1].y;
      const dx2 = vertices[i+1].x - vertices[i].x;
      const dy2 = vertices[i+1].y - vertices[i].y;

      // Check if direction changed significantly (perpendicular segments)
      const dot = dx1 * dx2 + dy1 * dy2;
      const mag1 = Math.sqrt(dx1*dx1 + dy1*dy1);
      const mag2 = Math.sqrt(dx2*dx2 + dy2*dy2);

      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dot / (mag1 * mag2);
        // If nearly perpendicular (cos ≈ 0), likely a step
        if (Math.abs(cosAngle) < 0.3) {
          steps++;
        }
      }
    }

    // Typical stairs have pairs of segments (tread + riser)
    return Math.max(Math.floor(steps / 2), vertices.length / 4);
  }

  private isRoomLabel(text: string): boolean {
    const roomKeywords = [
      'BEDROOM', 'LIVING', 'KITCHEN', 'BATHROOM', 'BATH', 'OFFICE', 'STUDY',
      'DINING', 'FAMILY', 'GARAGE', 'CLOSET', 'PANTRY', 'LAUNDRY', 'ENTRY',
      'FOYER', 'HALL', 'UTILITY', 'MASTER', 'GUEST', 'ROOM'
    ];
    
    const textUpper = text.toUpperCase();
    return roomKeywords.some(keyword => textUpper.includes(keyword));
  }
}

export default new AutoCADParserService();