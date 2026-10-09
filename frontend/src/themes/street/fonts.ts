// Latin subsets load with the Street chunk; Devanagari (Mukta) only for Hindi readers
// (see haveli/fonts.ts for why).
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-700.css')]);
