import React, { useState } from 'react';
import { MapPin, Globe, Play, Sparkles, Database, Check, Search, X } from 'lucide-react';
import { ALL_WORLD_COUNTRIES } from '../packages/coverage/worldCountries';

export type SelectionType = 'city' | 'country' | 'random';

export interface CityOption {
  name: string;
  country: string;
  countryCode: string;
  description: string;
}

export const AVAILABLE_CITIES: CityOption[] = [
  { name: 'Paris', country: 'France', countryCode: 'FR', description: 'Parisian streets & boulevards' },
  { name: 'Tokyo', country: 'Japan', countryCode: 'JP', description: 'Tokyo urban quarters & avenues' },
  { name: 'Berlin', country: 'Germany', countryCode: 'DE', description: 'Berlin boulevards & historic Mitte' },
  { name: 'Madrid', country: 'Spain', countryCode: 'ES', description: 'Madrid avenues & historic plazas' },
  { name: 'New York', country: 'United States', countryCode: 'US', description: 'New York avenues & waterfronts' },
  { name: 'London', country: 'United Kingdom', countryCode: 'GB', description: 'London streets & historic quarters' },
  { name: 'Rome', country: 'Italy', countryCode: 'IT', description: 'Rome vicoli & baroque piazzas' },
  { name: 'Toronto', country: 'Canada', countryCode: 'CA', description: 'Toronto old town & city avenues' },
  { name: 'Sydney', country: 'Australia', countryCode: 'AU', description: 'Sydney circular quay & harbour lanes' },
  { name: 'Cairo', country: 'Egypt', countryCode: 'EG', description: 'Historic Islamic Cairo & Nile banks' },
  { name: 'Seoul', country: 'South Korea', countryCode: 'KR', description: 'Seoul hanok quarters & boulevards' },
  { name: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR', description: 'Rio coastal hills & avenues' },
  { name: 'Vienna', country: 'Austria', countryCode: 'AT', description: 'Imperial ringstrasse & baroque altstadt' },
  { name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', description: 'Amsterdam canals & brick lanes' },
  { name: 'Istanbul', country: 'Turkey', countryCode: 'TR', description: 'Bosphorus strait & Sultanahmet alleys' },
  { name: 'Stockholm', country: 'Sweden', countryCode: 'SE', description: 'Stockholm gamla stan cobblestones' },
  { name: 'Kyoto', country: 'Japan', countryCode: 'JP', description: 'Kyoto traditional lanes & temples' },
  { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', description: 'Highland plateau avenues & acacia trees' },
  { name: 'Marrakech', country: 'Morocco', countryCode: 'MA', description: 'Marrakech medina & clay streets' },
  { name: 'Reykjavik', country: 'Iceland', countryCode: 'IS', description: 'Reykjavik Nordic coastal streets' },
  { name: 'Valparaíso', country: 'Chile', countryCode: 'CL', description: 'Valparaíso hillside mural streets' },
];

export interface CountryOption {
  code: string;
  name: string;
  description: string;
}

export const AVAILABLE_COUNTRIES: CountryOption[] = ALL_WORLD_COUNTRIES.map((c) => ({
  code: c.code,
  name: c.name,
  description: c.description,
})).sort((a, b) => a.name.localeCompare(b.name));

export interface TitleScreenModalProps {
  selectionType: SelectionType;
  onChangeSelectionType: (type: SelectionType) => void;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  selectedCountryCode: string;
  onSelectCountry: (code: string) => void;
  isStarting: boolean;
  onStartGame: () => void;
  onOpenCoverageDrawer?: () => void;
}

export const TitleScreenModal: React.FC<TitleScreenModalProps> = ({
  selectionType,
  onChangeSelectionType,
  selectedCity,
  onSelectCity,
  selectedCountryCode,
  onSelectCountry,
  isStarting,
  onStartGame,
  onOpenCoverageDrawer,
}) => {
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  const activeCity =
    AVAILABLE_CITIES.find((c) => c.name.toLowerCase() === selectedCity.toLowerCase()) ?? {
      name: selectedCity,
      country: 'Global',
      countryCode: 'XX',
      description: 'Custom city drop',
    };

  const activeCountry =
    AVAILABLE_COUNTRIES.find((c) => c.code.toLowerCase() === selectedCountryCode.toLowerCase()) ?? {
      code: selectedCountryCode,
      name: selectedCountryCode,
      description: 'Custom country sector',
    };

  // Filter countries by search query
  const filteredCountries = AVAILABLE_COUNTRIES.filter((c) => {
    const q = countrySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  // Filter cities by search query
  const filteredCities = AVAILABLE_CITIES.filter((c) => {
    const q = citySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q) ||
      c.countryCode.toLowerCase().includes(q)
    );
  });

  const getTargetCtaLabel = () => {
    if (selectionType === 'city') return `Drop into Random Place in ${activeCity.name}`;
    if (selectionType === 'country') return `Drop into Random Place in ${activeCountry.name}`;
    return 'Drop into Random Location on Earth';
  };

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 sm:p-8">
      {/* Top spacer (status strip removed completely) */}
      <div />

      {/* Main Landing Modal Card */}
      <main className="pointer-events-auto w-full max-w-2xl border border-[#262a30] bg-[#111315]/95 backdrop-blur-md p-5 sm:p-6 rounded-[4px] shadow-2xl mx-auto my-auto">
        {/* Emblem & Title Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262a30]">
          <div className="flex items-center gap-3.5">
            <svg
              viewBox="0 0 48 48"
              className="w-11 h-11 shrink-0"
              role="img"
              aria-label="Earth Uncovered Emblem"
            >
              <rect x="2" y="2" width="44" height="44" rx="4" fill="#181b1f" stroke="#262a30" strokeWidth="2" />
              <circle cx="24" cy="24" r="15" fill="none" stroke="#0284c7" strokeWidth="1.75" />
              <ellipse cx="24" cy="24" rx="8" ry="15" fill="none" stroke="#9ca3af" strokeWidth="1.25" />
              <line x1="9" y1="24" x2="39" y2="24" stroke="#9ca3af" strokeWidth="1.25" />
              <line x1="24" y1="9" x2="24" y2="39" stroke="#0284c7" strokeWidth="1.5" />
              <rect x="21" y="21" width="6" height="6" fill="#0284c7" />
            </svg>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#f3f4f6]">
                EARTH UNCOVERED
              </h1>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Real-World Street View 3D Deduction Game
              </p>
            </div>
          </div>

          {onOpenCoverageDrawer && (
            <button
              type="button"
              onClick={onOpenCoverageDrawer}
              title="Coverage Registry"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#9ca3af] hover:text-[#f3f4f6] rounded-[4px] cursor-pointer transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
              <span>Coverage</span>
            </button>
          )}
        </div>

        {/* Selection Category Tabs: City vs Country vs Anywhere */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#f3f4f6] mb-2.5">
            <span>Select Where You Want to Be Dropped</span>
            <span className="font-mono text-[11px] text-[#9ca3af]">Mystery Drop · Find Where You Are</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#181b1f] border border-[#262a30] rounded-[4px]">
            <button
              type="button"
              onClick={() => onChangeSelectionType('city')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-[3px] transition-colors cursor-pointer ${
                selectionType === 'city'
                  ? 'bg-[#0284c7] text-white shadow'
                  : 'text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#20252c]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Select City</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeSelectionType('country')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-[3px] transition-colors cursor-pointer ${
                selectionType === 'country'
                  ? 'bg-[#0284c7] text-white shadow'
                  : 'text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#20252c]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Select Country</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeSelectionType('random')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-[3px] transition-colors cursor-pointer ${
                selectionType === 'random'
                  ? 'bg-[#0284c7] text-white shadow'
                  : 'text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#20252c]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Anywhere</span>
            </button>
          </div>
        </div>

        {/* Content Options Area */}
        <div className="mt-3.5">
          {/* TAB 1: SELECT CITY */}
          {selectionType === 'city' && (
            <div>
              {/* City Manual Search Bar */}
              <div className="relative mb-2.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  type="text"
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredCities.length > 0) {
                      e.preventDefault();
                      onSelectCity(filteredCities[0].name);
                    }
                  }}
                  placeholder="Search city (e.g. Paris, Tokyo, Berlin, New York, London, Rome...)"
                  className="w-full pl-9 pr-8 py-2 bg-[#181b1f] border border-[#262a30] focus:border-[#0284c7] focus:outline-none rounded-[4px] text-xs text-[#f3f4f6] placeholder-[#6b7280] font-sans"
                />
                {citySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCitySearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#f3f4f6] p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredCities.map((city) => {
                  const isSelected = selectedCity.toLowerCase() === city.name.toLowerCase();
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => onSelectCity(city.name)}
                      className={`text-left p-2.5 rounded-[4px] border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#0284c7] bg-[#162536] ring-1 ring-[#0284c7]'
                          : 'border-[#262a30] bg-[#181b1f] hover:border-[#38414e] hover:bg-[#1c222a]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-sm text-[#f3f4f6]">{city.name}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" strokeWidth={3} />
                        )}
                      </div>
                      <div className="text-[11px] text-[#9ca3af] mt-0.5">{city.country}</div>
                      <div className="text-[10px] text-[#6b7280] mt-1 font-mono">
                        Random Street Drop
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: SELECT COUNTRY WITH MANUAL SEARCH */}
          {selectionType === 'country' && (
            <div>
              {/* Country Manual Search Input Bar */}
              <div className="relative mb-2.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  type="text"
                  value={countrySearchQuery}
                  onChange={(e) => setCountrySearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredCountries.length > 0) {
                      e.preventDefault();
                      onSelectCountry(filteredCountries[0].code);
                    }
                  }}
                  placeholder="Search country by name or code (e.g. Germany, Japan, Spain, Canada, US, India, Italy...)"
                  className="w-full pl-9 pr-8 py-2 bg-[#181b1f] border border-[#262a30] focus:border-[#0284c7] focus:outline-none rounded-[4px] text-xs text-[#f3f4f6] placeholder-[#6b7280] font-sans"
                />
                {countrySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCountrySearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#f3f4f6] p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Header for Filtered Results */}
              <div className="flex items-center justify-between text-[11px] text-[#9ca3af] mb-1.5 px-0.5">
                <span>
                  {countrySearchQuery
                    ? `${filteredCountries.length} ${filteredCountries.length === 1 ? 'country' : 'countries'} found`
                    : `${AVAILABLE_COUNTRIES.length} Countries Available (Click or Search)`}
                </span>
                <span className="font-mono text-[10px]">
                  Current: <strong className="text-[#0284c7]">{activeCountry.name} [{activeCountry.code}]</strong>
                </span>
              </div>

              {/* Country Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredCountries.map((country) => {
                  const isSelected = selectedCountryCode.toLowerCase() === country.code.toLowerCase();
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => onSelectCountry(country.code)}
                      className={`text-left p-2.5 rounded-[4px] border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#0284c7] bg-[#162536] ring-1 ring-[#0284c7]'
                          : 'border-[#262a30] bg-[#181b1f] hover:border-[#38414e] hover:bg-[#1c222a]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-sm text-[#f3f4f6]">{country.name}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#0284c7] shrink-0" strokeWidth={3} />
                        )}
                      </div>
                      <div className="text-[10px] text-[#6b7280] mt-1 font-mono">
                        [{country.code}] Random Sector
                      </div>
                    </button>
                  );
                })}

                {filteredCountries.length === 0 && countrySearchQuery && (
                  <div className="col-span-2 sm:col-span-4 p-4 text-center border border-dashed border-[#262a30] rounded-[4px] bg-[#181b1f]">
                    <p className="text-xs text-[#f3f4f6]">
                      No standard sector matching &ldquo;{countrySearchQuery}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelectCountry(countrySearchQuery.trim())}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Search &amp; Drop into &ldquo;{countrySearchQuery.trim()}&rdquo;</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ANYWHERE ON EARTH */}
          {selectionType === 'random' && (
            <div className="border border-[#262a30] bg-[#181b1f] p-4 rounded-[4px]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#f3f4f6]">
                <Sparkles className="w-4 h-4 text-[#0284c7]" />
                <span>Worldwide Mystery Drop</span>
              </div>
              <p className="text-xs text-[#9ca3af] mt-2 leading-relaxed">
                Spawn at a completely unknown random location somewhere on Earth.
                Explore the streets with WASD free roam, inspect road signs, shop fronts, architecture, and the sun angle to deduce your coordinates.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-[#6b7280]">
                <span>· {AVAILABLE_COUNTRIES.length} Sovereign Nations &amp; Global 3D Sectors</span>
                <span>· No Prior Clues</span>
                <span>· Pure Geodesic Deduction</span>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action CTA */}
        <div className="mt-4 pt-4 border-t border-[#262a30] flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            disabled={isStarting}
            onClick={(e) => {
              e.currentTarget.blur();
              onStartGame();
            }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-[#f3f4f6] font-bold text-sm rounded-[4px] cursor-pointer transition-colors shadow-lg"
          >
            <Play className="w-4 h-4 fill-current" strokeWidth={1.75} />
            <span>
              {isStarting ? 'Dropping into Street View 3D...' : getTargetCtaLabel()}
            </span>
          </button>
        </div>
      </main>

      {/* Bottom Safe-Margin Free Roam Control Hint */}
      <div className="pointer-events-none text-xs font-mono text-[#9ca3af] bg-[#111315]/90 border border-[#262a30] px-3.5 py-2 rounded-[4px] self-center sm:self-start">
        WASD to Walk · Shift to Sprint · Mouse to Look around 360° · Press M for World Map to Guess
      </div>
    </div>
  );
};
