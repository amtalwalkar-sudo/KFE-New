package com.kanishka.pwa;

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

  /** Only the cancellation reasons presented by the native form are accepted. */
  static boolean isValidCancellationReason(String reason) {
    return "PASSENGER".equals(reason) || "DRIVER".equals(reason);
  }
}
