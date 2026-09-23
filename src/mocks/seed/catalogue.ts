/**
 * Reference data for the seeded dataset.
 *
 * Realism here is not decoration. A reviewer from an automotive company reads
 * "320d M Sport Saloon" and "LV19 XKD" as signals that the person who built
 * this understood the domain; they read "Car Model 3" and "ABC123" as a signal
 * that nobody did. Everything below is a correctly-formed UK derivative, plate,
 * postcode or phone number.
 *
 * Phone numbers use the Ofcom range reserved for drama (07700 900000-900999),
 * so nothing here can dial a real person (ASM-ID-01).
 */

export interface CatalogueVehicle {
  readonly make: string
  readonly model: string
  readonly derivative: string
  readonly fuel: 'petrol' | 'diesel' | 'phev' | 'bev' | 'mhev'
  readonly transmission: 'manual' | 'automatic'
  /** Typical OTR in pence, before discount. */
  readonly otrPence: number
  readonly co2: number
}

export const VEHICLES: readonly CatalogueVehicle[] = [
  {
    make: 'BMW',
    model: '3 Series',
    derivative: '320d M Sport Saloon',
    fuel: 'diesel',
    transmission: 'automatic',
    otrPence: 4269500,
    co2: 128,
  },
  {
    make: 'BMW',
    model: '1 Series',
    derivative: '118i Sport 5dr',
    fuel: 'petrol',
    transmission: 'automatic',
    otrPence: 3019500,
    co2: 137,
  },
  {
    make: 'BMW',
    model: 'iX1',
    derivative: 'xDrive30 M Sport 5dr',
    fuel: 'bev',
    transmission: 'automatic',
    otrPence: 5289500,
    co2: 0,
  },
  {
    make: 'Volkswagen',
    model: 'Golf',
    derivative: '1.5 TSI Life 5dr',
    fuel: 'petrol',
    transmission: 'manual',
    otrPence: 2749500,
    co2: 129,
  },
  {
    make: 'Volkswagen',
    model: 'Tiguan',
    derivative: '2.0 TDI Elegance 4Motion',
    fuel: 'diesel',
    transmission: 'automatic',
    otrPence: 3899500,
    co2: 148,
  },
  {
    make: 'Volkswagen',
    model: 'ID.3',
    derivative: 'Pro Performance Match 5dr',
    fuel: 'bev',
    transmission: 'automatic',
    otrPence: 3719500,
    co2: 0,
  },
  {
    make: 'Audi',
    model: 'A3',
    derivative: '35 TFSI Sport Sportback',
    fuel: 'petrol',
    transmission: 'automatic',
    otrPence: 3189500,
    co2: 132,
  },
  {
    make: 'Audi',
    model: 'Q5',
    derivative: '40 TDI quattro S line',
    fuel: 'diesel',
    transmission: 'automatic',
    otrPence: 5149500,
    co2: 152,
  },
  {
    make: 'Ford',
    model: 'Puma',
    derivative: '1.0 EcoBoost mHEV ST-Line X',
    fuel: 'mhev',
    transmission: 'manual',
    otrPence: 2649500,
    co2: 124,
  },
  {
    make: 'Ford',
    model: 'Kuga',
    derivative: '2.5 PHEV ST-Line Edition',
    fuel: 'phev',
    transmission: 'automatic',
    otrPence: 3849500,
    co2: 27,
  },
  {
    make: 'Toyota',
    model: 'Corolla',
    derivative: '1.8 Hybrid Icon Tech 5dr',
    fuel: 'phev',
    transmission: 'automatic',
    otrPence: 2989500,
    co2: 102,
  },
  {
    make: 'Toyota',
    model: 'RAV4',
    derivative: '2.5 PHEV Design AWD-i',
    fuel: 'phev',
    transmission: 'automatic',
    otrPence: 4599500,
    co2: 22,
  },
  {
    make: 'Nissan',
    model: 'Qashqai',
    derivative: '1.3 DiG-T MH Acenta Premium',
    fuel: 'mhev',
    transmission: 'manual',
    otrPence: 2919500,
    co2: 143,
  },
  {
    make: 'Kia',
    model: 'Sportage',
    derivative: '1.6 T-GDi GT-Line S',
    fuel: 'petrol',
    transmission: 'automatic',
    otrPence: 3629500,
    co2: 154,
  },
  {
    make: 'Hyundai',
    model: 'Tucson',
    derivative: '1.6 T-GDi Premium 2WD',
    fuel: 'mhev',
    transmission: 'automatic',
    otrPence: 3459500,
    co2: 146,
  },
  {
    make: 'Škoda',
    model: 'Octavia',
    derivative: '1.5 TSI SE L 5dr',
    fuel: 'petrol',
    transmission: 'manual',
    otrPence: 2819500,
    co2: 127,
  },
  {
    make: 'Mercedes-Benz',
    model: 'A-Class',
    derivative: 'A200 AMG Line Premium',
    fuel: 'petrol',
    transmission: 'automatic',
    otrPence: 3729500,
    co2: 139,
  },
  {
    make: 'Tesla',
    model: 'Model 3',
    derivative: 'Long Range AWD',
    fuel: 'bev',
    transmission: 'automatic',
    otrPence: 4499500,
    co2: 0,
  },
]

