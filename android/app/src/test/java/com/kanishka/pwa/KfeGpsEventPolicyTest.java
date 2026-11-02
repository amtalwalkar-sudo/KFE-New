package com.kanishka.pwa;

import static org.junit.Assert.*;
import org.junit.Test;

public class KfeGpsEventPolicyTest {
  @Test public void allowsOnlyTheFourTripBoundaryEvents() {
    assertTrue(KfeGpsEventPolicy.supports("TRIP", "PICKUP_START"));
    assertTrue(KfeGpsEventPolicy.supports("TRIP", "TRIP_START"));
    assertTrue(KfeGpsEventPolicy.supports("TRIP", "TRIP_END"));
    assertTrue(KfeGpsEventPolicy.supports("TRIP", "TRIP_CANCELLED"));
    assertFalse(KfeGpsEventPolicy.supports("SHIFT", "TRIP_START"));
    assertFalse(KfeGpsEventPolicy.supports("TRIP", "FUEL_REFILL"));
    assertFalse(KfeGpsEventPolicy.supports("TRIP", "LOCATION_POLL"));
  }

  @Test public void preservesExistingTripJournalKeys() {
    assertEquals("trip-123::TRIP_START",
      KfeGpsEventPolicy.key("TRIP", "trip-123", "TRIP_START"));
    assertEquals("VEHICLE::vehicle-9::TRIP_START",
      KfeGpsEventPolicy.key("VEHICLE", "vehicle-9", "TRIP_START"));
  }

  @Test public void eventFixMustFallInsideOriginalThirtySecondWindow() {
    String eventAt = "2026-11-01T00:00:00Z";
    long eventTime = java.time.Instant.parse(eventAt).toEpochMilli();
    assertEquals(30_000L, KfeGpsEventPolicy.remainingCaptureWindowMs(eventAt, eventTime));
    assertEquals(20_000L, KfeGpsEventPolicy.remainingCaptureWindowMs(eventAt, eventTime + 10_000L));
    assertEquals(0L, KfeGpsEventPolicy.remainingCaptureWindowMs(eventAt, eventTime + 30_000L));
    assertTrue(KfeGpsEventPolicy.isFixWithinEventWindow(eventAt, eventTime));
    assertTrue(KfeGpsEventPolicy.isFixWithinEventWindow(eventAt, eventTime + 29_999L));
    assertFalse(KfeGpsEventPolicy.isFixWithinEventWindow(eventAt, eventTime - 1L));
    assertFalse(KfeGpsEventPolicy.isFixWithinEventWindow(eventAt, eventTime + 30_000L));
    assertFalse(KfeGpsEventPolicy.isFixWithinEventWindow("invalid", eventTime + 1L));
  }

  @Test public void preservesCanonicalSnapshotIds() {
    assertEquals("native-event-location-trip-123-TRIP_END",
      KfeGpsEventPolicy.snapshotId("TRIP", "trip-123", "TRIP_END"));
  }
}
