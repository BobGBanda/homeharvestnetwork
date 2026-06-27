// SETUP: copy this file to js/supabase-config.js (same folder) and fill in
// your real project values below. js/supabase-config.js is what every page
// (subscriptions.html, checkout.js, etc.) actually loads — this .example
// file is just a safe template and is never loaded by the site itself.
//
// Where to find these values: Supabase Dashboard -> Project Settings -> API
//   - "Project URL"      -> url
//   - "anon" "public" key -> anonKey   (safe to expose in frontend code —
//                                       this is NOT the service_role/secret key)
//
// Do NOT put your service_role key, PAYFAST_MERCHANT_KEY, or any other
// secret in this file. Those live only as Supabase Edge Function secrets
// (Dashboard -> Edge Functions -> create-payfast-payment -> Secrets), never
// in a file that ships to the browser.

window.HHN_SUPABASE_CONFIG = {
  url: 'https://ozbgnmlccosoykavjkrj.supabase.co',
  anonKey: 'sb_publishable_d1XuhY1HqlBcusLoMCyAxA_WZaXkCkn',
};
