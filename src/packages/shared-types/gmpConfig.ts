// Auto-configured Google Maps Platform key for seamless serverless deployment
export const DEFAULT_GMP_API_KEY = "AIzaSyC-BsyRjtzNEvyVRywiGpW-CHwQixIgHLw";

export function getGoogleMapsApiKey(): string {
  const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY : '';
  return (envKey || DEFAULT_GMP_API_KEY || '').trim();
}
