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

function getZoneBg(power) {
    const zone = getZone(power);
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

    // Close popup on click outside
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('graphPopup');
        if (popup.style.display === 'block' &&
            !popup.contains(e.target) &&
            e.target.tagName !== 'CANVAS') {
            popup.style.display = 'none';
        }
    });

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
                        if (!p0.x || !p1.x) return getZone((p0.parsed.y + p1.parsed.y) / 2).bg;
                        const gradient = ctx.createLinearGradient(p0.x, 0, p1.x, 0);
                        gradient.addColorStop(0, getZone(p0.parsed.y).bg);
                        gradient.addColorStop(1, getZone(p1.parsed.y).bg);
                        return gradient;
                    }
                }
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e) => {
                const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false, axis: 'x' }, true);
                if (points.length) {
                    const firstPoint = points[0];
                    const dataPoint = chart.data.datasets[firstPoint.datasetIndex].data[firstPoint.index];
                    if (dataPoint && dataPoint.segmentId) {
                        const seg = segments.find(s => s.id === dataPoint.segmentId);
                        if (seg) {
                            showPopup(e, seg);
                            scrollToSegment(dataPoint.segmentId); // Also sync sidebar
                        }
                    }
                }
            },
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
                tooltip: { enabled: false } // Disable default tooltip to use popup
            }
        }
    });
}

function showPopup(event, segment) {
    const popup = document.getElementById('graphPopup');
    const chartArea = chart.chartArea;
    const canvasRect = chart.canvas.getBoundingClientRect();

    // Calculate Segment Start Time
    let startTime = 0;
    for (let s of segments) {
        if (s.id === segment.id) break;
        if (s.type === 'IntervalsT') {
            startTime += s.repeat * (s.on_duration + s.off_duration);
        } else {
            startTime += s.duration;
        }
    }

    // Get coordinates from Chart scales
    const x = chart.scales.x.getPixelForValue(startTime / 60);
    const y = chart.chartArea.top;

    // Show text inputs based on type (Partial component reuse logic)
    let content = `
        <div class="popup-header">
            <span>${segment.type}</span>
            <span class="popup-close" onclick="document.getElementById('graphPopup').style.display='none'">&times;</span>
        </div>
    `;

    const toPct = (val) => Math.round((val || 0) * 100);
    const selectOnClick = 'onclick="this.select()"';

    if (segment.type !== 'IntervalsT') {
        content += `
            <div class="popup-row">
                <label>Duration</label>
                <input type="text" value="${formatTime(segment.duration)}" ${selectOnClick}
                       onchange="updateSegmentFromPopup(${segment.id}, 'duration', this.value)">
            </div>
        `;
    }

    if (segment.type === 'SteadyState') {
        content += `
            <div class="popup-row">
                <label>Power (%)</label>
                <input type="number" value="${toPct(segment.power)}" ${selectOnClick}
                       onchange="updateSegmentFromPopup(${segment.id}, 'power', this.value)">
            </div>
        `;
    } else if (['Warmup', 'CoolDown', 'Ramp'].includes(segment.type)) {
        content += `
            <div class="popup-row">
                <label>Start (%)</label>
                <input type="number" value="${toPct(segment.power_low)}" ${selectOnClick}
                       onchange="updateSegmentFromPopup(${segment.id}, 'power_low', this.value)">
            </div>
            <div class="popup-row">
                <label>End (%)</label>
                <input type="number" value="${toPct(segment.power_high)}" ${selectOnClick}
                       onchange="updateSegmentFromPopup(${segment.id}, 'power_high', this.value)">
            </div>
        `;
    } else if (segment.type === 'IntervalsT') {
        content += `
            <div class="popup-row"><label>Reps</label><input type="number" value="${segment.repeat}" ${selectOnClick} onchange="updateSegmentFromPopup(${segment.id}, 'repeat', this.value)"></div>
            <div class="popup-row"><label>On</label><input type="text" value="${formatTime(segment.on_duration)}" ${selectOnClick} onchange="updateSegmentFromPopup(${segment.id}, 'on_duration', this.value)"></div>
            <div class="popup-row"><label>On(%)</label><input type="number" value="${toPct(segment.on_power)}" ${selectOnClick} onchange="updateSegmentFromPopup(${segment.id}, 'on_power', this.value)"></div>
            <div class="popup-row"><label>Off</label><input type="text" value="${formatTime(segment.off_duration)}" ${selectOnClick} onchange="updateSegmentFromPopup(${segment.id}, 'off_duration', this.value)"></div>
            <div class="popup-row"><label>Off(%)</label><input type="number" value="${toPct(segment.off_power)}" ${selectOnClick} onchange="updateSegmentFromPopup(${segment.id}, 'off_power', this.value)"></div>
        `;
    }

    popup.innerHTML = content;
    // Position at Top-Left of Segment
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.transform = 'translate(0, 0)'; // Reset CSS centering
    popup.style.marginTop = '10px'; // Offset from top border
    popup.style.marginLeft = '5px'; // Offset from left border
    popup.style.display = 'block';

    // Auto-focus first input
    const input = popup.querySelector('input');
    if (input) input.focus();
}

