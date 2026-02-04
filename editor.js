let chart;
let segments = [];
let dragSrcEl = null;

// Zwift Power Zones (approximate)
const ZONES = [
    { limit: 0.60, color: '#7f7f7f', bg: 'rgba(127, 127, 127, 0.8)' }, // Z1 Gray
    { limit: 0.76, color: '#3284c9', bg: 'rgba(50, 132, 201, 0.8)' },  // Z2 Blue
    { limit: 0.90, color: '#5aca5a', bg: 'rgba(90, 202, 90, 0.8)' },   // Z3 Green
    { limit: 1.05, color: '#ffca28', bg: 'rgba(255, 202, 40, 0.8)' },  // Z4 Yellow
    { limit: 1.19, color: '#ff6924', bg: 'rgba(255, 105, 36, 0.8)' },  // Z5 Orange
    { limit: 99.9, color: '#ff3737', bg: 'rgba(255, 55, 55, 0.8)' }    // Z6 Red
];

function getZone(power) {
    for (let z of ZONES) {
        if (power < z.limit) return z;
    }
    return ZONES[ZONES.length - 1];
}

// Helper to get background color string
function getZoneBg(power) {
    const zone = getZone(power);
    // Use opacity 0.2 for background
    return zone.bg.replace('0.8)', '0.2)');
}

function getZoneColor(power) {
    return getZone(power).color;
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
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else {
        return parseInt(input);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();

    document.getElementById('saveBtn').addEventListener('click', saveWorkout);
    document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', loadFile);

    // Add initial dummy segment (Warmup 10min only)
    addSegment('Warmup', { duration: 600, power_low: 0.25, power_high: 0.75 });
    updateUI();
});

function initChart() {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Power Profile',
                data: [],
                borderWidth: 0,
                pointRadius: 0,
                fill: true,
                tension: 0,
                segment: {
                    backgroundColor: c => {
                        const p0 = c.p0;
                        const p1 = c.p1;
                        const y0 = p0.parsed.y;
                        const y1 = p1.parsed.y;

                        // Safety check for pixels
                        if (!p0.x || !p1.x) {
                            return getZone((y0 + y1) / 2).bg;
                        }

                        // Create Gradient
                        const gradient = ctx.createLinearGradient(p0.x, 0, p1.x, 0);
                        gradient.addColorStop(0, getZone(y0).bg);
                        gradient.addColorStop(1, getZone(y1).bg);
                        return gradient;
                    }
                }
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'Time (min)', color: '#aaa' },
                    ticks: { color: '#aaa' },
                    grid: { color: '#333' }
                },
                y: {
                    title: { display: true, text: 'Power (% FTP)', color: '#aaa' },
                    ticks: {
                        color: '#aaa',
                        callback: function (value) { return Math.round(value * 100) + '%'; }
                    },
                    grid: { color: '#333' },
                    beginAtZero: true,
                    suggestedMax: 1.5
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return Math.round(context.parsed.y * 100) + '% FTP';
                        }
                    }
                }
            }
        }
    });
}

function updateUI() {
    renderSegmentsList();
    updateChart();
    updateStats();
}

