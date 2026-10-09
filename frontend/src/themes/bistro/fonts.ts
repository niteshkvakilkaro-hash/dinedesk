// Latin subsets load with the Bistro chunk; Devanagari (Mukta) only for Hindi readers
// (see haveli/fonts.ts for why).
import '@fontsource/gloock/latin-400.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css')]);
