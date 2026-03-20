let chart;
let segments = [];

// Zwift Power Zones
const ZONES = [
    { limit: 0.60, color: '#7f7f7f', bg: 'rgba(127, 127, 127, 0.2)' },
    { limit: 0.76, color: '#3284c9', bg: 'rgba(50, 132, 201, 0.2)' },
    { limit: 0.90, color: '#5aca5a', bg: 'rgba(90, 202, 90, 0.2)' },
    { limit: 1.05, color: '#ffca28', bg: 'rgba(255, 202, 40, 0.2)' },
    { limit: 1.19, color: '#ff6924', bg: 'rgba(255, 105, 36, 0.2)' },
    { limit: 99.9, color: '#ff3737', bg: 'rgba(255, 55, 55, 0.2)' }
];

function getZone(power) {
    for (let z of ZONES) if (power < z.limit) return z;
    return ZONES[ZONES.length - 1];
}

// Time Helpers
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
}

function parseTime(input) {
    if (!input) return 0;
    const parts = input.toString().split(':');
    return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseInt(input);
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof Chart !== 'undefined') {
            initChart();
        } else {
            console.warn('Chart.js not loaded');
            document.getElementById('graphContainer').innerHTML = "<div style='padding:20px;text-align:center;color:#666;'>Graph unavailable (offline)</div>";
        }
    } catch (e) {
        console.error("Chart init failed", e);
    }

    // document.getElementById('addBtn').addEventListener('click', showModal); // Removed: Not exists in mobile
    document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', loadFile);
    document.getElementById('saveBtn').addEventListener('click', saveWorkout);

    // Initial Defaults
    // Initial Defaults - Updated to just Warmup 10min
    segments = []; // Ensure empty
    addSegment('Warmup', { duration: 600, power_low: 0.25, power_high: 0.75 });

    try {
        updateUI();

        // Check for URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('segments')) {
            try {
                const segData = JSON.parse(decodeURIComponent(urlParams.get('segments')));
                const name = urlParams.get('name') ? decodeURIComponent(urlParams.get('name')) : 'Imported Workout';
                if (Array.isArray(segData)) {
                    // Load data
                    segments = segData;
                    // Ensure IDs
                    segments.forEach(s => { if (!s.id) s.id = Date.now() + Math.random(); });
                    document.title = name + " - ZWO Editor";
                    // Just a visual cue? Maybe show an alert or just update UI.
                    updateUI();
                    console.log("Loaded workout from URL:", name);
                }
            } catch (e) {
                console.error("Failed to parse URL segments", e);
            }
        }

    } catch (e) {
        console.error("UI update failed", e);
    }
});

function showModal() { document.getElementById('typeModal').style.display = 'flex'; }
function closeModal() { document.getElementById('typeModal').style.display = 'none'; }
function handleAdd(type, defaults = {}) {
    addSegment(type, defaults);
    closeModal();
}

function initChart() {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: [], borderWidth: 0, pointRadius: 0, fill: true, tension: 0, segment: {
                    backgroundColor: c => {
                        const y = (c.p0.parsed.y + c.p1.parsed.y) / 2;
                        return getZone(y).color + 'cc';
                    }
                }
            }]
        },
        options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', display: false },
                y: { display: false, beginAtZero: true, suggestedMax: 1.2 }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function updateUI() {
    renderSegmentsList();
    updateChart();
    updateStats();
}

function calculateTSS() {
    let totalTSS = 0;
    segments.forEach(s => {
        let durationSec = s.duration;
        let intensity = 0;

        if (s.type === 'SteadyState') {
            intensity = s.power; // already fraction of FTP
            totalTSS += (s.duration / 3600) * (intensity * intensity) * 100;
        } else if (s.type === 'IntervalsT') {
            // On segment
            let onTSS = (s.on_duration / 3600) * (s.on_power * s.on_power) * 100;
            // Off segment
            let offTSS = (s.off_duration / 3600) * (s.off_power * s.off_power) * 100;
            totalTSS += (onTSS + offTSS) * s.repeat;
        } else if (s.type === 'IntervalsBlock3') {
            let tss1 = (s.dur1 / 3600) * (s.pwr1 * s.pwr1) * 100;
            let tss2 = (s.dur2 / 3600) * (s.pwr2 * s.pwr2) * 100;
            let tss3 = (s.dur3 / 3600) * (s.pwr3 * s.pwr3) * 100;
            totalTSS += (tss1 + tss2 + tss3) * s.repeat;
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            // Approximate linear ramp TSS: integrate (start + (end-start)*t/T)^2
            // Simplification: use average power for short ramps, or exact formula
            // Exact: (1/3) * (low^2 + low*high + high^2)
            let meanSq = (Math.pow(s.power_low, 2) + s.power_low * s.power_high + Math.pow(s.power_high, 2)) / 3;
            totalTSS += (s.duration / 3600) * meanSq * 100;
        } else {
            // FreeRide etc assuming 0.5 intensity for TSS estimate? or 0
            totalTSS += (s.duration / 3600) * (0.5 * 0.5) * 100;
        }
    });
    return Math.round(totalTSS);
}