function updateSegmentFromPopup(id, field, value) {
    updateSegment(id, field, value);
    // Keep popup open logic? No, updateUI rewrites DOM, but popup is separate.
    // Ideally we want to refresh content but keep popup.
    // For now simple re-render.
}

function scrollToSegment(segmentId) {
    const el = document.querySelector(`.segment-item[data-id="${segmentId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('active-highlight');
        void el.offsetWidth;
        el.classList.add('active-highlight');
    }
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
        const segStart = currentTime / 60;
        let segEnd = 0;

        // Ensure we pass segmentId to data points for click mapping
        const addPoint = (x, y) => {
            data.push({ x: x, y: y, segmentId: s.id });
        };

        if (s.type === 'Warmup' || s.type === 'CoolDown' || s.type === 'Ramp') {
            addPoint(currentTime / 60, s.power_low);
            currentTime += s.duration;
            addPoint(currentTime / 60, s.power_high);
        } else if (s.type === 'SteadyState') {
            addPoint(currentTime / 60, s.power);
            currentTime += s.duration;
            addPoint(currentTime / 60, s.power);
        } else if (s.type === 'IntervalsT') {
            for (let i = 0; i < s.repeat; i++) {
                addPoint(currentTime / 60, s.on_power);
                currentTime += s.on_duration;
                addPoint(currentTime / 60, s.on_power);
                addPoint(currentTime / 60, s.off_power);
                currentTime += s.off_duration;
                addPoint(currentTime / 60, s.off_power);
            }
        } else if (s.type === 'FreeRide') {
            addPoint(currentTime / 60, 0.5);
            currentTime += s.duration;
            addPoint(currentTime / 60, 0.5);
        } else {
            addPoint(currentTime / 60, 0.5);
            currentTime += s.duration;
            addPoint(currentTime / 60, 0.5);
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
        const selectOnClick = 'onclick="this.select()"';

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

function handleDragStart(e) {
    this.style.opacity = '0.4';
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) { this.classList.add('over'); }
function handleDragLeave(e) { this.classList.remove('over'); }

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
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
    document.querySelectorAll('.segment-item').forEach(item => item.classList.remove('over'));
}

// -----------------------------------------------------
// STATIC SITE LOGIC (Replaces Python API)
// -----------------------------------------------------

function saveWorkout() {
    const meta = {
        name: document.getElementById('workoutName').value,
        author: document.getElementById('workoutAuthor').value,
        description: document.getElementById('workoutDesc').value,
        tags: document.getElementById('workoutTags').value,
        sport_type: 'bike'
    };

    // Generate XML String
    let xml = `<workout_file>
    <author>${escapeXml(meta.author)}</author>
    <name>${escapeXml(meta.name)}</name>
    <description>${escapeXml(meta.description)}</description>
    <sportType>${meta.sport_type}</sportType>
    <tags>`;

    if (meta.tags) {
        meta.tags.split(',').forEach(tag => {
            if (tag.trim()) xml += `\n        <tag name="${escapeXml(tag.trim())}"/>`;
        });
    }
    xml += `\n    </tags>\n    <workout>`;

    segments.forEach(s => {
        if (s.type === 'SteadyState') {
            xml += `\n        <SteadyState Duration="${s.duration}" Power="${s.power}"/>`;
        } else if (s.type === 'Warmup') {
            xml += `\n        <Warmup Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>`;
        } else if (s.type === 'CoolDown') {
            xml += `\n        <CoolDown Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>`;
        } else if (s.type === 'Ramp') {
            xml += `\n        <Ramp Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>`;
        } else if (s.type === 'IntervalsT') {
            xml += `\n        <IntervalsT Repeat="${s.repeat}" OnDuration="${s.on_duration}" OffDuration="${s.off_duration}" OnPower="${s.on_power}" OffPower="${s.off_power}"/>`;
        } else if (s.type === 'FreeRide') {
            xml += `\n        <FreeRide Duration="${s.duration}"/>`;
        }
    });

    xml += `\n    </workout>\n</workout_file>`;

    // Download
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.name.replace(/\s+/g, '_')}.zwo`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a); // Cleanup
}

