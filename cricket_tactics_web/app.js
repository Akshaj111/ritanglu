const $ = (id) => document.getElementById(id);
const elements = {
  format: $("format"),
  pitch: $("pitch"),
  role: $("role"),
  batter: $("batter"),
  partner: $("partner"),
  bowler: $("bowler"),
  bowlerStyle: $("bowler-style"),
  shot: $("shot"),
  aggression: $("aggression"),
  aggressionValue: $("aggression-value"),
  newMatch: $("new-match"),
  playBall: $("play-ball"),
  actionReplay: $("action-replay"),
  highlightsMenu: $("highlights-menu"),
  highlightsCount: $("highlights-count"),
  highlightsList: $("highlights-list"),
  xiPicker: $("xi-picker"),
  xiSlots: $("xi-slots"),
  opponentXI: $("opponent-xi"),
  opponentXIList: $("opponent-xi-list"),
  battingControls: $("batting-controls"),
  bowlingControls: $("bowling-controls"),
  deliveryPreview: $("delivery-preview"),
  bowlingStage: $("bowling-stage"),
  bowlingSummary: $("bowling-summary"),
  bowlingChoices: $("bowling-choices"),
  score: $("score"),
  overs: $("overs"),
  rates: $("rates"),
  result: $("result"),
  batterCard: $("batter-card"),
  partnerCard: $("partner-card"),
  bowlerCard: $("bowler-card"),
  conditions: $("conditions-card"),
  followOnControls: $("follow-on-controls"),
  followOnMessage: $("follow-on-message"),
  enforceFollowOn: $("enforce-follow-on"),
  declineFollowOn: $("decline-follow-on"),
  newBallControls: $("new-ball-controls"),
  newBallMessage: $("new-ball-message"),
  takeNewBall: $("take-new-ball"),
  commentary: $("commentary"),
  view: $("view"),
  viewCanvas: $("view-canvas"),
  fieldCanvas: $("field-canvas"),
};

let config;
let state;
let draggingFielder = null;
let completedMatches = [];
let matchSequence = 0;
let selectedPlayerXI;

const teamRoleOrder = ["Batters", "Wicketkeepers", "All-rounders", "Bowlers"];
const teamRoleLabels = {
  Batters: "BATTER",
  Wicketkeepers: "WICKETKEEPER",
  "All-rounders": "ALL-ROUNDER",
  Bowlers: "BOWLER",
};

const lineOffsets = {
  "Just inside tramline": -0.68,
  "6th-7th stump": -0.48,
  "4th stump": -0.32,
  "Off stump": -0.2,
  "Middle stump": 0,
  "Leg stump": 0.28,
  "Leg line": 0.52,
};

const shotRisks = {
  "Back-foot defence": -0.02,
  "Defensive block": -0.025,
  Leave: 0.01,
  "Cover drive": 0.02,
  "On drive": 0.02,
  "Straight drive": 0.015,
  Flick: 0.025,
  "Square cut": 0.025,
  "Late cut": 0.02,
  Sweep: 0.035,
  "Reverse sweep": 0.05,
  "Slog sweep": 0.055,
  Pull: 0.04,
  "Upper cut": 0.035,
  Ramp: 0.045,
  Scoop: 0.045,
  "Lofted drive": 0.075,
  "Dance down the track": 0.07,
};

const catchTargets = {
  "Cover drive": [0.34, 0.36],
  "Back-foot defence": [0.31, 0.61],
  Sweep: [0.77, 0.5],
  Pull: [0.75, 0.53],
  "Straight drive": [0.5, 0.18],
  Leave: [0.38, 0.69],
  "On drive": [0.56, 0.28],
  Flick: [0.69, 0.67],
  "Square cut": [0.22, 0.5],
  "Late cut": [0.31, 0.61],
  "Reverse sweep": [0.77, 0.5],
  "Slog sweep": [0.69, 0.67],
  "Upper cut": [0.22, 0.5],
  Ramp: [0.7, 0.75],
  "Defensive block": [0.44, 0.29],
  Scoop: [0.5, 0.73],
  "Lofted drive": [0.61, 0.12],
  "Dance down the track": [0.5, 0.73],
};

const shotDirections = {
  "Cover drive": [-1, -0.8],
  "Back-foot defence": [-1, -0.2],
  Sweep: [1, 0.65],
  Pull: [1, 0.1],
  "Straight drive": [0, -1],
  Leave: [0, 0],
  "On drive": [1, -0.8],
  Flick: [1, 0.55],
  "Square cut": [-1, 0],
  "Late cut": [-1, -0.3],
  "Reverse sweep": [1, 0.7],
  "Slog sweep": [1, 0.4],
  "Upper cut": [-1, -0.6],
  Ramp: [1, 0.45],
  "Defensive block": [0, -0.3],
  Scoop: [1, -0.5],
  "Lofted drive": [0.15, -1],
  "Dance down the track": [0, -0.7],
};

async function initialize() {
  const response = await fetch("./config.json");
  if (!response.ok) {
    throw new Error(`Could not load game configuration (${response.status}).`);
  }
  config = await response.json();

  selectedPlayerXI = structuredClone(config.defaultTeamRoles);
  renderXIEditor();
  syncLineupSelectionControls();
  fillSelect(elements.shot, config.shots);

  bindControls();
  startMatch();
  window.addEventListener("resize", drawVisuals);
}

function fillSelect(select, options) {
  select.replaceChildren(...options.map((option) => {
    const element = document.createElement("option");
    element.value = option;
    element.textContent = option;
    return element;
  }));
}

function teamBattingOrder(lineup) {
  return teamRoleOrder.flatMap((role) => lineup[role]);
}

function teamBowlingOrder(lineup) {
  return [...lineup["All-rounders"], ...lineup.Bowlers];
}

function randomTeamXI(excludedXI) {
  return Object.fromEntries(teamRoleOrder.map((role) => {
    const available = config.teamRolePools[role]
      .filter((player) => !excludedXI[role].includes(player));
    const count = config.defaultTeamRoles[role].length;
    if (available.length < count) {
      throw new Error(`Not enough eligible players to fill the opponent ${role} slots.`);
    }
    return [role, randomSample(available, count)];
  }));
}