function updateStats() {
    let totalSec = 0;
    segments.forEach(s => {
        if (s.type === 'IntervalsT') totalSec += s.repeat * (s.on_duration + s.off_duration);
        else if (s.type === 'IntervalsBlock3') totalSec += s.repeat * (s.dur1 + s.dur2 + s.dur3);
        else totalSec += s.duration;
    });
    document.getElementById('totalDuration').innerText = formatTime(totalSec);
    document.getElementById('totalTSS').innerText = `TSS: ${calculateTSS()}`;
}

function updateChart() {
    const data = [];
    let currentTime = 0;
    segments.forEach(s => {
        if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            data.push({ x: currentTime, y: s.power_low });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power_high });
        } else if (s.type === 'SteadyState') {
            data.push({ x: currentTime, y: s.power });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power });
        } else if (s.type === 'IntervalsT') {
            for (let i = 0; i < s.repeat; i++) {
                data.push({ x: currentTime, y: s.on_power });
                currentTime += s.on_duration;
                data.push({ x: currentTime, y: s.on_power });
                data.push({ x: currentTime, y: s.off_power });
                currentTime += s.off_duration;
                data.push({ x: currentTime, y: s.off_power });
            }
        } else if (s.type === 'IntervalsBlock3') {
            for (let i = 0; i < s.repeat; i++) {
                // Step 1
                data.push({ x: currentTime, y: s.pwr1 });
                currentTime += s.dur1;
                data.push({ x: currentTime, y: s.pwr1 });
                // Step 2
                data.push({ x: currentTime, y: s.pwr2 });
                currentTime += s.dur2;
                data.push({ x: currentTime, y: s.pwr2 });
                // Step 3
                data.push({ x: currentTime, y: s.pwr3 });
                currentTime += s.dur3;
                data.push({ x: currentTime, y: s.pwr3 });
            }
        } else {
            data.push({ x: currentTime, y: 0.5 });
            currentTime += s.duration;
            data.push({ x: currentTime, y: 0.5 });
        }
    });
    if (chart) {
        try {
            chart.data.datasets[0].data = data;
            chart.update();
        } catch (e) {
            console.warn("Chart update failed", e);
        }
    }
}

function addSegment(type, defaults = {}) {
    const base = { id: Date.now() + Math.random(), type, duration: 300 };
    if (type === 'Warmup' || type === 'Ramp') { base.power_low = 0.25; base.power_high = 0.75; }
    else if (type === 'CoolDown') { base.power_low = 0.75; base.power_high = 0.25; }
    else if (type === 'SteadyState') { base.power = 0.85; }
    else if (type === 'IntervalsT') { base.repeat = 5; base.on_duration = 60; base.off_duration = 60; base.on_power = 1.0; base.off_power = 0.5; base.duration = 0; }
    else if (type === 'IntervalsBlock3') {
        base.repeat = 3;
        base.dur1 = 60; base.pwr1 = 0.65;
        base.dur2 = 60; base.pwr2 = 0.85;
        base.dur3 = 60; base.pwr3 = 1.05;
        base.duration = 0;
    }

    segments.push({ ...base, ...defaults });
    updateUI();
}

function removeSegment(id) {
    segments = segments.filter(s => s.id !== id);
    updateUI();
}

function moveSegment(id, dir) {
    const idx = segments.findIndex(s => s.id === id);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx >= 0 && newIdx < segments.length) {
        const temp = segments[idx];
        segments[idx] = segments[newIdx];
        segments[newIdx] = temp;
        updateUI();
    }
}

function updateSegment(id, field, value) {
    const s = segments.find(s => s.id === id);
    if (!s) return;
    if (field.includes('power') || field.includes('pwr')) s[field] = parseFloat(value) / 100;
    else if (field.includes('duration') || field.includes('dur')) s[field] = parseTime(value);
    else s[field] = parseInt(value);
    updateUI();
}

function copySegment(id) {
    const idx = segments.findIndex(s => s.id === id);
    if (idx === -1) return;

    // Deep copy the segment
    const newSegment = JSON.parse(JSON.stringify(segments[idx]));
    newSegment.id = Date.now() + Math.random(); // Assign new ID

    // Append to end
    segments.push(newSegment);
    updateUI();
}

