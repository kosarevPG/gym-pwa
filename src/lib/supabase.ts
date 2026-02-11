import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iabklvkzdffwwrlugiwr.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_49iEmfAfFsckdE00zqsXJw_dKr-AuGD';

export const supabase = createClient(supabaseUrl, supabaseKey);
