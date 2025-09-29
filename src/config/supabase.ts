import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid21ra3NrZHJ2YWlwbWtkZHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2ODI4MTcsImV4cCI6MjA2NzI1ODgxN30.-rBrI8a56Pc-5ROhiZaGtK6QwH1qrZOt7Osmj-lqeJc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);