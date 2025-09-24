/**
 * Weather Monitoring Script
 * Runs hourly to check weather conditions for upcoming appointments
 * Deploy as a cron job or scheduled task
 */

import { createClient } from '@supabase/supabase-js';
import weatherService from '../services/weather.service';
import { format } from 'date-fns';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Check weather for appointments in the next 24 hours
 */
async function checkUpcomingAppointments() {
  console.log(`🌤️ Weather Monitor - ${new Date().toISOString()}`);
  
  try {
    // Get outdoor appointments in next 24 hours
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*')
      .in('work_type', ['outdoor', 'mixed'])
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', tomorrow.toISOString())
      .not('location_address', 'is', null);
    
    if (error) {
      console.error('Error fetching appointments:', error);
      return;
    }
    
    if (!appointments || appointments.length === 0) {
      console.log('No outdoor appointments in next 24 hours');
      return;
    }
    
    console.log(`Found ${appointments.length} outdoor appointments to check`);
    
    for (const appointment of appointments) {
      await checkAppointmentWeather(appointment);
    }
    
  } catch (error) {
    console.error('Error in weather monitor:', error);
  }
}

/**
 * Check weather for a specific appointment
 */
async function checkAppointmentWeather(appointment: any) {
  try {
    const hoursUntil = Math.floor(
      (new Date(appointment.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60)
    );
    
    console.log(`\n📅 Checking: ${appointment.title}`);
    console.log(`   Scheduled: ${format(new Date(appointment.scheduled_at), 'PPp')}`);
    console.log(`   Location: ${appointment.location_address}`);
    console.log(`   Hours until: ${hoursUntil}`);
    
    // Use project address if no location address
    let checkAddress = appointment.location_address;
    if (!checkAddress && appointment.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('address')
        .eq('id', appointment.project_id)
        .single();
      
      if (project?.address) {
        checkAddress = project.address;
      }
    }
    
    if (!checkAddress) {
      console.log('   ⚠️ No address available for weather check');
      return;
    }
    
    // Check hourly weather windows
    const windowAssessment = await weatherService.assessWorkWindows(
      checkAddress,
      new Date(appointment.scheduled_at),
      appointment.duration_minutes / 60,
      2 // Minimum 2-hour window for urgent checks
    );
    
    // Update appointment with latest weather
    await supabase
      .from('appointments')
      .update({
        weather_suitable: windowAssessment.hasViableWindow,
        weather_warnings: windowAssessment.warnings,
        weather_recommendation: windowAssessment.recommendation,
        weather_checked_at: new Date().toISOString()
      })
      .eq('id', appointment.id);
    
    // Decision logic based on hours until appointment
    if (!windowAssessment.hasViableWindow) {
      if (hoursUntil <= 4) {
        // URGENT: Less than 4 hours - send immediate alert
        await createUrgentAlert(appointment, windowAssessment);
        console.log('   🚨 URGENT ALERT SENT - Weather not suitable!');
      } else if (hoursUntil <= 12) {
        // WARNING: Less than 12 hours - check if already alerted
        const { data: existingAlert } = await supabase
          .from('weather_alerts')
          .select('*')
          .eq('appointment_id', appointment.id)
          .gte('detected_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
          .single();
        
        if (!existingAlert) {
          await createWeatherAlert(appointment, windowAssessment, 'high');
          console.log('   ⚠️ Weather warning created');
        }
      } else {
        // INFO: More than 12 hours - just log
        console.log('   ℹ️ Weather concerns noted, monitoring continues');
      }
    } else if (windowAssessment.warnings.length > 0) {
      // Weather is workable but has warnings
      console.log(`   ✅ Work possible with cautions: ${windowAssessment.warnings.join(', ')}`);
      
      if (windowAssessment.windows.length > 0) {
        const bestWindow = windowAssessment.windows[0];
        console.log(`   🕐 Best window: ${format(bestWindow.start, 'h:mm a')} - ${format(bestWindow.end, 'h:mm a')}`);
      }
    } else {
      console.log('   ✅ Weather looks good!');
    }
    
  } catch (error) {
    console.error(`Error checking appointment ${appointment.id}:`, error);
  }
}

/**
 * Create urgent weather alert
 */
async function createUrgentAlert(appointment: any, assessment: any) {
  // Create alert record
  await supabase
    .from('weather_alerts')
    .insert({
      appointment_id: appointment.id,
      alert_type: assessment.warnings[0]?.includes('rain') ? 'rain' : 
                  assessment.warnings[0]?.includes('storm') ? 'storm' : 'other',
      severity: 'extreme',
      message: `URGENT: ${assessment.recommendation}`,
      detected_at: new Date().toISOString()
    });
  
  // Send immediate notification if contact info available
  if (appointment.attendee_phone) {
    await supabase
      .from('appointment_reminders')
      .insert({
        appointment_id: appointment.id,
        type: 'sms',
        send_at: new Date().toISOString(),
        sent: false,
        recipient_phone: appointment.attendee_phone,
        message: `URGENT WEATHER ALERT: Your ${format(new Date(appointment.scheduled_at), 'h:mm a')} appointment may need to be rescheduled due to weather. ${assessment.recommendation}. Please call us to confirm.`
      });
  }
}

/**
 * Create weather alert
 */
async function createWeatherAlert(appointment: any, assessment: any, severity: string) {
  await supabase
    .from('weather_alerts')
    .insert({
      appointment_id: appointment.id,
      alert_type: assessment.warnings[0]?.includes('rain') ? 'rain' : 'other',
      severity: severity,
      message: assessment.recommendation,
      detected_at: new Date().toISOString()
    });
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🌦️ WEATHER MONITORING SERVICE');
  console.log('='.repeat(60));
  
  // Run once if called directly
  if (require.main === module) {
    await checkUpcomingAppointments();
    console.log('\n✅ Weather check complete');
    process.exit(0);
  }
}

// Export for use as module
export { checkUpcomingAppointments, checkAppointmentWeather };

// Run if called directly
main().catch(console.error);