function clearAllSegments() {
    segments = [];
    updateUI();
}

// Touch-friendly Drag and Drop
let touchStartY = 0;
let draggedElement = null;
let initialIdx = -1;

function handleTouchStart(e) {
    // Only allow drag if touching the handle specifically (the "hamburger" icon)
    // We assume the handle has a class 'drag-handle' or 'segment-header' BUT user asked for "three lines mark"
    if (!e.target.closest('.drag-handle-icon')) return;

    // Find the draggable segment item
    draggedElement = e.currentTarget.closest('.segment-item');
    if (!draggedElement) return;

    const touch = e.touches[0];
    touchStartY = touch.clientY;
    initialIdx = parseInt(draggedElement.dataset.index);

    // Add a slight delay to distinguish from scroll
    draggedElement.style.transition = 'none';
    draggedElement.style.opacity = '0.7';
    draggedElement.style.zIndex = '1000';

    // Prevent scrolling while dragging
    document.body.style.overflow = 'hidden';
}

function handleTouchMove(e) {
    if (!draggedElement) return;
    const touch = e.touches[0];
    const diff = touch.clientY - touchStartY;

    // Always prevent default scrolling when dragging is active
    if (e.cancelable) e.preventDefault();

    draggedElement.style.transform = `translateY(${diff}px)`;

    const elements = Array.from(document.querySelectorAll('.segment-item'));
    const target = elements.find(el => {
        if (el === draggedElement) return false;
        const rect = el.getBoundingClientRect();
        return touch.clientY > rect.top && touch.clientY < rect.bottom;
    });

    if (target) {
        const targetIdx = parseInt(target.dataset.index);
        if (targetIdx !== initialIdx) {
            const item = segments.splice(initialIdx, 1)[0];
            segments.splice(targetIdx, 0, item);
            initialIdx = targetIdx;
            renderSegmentsList();
            // Re-bind dragged element
            draggedElement = document.querySelector(`[data-id="${item.id}"]`);
            if (draggedElement) {
                draggedElement.style.opacity = '0.7';
                draggedElement.style.zIndex = '1000';
                draggedElement.style.transform = `translateY(${diff}px)`; // Keep following finger
            }
            touchStartY = touch.clientY - diff; // Adjust reference to keep relative position smooth
        }
    }
}

function handleTouchEnd(e) {
    if (!draggedElement) return;
    draggedElement.style.opacity = '1';
    draggedElement.style.transform = '';
    draggedElement.style.zIndex = '';
    draggedElement = null;
    document.body.style.overflow = ''; // Restore scrolling
    updateUI();
}

// Helper to get background color string
function getZoneBg(power) {
    const zone = getZone(power);
    // Use opacity 0.2 for background
    return zone.bg; // ZONES already has rgba(..., 0.2)
}

