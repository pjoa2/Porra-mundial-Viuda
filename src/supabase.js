import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dzdewflhasqonthbmkay.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZGV3ZmxoYXNxb250aGJta2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjI5MjgsImV4cCI6MjA5NTUzODkyOH0.6Xso1TOQkVEvmzidPhEQN_CIHsMW2c-yvJjMUQbdRZM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
