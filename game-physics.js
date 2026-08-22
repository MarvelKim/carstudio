export const FLIGHT_TUNING = Object.freeze({
  AIRTIME_SCALE: 0.30,
  GRAVITY: 560,
  MAX_LAUNCH_AIRTIME: 9,
  MAX_FALL_SPEED: 2800,
  MIN_FORWARD_AIR_SPEED: 700,
  AIR_DRAG_PER_FRAME: 0.999,
  ROLLING_DRAG_PER_FRAME: 0.98,
  HORIZONTAL_BOUNCE_RETENTION: 0.90,
  VERTICAL_BOUNCE_RETENTION: 0.18,
  MIN_BOUNCE_LIFT: 150,
  MAX_BOUNCE_AIRTIME: 1.5,
  MAX_GROUND_BOUNCES: 8,
  SKY_ITEM_LIFT: 720,
  TRAP_ITEM_LIFT: 520,
  ENERGY_ITEM_LIFT: 450
});

const maxLiftForAirtime = (seconds, gravity = FLIGHT_TUNING.GRAVITY) =>
  gravity * seconds / 2;

export function launchVerticalVelocity(speed, angle) {
  const scaledLift = Math.max(0, speed) * Math.sin(angle) * FLIGHT_TUNING.AIRTIME_SCALE;
  const maximumLift = maxLiftForAirtime(FLIGHT_TUNING.MAX_LAUNCH_AIRTIME);
  return -Math.min(maximumLift, Math.max(0, scaledLift));
}

export function bounceVerticalVelocity(impactSpeed) {
  const maximumLift = maxLiftForAirtime(FLIGHT_TUNING.MAX_BOUNCE_AIRTIME);
  const lift = Math.min(
    maximumLift,
    Math.max(
      FLIGHT_TUNING.MIN_BOUNCE_LIFT,
      Math.max(0, impactSpeed) * FLIGHT_TUNING.VERTICAL_BOUNCE_RETENTION
    )
  );
  return -lift;
}

export function airborneForwardVelocity(speed, dt) {
  const decayed = Math.max(0, speed) * Math.pow(
    FLIGHT_TUNING.AIR_DRAG_PER_FRAME,
    Math.max(0, dt) * 60
  );
  return Math.max(FLIGHT_TUNING.MIN_FORWARD_AIR_SPEED, decayed);
}

export function ballisticAirtime(verticalVelocity, gravity = FLIGHT_TUNING.GRAVITY) {
  if (gravity <= 0 || verticalVelocity >= 0) return 0;
  return -2 * verticalVelocity / gravity;
}

export const SCORE_RULES = Object.freeze({
  FEVER_CHARGE_SECONDS: 15,
  HELPFUL_ITEM_FEVER_BONUS: 0.01,
  FEVER_DURATION_SECONDS: 3.5,
  ITEM_BASE_SCORE: Object.freeze({ energy: 100, battery: 150, sky: 300, star: 100 }),
  ANTICIPATED_SCORE_CEILING: 110000,
  TOP_GRADE_FRACTION: 5 / 110
});

export const SCORE_GRADES = Object.freeze([
  { min: 105000, name: 'legend', ornament: 'stars' },
  { min: 99000, name: 'diamond-red', ornament: 'plain' },
  { min: 92000, name: 'diamond-green', ornament: 'plain' },
  { min: 85000, name: 'diamond-pink', ornament: 'plain' },
  { min: 76000, name: 'diamond-brown', ornament: 'plain' },
  { min: 64000, name: 'ruby', ornament: 'plain' },
  { min: 53000, name: 'alexandrite', ornament: 'plain' },
  { min: 43000, name: 'tourmaline', ornament: 'plain' },
  { min: 34000, name: 'emerald', ornament: 'plain' },
  { min: 26000, name: 'platinum', ornament: 'plain' },
  { min: 19000, name: 'gold', ornament: 'plain' },
  { min: 13000, name: 'silver', ornament: 'plain' },
  { min: 8000, name: 'bronze', ornament: 'plain' },
  { min: 4000, name: 'iron', ornament: 'plain' },
  { min: 0, name: 'rookie', ornament: 'plain' }
].map(Object.freeze));

export function itemScoreFor(type, multiplier) {
  return (SCORE_RULES.ITEM_BASE_SCORE[type] || 0) * Math.max(1, multiplier);
}

export function scoreGrade(score) {
  return scoreGradeDetails(score).name;
}

export function scoreGradeDetails(score) {
  return SCORE_GRADES.find(grade => score >= grade.min);
}
