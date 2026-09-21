// Centralized error handler — never silently swallow failures (including
// blockchain/IPFS failures), always return a clear error state to the client.
export function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error"
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
