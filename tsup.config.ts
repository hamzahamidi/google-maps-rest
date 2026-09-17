import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/places/index.ts',
    'src/routes/index.ts',
    'src/geocode/index.ts',
    'src/weather/index.ts',
    'src/addressvalidation/index.ts',
    'src/airquality/index.ts',
    'src/pollen/index.ts',
    'src/solar/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  target: 'node18',
});
