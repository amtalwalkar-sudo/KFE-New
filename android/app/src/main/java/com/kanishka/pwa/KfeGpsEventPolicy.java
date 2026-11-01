package com.kanishka.pwa;

import java.time.Instant;

/**
 * Stable identity rules for the four event-time GPS snapshots.
 *
 * Kept outside the overlay service so UI/lifecycle changes cannot silently
 * alter the durable event journal or canonical snapshot identifiers.
 */
final class KfeGpsEventPolicy {
  private KfeGpsEventPolicy() {}

  static final long MAX_EVENT_FIX_AGE_MS = 30_000L;

  static long eventAtMillis(String eventAt) {
    if (eventAt == null || eventAt.trim().isEmpty()) return -1L;
    try { return Instant.parse(eventAt.trim()).toEpochMilli(); }
    catch (Exception error) { return -1L; }
  }

  static long remainingCaptureWindowMs(String eventAt, long now) {
    long eventTime = eventAtMillis(eventAt);
    if (eventTime <= 0L || now < eventTime) return 0L;
    long elapsed = now - eventTime;
    return elapsed >= MAX_EVENT_FIX_AGE_MS ? 0L : MAX_EVENT_FIX_AGE_MS - elapsed;
  }

  static boolean isFixWithinEventWindow(String eventAt, long fixTime) {
    long eventTime = eventAtMillis(eventAt);
    return eventTime > 0L && fixTime > 0L && fixTime >= eventTime
      && fixTime - eventTime < MAX_EVENT_FIX_AGE_MS;
  }

  static boolean supports(String entityType, String eventType) {
    return "TRIP".equals(entityType)
      && ("PICKUP_START".equals(eventType)
        || "TRIP_CANCELLED".equals(eventType)
        || "TRIP_START".equals(eventType)
        || "TRIP_END".equals(eventType));
  }

  static String key(String entityType, String entityId, String eventType) {
    if ("TRIP".equals(entityType)) return entityId + "::" + eventType;
    return entityType + "::" + entityId + "::" + eventType;
  }

  static String snapshotId(String entityType, String entityId, String eventType) {
    return "TRIP".equals(entityType)
      ? "native-event-location-" + entityId + "-" + eventType
      : "native-event-location-" + entityType + "-" + entityId + "-" + eventType;
  }
}
