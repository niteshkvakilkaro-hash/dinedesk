// Latin subsets load with the Haveli chunk. Devanagari loads only when the visitor reads in
// Hindi: its unicode-range also covers ₹, so loading it up front would cost ~200 kB on every
// English page just for the price symbol (the system font draws ₹ instead).
import '@fontsource/rozha-one/latin-400.css';
import '@fontsource/mukta/latin-400.css';
import '@fontsource/mukta/latin-600.css';

export const loadHindiFonts = () =>
  Promise.all([import('@fontsource/rozha-one/devanagari-400.css'), import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
