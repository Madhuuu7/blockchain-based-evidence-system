import Alert from "../models/Alert.js";

// GET /api/alerts — ADMIN only (enforced by requireRole in the route)
export async function listAlerts(req, res, next) {
  try {
    const { resolved, type, page = 1, limit = 50 } = req.query;
    const query = {};
    if (resolved !== undefined) query.resolved = resolved === "true";
    if (type) query.type = type;

    const alerts = await Alert.find(query)
      .sort("-createdAt")
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await Alert.countDocuments(query);

    res.json({ results: alerts, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

export async function resolveAlert(req, res, next) {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  } catch (err) {
    next(err);
  }
}
