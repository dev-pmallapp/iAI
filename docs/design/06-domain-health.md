# Domain: Health monitoring

> **iAI is not a medical device.** It does not diagnose. It does not prescribe.
> It does not adjust medication, supplement doses or training prescriptions. It
> observes, trends, flags anomalies against reference ranges you supply, and
> prepares questions for a qualified clinician.
>
> **Every output that touches a clinical decision routes to a clinician, never
> to an action.** There is no path through this pack that ends in a therapy
> change. The pack's terminal artifact is a *brief* — a document a human carries
> into an appointment.
>
> **If symptoms are acute, call emergency services.** The pipeline is required to
> say this and stop. See *Anomaly versus emergency*.

This is ARCHITECTURE's design decision restated as a pack: *"Health is
advisory-only, by construction. No medical authority; avoids the entire
liability surface."* The rejected alternative was diagnostic scoring, and it was
rejected on purpose.

---

## 1. Purpose and scope

The `health` pack turns a TELOS health goal into the same
Milestone → Story → Task machine every other domain uses, and binds four nouns
to it: a protocol or marker is the unit, a trend is the verification, the
clinician boundary is the gate, and a lab PDF plus daily metrics are the
evidence.

**It is for:**

| Job | Shape |
|-----|-------|
| Continuous ingestion of biometrics | Wearable and app adapters write day files on a schedule |
| Continuous ingestion of labs | Panel results land as structured biomarkers with per-result reference ranges |
| Trend detection | Longitudinal movement of one marker over a pre-declared window |
| Protocol adherence tracking | Did you do the thing you said you would do, on how many days |
| Confounder control | Naming what else moved, so a trend is not read naively |
| Clinician-visit preparation | A brief: what changed, what you did, what you want to ask |

**It is not for:**

| Not for | Because |
|---------|---------|
| Diagnosis | Naming a condition is a clinical act. The gate holds the output and rewrites it as a question |
| Treatment decisions | Dose, drug, and training prescription belong to a clinician |
| Emergency response | The system has no realtime channel, no duty of care, and no ability to summon help. It prints an instruction to seek care and halts |
| Replacing a clinician | The brief exists to make an appointment better, not to avoid one |
| Interpreting a single value | One out-of-range result is a data point, not a finding. See rung `trend` |

The boundary is enforced structurally, not by prompt discipline. The
`clinician-review` rung has no automatic successor, and `binding.gate.autoDeny`
refuses the tool call before the model can emit the sentence.

---

## 2. The binding

```ts
export const healthBinding: DomainBinding = {
  id: "health",

  unitOfWork: {
    noun:        "protocol",
    description: "One intervention with a measurable target and a stated " +
                 "duration, or one tracked marker's full " +
                 "measurement -> trend -> review chain",
    minSize:     "one marker, one measurement cadence, one review",
    maxSize:     "one protocol, one primary marker, one declared window",
    leafSkill:   "health/protocol",
  },

  verify: {
    defaultRung: "observe",
    passing:     "The pre-declared marker moved in the pre-declared direction " +
                 "over the pre-declared window, confounders are named, and a " +
                 "clinician has seen the brief",
    evidenceRequired: true,
    rungs: [
      {
        id: "observe",
        name: "Observe",
        entryCriteria: [
          "source reports status ok, not stale or failed",
          "day files exist for the window with <= 10% missing days",
          "day boundary resolved against a declared timezone",
        ],
        verifier: "tool-checked",
        reversible: true,
      },
      {
        id: "trend",
        name: "Trend",
        entryCriteria: [
          "window declared in the ISA before the first data point",
          "minimum point count N declared and met",
          "direction stated as improving, worsening or flat",
          "confounders enumerated with their own series",
        ],
        verifier: "tool-checked",
        reversible: true,
      },
      {
        id: "flag",
        name: "Flag",
        entryCriteria: [
          "threshold pre-declared, not fitted after the fact",
          "threshold crossed, or value outside per-result ref_low/ref_high",
          "crossing persists across >= 2 consecutive measurements",
        ],
        verifier: "model-judged",
        reversible: true,
      },
      {
        id: "clinician-review",
        name: "Clinician review",
        entryCriteria: [
          "clinician brief generated locally and committed",
          "brief contains questions, never instructions",
          "named human clinician and appointment date on record",
          "human attests the clinician has seen it",
        ],
        verifier: "human-attested",
        reversible: false,
      },
    ],
  },

  gate: {
    irreversibleAction: "changing a medication, supplement dose, or training " +
                        "load in a way a clinician should approve",
    authoriser:  "the human, informed by a qualified clinician",
    killSwitch:  "iai health halt --emit-emergency-notice",
    vetoAgent:   "health-analyst",
    autoDeny: [
      "output names a condition, diagnosis or differential",
      "output states or implies a dose, drug, or training prescription",
      "output would be emitted to any recipient other than the brief",
      "emergency-class signal present in the window",
      "class:private content would egress to a cloud model",
      "single out-of-range value with no prior series",
    ],
  },

  evidence: {
    kind:         "lab PDF + daily metrics + adherence log",
    sentinel:     "## iai-evidence",
    pathTemplate: "docs/evidence/{issue}-{ts}.md",
    budgetChars:  60000,
    pinned:       true,
  },

  labels: {
    namespace: "domain:health",
    extra: [
      { name: "rung:observe",           color: "c5def5" },
      { name: "rung:trend",             color: "79b8ff" },
      { name: "rung:flag",              color: "fbca04" },
      { name: "rung:clinician-review",  color: "8250df" },
      { name: "health:emergency",       color: "b60205" },
      { name: "class:private",          color: "6e7781" },
    ],
  },
}
```

