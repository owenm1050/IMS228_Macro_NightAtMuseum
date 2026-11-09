// Statue Red Light Green Light
// Transparent statue overlay only on red light.
// Flashlight scans; locks on person during red light.
// Closeness feedback. Pause button. Longer random gaps.
// Pose checked once per red light on a snapshot.

let video;
let bodyPose;
let poses = [];
let connections = [];
let modelIsReady = false;

let currentStatue = 0;
let redLight = false;
let score = 0;
let alreadyScored = false;
let gameStarted = false;
let paused = false;
let checkingSnapshot = false;

let statueImages = [];
let lightTimeout = null;
let flashlightAngle = 0;

const statues = [
  {
    name: "Standing Woman",
    photo: "standing-woman.jpg",
    instruction: "Stand upright and fold your arms across your body.",
    matchesPose: function (points) {
      const wristsAreClose =
        Math.abs(points.leftWrist.x - points.rightShoulder.x) < 180 &&
        Math.abs(points.rightWrist.x - points.leftShoulder.x) < 180;
      const wristsAreSimilarHeight =
        Math.abs(points.leftWrist.y - points.rightWrist.y) < 180;
      return wristsAreClose && wristsAreSimilarHeight;
    },
    closeness: function (points) {
      const closeScore = 1 - Math.min(1,
        (Math.abs(points.leftWrist.x - points.rightShoulder.x) +
         Math.abs(points.rightWrist.x - points.leftShoulder.x)) / 400);
      return Math.max(0, closeScore);
    }
  },
  {
    name: "Discus Thrower",
    photo: "discus-thrower.jpg",
    instruction: "Lean forward and extend one arm away from your body.",
    matchesPose: function (points) {
      const leftArmIsOut =
        Math.abs(points.leftWrist.x - points.leftShoulder.x) > 75;
      const rightArmIsOut =
        Math.abs(points.rightWrist.x - points.rightShoulder.x) > 75;
      return leftArmIsOut || rightArmIsOut;
    },
    closeness: function (points) {
      const leftOut = Math.abs(points.leftWrist.x - points.leftShoulder.x);
      const rightOut = Math.abs(points.rightWrist.x - points.rightShoulder.x);
      const best = Math.max(leftOut, rightOut);
      return Math.min(1, best / 180);
    }
  },
  {
    name: "Hermes",
    photo: "hermes.jpg",
    instruction: "Stand with one hand on your hip and the other arm down holding an imaginary staff.",
    matchesPose: function (points) {
      const leftOnHip = Math.abs(points.leftWrist.y - points.leftShoulder.y) < 140 &&
                        Math.abs(points.leftWrist.x - points.leftShoulder.x) < 160;
      const rightOnHip = Math.abs(points.rightWrist.y - points.rightShoulder.y) < 140 &&
                         Math.abs(points.rightWrist.x - points.rightShoulder.x) < 160;
      const leftDown = points.leftWrist.y > points.leftShoulder.y + 40;
      const rightDown = points.rightWrist.y > points.rightShoulder.y + 40;
      return (leftOnHip && rightDown) || (rightOnHip && leftDown);
    },
    closeness: function (points) {
      const leftHipDist = Math.abs(points.leftWrist.y - points.leftShoulder.y) +
                          Math.abs(points.leftWrist.x - points.leftShoulder.x);
      const rightHipDist = Math.abs(points.rightWrist.y - points.rightShoulder.y) +
                           Math.abs(points.rightWrist.x - points.rightShoulder.x);
      const best = Math.min(leftHipDist, rightHipDist);
      return Math.max(0, 1 - best / 280);
    }
  },
  {
    name: "David",
    photo: "david.jpg",
    instruction: "Stand with one hand raised near your shoulder and the other arm relaxed down.",
    matchesPose: function (points) {
      const leftRaised = points.leftWrist.y < points.leftShoulder.y + 40;
      const rightRaised = points.rightWrist.y < points.rightShoulder.y + 40;
      const leftDown = points.leftWrist.y > points.leftShoulder.y + 30;
      const rightDown = points.rightWrist.y > points.rightShoulder.y + 30;
      return (leftRaised && rightDown) || (rightRaised && leftDown);
    },
    closeness: function (points) {
      const leftUp = points.leftShoulder.y - points.leftWrist.y;
      const rightUp = points.rightShoulder.y - points.rightWrist.y;
      const bestUp = Math.max(leftUp, rightUp);
      return Math.min(1, Math.max(0, bestUp / 80));
    }
  }
];

