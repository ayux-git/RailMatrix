const MAX_DAYS_AHEAD = 120;  // tickets can be booked up to 120 days ahead
const TATKAL_DAYS_AHEAD = 1; // Tatkal is only for journeys today (0) or tomorrow (1)

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];


/*Stations: code -> name, city, map position*/

const STATIONS = {
  NDLS: { name: 'New Delhi', city: 'New Delhi', lat: 28.643, lon: 77.219 },
  DLI:  { name: 'Delhi Junction', city: 'Delhi', lat: 28.661, lon: 77.228 },
  NZM:  { name: 'Hazrat Nizamuddin', city: 'Delhi', lat: 28.588, lon: 77.253 },
  BCT:  { name: 'Mumbai Central', city: 'Mumbai', lat: 18.97, lon: 72.819 },
  CSMT: { name: 'Mumbai CSMT', city: 'Mumbai', lat: 18.94, lon: 72.835 },
  LTT:  { name: 'Lokmanya Tilak Terminus', city: 'Mumbai', lat: 19.069, lon: 72.891 },
  HWH:  { name: 'Howrah Junction', city: 'Kolkata', lat: 22.584, lon: 88.342 },
  SDAH: { name: 'Sealdah', city: 'Kolkata', lat: 22.567, lon: 88.37 },
  MAS:  { name: 'Chennai Central', city: 'Chennai', lat: 13.083, lon: 80.275 },
  SBC:  { name: 'KSR Bengaluru', city: 'Bengaluru', lat: 12.978, lon: 77.569 },
  LDH:  { name: 'Ludhiana Junction', city: 'Ludhiana', lat: 30.912, lon: 75.849 },
  JUC:  { name: 'Jalandhar City', city: 'Jalandhar', lat: 31.335, lon: 75.58 },
  ASR:  { name: 'Amritsar Junction', city: 'Amritsar', lat: 31.633, lon: 74.866 },
  CDG:  { name: 'Chandigarh', city: 'Chandigarh', lat: 30.705, lon: 76.822 },
  JAT:  { name: 'Jammu Tawi', city: 'Jammu', lat: 32.706, lon: 74.877 },
  DDN:  { name: 'Dehradun', city: 'Dehradun', lat: 30.316, lon: 78.033 },
  LKO:  { name: 'Lucknow Charbagh', city: 'Lucknow', lat: 26.832, lon: 80.923 },
  CNB:  { name: 'Kanpur Central', city: 'Kanpur', lat: 26.453, lon: 80.351 },
  PRYJ: { name: 'Prayagraj Junction', city: 'Prayagraj', lat: 25.446, lon: 81.827 },
  BSB:  { name: 'Varanasi Junction', city: 'Varanasi', lat: 25.327, lon: 82.986 },
  GKP:  { name: 'Gorakhpur Junction', city: 'Gorakhpur', lat: 26.759, lon: 83.38 },
  PNBE: { name: 'Patna Junction', city: 'Patna', lat: 25.603, lon: 85.137 },
  JP:   { name: 'Jaipur Junction', city: 'Jaipur', lat: 26.919, lon: 75.788 },
  JU:   { name: 'Jodhpur Junction', city: 'Jodhpur', lat: 26.284, lon: 73.024 },
  UDZ:  { name: 'Udaipur City', city: 'Udaipur', lat: 24.569, lon: 73.708 },
  AGC:  { name: 'Agra Cantt', city: 'Agra', lat: 27.158, lon: 77.99 },
  ADI:  { name: 'Ahmedabad Junction', city: 'Ahmedabad', lat: 23.026, lon: 72.601 },
  BPL:  { name: 'Bhopal Junction', city: 'Bhopal', lat: 23.267, lon: 77.413 },
  INDB: { name: 'Indore Junction', city: 'Indore', lat: 22.717, lon: 75.868 },
  NGP:  { name: 'Nagpur Junction', city: 'Nagpur', lat: 21.152, lon: 79.088 },
  PUNE: { name: 'Pune Junction', city: 'Pune', lat: 18.529, lon: 73.874 },
  MAO:  { name: 'Madgaon', city: 'Goa', lat: 15.273, lon: 73.968 },
  SC:   { name: 'Secunderabad Junction', city: 'Hyderabad', lat: 17.434, lon: 78.501 },
  BZA:  { name: 'Vijayawada Junction', city: 'Vijayawada', lat: 16.518, lon: 80.619 },
  VSKP: { name: 'Visakhapatnam', city: 'Visakhapatnam', lat: 17.722, lon: 83.29 },
  BBS:  { name: 'Bhubaneswar', city: 'Bhubaneswar', lat: 20.267, lon: 85.843 },
  GHY:  { name: 'Guwahati', city: 'Guwahati', lat: 26.183, lon: 91.751 },
  ERS:  { name: 'Ernakulam Junction', city: 'Kochi', lat: 9.969, lon: 76.29 },
  TVC:  { name: 'Thiruvananthapuram Central', city: 'Thiruvananthapuram', lat: 8.487, lon: 76.952 },
  CBE:  { name: 'Coimbatore Junction', city: 'Coimbatore', lat: 11.001, lon: 76.966 },
};

