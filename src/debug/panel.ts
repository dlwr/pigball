import GUI from "lil-gui";
import type { PhysicsParams } from "../physics/params";

export const mountDebugPanel = (params: PhysicsParams, stats: { fps: number; steps: number; frameMs: number }): void => {
  const gui = new GUI({ title: "physics" });
  gui.add(params, "gravity", 20, 400, 1);
  gui.add(params, "maxSpeed", 100, 900, 10);
  gui.add(params, "wallRestitution", 0, 1, 0.01);
  gui.add(params, "flipperRestitution", 0, 1, 0.01);
  gui.add(params, "friction", 0, 1, 0.01);
  gui.add(params, "restingSpeed", 0, 30, 0.5);
  gui.add(params, "flipperSpeed", 5, 80, 0.5);
  gui.add(params, "plungerStiffness", 500, 10000, 50);
  gui.add(params, "plungerPullRate", 0.2, 5, 0.1);
  gui.add(params, "slingKick", 0, 300, 1);
  gui.add(params, "slingMinImpact", 0, 100, 1);
  const monitor = gui.addFolder("stats");
  monitor.add(stats, "fps").listen().disable();
  monitor.add(stats, "steps").listen().disable();
  monitor.add(stats, "frameMs").listen().disable();
};
