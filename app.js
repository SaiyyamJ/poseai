// ===== DOM ELEMENTS =====
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const demoOverlay = document.getElementById('demoOverlay');

let reps = 0;
let stage = "up";

// Consecutive frame counters to prevent jitter/false triggers
let downFrames = 0;
let upFrames = 0;
const FRAME_THRESHOLD = 5; // must hold position for 5 frames to register

// Accuracy tracking — only during active squat reps
let goodRepFrames = 0;   // frames with good form during squats
let totalRepFrames = 0;  // total frames during squat movement
let isSquatting = false;  // true when user is in an active squat motion

// Minimum landmark visibility confidence
const MIN_CONFIDENCE = 0.5;

// Squat angle thresholds
const SQUAT_DOWN_ANGLE = 100;  // knee angle below this = squat bottom
const SQUAT_UP_ANGLE = 160;    // knee angle above this = standing

// ===== ANGLE CALCULATION =====
function calculateAngle(a, b, c) {
    const ab = [a.x - b.x, a.y - b.y];
    const cb = [c.x - b.x, c.y - b.y];

    const dot = (ab[0] * cb[0] + ab[1] * cb[1]);
    const magAB = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
    const magCB = Math.sqrt(cb[0] * cb[0] + cb[1] * cb[1]);

    const denom = magAB * magCB;
    if (denom === 0) return 180;

    let cosAngle = dot / denom;
    // Clamp to avoid NaN from floating point errors
    cosAngle = Math.max(-1, Math.min(1, cosAngle));
    return Math.acos(cosAngle) * 180 / Math.PI;
}

// Check if landmark is visible enough to trust
function isVisible(landmark) {
    return landmark && landmark.visibility > MIN_CONFIDENCE;
}

// Verify body is in a squat-like posture (hips drop toward knees)
function isSquatPosture(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    // Check all key landmarks are visible
    if (!isVisible(leftHip) || !isVisible(rightHip) ||
        !isVisible(leftKnee) || !isVisible(rightKnee) ||
        !isVisible(leftShoulder) || !isVisible(rightShoulder)) {
        return false;
    }

    // Hips should be below shoulders (person is upright, not lying down)
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    if (avgHipY < avgShoulderY) return false; // upside down or lying

    // Knees should be below hips
    const avgKneeY = (leftKnee.y + rightKnee.y) / 2;
    if (avgKneeY < avgHipY) return false;

    return true;
}

