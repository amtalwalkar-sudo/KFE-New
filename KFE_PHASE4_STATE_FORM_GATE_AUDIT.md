# KFE Phase 4 — State / Form / Gate Integrity Audit

This section verifies the existing authoritative business rules at runtime. It does **not** create or change business rules.

The audit must distinguish:
- **authoritative gates** that are compulsory for a state transition;
- **optional operational inputs** that may be entered when applicable but must not block an otherwise valid transition;
- **state-specific forms** that must appear only when their triggering state/action is reached;
- **cancellation paths** that must not be forced through completed-trip revenue.

## K — State / Form / Gate Integrity

| ID | State / transition | Expected form/action | Authoritative gate | Optional inputs | Must NOT happen |
|---|---|---|---|---|---|
| K1 | Offline → Start Shift | Start-shift form | **Authoritative shift-start odometer** | Odometer-gap classification when applicable | Shift starts without valid start odometer |
| K2 | Start-shift odometer gap | Gap classification | Required when a gap exists | Personal KM / Dead KM selection | Gap silently ignored or invented |
| K3 | Shift active | Work cockpit | Shift is active after K1 gate | Trip-level operational detail | Trip fields become shift-start gates |
| K4 | Shift active → Start Trip | Trip-start flow | Trip lifecycle rules | Trip odometer/GPS where supported | Trip start requires shift-end fields |
| K5 | Active trip → Complete Trip | End-trip flow | Valid trip lifecycle transition | Trip KM / fare detail where optional | Completion is blocked solely because optional trip detail was not entered |
| K6 | Completed trip → fare/revenue detail | Fare form only when applicable to completed-trip workflow | No trip fare may replace shift revenue authority | Trip fare/details | Cancelled trip is treated as completed revenue |
| K7 | Pickup → Cancel Trip | Cancellation flow | Cancellation permitted only in pickup state | Cancellation details where applicable | Cancelled trip forced through normal completion/fare path |
| K8 | Cancelled trip → persisted state | Cancellation confirmation/result | Canonical trip becomes cancelled once | — | Completed-trip revenue created by cancellation |
| K9 | Any active trip → Offline / End Shift | End-shift attempt | **Blocked while an active ride exists** | — | Shift closes prematurely |
| K10 | Online → Offline / End Shift | End-shift form | Valid shift + **authoritative closing odometer + compulsory shift-end revenue** | Toll / parking when applicable | Optional toll/parking blocks shift closure |
| K11 | End-shift form → Back | Return to active shift | No authoritative end write | — | Back ends the shift |
| K12 | Valid end-shift form → OK | End shift | All compulsory end-shift fields valid | Optional expenses | Driver must press Offline again after OK |
| K13 | Trip / shift expense | Toll / parking entry | Actual applicable expense only | **Toll and parking are optional** | Empty optional expense becomes a gate |
| K14 | Trip lifecycle | Trip odometer / trip fare | Not a universal shift gate | **Trip odometer and trip revenue are optional operational detail** | Every trip is forced to contain odometer + revenue |
| K15 | Duplicate submit/tap | Same state/action | Canonical transition is idempotent | — | Duplicate trip, fare, cancellation, or shift record |
| K16 | Reload/background during form | Form/state recovery | Persisted canonical state governs recovery | Unsaved optional input may require explicit recovery behavior | UI invents a new authoritative state |
| K17 | PWA ↔ overlay | Same lifecycle action | Canonical Work/trip path | Surface-specific presentation | Overlay creates a competing trip/revenue authority |
| K18 | Shift end → next shift/day | New shift | New authoritative start odometer | Prior operational details remain historical | Prior shift's closing odometer is silently reused as a new start |

## Required runtime assertions

For each K scenario capture the exact **DD MM YYYY** and **HH MM SS**, build/device identity, starting state, action sequence, visible form state, gate result, persisted canonical record, and final state.

A K scenario is PASS only when both halves agree:

**Form timing:** the correct form is visible only at the correct state.

**Gate enforcement:** only compulsory authoritative inputs can block the transition; optional inputs cannot accidentally become gates.

### Authority summary

The existing business-rule authority remains:

- **Shift start:** authoritative start odometer.
- **Shift end:** authoritative closing odometer.
- **Shift end revenue:** compulsory and authoritative.
- **Trip odometer:** optional operational detail.
- **Trip fare/revenue:** optional supporting detail where the trip workflow permits it; it does not override shift revenue.
- **Cancellation:** separate lifecycle path; cancelled/unvalidated trips do not become completed-trip revenue.
- **Toll / parking:** optional actual expense records when applicable; absence does not by itself block a valid shift transition.

This is an operational verification layer only. It must not be interpreted as creating a new business rule.

## Phase 4 exit implication

K scenarios must be executed alongside A–J. Any mismatch becomes a Phase 4 operational defect. Phase 5 remains locked until the complete Phase 4 audit and defect consolidation are finished.

**No production-readiness claim is made.**