// Give every station its code and a label like "New Delhi (NDLS)"
for (const code in STATIONS) {
  STATIONS[code].code = code;
  STATIONS[code].label = STATIONS[code].name + ' (' + code + ')';
}

const DELHI_STATIONS = ['NDLS', 'DLI', 'NZM'];


/*Travel classes
   perKm, minFare, reservation, superfast -> used to work out the fare
   tatkalMin, tatkalMax -> the extra Tatkal charge stays between these
   pool      -> berths in the General quota on one train
   racRatio  -> share of the pool that can be given as RAC (0 = no RAC)
   demand    -> how popular this class is
   cancels   -> average cancellations per journey (for the confirmation chance)
   racPlaces -> RAC places assumed when checking a PNR
   prefix, coaches, perCoach -> used to make coach/berth numbers like "S4/32"
   berths    -> the berth (or seat) pattern that repeats along a coach
*/

const SLEEPER_BERTHS = ['Lower', 'Middle', 'Upper', 'Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'];

const CLASSES = {
  '1A': { name: 'First AC', ac: true, perKm: 3.6, minFare: 1200, reservation: 60, superfast: 75,
          tatkalMin: 400, tatkalMax: 500, pool: 18, racRatio: 0, demand: -0.12, cancels: 8, racPlaces: 0,
          prefix: 'H', coaches: 1, perCoach: 24, seats: false, berths: ['Lower', 'Upper'] },
  '2A': { name: 'AC 2 Tier', ac: true, perKm: 2.1, minFare: 700, reservation: 50, superfast: 45,
          tatkalMin: 400, tatkalMax: 500, pool: 80, racRatio: 0.06, demand: 0, cancels: 28, racPlaces: 5,
          prefix: 'A', coaches: 2, perCoach: 48, seats: false,
          berths: ['Lower', 'Upper', 'Lower', 'Upper', 'Side Lower', 'Side Upper'] },
  '3A': { name: 'AC 3 Tier', ac: true, perKm: 1.5, minFare: 500, reservation: 40, superfast: 45,
          tatkalMin: 300, tatkalMax: 400, pool: 160, racRatio: 0.07, demand: 0.1, cancels: 65, racPlaces: 11,
          prefix: 'B', coaches: 6, perCoach: 72, seats: false, berths: SLEEPER_BERTHS },
  '3E': { name: 'AC 3 Economy', ac: true, perKm: 1.38, minFare: 450, reservation: 40, superfast: 45,
          tatkalMin: 300, tatkalMax: 400, pool: 100, racRatio: 0.06, demand: 0.05, cancels: 38, racPlaces: 6,
          prefix: 'M', coaches: 3, perCoach: 80, seats: false, berths: SLEEPER_BERTHS },
  SL:   { name: 'Sleeper', ac: false, perKm: 0.55, minFare: 150, reservation: 20, superfast: 30,
          tatkalMin: 100, tatkalMax: 200, pool: 240, racRatio: 0.08, demand: 0.08, cancels: 110, racPlaces: 19,
          prefix: 'S', coaches: 10, perCoach: 72, seats: false, berths: SLEEPER_BERTHS },
  EC:   { name: 'Executive Chair Car', ac: true, perKm: 2.6, minFare: 700, reservation: 60, superfast: 75,
          tatkalMin: 400, tatkalMax: 500, pool: 46, racRatio: 0, demand: -0.1, cancels: 10, racPlaces: 0,
          prefix: 'E', coaches: 1, perCoach: 56, seats: true, berths: ['Window', 'Aisle', 'Aisle', 'Window'] },
  CC:   { name: 'AC Chair Car', ac: true, perKm: 1.3, minFare: 300, reservation: 40, superfast: 45,
          tatkalMin: 125, tatkalMax: 225, pool: 200, racRatio: 0, demand: 0.03, cancels: 45, racPlaces: 0,
          prefix: 'C', coaches: 8, perCoach: 78, seats: true, berths: ['Window', 'Middle', 'Aisle', 'Aisle', 'Window'] },
};


