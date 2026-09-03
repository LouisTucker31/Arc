/*
 * Training plan and workout data.
 *
 * This is placeholder content: made-up plan/workouts and reused
 * placeholder photos (none of the existing photography actually shows
 * running, swimming or cycling yet), standing in until real photos and
 * session detail are added.
 *
 * photo paths are relative to index.html. Each workout belongs to a
 * plan (planId) and carries a week number and an ISO date, which the
 * library/week screens use to order and label it. Five session
 * templates repeat on a fixed weekly rota across the plan's 12 weeks,
 * generated below rather than hand-duplicated.
 */

const PLANS = [
  {
    id: "plan1",
    title: "Olympic Triathlon Plan",
    summary: "A 12-week build across running, swimming and cycling towards an Olympic-distance triathlon.",
    estimateWeeks: 12,
    cover: "assets/photos/olympic-triathlon/olympic-triathlon-plan.webp",
    // Week-tile cover photos live at "<weekCoverPrefix><week number>.webp".
    weekCoverPrefix: "assets/photos/olympic-triathlon/olympic-week-",
  },
];

const SESSION_TEMPLATES = {
  easyRun: {
    title: "Easy Run",
    summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
    type: "run",
    estimateMinutes: 40,
    cover: "assets/photos/olympic-triathlon/easy-run.webp",
    discipline: {
      metric: { kind: "duration", value: "40 min" },
    },
  },
  poolSwim: {
    title: "Pool Swim",
    summary: "Technique-focused pool session working on stroke efficiency.",
    type: "swim",
    estimateMinutes: 45,
    cover: "assets/photos/olympic-triathlon/pool-swim.webp",
    discipline: {
      metric: { kind: "duration", value: "45 min" },
      target: { label: "Target pace", value: "1:50 /100m" },
      warmup: "200m easy, mixed strokes.",
      mainSet: "8 x 100m @ target pace, 20s rest between.",
      cooldown: "100m easy.",
    },
  },
  qualityRun: {
    title: "Quality Run",
    summary: "A harder running session with intervals or tempo effort.",
    type: "run",
    estimateMinutes: 45,
    cover: "assets/photos/olympic-triathlon/quality-run.webp",
    discipline: {
      metric: { kind: "duration", value: "45 min" },
      target: { label: "Target pace", value: "4:45 /km" },
      warmup: "10 min easy jogging.",
      mainSet: "4 x 1km @ target pace, 2 min recovery jog between reps.",
      cooldown: "10 min easy jogging.",
    },
  },
  openWaterSwim: {
    title: "Open Water Swim",
    summary: "Open water session to build race-specific swim confidence and sighting.",
    type: "swim",
    estimateMinutes: 50,
    cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
    discipline: {
      metric: { kind: "distance", value: "2000 m" },
      target: { label: "Target pace", value: "2:00 /100m" },
      warmup: "5 min easy swimming, settle into the water.",
      mainSet: "Steady swim practising sighting every 6-8 strokes and drafting where possible.",
      cooldown: "5 min easy swimming.",
    },
  },
  easySwim: {
    title: "Easy Swim",
    summary: "A short, easy swim to stay loose without adding fatigue.",
    type: "swim",
    estimateMinutes: 25,
    cover: "assets/photos/olympic-triathlon/pool-swim.webp",
    discipline: {
      metric: { kind: "duration", value: "25 min" },
    },
  },
  qualityBike: {
    title: "Quality Bike",
    summary: "A harder bike session building race-specific power and endurance.",
    type: "bike",
    estimateMinutes: 60,
    cover: "assets/photos/olympic-triathlon/quality-bike.webp",
    discipline: {
      metric: { kind: "distance", value: "25 km" },
      target: { label: "Target effort", value: "Zone 4 / hard" },
      warmup: "10 min easy spin.",
      mainSet: "3 x 8 min hard effort, 4 min easy spin recovery between.",
      cooldown: "10 min easy spin.",
    },
  },
  brick: {
    title: "Brick Session",
    summary: "A bike-to-run brick session to practise the transition and race-day leg feel.",
    type: "brick",
    estimateMinutes: 75,
    cover: "assets/photos/olympic-triathlon/brick-session.webp",
    discipline: {
      bike: {
        metric: { kind: "distance", value: "20 km" },
        target: { label: "Target effort", value: "Zone 3 / steady" },
        mainSet: "Steady effort, last 10 min building to race pace.",
      },
      run: {
        metric: { kind: "distance", value: "3 km" },
        target: { label: "Target pace", value: "Race pace" },
        mainSet: "Straight off the bike, focus on finding running legs quickly.",
      },
    },
  },
  raceDay: {
    title: "Race Day",
    summary: "Olympic-distance triathlon: swim, bike and run. This is it.",
    type: "race",
    estimateMinutes: 150,
    cover: "assets/photos/olympic-triathlon/race-day.webp",
    discipline: {
      swim: {
        metric: { kind: "distance", value: "1.5 km" },
        mainSet: "A controlled swim start, don't go out too hard. Settle into your rhythm early.",
      },
      bike: {
        metric: { kind: "distance", value: "40 km" },
        mainSet: "A steady, controlled effort throughout. Use the exact kit and fuelling rehearsed in weeks 10-11.",
      },
      run: {
        metric: { kind: "distance", value: "10 km" },
        mainSet: "Patient for the first 2km, then settle into your race rhythm and hold it home.",
      },
    },
  },
};

