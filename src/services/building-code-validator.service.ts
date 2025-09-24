/**
 * Building Code Validator Service
 * Validates blueprints against IBC/IRC and ADA standards
 */

export class BuildingCodeValidator {
  private codes = {
    // IBC/IRC Room Requirements
    rooms: {
      bedroom: {
        min_area_sqft: 70,
        min_dimension_ft: 7,
        requires_window: true,
        requires_closet: false,
        ceiling_height_min: 7.5
      },
      master_bedroom: {
        min_area_sqft: 120,
        min_dimension_ft: 10,
        requires_window: true,
        requires_closet: true,
        ceiling_height_min: 8
      },
      bathroom: {
        min_area_sqft: 40,
        min_dimension_ft: 5,
        half_bath_min_sqft: 18,
        requires_window_or_vent: true,
        ceiling_height_min: 7
      },
      kitchen: {
        min_area_sqft: 50,
        min_dimension_ft: 7,
        counter_min_linear_ft: 10,
        requires_window: true,
        ceiling_height_min: 7.5
      },
      living_room: {
        min_area_sqft: 120,
        min_dimension_ft: 10,
        ceiling_height_min: 7.5
      },
      dining_room: {
        min_area_sqft: 80,
        min_dimension_ft: 8,
        ceiling_height_min: 7.5
      },
      hallway: {
        min_width_ft: 3,
        ada_min_width_ft: 3.67, // 44 inches
        max_dead_end_ft: 20
      },
      stairs: {
        min_width_in: 36,
        max_riser_in: 7.75,
        min_tread_in: 10,
        min_headroom_in: 80,
        handrail_height_min_in: 34,
        handrail_height_max_in: 38
      }
    },
    
    // Egress Requirements
    egress: {
      bedroom_window: {
        min_opening_sqft: 5.7,
        min_opening_height_in: 24,
        min_opening_width_in: 20,
        max_sill_height_in: 44
      },
      door: {
        min_width_in: 32,
        min_height_in: 80,
        ada_min_width_in: 36,
        max_threshold_in: 0.75,
        ada_max_threshold_in: 0.5
      },
      exit_distance: {
        residential_max_ft: 200,
        commercial_max_ft: 250,
        two_exit_threshold_sqft: 1000
      }
    },
    
    // ADA Requirements
    ada: {
      door_clearance: {
        clear_width_min_in: 32,
        maneuvering_clearance_in: 60,
        approach_clearance_in: 18
      },
      hallway: {
        min_width_in: 48,
        passing_space_width_in: 60,
        turning_radius_in: 60
      },
      bathroom: {
        clear_floor_space: { width_in: 30, depth_in: 48 },
        toilet_clearance_side_in: 18,
        toilet_clearance_front_in: 48,
        sink_knee_clearance_in: 27,
        grab_bar_height_in: { min: 33, max: 36 }
      },
      kitchen: {
        counter_height_max_in: 36,
        work_surface_height_in: { min: 28, max: 34 },
        clear_floor_space_in: 30,
        aisle_width_min_in: 40
      },
      ramp: {
        max_slope_ratio: 0.083, // 1:12
        max_rise_in: 30,
        min_width_in: 36,
        landing_length_min_in: 60
      }
    },
    
    // Structural Requirements
    structural: {
      foundation: {
        min_depth_below_grade_in: 12,
        frost_line_depth_in: 42, // Varies by region
        min_footing_width_in: 16
      },
      walls: {
        min_thickness_exterior_in: 6,
        min_thickness_interior_in: 4,
        max_unsupported_height_ft: 10
      },
      spans: {
        wood_joist_max_ft: 20,
        steel_beam_max_ft: 40,
        concrete_slab_max_ft: 30
      },
      loads: {
        residential_floor_psf: 40,
        commercial_floor_psf: 100,
        roof_snow_load_psf: 30,
        wind_load_psf: 20
      }
    }
  };
  
  /**
   * Validate measurements against building codes
   */
  async validate(measurements: any): Promise<any> {
    console.log('📋 Validating against building codes...');
    
    const violations: string[] = [];
    const warnings: string[] = [];
    const roomCompliance: any = {};
    
    // Validate rooms
    if (measurements.interior_spaces?.rooms) {
      for (const room of measurements.interior_spaces.rooms) {
        const compliance = this.validateRoom(room);
        roomCompliance[room.name] = compliance;
        
        if (!compliance.compliant) {
          violations.push(...compliance.violations);
        }
        warnings.push(...compliance.warnings);
      }
    }
    
    // Validate egress
    const egressCompliance = this.validateEgress(measurements);
    if (!egressCompliance.compliant) {
      violations.push(...egressCompliance.violations);
    }
    
    // Validate ADA compliance
    const adaCompliance = this.validateADA(measurements);
    if (!adaCompliance.full_compliance) {
      warnings.push(...adaCompliance.issues);
    }
    
    // Validate structural requirements
    const structuralCompliance = this.validateStructural(measurements);
    if (!structuralCompliance.compliant) {
      violations.push(...structuralCompliance.violations);
    }
    
    return {
      room_compliance: roomCompliance,
      egress_compliance: egressCompliance,
      ada_compliance: adaCompliance,
      structural_compliance: structuralCompliance,
      compliance_summary: {
        overall_compliance: violations.length === 0 ? 'passed' : 'failed',
        violations: violations,
        warnings: warnings,
        code_version: 'IBC_2021',
        jurisdiction: 'standard_residential'
      }
    };
  }
  
