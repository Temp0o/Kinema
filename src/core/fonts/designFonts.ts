/**
 * Fonts bundled with Kinema (fully offline). Registered with the FontFace API so
 * the canvas can use them; the exporter copies the same files into exported sites.
 */
import interN from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interI from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import dmSans from '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url';
import spaceGrotesk from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url';
import playfair from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import playfairI from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2?url';
import montserrat from '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url';
import outfit from '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url';
import lora from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url';
import loraI from '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2?url';
import manrope from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';
import sora from '@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url';
import roboto from '@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url';
import jbMono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import pop400 from '@fontsource/poppins/files/poppins-latin-400-normal.woff2?url';
import pop500 from '@fontsource/poppins/files/poppins-latin-500-normal.woff2?url';
import pop600 from '@fontsource/poppins/files/poppins-latin-600-normal.woff2?url';
import pop700 from '@fontsource/poppins/files/poppins-latin-700-normal.woff2?url';
import pop800 from '@fontsource/poppins/files/poppins-latin-800-normal.woff2?url';

export interface FontFile {
  url: string;
  weight: string;
  style: 'normal' | 'italic';
  /** file name used in exports */
  fileName: string;
}

export interface DesignFont {
  family: string;
  category: 'sans' | 'serif' | 'display' | 'mono' | 'system';
  files: FontFile[];
}

const v = (url: string, fileName: string, style: 'normal' | 'italic' = 'normal'): FontFile => ({ url, weight: '100 900', style, fileName });

export const BUNDLED_FONTS: DesignFont[] = [
  { family: 'Inter Variable', category: 'sans', files: [v(interN, 'inter.woff2'), v(interI, 'inter-italic.woff2', 'italic')] },
  { family: 'DM Sans Variable', category: 'sans', files: [v(dmSans, 'dm-sans.woff2')] },
  { family: 'Manrope Variable', category: 'sans', files: [v(manrope, 'manrope.woff2')] },
  { family: 'Outfit Variable', category: 'sans', files: [v(outfit, 'outfit.woff2')] },
  { family: 'Sora Variable', category: 'sans', files: [v(sora, 'sora.woff2')] },
  { family: 'Roboto Variable', category: 'sans', files: [v(roboto, 'roboto.woff2')] },
  { family: 'Montserrat Variable', category: 'sans', files: [v(montserrat, 'montserrat.woff2')] },
  {
    family: 'Poppins',
    category: 'sans',
    files: [
      { url: pop400, weight: '400', style: 'normal', fileName: 'poppins-400.woff2' },
      { url: pop500, weight: '500', style: 'normal', fileName: 'poppins-500.woff2' },
      { url: pop600, weight: '600', style: 'normal', fileName: 'poppins-600.woff2' },
      { url: pop700, weight: '700', style: 'normal', fileName: 'poppins-700.woff2' },
      { url: pop800, weight: '800', style: 'normal', fileName: 'poppins-800.woff2' },
    ],
  },
  { family: 'Space Grotesk Variable', category: 'display', files: [v(spaceGrotesk, 'space-grotesk.woff2')] },
  { family: 'Playfair Display Variable', category: 'serif', files: [v(playfair, 'playfair.woff2'), v(playfairI, 'playfair-italic.woff2', 'italic')] },
  { family: 'Lora Variable', category: 'serif', files: [v(lora, 'lora.woff2'), v(loraI, 'lora-italic.woff2', 'italic')] },
  { family: 'JetBrains Mono Variable', category: 'mono', files: [v(jbMono, 'jetbrains-mono.woff2')] },
];

export const SYSTEM_FONTS: DesignFont[] = [
  'system-ui',
  'Arial',
  'Helvetica',
  'Segoe UI',
  'Verdana',
  'Georgia',
  'Times New Roman',
  'Courier New',
].map((family) => ({ family, category: family.includes('Courier') ? 'mono' : family === 'Georgia' || family.includes('Times') ? 'serif' : 'system', files: [] }));

export function findBundledFont(family: string): DesignFont | undefined {
  const f = family.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
  return BUNDLED_FONTS.find((b) => b.family.toLowerCase() === f || b.family.toLowerCase().replace(' variable', '') === f);
}

/** Register all bundled fonts with the document (idempotent). */
export function registerBundledFonts() {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  for (const font of BUNDLED_FONTS) {
    for (const file of font.files) {
      const face = new FontFace(font.family, `url(${file.url})`, { weight: file.weight, style: file.style, display: 'swap' });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  }
}

registerBundledFonts();
