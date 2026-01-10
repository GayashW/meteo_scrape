// ======================================================
// 0. IDW COMPATIBILITY LAYER (CRITICAL FIX)
// ======================================================
function createIdwLayer(points, options) {
    if (L.idwLayer) return L.idwLayer(points, options);
    if (L.idw) return L.idw(points, options);
    if (L.IdwLayer) return new L.IdwLayer(points, options);
    throw new Error("Leaflet IDW plugin not found");
}

// ======================================================
// 1. GLOBAL FIXED TEMPERATURE SCALE (PREDEFINED)
// ======================================================
const GLOBAL_MIN_TEMP = 15; // °C
const GLOBAL_MAX_TEMP = 40; // °C

// ======================================================
// 2. SETUP MAP
// ======================================================
const slBounds = [[5.8, 79.5], [9.9, 82.0]];

const map = L.map('map', {
    zoomControl: false,
    maxBounds: slBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 8,
    maxZoom: 20
}).setView([7.8731, 80.7718], 10);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

let idwLayer = null;
let markersLayer = L.layerGroup().addTo(map);
let globalData = [];
let groupedData = {};

// ======================================================
// 3. AUTO-ZOOM TO USER LOCATION
// ======================================================
if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            const insideSL = lat >= 5.8 && lat <= 9.9 && lng >= 79.5 && lng <= 82.0;

            if (insideSL) map.setView([lat, lng], 10, { animate: true });
        },
        error => console.warn("Geolocation denied or unavailable"),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

// ======================================================
// 4. STATION DATABASE
// ======================================================
const stationDb = {
    "JAFFNA": { lat: 9.6615, lng: 80.0255 },
    "MULLATIVU": { lat: 9.2671, lng: 80.8142 },
    "MANNAR": { lat: 8.9766, lng: 79.9043 },
    "VAVUNIYA": { lat: 8.7542, lng: 80.4982 },
    "TRINCOMALEE": { lat: 8.5874, lng: 81.2152 },
    "ANURADHAPURA": { lat: 8.3114, lng: 80.4037 },
    "MAHA ILLUPPALLAMA": { lat: 8.1167, lng: 80.4667 },
    "PUTTALAM": { lat: 8.0362, lng: 79.8283 },
    "BATTICALOA": { lat: 7.7310, lng: 81.6747 },
    "KURUNEGALA": { lat: 7.4818, lng: 80.3609 },
    "KATUGASTOTA": { lat: 7.3276, lng: 80.6224 },
    "KATUNAYAKE": { lat: 7.1829, lng: 79.8977 },
    "COLOMBO": { lat: 6.9271, lng: 79.8612 },
    "RATMALANA": { lat: 6.8194, lng: 79.8820 },
    "NUWARA ELIYA": { lat: 6.9497, lng: 80.7891 },
    "POTTUVIL": { lat: 6.8737, lng: 81.8360 },
    "BANDARAWELA": { lat: 6.8259, lng: 80.9982 },
    "BADULLA": { lat: 6.9893, lng: 81.0558 },
    "RATNAPURA": { lat: 6.6828, lng: 80.3992 },
    "GALLE": { lat: 6.0535, lng: 80.2210 },
    "HAMBANTOTA": { lat: 6.1429, lng: 81.1212 },
    "MATTALA": { lat: 6.2921, lng: 81.1228 },
    "POLONNARUWA": { lat: 7.9403, lng: 81.0188 },
    "MONARAGALA": { lat: 6.8714, lng: 81.3487 }
};

