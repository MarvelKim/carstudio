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
  return Math.max(0, speed) * Math.pow(
    FLIGHT_TUNING.AIR_DRAG_PER_FRAME,
    Math.max(0, dt) * 60
  );
}

export function applySpeedMultiplier(speed, retainedRatio) {
  return Math.max(0, speed) * retainedRatio;
}

export function ballisticAirtime(verticalVelocity, gravity = FLIGHT_TUNING.GRAVITY) {
  if (gravity <= 0 || verticalVelocity >= 0) return 0;
  return -2 * verticalVelocity / gravity;
}

export const FEVER_FLIGHT_TUNING = Object.freeze({
  MAX_STAR_STEP_PX: 96,
  MAX_PATH_SLOPE: 0.22,
  MAX_VERTICAL_SPEED_PX_PER_SECOND: 720
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

export function nextFeverStarY(
  previousY,
  randomValue,
  minimumY,
  maximumY,
  horizontalDistance,
  horizontalSpeed = 0
) {
  const lower = Math.min(minimumY, maximumY);
  const upper = Math.max(minimumY, maximumY);
  const start = clamp(Number.isFinite(previousY) ? previousY : upper, lower, upper);
  const target = lower + (upper - lower) * clamp(randomValue, 0, 1);
  const speedLimitedStep = horizontalSpeed > 0
    ? Math.max(0, horizontalDistance)
      * FEVER_FLIGHT_TUNING.MAX_VERTICAL_SPEED_PX_PER_SECOND
      / (horizontalSpeed * 1.5)
    : Number.POSITIVE_INFINITY;
  const maximumStep = Math.min(
    FEVER_FLIGHT_TUNING.MAX_STAR_STEP_PX,
    Math.max(0, horizontalDistance) * FEVER_FLIGHT_TUNING.MAX_PATH_SLOPE,
    speedLimitedStep
  );
  return clamp(start + clamp(target - start, -maximumStep, maximumStep), lower, upper);
}

export function feverPathState(startY, endY, progress, horizontalDistance) {
  const t = clamp(progress, 0, 1);
  const blend = t * t * (3 - 2 * t);
  const derivative = 6 * t * (1 - t);
  return {
    y: startY + (endY - startY) * blend,
    slope: derivative === 0
      ? 0
      : (endY - startY) * derivative / Math.max(1, Math.abs(horizontalDistance))
  };
}

export const SCORE_RULES = Object.freeze({
  FEVER_CHARGE_SECONDS: 15,
  HELPFUL_ITEM_FEVER_BONUS: 0.01,
  FEVER_DURATION_SECONDS: 3.5,
  ITEM_BASE_SCORE: Object.freeze({ energy: 100, battery: 150, sky: 300, star: 100 })
});

export function itemScoreFor(type, multiplier) {
  return (SCORE_RULES.ITEM_BASE_SCORE[type] || 0) * Math.max(1, multiplier);
}

export const SCORE_GRADES = Object.freeze([
  { minimum: 112000, key: 'legend' },
  { minimum: 104000, key: 'diamond-red' },
  { minimum: 96000, key: 'diamond-green' },
  { minimum: 88000, key: 'diamond-pink' },
  { minimum: 80000, key: 'diamond-brown' },
  { minimum: 72000, key: 'ruby' },
  { minimum: 64000, key: 'alexandrite' },
  { minimum: 56000, key: 'tourmaline' },
  { minimum: 48000, key: 'emerald' },
  { minimum: 40000, key: 'platinum' },
  { minimum: 32000, key: 'gold' },
  { minimum: 24000, key: 'silver' },
  { minimum: 16000, key: 'bronze' },
  { minimum: 8000, key: 'iron' },
  { minimum: 0, key: 'rookie' }
].map(Object.freeze));

export function scoreGrade(score) {
  return SCORE_GRADES.find(grade => score >= grade.minimum).key;
}
