/** The fade goal after the particles are switched on or off: a rebuild or teardown that is waiting for the layer to fade out keeps its goal of zero, so the switch cannot cancel it. */
export function fadeGoalAfterToggle(particles: boolean, waiting: boolean, goal: number): number {
  return waiting ? goal : particles ? 1 : 0;
}