Note that `rung:clinician-review` is coloured purple, not green. It is not a
success state. It is a handoff.

---

## 3. Unit of work

A Task in the `health` domain is **one protocol** or **one tracked marker**.

The granularity rule, stated three ways:

| Scale | Object | Example |
|-------|--------|---------|
| Task | A protocol change or a marker's full chain | "Raise ApoB monitoring from quarterly to monthly" |
| Story | An outcome the markers are supposed to prove | "Lower ApoB from 88 to under 60" |
| Milestone | A programme of protocols across markers | "Q3 metabolic overhaul" |

One marker's full **measurement + trend + review** chain is exactly one Task.
Do not split it into three Tasks — the measurement is worthless without the
trend, and the trend is unreviewable without the review. Do not merge two
markers into one Task either; ApoB and HbA1c move on different cadences, respond
to different confounders, and fail independently.

| Test | Verdict |
|------|---------|
| "Raise ApoB monitoring from quarterly to monthly" | Task. One marker, one cadence change, one review |
| "Log 90 days of adherence to the Q3 lipid protocol" | Task. One protocol, bounded duration |
| "Lower ApoB from 88 to under 60" | Story. An outcome with claims, not a unit of work |
| "Fix my metabolic health" | Milestone at best; more likely an unscoped goal. `size` fails it |
| "Measure ApoB" with no window and no review | Below `minSize`. Fold into the sibling Task that owns the review |
| "Track ApoB, Lp(a), hs-CRP and HbA1c" | Above `maxSize`. `replan` cuts four Tasks |

`task-create` reads `binding.unitOfWork` and anchors each Task to one `ISC-N`
claim in the Story's ISA, so a marker with no verifiable claim behind it does
not become a Task at all.

---

## 4. Verification rungs

```
observe ──▶ trend ──▶ flag ──▶ clinician-review ──▶ (nothing)
```

| Rung | What it proves | What promotes off it |
|------|----------------|----------------------|
| `observe` | Data exists and is fresh. The source reports `ok`, day files cover the window, the day boundary is timezone-resolved, and missingness is under the declared tolerance | A declared window and a declared minimum point count `N`, both written into the ISA **before** the first point is collected |
| `trend` | At least `N` points across the pre-declared window, reduced to a stated direction — improving, worsening or flat — with confounders enumerated as their own series | A pre-declared threshold or a per-result reference range that the series actually crosses |
| `flag` | A trend crosses a pre-declared threshold, or a value sits outside its own `ref_low`/`ref_high`, and the crossing persists across at least two consecutive measurements | A clinician brief, generated locally, containing questions and no instructions, plus a named clinician and an appointment |
| `clinician-review` | A human clinician has seen the brief. Attested by the human, never inferred | **Nothing.** There is no automatic promotion past this rung, in any domain configuration, ever |

Four properties make the ladder honest:

