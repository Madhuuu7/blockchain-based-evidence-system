import Alert from "../models/Alert.js";

/**
 * Records security events raised by the API itself.
 *
 * The event listener already mirrors on-chain AccessDenied events, and
 * verifyEvidence raises IntegrityViolation. Neither sees anything that happens
 * at the door: a wallet signing in with a bad signature, a replayed nonce, or a
 * valid session reaching for an endpoint its role does not cover. Someone
 * probing the system through the website left no trace at all, which is the
 * gap this closes.
 *
 * Events are grouped rather than appended. A script hammering the login
 * endpoint would otherwise produce thousands of rows and bury every real
 * alert, so a repeat of the same event by the same wallet inside the window
 * increments a counter on the open alert instead of creating another one.
 */
const GROUPING_WINDOW_MS = Number(process.env.ALERT_GROUPING_WINDOW_MS) || 5 * 60 * 1000;

export async function recordSecurityAlert({
  type,
  walletAddress,
  message,
  route = undefined,
  evidenceId = undefined
}) {
  const wallet = walletAddress ? String(walletAddress).toLowerCase() : undefined;
  const since = new Date(Date.now() - GROUPING_WINDOW_MS);

  try {
    // Only unresolved alerts are grouped onto. Once an administrator has
    // marked something resolved, a fresh occurrence is news again and should
    // reappear rather than silently bumping a closed row.
    const existing = await Alert.findOne({
      type,
      walletAddress: wallet,
      route,
      resolved: false,
      lastSeenAt: { $gte: since }
    });

    if (existing) {
      existing.occurrences += 1;
      existing.lastSeenAt = new Date();
      existing.message = message;
      await existing.save();
      return existing;
    }

    return await Alert.create({
      type,
      walletAddress: wallet,
      route,
      evidenceId,
      message,
      occurrences: 1,
      lastSeenAt: new Date()
    });
  } catch (err) {
    // An alert that cannot be written must never take down the request that
    // triggered it - the caller is already being refused, and turning a
    // refusal into a 500 would be a worse outcome than a missing alert.
    console.error("[securityAlert] Failed to record alert:", err.message);
    return null;
  }
}
