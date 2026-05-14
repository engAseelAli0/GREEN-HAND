import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://gsinwkfcefngpzyshtor.supabase.co';
export const supabaseKey = 'sb_publishable_Ck5w11_ZAWaVNTsjp9bDhA_AsKc-3-O';

export const supabase = createClient(supabaseUrl, supabaseKey);
