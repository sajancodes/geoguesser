import { ALL_WORLD_COUNTRIES } from './worldCountries';

export interface SearchPlaceItem {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  type: 'country' | 'city' | 'sector';
  detail?: string;
}

// Major cities with precise geodetic origins
const POPULAR_WORLD_CITIES: SearchPlaceItem[] = [
  // Europe
  { id: 'city-paris', name: 'Paris', country: 'France', countryCode: 'FR', lat: 48.8566, lon: 2.3522, type: 'city', detail: 'Capital of France' },
  { id: 'city-london', name: 'London', country: 'United Kingdom', countryCode: 'GB', lat: 51.5074, lon: -0.1278, type: 'city', detail: 'Capital of United Kingdom' },
  { id: 'city-berlin', name: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.5200, lon: 13.4050, type: 'city', detail: 'Capital of Germany' },
  { id: 'city-rome', name: 'Rome', country: 'Italy', countryCode: 'IT', lat: 41.9028, lon: 12.4964, type: 'city', detail: 'Capital of Italy' },
  { id: 'city-madrid', name: 'Madrid', country: 'Spain', countryCode: 'ES', lat: 40.4168, lon: -3.7038, type: 'city', detail: 'Capital of Spain' },
  { id: 'city-amsterdam', name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', lat: 52.3676, lon: 4.9041, type: 'city', detail: 'Capital of Netherlands' },
  { id: 'city-vienna', name: 'Vienna', country: 'Austria', countryCode: 'AT', lat: 48.2082, lon: 16.3738, type: 'city', detail: 'Capital of Austria' },
  { id: 'city-stockholm', name: 'Stockholm', country: 'Sweden', countryCode: 'SE', lat: 59.3293, lon: 18.0686, type: 'city', detail: 'Capital of Sweden' },
  { id: 'city-reykjavik', name: 'Reykjavik', country: 'Iceland', countryCode: 'IS', lat: 64.1466, lon: -21.9426, type: 'city', detail: 'Capital of Iceland' },
  { id: 'city-athens', name: 'Athens', country: 'Greece', countryCode: 'GR', lat: 37.9838, lon: 23.7275, type: 'city', detail: 'Capital of Greece' },
  { id: 'city-prague', name: 'Prague', country: 'Czechia', countryCode: 'CZ', lat: 50.0755, lon: 14.4378, type: 'city', detail: 'Capital of Czechia' },
  { id: 'city-lisbon', name: 'Lisbon', country: 'Portugal', countryCode: 'PT', lat: 38.7223, lon: -9.1393, type: 'city', detail: 'Capital of Portugal' },
  { id: 'city-oslo', name: 'Oslo', country: 'Norway', countryCode: 'NO', lat: 59.9139, lon: 10.7522, type: 'city', detail: 'Capital of Norway' },
  { id: 'city-helsinki', name: 'Helsinki', country: 'Finland', countryCode: 'FI', lat: 60.1699, lon: 24.9384, type: 'city', detail: 'Capital of Finland' },

  // Asia & Middle East
  { id: 'city-tokyo', name: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6762, lon: 139.6503, type: 'city', detail: 'Capital of Japan' },
  { id: 'city-kyoto', name: 'Kyoto', country: 'Japan', countryCode: 'JP', lat: 35.0116, lon: 135.7681, type: 'city', detail: 'Historic cultural capital of Japan' },
  { id: 'city-kathmandu', name: 'Kathmandu', country: 'Nepal', countryCode: 'NP', lat: 27.7172, lon: 85.3240, type: 'city', detail: 'Capital of Nepal' },
  { id: 'city-pokhara', name: 'Pokhara', country: 'Nepal', countryCode: 'NP', lat: 28.2096, lon: 83.9856, type: 'city', detail: 'Annapurna mountain valley, Nepal' },
  { id: 'city-seoul', name: 'Seoul', country: 'South Korea', countryCode: 'KR', lat: 37.5665, lon: 126.9780, type: 'city', detail: 'Capital of South Korea' },
  { id: 'city-beijing', name: 'Beijing', country: 'China', countryCode: 'CN', lat: 39.9042, lon: 116.4074, type: 'city', detail: 'Capital of China' },
  { id: 'city-shanghai', name: 'Shanghai', country: 'China', countryCode: 'CN', lat: 31.2304, lon: 121.4737, type: 'city', detail: 'Major metropolis, China' },
  { id: 'city-delhi', name: 'New Delhi', country: 'India', countryCode: 'IN', lat: 28.6139, lon: 77.2090, type: 'city', detail: 'Capital of India' },
  { id: 'city-mumbai', name: 'Mumbai', country: 'India', countryCode: 'IN', lat: 19.0760, lon: 72.8777, type: 'city', detail: 'West Coast, India' },
  { id: 'city-bangkok', name: 'Bangkok', country: 'Thailand', countryCode: 'TH', lat: 13.7563, lon: 100.5018, type: 'city', detail: 'Capital of Thailand' },
  { id: 'city-singapore', name: 'Singapore', country: 'Singapore', countryCode: 'SG', lat: 1.3521, lon: 103.8198, type: 'city', detail: 'Island nation city-state' },
  { id: 'city-dubai', name: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', lat: 25.2048, lon: 55.2708, type: 'city', detail: 'United Arab Emirates' },
  { id: 'city-istanbul', name: 'Istanbul', country: 'Turkey', countryCode: 'TR', lat: 41.0082, lon: 28.9784, type: 'city', detail: 'Bosphorus strait, Turkey' },

  // Americas
  { id: 'city-new-york', name: 'New York', country: 'United States', countryCode: 'US', lat: 40.7128, lon: -74.0060, type: 'city', detail: 'New York, United States' },
  { id: 'city-los-angeles', name: 'Los Angeles', country: 'United States', countryCode: 'US', lat: 34.0522, lon: -118.2437, type: 'city', detail: 'California, United States' },
  { id: 'city-toronto', name: 'Toronto', country: 'Canada', countryCode: 'CA', lat: 43.6532, lon: -79.3832, type: 'city', detail: 'Ontario, Canada' },
  { id: 'city-vancouver', name: 'Vancouver', country: 'Canada', countryCode: 'CA', lat: 49.2827, lon: -123.1207, type: 'city', detail: 'British Columbia, Canada' },
  { id: 'city-mexico-city', name: 'Mexico City', country: 'Mexico', countryCode: 'MX', lat: 19.4326, lon: -99.1332, type: 'city', detail: 'Capital of Mexico' },
  { id: 'city-rio', name: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR', lat: -22.9068, lon: -43.1729, type: 'city', detail: 'Coastal metropolis, Brazil' },
  { id: 'city-sao-paulo', name: 'São Paulo', country: 'Brazil', countryCode: 'BR', lat: -23.5505, lon: -46.6333, type: 'city', detail: 'Major metropolis, Brazil' },
  { id: 'city-buenos-aires', name: 'Buenos Aires', country: 'Argentina', countryCode: 'AR', lat: -34.6037, lon: -58.3816, type: 'city', detail: 'Capital of Argentina' },
  { id: 'city-santiago', name: 'Santiago', country: 'Chile', countryCode: 'CL', lat: -33.4489, lon: -70.6693, type: 'city', detail: 'Capital of Chile' },
  { id: 'city-valparaiso', name: 'Valparaíso', country: 'Chile', countryCode: 'CL', lat: -33.0472, lon: -71.6127, type: 'city', detail: 'Coastal hills, Chile' },
  { id: 'city-bogota', name: 'Bogotá', country: 'Colombia', countryCode: 'CO', lat: 4.7110, lon: -74.0721, type: 'city', detail: 'Capital of Colombia' },
  { id: 'city-lima', name: 'Lima', country: 'Peru', countryCode: 'PE', lat: -12.0464, lon: -77.0428, type: 'city', detail: 'Capital of Peru' },

  // Africa & Oceania
  { id: 'city-cairo', name: 'Cairo', country: 'Egypt', countryCode: 'EG', lat: 30.0444, lon: 31.2357, type: 'city', detail: 'Capital of Egypt' },
  { id: 'city-nairobi', name: 'Nairobi', country: 'Kenya', countryCode: 'KE', lat: -1.2921, lon: 36.8219, type: 'city', detail: 'Capital of Kenya' },
  { id: 'city-marrakech', name: 'Marrakech', country: 'Morocco', countryCode: 'MA', lat: 31.6295, lon: -7.9811, type: 'city', detail: 'Historic Imperial City, Morocco' },
  { id: 'city-cape-town', name: 'Cape Town', country: 'South Africa', countryCode: 'ZA', lat: -33.9249, lon: 18.4241, type: 'city', detail: 'South Africa' },
  { id: 'city-sydney', name: 'Sydney', country: 'Australia', countryCode: 'AU', lat: -33.8688, lon: 151.2093, type: 'city', detail: 'New South Wales, Australia' },
  { id: 'city-melbourne', name: 'Melbourne', country: 'Australia', countryCode: 'AU', lat: -37.8136, lon: 144.9631, type: 'city', detail: 'Victoria, Australia' },
  { id: 'city-auckland', name: 'Auckland', country: 'New Zealand', countryCode: 'NZ', lat: -36.8485, lon: 174.7633, type: 'city', detail: 'New Zealand' },
];

// Pre-compiled search index from 200+ sovereign countries
const COUNTRY_SEARCH_ITEMS: SearchPlaceItem[] = ALL_WORLD_COUNTRIES.map((c) => ({
  id: `country-${c.code.toLowerCase()}`,
  name: c.name,
  country: c.name,
  countryCode: c.code,
  lat: c.lat,
  lon: c.lon,
  type: 'country',
  detail: `${c.cityName} (${c.code}) · ${c.description.slice(0, 48)}...`,
}));

export const MASTER_SEARCH_INDEX: SearchPlaceItem[] = [
  ...COUNTRY_SEARCH_ITEMS,
  ...POPULAR_WORLD_CITIES,
];

/**
 * Searches countries and cities instantly without network calls
 */
export function searchWorldPlaces(query: string, limit: number = 8): SearchPlaceItem[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const exactCountryMatch = MASTER_SEARCH_INDEX.filter(
    (item) => item.type === 'country' && item.name.toLowerCase() === clean
  );

  const exactCityMatch = MASTER_SEARCH_INDEX.filter(
    (item) => item.type === 'city' && item.name.toLowerCase() === clean
  );

  const startsWithMatches = MASTER_SEARCH_INDEX.filter((item) => {
    if (exactCountryMatch.includes(item) || exactCityMatch.includes(item)) return false;
    return (
      item.name.toLowerCase().startsWith(clean) ||
      item.countryCode.toLowerCase() === clean ||
      item.country.toLowerCase().startsWith(clean)
    );
  });

  const containsMatches = MASTER_SEARCH_INDEX.filter((item) => {
    if (
      exactCountryMatch.includes(item) ||
      exactCityMatch.includes(item) ||
      startsWithMatches.includes(item)
    ) {
      return false;
    }
    return (
      item.name.toLowerCase().includes(clean) ||
      item.country.toLowerCase().includes(clean) ||
      (item.detail && item.detail.toLowerCase().includes(clean))
    );
  });

  const combined = [
    ...exactCountryMatch,
    ...exactCityMatch,
    ...startsWithMatches,
    ...containsMatches,
  ];

  return combined.slice(0, limit);
}
