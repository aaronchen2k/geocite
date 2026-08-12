const developmentOrigins = new Set([
  'http://127.0.0.1:8000',
  'http://localhost:8000',
]);

export const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin || developmentOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin is not allowed: ${origin}`));
  },
};
