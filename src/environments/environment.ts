import packageInfo from '../../package.json';

export const environment = {
  production: false, //Mettre à true pour le push Vercel
  version: packageInfo.version, // Récupère la version depuis package.json

  local: {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  },
  productionConfig: {
    supabaseUrl: 'https://ubatjnagrwjmpkuhvmli.supabase.co',
    supabaseKey: 'sb_publishable_jbshHezTMhnzXE3kf6mE5A_U1no3tam',
  },
  /*
  supabaseUrl: 'https://ubatjnagrwjmpkuhvmli.supabase.co',
  supabaseKey: 'sb_publishable_jbshHezTMhnzXE3kf6mE5A_U1no3tam'
  */
};