// ======================================================
// 5. CORE RENDER FUNCTION
// ======================================================
function renderMap(dateStr, timeStr) {
    const search = `${dateStr} ${timeStr}`;
    markersLayer.clearLayers();
    if (idwLayer) map.removeLayer(idwLayer);

    const filtered = globalData.filter(row => row['Report_Time']?.toString().trim().replace(/\s+/g, ' ') === search);

    if (!filtered.length) {
        document.getElementById('station-count').innerText = "0";
        document.getElementById('avg-temp').innerText = "--";
        return;
    }

    const points = [];
    let sum = 0, count = 0;

    filtered.forEach(row => {
        let name = row['Station_Name']?.trim().toUpperCase() || "";
        if (name === "POTUVIL") name = "POTTUVIL";

        const temp = parseFloat(row['Temperature ( C )']);
        if (!stationDb[name] || isNaN(temp)) return;

        const { lat, lng } = stationDb[name];
        points.push([lat, lng, temp]);
        sum += temp;
        count++;

        const marker = L.circleMarker([lat, lng], {
            radius: 4,
            fillColor: "#fff",
            color: "#000",
            weight: 1,
            fillOpacity: 1
        });

        marker.bindTooltip(`
            <div class="station-card">
                <div class="station-name">${name}</div>
                <div class="station-temp">${temp.toFixed(1)}°C</div>
                <div class="station-meta">${row['weathertype'] || 'Unknown'}</div>
            </div>
        `, { direction: "top", className: "modern-tooltip", offset: [0, -10] });

        markersLayer.addLayer(marker);
    });

    document.getElementById('station-count').innerText = count;
    document.getElementById('avg-temp').innerText = count ? (sum / count).toFixed(1) + "°C" : "--";

    if (!points.length) return;

    const gradient = {
        0.0: "#313695", 0.2: "#4575b4", 0.4: "#74add1",
        0.5: "#ffffbf", 0.6: "#fdae61", 0.8: "#f46d43", 1.0: "#a50026"
    };

    idwLayer = createIdwLayer(points, {
        opacity: 0.5, cellSize: 30, exp: 3, min: GLOBAL_MIN_TEMP,
        max: GLOBAL_MAX_TEMP, radius: 150, gradient
    }).addTo(map);

    markersLayer.bringToFront();
}

// ======================================================
// 6. DATA PARSING
// ======================================================
function processData(buffer) {
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    globalData = XLSX.utils.sheet_to_json(ws);

    groupedData = {};
    globalData.forEach(row => {
        if (!row['Report_Time']) return;
        const [date, time] = row['Report_Time'].toString().trim().split(' ');
        if (!groupedData[date]) groupedData[date] = new Set();
        groupedData[date].add(time);
    });

    const dates = Object.keys(groupedData).sort();
    if (dates.length) {
        setupSlider(dates);
        setupPlayControls(dates);
    }

    const status = document.getElementById('status-indicator');
    status.className = 'text-green-500 font-bold';
    status.innerText = '✔';
}

// ======================================================
// 7. SLIDER AND TIME CHIPS
// ======================================================
function setupSlider(dates) {
    const slider = document.getElementById('dateSlider');
    slider.min = 0; slider.max = dates.length - 1; slider.disabled = false;
    slider.value = dates.length - 1; // latest date
    updateTimeGrid(dates[dates.length - 1]);

    slider.oninput = e => updateTimeGrid(dates[e.target.value]);
}

function updateTimeGrid(date) {
    document.getElementById('selected-date-display').innerText = date;
    const grid = document.getElementById('time-grid'); grid.innerHTML = "";
    const times = [...groupedData[date]].sort();
    const latestTime = times[times.length - 1];

    times.forEach(time => {
        const btn = document.createElement('button');
        btn.className = 'time-chip border border-white/20 rounded-lg py-2 text-xs font-semibold text-gray-300';
        btn.innerText = time;

        btn.onclick = () => {
            document.querySelectorAll('.time-chip').forEach(b => b.classList.remove('active', 'border-blue-500'));
            btn.classList.add('active', 'border-blue-500');
            renderMap(date, time);
        };

        grid.appendChild(btn);
        if (time === latestTime) btn.click();
    });
}

// ======================================================
// 8. DATA LOADING
// ======================================================
window.onload = () => {
    if (location.protocol === 'file:') createManualUploader();
    else fetchData();
};

async function fetchData() {
    try {
        const res = await fetch('data.xlsx');
        const buf = await res.arrayBuffer();
        processData(buf);
    } catch {
        createManualUploader();
    }
}

function createManualUploader() {
    const status = document.getElementById('status-indicator');
    status.className = 'bg-red-500 text-white text-[10px] p-2 rounded cursor-pointer';
    status.innerText = '📂 Load';
    status.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.xlsx,.xls';
        input.onchange = e => {
            const reader = new FileReader();
            reader.onload = ev => processData(ev.target.result);
            reader.readAsArrayBuffer(e.target.files[0]);
        };
        input.click();
    };
}

