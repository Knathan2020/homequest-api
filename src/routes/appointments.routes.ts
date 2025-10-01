/**
 * Appointments and Scheduling Routes
 * Handles appointment creation, management, and availability
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { addDays, format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import weatherService from '../services/weather.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Get all appointments for a team
 */
router.get('/', async (req, res) => {
  try {
    const { teamId, status, startDate, endDate } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Team ID is required' 
      });
    }
    
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('team_id', teamId)
      .order('scheduled_at', { ascending: true });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (startDate) {
      query = query.gte('scheduled_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('scheduled_at', endDate);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: data || []
    });
    
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get a single appointment
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    res.json({
      success: true,
      data
    });
    
  } catch (error: any) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new appointment
 */
router.post('/', async (req, res) => {
  try {
    const {
      teamId,
      title,
      description,
      type,
      scheduledAt,
      durationMinutes = 30,
      hostUserId,
      hostName,
      attendeeName,
      attendeeEmail,
      attendeePhone,
      attendeeCompany,
      locationType = 'phone',
      locationDetails,
      locationAddress, // Physical address for outdoor work
      workType = 'indoor', // 'indoor', 'outdoor', 'mixed'
      projectId,
      notes,
      source = 'manual',
      createdByAi = false,
      aiCallId
    } = req.body;
    
    // Validate required fields
    if (!teamId || !title || !scheduledAt || !attendeeName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Check for scheduling conflicts if hostUserId is provided
    if (hostUserId) {
      const { data: conflictCheck } = await supabase
        .rpc('check_appointment_conflict', {
          p_user_id: hostUserId,
          p_scheduled_at: scheduledAt,
          p_duration_minutes: durationMinutes
        });
      
      if (conflictCheck) {
        return res.status(409).json({
          success: false,
          error: 'This time slot conflicts with another appointment'
        });
      }
    }
    
    // Check weather for outdoor appointments
    let weatherData = null;
    let weatherSuitable = true;
    let weatherWarnings: string[] = [];
    let weatherRecommendation = '';
    let workWindows: any[] = [];
    
    if (workType === 'outdoor' || workType === 'mixed') {
      // Use project address if available, otherwise use provided location
      let checkAddress = locationAddress;
      
      // If projectId is provided, fetch the project's property address
      if (projectId && !locationAddress) {
        const { data: project } = await supabase
          .from('projects')
          .select('address')
          .eq('id', projectId)
          .single();
        
        if (project?.address) {
          checkAddress = project.address;
        }
      }
      
      if (checkAddress) {
        try {
          // Check hourly weather for work windows
          const windowAssessment = await weatherService.assessWorkWindows(
            checkAddress,
            new Date(scheduledAt),
            durationMinutes / 60, // Convert minutes to hours
            3 // Minimum 3-hour window
          );
          
          workWindows = windowAssessment.windows;
          weatherWarnings = windowAssessment.warnings;
          weatherRecommendation = windowAssessment.recommendation;
          
          // Check if there's a viable work window
          if (windowAssessment.hasViableWindow) {
            weatherSuitable = true;
            
            // If there are brief showers, just note them
            if (windowAssessment.warnings.some(w => w.includes('Light rain'))) {
              weatherRecommendation = `${weatherRecommendation}. Work can proceed with rain preparations.`;
            }
          } else {
            weatherSuitable = false;
          }
          
          // Get standard daily forecast too
          const weatherCheck = await weatherService.checkSchedulingDate(
            checkAddress,
            new Date(scheduledAt),
            workType
          );
          
          // If no good windows but weather check suggests alternative
          if (!windowAssessment.hasViableWindow && weatherCheck.alternativeDate) {
            return res.status(200).json({
              success: false,
              weatherIssue: true,
              workWindows: workWindows,
              warnings: weatherWarnings,
              recommendation: weatherRecommendation,
              suggestedDate: weatherCheck.alternativeDate,
              message: `Weather not suitable for ${format(parseISO(scheduledAt), 'PPP')}. ${weatherRecommendation}`
            });
          }
        } catch (weatherError) {
          console.error('Weather check failed:', weatherError);
          // Continue without weather check
        }
      }
    }
    
    // Create the appointment with weather data
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        team_id: teamId,
        title,
        description,
        type: type || 'meeting',
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        host_user_id: hostUserId,
        host_name: hostName,
        attendee_name: attendeeName,
        attendee_email: attendeeEmail,
        attendee_phone: attendeePhone,
        attendee_company: attendeeCompany,
        location_type: locationType,
        location_details: locationDetails,
        location_address: locationAddress,
        work_type: workType,
        weather_forecast: weatherData,
        weather_suitable: weatherSuitable,
        weather_warnings: weatherWarnings,
        weather_recommendation: weatherRecommendation,
        weather_checked_at: weatherData ? new Date().toISOString() : null,
        project_id: projectId,
        notes: weatherWarnings.length > 0 
          ? `${notes || ''}\n\nWeather Alert: ${weatherWarnings.join(', ')}`
          : notes,
        source,
        created_by_ai: createdByAi,
        ai_call_id: aiCallId
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Create reminder if phone or email provided
    if (attendeePhone || attendeeEmail) {
      const reminderTime = new Date(scheduledAt);
      reminderTime.setHours(reminderTime.getHours() - 1); // 1 hour before
      
      await supabase
        .from('appointment_reminders')
        .insert({
          appointment_id: data.id,
          type: attendeePhone ? 'sms' : 'email',
          send_at: reminderTime.toISOString(),
          recipient_phone: attendeePhone,
          recipient_email: attendeeEmail,
          message: `Reminder: You have an appointment with ${hostName || teamId} at ${format(parseISO(scheduledAt), 'PPp')}`
        });
    }
    
    res.status(201).json({
      success: true,
      data,
      message: 'Appointment created successfully'
    });
    
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update an appointment
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    
    // Check for conflicts if rescheduling
    if (updates.scheduled_at && updates.host_user_id) {
      const { data: conflictCheck } = await supabase
        .rpc('check_appointment_conflict', {
          p_user_id: updates.host_user_id,
          p_scheduled_at: updates.scheduled_at,
          p_duration_minutes: updates.duration_minutes || 30,
          p_appointment_id: id
        });
      
      if (conflictCheck) {
        return res.status(409).json({
          success: false,
          error: 'This time slot conflicts with another appointment'
        });
      }
    }
    
    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      data,
      message: 'Appointment updated successfully'
    });
    
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Cancel an appointment
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      data,
      message: 'Appointment cancelled successfully'
    });
    
  } catch (error: any) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get available time slots for a user
 */
