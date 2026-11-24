// The 30 eras, oldest first (index 0). Sheet columns B..AE run newest → oldest,
// so sheet column c (1-based within B..AE) maps to era index 30 - c.
// Year ranges are approximate and only used for tooltips / label-year parsing.
export const ERAS = [
  { label: '>2000 BCE', short: '>2000 BC', from: -3500, to: -2001 },
  { label: '1000-1999 BCE', short: '2nd mil. BC', from: -2000, to: -1001 },
  { label: '9ᵗʰ/10ᵗʰ century BCE', short: '10–9c BC', from: -1000, to: -801 },
  { label: '7ᵗʰ/8ᵗʰ BCE', short: '8–7c BC', from: -800, to: -601 },
  { label: '5ᵗʰ/6ᵗʰ BCE', short: '6–5c BC', from: -600, to: -401 },
  { label: '3ʳᵈ/4ᵗʰ BCE', short: '4–3c BC', from: -400, to: -201 },
  { label: '1ˢᵗ/2ⁿᵈ BCE', short: '2–1c BC', from: -200, to: -1 },
  { label: '1ˢᵗ CE', short: '1st', from: 1, to: 100 },
  { label: '2ⁿᵈ', short: '2nd', from: 101, to: 200 },
  { label: '3ʳᵈ', short: '3rd', from: 201, to: 300 },
  { label: '4ᵗʰ', short: '4th', from: 301, to: 400 },
  { label: '5ᵗʰ', short: '5th', from: 401, to: 500 },
  { label: '6ᵗʰ', short: '6th', from: 501, to: 600 },
  { label: '7ᵗʰ', short: '7th', from: 601, to: 700 },
  { label: '8ᵗʰ', short: '8th', from: 701, to: 800 },
  { label: '9ᵗʰ', short: '9th', from: 801, to: 900 },
  { label: '10ᵗʰ', short: '10th', from: 901, to: 1000 },
  { label: '11ᵗʰ', short: '11th', from: 1001, to: 1100 },
  { label: '12ᵗʰ', short: '12th', from: 1101, to: 1200 },
  { label: '13ᵗʰ', short: '13th', from: 1201, to: 1300 },
  { label: '14ᵗʰ', short: '14th', from: 1301, to: 1400 },
  { label: '15ᵗʰ', short: '15th', from: 1401, to: 1500 },
  { label: '16ᵗʰ', short: '16th', from: 1501, to: 1600 },
  { label: '17ᵗʰ', short: '17th', from: 1601, to: 1700 },
  { label: '18ᵗʰ', short: '18th', from: 1701, to: 1788 },
  { label: 'Long 19ᵗʰ', short: 'Long 19th', from: 1789, to: 1913 },
  { label: '1914-1939', short: '1914–39', from: 1914, to: 1938 },
  { label: 'WW2', short: 'WW2', from: 1939, to: 1945 },
  { label: 'Cold War', short: 'Cold War', from: 1946, to: 1991 },
  { label: 'Post-Cold War', short: 'Post-CW', from: 1992, to: 2026 },
];

export const colToEra = (col) => 30 - col;

export function eraForYear(year) {
  const i = ERAS.findIndex((e) => year >= e.from && year <= e.to);
  if (i >= 0) return i;
  return year < ERAS[0].from ? 0 : ERAS.length - 1;
}

/** Find a year or century in a still-map label like "1727 Maghreb", "c. 1286 Scotland", "867 Arabia", "264 BC". */
export function yearFromLabel(label) {
  const bc = /\b(?:c\.\s*)?(\d{1,4})\s*(BC|BCE)\b/i.exec(label);
  if (bc) return -Number(bc[1]);
  const cent = /\b(\d{1,2})(?:st|nd|rd|th)\s+century(\s+BC)?/i.exec(label);
  if (cent) return cent[2] ? -(Number(cent[1]) * 100 - 50) : Number(cent[1]) * 100 - 50;
  const dec = /\b(\d{2,4})0s\b/.exec(label); // "900s AD" → middle of that century
  if (dec && /00s/.test(dec[0])) return Number(dec[1] + '0') + 50;
  const y = /(?:^|\s|c\.\s*)(\d{3,4})(?=\s|$)/.exec(label);
  if (y) return Number(y[1]);
  return undefined;
}
