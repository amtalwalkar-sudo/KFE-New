package com.kanishka.pwa;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pure validation rules shared by native trip-form presentations.
 *
 * Keep these rules independent of Android views so form UI can change without
 * changing the canonical command or its durable transaction semantics.
 */
final class KfeNativeTripFormRules {
  private KfeNativeTripFormRules() {}

  /** Blank amounts are optional; any supplied amount must be finite and non-negative. */
  static boolean isValidOptionalAmount(String raw) {
    if (raw == null || raw.trim().isEmpty()) return true;
    try {
      double amount = Double.parseDouble(raw.trim());
      return Double.isFinite(amount) && amount >= 0d;
    } catch (RuntimeException invalidAmount) {
      return false;
    }
  }

  /** Build the bounded fare command payload without depending on form widgets. */
  static JSONObject buildFarePayload(String fare, String toll, String parking,
      boolean tollExcluded, boolean parkingExcluded) throws JSONException {
    JSONObject payload = new JSONObject();
    payload.put("fare", fare == null ? "" : fare.trim());
    payload.put("toll", toll == null ? "" : toll.trim());
    payload.put("parking", parking == null ? "" : parking.trim());
    payload.put("tollTreatment", tollExcluded ? "EXCLUDED" : "INCLUDED");
    payload.put("parkingTreatment", parkingExcluded ? "EXCLUDED" : "INCLUDED");
    return payload;
  }

  /** Build the bounded cancellation command payload without depending on form widgets. */
  static JSONObject buildCancellationPayload(String amount, String reason) throws JSONException {
    JSONObject payload = new JSONObject();
    payload.put("revenue", amount == null ? "" : amount.trim());
    payload.put("reason", reason == null ? "" : reason);
    return payload;
  }

  /** Only the cancellation reasons presented by the native form are accepted. */
  static boolean isValidCancellationReason(String reason) {
    return "PASSENGER".equals(reason) || "DRIVER".equals(reason);
  }
}