function updateStats() {
    let totalSec = 0;
    segments.forEach(s => {
        if (s.type === 'IntervalsT') {
            totalSec += s.repeat * (s.on_duration + s.off_duration);
        } else if (s.type === 'IntervalsBlock3') {
            totalSec += s.repeat * (s.dur1 + s.dur2 + s.dur3);
        } else {
            totalSec += s.duration;
        }
    });

    const hours = Math.floor(totalSec / 3600);
    const min = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;

    let timeStr = "";
    if (hours > 0) {
        timeStr = `${hours}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    } else {
        timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    document.getElementById('totalDuration').innerText = timeStr;
    const tss = calculateTSS();
    const tssElem = document.getElementById('totalTSS');
    if (tssElem) tssElem.innerText = tss;
}

function updateChart() {
    const data = [];
    let currentTime = 0;

    segments.forEach(s => {
        if (s.type === 'Warmup' || s.type === 'CoolDown' || s.type === 'Ramp') {
            data.push({ x: currentTime / 60, y: s.power_low });
            currentTime += s.duration;
            data.push({ x: currentTime / 60, y: s.power_high });
        } else if (s.type === 'SteadyState') {
            data.push({ x: currentTime / 60, y: s.power });
            currentTime += s.duration;
            data.push({ x: currentTime / 60, y: s.power });
        } else if (s.type === 'IntervalsT') {
            for (let i = 0; i < s.repeat; i++) {
                // On
                data.push({ x: currentTime / 60, y: s.on_power });
                currentTime += s.on_duration;
                data.push({ x: currentTime / 60, y: s.on_power });
                data.push({ x: currentTime / 60, y: s.off_power });
                currentTime += s.off_duration;
                data.push({ x: currentTime / 60, y: s.off_power });
            }
        } else if (s.type === 'IntervalsBlock3') {
            for (let i = 0; i < s.repeat; i++) {
                // Step 1
                data.push({ x: currentTime / 60, y: s.pwr1 });
                currentTime += s.dur1;
                data.push({ x: currentTime / 60, y: s.pwr1 });
                // Step 2
                data.push({ x: currentTime / 60, y: s.pwr2 });
                currentTime += s.dur2;
                data.push({ x: currentTime / 60, y: s.pwr2 });
                // Step 3
                data.push({ x: currentTime / 60, y: s.pwr3 });
                currentTime += s.dur3;
                data.push({ x: currentTime / 60, y: s.pwr3 });
            }
        } else if (s.type === 'FreeRide') {
            data.push({ x: currentTime / 60, y: 0.5 });
            currentTime += s.duration;
            data.push({ x: currentTime / 60, y: 0.5 });
        } else {
            data.push({ x: currentTime / 60, y: 0.5 });
            currentTime += s.duration;
            data.push({ x: currentTime / 60, y: 0.5 });
        }
    });

    chart.data.datasets[0].data = data;
    chart.update();
}

function addSegment(type, defaults = {}) {
    const base = {
        id: Date.now() + Math.random(),
        type: type,
        duration: 300,
        text: ""
    };

    if (type === 'Warmup' || type === 'Ramp') {
        base.power_low = 0.25;
        base.power_high = 0.75;
    } else if (type === 'CoolDown') {
        base.power_low = 0.75;
        base.power_high = 0.25;
    } else if (type === 'SteadyState') {
        base.power = 0.75;
    } else if (type === 'IntervalsT') {
        base.repeat = 5;
        base.on_duration = 60;
        base.off_duration = 60;
        base.on_power = 1.0;
        base.off_power = 0.5;
        base.duration = 0;
    } else if (type === 'IntervalsBlock3') {
        base.repeat = 3;
        base.dur1 = 60; base.pwr1 = 0.65;
        base.dur2 = 60; base.pwr2 = 0.85;
        base.dur3 = 60; base.pwr3 = 1.05;
        base.duration = 0;
    } else if (type === 'FreeRide') {
        base.duration = 600;
    }

    const newSegment = { ...base, ...defaults, id: Date.now() + Math.random() };
    segments.push(newSegment);
    updateUI();
}

function duplicateSegment(id) {
    const idx = segments.findIndex(s => s.id === id);
    if (idx !== -1) {
        const original = segments[idx];
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = Date.now() + Math.random();
        segments.splice(idx + 1, 0, copy);
        updateUI();
    }
}

function removeSegment(id) {
    segments = segments.filter(s => s.id !== id);
    updateUI();
}

function updateSegment(id, field, value) {
    const s = segments.find(s => s.id === id);
    if (s) {
        if (field.includes('power')) {
            s[field] = parseFloat(value) / 100.0;
        } else if (field === 'duration' || field === 'on_duration' || field === 'off_duration') {
            s[field] = parseTime(value);
        } else {
            s[field] = parseFloat(value);
        }
        updateUI();
    }
}

function renderSegmentsList() {
    const list = document.getElementById('segmentsList');
    list.innerHTML = '';

    segments.forEach((s, index) => {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.setAttribute('draggable', 'true');
        div.dataset.id = s.id;
        div.dataset.index = index;

        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragenter', handleDragEnter);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('dragleave', handleDragLeave);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        let inputs = '';
        const toPct = (val) => Math.round((val || 0) * 100);

        // Determine Card Background Style
        let cardStyle = '';
        if (s.type === 'SteadyState') {
            cardStyle = `background-color: ${getZoneBg(s.power)}; border-color: ${getZoneColor(s.power)};`;
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            const startBg = getZoneBg(s.power_low);
            const endBg = getZoneBg(s.power_high);
            cardStyle = `background: linear-gradient(90deg, ${startBg}, ${endBg}); border-color: ${getZoneColor((s.power_low + s.power_high) / 2)};`;
        } else if (s.type === 'IntervalsT') {
            cardStyle = `background-color: ${getZoneBg(s.on_power)}; border-color: ${getZoneColor(s.on_power)};`;
        } else if (s.type === 'FreeRide') {
            cardStyle = `background-color: #333; border-color: #555;`;
        }

        div.style = cardStyle;

        const inputStyle = 'background-color: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white;';
        const selectOnClick = 'onclick="this.select()"'; // Added select on click

        // Duration Input
        if (s.type !== 'IntervalsT') {
            inputs += `
                <div class="seg-input-group">
                    <label>Dur</label>
                    <input type="text" value="${formatTime(s.duration)}" 
                           style="${inputStyle}" ${selectOnClick}
                           onchange="updateSegment(${s.id}, 'duration', this.value)">
                </div>
             `;
        }

        if (s.type === 'SteadyState') {
            inputs += `
                <div class="seg-input-group">
                    <label>Power(%)</label>
                    <input type="number" value="${toPct(s.power)}" 
                           style="${inputStyle}" ${selectOnClick}
                           onchange="updateSegment(${s.id}, 'power', this.value)">
                </div>
            `;
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            inputs += `
                <div class="seg-input-group">
                    <label>Start(%)</label>
                    <input type="number" value="${toPct(s.power_low)}" 
                           style="${inputStyle}" ${selectOnClick}
                           onchange="updateSegment(${s.id}, 'power_low', this.value)">
                </div>
                <div class="seg-input-group">
                    <label>End(%)</label>
                    <input type="number" value="${toPct(s.power_high)}" 
                           style="${inputStyle}" ${selectOnClick}
                           onchange="updateSegment(${s.id}, 'power_high', this.value)">
                </div>
            `;
        } else if (s.type === 'IntervalsT') {
            inputs += `
                <div class="seg-input-group"><label>Reps</label><input type="number" value="${s.repeat}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'repeat', this.value)"></div>
                <div class="seg-input-group"><label>On</label><input type="text" value="${formatTime(s.on_duration)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'on_duration', this.value)"></div>
                <div class="seg-input-group"><label>On(%)</label><input type="number" value="${toPct(s.on_power)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'on_power', this.value)"></div>
                <div class="seg-input-group"><label>Off</label><input type="text" value="${formatTime(s.off_duration)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'off_duration', this.value)"></div>
                <div class="seg-input-group"><label>Off(%)</label><input type="number" value="${toPct(s.off_power)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'off_power', this.value)"></div>
            `;
        } else if (s.type === 'IntervalsBlock3') {
            cardStyle = `background: linear-gradient(90deg, ${getZoneBg(s.pwr1)}, ${getZoneBg(s.pwr2)}, ${getZoneBg(s.pwr3)}); border-color: ${getZoneColor(s.pwr2)};`;
            inputs += `
                <div class="seg-input-group"><label>Reps</label><input type="number" value="${s.repeat}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'repeat', this.value)"></div>
                <div style="width:100%; height:1px; background:rgba(255,255,255,0.1); margin:5px 0;"></div>
                <div class="seg-input-group"><label>D1</label><input type="text" value="${formatTime(s.dur1)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'dur1', this.value)"></div>
                <div class="seg-input-group"><label>P1(%)</label><input type="number" value="${toPct(s.pwr1)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'pwr1', this.value)"></div>
                <div class="seg-input-group"><label>D2</label><input type="text" value="${formatTime(s.dur2)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'dur2', this.value)"></div>
                <div class="seg-input-group"><label>P2(%)</label><input type="number" value="${toPct(s.pwr2)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'pwr2', this.value)"></div>
                <div class="seg-input-group"><label>D3</label><input type="text" value="${formatTime(s.dur3)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'dur3', this.value)"></div>
                <div class="seg-input-group"><label>P3(%)</label><input type="number" value="${toPct(s.pwr3)}" style="${inputStyle}" ${selectOnClick} onchange="updateSegment(${s.id}, 'pwr3', this.value)"></div>
            `;
        }

        // Apply card style if modified inside the block
        if (s.type === 'IntervalsBlock3') div.style = cardStyle;

        div.innerHTML = `
            <div class="drag-handle" title="Drag to reorder" style="color: rgba(255,255,255,0.7);">☰</div>
            <div class="segment-content-wrapper">
                <div class="segment-header">
                    <span class="segment-type" style="color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
                        ${s.type === 'SteadyState' ? `Zone ${ZONES.indexOf(getZone(s.power)) + 1}` : s.type}
                    </span>
                    <div class="segment-actions">
                         <button class="btn-icon" onclick="duplicateSegment(${s.id})" title="Duplicate">❐</button>
                         <button class="btn-icon btn-remove" onclick="removeSegment(${s.id})" title="Remove" style="color:white; opacity:0.8;">&times;</button>
                    </div>
                </div>
                <div class="segment-details">${inputs}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

// Drag functionality
function handleDragStart(e) {
    this.style.opacity = '0.4';
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (dragSrcEl !== this) {
        const srcIdx = parseInt(dragSrcEl.dataset.index);
        const destIdx = parseInt(this.dataset.index);

        const item = segments[srcIdx];
        segments.splice(srcIdx, 1);
        segments.splice(destIdx, 0, item);

        updateUI();
    }
    return false;
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    const items = document.querySelectorAll('.segment-item');
    items.forEach(item => {
        item.classList.remove('over');
    });
}


// API Interactions
// --- XML Generation and Parsing Logic (Client-Side)// ZWO Generation
function generateZWO(workout) {
    // Normalize metadata: Handle both flat structure (Static) and nested metadata (Temp Save)
    const meta = workout.metadata || {
        name: workout.name || "Untitled Workout",
        author: workout.author || "Zwifter",
        description: workout.description || "",
        sport_type: "bike",
        tags: workout.tags || []
    };

    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
    xml += `<workout_file>\n`;
    xml += `    <author>${escapeXml(meta.author)}</author>\n`;
    xml += `    <name>${escapeXml(meta.name)}</name>\n`;
    xml += `    <description>${escapeXml(meta.description)}</description>\n`;
    xml += `    <sportType>${escapeXml(meta.sport_type || 'bike')}</sportType>\n`;
    xml += `    <tags>\n`;
    if (meta.tags && Array.isArray(meta.tags)) {
        meta.tags.forEach(tag => {
            if (tag.trim()) xml += `        <tag name="${escapeXml(tag.trim())}"/>\n`;
        });
    }
    xml += `    </tags>\n`;
    xml += `    <workout>\n`;

    workout.segments.forEach(s => {
        if (s.type === 'SteadyState') {
            xml += `        <SteadyState Duration="${s.duration}" Power="${s.power}"/>\n`;
        } else if (s.type === 'Warmup') {
            xml += `        <Warmup Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>\n`;
        } else if (s.type === 'CoolDown') {
            xml += `        <CoolDown Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>\n`;
        } else if (s.type === 'Ramp') {
            xml += `        <Ramp Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>\n`;
        } else if (s.type === 'IntervalsT') {
            xml += `        <IntervalsT Repeat="${s.repeat}" OnDuration="${s.on_duration}" OffDuration="${s.off_duration}" OnPower="${s.on_power}" OffPower="${s.off_power}"/>\n`;
        } else if (s.type === 'IntervalsBlock3') {
            for (let i = 0; i < s.repeat; i++) {
                xml += `        <SteadyState Duration="${s.dur1}" Power="${s.pwr1}"/>\n`;
                xml += `        <SteadyState Duration="${s.dur2}" Power="${s.pwr2}"/>\n`;
                xml += `        <SteadyState Duration="${s.dur3}" Power="${s.pwr3}"/>\n`;
            }
        } else if (s.type === 'FreeRide') {
            xml += `        <FreeRide Duration="${s.duration}"/>\n`;
        } else if (s.type === 'MaxEffort') {
            xml += `        <MaxEffort Duration="${s.duration}"/>\n`;
        }
    });

    xml += `    </workout>\n`;
    xml += `</workout_file>`;
    return xml;
}

function parseZWO(xmlContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

    // Metadata
    const getName = (tag) => xmlDoc.getElementsByTagName(tag)[0]?.textContent || "";
    const metadata = {
        name: getName("name") || "Unknown Workout",
        author: getName("author"),
        description: getName("description"),
        sport_type: getName("sportType") || "bike",
        tags: []
    };

    const tagElems = xmlDoc.getElementsByTagName("tag");
    for (let i = 0; i < tagElems.length; i++) {
        const name = tagElems[i].getAttribute("name");
        if (name) metadata.tags.push(name);
    }

    // Segments
    const segmentsList = [];
    const workoutElem = xmlDoc.getElementsByTagName("workout")[0];

    if (workoutElem) {
        for (let i = 0; i < workoutElem.children.length; i++) {
            const child = workoutElem.children[i];
            const type = child.tagName;
            const attr = (name) => child.getAttribute(name);
            const parseFloatOrZero = (val) => parseFloat(val) || 0;
            const parseIntOrZero = (val) => parseInt(val) || 0;

            let segment = {
                type: type,
                duration: parseIntOrZero(attr("Duration"))
            };

            if (type === 'Warmup' || type === 'CoolDown' || type === 'Ramp') {
                segment.power_low = parseFloatOrZero(attr("PowerLow"));
                segment.power_high = parseFloatOrZero(attr("PowerHigh"));
            } else if (type === 'SteadyState') {
                segment.power = parseFloatOrZero(attr("Power"));
            } else if (type === 'IntervalsT') {
                segment.repeat = parseIntOrZero(attr("Repeat"));
                segment.on_duration = parseIntOrZero(attr("OnDuration"));
                segment.off_duration = parseIntOrZero(attr("OffDuration"));
                segment.on_power = parseFloatOrZero(attr("OnPower"));
                segment.off_power = parseFloatOrZero(attr("OffPower"));
                // Calc total duration for intervals
                segment.duration = segment.repeat * (segment.on_duration + segment.off_duration);
            }
            // FreeRide / MaxEffort just take duration, which is already set

            segmentsList.push(segment);
        }
    }

    return { metadata, segments: segmentsList };
}

function escapeXml(unsafe) {
    if (!unsafe) return "";
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}


// --- API Interactions Replacement ---

function triggerDownload(xml, filename) {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function saveWorkout() {
    const workout = {
        metadata: {
            name: document.getElementById('workoutName').value || "My Workout",
            author: document.getElementById('workoutAuthor').value || "Zwifter",
            description: document.getElementById('workoutDesc').value || "",
            tags: document.getElementById('workoutTags').value.split(',').map(t => t.trim()).filter(Boolean),
            sport_type: 'bike'
        },
        segments: segments
    };

    try {
        const xmlContent = generateZWO(workout);
        const filename = `${workout.metadata.name.replace(/\s+/g, '_')}.zwo`;
        triggerDownload(xmlContent, filename);
    } catch (e) {
        console.error("Error generating ZWO:", e);
        alert("Failed to generate ZWO file.");
    }
}

function downloadLibraryWorkout(id) {
    let item = null;

    // Check if ID is string and starts with tmp_
    if (String(id).startsWith('tmp_')) {
        const lib = getTempSaves();
        item = lib.find(i => i.id === id);
    } else {
        if (typeof STATIC_WORKOUTS !== 'undefined') {
            item = STATIC_WORKOUTS.find(i => i.id == id);
        }
    }

    if (!item) return;

    // Construct workout object expected by generateZWO
    // Saved items have { metadata: {...}, segments: [...] } matching structure
    try {
        const xml = generateZWO(item);
        const filename = `${(item.name || "workout").replace(/\s+/g, '_')}.zwo`;
        triggerDownload(xml, filename);
    } catch (e) {
        console.error("Error downloading from library:", e);
        alert("Failed to download workout.");
    }
}


function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const content = e.target.result;
            const data = parseZWO(content);

            document.getElementById('workoutName').value = data.metadata.name;
            document.getElementById('workoutAuthor').value = data.metadata.author;
            document.getElementById('workoutDesc').value = data.metadata.description || "";
            document.getElementById('workoutTags').value = data.metadata.tags.join(', ');

            segments = data.segments.map(s => ({ ...s, id: Date.now() + Math.random() }));
            updateUI();
        } catch (err) {
            console.error(err);
            alert("Failed to parse ZWO file.");
        }
    };
    reader.readAsText(file);
}

// --- TSS Calculation ---
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
            // Simplification: use average power for short ramps
            let meanSq = (Math.pow(s.power_low, 2) + s.power_low * s.power_high + Math.pow(s.power_high, 2)) / 3;
            totalTSS += (s.duration / 3600) * meanSq * 100;
        } else {
            // FreeRide etc
            totalTSS += (s.duration / 3600) * (0.5 * 0.5) * 100;
        }
    });
    return Math.round(totalTSS);
}


// --- Workout Library & Temp Save ---

function openLibrary() {
    document.getElementById('libraryModal').style.display = 'flex';
    // Pre-fill name if exists for temp save context (though now handled by specific button)
    document.getElementById('libSaveName').value = document.getElementById('workoutName').value;
    renderLibrary();
}

function closeLibrary() {
    document.getElementById('libraryModal').style.display = 'none';
}

// Temp Save (LocalStorage)
function getTempSaves() {
    // Migrating or using new key? Let's use 'zwo_temp_saves'
    const data = localStorage.getItem('zwo_temp_saves');
    return data ? JSON.parse(data) : [];
}

function tempSave() {
    const nameInput = document.getElementById('workoutName'); // Use main title
    const name = nameInput.value.trim() || 'Untitled Workout';

    if (segments.length === 0) { alert('Workout is empty! nothing to save.'); return; }

    const lib = getTempSaves();

    // Capture full metadata
    const metadata = {
        name: document.getElementById('workoutName').value,
        author: document.getElementById('workoutAuthor').value,
        description: document.getElementById('workoutDesc').value,
        tags: document.getElementById('workoutTags').value
    };

    const newEntry = {
        id: 'tmp_' + Date.now(), // Prefix to distinguish from static
        name: name,
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
        segments: segments,
        metadata: metadata,
        source: 'local'
    };

    lib.unshift(newEntry);
    localStorage.setItem('zwo_temp_saves', JSON.stringify(lib));

    alert('Saved to Temp Storage!');
    // If library modal is open, refresh it. If not, maybe just alert is fine?
    // User clicked "Temp Save" button on header, so modal might not be open.
}

function deleteTempSave(id) {
    if (!confirm('Delete this temp save?')) return;
    let lib = getTempSaves();
    lib = lib.filter(item => item.id !== id);
    localStorage.setItem('zwo_temp_saves', JSON.stringify(lib));
    renderLibrary();
}

function loadLibraryItem(id) {
    let entry = null;

    // Check if ID is string and starts with tmp_
    if (String(id).startsWith('tmp_')) {
        const lib = getTempSaves();
        entry = lib.find(item => item.id === id);
    } else {
        // Static
        if (typeof STATIC_WORKOUTS !== 'undefined') {
            entry = STATIC_WORKOUTS.find(item => item.id == id);
        }
    }

    if (entry) {
        if (confirm(`Load "${entry.name}"? Unsaved changes will be lost.`)) {
            // Restore segments
            segments = JSON.parse(JSON.stringify(entry.segments));
            // New random IDs for segments
            segments.forEach(s => s.id = Date.now() + Math.random());

            // Restore Metadata
            if (entry.metadata) {
                document.getElementById('workoutName').value = entry.metadata.name || entry.name;
                document.getElementById('workoutAuthor').value = entry.metadata.author || "Zwifter";
                document.getElementById('workoutDesc').value = entry.metadata.description || "";
                document.getElementById('workoutTags').value = entry.metadata.tags || "";
            } else {
                // Static workouts might not have full metadata obj, use root props
                document.getElementById('workoutName').value = entry.name;
                document.getElementById('workoutAuthor').value = "Zwifter"; // Default
                document.getElementById('workoutDesc').value = entry.description || "";
                document.getElementById('workoutTags').value = (entry.tags || []).join(', ');
            }

            updateUI();
            closeLibrary();
        }
    }
}

function renderLibrary() {
    const list = document.getElementById('libraryList');
    list.innerHTML = '';

    // 1. Temp Saves Section
    const tempSaves = getTempSaves();
    if (tempSaves.length > 0) {
        const header = document.createElement('h4');
        header.style.color = '#888';
        header.style.marginTop = '0';
        header.textContent = 'Temp Saved (Local)';
        list.appendChild(header);

        tempSaves.forEach(item => {
            const div = document.createElement('div');
            div.className = 'lib-item';
            div.innerHTML = `
                <div class="lib-info">
                    <div class="lib-name">${item.name}</div>
                    <div class="lib-date">${item.date} • ${item.segments.length} segs</div>
                </div>
                <div class="lib-actions">
                    <button class="lib-btn lib-load" onclick="loadLibraryItem('${item.id}')">Load</button>
                    <button class="lib-btn lib-dl" onclick="downloadLibraryWorkout('${item.id}')" style="background:#444; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px; cursor:pointer;">DL</button>
                    <button class="lib-btn lib-del" onclick="deleteTempSave('${item.id}')">Del</button>
                </div>
            `;
            list.appendChild(div);
        });

        const hr = document.createElement('hr');
        hr.style.borderColor = '#444';
        hr.style.margin = '15px 0';
        list.appendChild(hr);
    }

    // 2. Static Workouts Section
    const staticHeader = document.createElement('h4');
    staticHeader.style.color = '#888';
    staticHeader.style.marginTop = '0';
    staticHeader.textContent = 'Standard Library';
    list.appendChild(staticHeader);

    if (typeof STATIC_WORKOUTS === 'undefined' || STATIC_WORKOUTS.length === 0) {
        const msg = document.createElement('div');
        msg.innerHTML = '<div style="padding:10px; color:#666;">No standard workouts found.</div>';
        list.appendChild(msg);
    } else {
        STATIC_WORKOUTS.forEach(item => {
            const div = document.createElement('div');
            div.className = 'lib-item';
            div.innerHTML = `
                <div class="lib-info">
                    <div class="lib-name">${item.name}</div>
                    <div class="lib-date">${item.description || ''}</div>
                </div>
                <div class="lib-actions">
                    <button class="lib-btn lib-load" onclick="loadLibraryItem('${item.id}')">Load</button>
                    <button class="lib-btn lib-dl" onclick="downloadLibraryWorkout('${item.id}')" style="background:#444; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px; cursor:pointer;">DL</button>
                </div>
            `;
            list.appendChild(div);
        });
    }
}