/*Quotas
   poolFactor   -> size of this quota compared to General
   demand       -> extra demand for this quota
   cancelFactor -> how often tickets in this quota get cancelled (1 = normal)
   classes      -> classes where the quota exists (null = every class)
   tatkal       -> true for Tatkal and Premium Tatkal
   note         -> message shown under the search form
*/

const TATKAL_CLASSES = ['2A', '3A', '3E', 'SL', 'CC', 'EC'];

const QUOTAS = {
  GN: { name: 'General', poolFactor: 1, demand: 0, cancelFactor: 1, classes: null, note: '' },
  TQ: { name: 'Tatkal', poolFactor: 0.22, demand: 0.18, cancelFactor: 0.4, classes: TATKAL_CLASSES, tatkal: true,
        note: 'Tatkal opens one day before the journey (10:00 AM for AC, 11:00 AM for non-AC classes). Extra Tatkal charges apply and confirmed Tatkal tickets are not refundable.' },
  PT: { name: 'Premium Tatkal', poolFactor: 0.1, demand: 0.24, cancelFactor: 0.2, classes: TATKAL_CLASSES, tatkal: true,
        note: 'Premium Tatkal follows the Tatkal booking window but uses dynamic fares that rise with demand.' },
  SS: { name: 'Senior Citizen', poolFactor: 0.06, demand: 0.05, cancelFactor: 0.6, classes: ['2A', '3A', '3E', 'SL'],
        note: 'Eligibility: men aged 60+ and women aged 58+. Lower berths are given on priority. Carry valid age proof.' },
  LD: { name: 'Ladies', poolFactor: 0.03, demand: 0.02, cancelFactor: 0.5, classes: ['SL', 'CC'],
        note: 'Eligibility: women travelling alone or with children below 12 years. Offered in Sleeper (SL) and Chair Car (CC).' },
  HP: { name: 'Divyang', poolFactor: 0.025, demand: 0, cancelFactor: 0.5, classes: ['3A', '3E', 'SL', 'CC'],
        note: 'Requires a valid Divyang (disability) certificate or UDID card. A 50% fare concession is simulated.' },
  FT: { name: 'Foreign Tourist', poolFactor: 0.03, demand: -0.05, cancelFactor: 0.3, classes: ['1A', '2A', '3A', 'CC', 'EC'],
        note: 'Only for foreign passport holders and NRIs. A passport is required at booking and on board.' },
};


/* Festival seasons (month * 100 + day, e.g. 1025 = 25 Oct) */

