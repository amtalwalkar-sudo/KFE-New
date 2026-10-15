package com.kanishka.pwa;

import static org.junit.Assert.*;
import org.junit.Test;

public class KfePendingActionStateTest {
  @Test public void persistentLockSurvivesMissingOrWrongAcknowledgement() {
    String pending = "event-123";
    assertFalse(KfePendingActionState.matchesAwaitingEvent(pending, null));
    assertFalse(KfePendingActionState.matchesAwaitingEvent(pending, ""));
    assertFalse(KfePendingActionState.matchesAwaitingEvent(pending, "event-other"));
    // No acknowledgement means the native state must remain locked, not create a duplicate action.
    assertTrue(KfePendingActionState.matchesAwaitingEvent(pending, pending));
  }

  @Test public void emptyPendingIdCannotUnlockOrMatch() {
    assertFalse(KfePendingActionState.matchesAwaitingEvent("", "event-123"));
    assertFalse(KfePendingActionState.matchesAwaitingEvent(null, "event-123"));
  }
}