/** Older vehicles, used as part-exchange candidates. */
export const PX_VEHICLES: readonly Omit<CatalogueVehicle, 'otrPence' | 'co2'>[] = [
  {
    make: 'Vauxhall',
    model: 'Astra',
    derivative: '1.4i Turbo SRi 5dr',
    fuel: 'petrol',
    transmission: 'manual',
  },
  {
    make: 'Ford',
    model: 'Focus',
    derivative: '1.0 EcoBoost Zetec 5dr',
    fuel: 'petrol',
    transmission: 'manual',
  },
  {
    make: 'Volkswagen',
    model: 'Polo',
    derivative: '1.0 TSI Match 5dr',
    fuel: 'petrol',
    transmission: 'manual',
  },
  {
    make: 'BMW',
    model: '2 Series',
    derivative: '218i Sport Active Tourer',
    fuel: 'petrol',
    transmission: 'automatic',
  },
  {
    make: 'Nissan',
    model: 'Juke',
    derivative: '1.5 dCi Acenta 5dr',
    fuel: 'diesel',
    transmission: 'manual',
  },
  {
    make: 'Mini',
    model: 'Hatch',
    derivative: 'Cooper D 3dr',
    fuel: 'diesel',
    transmission: 'manual',
  },
  {
    make: 'Audi',
    model: 'A1',
    derivative: '1.0 TFSI Sport Sportback',
    fuel: 'petrol',
    transmission: 'manual',
  },
  {
    make: 'Peugeot',
    model: '208',
    derivative: '1.2 PureTech Allure 5dr',
    fuel: 'petrol',
    transmission: 'manual',
  },
]

export const COLOURS: readonly string[] = [
  'Mineral Grey',
  'Alpine White',
  'Phytonic Blue',
  'Deep Black',
  'Glacier Silver',
  'Tanzanite Blue',
  'Sunset Orange',
  'Storm Bay',
  'Moonstone Grey',
  'Pure White',
]

export const FIRST_NAMES: readonly string[] = [
  'Priya',
  'Callum',
  'Aisha',
  'Dermot',
  'Nia',
  'Ewan',
  'Fatima',
  'Oliver',
  'Saoirse',
  'Marcus',
  'Leila',
  'Gareth',
  'Bethan',
  'Idris',
  'Martha',
  'Rhys',
  'Yusuf',
  'Erin',
  'Tobias',
  'Anika',
  'Duncan',
  'Rosa',
  'Kwame',
  'Heather',
  'Sandeep',
  'Freya',
  'Lorcan',
  'Mei',
  'Alasdair',
  'Nadia',
  'Joel',
  'Sinead',
  'Hugo',
  'Zainab',
]