| Property | Detail |
|----------|--------|
| Thresholds are pre-declared | A threshold chosen after seeing the series is curve-fitting. `story-design` writes it into the ISA; `task-verify` re-reads it from disk and refuses a threshold whose file mtime is later than the first data point |
| Direction is stated, not discovered | The ISA says "ApoB decreasing"; the verifier checks that claim, it does not go looking for whatever moved |
| Persistence is required to flag | Two consecutive measurements, minimum. A lone excursion is assay noise until proven otherwise |
| The last rung is `reversible: false` | Because a brief handed to a clinician cannot be unhanded. That is what puts it behind `gate` |

`defaultRung` is `observe`, exactly as `trade` defaults to `research`: the safe
rung is index 0 and the irreversible one is opt-in.

---

## 5. Safety gate

**The irreversible action:** *changing a medication, supplement dose, or
training load in a way a clinician should approve.*

**The authoriser:** the human, informed by a qualified clinician. Not the
health-analyst. Not the conductor. Not a confidence score.

iAI produces a **clinician brief**, never an instruction. The distinction is
mechanical, and `guards/` enforces it:

| iAI may write | iAI may not write |
|---------------|-------------------|
| "ApoB moved 88 → 74 mg/dL between 2026-04-12 and 2026-07-19 across 4 panels" | "ApoB is still too high" |
| "Adherence to the Q3 protocol was 81 of 90 days" | "Increase the dose to hit target" |
| "Question for Dr. Reyes: does the hs-CRP rise at 2026-06-08 change the plan?" | "The hs-CRP rise indicates inflammation" |
| "Sleep efficiency fell from 0.91 to 0.84 over the same window" | "Poor sleep is causing the ApoB plateau" |
| "Marker is outside its stated reference range (ref 0.0–1.0 mg/L)" | "You have [condition]" |

The gate produces the standard three artifacts from `03-workflow.md`: a
`gate:pending` label, a `## iai-gate` sentinel comment, and a runtime block
(`permission.ask` on opencode, `PreToolUse` exit 2 on Claude Code). The
`Clinician boundary` row of the gate table is this gate:

> `health-analyst` output would name a condition or alter a therapy → Human;
> rewritten as a clinician question → Yes — output is held, never emitted.

**Held, never emitted** is the important half. The blocked text is not shown to
the user with a warning attached. It is discarded and regenerated as a question.

### Anomaly versus emergency

An **anomaly** enters the pipeline at rung `flag`. An **emergency**
short-circuits the entire pipeline, prints an instruction to seek immediate
care, applies `health:emergency`, and stops. No trend is computed. No brief is
drafted. No model is consulted about what it might mean.

| Signal | Anomaly — flag and brief | Emergency — halt and instruct |
|--------|--------------------------|-------------------------------|
| Resting heart rate | RHR drifts 52 → 61 bpm over 6 weeks | RHR sustained **> 120 bpm** at rest |
| Oxygen saturation | Nightly SpO2 nadir drifts 93% → 91% | SpO2 **< 88%** |
| Chest | No chest signal in the series | Any mention of **chest pain**, pressure, or radiating arm/jaw pain |
| Weight | +1.4 kg over 30 days with stable intake | **+3 kg overnight** together with breathlessness |
| Blood pressure | 128/82 trending up from 118/76 | Systolic > 180 or diastolic > 120 |
| Glucose | Fasting glucose 98 → 106 mg/dL | Symptomatic hypoglycaemia, or confusion with any glucose reading |
| Neurological | None | Sudden weakness, facial droop, speech difficulty, or worst-ever headache |

The emergency rule, stated as an invariant:

> **Any signal in the right-hand column short-circuits the pipeline.** The run
> emits the notice below, halts, and does not resume until a human clears
> `health:emergency` with a comment. Emergency detection is a deterministic
> predicate over structured data in `iai-core/guards/`. It never depends on a
> model's judgement, because a model that is wrong here is wrong in the
> expensive direction.

```
HARD FAILURE in Phase 6 (task-do):
- Story: #57
- Domain: health
- Found: emergency-class signal (SpO2 84% at 2026-08-19T03:41-07:00)
- Action: THIS IS NOT A MEDICAL ASSESSMENT. If you are experiencing symptoms
  now, stop reading and call your local emergency number. Pipeline halted.
  Label health:emergency applied to #57. No trend, flag or brief was produced.
```

The notice is printed by the guard, not written by the model, so it cannot be
paraphrased, softened, or buried under an explanation.

---

## 6. Leaf skills