router.get('/availability/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, durationMinutes = 30 } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required'
      });
    }
    
    const requestedDate = new Date(date as string);
    const dayOfWeek = requestedDate.getDay();
    
    // Get user's availability slots for this day
    const { data: availabilitySlots } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('user_id', userId)
      .eq('is_available', true)
      .or(`day_of_week.eq.${dayOfWeek},specific_date.eq.${date}`);
    
    // Get existing appointments for this day
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const { data: existingAppointments } = await supabase
      .from('appointments')
      .select('scheduled_at, duration_minutes')
      .eq('host_user_id', userId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', startOfDay.toISOString())
      .lte('scheduled_at', endOfDay.toISOString());
    
    // Get blocked slots for this day
    const { data: blockedSlots } = await supabase
      .from('blocked_slots')
      .select('start_at, end_at')
      .eq('user_id', userId)
      .gte('start_at', startOfDay.toISOString())
      .lte('end_at', endOfDay.toISOString());
    
    // Calculate available slots
    const availableSlots: any[] = [];
    
    if (availabilitySlots && availabilitySlots.length > 0) {
      for (const slot of availabilitySlots) {
        const startTime = new Date(requestedDate);
        const [startHour, startMinute] = slot.start_time.split(':');
        startTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
        
        const endTime = new Date(requestedDate);
        const [endHour, endMinute] = slot.end_time.split(':');
        endTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
        
        // Generate time slots
        const current = new Date(startTime);
        while (current < endTime) {
          const slotEnd = new Date(current);
          slotEnd.setMinutes(slotEnd.getMinutes() + Number(durationMinutes));
          
          // Check if this slot conflicts with existing appointments or blocked times
          let isAvailable = true;
          
          if (existingAppointments) {
            for (const appt of existingAppointments) {
              const apptStart = new Date(appt.scheduled_at);
              const apptEnd = new Date(apptStart);
              apptEnd.setMinutes(apptEnd.getMinutes() + appt.duration_minutes);
              
              if ((current >= apptStart && current < apptEnd) ||
                  (slotEnd > apptStart && slotEnd <= apptEnd)) {
                isAvailable = false;
                break;
              }
            }
          }
          
          if (isAvailable && blockedSlots) {
            for (const blocked of blockedSlots) {
              const blockStart = new Date(blocked.start_at);
              const blockEnd = new Date(blocked.end_at);
              
              if ((current >= blockStart && current < blockEnd) ||
                  (slotEnd > blockStart && slotEnd <= blockEnd)) {
                isAvailable = false;
                break;
              }
            }
          }
          
          if (isAvailable) {
            availableSlots.push({
              start: current.toISOString(),
              end: slotEnd.toISOString(),
              duration: durationMinutes
            });
          }
          
          current.setMinutes(current.getMinutes() + 30); // Move to next 30-minute slot
        }
      }
    }
    
    res.json({
      success: true,
      data: availableSlots
    });
    
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set user availability
 */
router.post('/availability', async (req, res) => {
  try {
    const {
      userId,
      teamId,
      dayOfWeek,
      startTime,
      endTime,
      specificDate,
      isRecurring = true
    } = req.body;
    
    if (!userId || !teamId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const { data, error } = await supabase
      .from('availability_slots')
      .insert({
        user_id: userId,
        team_id: teamId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        specific_date: specificDate,
        is_recurring: isRecurring
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      data,
      message: 'Availability set successfully'
    });
    
  } catch (error: any) {
    console.error('Error setting availability:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check weather for an appointment
 */
router.get('/:id/weather', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get appointment details
    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    // Check if this is an outdoor appointment
    if (appointment.work_type === 'indoor') {
      return res.json({
        success: true,
        weatherRelevant: false,
        message: 'Indoor work not affected by weather'
      });
    }
    
    if (!appointment.location_address) {
      return res.status(400).json({
        success: false,
        error: 'No location address provided for weather check'
      });
    }
    
    // Check weather
    const weatherCheck = await weatherService.checkSchedulingDate(
      appointment.location_address,
      new Date(appointment.scheduled_at),
      appointment.work_type
    );
    
    // Get detailed forecast
    const forecast = await weatherService.getWeatherForecast(
      appointment.location_address, 
      1
    );
    
    // Update appointment with weather data
    await supabase
      .from('appointments')
      .update({
        weather_forecast: forecast[0] || null,
        weather_suitable: weatherCheck.canProceed,
        weather_warnings: weatherCheck.warnings,
        weather_recommendation: weatherCheck.recommendation,
        weather_checked_at: new Date().toISOString()
      })
      .eq('id', id);
    
    res.json({
      success: true,
      weatherRelevant: true,
      canProceed: weatherCheck.canProceed,
      warnings: weatherCheck.warnings,
      recommendation: weatherCheck.recommendation,
      alternativeDate: weatherCheck.alternativeDate,
      forecast: forecast[0]
    });
    
  } catch (error: any) {
    console.error('Error checking weather:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Auto-reschedule appointment due to weather
 */
router.post('/:id/reschedule-weather', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Get appointment details
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    if (!appointment.location_address) {
      return res.status(400).json({
        success: false,
        error: 'No location address for weather-based rescheduling'
      });
    }
    
    // Find next good weather day
    const nextGoodDay = await weatherService.getNextGoodWorkDay(
      appointment.location_address,
      new Date(appointment.scheduled_at)
    );
    
    if (!nextGoodDay) {
      return res.status(400).json({
        success: false,
        error: 'Could not find suitable alternative date'
      });
    }
    
    // Call the auto-reschedule function in database
    const { data: newAppointmentId, error: rescheduleError } = await supabase
      .rpc('auto_reschedule_for_weather', {
        p_appointment_id: id,
        p_new_date: nextGoodDay.date.toISOString(),
        p_reason: reason || `Weather: ${nextGoodDay.recommendation}`
      });
    
    if (rescheduleError) {
      throw rescheduleError;
    }
    
    // Get the new appointment details
    const { data: newAppointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', newAppointmentId)
      .single();
    
    // Send notification if contact info available
    if (appointment.attendee_phone || appointment.attendee_email) {
      await supabase
        .from('appointment_reminders')
        .insert({
          appointment_id: newAppointmentId,
          type: appointment.attendee_phone ? 'sms' : 'email',
          send_at: new Date().toISOString(), // Send immediately
          recipient_phone: appointment.attendee_phone,
          recipient_email: appointment.attendee_email,
          message: `Your appointment has been rescheduled due to weather from ${format(new Date(appointment.scheduled_at), 'PPp')} to ${format(nextGoodDay.date, 'PPp')}. Reason: ${nextGoodDay.recommendation}`
        });
    }
    
    res.json({
      success: true,
      originalAppointmentId: id,
      newAppointmentId,
      newAppointment,
      newDate: nextGoodDay.date,
      weatherInfo: nextGoodDay,
      message: `Appointment rescheduled to ${format(nextGoodDay.date, 'PPP')} due to weather`
    });
    
  } catch (error: any) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check weather for upcoming appointments (batch check)
 */
router.post('/check-weather-batch', async (req, res) => {
  try {
    const { teamId, days = 7 } = req.body;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Team ID required'
      });
    }
    
    // Get outdoor appointments for next X days
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('team_id', teamId)
      .in('work_type', ['outdoor', 'mixed'])
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', endDate.toISOString())
      .not('location_address', 'is', null);
    
    if (!appointments || appointments.length === 0) {
      return res.json({
        success: true,
        message: 'No outdoor appointments to check',
        checked: 0,
        alerts: []
      });
    }
    
    const alerts = [];
    const updates = [];
    
    for (const appointment of appointments) {
      try {
        const weatherCheck = await weatherService.checkSchedulingDate(
          appointment.location_address,
          new Date(appointment.scheduled_at),
          appointment.work_type
        );
        
        // Update appointment
        updates.push({
          id: appointment.id,
          weather_suitable: weatherCheck.canProceed,
          weather_warnings: weatherCheck.warnings,
          weather_recommendation: weatherCheck.recommendation,
          weather_checked_at: new Date().toISOString()
        });
        
        // Create alert if weather is bad
        if (!weatherCheck.canProceed) {
          alerts.push({
            appointmentId: appointment.id,
            title: appointment.title,
            scheduledAt: appointment.scheduled_at,
            warnings: weatherCheck.warnings,
            recommendation: weatherCheck.recommendation,
            alternativeDate: weatherCheck.alternativeDate
          });
          
          // Create weather alert in database
          await supabase
            .from('weather_alerts')
            .insert({
              appointment_id: appointment.id,
              alert_type: weatherCheck.warnings[0]?.includes('rain') ? 'rain' : 
                          weatherCheck.warnings[0]?.includes('snow') ? 'snow' :
                          weatherCheck.warnings[0]?.includes('wind') ? 'wind' : 'other',
              severity: 'high',
              message: weatherCheck.warnings.join(', '),
              detected_at: new Date().toISOString()
            });
        }
      } catch (error) {
        console.error(`Error checking weather for appointment ${appointment.id}:`, error);
      }
    }
    
    // Batch update appointments
    for (const update of updates) {
      await supabase
        .from('appointments')
        .update(update)
        .eq('id', update.id);
    }
    
    res.json({
      success: true,
      checked: appointments.length,
      alerts: alerts,
      message: `Checked ${appointments.length} appointments, found ${alerts.length} weather concerns`
    });
    
  } catch (error: any) {
    console.error('Error batch checking weather:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Simple weather check endpoint for VAPI integration
 */
router.post('/check-weather', async (req, res) => {
  try {
    const { date, location, workType } = req.body;

    if (!date || !location) {
      return res.status(400).json({
        suitable: true,
        warnings: ['Missing date or location'],
        error: 'Invalid request parameters'
      });
    }

    const appointmentDate = new Date(date);

    // Use the real weather service
    const weatherCheck = await weatherService.checkSchedulingDate(
      location,
      appointmentDate,
      workType || 'outdoor'
    );

    res.json({
      suitable: weatherCheck.canProceed,
      warnings: weatherCheck.warnings,
      location,
      date,
      workType: workType || 'outdoor',
      forecast: weatherCheck.recommendation,
      alternativeDate: weatherCheck.alternativeDate?.toISOString()
    });

  } catch (error) {
    console.error('Weather check error:', error);
    res.status(500).json({
      suitable: true, // Default to suitable on error
      warnings: ['Weather service temporarily unavailable'],
      error: 'Weather service unavailable',
      location: req.body.location || 'Unknown',
      date: req.body.date || new Date().toISOString(),
      workType: req.body.workType || 'outdoor',
      forecast: 'Unable to check weather, proceed with caution'
    });
  }
});

/**
 * Block time slots
 */
router.post('/block', async (req, res) => {
  try {
    const {
      userId,
      teamId,
      startAt,
      endAt,
      reason
    } = req.body;
    
    if (!teamId || !startAt || !endAt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const { data, error } = await supabase
      .from('blocked_slots')
      .insert({
        user_id: userId,
        team_id: teamId,
        start_at: startAt,
        end_at: endAt,
        reason
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      data,
      message: 'Time blocked successfully'
    });
    
  } catch (error: any) {
    console.error('Error blocking time:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;