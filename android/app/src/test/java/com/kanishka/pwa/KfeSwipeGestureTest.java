package com.kanishka.pwa;

import static org.junit.Assert.*;
import org.junit.Test;

public class KfeSwipeGestureTest {
  private static final float TRAVEL = 300f;
  private static final float SLOP = 8f;
  private static final float THRESHOLD = 0.70f;

  @Test public void progressUsesDisplacementFromTouchDown() {
    assertEquals(0.0f, KfeSwipeGesture.progress(0f, TRAVEL), 0.0001f);
    assertEquals(0.5f, KfeSwipeGesture.progress(150f, TRAVEL), 0.0001f);
    assertEquals(1.0f, KfeSwipeGesture.progress(400f, TRAVEL), 0.0001f);
  }

  @Test public void leftwardAndStationaryReleasesNeverCommit() {
    assertFalse(KfeSwipeGesture.hasMovedRight(-250f, SLOP));
    assertFalse(KfeSwipeGesture.shouldCommit(-280f, TRAVEL, SLOP, THRESHOLD));
    assertFalse(KfeSwipeGesture.shouldCommit(0f, TRAVEL, SLOP, THRESHOLD));
    assertFalse(KfeSwipeGesture.shouldCommit(8f, TRAVEL, SLOP, THRESHOLD));
  }

  @Test public void releasePositionIsEvaluatedEvenWhenLastMoveWasEarlier() {
    // ACTION_MOVE can stop at 190 px; ACTION_UP at 220 px crosses 70% of 300 px.
    assertFalse(KfeSwipeGesture.shouldCommit(190f, TRAVEL, SLOP, THRESHOLD));
    assertTrue(KfeSwipeGesture.shouldCommit(220f, TRAVEL, SLOP, THRESHOLD));
  }

  @Test public void shortRightwardDragCannotCommitFromAnAbsoluteScreenPosition() {
    // Touch-down may be at any local x; only displacement matters.
    assertFalse(KfeSwipeGesture.shouldCommit(30f, TRAVEL, SLOP, THRESHOLD));
  }

  @Test public void invalidTravelCannotCommit() {
    assertEquals(0f, KfeSwipeGesture.progress(100f, 0f), 0.0001f);
    assertFalse(KfeSwipeGesture.shouldCommit(250f, 0f, SLOP, THRESHOLD));
  }
}
