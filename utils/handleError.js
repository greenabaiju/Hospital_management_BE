function handleControllerError(res, error, fallbackMessage = "Request failed") {
  if (error?.name === "ValidationError") {
    const firstMessage = Object.values(error.errors || {})[0]?.message;
    return res.status(400).json({
      message: firstMessage || "Validation failed",
    });
  }

  if (error?.name === "CastError") {
    return res.status(400).json({
      message: "Invalid ID format",
    });
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
    return res.status(409).json({
      message: field
        ? `${field} already exists`
        : "Duplicate record already exists",
    });
  }

  return res.status(500).json({
    message: fallbackMessage,
  });
}

module.exports = handleControllerError;