function preload() {
  statueImages[0] = loadImage("standing-woman.jpg");
  statueImages[1] = loadImage("discus-thrower.jpg");
  statueImages[2] = loadImage("hermes.jpg");
  statueImages[3] = loadImage("david.jpg");
}

async function setup() {
  const canvas = createCanvas(960, 540);
  canvas.parent("canvas-holder");

  video = createCapture(VIDEO);
  // Do not force a size — let the camera keep its real aspect ratio
  video.hide();

  try {
    bodyPose = await ml5.bodyPose("BlazePose");
    bodyPose.detectStart(video, function (results) {
      poses = results;
    });
    connections = bodyPose.getSkeleton();
    modelIsReady = true;
  } catch (error) {
    console.log(error);
    document.querySelector("#feedback").textContent =
      "Could not load pose detection. Check camera and internet.";
  }
}

function draw() {
  background(0);

  // Flashlight on black background only (before drawing the person)
  if (gameStarted && !paused) {
    drawFlashlight();
  }

  if (video && video.elt.readyState >= 2) {
    // Use the video element's real dimensions so nothing stretches
    const nativeW = video.elt.videoWidth || video.width;
    const nativeH = video.elt.videoHeight || video.height;
    const vidRatio = nativeW / nativeH;

    const margin = 40;
    const maxW = width - margin * 2;
    const maxH = height - margin * 2;
    let vw, vh;
    if (vidRatio > maxW / maxH) {
      vw = maxW;
      vh = maxW / vidRatio;
    } else {
      vh = maxH;
      vw = maxH * vidRatio;
    }
    const vx = (width - vw) / 2;
    const vy = (height - vh) / 2;

    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, width - vx - vw, vy, vw, vh);
    pop();
  } else {
    fill(180);
    textAlign(CENTER, CENTER);
    textSize(18);
    text("Waiting for camera…", width / 2, height / 2);
  }

  // Transparent statue overlay only during red light
  if (gameStarted && redLight && !paused) {
    drawStatueOverlay();
  }

  if (modelIsReady && poses.length > 0 && gameStarted && !paused) {
    drawSkeleton(poses[0]);
    updateCloseness(poses[0]);
  }

  if (gameStarted && redLight && !checkingSnapshot && !alreadyScored && modelIsReady && !paused) {
    captureAndCheckPose();
  }
}

