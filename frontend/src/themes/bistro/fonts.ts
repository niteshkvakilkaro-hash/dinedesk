// Latin subsets load with the theme; Devanagari (Mukta) only for Hindi readers (see haveli/fonts.ts).
import '@fontsource/gloock/latin-400.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';

export const fontFaces = ['400 1em Gloock', '400 1em "Hanken Grotesk Variable"', '400 1em "IBM Plex Mono"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css')]);
