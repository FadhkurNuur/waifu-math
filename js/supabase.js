// Inisialisasi Supabase client — ganti URL dan KEY dengan milik project kamu
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://ovxiejohaqgznyrmrege.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eGllam9oYXFnem55cm1yZWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MjAzMzgsImV4cCI6MjEwMzM5NjMzOH0.rkLLffHndNJfo54KVALaZXFCAAF4pmW9YNoA9HrZggQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
