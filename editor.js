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

    // Add initial dummy segment
    addSegment('Warmup', { duration: 600, power_low: 0.25, power_high: 0.75 });
    addSegment('SteadyState', { duration: 300, power: 0.95 });
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
                // Off
                data.push({ x: currentTime / 60, y: s.off_power });
                currentTime += s.off_duration;
                data.push({ x: currentTime / 60, y: s.off_power });
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

    if (type === 'Warmup' || type === 'CoolDown' || type === 'Ramp') {
        base.power_low = 0.25;
        base.power_high = 0.75;
    } else if (type === 'SteadyState') {
        base.power = 0.75;
    } else if (type === 'IntervalsT') {
        base.repeat = 5;
        base.on_duration = 60;
        base.off_duration = 60;
        base.on_power = 1.0;
        base.off_power = 0.5;
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
        }

        div.innerHTML = `
            <div class="drag-handle" title="Drag to reorder" style="color: rgba(255,255,255,0.7);">☰</div>
            <div class="segment-content-wrapper">
                <div class="segment-header">
                    <span class="segment-type" style="color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${s.type}</span>
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
// --- XML Generation and Parsing Logic (Client-Side) ---

function generateZWO(workout) {
    const meta = workout.metadata;
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    xml += '<workout_file>\n';
    xml += '    <author>' + escapeXml(meta.author) + '</author>\n';
    xml += '    <name>' + escapeXml(meta.name) + '</name>\n';
    xml += '    <description>' + escapeXml(meta.description) + '</description>\n';
    xml += '    <sportType>' + escapeXml(meta.sport_type) + '</sportType>\n';
    xml += '    <tags>\n';
    meta.tags.forEach(tag => {
        if(tag.trim()) xml += '        <tag name="' + escapeXml(tag.trim()) + '"/>\n';
    });
    xml += '    </tags>\n';
    xml += '    <workout>\n';

    workout.segments.forEach(s => {
        if (s.type === 'SteadyState') {
            xml += '        <SteadyState Duration="' + s.duration + '" Power="' + s.power + '"/>\n';
        } else if (s.type === 'Warmup') {
            xml += '        <Warmup Duration="' + s.duration + '" PowerLow="' + s.power_low + '" PowerHigh="' + s.power_high + '"/>\n';
        } else if (s.type === 'CoolDown') {
            xml += '        <CoolDown Duration="' + s.duration + '" PowerLow="' + s.power_low + '" PowerHigh="' + s.power_high + '"/>\n';
        } else if (s.type === 'Ramp') {
            xml += '        <Ramp Duration="' + s.duration + '" PowerLow="' + s.power_low + '" PowerHigh="' + s.power_high + '"/>\n';
        } else if (s.type === 'IntervalsT') {
            xml += '        <IntervalsT Repeat="' + s.repeat + '" OnDuration="' + s.on_duration + '" OffDuration="' + s.off_duration + '" OnPower="' + s.on_power + '" OffPower="' + s.off_power + '"/>\n';
        } else if (s.type === 'FreeRide') {
            xml += '        <FreeRide Duration="' + s.duration + '"/>\n';
        } else if (s.type === 'MaxEffort') {
            xml += '        <MaxEffort Duration="' + s.duration + '"/>\n';
        }
    });

    xml += '    </workout>\n';
    xml += '</workout_file>';
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

function saveWorkout() {
    const workout = {
        metadata: {
            name: document.getElementById('workoutName').value || "My Workout",
            author: document.getElementById('workoutAuthor').value || "Unknown",
            description: document.getElementById('workoutDesc').value || "",
            tags: document.getElementById('workoutTags').value.split(',').map(t => t.trim()).filter(Boolean),
            sport_type: 'bike'
        },
        segments: segments
    };

    try {
        const xmlContent = generateZWO(workout);
        const blob = new Blob([xmlContent], { type: "application/xml" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = workout.metadata.name.replace(/\s+/g, '_') + '.zwo';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Error generating ZWO:", e);
        alert("Failed to generate ZWO file.");
    }
}

function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
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