const FESTIVALS = [
  { name: 'Durga Puja & Dussehra', from: 1008, to: 1024 },
  { name: 'Diwali & Chhath', from: 1025, to: 1120 },
  { name: 'Christmas & New Year', from: 1220, to: 103 },
  { name: 'Pongal & Makar Sankranti', from: 112, to: 117 },
  { name: 'Holi', from: 301, to: 320 },
  { name: 'Summer vacation', from: 501, to: 630 },
];

// Extra demand by day of travel (Mon..Sun). Friday and Sunday are the busiest.
const WEEKDAY_DEMAND = [0.02, -0.04, -0.04, 0, 0.08, 0.04, 0.1];

// How often people cancel, by day of travel (Mon..Sun). Weekend travellers keep their tickets.
const WEEKDAY_CANCELS = [1.05, 1.08, 1.08, 1.02, 0.92, 0.97, 0.9];


/* Train types
   weight    -> how likely this type is to be picked
   max       -> at most this many trains of this type on one route
   numPrefix -> possible first digits of the train number
   speed     -> [min, max] average speed in km/h
   minKm, maxKm -> route lengths this type is used for
   delhiOnly -> only for routes that start or end in Delhi
   daily     -> chance that the train runs every day
   dayTrain  -> leaves in the morning or afternoon
   pop       -> [min, max] popularity (0 to 1)
   generic   -> gets a name from NAMED_TRAINS instead of "City–City Type Express"
*/

const TRAIN_TYPES = [
  { key: 'RAJ', label: 'Rajdhani', weight: 1.4, max: 1, numPrefix: ['124', '123', '224'], speed: [78, 88],
    classes: ['1A', '2A', '3A'], minKm: 400, maxKm: 3500, delhiOnly: true, daily: 0.6, pop: [0.75, 0.97], fareFactor: 1.28, superfast: true },
  { key: 'DUR', label: 'Duronto', weight: 0.8, max: 1, numPrefix: ['122', '222'], speed: [74, 84],
    classes: ['1A', '2A', '3A', 'SL'], minKm: 600, maxKm: 3500, daily: 0.25, pop: [0.65, 0.9], fareFactor: 1.18, superfast: true },
  { key: 'VB', label: 'Vande Bharat', weight: 1.3, max: 1, numPrefix: ['224', '226', '206'], speed: [80, 95],
    classes: ['EC', 'CC'], minKm: 150, maxKm: 900, daily: 0, dayTrain: true, pop: [0.7, 0.97], fareFactor: 1.38, superfast: true },
  { key: 'SHT', label: 'Shatabdi', weight: 1, max: 1, numPrefix: ['120'], speed: [75, 88],
    classes: ['EC', 'CC'], minKm: 100, maxKm: 800, daily: 0.2, dayTrain: true, pop: [0.65, 0.92], fareFactor: 1.24, superfast: true },
  { key: 'JSH', label: 'Jan Shatabdi', weight: 0.8, max: 1, numPrefix: ['120', '121'], speed: [58, 68],
    classes: ['CC'], minKm: 100, maxKm: 650, daily: 0.7, dayTrain: true, pop: [0.5, 0.85], fareFactor: 1.0, superfast: true },
  { key: 'GR', label: 'Garib Rath', weight: 0.7, max: 1, numPrefix: ['122', '129', '229'], speed: [62, 72],
    classes: ['3E', 'CC'], minKm: 400, maxKm: 3000, daily: 0.15, pop: [0.6, 0.9], fareFactor: 0.82, superfast: true },
  { key: 'HMS', label: 'Humsafar', weight: 0.7, max: 1, numPrefix: ['223', '229'], speed: [60, 70],
    classes: ['3A', 'SL'], minKm: 500, maxKm: 3500, daily: 0.1, pop: [0.45, 0.8], fareFactor: 1.12, superfast: true },
  { key: 'SF', label: 'Superfast', weight: 3, max: 6, numPrefix: ['12', '22'], speed: [55, 66], generic: true,
    classes: ['1A', '2A', '3A', 'SL'], minKm: 60, maxKm: 4000, daily: 0.65, pop: [0.4, 0.9], fareFactor: 1.0, superfast: true },
  { key: 'EXP', label: 'Mail/Express', weight: 2.5, max: 6, numPrefix: ['11', '13', '14', '15', '18', '19'], speed: [46, 56], generic: true,
    classes: ['2A', '3A', 'SL'], minKm: 60, maxKm: 4000, daily: 0.6, pop: [0.3, 0.8], fareFactor: 0.95, superfast: false },
];