All eight live under `skills/health/`. Leaves are invoked by Tier-1 verbs, never
directly by the user.

| Skill | Argument hint | Description | Gate? |
|-------|---------------|-------------|-------|
| `health/ingest` | `[source?] [--since 2026-07-01]` | Run the four healthsync adapters (`oura`, `eightsleep`, `apple`, `function`), write day files to `USER/HEALTH/DATA/`, update `sources` in `current.json`. Reports per-source `SourceStatus` | No |
| `health/trend` | `[marker] [--window 90d] [--min-points 4]` | Longitudinal movement of one marker over a pre-declared window. Refuses if the window was declared after the first point. Computes locally on structured data | No |
| `health/anomaly` | `[marker?] [--window 30d]` | Out-of-band flagging against per-result `ref_low`/`ref_high` and pre-declared thresholds. Runs the emergency predicate first and halts on a hit. Never a diagnosis | **Yes** — emergency short-circuit; `flag` output is held pending gate |
| `health/protocol` | `[story#] [--duration 90d]` | Define or revise an intervention with a measurable target and a stated duration; open the adherence log. The `unitOfWork.leafSkill` for this pack | **Yes** — if the revision alters a dose or training load |
| `health/lab-review` | `[panel] [--vs 2026-04-12]` | Delta of a lab panel against prior panels, per-marker, carrying each result's own reference range forward. Detects assay/range changes mid-series | No |
| `health/clinician-brief` | `[provider] [--visit 2026-11-04]` | Draft the brief: window, series, adherence, confounders, and a numbered question set. Generated **locally**. Questions only | **Yes** — clinician boundary; blocks any imperative sentence |
| `health/sleep-review` | `[--window 30d]` | Sleep architecture, efficiency, debt, and bed temperature from `LastNight` series across Oura and Eight Sleep | No |
| `health/training-load` | `[--window 28d]` | Load, strain and recovery balance. Flags load changes as **confounders** for other markers; never prescribes a session | **Yes** — if the output would alter prescribed training load |

Four of eight are gated. That ratio is the point of the pack.

---

## 7. Data model

Filesystem and GitHub, no database, per ARCHITECTURE. `USER/` is a symlink into
a private store; none of this enters the public repo.

```
USER/HEALTH/
├── HEALTH.md                       narrative state of record
├── METRICS.md                      the biomarker table (schema below)
├── FITNESS.md                      training history, capacity markers
├── NUTRITION.md                    intake pattern, not a food diary
├── MEDICATIONS.md                  current therapies, doses, prescriber
├── PROVIDERS.md                    clinicians, specialty, next appointment
├── CONDITIONS.md                   diagnosed conditions — human-entered ONLY
├── DATA/{YYYY-MM-DD}.json          one day file per day, per merge
├── LABS/{YYYY-MM-DD}-{panel}.json  one LabsFile per panel draw
├── PROTOCOLS/{slug}.md             one protocol, target, duration, adherence
└── BRIEFS/{YYYY-MM-DD}-{provider}.md   one clinician brief per visit
```

`CONDITIONS.md` is **human-entered only**. No skill writes to it. A pack that
could append to a conditions list is a pack that can diagnose.

Real paths from the worked example:

```
USER/HEALTH/DATA/2026-08-19.json
USER/HEALTH/LABS/2026-07-19-lipid-advanced.json
USER/HEALTH/PROTOCOLS/q3-lipid-protocol.md
USER/HEALTH/BRIEFS/2026-11-04-reyes.md
```

### Ingestion layer — LifeOS healthsync, kept as-is

The healthsync subsystem already exists in LifeOS and is **kept**, not rewritten.
Four pullable adapters, one shared normaliser, and shared types/store modules
underneath:

| Adapter | File | Supplies |
|---------|------|----------|
| Oura | `oura.ts` | `oura_sleep_score`, `oura_readiness_score`, `oura_activity_score`, `steps`, `sleep_duration_h`, `sleep_efficiency`, `avg_sleep_hr`, `avg_sleep_hrv`, `spo2_avg` |
| Eight Sleep | `eightsleep.ts` | `eightsleep_score`, `sleep_duration_h`, `bed_temp_c` |
| Apple Health | `apple.ts` | `steps`, `active_energy_kcal`, `exercise_minutes`, `resting_hr`, `hrv_ms`, `weight_kg`, `sleep_hours` — pulled via REST drain or, absent that, an iCloud Shortcut file export, and normalised through `hae.ts` |
| Function Health | `function.ts` | Lab panels as structured biomarkers with per-result ranges |