function renderSegmentsList() {
    const list = document.getElementById('segmentsList');
    list.innerHTML = '';
    segments.forEach((s, index) => {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.dataset.id = s.id;
        div.dataset.index = index;

        // Default Border Color
        div.style.borderLeftColor = getZone(s.power || s.power_high || 0.5).color;

        // Custom Background for Gradients
        if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            const startBg = getZoneBg(s.power_low);
            const endBg = getZoneBg(s.power_high);
            // Use linear-gradient, but we need to keep the border-left visible or consistent?
            // Mobile style relies on border-left. Let's keep border-left but add gradient to background.
            div.style.background = `linear-gradient(90deg, ${startBg}, ${endBg})`;
        } else if (s.type === 'IntervalsBlock3') {
            // Let's add gradient for Block3 too as a bonus/consistency if applicable, or keep it simple
            // User asked for Ramp types specifically.
        }

        // Helper for horizontal input group
        const mkInput = (label, val, field, type = 'number', unit = '') => `
            <div class="seg-input-group">
                <label>${label}</label>
                <input type="${type}" value="${val}" onchange="updateSegment(${s.id}, '${field}', this.value)">
                ${unit ? `<span class="unit-label">${unit}</span>` : ''}
            </div>`;

        let inputs = '';
        if (s.type === 'SteadyState') {
            inputs += mkInput('Dur', formatTime(s.duration), 'duration', 'text');
            inputs += mkInput('PWR', Math.round(s.power * 100), 'power', 'number', '%');
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            inputs += mkInput('Dur', formatTime(s.duration), 'duration', 'text');
            inputs += mkInput('Start', Math.round(s.power_low * 100), 'power_low', 'number', '%');
            inputs += mkInput('End', Math.round(s.power_high * 100), 'power_high', 'number', '%');
        } else if (s.type === 'IntervalsT') {
            inputs += mkInput('Reps', s.repeat, 'repeat');
            inputs += mkInput('On', formatTime(s.on_duration), 'on_duration', 'text');
            inputs += mkInput('Pwr', Math.round(s.on_power * 100), 'on_power', 'number', '%');
            inputs += mkInput('Off', formatTime(s.off_duration), 'off_duration', 'text');
            inputs += mkInput('Pwr', Math.round(s.off_power * 100), 'off_power', 'number', '%');
        } else if (s.type === 'IntervalsBlock3') {
            inputs += mkInput('Reps', s.repeat, 'repeat', 'number');
            inputs += `<div style="width:100%; height:1px; background:#444; margin:4px 0;"></div>`;
            inputs += mkInput('D1', formatTime(s.dur1), 'dur1', 'text');
            inputs += mkInput('P1', Math.round(s.pwr1 * 100), 'pwr1', 'number', '%');
            inputs += `<div style="flex-basis:100%"></div>`;
            inputs += mkInput('D2', formatTime(s.dur2), 'dur2', 'text');
            inputs += mkInput('P2', Math.round(s.pwr2 * 100), 'pwr2', 'number', '%');
            inputs += `<div style="flex-basis:100%"></div>`;
            inputs += mkInput('D3', formatTime(s.dur3), 'dur3', 'text');
            inputs += mkInput('P3', Math.round(s.pwr3 * 100), 'pwr3', 'number', '%');
        }

        let labelType = s.type;
        if (s.type === 'SteadyState') {
            const z = getZone(s.power);
            // Infer Zone Number from index in ZONES array
            const zIdx = ZONES.indexOf(z) + 1;
            labelType = `Zone ${zIdx}`;
        }

        div.innerHTML = `
            <div class="segment-header">
                <span class="segment-type" style="display:flex; align-items:center;">
                    <!-- Drag Handle Icon -->
                    <span class="drag-handle-icon" style="margin-right:8px; color:#666; font-size:1.4rem; padding:0 10px 0 0; touch-action:none;">☰</span>
                    ${labelType}
                </span>
                <div class="segment-actions">
                    <button class="btn-icon" onclick="moveSegment(${s.id}, -1)">▲</button>
                    <button class="btn-icon" onclick="moveSegment(${s.id}, 1)">▼</button>
                    <button class="btn-icon" onclick="copySegment(${s.id})" title="Duplicate">❐</button>
                    <button class="btn-icon" onclick="removeSegment(${s.id})">✕</button>
                </div>
            </div>
            <div class="segment-details">${inputs}</div>
        `;
        list.appendChild(div);

        // Attach touch listeners to the HEADER (which contains the handle)
        // Note: The handleTouchStart will now filter for .drag-handle-icon
        const header = div.querySelector('.segment-header');
        header.addEventListener('touchstart', handleTouchStart, { passive: false });
        header.addEventListener('touchmove', handleTouchMove, { passive: false });
        header.addEventListener('touchend', handleTouchEnd);
    });
}

// ZWO Generation (Simplified for Mobile)
// ZWO Generation (Refactored)
function generateZWO(workout) {
    const name = workout.name || "Mobile Workout";
    const author = workout.author || "Zwifter";
    const description = workout.description || "";

    let xml = `<?xml version="1.0" encoding="UTF-8"?><workout_file>\n`;
    xml += `<author>${author}</author>\n`;
    xml += `<name>${name}</name>\n`;
    xml += `<description>${description}</description>\n`;
    xml += `<sportType>bike</sportType>\n`;
    xml += `<workout>\n`;

    workout.segments.forEach(s => {
        if (s.type === 'SteadyState') xml += `<SteadyState Duration="${s.duration}" Power="${s.power}"/>\n`;
        else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) xml += `<${s.type} Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>\n`;
        else if (s.type === 'IntervalsT') xml += `<IntervalsT Repeat="${s.repeat}" OnDuration="${s.on_duration}" OffDuration="${s.off_duration}" OnPower="${s.on_power}" OffPower="${s.off_power}"/>\n`;
        else if (s.type === 'IntervalsBlock3') {
            for (let i = 0; i < s.repeat; i++) {
                xml += `<SteadyState Duration="${s.dur1}" Power="${s.pwr1}"/>\n`;
                xml += `<SteadyState Duration="${s.dur2}" Power="${s.pwr2}"/>\n`;
                xml += `<SteadyState Duration="${s.dur3}" Power="${s.pwr3}"/>\n`;
            }
        }
    });
    xml += `</workout></workout_file>`;
    return xml;
}

