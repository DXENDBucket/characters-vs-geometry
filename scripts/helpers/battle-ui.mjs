// Exercise the live input adapters without sending the deprecated recorded mouse command.
export function dispatchBattleUi(scene, command) {
  if (command.type === "pointer") {
    const pointer = scene.replayPointer(command.pointer);
    pointer.leftButtonDown = () => !command.pointer.right;
    scene.input.emit("pointerdown", pointer);
  } else if (command.type === "debugMode") {
    scene.submitPlayerControl("local", command);
  } else {
    scene.localInput(() => {
      switch (command.type) {
        case "selectCard": scene.selectCard(command.id); break;
        case "tool": scene.runToolControlAction(command.action); break;
        default: throw Error(`Unsupported UI fixture: ${command.type}`);
      }
    });
  }
}

export function assertSemanticRecording(scene) {
  const replay = scene.exportReplay();
  if (replay.commands.some(entry => !["operation", "control"].includes(entry.command.type))) {
    throw Error("Live UI recorded mouse/tool/card intent instead of a semantic operation");
  }
  return replay;
}