/* Fixed weekly rota: Mon/Tue/Thu/Fri/Sat, in template-key order. Weeks
   4, 8 and 11 swap the Saturday bike for a bike-to-run brick session,
   and week 12 (race week) replaces the whole week outright. */
const DEFAULT_WEEK_PLAN = ["easyRun", "poolSwim", "qualityRun", "openWaterSwim", "qualityBike"];
const BRICK_WEEK_PLAN = ["easyRun", "poolSwim", "qualityRun", "openWaterSwim", "brick"];
const RACE_WEEK_PLAN = ["easyRun", "poolSwim", "qualityRun", "easySwim", "raceDay"];

const BRICK_WEEKS = [4, 8, 11];

function weekPlanFor(week) {
  if (week === 12) return RACE_WEEK_PLAN;
  if (BRICK_WEEKS.indexOf(week) !== -1) return BRICK_WEEK_PLAN;
  return DEFAULT_WEEK_PLAN;
}

/* Training phase shown as a tag on each week tile. */
function phaseForWeek(week) {
  if (week <= 5) return "Base Phase";
  if (week <= 10) return "Build Phase";
  if (week === 11) return "Peak Phase";
  return "Taper Phase";
}

/* Real per-week content, filled in from the user's actual training
   spreadsheet one week at a time. Each entry replaces that week's five
   generic template sessions outright (day order: Mon/Tue/Thu/Fri/Sat)
   still comes from DAY_OFFSETS below, but title/summary/type/cover/
   discipline are exactly as supplied, rewritten into this app's
   Warm-up/Main Set/Cool-down + Target style rather than pasted
   verbatim from the spreadsheet's "Details" notes.
   Weeks not listed here keep falling back to the generic
   SESSION_TEMPLATES rota via weekPlanFor(). */