function randomSample(players, count) {
  const shuffled = [...players];
  for (let index = 0; index < count; index += 1) {
    const swapIndex = randomInt(index, shuffled.length - 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function renderXIEditor() {
  elements.xiSlots.replaceChildren();
  for (const role of teamRoleOrder) {
    const group = document.createElement("fieldset");
    group.className = "xi-role-group";
    const legend = document.createElement("legend");
    legend.textContent = `${role.toUpperCase()} · ${selectedPlayerXI[role].length}`;
    group.append(legend);

    selectedPlayerXI[role].forEach((player, slot) => {
      const label = document.createElement("label");
      label.className = "xi-slot-label";
      label.textContent = `${teamRoleLabels[role]} ${slot + 1}`;
      const select = document.createElement("select");
      select.id = `xi-${teamRoleOrder.indexOf(role)}-${slot}`;
      select.setAttribute("aria-label", `${teamRoleLabels[role]} ${slot + 1}`);
      fillSelect(select, config.teamRolePools[role]);
      select.value = player;
      select.disabled = Boolean(state?.hasStarted);
      select.addEventListener("change", () => updatePlayerXI(role, slot, select.value));
      label.append(select);
      group.append(label);
    });

    elements.xiSlots.append(group);
  }
}

function updatePlayerXI(role, slot, player) {
  const previous = selectedPlayerXI[role][slot];
  const duplicateSlot = selectedPlayerXI[role].indexOf(player);
  if (duplicateSlot !== -1 && duplicateSlot !== slot) {
    selectedPlayerXI[role][duplicateSlot] = previous;
  }
  selectedPlayerXI[role][slot] = player;
  renderXIEditor();
  syncLineupSelectionControls();
}

function syncLineupSelectionControls() {
  const batterOptions = selectedPlayerXI.Batters;
  const previousBatter = elements.batter.value;
  const previousPartner = elements.partner.value;
  fillSelect(elements.batter, batterOptions);
  fillSelect(elements.partner, batterOptions);
  elements.batter.value = batterOptions.includes(previousBatter)
    ? previousBatter
    : batterOptions[0];
  elements.partner.value = batterOptions.includes(previousPartner) &&
    previousPartner !== elements.batter.value
    ? previousPartner
    : batterOptions.find((player) => player !== elements.batter.value);

  if (!state) {
    fillSelect(elements.bowler, teamBowlingOrder(selectedPlayerXI));
    elements.bowler.value = selectedPlayerXI.Bowlers[0];
    return;
  }

  state.playerXI = structuredClone(selectedPlayerXI);
  state.playerOpeningBatters = [elements.batter.value, elements.partner.value];
  if (state.battingTeam === state.playerTeam) resetBattingOrder();
  updateBowlingTeam(opposingTeam(state.battingTeam), state.bowler);
  renderAll();
}

function renderOpponentXI() {
  elements.opponentXIList.replaceChildren();
  for (const role of teamRoleOrder) {
    const group = document.createElement("div");
    group.className = "opponent-xi-role";
    const heading = document.createElement("strong");
    heading.textContent = `${role.toUpperCase()} · ${state.opponentXI[role].length}`;
    group.append(heading);
    for (const player of state.opponentXI[role]) {
      const name = document.createElement("span");
      name.textContent = player;
      group.append(name);
    }
    elements.opponentXIList.append(group);
  }
}

function lineupForTeam(team) {
  return team === state.playerTeam ? state.playerXI : state.opponentXI;
}

function opposingTeam(team) {
  return team === "A" ? "B" : "A";
}

function updateBowlingTeam(team, preferredBowler = state.bowler) {
  const order = teamBowlingOrder(lineupForTeam(team));
  state.bowlerOrder = order;
  fillSelect(elements.bowler, order);
  state.bowler = order.includes(preferredBowler) ? preferredBowler : order[0];
  state.bowlerIndex = order.indexOf(state.bowler);
  elements.bowler.value = state.bowler;
}

function bindControls() {
  elements.newMatch.addEventListener("click", startMatch);
  elements.playBall.addEventListener("click", playBall);
  elements.enforceFollowOn.addEventListener("click", () => decideFollowOn(true));
  elements.declineFollowOn.addEventListener("click", () => decideFollowOn(false));
  elements.takeNewBall.addEventListener("click", takeNewBall);
  elements.actionReplay.addEventListener("click", () => playActionReplay());
  elements.aggression.addEventListener("input", () => {
    elements.aggressionValue.value = elements.aggression.value;
    elements.aggressionValue.textContent = elements.aggression.value;
  });
  elements.format.addEventListener("change", () => {
    state.format = elements.format.value;
    enforceFieldingRestrictions();
    renderConditions();
    renderRuleControls();
    drawField();
  });
  elements.pitch.addEventListener("change", () => {
    state.pitch = elements.pitch.value;
    renderConditions();
    drawVisuals();
  });
  elements.role.addEventListener("change", () => {
    state.role = elements.role.value;
    state.bowlingStep = "line";
    state.bowlingPlanReady = false;
    state.upcomingDelivery = null;
    renderTactics();
    drawView();
  });
  elements.batter.addEventListener("change", updateOpeningBatters);
  elements.partner.addEventListener("change", updateOpeningBatters);
  elements.bowler.addEventListener("change", () => {
    state.bowler = elements.bowler.value;
    state.bowlerIndex = state.bowlerOrder.indexOf(state.bowler);
    state.bowlingStep = "line";
    state.bowlingPlanReady = false;
    state.upcomingDelivery = null;
    renderScorecard();
    renderTactics();
    drawView();
  });
  elements.view.addEventListener("change", drawView);
  elements.fieldCanvas.addEventListener("pointerdown", startDraggingFielder);
  elements.fieldCanvas.addEventListener("pointermove", dragFielder);
  elements.fieldCanvas.addEventListener("pointerup", stopDraggingFielder);
  elements.fieldCanvas.addEventListener("pointercancel", stopDraggingFielder);
}

function startMatch() {
  if (state?.highlights.length) {
    completedMatches.unshift({
      matchNumber: state.matchNumber,
      highlights: state.highlights,
    });
    completedMatches = completedMatches.slice(0, 5);
  }
  matchSequence += 1;
  const playerXI = structuredClone(selectedPlayerXI);
  const opponentXI = randomTeamXI(playerXI);
  const playerTeam = elements.role.value === "Batting" ? "A" : "B";
  const playerOpeningBatters = [elements.batter.value, elements.partner.value];
  const preferredBowler = elements.bowler.value;
  state = {
    format: elements.format.value,
    pitch: elements.pitch.value,
    role: elements.role.value,
    playerXI,
    opponentXI,
    playerTeam,
    playerOpeningBatters,
    openingBatter: playerOpeningBatters[0],
    openingPartner: playerOpeningBatters[1],
    matchNumber: matchSequence,
    striker: playerOpeningBatters[0],
    nonStriker: playerOpeningBatters[1],
    battingOrder: [],
    nextBatterIndex: 2,
    bowler: preferredBowler,
    bowlerOrder: [],
    bowlerIndex: 0,
    innings: 1,
    inningsOrder: ["A", "B", "A", "B"],
    battingTeam: "A",
    runs: 0,
    wickets: 0,
    balls: 0,
    inningsScores: [0, 0, 0, 0],
    totalBalls: { T20: 120, ODI: 300, Test: 2700 }[elements.format.value],
    target: null,
    pitchWear: 0,
    ballAge: 0,
    ballsSinceNewBall: 0,
    humidity: randomInt(48, 82),
    fielders: structuredClone(config.fieldPositions),
    matchOver: false,
    awaitingFollowOn: false,
    followOnEnforced: false,
    hasStarted: false,
    upcomingDelivery: null,
    bowlingStep: "line",
    bowlingPlanReady: false,
    battingFigures: {},
    bowlingFigures: {},
    lastReplay: null,
    replayAnimation: null,
    highlights: [],
    stumpsKnocked: false,
  };
  updateBowlingTeam(opposingTeam(state.battingTeam), preferredBowler);
  enforceFieldingRestrictions();
  resetBattingOrder();
  renderOpponentXI();
  elements.batter.disabled = false;
  elements.partner.disabled = false;
  elements.actionReplay.disabled = true;
  elements.result.hidden = true;
  elements.result.className = "result";
  elements.commentary.textContent = `${state.format} match begins on the ${state.pitch.toLowerCase()}. You are set to ${state.role.toLowerCase()}.`;
  renderAll();
  renderHighlights();
}

function renderHighlights() {
  const matches = [
    ...(state.highlights.length ? [{
      matchNumber: state.matchNumber,
      highlights: state.highlights,
      current: true,
    }] : []),
    ...completedMatches,
  ];
  const total = matches.reduce((sum, match) => sum + match.highlights.length, 0);
  elements.highlightsCount.textContent = String(total);
  elements.highlightsList.replaceChildren();

  if (!total) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "Boundaries and wickets will appear here.";
    elements.highlightsList.append(emptyMessage);
    return;
  }

  for (const match of matches) {
    const section = document.createElement("section");
    section.className = "highlight-match";
    const heading = document.createElement("h3");
    heading.textContent = `MATCH ${match.matchNumber}${match.current ? " · CURRENT" : ""}`;
    section.append(heading);

    for (const highlight of [...match.highlights].reverse()) {
      const replayButton = document.createElement("button");
      replayButton.type = "button";
      replayButton.className = "highlight-entry";
      const outcome = highlight.result.wicket
        ? "WICKET"
        : `${highlight.result.runs} RUN${highlight.result.runs === 1 ? "" : "S"}`;
      replayButton.textContent =
        `INN ${highlight.innings} · ${highlight.ball} · ${outcome} · ${highlight.shot}`;
      replayButton.addEventListener("click", () => {
        elements.highlightsMenu.open = false;
        playActionReplay(highlight);
      });
      section.append(replayButton);
    }

    elements.highlightsList.append(section);
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatOvers(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function styleForBowler(bowler) {
  return config.bowlerStyles[bowler] || "Fast bowler";
}

function isLeftHandedBatter(batter = state.striker) {
  return config.batterHands?.[batter] === "Left";
}

function shotDirectionFor(shot, batter, view = "Batter's eye") {
  const [directionX, directionY] = shotDirections[shot] || [0, -1];
  const handDirection = isLeftHandedBatter(batter) ? -1 : 1;
  const viewDirection = view === "Bowler's eye" ? -1 : 1;
  return [directionX * handDirection * viewDirection, directionY];
}

function availableBallTypes(bowler) {
  const style = styleForBowler(bowler);
  if (config.spinBallTypes[style]) {
    return [...config.spinBallTypes[style], "Stock ball"];
  }
  return config.paceBallTypes;
}

function resetBattingOrder() {
  const lineup = lineupForTeam(state.battingTeam);
  const order = teamBattingOrder(lineup);
  const selectedOpeners = state.battingTeam === state.playerTeam
    ? state.playerOpeningBatters
    : lineup.Batters.slice(0, 2);
  const selected = selectedOpeners.filter((player) => order.includes(player));
  state.battingOrder = [
    ...selected,
    ...order.filter((player) => !selected.includes(player)),
  ];
  state.openingBatter = selected[0];
  state.openingPartner = selected[1];
  state.striker = selected[0];
  state.nonStriker = selected[1];
  state.nextBatterIndex = 2;
}

function updateOpeningBatters() {
  if (state.hasStarted) return;
  if (elements.batter.value === elements.partner.value) {
    const replacement = selectedPlayerXI.Batters
      .find((name) => name !== elements.batter.value);
    elements.partner.value = replacement;
  }
  state.playerOpeningBatters = [elements.batter.value, elements.partner.value];
  if (state.battingTeam === state.playerTeam) resetBattingOrder();
  renderScorecard();
}

function renderAll() {
  enforceFieldingRestrictions();
  renderScoreboard();
  renderScorecard();
  renderConditions();
  renderTactics();
  renderRuleControls();
  drawVisuals();
}

function renderScoreboard() {
  elements.score.textContent = `${state.runs}/${state.wickets}`;
  elements.overs.textContent = `INNINGS ${state.innings} · ${formatOvers(state.balls)} overs`;
  const runRate = state.balls ? state.runs / (state.balls / 6) : 0;
  let rateText = `RUN RATE ${runRate.toFixed(2)}`;
  if (state.target !== null) {
    const remaining = Math.max(0, state.target - state.runs);
    const ballsLeft = Math.max(1, state.totalBalls - state.balls);
    rateText += ` · REQUIRED ${(remaining / (ballsLeft / 6)).toFixed(2)} · TARGET ${state.target}`;
  }
  elements.rates.textContent = rateText;
}

function renderScorecard() {
  const striker = state.battingFigures[state.striker] || { runs: 0, balls: 0 };
  const strikerRate = striker.balls ? (striker.runs * 100 / striker.balls) : 0;
  elements.batterCard.textContent =
    `STRIKER  ${state.striker} · ${striker.runs} (${striker.balls}) · SR ${strikerRate.toFixed(2)}`;

  const partner = state.battingFigures[state.nonStriker] || { runs: 0, balls: 0 };
  const partnerRate = partner.balls ? (partner.runs * 100 / partner.balls) : 0;
  elements.partnerCard.textContent =
    `NON-STRIKER  ${state.nonStriker} · ${partner.runs} (${partner.balls}) · SR ${partnerRate.toFixed(2)}`;

  const bowler = state.bowlingFigures[state.bowler] || {
    balls: 0, maidens: 0, runs: 0, wickets: 0,
  };
  elements.bowlerCard.textContent =
    `BOWLER  ${state.bowler} · ${formatOvers(bowler.balls)}-${bowler.maidens}-${bowler.runs}-${bowler.wickets}`;
  elements.bowlerStyle.textContent = styleForBowler(state.bowler).toUpperCase();
  elements.batter.disabled = state.hasStarted;
  elements.partner.disabled = state.hasStarted;
  elements.xiSlots.querySelectorAll("select").forEach((select) => {
    select.disabled = state.hasStarted;
  });
}

function renderConditions() {
  const swing = Math.max(0, (state.humidity - 45) / 10 + (1 - state.ballAge / 80) * 0.8);
  const pitchEffect = state.pitch === "Green seamer"
    ? "Seam movement"
    : state.pitch === "Dusty turner" ? "Turn" : "Carry and pace";
  const fielding = getFieldingRestrictions();
  const fieldingText = state.format === "Test"
    ? `Fielding       no circle limit`
    : `${fielding.label.padEnd(14)} ${fielding.maxOutside} outside maximum`;
  elements.conditions.textContent =
    `Humidity       ${state.humidity}%\n` +
    `Ball age       ${state.ballAge.toFixed(1)} overs\n` +
    `${pitchEffect.padEnd(14)} ${pitchFactor().toFixed(2)}×\n` +
    `Pitch wear     ${state.pitchWear.toFixed(0)}%\n` +
    `Swing index    ${swing.toFixed(2)}\n` +
    `${fieldingText}`;
}

function getFieldingRestrictions() {
  if (state.format === "T20") {
    return state.balls < 36
      ? { label: "POWERPLAY", maxOutside: 2, active: true, boundaryBonus: 0.035 }
      : { label: "OPEN FIELD", maxOutside: 5, active: false, boundaryBonus: 0 };
  }
  if (state.format === "ODI") {
    if (state.balls < 60) {
      return { label: "POWERPLAY 1", maxOutside: 2, active: true, boundaryBonus: 0.035 };
    }
    if (state.balls < 240) {
      return { label: "POWERPLAY 2", maxOutside: 4, active: true, boundaryBonus: 0.015 };
    }
    return { label: "POWERPLAY 3", maxOutside: 5, active: true, boundaryBonus: 0 };
  }
  return { label: "TEST", maxOutside: 9, active: false, boundaryBonus: 0 };
}

function outsideFieldingCircle(position) {
  const horizontal = (position[0] - 0.5) / 0.16;
  const vertical = (position[1] - 0.5) / 0.14;
  return horizontal * horizontal + vertical * vertical > 1;
}

function enforceFieldingRestrictions(preferredOutsideFielder = null) {
  const { maxOutside } = getFieldingRestrictions();
  const outside = Object.entries(state.fielders)
    .filter(([name, position]) => name !== "Keeper" && outsideFieldingCircle(position))
    .map(([name]) => name);
  if (outside.length <= maxOutside) return;

  if (preferredOutsideFielder && outside.includes(preferredOutsideFielder)) {
    outside.splice(outside.indexOf(preferredOutsideFielder), 1);
    outside.unshift(preferredOutsideFielder);
  }
  for (const name of outside.slice(maxOutside)) {
    const [x, y] = state.fielders[name];
    const horizontal = (x - 0.5) / 0.16;
    const vertical = (y - 0.5) / 0.14;
    const radius = Math.hypot(horizontal, vertical) || 1;
    state.fielders[name] = [
      0.5 + horizontal / radius * 0.9 * 0.16,
      0.5 + vertical / radius * 0.9 * 0.14,
    ];
  }
}

function pitchFactor() {
  if (state.pitch === "Dusty turner") return 1 + state.pitchWear / 100;
  if (state.pitch === "Green seamer") return 1.15 - state.pitchWear / 250;
  return 0.8;
}

function renderTactics() {
  const batting = state.role === "Batting";
  elements.battingControls.hidden = !batting;
  elements.bowlingControls.hidden = batting;
  if (batting) {
    elements.deliveryPreview.textContent = state.matchOver
      ? "MATCH COMPLETE"
      : `INCOMING DELIVERY\n${getUpcomingDelivery().join(" · ")}`;
    if (!state.matchOver) updateAvailableShots(getUpcomingDelivery());
  } else {
    elements.deliveryPreview.textContent = "BOWLING PLAN\nChoose line, then length, then delivery.";
    renderBowlingChoices();
  }
  elements.playBall.disabled =
    state.matchOver || state.awaitingFollowOn || (!batting && !state.bowlingPlanReady);
  elements.actionReplay.disabled = !state.lastReplay;
}

function renderRuleControls() {
  const followOnLead = state.inningsScores[0] - state.inningsScores[1];
  const showFollowOn = state.awaitingFollowOn;
  elements.followOnControls.hidden = !showFollowOn;
  elements.followOnMessage.textContent =
    `Team A lead by ${followOnLead} runs. Enforce the follow-on or send Team A in to bat again.`;
  const newBallAvailable = state.format === "Test" &&
    state.ballsSinceNewBall >= 480 && !state.matchOver && !state.awaitingFollowOn;
  elements.newBallControls.hidden = !newBallAvailable;
  elements.newBallMessage.textContent =
    `A new ball is available after ${formatOvers(state.ballsSinceNewBall)} overs.`;
}

function availableShotsForDelivery(delivery) {
  const [ballType, , length] = delivery;
  const bouncer = length === "Bouncer" || ballType.toLowerCase().includes("bouncer");
  if (bouncer) {
    return config.shots.filter((shot) => [
      "Back-foot defence", "Leave", "Pull", "Upper cut", "Ramp",
    ].includes(shot));
  }
  if (length === "Short") {
    return config.shots.filter((shot) => [
      "Back-foot defence", "Leave", "Pull", "Square cut", "Late cut",
      "Upper cut", "Ramp",
    ].includes(shot));
  }
  if (length === "Yorker") {
    return config.shots.filter((shot) => [
      "Leave", "Cover drive", "On drive",
      "Straight drive", "Flick", "Defensive block",
    ].includes(shot));
  }
  if (length === "Full") {
    return config.shots.filter((shot) => [
      "Leave", "Cover drive", "On drive", "Straight drive", "Flick",
      "Sweep", "Reverse sweep", "Slog sweep", "Defensive block",
      "Lofted drive", "Dance down the track",
    ].includes(shot));
  }
  if (length === "Good length") {
    return config.shots.filter((shot) => ![
      "Upper cut", "Ramp", "Scoop",
    ].includes(shot));
  }
  if (length === "Full toss") {
    return config.shots.filter((shot) => ![
      "Upper cut", "Ramp", "Scoop", "Dance down the track",
    ].includes(shot));
  }
  return config.shots;
}

function updateAvailableShots(delivery) {
  const shots = availableShotsForDelivery(delivery);
  const previous = elements.shot.value;
  fillSelect(elements.shot, shots);
  if (shots.includes(previous)) elements.shot.value = previous;
}

function getUpcomingDelivery() {
  if (!state.upcomingDelivery) {
    state.upcomingDelivery = aiDelivery();
  }
  return state.upcomingDelivery;
}

function renderBowlingChoices() {
  elements.bowlingChoices.replaceChildren();
  if (state.matchOver) {
    elements.bowlingStage.textContent = "MATCH COMPLETE";
    elements.bowlingSummary.textContent = "";
    return;
  }
  if (state.bowlingPlanReady) {
    elements.bowlingStage.textContent = "DELIVERY READY";
    elements.bowlingSummary.textContent =
      `${state.line} · ${state.length} · ${state.ballType}`;
    return;
  }

  const steps = {
    line: { title: "1 / 3 · SELECT LINE", choices: config.lines },
    length: { title: "2 / 3 · SELECT LENGTH", choices: config.lengths },
    delivery: {
      title: "3 / 3 · SELECT DELIVERY",
      choices: availableDeliveryTypes(state.bowler, state.length),
    },
  };
  const step = steps[state.bowlingStep];
  elements.bowlingStage.textContent = step.title;
  elements.bowlingSummary.textContent = state.bowlingStep === "line"
    ? "Choose where to aim."
    : state.bowlingStep === "length"
      ? `LINE · ${state.line}`
      : `${state.line} · ${state.length}`;

  for (const choice of step.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice;
    button.addEventListener("click", () => chooseBowlingOption(choice));
    elements.bowlingChoices.append(button);
  }
}

function availableDeliveryTypes(bowler, length) {
  return availableBallTypes(bowler).filter((type) => {
    const bouncer = type.toLowerCase().includes("bouncer");
    if (bouncer && !["Short", "Bouncer"].includes(length)) return false;
    if (["Short", "Bouncer", "Full", "Full toss", "Good length"].includes(length)) {
      return !["Toe-crushing", "Wide yorker"].includes(type);
    }
    return true;
  });
}

function chooseBowlingOption(choice) {
  if (state.bowlingStep === "line") {
    state.line = choice;
    state.bowlingStep = "length";
  } else if (state.bowlingStep === "length") {
    state.length = choice;
    state.bowlingStep = "delivery";
  } else {
    state.ballType = choice;
    state.bowlingPlanReady = true;
  }
  renderTactics();
  drawView();
}

function aiDelivery() {
  const style = styleForBowler(state.bowler);
  const available = availableBallTypes(state.bowler);
  const choices = config.spinBallTypes[style]
    ? [...config.spinBallTypes[style], "Stock ball"]
    : ["Stock ball", "Outswinger", "Off cutter", "Cross-seam", "Fast", "Slower-ball"]
      .filter((ballType) => available.includes(ballType));
  if (!choices.length) choices.push(...available);
  if (state.pitch === "Dusty turner" && available.includes("Arm-ball")) {
    choices.push("Arm-ball", "Arm-ball");
  }
  return [
    choices[randomInt(0, choices.length - 1)],
    config.lines[randomInt(0, config.lines.length - 1)],
    config.lengths[randomInt(0, config.lengths.length - 1)],
  ];
}

function aiBatting(delivery = [state.ballType, state.line, state.length]) {
  const [ballType, line, length] = delivery;
  const shots = availableShotsForDelivery(delivery);
  const lineOffset = lineOffsets[line] * (isLeftHandedBatter() ? -1 : 1);
  const offside = lineOffset < -0.12;
  const legside = lineOffset > 0.12;
  const centralLine = Math.abs(lineOffset) <= 0.2;
  const outsideOff = lineOffset < -0.43;
  const spinning = isSpinDelivery(ballType);
  const movement = deliveryMovementStrength(ballType);
  const shortBall = ["Short", "Bouncer"].includes(length) ||
    ballType.toLowerCase().includes("bouncer");
  const drivableLength = ["Full", "Good length", "Full toss", "Yorker"].includes(length);
  const driveWeight = length === "Full" || length === "Full toss" ? 2.8 : 1.8;
  const weights = shots.map((shot) => {
    let weight = 0.08;
    if (shot === "Leave") {
      weight = outsideOff
        ? 3.5 + movement * 2
        : lineOffset < -0.32 ? 1.2 + movement : 0.015;
    } else if (shot === "Back-foot defence") {
      weight = shortBall ? 2.2 : length === "Good length" ? 0.9 : 0.25;
    } else if (shot === "Defensive block") {
      weight = 1 + movement * 2;
    } else if (shot === "Cover drive") {
      weight = drivableLength && (offside || centralLine)
        ? outsideOff ? 0.45 : driveWeight
        : 0.08;
    } else if (shot === "Straight drive") {
      weight = drivableLength && centralLine ? driveWeight : 0.1;
    } else if (shot === "On drive") {
      weight = drivableLength && (legside || centralLine) ? driveWeight : 0.08;
    } else if (shot === "Flick") {
      weight = drivableLength && (legside || centralLine) ? 2.2 : 0.08;
    } else if (shot === "Pull") {
      weight = shortBall && !offside ? 3 : 0.06;
    } else if (shot === "Upper cut" || shot === "Ramp") {
      weight = shortBall && offside ? 2.5 : 0.04;
    } else if (shot === "Square cut" || shot === "Late cut") {
      weight = ["Short", "Good length"].includes(length) && offside ? 2.6 : 0.04;
    } else if (shot === "Sweep") {
      weight = spinning && ["Full", "Good length"].includes(length) ? 2.4 : 0.05;
    } else if (shot === "Reverse sweep") {
      weight = spinning && ["Full", "Good length"].includes(length) && offside ? 2 : 0.04;
    } else if (shot === "Slog sweep") {
      weight = spinning && ["Full", "Good length"].includes(length) && legside ? 2.1 : 0.04;
    } else if (shot === "Lofted drive") {
      weight = drivableLength && centralLine
        ? length === "Good length" ? 0.7 : 1.4
        : 0.08;
    } else if (shot === "Dance down the track") {
      weight = spinning && ["Full", "Good length"].includes(length) ? 1.8 : 0.04;
    }

    const [targetX, targetY] = fieldTargetForShot(shot);
    const nearestFielder = Math.min(...Object.values(state.fielders)
      .map((position) => distance(position, [targetX, targetY])));
    const gapFactor = 0.55 + clamp(nearestFielder * 2, 0, 0.75);
    const riskFactor = 1 / (1 + movement * shotRisks[shot] * 5);
    return weight * gapFactor * riskFactor;
  });
  const selectedShot = shots[weightedChoice(weights)];
  const needsAttack = state.target !== null &&
    state.target - state.runs > Math.max(0, state.totalBalls - state.balls) * 0.5;
  const lateOvers = state.format !== "Test" && state.totalBalls - state.balls <= 18;
  const defensive = ["Leave", "Back-foot defence", "Defensive block"].includes(selectedShot);
  const aggression = clamp(
    Math.round((defensive ? 1.5 : 3) + Number(needsAttack) + Number(lateOvers) - movement),
    1,
    5,
  );
  return [
    selectedShot,
    aggression,
  ];
}

function fieldTargetForShot(shot) {
  const [x, y] = catchTargets[shot];
  return isLeftHandedBatter() ? [1 - x, y] : [x, y];
}

function isSpinDelivery(ballType, bowler = state.bowler) {
  const types = config.spinBallTypes[styleForBowler(bowler)];
  return Boolean(types && (types.includes(ballType) || ballType === "Stock ball"));
}

function deliveryMovementStrength(ballType, conditions = state) {
  const turn = conditions.pitch === "Dusty turner" ? conditions.pitchWear / 100 : 0.08;
  const swing = Math.max(0, (conditions.humidity - 45) / 100) *
    (1 - Math.min(conditions.ballAge, 80) / 100);
  if (isSpinDelivery(ballType, conditions.bowler || state.bowler)) {
    return turn * (ballType === "Arm-ball" ? 0.65 : 1);
  }
  if (["Off cutter", "Leg cutter"].includes(ballType)) {
    return turn * 0.35 + swing * 0.25;
  }
  if ([
    "Slower ball", "Slower-ball bouncer", "Slower-ball", "Knuckleball",
    "Back-of-the-hand slower ball",
  ].includes(ballType)) {
    return swing * 0.35;
  }
  if (ballType.toLowerCase().includes("reverse-swing")) {
    return swing * (conditions.ballAge >= 40 ? 1.3 : 0.65);
  }
  return swing;
}

function gaussian() {
  let first = 0;
  let second = 0;
  while (first === 0) first = Math.random();
  while (second === 0) second = Math.random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function simulateDelivery(shot, aggression, ballType, line, length) {
  const batterSkill = config.players.Batters[state.striker];
  const bowlerSkill = config.players.Bowlers[state.bowler];
  const movement = deliveryMovementStrength(ballType);
  const spinning = isSpinDelivery(ballType);
  const bowlingPressure = (bowlerSkill - batterSkill) / 1000 + movement * 0.09;
  const aggressionRisk = (aggression - 1) * 0.012;
  const wicketChance = shot === "Leave"
    ? clamp(
      movement >= 0.35 ? 0.015 + (movement - 0.35) * 0.12 : 0.001,
      0.001,
      0.1,
    )
    : clamp(
      0.045 + bowlingPressure + shotRisks[shot] + aggressionRisk,
      0.012,
      0.22,
    );

  const lineOffset = lineOffsets[line] * (isLeftHandedBatter() ? -1 : 1);
  const impactX = lineOffset + gaussian() * (0.08 + movement * 0.14);
  const heightByLength = {
    Yorker: 0.12, Full: 0.42, "Good length": 0.72, Short: 1.3,
    Bouncer: 1.3, "Full toss": 0.3,
  };
  const height = heightByLength[length] + (Math.random() * 0.33 - 0.15);
  const pitchedLegSide = lineOffset > 0.45;
  const impactOutsideLeg = impactX > 0.43;
  const impactOutsideOff = impactX < -0.43;
  const offeredShot = shot !== "Leave";
  const couldHitStumps = Math.abs(impactX) <= 0.34 && height <= 1;
  const lbwLegal = !pitchedLegSide && !impactOutsideLeg &&
    !(impactOutsideOff && offeredShot) && couldHitStumps;

  if (Math.random() < wicketChance) {
    const dismissalRoll = Math.random();
    if (shot === "Dance down the track" &&
        !["Short", "Bouncer"].includes(length) &&
        !ballType.toLowerCase().includes("bouncer") &&
        spinning &&
        Math.random() < 0.7) {
      return {
        runs: 0, wicket: true, dismissal: "stumped",
        text: `${ballType}, ${line}, ${length}. The batter dances down the track, misses the turn and is stranded outside the crease. Stumped!`,
      };
    }
    if (dismissalRoll < 0.36 && lbwLegal) {
      return {
        runs: 0, wicket: true,
        text: `${ballType}, ${line}, ${length}. The ball beats the inside edge and thuds into the pads. A strong appeal, and the finger goes up: LBW.`,
      };
    }
    if (dismissalRoll < 0.58 && shot !== "Leave" &&
        ["Just inside tramline", "6th-7th stump", "4th stump", "Off stump"]
          .includes(line)) {
      const keeperDistance = distance(state.fielders.Keeper, [0.5, 0.68]);
      if (Math.random() < Math.max(0.1, 0.9 - keeperDistance * 1.5)) {
        return {
          runs: 0, wicket: true,
          text: `${ballType}, ${line}, ${length}. A thin outside edge carries through; the wicketkeeper shifts across and takes it cleanly. Caught behind!`,
        };
      }
    }
    if (dismissalRoll < 0.84) {
      const [targetX, targetY] = fieldTargetForShot(shot);
      const catcher = Object.keys(state.fielders).reduce((nearest, name) =>
        distance(state.fielders[name], [targetX, targetY]) <
        distance(state.fielders[nearest], [targetX, targetY]) ? name : nearest,
      Object.keys(state.fielders)[0]);
      const catcherDistance = distance(state.fielders[catcher], [targetX, targetY]);
      if (Math.random() < clamp(0.82 - catcherDistance * 1.4, 0.08, 0.88)) {
        const detail = catcher === "Slip"
          ? "A fine edge carries to slip, who takes it safely. Caught!"
          : `The chance flies toward ${catcher}; they cover the ground and hold on. Caught!`;
        return { runs: 0, wicket: true, text: `${ballType}, ${line}, ${length}. ${detail}` };
      }
    }
    if (length === "Bouncer" || ballType.toLowerCase().includes("bouncer")) {
      return {
        runs: 0, wicket: false,
        text: `${ballType}, ${line}, ${length}. The bouncer climbs over the stumps after the batter ducks under it. No wicket.`,
      };
    }
    if (!couldHitStumps) {
      return {
        runs: 0, wicket: false,
        text: `${ballType}, ${line}, ${length}. The batter misses, but the ball passes outside the stumps. No wicket.`,
      };
    }
    return {
      runs: 0, wicket: true,
      dismissal: "bowled",
      text: `${ballType}, ${line}, ${length}. The batter misses, and the ball carries on to clip the top of off stump. Bowled!`,
    };
  }

  if (shot === "Leave") {
    return {
      runs: 0, wicket: false,
      text: `${ballType}, ${line}, ${length}. The batter leaves it alone; no run.`,
    };
  }

  const edgeChance = Math.max(0.015, 0.1 + bowlingPressure * 0.45 + aggressionRisk);
  if (Math.random() < edgeChance) {
    if (couldHitStumps && Math.random() < 0.12) {
      return {
        runs: 0,
        wicket: true,
        dismissal: "bowled",
        choppedOn: true,
        text: `${ballType}, ${line}, ${length}. The inside edge trickles back onto the stumps. Chopped on!`,
      };
    }
    return Math.random() < 0.18
      ? { runs: 0, wicket: false, text: `${ballType}, ${line}, ${length}. A thick edge drops short of the cordon; they hurry through for a single.` }
      : { runs: 0, wicket: false, text: `${ballType}, ${line}, ${length}. It takes a thin edge, but the keeper gathers safely. No run.` };
  }

  const powerplayBonus = getFieldingRestrictions().boundaryBonus;
  let boundaryChance = 0.06 + aggression * 0.035 + powerplayBonus +
    (batterSkill - 70) / 1000 - movement * 0.08;
  if (["Leave", "Back-foot defence", "Defensive block"].includes(shot)) {
    boundaryChance *= 0.12;
  }
  if (Math.random() < Math.max(0.01, boundaryChance)) {
    const sixShots = [
      "Pull", "Straight drive", "Sweep", "On drive", "Flick", "Slog sweep", "Reverse sweep", "Scoop",
      "Lofted drive",
    ];
    const runs = sixShots.includes(shot) && aggression >= 4 && Math.random() < 0.23 ? 6 : 4;
    return {
      runs, wicket: false,
      text: `${ballType}, ${line}, ${length}. ${shot.toLowerCase()}! The ball races through the gap, beats the chasing fielder and reaches the rope for ${runs}.`,
    };
  }

  let weights = [0.2, 0.38, 0.24, 0.12, 0.06];
  if (aggression <= 2) weights = [0.38, 0.37, 0.17, 0.06, 0.02];
  const runs = weightedChoice(weights);
  if (runs === 0) {
    return {
      runs: 0, wicket: false,
      text: `${ballType}, ${line}, ${length}. ${shot.toLowerCase()}; solid contact, but the infield closes in. Dot ball.`,
    };
  }
  const [relativeTargetX] = catchTargets[shot];
  const area = relativeTargetX < 0.43
    ? "off side"
    : relativeTargetX > 0.57 ? "leg side" : "straight";
  return {
    runs, wicket: false,
    text: `${ballType}, ${line}, ${length}. ${shot.toLowerCase()} into the ${area}; the fielders converge and they complete ${runs}.`,
  };
}

function weightedChoice(weights) {
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return index;
  }
  return weights.length - 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function recordFigures(result) {
  const batter = state.battingFigures[state.striker] ||
    (state.battingFigures[state.striker] = { runs: 0, balls: 0 });
  batter.runs += result.runs;
  batter.balls += Number(result.legalBall || result.noBall);

  const bowler = state.bowlingFigures[state.bowler] ||
    (state.bowlingFigures[state.bowler] = {
      balls: 0, maidens: 0, runs: 0, wickets: 0, overRuns: 0,
    });
  bowler.balls += Number(result.legalBall);
  bowler.runs += result.runs + (result.extras || 0);
  bowler.wickets += Number(result.wicket && result.dismissal !== "run out");
  bowler.overRuns += result.runs + (result.extras || 0);
  if (bowler.balls > 0 && bowler.balls % 6 === 0) {
    if (bowler.overRuns === 0) bowler.maidens += 1;
    bowler.overRuns = 0;
  }
}

function playBall() {
  if (state.matchOver || state.awaitingFollowOn) return;
  state.replayAnimation = null;
  state.stumpsKnocked = false;
  let newHighlight = null;
  let delivery;
  let shot;
  let aggression;
  if (state.role === "Batting") {
    shot = elements.shot.value;
    aggression = Number(elements.aggression.value);
    delivery = getUpcomingDelivery();
    state.upcomingDelivery = null;
  } else {
    if (!state.bowlingPlanReady) return;
    delivery = [state.ballType, state.line, state.length];
  }

  let noBall = false;
  let wide = false;
  if (state.role === "Bowling") {
    const skill = config.players.Bowlers[state.bowler];
    if (Math.random() < 0.015) {
      noBall = true;
    } else if (state.line === "Just inside tramline" && Math.random() < 0.16) {
      wide = true;
    } else if (Math.random() < clamp(0.13 - (skill - 80) * 0.003, 0.035, 0.16)) {
      const lengthIndex = config.lengths.indexOf(delivery[2]);
      const step = Math.random() < 0.5 ? -1 : 1;
      delivery[2] = config.lengths[clamp(lengthIndex + step, 0, config.lengths.length - 1)];
    }
  }

  const deliveryDetails = {
    ballType: delivery[0],
    line: delivery[1],
    length: delivery[2],
    bowler: state.bowler,
    batter: state.striker,
    pitch: state.pitch,
    pitchWear: state.pitchWear,
    humidity: state.humidity,
    ballAge: state.ballAge,
  };
  if (state.role === "Bowling") {
    [shot, aggression] = aiBatting(delivery);
  }
  let result;
  if (wide) {
    const stumped = shot === "Dance down the track" && Math.random() < 0.08;
    result = {
      runs: 0,
      extras: 1,
      legalBall: false,
      wicket: stumped,
      dismissal: stumped ? "stumped" : undefined,
      text: `The delivery misses the tramline; ${stumped ? "the batter charges, misses and is stumped!" : "called wide."}`,
    };
  } else {
    result = simulateDelivery(shot, aggression, ...delivery);
  }
  result.extras = (result.extras || 0) + Number(noBall);
  result.legalBall = !wide && !noBall;
  result.noBall = noBall;
  if (noBall) {
    result.text = result.wicket
      ? "No-ball! The dismissal is not valid; no run is scored."
      : `No-ball! ${result.text}`;
    result.wicket = false;
  }
  if (!result.wicket && result.runs > 0 && result.runs < 4 && Math.random() < 0.012) {
    result.runs -= 1;
    result.wicket = true;
    result.dismissal = "run out";
    result.text += " A sharp return catches the runner short of the crease: run out!";
  }
  state.hasStarted = true;
  recordFigures(result);
  state.runs += result.runs + result.extras;
  if (result.legalBall) {
    state.balls += 1;
    if (state.format === "Test") state.ballsSinceNewBall += 1;
  }
  state.ballAge += 1 / 6;
  state.humidity = clamp(state.humidity + randomInt(-1, 1), 35, 95);
  if (result.legalBall && state.balls > 0 &&
      state.balls % 60 === 0 && state.pitch === "Dusty turner") {
    state.pitchWear = Math.min(100, state.pitchWear + 10);
  }
  if (result.wicket) {
    state.wickets += 1;
    state.stumpsKnocked = result.dismissal === "bowled";
    replaceStriker();
  } else {
    if (result.runs % 2 === 1) swapStrike();
  }
  if (result.runs >= 4 || result.wicket) {
    const replayBall = result.legalBall
      ? `${Math.floor((state.balls - 1) / 6)}.${(state.balls - 1) % 6}`
      : `${Math.floor(state.balls / 6)}.${state.balls % 6}`;
    newHighlight = {
      delivery: deliveryDetails,
      shot,
      result,
      innings: state.innings,
      battingTeam: state.battingTeam,
      ball: replayBall,
      score: `${state.runs}/${state.wickets}`,
    };
    state.lastReplay = newHighlight;
    state.highlights.push(newHighlight);
  }
  if (result.legalBall && state.balls % 6 === 0) {
    swapStrike();
    advanceBowler();
  }

  const overText = result.legalBall
    ? `${Math.floor((state.balls - 1) / 6)}.${(state.balls - 1) % 6}`
    : `${Math.floor(state.balls / 6)}.${state.balls % 6}`;
  const highlight = result.runs >= 4 || result.wicket ? " · ACTION REPLAY AVAILABLE" : "";
  const overNote = result.legalBall && state.balls % 6 === 0
    ? ` End of over: ${state.striker} takes strike; ${state.bowler} bowls next.`
    : "";
  elements.commentary.textContent =
    `${overText}  ${result.text}  ${state.runs}/${state.wickets}.${highlight}${overNote}`;
  checkInningsEnd();
  if (state.role === "Bowling" && !state.matchOver) {
    state.bowlingStep = "line";
    state.bowlingPlanReady = false;
  }
  renderAll();
  if (newHighlight) {
    renderHighlights();
    playActionReplay(newHighlight);
  }
}

function swapStrike() {
  [state.striker, state.nonStriker] = [state.nonStriker, state.striker];
}

function replaceStriker() {
  if (state.wickets >= 10 || state.nextBatterIndex >= state.battingOrder.length) return;
  state.striker = state.battingOrder[state.nextBatterIndex];
  state.nextBatterIndex += 1;
}

function advanceBowler() {
  state.bowlerIndex = (state.bowlerIndex + 1) % state.bowlerOrder.length;
  state.bowler = state.bowlerOrder[state.bowlerIndex];
  elements.bowler.value = state.bowler;
}

function checkInningsEnd() {
  const inningsDone = state.wickets >= 10 || state.balls >= state.totalBalls;
  const isTest = state.format === "Test";
  const finalInnings = state.innings === (isTest ? 4 : 2);
  const chased = finalInnings && state.target !== null && state.runs >= state.target;
  if (chased) {
    const winner = state.battingTeam;
    const outcome = winnerResult(winner);
    finishMatch(
      `Target reached at ${state.runs}/${state.wickets}. Team ${winner} wins with ${10 - state.wickets} wickets in hand.`,
      outcome.label,
      outcome.resultClass,
    );
  } else if (inningsDone) {
    state.inningsScores[state.innings - 1] = state.runs;
    if (isTest && state.innings === 2) {
      const firstInningsLead = state.inningsScores[0] - state.inningsScores[1];
      if (firstInningsLead >= 200) {
        state.awaitingFollowOn = true;
        elements.commentary.textContent =
          `Team A lead by ${firstInningsLead}. The captain can enforce the follow-on or bat again.`;
      } else {
        beginInnings(3, "The third innings begins. Team A bat again.");
      }
    } else if (isTest && state.innings < 3) {
      beginInnings(state.innings + 1, "Innings complete. Play continues; no target is set yet.");
    } else if (isTest && state.innings === 3) {
      const teamTotals = { A: 0, B: 0 };
      for (let index = 0; index < 3; index += 1) {
        teamTotals[state.inningsOrder[index]] += state.inningsScores[index];
      }
      const battingFourth = state.inningsOrder[3];
      const defendingTotal = teamTotals[battingFourth === "A" ? "B" : "A"];
      const battingTotal = teamTotals[battingFourth];
      const target = defendingTotal - battingTotal + 1;
      if (target <= 0) {
        const margin = battingTotal - defendingTotal;
        const winner = battingFourth;
        const outcome = winnerResult(winner);
        finishMatch(
          `Team ${winner} wins by an innings and ${margin} runs.`,
          outcome.label,
          outcome.resultClass,
        );
      } else {
        state.target = target;
        beginInnings(
          4,
          `The final innings begins. Team ${battingFourth} need ${state.target} to win.`,
        );
      }
    } else if (isTest) {
      if (state.runs === state.target - 1) {
        finishMatch("Scores level; the Test match is tied.", "MATCH TIED", "tie");
      } else {
        const winner = state.battingTeam === "A" ? "B" : "A";
        const outcome = winnerResult(winner);
        finishMatch(
          `Team ${winner} wins by ${state.target - state.runs - 1} runs.`,
          outcome.label,
          outcome.resultClass,
        );
      }
    } else if (state.innings === 1) {
      state.target = state.runs + 1;
      beginInnings(
        2,
        `Innings break. The target is ${state.target}. The surface has taken more wear; the chase is on.`,
      );
    } else if (state.runs === state.target - 1) {
      finishMatch("Scores level; the match is tied.", "MATCH TIED", "tie");
    } else {
      const winner = state.inningsOrder[0];
      const outcome = winnerResult(winner);
      finishMatch(
        `The chase ends at ${state.runs}/${state.wickets}; the target was ${state.target}. ` +
          `Team ${winner} wins by ${state.target - state.runs - 1} runs.`,
        outcome.label,
        outcome.resultClass,
      );
    }
  }
}

function decideFollowOn(enforce) {
  if (!state.awaitingFollowOn) return;
  if (enforce) {
    state.followOnEnforced = true;
    state.inningsOrder = ["A", "B", "B", "A"];
    beginInnings(3, "Team A enforce the follow-on. Team B bat again.");
  } else {
    state.followOnEnforced = false;
    state.inningsOrder = ["A", "B", "A", "B"];
    beginInnings(3, "The follow-on is declined. Team A bat again.");
  }
  renderAll();
}

function takeNewBall() {
  if (state.format !== "Test" || state.ballsSinceNewBall < 480 || state.matchOver) return;
  state.ballsSinceNewBall = 0;
  state.ballAge = 0;
  elements.commentary.textContent =
    `The fielding side takes a new ball after ${formatOvers(state.balls)} overs.`;
  renderAll();
}

function finishMatch(message, result, resultClass) {
  state.matchOver = true;
  state.awaitingFollowOn = false;
  elements.commentary.textContent = message;
  elements.result.textContent = result;
  elements.result.className = `result ${resultClass}`;
  elements.result.hidden = false;
}

function winnerResult(winner) {
  const playerWon = winner === state.playerTeam;
  return {
    label: playerWon ? `YOU WIN · TEAM ${winner}` : `TEAM ${winner} WINS`,
    resultClass: playerWon ? "win" : "loss",
  };
}

function beginInnings(number, message) {
  state.innings = number;
  state.battingTeam = state.inningsOrder[number - 1];
  state.role = state.battingTeam === state.playerTeam ? "Batting" : "Bowling";
  elements.role.value = state.role;
  state.runs = 0;
  state.wickets = 0;
  state.balls = 0;
  state.stumpsKnocked = false;
  state.ballsSinceNewBall = 0;
  state.battingFigures = {};
  state.bowlingFigures = {};
  updateBowlingTeam(opposingTeam(state.battingTeam), state.bowler);
  resetBattingOrder();
  state.upcomingDelivery = null;
  state.bowlingStep = "line";
  state.bowlingPlanReady = false;
  state.awaitingFollowOn = false;
  state.pitchWear = Math.min(100, state.pitchWear + 5);
  state.ballAge = 0;
  state.humidity = clamp(state.humidity + randomInt(-5, 5), 35, 95);
  elements.commentary.textContent = message;
}

function drawVisuals() {
  drawView();
  drawField();
}

function prepareCanvas(canvas) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawView() {
  if (!state) return;
  const { context: ctx, width, height } = prepareCanvas(elements.viewCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#94b282";
  ctx.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 34) {
    ctx.strokeStyle = "#9fbc8d";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  const batterView = elements.view.value === "Batter's eye";
  const nearY = height * (batterView ? 0.78 : 0.25);
  const farY = height * (batterView ? 0.3 : 0.75);
  ctx.fillStyle = "#c7ae83";
  ctx.strokeStyle = "#e0d1ad";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (batterView) {
    ctx.moveTo(width * 0.37, nearY);
    ctx.lineTo(width * 0.63, nearY);
    ctx.lineTo(width * 0.56, farY);
    ctx.lineTo(width * 0.44, farY);
  } else {
    ctx.moveTo(width * 0.38, nearY);
    ctx.lineTo(width * 0.62, nearY);
    ctx.lineTo(width * 0.56, farY);
    ctx.lineTo(width * 0.44, farY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const y of [nearY, farY]) {
    ctx.strokeStyle = "#f6f1dc";
    ctx.beginPath();
    ctx.moveTo(width * 0.43, y);
    ctx.lineTo(width * 0.57, y);
    ctx.stroke();
  }
  const wicketKnock = getWicketKnockProgress(state.replayAnimation);
  drawStumps(ctx, width * 0.5, nearY, batterView ? 24 : 15, batterView ? -1 : 1, wicketKnock);
  drawStumps(ctx, width * 0.5, farY, batterView ? 15 : 24, batterView ? 1 : -1, 0);
  drawPlayer(ctx, width * 0.5, height * (batterView ? 0.72 : 0.34), "#283d32", 10);
  drawPlayer(ctx, width * 0.5, height * (batterView ? 0.34 : 0.72), "#9c563b", 8);
  ctx.fillStyle = "#284334";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.fillText(`${state.pitch.toUpperCase()} · ${state.humidity}% RH`, 14, 18);
  ctx.textAlign = "right";
  ctx.fillText(`INNINGS ${state.innings}`, width - 14, 18);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f8f6e8";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(batterView ? "BATTER'S END" : "BOWLER'S END", width / 2, height - 12);
  ctx.textAlign = "left";
  if (state.replayAnimation) {
    drawDeliveryTrajectory(
      ctx,
      width,
      height,
      state.replayAnimation.delivery,
      state.replayAnimation.progress,
      state.replayAnimation,
    );
  } else {
    const delivery = currentDeliveryDetails();
    if (delivery) drawDeliveryTrajectory(ctx, width, height, delivery, 1, null);
  }
}

function currentDeliveryDetails() {
  if (state.role === "Batting" && state.upcomingDelivery) {
    const [ballType, line, length] = state.upcomingDelivery;
    return {
      ballType, line, length, bowler: state.bowler, batter: state.striker,
      pitch: state.pitch, pitchWear: state.pitchWear, humidity: state.humidity,
      ballAge: state.ballAge,
    };
  }
  if (state.role === "Bowling" && state.bowlingPlanReady) {
    return {
      ballType: state.ballType,
      line: state.line,
      length: state.length,
      bowler: state.bowler,
      batter: state.striker,
      pitch: state.pitch,
      pitchWear: state.pitchWear,
      humidity: state.humidity,
      ballAge: state.ballAge,
    };
  }
  return null;
}

function movementForDelivery(delivery) {
  const style = styleForBowler(delivery.bowler);
  const leftHanded = isLeftHandedBatter(delivery.batter);
  if (config.spinBallTypes[style] &&
      (config.spinBallTypes[style].includes(delivery.ballType) || delivery.ballType === "Stock ball")) {
    const reverseLegSpin = ["Googly", "Flipper"].includes(delivery.ballType);
    const reverseOffSpin = ["Arm-ball", "Doosra"].includes(delivery.ballType);
    const straightSpin = ["Top-spinner", "Slider", "Zooter"].includes(delivery.ballType);
    let direction = style === "Leg spinner"
      ? reverseLegSpin ? 1 : -1
      : reverseOffSpin ? -1 : 1;
    if (straightSpin) direction = 0;
    if (leftHanded) direction *= -1;
    const turn = direction === 0 ? "HOLDS ITS LINE" : direction < 0 ? "TURNS AWAY" : "TURNS IN";
    return {
      label: `${style.toUpperCase()} · ${delivery.ballType.toUpperCase()} · ${turn} ${leftHanded ? "TO LEFT-HANDER" : "TO RIGHT-HANDER"}`,
      direction,
      mode: "turn",
    };
  }
  const type = delivery.ballType.toLowerCase();
  const directedMovement = (name, rightHandedDirection, mode = "flight") => {
    const direction = rightHandedDirection * (leftHanded ? -1 : 1);
    const motion = direction < 0 ? "AWAY FROM" : "INTO";
    return {
      label: `${name} · MOVES ${motion} ${leftHanded ? "LEFT" : "RIGHT"}-HANDER`,
      direction,
      mode,
    };
  };
  if (type.includes("inswing")) return directedMovement("SWING", 1);
  if (type.includes("outswing")) return directedMovement("SWING", -1);
  if (type.includes("reverse-swing")) return directedMovement("REVERSE SWING", -1);
  if (type.includes("off cutter")) return directedMovement("OFF CUTTER", -1, "turn");
  if (type.includes("leg cutter")) return directedMovement("LEG CUTTER", 1, "turn");
  return { label: `${style.toUpperCase()} · ${delivery.ballType.toUpperCase()}`, direction: 0, mode: "flight" };
}

function drawDeliveryTrajectory(ctx, width, height, delivery, progress, replay) {
  const batterView = elements.view.value === "Batter's eye";
  const viewDirection = batterView ? 1 : -1;
  const startX = width * 0.5;
  const stumpX = width * 0.5;
  const stumpY = height * (batterView ? 0.78 : 0.25);
  const isChoppedOn = replay?.result.choppedOn === true;
  const isBowled = replay?.result.dismissal === "bowled";
  const battingHand = isLeftHandedBatter(delivery.batter) ? -1 : 1;
  const lineX = width * (0.5 + clamp(
    (lineOffsets[delivery.line] || 0) * battingHand * viewDirection * 0.22,
    -0.15,
    0.15,
  ));
  const startY = height * (batterView ? 0.3 : 0.75);
  const movement = movementForDelivery(delivery);
  const lateralMovement = width * movement.direction * viewDirection *
    clamp(deliveryMovementStrength(delivery.ballType, delivery) * 0.12, 0, 0.07);
  const bounceFractions = {
    Yorker: 0.82, Full: 0.72, "Good length": 0.58,
    Short: 0.4, Bouncer: 0.3, "Full toss": null,
  };
  const bounceFraction = bounceFractions[delivery.length];
  const bounces = Number.isFinite(bounceFraction);
  const nominalEndX = clamp(
    lineX + lateralMovement * (movement.mode === "turn" ? 0.9 : 0.25),
    12,
    width - 12,
  );
  const endX = isChoppedOn
    ? clamp(
      stumpX + battingHand * viewDirection * width * 0.06,
      12,
      width - 12,
    )
    : isBowled ? stumpX : nominalEndX;
  const endY = isChoppedOn
    ? stumpY - viewDirection * height * 0.065
    : stumpY;
  const bounceY = startY + (endY - startY) * bounceFraction;
  const bounceX = clamp(
    startX + (lineX - startX) * bounceFraction +
      lateralMovement * (movement.mode === "flight" ? 0.55 : 0.08),
    12,
    width - 12,
  );
  const firstControl = [
    (startX + (bounces ? bounceX : endX)) / 2 +
      lateralMovement * (movement.mode === "flight" ? 0.35 : 0.08),
    (startY + (bounces ? bounceY : endY)) / 2,
  ];
  const secondControl = [
    (bounceX + endX) / 2 +
      lateralMovement * (movement.mode === "turn" ? 0.4 : 0.08),
    (bounceY + endY) / 2,
  ];

  ctx.strokeStyle = replay ? "#f8f6e8" : "#f2f1d2";
  ctx.lineWidth = replay ? 3 : 2;
  ctx.setLineDash(replay ? [] : [5, 4]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(firstControl[0], firstControl[1], bounces ? bounceX : endX,
    bounces ? bounceY : endY);
  if (bounces) {
    ctx.moveTo(bounceX, bounceY);
    ctx.quadraticCurveTo(secondControl[0], secondControl[1], endX, endY);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (bounces) {
    ctx.fillStyle = "rgba(248, 246, 232, 0.8)";
    ctx.beginPath();
    ctx.arc(bounceX, bounceY, replay ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const flightProgress = clamp(progress, 0, 1);
  const deflectionStartsAt = 0.72;
  const deliveryProgress = isChoppedOn
    ? clamp(progress / deflectionStartsAt, 0, 1)
    : flightProgress;
  let ballX;
  let groundY;
  let bounceProgress = 0;
  if (!bounces) {
    [ballX, groundY] = quadraticPoint(
      [startX, startY],
      firstControl,
      [endX, endY],
      deliveryProgress,
    );
  } else if (deliveryProgress < bounceFraction) {
    [ballX, groundY] = quadraticPoint(
      [startX, startY],
      firstControl,
      [bounceX, bounceY],
      deliveryProgress / bounceFraction,
    );
  } else {
    bounceProgress = clamp(
      (deliveryProgress - bounceFraction) / (1 - bounceFraction),
      0,
      1,
    );
    [ballX, groundY] = quadraticPoint(
      [bounceX, bounceY],
      secondControl,
      [endX, endY],
      bounceProgress,
    );
  }
  const approach = bounces && deliveryProgress >= bounceFraction
    ? bounceProgress
    : deliveryProgress / (bounces ? bounceFraction : 1);
  const depth = batterView ? flightProgress : 1 - flightProgress;
  let airborneHeight;
  if (bounces && deliveryProgress < bounceFraction) {
    const firstFlight = deliveryProgress / bounceFraction;
    airborneHeight = Math.sin(Math.PI * firstFlight) *
      height * (delivery.length === "Bouncer" ? 0.09 : 0.045);
  } else {
    const bounceHeight = delivery.length === "Bouncer" ? 0.18
      : delivery.length === "Short" ? 0.14
        : delivery.length === "Full" ? 0.09
          : delivery.length === "Good length" ? 0.07 : 0.045;
    airborneHeight = Math.sin(Math.PI * approach) * height *
      (bounces ? bounceHeight : 0.11);
  }
  const ballRadius = 3.2 + depth * 3.2;
  const shadowScale = 0.65 + depth * 0.65;
  if (replay && replay.result.runs >= 4) {
    const [directionX, directionY] = shotDirectionFor(
      replay.shot,
      delivery.batter,
      elements.view.value,
    );
    const shotEndX = clamp(endX + directionX * width * 0.42, 18, width - 18);
    const shotEndY = clamp(endY + directionY * height * 0.42, 30, height - 20);
    ctx.strokeStyle = "#c7d47b";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(shotEndX, shotEndY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (progress > 1) {
      const shotProgress = clamp(progress - 1, 0, 1);
      ballX = endX + (shotEndX - endX) * shotProgress;
      groundY = endY + (shotEndY - endY) * shotProgress;
    }
  }
  if (isChoppedOn && progress >= deflectionStartsAt) {
    const deflectionProgress = clamp(
      (progress - deflectionStartsAt) / (1 - deflectionStartsAt),
      0,
      1,
    );
    const deflectionControl = [
      (endX + stumpX) / 2 + battingHand * width * 0.025,
      (endY + stumpY) / 2 + viewDirection * height * 0.02,
    ];
    ctx.strokeStyle = "#f1bd62";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.quadraticCurveTo(
      deflectionControl[0],
      deflectionControl[1],
      stumpX,
      stumpY,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    [ballX, groundY] = quadraticPoint(
      [endX, endY],
      deflectionControl,
      [stumpX, stumpY],
      deflectionProgress,
    );
  }
  ctx.fillStyle = `rgba(27, 38, 29, ${0.2 - Math.min(0.11, airborneHeight / height * 0.45)})`;
  ctx.beginPath();
  ctx.ellipse(
    ballX,
    groundY + ballRadius * 0.3,
    ballRadius * shadowScale,
    ballRadius * 0.36 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  const shotFlightHeight = replay && replay.result.runs >= 4 && progress > 1
    ? Math.sin(Math.PI * clamp(progress - 1, 0, 1)) * height * 0.12
    : 0;
  drawCricketBall(ctx, ballX, groundY - shotFlightHeight - airborneHeight * (progress <= 1 ? 0.72 + depth * 0.28 : 0), ballRadius);

  const finalControl = bounces ? secondControl : firstControl;
  const tangentX = endX - finalControl[0];
  const tangentY = endY - finalControl[1];
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const unitX = tangentX / tangentLength;
  const unitY = tangentY / tangentLength;
  ctx.fillStyle = "#f8f6e8";
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - unitX * 10 - unitY * 5, endY - unitY * 10 + unitX * 5);
  ctx.lineTo(endX - unitX * 10 + unitY * 5, endY - unitY * 10 - unitX * 5);
  ctx.closePath();
  ctx.fill();

  const badge = replay
    ? `REPLAY · ${replay.shot.toUpperCase()} · ${replay.result.wicket ? "WICKET" : `${replay.result.runs} RUNS`}`
    : `${delivery.line} · ${delivery.length}`;
  ctx.fillStyle = "rgba(24, 46, 39, 0.84)";
  ctx.fillRect(12, 27, Math.min(width - 24, 360), 38);
  ctx.fillStyle = "#f8f6e8";
  ctx.font = "700 9px system-ui, sans-serif";
  ctx.fillText(badge, 20, 41, width - 40);
  ctx.fillStyle = "#d8e6bf";
  ctx.fillText(movement.label, 20, 56, width - 40);
}

function drawCricketBall(ctx, x, y, radius) {
  const gradient = ctx.createRadialGradient(
    x - radius * 0.38,
    y - radius * 0.42,
    radius * 0.08,
    x,
    y,
    radius,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.42, "#f3f2e7");
  gradient.addColorStop(0.78, "#c8cec5");
  gradient.addColorStop(1, "#777f78");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.55);
  ctx.strokeStyle = "rgba(151, 92, 83, 0.72)";
  ctx.lineWidth = Math.max(0.6, radius * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.3, radius * 0.88, 0, -0.65, 0.65);
  ctx.stroke();
  ctx.restore();
}

function quadraticPoint(start, control, end, progress) {
  const inverse = 1 - progress;
  return [
    inverse * inverse * start[0] +
      2 * inverse * progress * control[0] + progress * progress * end[0],
    inverse * inverse * start[1] +
      2 * inverse * progress * control[1] + progress * progress * end[1],
  ];
}

function playActionReplay(replayRecord = state?.lastReplay) {
  if (!replayRecord) return;
  const animation = {
    delivery: replayRecord.delivery,
    shot: replayRecord.shot,
    result: replayRecord.result,
    battingTeam: replayRecord.battingTeam,
    progress: 0,
    startedAt: performance.now(),
  };
  state.replayAnimation = animation;
  function drawFrame(now) {
    if (state.replayAnimation !== animation) return;
    const stages = animation.result.runs >= 4
      ? 2
      : animation.result.dismissal === "bowled" ? 1.25 : 1;
    animation.progress = Math.min(stages, (now - animation.startedAt) / 900);
    drawVisuals();
    if (animation.progress < stages) {
      requestAnimationFrame(drawFrame);
    } else {
      state.replayAnimation = null;
      drawVisuals();
    }
  }
  requestAnimationFrame(drawFrame);
}

function drawPlayer(ctx, x, y, color, radius) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#f6f1dc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function getWicketKnockProgress(replay) {
  if (replay) {
    return replay.result.dismissal === "bowled"
      ? clamp((replay.progress - 1) / 0.25, 0, 1)
      : 0;
  }
  return state?.stumpsKnocked ? 1 : 0;
}

function drawStumps(ctx, centerX, baseY, height, topDirection, knockProgress = 0) {
  ctx.save();
  ctx.fillStyle = "rgba(27, 38, 29, 0.28)";
  ctx.beginPath();
  ctx.ellipse(centerX, baseY + 1, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const offsets = [-5, 0, 5];
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#fff8e6";
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index];
    const baseX = centerX + offset;
    const topX = baseX + (index - 1) * height * 0.48 * knockProgress;
    const topY = baseY + topDirection * height * (1 - 0.42 * knockProgress);
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(topX, topY);
    ctx.stroke();
  }

  ctx.strokeStyle = "#e8d29b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (knockProgress < 0.25) {
    const bailY = baseY + topDirection * height;
    ctx.moveTo(centerX - 7, bailY);
    ctx.lineTo(centerX + 7, bailY);
  } else {
    const bailY = baseY + topDirection * height * (1 - 0.42 * knockProgress);
    const bailOffset = height * 0.48 * knockProgress;
    ctx.moveTo(centerX - 7 - bailOffset, bailY - topDirection * 3);
    ctx.lineTo(centerX - 1 - bailOffset, bailY + topDirection * 2);
    ctx.moveTo(centerX + 1 + bailOffset, bailY + topDirection * 2);
    ctx.lineTo(centerX + 7 + bailOffset, bailY - topDirection * 3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawField() {
  if (!state) return;
  const { context: ctx, width, height } = prepareCanvas(elements.fieldCanvas);
  const replay = state.replayAnimation;
  const boundaryShot = replay && replay.result.runs >= 4 && replay.progress > 1
    ? getBoundaryShot(replay, width, height, replay.progress - 1)
    : null;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#6e9568";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#80a875";
  ctx.strokeStyle = "#d9e3ce";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width / 2 - 12, height / 2 - 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#9fbd91";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width * 0.16, height * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#c7ae83";
  ctx.fillRect(width * 0.46, height * 0.39, width * 0.08, height * 0.22);
  ctx.strokeStyle = "#faf2dc";
  ctx.lineWidth = 2;
  for (const y of [0.405, 0.595]) {
    ctx.beginPath();
    ctx.moveTo(width * 0.43, height * y);
    ctx.lineTo(width * 0.57, height * y);
    ctx.stroke();
  }
  const battingTeam = replay?.battingTeam || state.battingTeam;
  const battingEnd = battingTeam === "A" ? 0.595 : 0.405;
  const fieldKnock = getWicketKnockProgress(replay);
  drawStumps(
    ctx,
    width * 0.5,
    height * battingEnd,
    18,
    battingEnd < 0.5 ? 1 : -1,
    fieldKnock,
  );
  drawStumps(
    ctx,
    width * 0.5,
    height * (battingEnd === 0.405 ? 0.595 : 0.405),
    18,
    battingEnd < 0.5 ? -1 : 1,
    0,
  );
  drawPlayer(ctx, width * 0.5, height * 0.37, "#283d32", 4);
  drawPlayer(ctx, width * 0.5, height * 0.62, "#9c563b", 4);

  for (const [name, [x, y]] of Object.entries(state.fielders)) {
    const px = x * width;
    const py = y * height;
    ctx.fillStyle = "#f4f0dc";
    ctx.strokeStyle = "#233d2c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8f7e9";
    ctx.font = "700 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textAlign = name === "Keeper" || Math.abs(x - 0.5) < 0.04
      ? "center"
      : x < 0.5 ? "right" : "left";
    const labelX = x < 0.5 ? px - 8 : x > 0.5 ? px + 8 : px;
    ctx.fillText(name, labelX, py + 3);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#eff5e9";
  ctx.font = "700 8px system-ui, sans-serif";
  ctx.fillText("30-YARD CIRCLE", width / 2, height * 0.37);
  ctx.fillText("FIELD · DRAG TO REPOSITION", width / 2, height - 9);
  ctx.textAlign = "left";
  if (boundaryShot) {
    const { x, y, progress } = boundaryShot;
    const trailLength = Math.min(7, Math.ceil(progress * 7));
    ctx.strokeStyle = "rgba(248, 246, 232, 0.42)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(248, 246, 232, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - boundaryShot.directionX * trailLength * 3,
      y - boundaryShot.directionY * trailLength * 3);
    ctx.stroke();
    ctx.fillStyle = "rgba(27, 38, 29, 0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCricketBall(ctx, x, y - 3, 5);
    if (progress >= 0.98) {
      ctx.fillStyle = "rgba(24, 46, 39, 0.88)";
      ctx.fillRect(width * 0.34, height * 0.44, width * 0.32, 30);
      ctx.fillStyle = "#f8f6e8";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BOUNDARY", width / 2, height * 0.44 + 19);
      ctx.textAlign = "left";
    }
  }
}

function getBoundaryShot(replay, width, height, progress) {
  const [directionX, directionY] = shotDirectionFor(replay.shot, replay.delivery.batter);
  const radiusX = 0.5 - 12 / width;
  const radiusY = 0.5 - 8 / height;
  const scale = 1 / Math.sqrt(
    (directionX / radiusX) ** 2 + (directionY / radiusY) ** 2,
  );
  return {
    x: width * (0.5 + directionX * scale * clamp(progress, 0, 1)),
    y: height * (0.5 + directionY * scale * clamp(progress, 0, 1)),
    directionX,
    directionY,
    progress: clamp(progress, 0, 1),
  };
}

function pointerPosition(event) {
  const bounds = elements.fieldCanvas.getBoundingClientRect();
  return [
    (event.clientX - bounds.left) / bounds.width,
    (event.clientY - bounds.top) / bounds.height,
  ];
}

function startDraggingFielder(event) {
  const [x, y] = pointerPosition(event);
  const bounds = elements.fieldCanvas.getBoundingClientRect();
  const nearest = Object.entries(state.fielders)
    .map(([name, point]) => [name, Math.hypot((point[0] - x) * bounds.width, (point[1] - y) * bounds.height)])
    .sort((first, second) => first[1] - second[1])[0];
  if (nearest && nearest[1] < 18) {
    draggingFielder = nearest[0];
    elements.fieldCanvas.setPointerCapture(event.pointerId);
  }
}

function dragFielder(event) {
  if (!draggingFielder) return;
  const [x, y] = pointerPosition(event);
  state.fielders[draggingFielder] = [clamp(x, 0.07, 0.93), clamp(y, 0.08, 0.88)];
  enforceFieldingRestrictions(draggingFielder);
  drawField();
}

function stopDraggingFielder() {
  draggingFielder = null;
}

initialize().catch((error) => {
  console.error(error);
  elements.commentary.textContent = `Unable to start the game: ${error.message}`;
});
