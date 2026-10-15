package com.kanishka.pwa;

/** Pure gesture math shared by the native swipe view and JVM regression tests. */
final class KfeSwipeGesture {
  private KfeSwipeGesture() {}

  static float progress(float displacementX, float maxTravel) {
    if (!Float.isFinite(displacementX) || !Float.isFinite(maxTravel) || maxTravel <= 0f) return 0f;
    return Math.max(0f, Math.min(1f, displacementX / maxTravel));
  }

  static boolean hasMovedRight(float displacementX, float movementSlop) {
    return Float.isFinite(displacementX) && displacementX > Math.max(0f, movementSlop);
  }

  static boolean shouldCommit(float displacementX, float maxTravel, float movementSlop, float threshold) {
    if (!hasMovedRight(displacementX, movementSlop) || !Float.isFinite(threshold) || threshold < 0f || threshold > 1f) return false;
    return progress(displacementX, maxTravel) >= threshold;
  }
}