const WEEK_OVERRIDES = {
  1: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "30 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running at a conversational effort.",
        cooldown: "4 x 15 sec relaxed strides to finish, easy jog or walk recovery between.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Technique-focused pool session working on catch-up and fingertip drag drills.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "400 m" },
        warmup: "100m easy.",
        mainSet: "4 x 25m catch-up drill, 4 x 25m fingertip drag drill.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Quality Run",
      summary: "A harder running session with short intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target effort", value: "RPE 6 / 10" },
        warmup: "8 min easy.",
        mainSet: "4 x 1 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Endurance-focused pool session holding a steady front crawl.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "550 m" },
        warmup: "100m easy.",
        mainSet: "3 x 100m front crawl, steady pace throughout.",
        cooldown: "150m easy.",
      },
    },
    {
      title: "Endurance Bike",
      summary: "A continuous easy ride to build aerobic endurance on the bike.",
      type: "bike",
      estimateMinutes: 80,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "80 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Continuous easy ride in a light gear, holding a cadence of 85-95rpm throughout.",
      },
    },
  ],
  2: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running with a light cadence. Keep a tall running posture throughout.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Technique-focused pool session working on catch-up, fingertip drag and sighting drills.",
      type: "swim",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "500 m" },
        warmup: "100m easy.",
        mainSet: "4 x 25m catch-up drill, 4 x 25m fingertip drag drill, 4 x 25m sighting drill.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Quality Run",
      summary: "A harder running session with short intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "40 min" },
        target: { label: "Target effort", value: "RPE 6-7 / 10" },
        warmup: "8 min easy.",
        mainSet: "5 x 1 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Endurance-focused pool session holding a steady front crawl.",
      type: "swim",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "650 m" },
        warmup: "100m easy.",
        mainSet: "4 x 100m front crawl, steady pace throughout.",
        cooldown: "150m easy.",
      },
    },
    {
      title: "Endurance Bike",
      summary: "A continuous easy ride to build aerobic endurance on the bike.",
      type: "bike",
      estimateMinutes: 90,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "90 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Continuous easy ride with a smooth, steady cadence. Practise drinking a full bottle over the ride.",
      },
    },
  ],
  3: [
    {
      title: "Easy Run",
      summary: "A genuinely easy run to keep you fresh ahead of Thursday's quality session.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running. Keep this one genuinely easy, you're saving your legs for Thursday.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Technique-focused pool session working on catch-up, fingertip drag, sighting and touch-turn drills.",
      type: "swim",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "600 m" },
        warmup: "100m easy.",
        mainSet: "4 x 25m catch-up drill, 4 x 25m fingertip drag drill, 4 x 25m sighting drill, 4 x 25m touch-turn drill.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Quality Run",
      summary: "A harder running session with short intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "40 min" },
        target: { label: "Target effort", value: "RPE 6-7 / 10" },
        warmup: "8 min easy.",
        mainSet: "6 x 1 min @ target effort, 90 sec easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Endurance-focused pool session holding a steady front crawl over two longer efforts.",
      type: "swim",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "750 m" },
        warmup: "100m easy.",
        mainSet: "2 x 200m front crawl, continuous, steady pace throughout.",
        cooldown: "150m easy.",
      },
    },
    {
      title: "Endurance Bike",
      summary: "A continuous easy ride to build aerobic endurance on the bike.",
      type: "bike",
      estimateMinutes: 100,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "100 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Continuous easy ride. Rolling terrain is fine, keep the effort steady on the climbs rather than pushing hard.",
      },
    },
  ],
  4: [
    {
      title: "Easy Run",
      summary: "A light recovery-week run, no pace target this week, just easy miles.",
      type: "run",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "30 min" },
        target: { label: "Target effort", value: "RPE 2-3 / 10" },
        mainSet: "Easy, continuous running. It's a recovery week, there's no pace target, just run by feel.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Technique-focused recovery swim working on catch-up and sighting drills.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "450 m" },
        target: { label: "Target effort", value: "Keep it light" },
        warmup: "100m easy.",
        mainSet: "4 x 25m catch-up drill, 4 x 25m sighting drill.",
        cooldown: "150m easy.",
      },
    },
    {
      title: "Quality Run",
      summary: "A recovery-week quality session, still some intervals, but relaxed.",
      type: "run",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "30 min" },
        target: { label: "Target effort", value: "RPE 6 / 10" },
        warmup: "8 min easy.",
        mainSet: "4 x 1 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Relaxed endurance swim to stay loose during recovery week.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "600 m" },
        target: { label: "Target effort", value: "Keep it light" },
        warmup: "100m easy.",
        mainSet: "3 x 100m front crawl, relaxed pace.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Brick Session",
      summary: "An easy recovery-week brick, light effort, focused on learning the bike-to-run transition.",
      type: "brick",
      estimateMinutes: 75,
      cover: "assets/photos/olympic-triathlon/brick-session.webp",
      discipline: {
        bike: {
          metric: { kind: "duration", value: "65 min" },
          target: { label: "Target effort", value: "RPE 2-3 / 10" },
          mainSet: "Easy recovery ride in light gears. Avoid hard climbs, keep the effort genuinely easy throughout.",
        },
        run: {
          metric: { kind: "duration", value: "10 min" },
          target: { label: "Target effort", value: "RPE 2-3 / 10" },
          mainSet: "Straight off the bike. Short, easy steps, the focus here is learning the transition, not pace.",
        },
      },
    },
  ],
  5: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "40 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running at a conversational effort.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Technique-focused pool session with drills, then a short main set at steady pace.",
      type: "swim",
      estimateMinutes: 25,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "700 m" },
        warmup: "100m easy.",
        mainSet: "Drills: 4 x 25m catch-up, 4 x 25m fingertip drag, 4 x 25m sighting, 4 x 25m touch-turn. Then 2 x 100m front crawl, steady pace.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Quality Run",
      summary: "A harder running session with short intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "45 min" },
        target: { label: "Target effort", value: "RPE 7 / 10" },
        warmup: "8 min easy.",
        mainSet: "7 x 1 min @ target effort, 90 sec easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Pool Swim",
      summary: "Endurance-focused pool session building up to longer continuous efforts.",
      type: "swim",
      estimateMinutes: 25,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "950 m" },
        warmup: "100m easy.",
        mainSet: "300m + 200m front crawl, continuous, steady pace. Then 2 x 50m.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Endurance Bike",
      summary: "A continuous easy ride to build aerobic endurance and practise race-day fuelling.",
      type: "bike",
      estimateMinutes: 110,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "110 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Continuous easy ride. Fuel with 30-45g carbs per hour, and include 3 x 5 min holding an aero posture.",
      },
    },
  ],
  6: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "40 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running at a conversational effort.",
      },
    },
    {
      title: "Interval Swim",
      summary: "An interval pool session building race-specific swim speed.",
      type: "swim",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1000 m" },
        target: { label: "Target effort", value: "RPE 6 / 10" },
        warmup: "100m easy, then 4 x 50m catch drill.",
        mainSet: "6 x 100m front crawl @ target effort. Then 3 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Interval Run",
      summary: "A harder running session with longer intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "45 min" },
        target: { label: "Target effort", value: "RPE 7-8 / 10" },
        warmup: "10 min easy.",
        mainSet: "6 x 3 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "10 min easy.",
      },
    },
    {
      title: "Endurance Swim",
      summary: "The last pool endurance build before moving to open water.",
      type: "swim",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1100 m" },
        warmup: "150m easy.",
        mainSet: "400m + 300m front crawl, continuous, steady pace. This is your last pool build before open water.",
        cooldown: "100m easy.",
      },
    },
    {
      title: "Tempo Bike",
      summary: "A tempo bike session building sustained race-pace effort.",
      type: "bike",
      estimateMinutes: 115,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "115 min" },
        target: { label: "Target effort", value: "RPE 5-6 / 10" },
        warmup: "15 min easy.",
        mainSet: "40 min tempo @ target effort, holding a cadence of 85-95rpm. Then 40 min at an easy endurance effort.",
        cooldown: "15 min easy.",
      },
    },
  ],
  7: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "45 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running. Keep the first 10 min especially slow before settling into the effort.",
      },
    },
    {
      title: "Pool Swim",
      summary: "A technique and endurance pool session with a speed set to finish.",
      type: "swim",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1350 m" },
        warmup: "200m technique-focused swimming.",
        mainSet: "8 x 100m front crawl at an endurance pace. Then 7 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Interval Run",
      summary: "A harder running session with longer intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 50,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "50 min" },
        target: { label: "Target effort", value: "RPE 7-8 / 10" },
        warmup: "10 min easy.",
        mainSet: "7 x 3 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "10 min easy.",
      },
    },
    {
      title: "Open Water Swim",
      summary: "Your first open water session, getting comfortable in the lake before race-specific work begins.",
      type: "swim",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "400-600 m" },
        mainSet: "Continuous easy swim. No pace focus today, the goal is learning the lake, getting used to the wetsuit feel, and practising sighting for visibility.",
      },
    },
    {
      title: "Tempo Bike",
      summary: "A tempo bike session building sustained race-pace effort and race-day fuelling.",
      type: "bike",
      estimateMinutes: 125,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "125 min" },
        target: { label: "Target effort", value: "RPE 5-6 / 10" },
        warmup: "15 min easy.",
        mainSet: "45 min tempo @ target effort, including 4 x 5 min holding a race/aero posture. Then 50 min at an easy endurance effort. Fuel with 40-60g carbs per hour throughout.",
        cooldown: "15 min easy.",
      },
    },
  ],
  8: [
    {
      title: "Easy Run",
      summary: "A light recovery-week run to stay fresh before the next build block.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target effort", value: "RPE 2-3 / 10" },
        mainSet: "Easy, continuous running. It's a recovery week, keep this one genuinely light.",
      },
    },
    {
      title: "Pool Swim",
      summary: "A technique and endurance pool session with a speed set to finish.",
      type: "swim",
      estimateMinutes: 25,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1000 m" },
        warmup: "200m technique-focused swimming.",
        mainSet: "3 x 150m + 1 x 100m front crawl at an endurance pace. Then 5 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Quality Run",
      summary: "A recovery-week quality session, still some intervals, but relaxed.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target effort", value: "Moderate-hard" },
        warmup: "10 min easy.",
        mainSet: "5 x 2 min @ target effort, 2 min easy jog recovery between reps.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Open Water Swim",
      summary: "A relaxed open water session focused on sighting practice.",
      type: "swim",
      estimateMinutes: 25,
      cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "600-800 m" },
        mainSet: "Relaxed, continuous swim with regular sighting practice.",
      },
    },
    {
      title: "Brick Session",
      summary: "An easy recovery-week brick, keeping both legs genuinely light.",
      type: "brick",
      estimateMinutes: 85,
      cover: "assets/photos/olympic-triathlon/brick-session.webp",
      discipline: {
        bike: {
          metric: { kind: "duration", value: "75 min" },
          target: { label: "Target effort", value: "RPE 2-3 / 10" },
          mainSet: "Easy spin, no tempo work today, keep it genuinely easy throughout.",
        },
        run: {
          metric: { kind: "duration", value: "10 min" },
          mainSet: "Straight off the bike. A very easy jog, focus on a quick, light cadence and relaxed shoulders rather than pace.",
        },
      },
    },
  ],
  9: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "45 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running at a conversational effort.",
      },
    },
    {
      title: "Pool Swim",
      summary: "A technique and endurance pool session with a speed set to finish.",
      type: "swim",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1700 m" },
        warmup: "200m technique-focused swimming.",
        mainSet: "4 x 200m + 2 x 150m front crawl at an endurance pace. Then 8 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Interval Run",
      summary: "A harder running session with longer intervals at a controlled hard effort.",
      type: "run",
      estimateMinutes: 50,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "50 min" },
        target: { label: "Target effort", value: "RPE 7-8 / 10" },
        warmup: "10 min easy.",
        mainSet: "8 x 3 min @ target effort, 90 sec easy jog recovery between reps.",
        cooldown: "10 min easy.",
      },
    },
    {
      title: "Open Water Swim",
      summary: "A longer open water session building sighting and navigation skills.",
      type: "swim",
      estimateMinutes: 45,
      cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "800-1000 m" },
        mainSet: "Longer continuous swim, with regular practice sighting and navigating a course.",
      },
    },
    {
      title: "Tempo Bike",
      summary: "A full Olympic-distance fuelling rehearsal alongside a tempo bike session.",
      type: "bike",
      estimateMinutes: 135,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "duration", value: "135 min" },
        target: { label: "Target effort", value: "RPE 5-6 / 10" },
        warmup: "15 min easy.",
        mainSet: "50 min tempo @ target effort. This is a full Olympic-distance fuelling rehearsal, so treat your nutrition and hydration exactly as you plan to on race day. Then 55 min at an easy endurance effort.",
        cooldown: "15 min easy.",
      },
    },
  ],
  10: [
    {
      title: "Easy Run",
      summary: "An easy, conversational-pace run to build aerobic base without adding fatigue.",
      type: "run",
      estimateMinutes: 50,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "50 min" },
        target: { label: "Target effort", value: "RPE 3-4 / 10" },
        mainSet: "Easy, continuous running at a conversational effort.",
      },
    },
    {
      title: "Pool Swim",
      summary: "A technique and endurance pool session with a speed set to finish.",
      type: "swim",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1500 m" },
        warmup: "200m technique-focused swimming.",
        mainSet: "3 x 250m + 1 x 200m front crawl at an endurance pace. Then 7 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Race-Pace Run",
      summary: "A full 10km at Olympic race effort, the closest thing to a dress rehearsal for race day.",
      type: "run",
      estimateMinutes: 80,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "distance", value: "10 km" },
        target: { label: "Target pace", value: "5:45-5:55 /km" },
        warmup: "10 min easy.",
        mainSet: "10km continuous at Olympic race effort, holding target pace throughout.",
        cooldown: "Easy jog or walk.",
      },
    },
    {
      title: "Open Water Swim",
      summary: "A comfortable, race-specific open water swim.",
      type: "swim",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "1000-1200 m" },
        mainSet: "Comfortable continuous swim at a race-specific effort.",
      },
    },
    {
      title: "Race-Pace Bike",
      summary: "A full 40km at race effort, rehearsing your hydration, fuelling and bike computer setup.",
      type: "bike",
      estimateMinutes: 150,
      cover: "assets/photos/olympic-triathlon/quality-bike.webp",
      discipline: {
        metric: { kind: "distance", value: "40 km" },
        target: { label: "Target effort", value: "RPE 6 / 10" },
        warmup: "15 min easy.",
        mainSet: "40km continuous at race effort. Use this ride to rehearse your hydration, fuelling and bike computer setup exactly as you'll run them on race day.",
        cooldown: "15 min easy.",
      },
    },
  ],
  11: [
    {
      title: "Easy Run",
      summary: "A short, freshness-focused easy run.",
      type: "run",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "30 min" },
        mainSet: "Easy, continuous running. The focus this week is staying fresh, not building fitness.",
      },
    },
    {
      title: "Swim-to-Bike Brick",
      summary: "A pool swim followed by a short transition ride, rehearsing your race-day swim exit.",
      type: "brick",
      estimateMinutes: 40,
      cover: "assets/photos/olympic-triathlon/brick-session.webp",
      discipline: {
        swim: {
          metric: { kind: "distance", value: "1200 m" },
          warmup: "200m technique-focused swimming.",
          mainSet: "2 x 300m + 1 x 150m front crawl at an endurance pace. Then 5 x 50m at a faster, speed-focused pace.",
        },
        bike: {
          metric: { kind: "duration", value: "10 min" },
          mainSet: "Easy spin straight off the swim. Use this to rehearse your wetsuit removal, helmet on and bike mount exactly as you'll do them on race day.",
        },
      },
    },
    {
      title: "Interval Run",
      summary: "Race-pace intervals, a final sharpening session ahead of the taper.",
      type: "run",
      estimateMinutes: 35,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "35 min" },
        target: { label: "Target pace", value: "Goal race pace" },
        warmup: "10 min easy.",
        mainSet: "4 x 1km @ goal race pace, 90 sec easy jog recovery between reps.",
        cooldown: "5 min easy.",
      },
    },
    {
      title: "Open Water Swim",
      summary: "A race-rehearsal swim, comfortable and controlled, not a hard effort.",
      type: "swim",
      estimateMinutes: 30,
      cover: "assets/photos/olympic-triathlon/open-water-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "800-1000 m" },
        mainSet: "Continuous swim at race-rehearsal effort. This is about rehearsing the swim, not racing it.",
      },
    },
    {
      title: "Bike-to-Run Brick",
      summary: "A full race-effort ride with race kit and nutrition, straight into a settled race-pace run.",
      type: "brick",
      estimateMinutes: 115,
      cover: "assets/photos/olympic-triathlon/brick-session.webp",
      discipline: {
        bike: {
          metric: { kind: "distance", value: "~28 km" },
          target: { label: "Target effort", value: "RPE 6 / 10" },
          warmup: "10 min easy.",
          mainSet: "27-30km at race effort. Use your full race kit and nutrition exactly as planned for race day.",
        },
        run: {
          metric: { kind: "duration", value: "15 min" },
          target: { label: "Target effort", value: "Settled Olympic effort" },
          mainSet: "Straight off the bike. Keep the first 5 min controlled before settling into a steady Olympic race effort.",
        },
      },
    },
  ],
  12: [
    {
      title: "Easy Run",
      summary: "A very easy jog, taper week, keep it light.",
      type: "run",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/easy-run.webp",
      discipline: {
        metric: { kind: "duration", value: "20 min" },
        mainSet: "A very easy jog. It's taper week, the work is done, this is just about staying loose.",
      },
    },
    {
      title: "Pool Swim",
      summary: "A short, sharp taper-week pool session.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "600 m" },
        warmup: "150m technique-focused swimming.",
        mainSet: "2 x 150m front crawl at an endurance pace. Then 3 x 50m at a faster, speed-focused pace.",
      },
    },
    {
      title: "Strides Run",
      summary: "A short run with relaxed strides to keep your legs sharp before race day.",
      type: "run",
      estimateMinutes: 20,
      cover: "assets/photos/olympic-triathlon/quality-run.webp",
      discipline: {
        metric: { kind: "duration", value: "20 min" },
        warmup: "10 min easy.",
        mainSet: "4 x 20 sec relaxed strides, with full recovery between each.",
        cooldown: "Easy jog to finish.",
      },
    },
    {
      title: "Easy Swim",
      summary: "A short swim with race-effort pickups to prime your feel for tomorrow.",
      type: "swim",
      estimateMinutes: 15,
      cover: "assets/photos/olympic-triathlon/pool-swim.webp",
      discipline: {
        metric: { kind: "distance", value: "500 m" },
        warmup: "100m easy.",
        mainSet: "4 x 50m at race effort, staying smooth and controlled.",
        cooldown: "100m easy.",
      },
    },
    Object.assign({}, SESSION_TEMPLATES.raceDay),
  ],
};

