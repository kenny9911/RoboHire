/**
 * Runtime configuration
 *
 * In development Vite proxies /api → localhost:4607,
 * so API_BASE is empty (relative URLs work).
 *
 * In production the frontend is a separate static site,
 * so API_BASE must point to the backend origin.
 */
export const API_BASE: string =
  import.meta.env.VITE_API_URL || '';
