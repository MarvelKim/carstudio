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
