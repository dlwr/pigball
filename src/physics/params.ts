export interface PhysicsParams {
  gravity: number;
  maxSpeed: number;
  wallRestitution: number;
  flipperRestitution: number;
  friction: number;
  restingSpeed: number;
  flipperSpeed: number;
  plungerStiffness: number;
  plungerPullRate: number;
  slingKick: number;
  slingMinImpact: number;
}

export const createParams = (): PhysicsParams => ({
  gravity: 150,
  maxSpeed: 500,
  wallRestitution: 0.45,
  flipperRestitution: 0.25,
  friction: 0.15,
  restingSpeed: 6,
  flipperSpeed: 28,
  plungerStiffness: 4000,
  plungerPullRate: 1.2,
  slingKick: 90,
  slingMinImpact: 15,
});