// ===== POSE RESULTS HANDLER =====
function onResults(results) {
    // Hide camera overlay once we get first frame
    if (demoOverlay && !demoOverlay.classList.contains('hidden')) {
        demoOverlay.classList.add('hidden');
    }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {

        // Draw skeleton with styled colors
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
            { color: '#00FF00', lineWidth: 4 });

        drawLandmarks(canvasCtx, results.poseLandmarks,
            { color: '#FF0000', lineWidth: 2 });

        // Get landmarks for BOTH legs
        const leftHip = results.poseLandmarks[23];
        const leftKnee = results.poseLandmarks[25];
        const leftAnkle = results.poseLandmarks[27];
        const rightHip = results.poseLandmarks[24];
        const rightKnee = results.poseLandmarks[26];
        const rightAnkle = results.poseLandmarks[28];

        // Check that key landmarks are visible
        const leftLegVisible = isVisible(leftHip) && isVisible(leftKnee) && isVisible(leftAnkle);
        const rightLegVisible = isVisible(rightHip) && isVisible(rightKnee) && isVisible(rightAnkle);

        if (!leftLegVisible && !rightLegVisible) {
            // Can't see either leg reliably — skip this frame
            updateFeedbackUI("Stand fully in frame", "📷", false);
            return;
        }

        // Verify squat-like body posture (upright, not random movement)
        if (!isSquatPosture(results.poseLandmarks)) {
            updateFeedbackUI("Face the camera and stand upright", "🧍", false);
            downFrames = 0;
            upFrames = 0;
            return;
        }

        // Calculate knee angles — average both legs if both visible
        let kneeAngle;
        if (leftLegVisible && rightLegVisible) {
            const leftAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
            const rightAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
            kneeAngle = (leftAngle + rightAngle) / 2;
        } else if (leftLegVisible) {
            kneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        } else {
            kneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        }

        let feedback = "";
        let feedbackIcon = "";
        let isGood = true;

        // ---- SQUAT STATE MACHINE ----

        if (kneeAngle < SQUAT_DOWN_ANGLE) {
            // Potential squat bottom position
            downFrames++;
            upFrames = 0;

            if (downFrames >= FRAME_THRESHOLD && stage === "up") {
                // Confirmed squat down
                stage = "down";
                isSquatting = true;
            }

            if (stage === "down") {
                feedback = "Good depth! Now push back up";
                feedbackIcon = "⬇️";
                // Good form = deep squat
                goodRepFrames++;
                totalRepFrames++;
            } else {
                feedback = "Going down...";
                feedbackIcon = "⬇️";
            }

        } else if (kneeAngle > SQUAT_UP_ANGLE) {
            // Potential standing position
            upFrames++;
            downFrames = 0;

            if (upFrames >= FRAME_THRESHOLD && stage === "down") {
                // Confirmed standing back up — count the rep!
                stage = "up";
                reps++;
                isSquatting = false;
                document.getElementById("repCount").innerText = reps;
                feedback = "Great rep! Keep going!";
                feedbackIcon = "🔥";
                isGood = true;
            } else if (stage === "up") {
                feedback = "Standing — squat down to start";
                feedbackIcon = "🧍";
            } else {
                feedback = "Push up to complete the rep";
                feedbackIcon = "⬆️";
            }

        } else {
            // Mid-range (between down and up thresholds)
            downFrames = 0;
            upFrames = 0;

            if (stage === "down" || isSquatting) {
                totalRepFrames++;
                // Check if form is decent in mid-range
                if (kneeAngle < 130) {
                    goodRepFrames++;
                    feedback = "Good form — keep going";
                    feedbackIcon = "✅";
                } else {
                    feedback = "Go a bit deeper";
                    feedbackIcon = "⬇️";
                    isGood = false;
                }
            } else {
                feedback = "Bend your knees to squat";
                feedbackIcon = "🏋️";
                isGood = false;
            }
        }

        // Update accuracy (only meaningful after at least 1 rep attempt)
        if (totalRepFrames > 0) {
            let accuracy = Math.round((goodRepFrames / totalRepFrames) * 100);
            document.getElementById("accuracy").innerText = accuracy + "%";
        }

        // Update stage display
        const stageEl = document.getElementById("stageDisplay");
        if (stageEl) {
            if (stage === "down") {
                stageEl.innerText = "↓ DOWN";
            } else if (isSquatting) {
                stageEl.innerText = "↕ MID";
            } else {
                stageEl.innerText = "↑ UP";
            }
        }

        updateFeedbackUI(feedback, feedbackIcon, isGood);
    }
}

function updateFeedbackUI(feedback, icon, isGood) {
    const feedbackEl = document.getElementById("feedback");
    feedbackEl.innerHTML = `${icon} ${feedback}`;

    if (isGood) {
        feedbackEl.style.color = '#A8DCAB';
        feedbackEl.style.background = 'rgba(168, 220, 171, 0.1)';
    } else {
        feedbackEl.style.color = '#DBAAA7';
        feedbackEl.style.background = 'rgba(219, 170, 167, 0.1)';
    }
}

// ===== MEDIAPIPE POSE SETUP =====
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start();



// ===== MOBILE NAV TOGGLE =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });
}

// Close nav when clicking a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
    });
});

// ===== SMOOTH SCROLL FOR NAV =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const navHeight = document.getElementById('main-nav').offsetHeight;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ===== NAV BACKGROUND ON SCROLL =====
window.addEventListener('scroll', () => {
    const nav = document.getElementById('main-nav');
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(10,10,15,0.95)';
        nav.style.borderBottomColor = 'rgba(255,255,255,0.08)';
    } else {
        nav.style.background = 'rgba(10,10,15,0.8)';
        nav.style.borderBottomColor = 'rgba(255,255,255,0.06)';
    }
});

