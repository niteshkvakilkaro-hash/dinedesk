// Latin subsets load with the theme; Devanagari (Rozha One headings, Mukta body) only for Hindi readers.
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/mukta/latin-400.css';
import '@fontsource/mukta/latin-600.css';

export const fontFaces = ['600 1em "Playfair Display"', '400 1em Mukta', '600 1em Mukta'];

export const loadHindiFonts = () =>
  Promise.all([import('@fontsource/rozha-one/devanagari-400.css'), import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