function triggerDownload(xml, filename) {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Append for Firefox support
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function saveWorkout() {
    const workout = {
        name: "Mobile Workout",
        segments: segments
    };
    const xml = generateZWO(workout);
    triggerDownload(xml, "workout.zwo");
}

function downloadLibraryWorkout(id) {
    const item = STATIC_WORKOUTS.find(w => w.id == id);
    if (!item) return;

    const xml = generateZWO(item);
    const filename = `${item.name.replace(/[^a-z0-9]/gi, '_')}.zwo`;
    triggerDownload(xml, filename);
}




function loadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        // Simple regex parsing for ZWO (very basic support)
        // ... (Skipping full parser implementation to keep it simple as per previous instruction/stub status)
        alert("File loading not fully implemented in this mobile demo yet. Please use the Library.");
    };
    reader.readAsText(file);
}

// --- Workout Library (Static) ---

function openLibrary() {
    document.getElementById('libraryModal').style.display = 'flex';
    renderLibrary();
}

function closeLibrary() {
    document.getElementById('libraryModal').style.display = 'none';
}

function loadFromLibrary(id) {
    const entry = STATIC_WORKOUTS.find(item => item.id == id); // Loose equality for consistency
    if (entry) {
        // Restore segments
        segments = JSON.parse(JSON.stringify(entry.segments));
        segments.forEach(s => s.id = Date.now() + Math.random());
        updateUI();
        closeLibrary();
    }
}

function renderLibrary() {
    const list = document.getElementById('libraryList');
    list.innerHTML = '';

    if (typeof STATIC_WORKOUTS === 'undefined' || STATIC_WORKOUTS.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No workouts found in workouts.js</div>';
        return;
    }

    STATIC_WORKOUTS.forEach(item => {
        const div = document.createElement('div');
        div.className = 'lib-item';
        // Calculate basic stats for display if not present
        const segCount = item.segments ? item.segments.length : 0;
        div.innerHTML = `
            <div class="lib-info">
                <div class="lib-name">${item.name}</div>
                <div class="lib-date">${item.description || ''} • ${segCount} segments</div>
            </div>
            <div class="lib-actions">
                <button class="lib-btn lib-load" onclick="loadFromLibrary('${item.id}')">Load</button>
                <button class="lib-btn lib-dl" onclick="downloadLibraryWorkout('${item.id}')" style="background:#444; margin-left:5px;">DL</button>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- Recommendation System Integration ---

function openRecModal() {
    document.getElementById('recommendModal').style.display = 'flex';
    // Run default recommendation on open
    runRecommendation();
}

function closeRecModal() {
    document.getElementById('recommendModal').style.display = 'none';
}

function runRecommendation() {
    const objective = document.getElementById('recObjective').value;
    const maxDuration = parseInt(document.getElementById('recDuration').value);
    const sourceInputs = document.getElementsByName('recSource');
    let source = 'All';
    for (let input of sourceInputs) {
        if (input.checked) source = input.value;
    }

    const results = Recommender.recommend({
        objective: objective,
        maxDuration: maxDuration,
        source: source
    });

    renderRecResults(results);
}

function renderRecResults(results) {
    const container = document.getElementById('recResults');
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No workouts found matching criteria</div>';
        return;
    }

    results.forEach(w => {
        const div = document.createElement('div');
        div.className = 'lib-item'; // Reuse library styling
        // Tag badges
        const tagsHtml = w.tags.map(t => `<span style="background:#444; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-right:4px;">${t}</span>`).join('');

        div.innerHTML = `
            <div class="lib-info">
                <div class="lib-name">${w.name} <span style="font-size:0.8rem; color:var(--accent-color);">(${w.source})</span></div>
                <div class="lib-date">⏱ ${Math.round(w.durationSec / 60)}m • TSS: ${w.tss}</div>
                <div style="margin-top:4px; font-size:0.85rem; color:#ccc;">${w.description}</div>
                <div style="margin-top:6px;">${tagsHtml}</div>
            </div>
            <div class="lib-actions">
                <button class="lib-btn lib-load" onclick="loadRecommendedWorkout('${w.id}')">Load</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function loadRecommendedWorkout(id) {
    const workout = BUILT_IN_WORKOUTS.find(w => w.id === id);
    if (!workout) return;

    // Deep copy segments
    segments = JSON.parse(JSON.stringify(workout.segments));
    // Add IDs
    segments.forEach(s => s.id = Date.now() + Math.random());

    updateUI();
    closeRecModal();
}