The real TypeScript types, reused verbatim:

```ts
type SourceName = "oura" | "eightsleep" | "apple" | "function"

type SourceStatus =
  | "ok"
  | "stale"
  | "failed"
  | "unconfigured"
  | "awaiting-first-export"

interface DayFile {
  schema: number
  source: string
  fetched_at: string
  metrics: Record<string, unknown>
}

interface Biomarker {
  name: string
  value: number
  unit: string
  in_range: boolean
  ref_low: number
  ref_high: number
  collected_at: string
}

interface LabsFile {
  fetched_at: string
  biomarkers: Biomarker[]
}

interface LastNight {
  sleep_duration_h: number
  sleep_efficiency: number
  oura_sleep_score: number
  oura_readiness_score: number
  eightsleep_score: number
  bed_temp_c: number
}

interface CurrentJson {
  generated_at: string
  day: string
  last_night: LastNight
  sources: Record<SourceName, SourceResult>
}
```

Two structural decisions worth naming:

| Decision | Why it matters here |
|----------|---------------------|
| `ref_low` / `ref_high` live on the **`Biomarker`**, not in a global range table | An assay change mid-series moves the range. Storing the range with the result means a five-year series stays interpretable after a lab switches vendors. See *Failure modes* |
| `SourceStatus` has five values, not two | `stale` and `awaiting-first-export` are distinct from `failed`. A source that has never exported is not broken; a source that stopped three weeks ago is. Both must be distinguishable from `ok` |

**Day boundary.** A day file is only meaningful against a timezone, and a
wearable that syncs at 02:00 local will otherwise land in yesterday. Resolution
order, first hit wins:

```
LIFEOS_HEALTH_TZ  →  TZ  →  host system timezone  →  fallback
```

LifeOS's `resolveTimeZone()` does not record which candidate won — the day
file carries only `schema`, `source`, `fetched_at` and `metrics`, and none of
the summarisers write a tz key. That is a gap iAI cannot inherit silently: a
day boundary that was explicitly configured and one that was guessed off the
host clock are not the same evidence, so `health/ingest` must record which
resolution step won alongside the day file itself. Data lands in
`USER/HEALTH/DATA/` as day files keyed by the resolved local date.

### Biomarker row schema — `METRICS.md`

