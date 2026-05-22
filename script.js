// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'https://premammail.onrender.com'; // Change this to your deployed backend URL

// ── DOM refs ────────────────────────────────────────────────────────────────
const video         = document.getElementById('envelope-video');
const actionButtons = document.getElementById('action-buttons');
const openBtn       = document.getElementById('open-btn');
const tearBtn       = document.getElementById('tear-btn');
const letterContent = document.getElementById('letter-content');
const actualMessage = document.getElementById('actual-message');
const tornMessage   = document.getElementById('torn-message');
const loadingScreen = document.getElementById('loading-screen');
const errorScreen   = document.getElementById('error-screen');
const errorText     = document.getElementById('error-text');

// ── Get letter ID from URL (?id=abc1234) ────────────────────────────────────
const params   = new URLSearchParams(window.location.search);
const letterId = params.get('id');

// ── On page load: fetch letter from backend ─────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    // No ID in URL — show error
    if (!letterId) {
        showError("No letter ID found in the URL.");
        return;
    }

    try {
        const res  = await fetch(`${API_BASE}/api/letters/${letterId}`);
        const data = await res.json();

        hideLoading();

        if (!data.success) {
            showError(data.message || "Letter not found.");
            return;
        }

        // Letter was already torn before this visit
        if (data.status === 'torn') {
            actionButtons.classList.add('hidden');
            
            // THE NEW LOGIC: Play the already-torn video on a loop
            video.src = 'already-torn.mp4';
            video.loop = true;
            video.muted = true;
            video.play();

        }

        // Letter is fine — store message, show buttons
        actualMessage.textContent = data.message;

    } catch (err) {
        hideLoading();
        showError("Could not connect to the server. Please try again later.");
    }
});

// ── Video helper ─────────────────────────────────────────────────────────────
function playOnce(src, onEnd) {
    actionButtons.classList.add('hidden');
    video.muted  = true;
    video.loop   = false;
    video.src    = src;
    video.play();
    video.addEventListener('ended', onEnd, { once: true });
}

// ── Open button ──────────────────────────────────────────────────────────────
openBtn.addEventListener('click', () => {
    playOnce('open.mp4', () => {
        letterContent.classList.remove('hidden');
    });
});

// ── Tear button ──────────────────────────────────────────────────────────────
tearBtn.addEventListener('click', async () => {
    // Play animation first, then call API after it ends
    playOnce('tear.mp4', async () => {
        tornMessage.classList.remove('hidden');

        // Tell the backend this letter is permanently destroyed
        try {
            await fetch(`${API_BASE}/api/letters/${letterId}/tear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            console.error("Failed to mark letter as torn on server:", err);
        }
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function hideLoading() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

function showError(msg) {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    actionButtons.classList.add('hidden');
    errorText.textContent = msg;
    errorScreen.classList.remove('hidden');
}