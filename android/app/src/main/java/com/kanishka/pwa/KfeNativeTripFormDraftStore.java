package com.kanishka.pwa;

import android.content.SharedPreferences;

/**
 * Durable draft boundary for native fare and cancellation forms.
 * Owns only draft serialization; it never creates views or commits business records.
 */
final class KfeNativeTripFormDraftStore {
  private KfeNativeTripFormDraftStore() {}

  static final class Draft {
    final String mode, fare, toll, parking, reason;
    final boolean cancelFormPwaSynchronized, tollExpanded, parkingExpanded;

    Draft(String mode, String fare, String toll, String parking, String reason,
        boolean cancelFormPwaSynchronized, boolean tollExpanded, boolean parkingExpanded) {
      this.mode = mode == null ? "" : mode;
      this.fare = fare == null ? "" : fare;
      this.toll = toll == null ? "" : toll;
      this.parking = parking == null ? "" : parking;
      this.reason = reason == null ? "" : reason;
      this.cancelFormPwaSynchronized = cancelFormPwaSynchronized;
      this.tollExpanded = tollExpanded;
      this.parkingExpanded = parkingExpanded;
    }
  }

  static Draft load(SharedPreferences prefs) {
    return new Draft(
        prefs.getString("formMode", ""),
        prefs.getString("formValue", ""),
        prefs.getString("tollValue", ""),
        prefs.getString("parkingValue", ""),
        prefs.getString("cancelReason", ""),
        prefs.getBoolean("cancelFormPwaSynchronized", false),
        prefs.getBoolean("tollExpanded", false),
        prefs.getBoolean("parkingExpanded", false),
        false, false);
  }

  static void save(SharedPreferences prefs, Draft draft) {
    prefs.edit()
        .putString("formMode", draft.mode)
        .putString("formValue", draft.fare)
        .putString("tollValue", draft.toll)
        .putString("parkingValue", draft.parking)
        .putString("cancelReason", draft.reason)
        .putBoolean("cancelFormPwaSynchronized", draft.cancelFormPwaSynchronized)
        .putBoolean("tollExpanded", draft.tollExpanded)
        .putBoolean("parkingExpanded", draft.parkingExpanded)
        .apply();
  }

  static void clear(SharedPreferences prefs) {
    prefs.edit().remove("formMode").remove("formValue").remove("tollValue")
        .remove("parkingValue").remove("cancelReason").remove("cancelFormPwaSynchronized")
        .remove("tollExpanded").remove("parkingExpanded").remove("tollExcluded")
.apply();
  }
}
