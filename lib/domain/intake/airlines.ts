// IATA airline designators for carriers that commonly serve West African airports, used to name
// an airline from its flight number and to check that the two agree (FR-IN-06).

const AIRLINES: Readonly<Record<string, readonly string[]>> = {
  EK: ['Emirates'],
  ET: ['Ethiopian Airlines', 'Ethiopian'],
  BA: ['British Airways'],
  KQ: ['Kenya Airways'],
  AW: ['Africa World Airlines', 'Africa World'],
  QR: ['Qatar Airways', 'Qatar'],
  TK: ['Turkish Airlines', 'Turkish'],
  AF: ['Air France'],
  KL: ['KLM', 'KLM Royal Dutch Airlines'],
  LH: ['Lufthansa'],
  VS: ['Virgin Atlantic'],
  DL: ['Delta Air Lines', 'Delta'],
  UA: ['United Airlines', 'United'],
  SA: ['South African Airways'],
  MS: ['EgyptAir', 'Egyptair'],
  AT: ['Royal Air Maroc'],
  HF: ["Air Côte d'Ivoire", 'Air Cote d Ivoire'],
  P4: ['Air Peace'],
  W3: ['Arik Air'],
  Q9: ['Green Africa'],
  NG: ['Overland'],
  OJ: ['Overland Airways'],
  VK: ['Valuejet'],
  '5Z': ['United Nigeria Airlines'],
  RJ: ['Royal Jordanian'],
  EY: ['Etihad Airways', 'Etihad'],
  WB: ['RwandAir', 'Rwandair'],
  TC: ['Air Tanzania'],
}

export function airlineName(code: string): string | null {
  return AIRLINES[code.toUpperCase()]?.[0] ?? null
}

/** True when the airline written on the form is known to fly under that designator. */
export function airlineMatchesCode(airline: string, code: string): boolean | null {
  const names = AIRLINES[code.toUpperCase()]
  if (!names) return null
  const wanted = airline.toLowerCase().replace(/[^a-z]/g, '')
  if (wanted === '') return null
  return names.some((name) => {
    const known = name.toLowerCase().replace(/[^a-z]/g, '')
    return known.includes(wanted) || wanted.includes(known)
  })
}
