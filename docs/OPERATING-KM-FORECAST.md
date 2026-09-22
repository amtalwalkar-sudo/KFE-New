# Operating KM Forecast — Provisional Numerical Freeze

Status: provisionally frozen for implementation and production observation.

## Frozen parameters

- Normal prior: **200 km/calendar day**
- Baseline evidence response: **0.10**
- Maximum persistence response: **0.30**
- Persistence build-up: **5 consecutive same-direction observations**
- Robust deviation cap: **75 km/day**

## Behavioural contract

The forecast starts from the 200 km/calendar-day prior.

Authoritative completed shift odometer evidence updates the forecast. Evidence response increases with persistent same-direction observations, reaching the conservative maximum after five observations. Individual deviations are robustly clipped at 75 km/day so isolated extremes cannot dominate the forecast.

The forecast must:

- move upward under sustained higher operating KM;
- move downward under sustained lower operating KM;
- remain anchored at 200 km/day under sustained 200 km/day observations;
- limit the influence of isolated extreme observations;
- resist alternating/noisy regimes;
- reverse when sustained evidence reverses;
- converge toward sustained operating reality without jumping directly to a single observation.

## Full-period forecast

For an open period, observed completed-shift KM through the as-of boundary is retained and the learned daily forecast is applied to the remaining calendar days.

`fullPeriodForecast = observedKmToDate + learnedDailyForecast × remainingCalendarDays`

If there is no usable observation, the full-period forecast remains the prior multiplied by the remaining calendar days.

## Evidence authority

Completed shift end odometer minus start odometer is the operating-KM evidence source. Invalid or incomplete odometer pairs are ignored.

## Future override readiness

There is **no user-facing manual override** in this release.

The domain output intentionally separates:

- `calculatedForecast`
- `effectiveForecast`

They are currently identical. Future authorized override logic can replace only the effective value without changing the forecasting algorithm or historical evidence.

## Calibration policy

These coefficients are provisional rather than permanently immutable. They should only be reconsidered after meaningful real-world operating history demonstrates a systematic calibration problem. Synthetic edge-case exploration alone is not a reason to reopen them.


## Driver Target volume boundary

The Operating KM Forecast is now the authoritative **volume input** to the daily Driver Target.

The boundary is intentionally explicit:

- `normalPriorKmPerCalendarDay = 200` is the neutral volume baseline.
- `operatingKmMultiplier = learnedDailyForecastKm / 200`.
- The remaining financial base obligation for the current day is multiplied by that volume factor.
- Finalized/opening recovery remains a separate rupee obligation and is not erased by KM learning.
- At exactly 200 forecast KM/day, the Driver Target follows the existing financial calculation unchanged.
- Sustained higher/lower KM regimes therefore raise/lower the daily target proportionally.
- Break-even, desired driver profit, and recovery remain financial authorities; KM forecasting controls only the volume allocation.

This keeps the original KFE chain intact: **200 km/day prior → historical KM learning → projected daily KM → daily Driver Target volume allocation**.
