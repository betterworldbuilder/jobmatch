// All countries (UN member and observer states, plus Kosovo and Taiwan), English short names, A–Z.
export const COUNTRIES: string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Holy See', 'Honduras', 'Hong Kong', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Macao', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Türkiye', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
];

// --- "Company country" (recruiters) and "Citizenship" (candidates starting Premium) — founder, 2026-11-24 ---------
// Same names as COUNTRIES (they are what the server's payment rules read). The phone's region pre-selects a guess.

/** COUNTRIES with the 6 main markets first. */
export const COUNTRY_OPTIONS: { code: string; name: string }[] = (() => {
  const top = ['Vietnam', 'United States', 'United Kingdom', 'France', 'Singapore', 'Australia'];
  return [...top, ...COUNTRIES.filter((c) => !top.includes(c))].map((name) => ({ code: name, name }));
})();

const ALIASES: Record<string, string> = { 'viet nam': 'Vietnam', turkey: 'Türkiye', 'cape verde': 'Cabo Verde', 'czech republic': 'Czechia', 'hong kong sar china': 'Hong Kong', 'macao sar china': 'Macao', 'myanmar (burma)': 'Myanmar', 'congo - kinshasa': 'Democratic Republic of the Congo', 'congo - brazzaville': 'Congo', 'palestinian territories': 'Palestine', 'vatican city': 'Holy See', 'eswatini': 'Eswatini', 'swaziland': 'Eswatini' };
const TZ: Record<string, string> = { 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Europe/Paris': 'FR', 'Europe/London': 'GB', 'Asia/Singapore': 'SG', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US' };

/** An ISO region code → the matching name in COUNTRIES ('' if none). */
function countryForRegion(code: string): string {
  try {
    const raw = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || '';
    const name = ALIASES[raw.toLowerCase()] || raw;
    return COUNTRIES.find((c) => c.toLowerCase() === name.toLowerCase()) || '';
  } catch { return ''; }
}

/** Best guess of the user's country from the phone/browser region (language tag, then time zone). '' if unknown. */
export function guessCountryName(): string {
  try {
    for (const tag of navigator.languages || [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      const name = region ? countryForRegion(region) : '';
      if (name) return name;
    }
  } catch { /* fall through */ }
  try {
    const code = TZ[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (code) return countryForRegion(code);
  } catch { /* unknown */ }
  return '';
}
