/**
 * Weather Service for Construction Scheduling
 * Checks weather conditions to determine if outdoor work is safe/possible
 */

import axios from 'axios';

// Using OpenWeatherMap API (you'll need to sign up for a free API key)
// Alternative: WeatherAPI, AccuWeather, or NOAA Weather Service
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'your-api-key-here';
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';

interface WeatherConditions {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  description: string;
  main: string;
  isRaining: boolean;
  isSnowing: boolean;
  visibility: number;
  cloudCoverage: number;
}

interface WeatherForecast {
  date: Date;
  conditions: WeatherConditions;
  isSafeForOutdoorWork: boolean;
  warnings: string[];
  recommendation: string;
}

interface LocationCoordinates {
  lat: number;
  lon: number;
}

class WeatherService {
  /**
   * Get coordinates from address using geocoding
   */
  async getCoordinates(address: string): Promise<LocationCoordinates> {
    try {
      const response = await axios.get(
        `http://api.openweathermap.org/geo/1.0/direct`,
        {
          params: {
            q: address,
            limit: 1,
            appid: OPENWEATHER_API_KEY
          }
        }
      );

      if (response.data && response.data.length > 0) {
        return {
          lat: response.data[0].lat,
          lon: response.data[0].lon
        };
      }

      // Fallback to a default location if geocoding fails
      console.warn('Geocoding failed, using default location');
      return { lat: 33.7490, lon: -84.3880 }; // Atlanta, GA
    } catch (error) {
      console.error('Error getting coordinates:', error);
      return { lat: 33.7490, lon: -84.3880 }; // Atlanta, GA
    }
  }

  /**
   * Get current weather for a location
   */
  async getCurrentWeather(location: string | LocationCoordinates): Promise<WeatherConditions> {
    try {
      let coords: LocationCoordinates;
      
      if (typeof location === 'string') {
        coords = await this.getCoordinates(location);
      } else {
        coords = location;
      }

      const response = await axios.get(
        `${WEATHER_API_BASE}/weather`,
        {
          params: {
            lat: coords.lat,
            lon: coords.lon,
            appid: OPENWEATHER_API_KEY,
            units: 'imperial' // Use Fahrenheit for US
          }
        }
      );

      const data = response.data;
      
      return {
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        precipitation: data.rain ? data.rain['1h'] || 0 : 0,
        description: data.weather[0].description,
        main: data.weather[0].main.toLowerCase(),
        isRaining: data.weather[0].main.toLowerCase().includes('rain'),
        isSnowing: data.weather[0].main.toLowerCase().includes('snow'),
        visibility: data.visibility / 1000, // Convert to km
        cloudCoverage: data.clouds.all
      };
    } catch (error) {
      console.error('Error fetching weather:', error);
      throw new Error('Unable to fetch weather data');
    }
  }

  /**
   * Get weather forecast for next 5 days
   */
  async getWeatherForecast(location: string | LocationCoordinates, days: number = 5): Promise<WeatherForecast[]> {
    try {
      let coords: LocationCoordinates;
      
      if (typeof location === 'string') {
        coords = await this.getCoordinates(location);
      } else {
        coords = location;
      }

      const response = await axios.get(
        `${WEATHER_API_BASE}/forecast`,
        {
          params: {
            lat: coords.lat,
            lon: coords.lon,
            appid: OPENWEATHER_API_KEY,
            units: 'imperial',
            cnt: days * 8 // API returns data every 3 hours, so 8 per day
          }
        }
      );

      const forecasts: WeatherForecast[] = [];
      const dailyData = new Map<string, any[]>();

      // Group data by day
      response.data.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toISOString().split('T')[0];
        
        if (!dailyData.has(dateKey)) {
          dailyData.set(dateKey, []);
        }
        dailyData.get(dateKey)?.push(item);
      });

