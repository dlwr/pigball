import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitTiltedCamera } from "./camera";

const corners = [
  new THREE.Vector3(-1.5, -3.5, 0),
  new THREE.Vector3(51.5, -3.5, 0),
  new THREE.Vector3(-1.5, 112, 0),
  new THREE.Vector3(51.5, 112, 0),
];

const projectAll = (camera: THREE.PerspectiveCamera) => corners.map((c) => c.clone().project(camera));

describe("斜めのカメラの当てはめ", () => {
  for (const aspect of [0.45, 0.6, 1.2]) {
    it(`縦横比 ${aspect} で台の四隅がすべて画面に収まる`, () => {
      const camera = new THREE.PerspectiveCamera();
      fitTiltedCamera(camera, aspect, corners, 25, 30);
      const inside = projectAll(camera).every((p) => Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001);
      expect(inside).toBe(true);
    });

    it(`縦横比 ${aspect} で台が画面いっぱいに収まる`, () => {
      const camera = new THREE.PerspectiveCamera();
      fitTiltedCamera(camera, aspect, corners, 25, 30);
      const edge = Math.max(...projectAll(camera).flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
      expect(edge).toBeGreaterThan(0.98);
    });
  }

  it("手前（フリッパー側）が奥より大きく映る", () => {
    const camera = new THREE.PerspectiveCamera();
    fitTiltedCamera(camera, 0.5, corners, 25, 30);
    const [bl, br, tl, tr] = projectAll(camera);
    expect(br.x - bl.x).toBeGreaterThan(tr.x - tl.x);
  });
});
