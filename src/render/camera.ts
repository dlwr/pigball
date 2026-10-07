import * as THREE from "three";

const SEARCH_STEPS = 40;
const CENTERING_PASSES = 5;

const projectedBounds = (camera: THREE.PerspectiveCamera, points: THREE.Vector3[]) => {
  camera.updateMatrixWorld();
  const projected = points.map((p) => p.clone().project(camera));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

export const fitTiltedCamera = (
  camera: THREE.PerspectiveCamera,
  aspect: number,
  points: THREE.Vector3[],
  tiltDegrees: number,
  fov: number,
): void => {
  camera.fov = fov;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const tilt = THREE.MathUtils.degToRad(tiltDegrees);
  const direction = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const place = (distance: number) => {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
  };
  const closestFit = (upper: number) => {
    let near = 1;
    let far = upper;
    for (let i = 0; i < SEARCH_STEPS; i++) {
      const distance = (near + far) / 2;
      place(distance);
      const b = projectedBounds(camera, points);
      if (b.minX >= -1 && b.maxX <= 1 && b.minY >= -1 && b.maxY <= 1) far = distance;
      else near = distance;
    }
    place(far);
    return far;
  };
  let distance = closestFit(5000);
  for (let pass = 0; pass < CENTERING_PASSES; pass++) {
    const b = projectedBounds(camera, points);
    const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    target.x += ((b.minX + b.maxX) / 2) * halfHeight * aspect;
    target.y += (((b.minY + b.maxY) / 2) * halfHeight) / Math.cos(tilt);
    distance = closestFit(distance * 2);
  }
  camera.updateMatrixWorld();
};
