export function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: "Duplicate value. This record already exists." });
  }
  res.status(err.status || 500).json({ message: err.message || "Server error" });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
