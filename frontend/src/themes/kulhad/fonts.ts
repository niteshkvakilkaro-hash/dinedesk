// Latin subsets load with the theme; Devanagari (Mukta) only for Hindi readers (see haveli/fonts.ts).
import '@fontsource/young-serif/latin-400.css';
import '@fontsource-variable/geist/wght.css';

export const fontFaces = ['400 1em "Young Serif"', '400 1em "Geist Variable"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
