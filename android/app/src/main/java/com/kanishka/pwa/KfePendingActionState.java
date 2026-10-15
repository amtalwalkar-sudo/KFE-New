package com.kanishka.pwa;

/** Pure pending-event guard; an in-flight overlay action unlocks only on its own acknowledgement. */
final class KfePendingActionState {
  private KfePendingActionState() {}

  static boolean matchesAwaitingEvent(String awaitingEventId, String acknowledgedEventId) {
    return awaitingEventId != null && !awaitingEventId.isEmpty()
        && acknowledgedEventId != null && awaitingEventId.equals(acknowledgedEventId);
  }
}
