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

  @Test public void preservesCanonicalSnapshotIds() {
    assertEquals("native-event-location-trip-123-TRIP_END",
      KfeGpsEventPolicy.snapshotId("TRIP", "trip-123", "TRIP_END"));
  }
}
