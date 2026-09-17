export type LatLng = { latitude: number; longitude: number };

export type LocalizedText = { text: string; languageCode?: string };

export type Viewport = { low?: LatLng; high?: LatLng };

export type Circle = { center: LatLng; radius: number };

export type Rectangle = { low: LatLng; high: LatLng };

/** Accepts documented values with completion, and any string so a new one never blocks an upgrade. */
export type Open<T extends string> = T | (string & {});
