import { createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// Choix de la configuration selon l'environnement
const config = environment.production ? environment.productionConfig : environment.local;

export const supabase = createClient(config.supabaseUrl, config.supabaseKey);
