import type { Tower } from "../types";
import { TowerNullificationSimulation, type NullificationRuntime, type NullifiedTowers as NullifiedState } from "./towerNullificationRules";

export type NullifiedTowers = NullifiedState<Tower>;

export class TowerNullificationController extends TowerNullificationSimulation<Tower> {
  constructor(runtime: () => NullificationRuntime<Tower>) {
    super(runtime, { visible: (tower, visible) => { (tower as Tower).body.setVisible(visible); } });
  }
}