const NAMED_TRAINS = [
  'Paschim', 'Golden Temple', 'Ganga', 'Kaveri', 'Godavari', 'Sabarmati', 'Brahmaputra', 'Sutlej',
  'Narmada', 'Konark', 'Malwa', 'Himgiri', 'Gomti', 'Gitanjali', 'Coromandel', 'Jhelum', 'Shalimar', 'Utkal',
];


/*Sample PNRs (fixed examples for the "Try a sample" buttons)
   journeyOffset = days from today; departure and duration are in minutes.
   A passenger status is one of:
     { type: 'CNF', coach: 'S4', berth: 32 }   confirmed
     { type: 'RAC', pos: 3 }                   RAC number 3
     { type: 'WL', pos: 12 }                   waitlist number 12
     { type: 'CAN' }                           cancelled
*/

const SAMPLE_PNRS = [
  {
    pnr: '2345678901', train: { number: '12029', name: 'Swarna Shatabdi Express' },
    from: 'ASR', to: 'NDLS', departure: 16 * 60 + 55, duration: 6 * 60 + 5,
    journeyOffset: 0, cls: 'CC', quota: 'GN', chartPrepared: true,
    passengers: [
      { booking: { type: 'CNF', coach: 'C2', berth: 21 }, current: { type: 'CNF', coach: 'C2', berth: 21 } },
      { booking: { type: 'WL', pos: 2 }, current: { type: 'CNF', coach: 'C4', berth: 58 } },
    ],
  },
  {
    pnr: '4521896307', train: { number: '12497', name: 'Shan-e-Punjab Express' },
    from: 'NDLS', to: 'LDH', departure: 6 * 60 + 40, duration: 4 * 60 + 30,
    journeyOffset: 4, cls: 'SL', quota: 'GN', chartPrepared: false,
    passengers: [
      { booking: { type: 'WL', pos: 21 }, current: { type: 'RAC', pos: 18 } },
      { booking: { type: 'WL', pos: 22 }, current: { type: 'WL', pos: 1 } },
      { booking: { type: 'WL', pos: 23 }, current: { type: 'WL', pos: 2 } },
    ],
  },
  {
    pnr: '6123409875', train: { number: '12951', name: 'Mumbai Rajdhani Express' },
    from: 'BCT', to: 'NDLS', departure: 17 * 60, duration: 15 * 60 + 32,
    journeyOffset: 2, cls: '3A', quota: 'GN', chartPrepared: false,
    passengers: [
      { booking: { type: 'RAC', pos: 5 }, current: { type: 'RAC', pos: 2 } },
      { booking: { type: 'RAC', pos: 6 }, current: { type: 'RAC', pos: 3 } },
    ],
  },
  {
    pnr: '8102938475', train: { number: '12301', name: 'Howrah Rajdhani Express' },
    from: 'HWH', to: 'NDLS', departure: 16 * 60 + 50, duration: 17 * 60 + 10,
    journeyOffset: 6, cls: '2A', quota: 'GN', chartPrepared: false,
    passengers: [
      { booking: { type: 'CNF', coach: 'A1', berth: 12 }, current: { type: 'CAN' } },
      { booking: { type: 'CNF', coach: 'A1', berth: 13 }, current: { type: 'CAN' } },
    ],
  },
];