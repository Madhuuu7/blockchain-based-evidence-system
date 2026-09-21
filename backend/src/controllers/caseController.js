import Case from "../models/Case.js";
import Evidence from "../models/Evidence.js";

export async function createCase(req, res, next) {
  try {
    const { caseId, title, description } = req.body;
    if (!caseId || !title) {
      return res.status(400).json({ error: "caseId and title are required" });
    }
    const newCase = await Case.create({ caseId, title, description, createdBy: req.wallet });
    res.status(201).json(newCase);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A case with this caseId already exists" });
    }
    next(err);
  }
}

export async function getCase(req, res, next) {
  try {
    const found = await Case.findOne({ caseId: req.params.caseId });
    if (!found) return res.status(404).json({ error: "Case not found" });

    const evidenceCount = await Evidence.countDocuments({ caseId: req.params.caseId });
    res.json({ ...found.toObject(), evidenceCount });
  } catch (err) {
    next(err);
  }
}

export async function listCases(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const cases = await Case.find()
      .sort("-createdAt")
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await Case.countDocuments();
    res.json({ results: cases, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}