This seven-column shape is **iAI's own rendering**, not an inherited one.
LifeOS's `USER/HEALTH/METRICS.md` uses a narrower pair of tables — `| Metric |
Value | Status | Target |` for the current panel and `| Metric | Prior Panel |
Latest Panel | Direction |` for the delta — with no per-row reference range or
source column. iAI's table is richer because `ref_low`/`ref_high` live on the
`Biomarker` itself and the domain wants the source connector visible per row.

| Marker | Value | Unit | Ref range | Date | Source | Trend |
|--------|-------|------|-----------|------|--------|-------|
| ApoB | 74 | mg/dL | 0–90 (opt < 60) | 2026-07-19 | function | ↓ from 88 |
| LDL-C | 96 | mg/dL | 0–100 | 2026-07-19 | function | ↓ from 118 |
| HDL-C | 58 | mg/dL | 40–90 | 2026-07-19 | function | flat |
| Lp(a) | 22 | nmol/L | 0–75 | 2026-04-12 | function | n/a (annual) |
| hs-CRP | 1.4 | mg/L | 0.0–1.0 | 2026-07-19 | function | ↑ from 0.7 |
| HbA1c | 5.3 | % | 4.8–5.6 | 2026-07-19 | function | flat |
| Fasting insulin | 5.1 | µIU/mL | 2.0–19.6 | 2026-07-19 | function | ↓ from 6.8 |
| eGFR | 98 | mL/min/1.73m² | > 90 | 2026-07-19 | function | flat |
| ALT | 21 | U/L | 0–44 | 2026-07-19 | function | flat |
| TSH | 1.8 | µIU/mL | 0.45–4.50 | 2026-07-19 | function | flat |
| Omega-3 index | 7.1 | % | > 8.0 | 2026-07-19 | function | ↑ from 5.4 |
| HRV | 62 | ms | — | 2026-08-19 | oura | ↓ from 71 |
| RHR | 54 | bpm | — | 2026-08-19 | apple | ↑ from 51 |

`Ref range` renders the row's own `ref_low`/`ref_high`. Where a marker has no
population range — HRV, RHR — the column is `—` and only the personal
trend carries information. A trend arrow is never a verdict; `↑ from 0.7` on
hs-CRP is a fact, and the question it raises belongs in the brief.

### Privacy

**All health data is `class:private`.** Every Story and Task in this domain
carries the `class:private` label at creation, and the label is not removable by
a skill.

This is one level below where LifeOS puts it. LifeOS classifies
`LIFEOS/USER/HEALTH/**` as `RESTRICTED`, its top class and the fail-closed
default — which under iAI's renamed levels (`00-synthesis.md:52`) is `SECRET`,
not `PRIVATE`. iAI places health data at `PRIVATE` deliberately: `SECRET`
admits no opt-in at all, under any circumstance, and a pack that can never
send a de-identified summary to a model even with explicit per-session consent
would be unusable for trend and flag review.

| Rule | Mechanism |
|------|-----------|
| Hard-gated from cloud-model egress | `guards/checkEgress`. Default is **deny**, not ask — per the gate table's *Egress of PRIVATE data* row |
| Trend and flag compute **locally** | The computation is arithmetic over `Biomarker[]` and `DayFile.metrics`. It does not need a model, so it does not get one |
| Only derived, de-identified summaries may reach a model | And only when the user explicitly opts in, **per session**. The opt-in does not persist across sessions and cannot be set in config |
| The clinician brief is generated locally | It contains named markers, dates, doses and a provider name. It is the single most identifying artifact in the system |
| Raw day files never enter a prompt | The issue carries a pointer behind a sentinel; the payload stays on disk. This is the 60000-char budget doing double duty as a privacy control |

A derived summary that survives de-identification looks like
`marker=ApoB, n=4, window=90d, delta=-14 mg/dL, direction=down`. A raw
`Biomarker` with `collected_at` and a provider name does not.

---

## 8. Integrations

| Integration | Transport | Absent → |
|-------------|-----------|----------|
| Oura | `oura.ts`, vendor API token in `.env` | `SourceStatus: "unconfigured"`. Sleep and HRV series unavailable; `sleep-review` refuses rather than estimating |
| Eight Sleep | `eightsleep.ts`, account credentials in `.env` | `unconfigured`. `bed_temp_c` and `eightsleep_score` drop out of `LastNight`; Oura still supplies sleep |
| Apple Health | `apple.ts`; REST drain of the Health Auto Export ingest buffer (primary), falling back to the iCloud Shortcut file export when `HEALTH_INGEST_URL`/`HEALTH_DRAIN_TOKEN` are unset | `awaiting-first-export` until the first export lands. `resting_hr`, `hrv_ms`, `weight_kg` and `sleep_hours` are empty, not zero |
| Function Health | `function.ts`, portal export | `unconfigured`. **All lab rungs are unavailable** — no `LabsFile`, so `trend` on any panel marker cannot reach its minimum point count |
| Health Auto Export | `hae.ts`, envelope normaliser inside `apple.ts` | Not independently absent — it has no transport of its own. It parses whatever the REST drain returns; if the drain is empty the Apple row's `awaiting-first-export` applies |
| Lab PDF | Manual drop into `USER/HEALTH/LABS/` | Human transcription into a `LabsFile`. `lab-review` requires `ref_low`/`ref_high` per result and refuses a transcription missing them |
| Clinician | Human, out of band | The pack cannot reach `clinician-review`. Stories stall at `flag` with `gate:pending`, which is the correct behaviour, not a failure |

Two rules govern absence:

| Rule | Detail |
|------|--------|
| Absence is never imputed | A missing day is missing. No interpolation, no carry-forward, no "last known value". A trend over a window with gaps reports its own missingness and fails the `observe` entry criterion above 10% |
| Absence is never silent | `current.json` carries a `SourceStatus` per source, and `status` surfaces it. A source that stops reporting must show `stale`, not `ok` — see *Failure modes* |

---

## 9. Worked example

TELOS goal **G0: "ApoB under 60 by Q4"** — the README's example, carried through
unchanged.

```
G0  "ApoB under 60 by Q4"                        USER/TELOS/TELOS.md
 └── Milestone 8  "Q3 Lipid protocol"            feature table in description
      └── #57  [type:story][domain:health][class:private][rung:observe]
           │   "Lower ApoB from 88 to under 60"
           │   ISA:  docs/design/stories/57.md        (ISC-1 .. ISC-5)
           │   Plan: docs/test-plans/57-plan.md   (3 P0 / 5 P1 / 1 P2)
           │   Branch: story/57-lower-apob-from-88-to-under-60
           │
           ├── #64 [type:task] "Ingest monthly lipid panel"      → ISC-1
           ├── #65 [type:task] "Protocol adherence tracking"     → ISC-3
           ├── #66 [type:task] "Sleep/training confounder ctrl"  → ISC-4
           └── #67 [type:task] "Clinician brief for Nov visit"   → ISC-5
```

### ISA claims

| Claim | Statement | Verifier | Anchored task |
|-------|-----------|----------|---------------|
| ISC-1 | A lipid panel is collected monthly from 2026-08-01, at least 4 panels by 2026-11-01, each with per-result reference ranges | tool-checked | #64 |
| ISC-2 | ApoB decreases monotonically across at least 3 of 4 consecutive panels | tool-checked | #64 |
| ISC-3 | Protocol adherence is logged daily with ≥ 85% of days recorded over 90 days | tool-checked | #65 |
| ISC-4 | Sleep efficiency and 28-day training load are reported alongside every ApoB point, as named confounders (after: ISC-1) | tool-checked | #66 |
| ISC-5 | A clinician brief for the 2026-11-04 visit exists, contains no imperative sentence, and is attested as seen (after: ISC-2, ISC-3, ISC-4) | human-attested | #67 |

### Trace

| Step | Command | What happens |
|------|---------|--------------|
| 1 | `/iai:goal-create G0` | Milestone 8 "Q3 Lipid protocol" created with its feature table |
| 2 | `/iai:story-create 8` | `#57` opened; `type:story`, `domain:health`, `class:private`, `rung:observe` |
| 3 | `/iai:story-design 57` | `docs/design/stories/57.md` with ISC-1..ISC-5. **Windows and thresholds declared here, before any data** |
| 4 | `/iai:story-test-plan 57` | `docs/test-plans/57-plan.md`; ISC-5 lands as a P0 human-attested case |
| 5 | `/iai:task-create 57` | `#64`, `#65`, `#66`, `#67` opened as sub-issues of `#57` |
| 6 | `/iai:task-do 64` | Branch `task/64-ingest-monthly-lipid-panel`; `health/ingest` runs `function.ts`; `USER/HEALTH/LABS/2026-08-16-lipid-advanced.json` lands with `Biomarker{name:"ApoB", value:82, ref_low:0, ref_high:90}` |
| 7 | `/iai:task-verify 64` | 4 panels present by 2026-11-01: 88 → 82 → 77 → 74. `docs/evidence/64-20261101T0914Z.md`, `## iai-evidence`, `#64` closed explicitly |
| 8 | *(rung)* | ISC-2 satisfied → `#57` promotes `rung:observe` → `rung:trend` in one `gh issue edit` |
| 9 | `/iai:task-do 65` | `health/protocol` opens `USER/HEALTH/PROTOCOLS/q3-lipid-protocol.md`; adherence 81/90 days = 90% → ISC-3 passes |
| 10 | `/iai:task-verify 66` | `sleep-review` reports efficiency 0.91 → 0.84; `training-load` reports 28-day load down 22%. Both recorded as **confounders**, not causes → ISC-4 passes |
| 11 | *(anomaly)* | `health/anomaly` on the 2026-07-19 panel: hs-CRP 0.7 → 1.4 mg/L, outside `ref_high: 1.0`, persists into the 2026-08-16 draw → `rung:flag` |
| 12 | `/iai:task-do 67` | `health/clinician-brief reyes --visit 2026-11-04` writes `USER/HEALTH/BRIEFS/2026-11-04-reyes.md` **locally**. Draft contains "consider raising the dose" → the imperative is blocked, held, and regenerated as a question |
| 13 | *(gate)* | `gate:pending` on `#57`; `## iai-gate` comment posted; the proposed dose change is a decision request, not an action |
| 14 | `/iai:story-verify 57` | ApoB 88 → 74, direction as declared, but the target of 60 is not met. Verdict `PARTIAL`. `## iai-verdict` posted. Integration PR `story/57-* → main` opened against the **private data repo**, marked ready. **iAI does not merge** |
| 15 | *(human)* | Human attends the 2026-11-04 visit, Dr. Reyes reviews the brief, human comments `**Decision:** APPROVED` → `gate:approved`, `rung:clinician-review` attested |
| 16 | `/iai:learn 8` | Learning recorded: the hs-CRP rise coincided with a 22% training-load drop, which is a confounder, not a finding. Filed to `MEMORY/` at tier B |

The gate comment at step 13:

```markdown
## iai-gate

**Gate:** clinician-boundary
**Story:** #57
**Request:** the 2026-11-04 brief proposes a question about therapy adjustment
**Proposed by:** health-analyst
**Preconditions:**
- [x] Brief generated locally at USER/HEALTH/BRIEFS/2026-11-04-reyes.md
- [x] Brief contains 0 imperative sentences (1 blocked and rewritten)
- [x] Named clinician on record: Dr. Reyes, lipidology, PROVIDERS.md
- [ ] Clinician has seen the brief
**Decision:** PENDING

iAI has not recommended a dose change and cannot. Question 4 asks whether the
current dose remains appropriate given ApoB 74 mg/dL at 81/90 days adherence.
```

Two things to notice. `#57` finished at `PARTIAL`, not `FAIL` — the marker moved
in the declared direction and missed the target, which is a real outcome and is
recorded as one. And step 12 is the gate earning its keep: the model wrote an
instruction, and the instruction never left the process.

---

## 10. Failure modes and mitigations

| Failure mode | How it shows up | Mitigation |
|--------------|-----------------|------------|
| **Sensor drift** | Oura RHR baseline shifts 3 bpm after a firmware update; the trend looks real | Record device firmware/model in `DayFile.metrics`. A change in device identity breaks the series into segments and `trend` refuses to span the boundary without an explicit `--allow-device-change` |
| **Missing days break a trend** | 11 of 90 days absent; the arithmetic still returns a number | `observe` entry criterion caps missingness at 10%. Never interpolate, never carry forward. Report `n` and the missing-day count alongside every trend |
| **Assay or reference-range change mid-series** | Lab switches vendors; hs-CRP range moves from 0.0–3.0 to 0.0–1.0 and every historic result becomes "out of range" | **Store `ref_low`/`ref_high` per result, never globally.** `lab-review` compares each value against its own range and emits an explicit `assay-change` note when consecutive results disagree on range |
| **Timezone day-boundary bug** | A 02:00 sync lands in the previous day; sleep appears twice on one date and zero on the next | Resolve `LIFEOS_HEALTH_TZ → TZ → host → fallback`, record which one won in the day file, and make `ingest` idempotent per resolved local date so a re-run overwrites rather than duplicating |
| **Correlation mistaken for causation** | ApoB fell during the protocol; the protocol gets the credit, and the 22% training-load drop is ignored | ISC-4-style confounder claims are mandatory: every marker Task names its confounders and reports their series in the same evidence artifact. The brief states association, never mechanism |
| **Model over-interprets a single value** | One hs-CRP at 1.4 mg/L becomes a paragraph about inflammation | `binding.gate.autoDeny` includes *"single out-of-range value with no prior series"*, and `flag` requires persistence across ≥ 2 consecutive measurements |
| **PRIVATE data leaks into a cloud prompt** | A day file is pasted into a summarisation request | `class:private` on every issue, `guards/checkEgress` defaults to **deny**, trend/flag compute locally without a model, and only de-identified derived summaries are eligible even after a per-session opt-in |
| **Stale source silently reports `ok`** | Eight Sleep stopped syncing on 2026-06-02; `current.json` still says `ok` because the last successful fetch is cached | `SourceStatus` is computed from `fetched_at` freshness against a per-source expected cadence, not from the last HTTP result. Past the cadence window the status is `stale`, and `status` surfaces every non-`ok` source before any rung is evaluated |
| **A brief becomes an instruction** | "Consider raising the dose" survives into `BRIEFS/` | The clinician-boundary gate lints for imperative mood and prescription nouns before write, holds the output, and regenerates it as a numbered question. The blocked text is discarded, not surfaced |
| **Emergency signal treated as an anomaly** | SpO2 84% flows into the trend pipeline and produces a chart | The emergency predicate is deterministic, runs **first** in `health/anomaly`, and halts the pipeline with a fixed notice the model cannot paraphrase |