function drawFlashlight() {
  push();
  noStroke();

  // Always scanning on the black border around the person
  flashlightAngle += 0.008;
  // Prefer the outer black margins
  const scanRadiusX = width * 0.42;
  const scanRadiusY = height * 0.42;
  let cx = width / 2 + Math.cos(flashlightAngle) * scanRadiusX;
  let cy = height / 2 + Math.sin(flashlightAngle * 0.55) * scanRadiusY;

  // Keep it in the black border zone
  const border = 60;
  cx = constrain(cx, border, width - border);
  cy = constrain(cy, border, height - border);

  // Check distance to person
  let onPerson = false;
  let close = false;
  let personX = width / 2;
  let personY = height / 2;

  if (poses.length > 0 && poses[0].keypoints) {
    const kp = poses[0].keypoints;
    const ls = getBodyPoint(kp, "left_shoulder", 11);
    const rs = getBodyPoint(kp, "right_shoulder", 12);
    if (ls && rs && ls.confidence > 0.2 && rs.confidence > 0.2) {
      // Map from video coords to the inset video area on screen
      const margin = 90;
      const vw = width - margin * 2;
      const vh = height - margin * 2;
      const scaleX = vw / video.width;
      const scaleY = vh / video.height;
      const mirroredX = width - ls.x; // rough, use shoulder mid
      const midVideoX = (ls.x + rs.x) / 2;
      const midVideoY = (ls.y + rs.y) / 2 + 30;
      personX = margin + (width - midVideoX) * (vw / width);
      personY = margin + midVideoY * (vh / height);
      const dist = Math.hypot(cx - personX, cy - personY);
      if (dist < 120) {
        onPerson = true;
        cx = personX;
        cy = personY;
      } else if (dist < 280) {
        close = true;
      }
    }
  }

  // Red light only when flashlight is directly on person
  if (onPerson && !redLight) {
    redLight = true;
    alreadyScored = false;
    checkingSnapshot = false;
    document.querySelector("#feedback").textContent = "Freeze! Match the statue or the officer will catch you!";
  } else if (!onPerson && redLight) {
    redLight = false;
  }

  // Warning when officer is getting close
  if (close && !onPerson && !alreadyScored) {
    document.querySelector("#feedback").textContent = "The officer is close! Freeze soon!";
  } else if (!onPerson && !close && !alreadyScored && gameStarted) {
    document.querySelector("#feedback").textContent = "Officer is scanning. Stay ready.";
  }

  // Realistic flashlight beam on the black border
  let intensity = onPerson ? 1 : (close ? 0.9 : 0.55);
  let radius = onPerson ? 190 : (close ? 170 : 140);

  // Outer soft glow
  drawingContext.save();
  const outer = drawingContext.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 1.4);
  outer.addColorStop(0, `rgba(255,245,160,${intensity * 0.15})`);
  outer.addColorStop(1, "rgba(255,245,160,0)");
  drawingContext.fillStyle = outer;
  drawingContext.beginPath();
  drawingContext.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
  drawingContext.fill();

  // Core bright beam
  const core = drawingContext.createRadialGradient(cx, cy, 10, cx, cy, radius);
  core.addColorStop(0, `rgba(255,255,200,${intensity})`);
  core.addColorStop(0.2, `rgba(255,250,150,${intensity * 0.85})`);
  core.addColorStop(0.6, `rgba(255,230,100,${intensity * 0.35})`);
  core.addColorStop(1, "rgba(255,220,80,0)");
  drawingContext.fillStyle = core;
  drawingContext.beginPath();
  drawingContext.arc(cx, cy, radius, 0, Math.PI * 2);
  drawingContext.fill();
  drawingContext.restore();

  // Thin bright rim so the edge of the light is visible
  noFill();
  stroke(255, 250, 180, 200 * intensity);
  strokeWeight(2);
  ellipse(cx, cy, radius * 1.05, radius * 1.05);
  pop();
}

function drawStatueOverlay() {
  const img = statueImages[currentStatue];
  if (!img || img.width === 0) return;

  push();
  tint(255, 140); // transparent (~55%)

  let scaleFactor = 0.48;
  let x = width / 2;
  let y = height / 2 + 10;

  if (poses.length > 0 && poses[0].keypoints) {
    const kp = poses[0].keypoints;
    const ls = getBodyPoint(kp, "left_shoulder", 11);
    const rs = getBodyPoint(kp, "right_shoulder", 12);
    if (ls && rs && ls.confidence > 0.2 && rs.confidence > 0.2) {
      const shoulderMidX = (ls.x + rs.x) / 2;
      const shoulderMidY = (ls.y + rs.y) / 2;
      x = width - shoulderMidX;
      y = shoulderMidY + 30;
      const shoulderDist = Math.abs(ls.x - rs.x);
      scaleFactor = map(shoulderDist, 60, 280, 0.30, 0.65, true);
    }
  }

  const w = img.width * scaleFactor;
  const h = img.height * scaleFactor;
  imageMode(CENTER);
  image(img, x, y, w, h);
  pop();
}

function drawSkeleton(pose) {
  for (let j = 0; j < connections.length; j++) {
    const a = pose.keypoints[connections[j][0]];
    const b = pose.keypoints[connections[j][1]];
    if (a && b && a.confidence > 0.12 && b.confidence > 0.12) {
      stroke(100, 220, 140, 100);
      strokeWeight(2);
      line(width - a.x, a.y, width - b.x, b.y);
    }
  }
}

function getBodyPoint(keypoints, pointName, backupIndex) {
  return keypoints.find(p => p.name === pointName) || keypoints[backupIndex];
}

