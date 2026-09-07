/** Library entry of the display app: what an extension (Jumaah Cloud) builds on. */
export { DisplayApp } from './DisplayApp';
export { EMPTY_EXTENSIONS, useExtensions, type DisplayExtensions, type ExtRoute } from './extensions';
export { basePath, mobileUrl, screenUrl, parseRoute, type Route } from './routes';
export { Branded, JumaahMark, brandingStyle, useBrandingCss } from './components/Branding';
export { CenterMessage } from './components/Overlays';
export { QrCode } from './components/QrCode';
export { useTheme } from './kiosk';