      // Process each day
      dailyData.forEach((dayItems, dateKey) => {
        // Get the worst conditions of the day (most restrictive for work)
        let worstConditions: any = null;
        let maxRain = 0;
        let maxWind = 0;
        let minTemp = 100;
        let maxTemp = -100;

        dayItems.forEach(item => {
          const rain = item.rain ? item.rain['3h'] || 0 : 0;
          const wind = item.wind.speed;
          const temp = item.main.temp;

          if (rain > maxRain) {
            maxRain = rain;
            worstConditions = item;
          }
          if (wind > maxWind) {
            maxWind = wind;
          }
          if (temp < minTemp) minTemp = temp;
          if (temp > maxTemp) maxTemp = temp;
        });

        if (worstConditions) {
          const conditions: WeatherConditions = {
            temperature: Math.round((minTemp + maxTemp) / 2),
            feelsLike: Math.round(worstConditions.main.feels_like),
            humidity: worstConditions.main.humidity,
            windSpeed: Math.round(maxWind),
            precipitation: maxRain,
            description: worstConditions.weather[0].description,
            main: worstConditions.weather[0].main.toLowerCase(),
            isRaining: maxRain > 0 || worstConditions.weather[0].main.toLowerCase().includes('rain'),
            isSnowing: worstConditions.weather[0].main.toLowerCase().includes('snow'),
            visibility: worstConditions.visibility / 1000,
            cloudCoverage: worstConditions.clouds.all
          };

          const assessment = this.assessWorkSafety(conditions);
          
          forecasts.push({
            date: new Date(dateKey),
            conditions,
            isSafeForOutdoorWork: assessment.isSafe,
            warnings: assessment.warnings,
            recommendation: assessment.recommendation
          });
        }
      });

