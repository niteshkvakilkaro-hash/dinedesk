// Latin subsets load with the theme. Devanagari loads only for Hindi readers: its unicode-range also
// covers ₹, so loading it up front would cost ~200 kB on every English page just for the rupee sign.
import '@fontsource/rozha-one/latin-400.css';
import '@fontsource/mukta/latin-400.css';
import '@fontsource/mukta/latin-600.css';

export const fontFaces = ['400 1em "Rozha One"', '400 1em Mukta', '600 1em Mukta'];

export const loadHindiFonts = () =>
  Promise.all([import('@fontsource/rozha-one/devanagari-400.css'), import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
