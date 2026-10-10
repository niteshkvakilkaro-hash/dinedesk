// Latin subsets load with the theme; Devanagari (Mukta) only for Hindi readers (see haveli/fonts.ts).
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource-variable/archivo/wght.css';

export const fontFaces = ['400 1em "Archivo Black"', '400 1em "Archivo Variable"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-700.css')]);