function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const xmlContent = e.target.result;
        try {
            parseZWO(xmlContent);
        } catch (err) {
            console.error(err);
            alert('Error parsing XML file');
        }
    };
    reader.readAsText(file);
}

function parseZWO(xmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "text/xml");

    // Metadata
    const name = getTagText(doc, "name") || "Unknown Workout";
    const author = getTagText(doc, "author") || "";
    const description = getTagText(doc, "description") || "";

    // Tags
    const tagsArr = [];
    const tagNodes = doc.getElementsByTagName("tag");
    for (let i = 0; i < tagNodes.length; i++) {
        tagsArr.push(tagNodes[i].getAttribute("name"));
    }

    document.getElementById('workoutName').value = name;
    document.getElementById('workoutAuthor').value = author;
    document.getElementById('workoutDesc').value = description;
    document.getElementById('workoutTags').value = tagsArr.join(', ');

    // Segments
    const newSegments = [];
    const workoutNode = doc.getElementsByTagName("workout")[0];
    if (workoutNode) {
        for (let i = 0; i < workoutNode.children.length; i++) {
            const node = workoutNode.children[i];
            const type = node.tagName;
            const attr = (name) => node.getAttribute(name);
            const parseFloatSafe = (val) => parseFloat(val || 0);
            const parseIntSafe = (val) => parseInt(val || 0);

            const seg = { id: Date.now() + Math.random() + i, type: type };

            if (attr("Duration")) seg.duration = parseIntSafe(attr("Duration"));

            if (type === 'SteadyState') {
                seg.power = parseFloatSafe(attr("Power"));
            } else if (['Warmup', 'CoolDown', 'Ramp'].includes(type)) {
                seg.power_low = parseFloatSafe(attr("PowerLow"));
                seg.power_high = parseFloatSafe(attr("PowerHigh"));
            } else if (type === 'IntervalsT') {
                seg.repeat = parseIntSafe(attr("Repeat"));
                seg.on_duration = parseIntSafe(attr("OnDuration"));
                seg.off_duration = parseIntSafe(attr("OffDuration"));
                seg.on_power = parseFloatSafe(attr("OnPower"));
                seg.off_power = parseFloatSafe(attr("OffPower"));
                seg.duration = 0; // Calculated on display
            } else if (type === 'FreeRide') {
                // Duration already set
            }

            newSegments.push(seg);
        }
    }

    segments = newSegments;
    updateUI();
}

function getTagText(doc, tagName) {
    const el = doc.getElementsByTagName(tagName)[0];
    return el ? el.textContent : "";
}

function escapeXml(unsafe) {
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