function updateCloseness(pose) {
  if (!pose || !pose.keypoints) return;
  const kp = pose.keypoints;
  const leftShoulder = getBodyPoint(kp, "left_shoulder", 11);
  const rightShoulder = getBodyPoint(kp, "right_shoulder", 12);
  const leftWrist = getBodyPoint(kp, "left_wrist", 15);
  const rightWrist = getBodyPoint(kp, "right_wrist", 16);
  if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist) return;

  const points = { leftShoulder, rightShoulder, leftWrist, rightWrist };
  const c = statues[currentStatue].closeness(points);
  const percent = Math.round(c * 100);
  const off = 100 - percent;
  const el = document.querySelector("#closeness");
  if (el) {
    el.textContent = `Closeness: ${percent}%  (${off}% off)`;
    el.style.color = percent > 70 ? "#4ade80" : percent > 40 ? "#fbbf24" : "#f87171";
  }
}

function captureAndCheckPose() {
  checkingSnapshot = true;

  const snapshot = createGraphics(width, height);
  snapshot.image(video, 0, 0, width, height);

  bodyPose.detect(snapshot.elt, function (results) {
    checkingSnapshot = false;

    if (!results || results.length === 0) {
      document.querySelector("#feedback").textContent = "Stay in frame.";
      return;
    }

    const keypoints = results[0].keypoints;
    const leftShoulder = getBodyPoint(keypoints, "left_shoulder", 11);
    const rightShoulder = getBodyPoint(keypoints, "right_shoulder", 12);
    const leftWrist = getBodyPoint(keypoints, "left_wrist", 15);
    const rightWrist = getBodyPoint(keypoints, "right_wrist", 16);

    const important = [leftShoulder, rightShoulder, leftWrist, rightWrist];
    const visible = important.every(p => p && p.confidence > 0.25);

    if (!visible) {
      document.querySelector("#feedback").textContent = "Make sure shoulders and wrists are visible.";
      return;
    }

    const playerPoints = { leftShoulder, rightShoulder, leftWrist, rightWrist };
    const matched = statues[currentStatue].matchesPose(playerPoints);

    if (matched && !alreadyScored) {
      score += 10;
      document.querySelector("#score").textContent = score;
      alreadyScored = true;
      document.querySelector("#feedback").textContent = "Pose matched! +10 points. Officer didn't catch you.";

      setTimeout(() => {
        chooseRandomStatue();
      }, 1200);
    } else if (!alreadyScored) {
      document.querySelector("#feedback").textContent = "Caught! The officer saw you move. Try again.";
    }
  });
}

function chooseRandomStatue() {
  let next;
  do {
    next = Math.floor(Math.random() * statues.length);
  } while (next === currentStatue && statues.length > 1);

  currentStatue = next;
  const statue = statues[currentStatue];

  document.querySelector("#statue-photo").src = statue.photo;
  document.querySelector("#statue-name").textContent = statue.name;
  document.querySelector("#statue-instruction").textContent = statue.instruction;
  document.querySelector("#round-label").textContent = (currentStatue + 1) + " of " + statues.length;

  alreadyScored = false;
  checkingSnapshot = false;
  document.querySelector("#feedback").textContent = "Match the statue.";
  document.querySelector("#closeness").textContent = "Closeness: —";
}

function togglePause() {
  paused = !paused;
  const btn = document.querySelector("#pause-btn");
  if (paused) {
    btn.textContent = "Resume";
    document.querySelector("#feedback").textContent = "Paused.";
  } else {
    btn.textContent = "Pause";
    document.querySelector("#feedback").textContent = "Resumed.";
  }
}

function startGame() {
  gameStarted = true;
  paused = false;
  document.querySelector("#start-screen").classList.add("hidden");
  document.querySelector("#game").classList.remove("hidden");

  chooseRandomStatue();
  redLight = false;

  document.querySelector("#feedback").textContent = "Don't get caught by the officer. When you see the flashlight scanning, the officer is close — freeze soon. When it is on you, freeze and match the statue.";
}

window.addEventListener("load", function () {
  document.querySelector("#start-btn").addEventListener("click", startGame);
  document.querySelector("#pause-btn").addEventListener("click", togglePause);
});