/* Generates one plan's workouts across its weeks, Mon/Tue/Thu/Fri/Sat,
   starting from the plan's first Monday. A week with a matching entry
   in weekOverrides uses that real content outright; otherwise it falls
   back to the generic template rota (default, brick or race) via
   weekPlanFor(). Workout ids are namespaced by planId so two plans'
   same-numbered weeks never collide. Kept as a reusable function
   (rather than a one-off IIFE) so a second plan can be generated by
   calling this again with its own config, not by duplicating the loop. */
function generatePlanWorkouts(config) {
  const { planId, planStart, weekCount, weekOverrides, weekPlanFor: getWeekPlan, phaseForWeek: getPhase } = config;
  const DAY_OFFSETS = [0, 1, 3, 4, 5]; // Mon, Tue, Thu, Fri, Sat
  const list = [];

  for (let week = 1; week <= weekCount; week++) {
    const override = weekOverrides[week];
    const weekPlan = override ? null : getWeekPlan(week);

    DAY_OFFSETS.forEach((offset, dayIndex) => {
      const template = override ? override[dayIndex] : SESSION_TEMPLATES[weekPlan[dayIndex]];
      const date = new Date(planStart.getTime());
      date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + offset);

      list.push(Object.assign({}, template, {
        id: planId + "-w" + week + "-" + (dayIndex + 1),
        planId: planId,
        week: week,
        phase: getPhase(week),
        date: date.toISOString().slice(0, 10),
      }));
    });
  }

  return list;
}

const WORKOUTS = generatePlanWorkouts({
  planId: "plan1",
  planStart: new Date("2026-07-06T00:00:00Z"), // Monday, week 1
  weekCount: 12,
  weekOverrides: WEEK_OVERRIDES,
  weekPlanFor: weekPlanFor,
  phaseForWeek: phaseForWeek,
});