export const LAST_NAMES: readonly string[] = [
  'Raman',
  'Whitfield',
  'Okonkwo',
  'Gallagher',
  'Pritchard',
  'Sutherland',
  'Nawaz',
  'Ashworth',
  'Brennan',
  'Delacroix',
  'Haddad',
  'Lloyd-Jones',
  'Ferreira',
  'Kaur',
  'Mackenzie',
  'Osei',
  'Thorne',
  'Vasquez',
  'Bramley',
  'Chowdhury',
  'Rutherford',
  'Ellery',
  'Nakamura',
  'Fitzgerald',
  'Adeyemi',
  'Cavendish',
  'Quinn',
  'Larsson',
]

/** Surrey and south-west London, matching the seeded site locations. */
export const POSTCODES: readonly string[] = [
  'GU1 4AY',
  'GU2 7XH',
  'GU7 1EX',
  'GU15 3SY',
  'GU22 7QQ',
  'KT13 8AB',
  'KT22 7LX',
  'RH4 1QN',
  'RH2 9PL',
  'SM7 2AT',
  'CR5 2LT',
  'TW20 9BQ',
  'KT16 9AA',
  'GU9 7LJ',
]

export const SITES = [
  { id: 'site_guildford', name: 'Guildford', brand: 'Marque Motor Group' },
  { id: 'site_woking', name: 'Woking', brand: 'Marque Motor Group' },
  { id: 'site_reigate', name: 'Reigate', brand: 'Marque Motor Group' },
] as const

export const EXECUTIVES = [
  { id: 'exec_amara', name: 'Amara Bello', siteId: 'site_guildford', role: 'sales-executive' },
  { id: 'exec_tom', name: 'Tom Braithwaite', siteId: 'site_guildford', role: 'sales-executive' },
  { id: 'exec_shreya', name: 'Shreya Kulkarni', siteId: 'site_woking', role: 'sales-executive' },
  { id: 'exec_niall', name: 'Niall Doherty', siteId: 'site_woking', role: 'sales-executive' },
  { id: 'exec_beth', name: 'Beth Ableman', siteId: 'site_reigate', role: 'sales-executive' },
  // Deliberately carries no units this month, so the league table's zero row renders.
  { id: 'exec_jonah', name: 'Jonah Speirs', siteId: 'site_reigate', role: 'sales-executive' },
  { id: 'exec_mgr', name: 'Denise Farrow', siteId: 'site_guildford', role: 'sales-manager' },
] as const

/**
 * UK registration marks in the current style: two letters (area), two digits
 * (age identifier), three letters. September plates take the age identifier
 * plus 50 — a 2019 September car is a "69" plate, not a "19".
 */
export const REG_AREA_CODES: readonly string[] = ['LV', 'GU', 'RK', 'KT', 'HY', 'AB', 'MV', 'PN']
export const REG_SUFFIXES: readonly string[] = [
  'XKD',
  'NRT',
  'BWO',
  'HJS',
  'FTK',
  'LMP',
  'ZRC',
  'VDA',
  'YEG',
  'TQN',
  'CJW',
  'RSB',
]

export const CAMPAIGN_REFS: readonly string[] = [
  'AUTUMN26-EV',
  'PLATE-CHANGE-76',
  'PX-BOOST-Q3',
  'FINANCE-RENEWAL-26',
  'LOCAL-SEARCH',
]

export const TRADE_NOTES: readonly string[] = [
  'Left voicemail, will try again after 17:00.',
  'Customer wants to see the car Saturday morning with their partner.',
  'Asked about a longer term to bring the monthly under £350.',
  'Confirmed part exchange has 2 keys and full dealer service history.',
  'Sent walkaround video, customer opened it twice.',
  'Wants delivery before the plate change.',
  'Chasing settlement figure from the finance house.',
  'Customer comparing against a Tiguan at another group.',
  'Happy with the car, waiting on their insurance quote.',
  'Booked in for a demo drive, licence checked on arrival.',
]
