package com.kanishka.pwa;

/**
 * Stable identity rules for the four event-time GPS snapshots.
 *
 * Kept outside the overlay service so UI/lifecycle changes cannot silently
 * alter the durable event journal or canonical snapshot identifiers.
 */
final class KfeGpsEventPolicy {
  private KfeGpsEventPolicy() {}

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