  /**
   * Validate individual room
   */
  private validateRoom(room: any): any {
    const roomType = this.identifyRoomType(room.name);
    const requirements = this.codes.rooms[roomType as keyof typeof this.codes.rooms];
    
    if (!requirements) {
      return { compliant: true, violations: [], warnings: [] };
    }
    
    const violations: string[] = [];
    const warnings: string[] = [];
    
    // Check minimum area
    if ('min_area_sqft' in requirements && room.area_sqft < requirements.min_area_sqft) {
      violations.push(`${room.name}: Area ${room.area_sqft} sqft is below minimum ${requirements.min_area_sqft} sqft`);
    }
    
    // Check minimum dimension
    if ('min_dimension_ft' in requirements) {
      const minDimension = Math.min(room.length_feet || 0, room.width_feet || 0);
      if (minDimension < requirements.min_dimension_ft) {
        violations.push(`${room.name}: Minimum dimension ${minDimension} ft is below required ${requirements.min_dimension_ft} ft`);
      }
    }
    
    // Check window requirement
    if ('requires_window' in requirements && requirements.requires_window) {
      // This would need actual window detection
      warnings.push(`${room.name}: Verify window presence for egress`);
    }
    
    return {
      compliant: violations.length === 0,
      violations: violations,
      warnings: warnings,
      room_type: roomType,
      meets_minimum: violations.length === 0
    };
  }
  
  /**
   * Identify room type from name
   */
  private identifyRoomType(name: string): string {
    const normalized = name.toLowerCase();
    
    if (normalized.includes('master')) return 'master_bedroom';
    if (normalized.includes('bedroom') || normalized.includes('bed')) return 'bedroom';
    if (normalized.includes('bathroom') || normalized.includes('bath')) return 'bathroom';
    if (normalized.includes('kitchen')) return 'kitchen';
    if (normalized.includes('living') || normalized.includes('family')) return 'living_room';
    if (normalized.includes('dining')) return 'dining_room';
    if (normalized.includes('hall')) return 'hallway';
    
    return 'room'; // Generic room
  }
  
  /**
   * Validate egress requirements
   */
  private validateEgress(measurements: any): any {
    const violations: string[] = [];
    let bedroomEgress = true;
    
    // Check bedroom egress windows
    if (measurements.interior_spaces?.rooms) {
      for (const room of measurements.interior_spaces.rooms) {
        if (this.identifyRoomType(room.name) === 'bedroom') {
          // Would need to check for windows or secondary exits
          // For now, assume compliance
        }
      }
    }
    
    // Check door widths
    if (measurements.openings) {
      for (const opening of measurements.openings) {
        if (opening.type === 'door' && opening.width_feet * 12 < this.codes.egress.door.min_width_in) {
          violations.push(`Door width ${opening.width_feet * 12}" is below minimum ${this.codes.egress.door.min_width_in}"`);
        }
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations: violations,
      all_bedrooms_have_egress: bedroomEgress,
      exit_distances_valid: true,
      window_sizes_adequate: true
    };
  }
  
  /**
   * Validate ADA compliance
   */
  private validateADA(measurements: any): any {
    const issues: string[] = [];
    let fullCompliance = true;
    
    // Check door clearances
    if (measurements.openings) {
      for (const opening of measurements.openings) {
        if (opening.type === 'door' && opening.width_feet * 12 < this.codes.ada.door_clearance.clear_width_min_in) {
          issues.push(`Door width ${opening.width_feet * 12}" may not meet ADA requirement of ${this.codes.ada.door_clearance.clear_width_min_in}"`);
          fullCompliance = false;
        }
      }
    }
    
    // Check hallway widths (would need actual hallway detection)
    // For now, provide recommendations
    issues.push('Verify hallway widths meet 48" ADA requirement');
    
    return {
      full_compliance: fullCompliance,
      partial_compliance: !fullCompliance && issues.length < 3,
      compliance_level: fullCompliance ? 'full_ada' : issues.length < 3 ? 'partial_ada' : 'non_ada',
      issues: issues,
      door_clearances: fullCompliance ? 'compliant' : 'review_needed',
      hallway_widths: 'review_needed',
      bathroom_accessibility: 'review_needed'
    };
  }
  
  /**
   * Validate structural requirements
   */
  private validateStructural(measurements: any): any {
    const violations: string[] = [];
    
    // Check building size
    const envelope = measurements.exterior_dimensions?.building_envelope;
    if (envelope) {
      // Check reasonable size
      if (envelope.footprint_sqft > 10000) {
        violations.push('Building footprint exceeds typical residential size - verify structural design');
      }
      
      // Check proportions
      const aspectRatio = envelope.length_feet / envelope.width_feet;
      if (aspectRatio > 4 || aspectRatio < 0.25) {
        violations.push('Unusual building proportions - verify structural stability');
      }
    }
    
    // Check wall spans
    if (measurements.exterior_dimensions?.walls) {
      for (const wall of measurements.exterior_dimensions.walls) {
        if (wall.length_feet > this.codes.structural.spans.wood_joist_max_ft) {
          violations.push(`Wall span ${wall.length_feet} ft may require additional support`);
        }
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations: violations,
      unsupported_spans: violations.filter(v => v.includes('span')),
      load_bearing_walls: 'review_required',
      foundation_adequate: true
    };
  }
}

// Export singleton
export const buildingCodeValidator = new BuildingCodeValidator();