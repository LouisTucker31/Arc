/*
 * Workout data.
 *
 * This is placeholder content: made-up workouts and generated placeholder
 * photos, standing in until real photos, videos and descriptions are
 * added. Everything else in the app is built to work with real content
 * dropped in later without any structural changes.
 *
 * photo paths are relative to index.html. Each exercise has one photo,
 * reused as the full-bleed player image, the exercise list thumbnail
 * and the video placeholder dialog poster, so there is only ever one
 * image per exercise to replace with a real photo later.
 */

const WORKOUTS = [
  {
    id: "fb1",
    title: "Full Body",
    summary: "A gentle full body session mixing seated and standing moves.",
    estimateMinutes: 35,
    cover: "assets/photos/full-body-cover.webp",
    exercises: [
      {
        name: "Chair/Box Squat",
        setsReps: "3 sets x 10",
        description:
          "Stand in front of a chair or box with feet shoulder-width apart. Bend your knees and hips to lower down until you lightly touch the seat, then push back up to standing.",
        progressionTip:
          "Start bodyweight only. Once that feels easy, hold a dumbbell in each hand at your sides or one at your chest.",
        photo: "assets/photos/goblet-squat.webp",
      },
      {
        name: "Dumbbell Romanian Deadlift",
        setsReps: "3 sets x 10",
        description:
          "Stand tall holding a dumbbell in each hand in front of your thighs. Hinge forward from your hips, keeping a soft bend in your knees, until you feel a stretch in your hamstrings, then rise back up.",
        progressionTip:
          "New to this move? Practise the hinge with no weight first, then add light dumbbells once your form feels steady.",
        photo: "assets/photos/dumbbell-deadlift.webp",
      },
      {
        name: "Dumbbell Bent-Over Row",
        setsReps: "3 sets x 10",
        description:
          "Hinge forward from your hips with a soft bend in your knees, a dumbbell in each hand. Pull the weights up towards your waist, squeezing your shoulder blades together, then lower with control.",
        progressionTip:
          "Begin with light dumbbells or none at all to master the hinge and pull, then increase the weight as it gets easier.",
        photo: "assets/photos/bent-row.webp",
      },
      {
        name: "Dumbbell Floor Chest Press",
        setsReps: "3 sets x 10",
        description:
          "Lie on your back with knees bent, holding a dumbbell in each hand at chest height. Press the weights up until your arms are extended, then lower slowly back down.",
        progressionTip:
          "Try the movement empty-handed first, then add light dumbbells and build up the weight over time.",
        photo: "assets/photos/floor-press.webp",
      },
      {
        name: "Seated Dumbbell Overhead Press",
        setsReps: "3 sets x 10",
        description:
          "Sit tall holding a dumbbell in each hand at shoulder height. Press both weights overhead until your arms are extended, then lower back to shoulder height.",
        progressionTip:
          "Start with light dumbbells, or none at all, to get the pressing motion right before adding more weight.",
        photo: "assets/photos/seated-press.webp",
      },
      {
        name: "Bodyweight Plank",
        setsReps: "Hold 20-30 seconds x 3",
        description:
          "Support your body on your forearms and toes, keeping a straight line from your head to your heels. Hold steady, breathing normally.",
        progressionTip:
          "Too hard on your toes? Drop to your knees instead. As it gets easier, build up the hold time.",
        photo: "assets/photos/plank.webp",
      },
      {
        name: "Skipping",
        setsReps: "5 sets x 2 minutes",
        description:
          "Skip at a steady pace you can sustain, resting briefly between sets. Use a rope if you have one, or mimic the motion without one.",
        photo: "assets/photos/jump-rope.webp",
      },
    ],
  },
  {
    id: "fb2",
    title: "Upper Body",
    summary: "Balance and light strength work to help you feel steady.",
    estimateMinutes: 30,
    cover: "assets/photos/upper-body-cover.webp",
    exercises: [
      {
        name: "Dumbbell Bent-Over Row",
        setsReps: "3 sets x 10",
        description:
          "Hinge forward from your hips with a soft bend in your knees, a dumbbell in each hand. Pull the weights up towards your waist, squeezing your shoulder blades together, then lower with control.",
        progressionTip:
          "Begin with light dumbbells or none at all to master the hinge and pull, then increase the weight as it gets easier.",
        photo: "assets/photos/bent-row.webp",
      },
      {
        name: "Dumbbell Floor Chest Press",
        setsReps: "3 sets x 10",
        description:
          "Lie on your back with knees bent, holding a dumbbell in each hand at chest height. Press the weights up until your arms are extended, then lower slowly back down.",
        progressionTip:
          "Try the movement empty-handed first, then add light dumbbells and build up the weight over time.",
        photo: "assets/photos/floor-press.webp",
      },
      {
        name: "Seated Dumbbell Overhead Press",
        setsReps: "3 sets x 10",
        description:
          "Sit tall holding a dumbbell in each hand at shoulder height. Press both weights overhead until your arms are extended, then lower back to shoulder height.",
        progressionTip:
          "Start with light dumbbells, or none at all, to get the pressing motion right before adding more weight.",
        photo: "assets/photos/seated-press.webp",
      },
      {
        name: "Dumbbell Bicep Curl",
        setsReps: "3 sets x 10",
        description:
          "Stand tall with a dumbbell in each hand, arms relaxed by your sides. Curl the weights up towards your shoulders, then lower slowly, keeping your elbows close to your body.",
        progressionTip:
          "Start with light dumbbells and increase the weight once you can complete all sets with good form.",
        photo: "assets/photos/bicep-curl.webp",
      },
      {
        name: "Tricep Overhead Extension",
        setsReps: "3 sets x 10",
        description:
          "Hold one dumbbell with both hands overhead. Bend your elbows to lower the weight behind your head, then straighten your arms to lift it back up.",
        progressionTip:
          "Start light, this move works your triceps hard even with a small weight. Increase gradually as it feels easier.",
        photo: "assets/photos/tricep-extension.webp",
      },
      {
        name: "Bent-Over Rear-Delt Fly",
        setsReps: "3 sets x 10",
        description:
          "Hinge forward from your hips with a soft bend in your knees, a dumbbell in each hand hanging below your shoulders. With a slight bend in your elbows, lift both arms out to the sides, then lower with control.",
        progressionTip:
          "Start with no weight or very light dumbbells, this is a small movement that gets harder quickly as you add load.",
        photo: "assets/photos/rear-delt-fly.webp",
      },
      {
        name: "Skipping",
        setsReps: "5 sets x 2 minutes",
        description:
          "Skip at a steady pace you can sustain, resting briefly between sets. Use a rope if you have one, or mimic the motion without one.",
        photo: "assets/photos/jump-rope.webp",
      },
    ],
  },
  {
    id: "fb3",
    title: "Lower Body",
    summary: "An easy cardio and mobility flow to get you moving.",
    estimateMinutes: 40,
    cover: "assets/photos/lower-body-cover.webp",
    exercises: [
      {
        name: "Chair/Box Squat",
        setsReps: "3 sets x 10",
        description:
          "Stand in front of a chair or box with feet shoulder-width apart. Bend your knees and hips to lower down until you lightly touch the seat, then push back up to standing.",
        progressionTip:
          "Start bodyweight only. Once that feels easy, hold a dumbbell in each hand at your sides or one at your chest.",
        photo: "assets/photos/goblet-squat.webp",
      },
      {
        name: "Dumbbell Romanian Deadlift",
        setsReps: "3 sets x 10",
        description:
          "Stand tall holding a dumbbell in each hand in front of your thighs. Hinge forward from your hips, keeping a soft bend in your knees, until you feel a stretch in your hamstrings, then rise back up.",
        progressionTip:
          "New to this move? Practise the hinge with no weight first, then add light dumbbells once your form feels steady.",
        photo: "assets/photos/dumbbell-deadlift.webp",
      },
      {
        name: "Alternating Lunges",
        setsReps: "3 sets x 8 each leg",
        description:
          "Step one foot forward and lower your back knee towards the floor, keeping your front knee over your ankle. Push back up to standing and repeat on the other leg.",
        progressionTip:
          "Start bodyweight only. Once your balance feels solid, hold a dumbbell in each hand to add resistance.",
        photo: "assets/photos/lunge.webp",
      },
      {
        name: "Glute Bridge",
        setsReps: "3 sets x 12",
        description:
          "Lie on your back with knees bent and feet flat on the floor. Squeeze your glutes to lift your hips up, then lower back down with control.",
        progressionTip:
          "Start bodyweight only. Once that feels easy, rest a dumbbell across your hips for added resistance.",
        photo: "assets/photos/glute-bridge.webp",
      },
      {
        name: "Standing Calf Raise",
        setsReps: "3 sets x 12",
        description:
          "Holding a chair for balance, rise up onto your toes, then lower back down slowly.",
        progressionTip:
          "Start bodyweight only. Once that feels easy, hold a dumbbell in each hand to add resistance.",
        photo: "assets/photos/calf-raises.webp",
      },
      {
        name: "Bodyweight Plank",
        setsReps: "Hold 20-30 seconds x 3",
        description:
          "Support your body on your forearms and toes, keeping a straight line from your head to your heels. Hold steady, breathing normally.",
        progressionTip:
          "Too hard on your toes? Drop to your knees instead. As it gets easier, build up the hold time.",
        photo: "assets/photos/plank.webp",
      },
      {
        name: "Skipping",
        setsReps: "5 sets x 2 minutes",
        description:
          "Skip at a steady pace you can sustain, resting briefly between sets. Use a rope if you have one, or mimic the motion without one.",
        photo: "assets/photos/jump-rope.webp",
      },
    ],
  },
];