      return forecasts;
    } catch (error) {
      console.error('Error fetching forecast:', error);
      throw new Error('Unable to fetch weather forecast');
    }
  }

  /**
   * Get hourly weather forecast for detailed planning
   */
  async getHourlyForecast(location: string | LocationCoordinates, hours: number = 48): Promise<any[]> {
    try {
      let coords: LocationCoordinates;
      
      if (typeof location === 'string') {
        coords = await this.getCoordinates(location);
      } else {
        coords = location;
      }

      const response = await axios.get(
        `${WEATHER_API_BASE}/forecast`,
        {
          params: {
            lat: coords.lat,
            lon: coords.lon,
            appid: OPENWEATHER_API_KEY,
            units: 'imperial',
            cnt: Math.min(hours / 3, 40) // API returns 3-hour intervals, max 40
          }
        }
      );

      const hourlyData = response.data.list.map((item: any) => ({
        time: new Date(item.dt * 1000),
        temperature: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        humidity: item.main.humidity,
        windSpeed: Math.round(item.wind.speed),
        precipitation: item.rain ? item.rain['3h'] || 0 : 0,
        precipitationChance: item.pop * 100, // Probability of precipitation
        description: item.weather[0].description,
        main: item.weather[0].main.toLowerCase(),
        isRaining: item.weather[0].main.toLowerCase().includes('rain'),
        cloudCoverage: item.clouds.all,
        visibility: item.visibility / 1000
      }));

      return hourlyData;
    } catch (error) {
      console.error('Error fetching hourly forecast:', error);
      return [];
    }
  }

  /**
   * Assess work windows based on hourly weather
   */
  async assessWorkWindows(
    location: string,
    date: Date,
    workDuration: number = 8, // hours needed for work
    minimumWindow: number = 3  // minimum continuous good weather hours
  ): Promise<{
    hasViableWindow: boolean;
    windows: Array<{start: Date; end: Date; duration: number}>;
    warnings: string[];
    recommendation: string;
  }> {
    const hourlyForecast = await this.getHourlyForecast(location, 48);
    const targetDate = date.toDateString();
    
    // Filter to the target day
    const dayForecast = hourlyForecast.filter(h => 
      h.time.toDateString() === targetDate
    );

    if (dayForecast.length === 0) {
      return {
        hasViableWindow: false,
        windows: [],
        warnings: ['No forecast data available'],
        recommendation: 'Check weather closer to date'
      };
    }

    // Find work windows
    const windows: Array<{start: Date; end: Date; duration: number}> = [];
    let currentWindow: any = null;
    let totalRainHours = 0;
    let maxRainDuration = 0;
    let currentRainDuration = 0;

    for (let i = 0; i < dayForecast.length; i++) {
      const hour = dayForecast[i];
      const isSafe = this.assessHourlyConditions(hour);
      
      if (hour.precipitation > 0) {
        totalRainHours += 3; // Each forecast point is 3 hours
        currentRainDuration += 3;
        maxRainDuration = Math.max(maxRainDuration, currentRainDuration);
      } else {
        currentRainDuration = 0;
      }

      if (isSafe.isSafe) {
        if (!currentWindow) {
          currentWindow = { start: hour.time, end: hour.time };
        } else {
          currentWindow.end = new Date(hour.time.getTime() + 3 * 60 * 60 * 1000);
        }
      } else {
        if (currentWindow) {
          const duration = (currentWindow.end.getTime() - currentWindow.start.getTime()) / (1000 * 60 * 60);
          if (duration >= minimumWindow) {
            windows.push({
              start: currentWindow.start,
              end: currentWindow.end,
              duration
            });
          }
          currentWindow = null;
        }
      }
    }

    // Add last window if exists
    if (currentWindow) {
      const duration = (currentWindow.end.getTime() - currentWindow.start.getTime()) / (1000 * 60 * 60);
      if (duration >= minimumWindow) {
        windows.push({
          start: currentWindow.start,
          end: currentWindow.end,
          duration
        });
      }
    }

    // Determine recommendation based on rain patterns
    let recommendation = '';
    const warnings: string[] = [];

    if (totalRainHours <= 3 && windows.some(w => w.duration >= workDuration)) {
      recommendation = 'Brief showers expected, work can proceed between rain';
      warnings.push(`Light rain for ~${totalRainHours} hours total`);
    } else if (maxRainDuration > 6) {
      recommendation = 'Extended rain period, consider rescheduling';
      warnings.push(`Continuous rain for ${maxRainDuration} hours`);
    } else if (windows.length > 0) {
      const bestWindow = windows.sort((a, b) => b.duration - a.duration)[0];
      recommendation = `Best work window: ${bestWindow.start.toLocaleTimeString()} - ${bestWindow.end.toLocaleTimeString()}`;
    } else {
      recommendation = 'No suitable work windows available';
      warnings.push('Intermittent rain throughout the day');
    }

    return {
      hasViableWindow: windows.some(w => w.duration >= minimumWindow),
      windows,
      warnings,
      recommendation
    };
  }

  /**
   * Assess hourly conditions
   */
  assessHourlyConditions(conditions: any): {isSafe: boolean; reason?: string} {
    // Light drizzle (< 0.1 inches per 3 hours) might be workable
    if (conditions.precipitation > 0.3) { // More than 0.3 inches in 3 hours
      return {isSafe: false, reason: 'Heavy rain'};
    }
    
    if (conditions.precipitation > 0.1 && conditions.precipitation <= 0.3) {
      // Light rain - some work might continue
      if (conditions.windSpeed < 15) {
        return {isSafe: true, reason: 'Light rain - indoor/covered work possible'};
      }
    }
    
    if (conditions.windSpeed > 30) {
      return {isSafe: false, reason: 'High winds'};
    }
    
    if (conditions.main.includes('thunderstorm')) {
      return {isSafe: false, reason: 'Thunderstorm'};
    }
    
    if (conditions.temperature < 25 || conditions.temperature > 100) {
      return {isSafe: false, reason: 'Extreme temperature'};
    }
    
    return {isSafe: true};
  }

  /**
   * Assess if weather conditions are safe for outdoor construction work
   */
  assessWorkSafety(conditions: WeatherConditions): {
    isSafe: boolean;
    warnings: string[];
    recommendation: string;
  } {
    const warnings: string[] = [];
    let isSafe = true;
    let recommendation = 'Good conditions for outdoor work';

    // Updated rain check - only flag if significant rain
    if (conditions.precipitation > 0.5) { // More than 0.5 inches 
      warnings.push('Heavy rain expected - outdoor work should be postponed');
      isSafe = false;
      recommendation = 'Reschedule outdoor work';
    } else if (conditions.precipitation > 0.2) {
      warnings.push('Moderate rain - some work may be impacted');
      recommendation = 'Monitor conditions, have rain protection ready';
    } else if (conditions.precipitation > 0) {
      warnings.push('Light rain possible - most work can continue');
      recommendation = 'Prepare for brief showers';
    }

    if (conditions.isSnowing) {
      warnings.push('Snow expected - outdoor work not recommended');
      isSafe = false;
      recommendation = 'Reschedule all outdoor work';
    }

    // Wind check (OSHA guidelines)
    if (conditions.windSpeed > 30) {
      warnings.push('High winds - crane and elevated work restricted');
      isSafe = false;
      recommendation = 'Postpone crane operations and roof work';
    } else if (conditions.windSpeed > 20) {
      warnings.push('Moderate winds - exercise caution with elevated work');
    }

    // Temperature checks
    if (conditions.temperature < 32) {
      warnings.push('Freezing conditions - concrete pouring affected');
      if (conditions.temperature < 20) {
        isSafe = false;
        recommendation = 'Too cold for most outdoor construction';
      }
    } else if (conditions.temperature > 95) {
      warnings.push('Extreme heat - frequent breaks required');
      if (conditions.temperature > 100) {
        warnings.push('Heat advisory - consider rescheduling');
      }
    }

    // Visibility check
    if (conditions.visibility < 0.5) {
      warnings.push('Poor visibility - equipment operation hazardous');
      isSafe = false;
      recommendation = 'Delay work until visibility improves';
    }

    // Thunderstorm check
    if (conditions.main.includes('thunderstorm')) {
      warnings.push('Thunderstorm - all outdoor work must stop');
      isSafe = false;
      recommendation = 'Stop all work immediately, seek shelter';
    }

    // If no issues, but not perfect
    if (isSafe && warnings.length === 0) {
      if (conditions.cloudCoverage > 80) {
        recommendation = 'Overcast but suitable for work';
      } else if (conditions.temperature > 70 && conditions.temperature < 85) {
        recommendation = 'Excellent conditions for outdoor work';
      }
    }

    return {
      isSafe,
      warnings,
      recommendation
    };
  }

  /**
   * Get the next best day for outdoor work
   */
  async getNextGoodWorkDay(location: string, startDate: Date = new Date()): Promise<{
    date: Date;
    conditions: WeatherConditions;
    recommendation: string;
  } | null> {
    try {
      const forecast = await this.getWeatherForecast(location, 7);
      
      for (const day of forecast) {
        if (day.date >= startDate && day.isSafeForOutdoorWork) {
          return {
            date: day.date,
            conditions: day.conditions,
            recommendation: day.recommendation
          };
        }
      }

      // If no good days in the next week, return the least bad option
      const sortedDays = forecast
        .filter(day => day.date >= startDate)
        .sort((a, b) => b.warnings.length - a.warnings.length);

      if (sortedDays.length > 0) {
        return {
          date: sortedDays[0].date,
          conditions: sortedDays[0].conditions,
          recommendation: 'Not ideal, but best available option this week'
        };
      }

      return null;
    } catch (error) {
      console.error('Error finding good work day:', error);
      return null;
    }
  }

  /**
   * Check if a specific date/time is good for outdoor work
   */
  async checkSchedulingDate(
    location: string,
    scheduledDate: Date,
    workType: 'indoor' | 'outdoor' | 'mixed' = 'outdoor'
  ): Promise<{
    canProceed: boolean;
    warnings: string[];
    alternativeDate?: Date;
    recommendation: string;
  }> {
    try {
      // Indoor work is always OK
      if (workType === 'indoor') {
        return {
          canProceed: true,
          warnings: [],
          recommendation: 'Indoor work not affected by weather'
        };
      }

      const forecast = await this.getWeatherForecast(location, 7);
      const targetDateStr = scheduledDate.toISOString().split('T')[0];
      
      const dayForecast = forecast.find(f => 
        f.date.toISOString().split('T')[0] === targetDateStr
      );

      if (!dayForecast) {
        // Date is too far in the future
        return {
          canProceed: true,
          warnings: ['Weather forecast not available for this date'],
          recommendation: 'Check weather closer to the date'
        };
      }

      if (dayForecast.isSafeForOutdoorWork) {
        return {
          canProceed: true,
          warnings: dayForecast.warnings,
          recommendation: dayForecast.recommendation
        };
      }

      // Find alternative date
      const nextGoodDay = await this.getNextGoodWorkDay(location, scheduledDate);
      
      return {
        canProceed: false,
        warnings: dayForecast.warnings,
        alternativeDate: nextGoodDay?.date,
        recommendation: nextGoodDay 
          ? `Reschedule to ${nextGoodDay.date.toLocaleDateString()} - ${nextGoodDay.recommendation}`
          : dayForecast.recommendation
      };
    } catch (error) {
      console.error('Error checking scheduling date:', error);
      return {
        canProceed: true,
        warnings: ['Unable to check weather'],
        recommendation: 'Proceed with caution, check weather manually'
      };
    }
  }
}

export default new WeatherService();