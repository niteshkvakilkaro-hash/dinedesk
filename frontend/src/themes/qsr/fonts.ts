// Latin subsets load with the theme; Devanagari (Mukta) only for Hindi readers (see haveli/fonts.ts).
// Archivo's width axis gives the 125% expanded headings.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/geist/wght.css';

export const fontFaces = ['800 1em "Archivo Variable"', '400 1em "Geist Variable"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-700.css')]);
