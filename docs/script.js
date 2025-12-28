// --- 1. SETUP MAP ---
const slBounds = [[5.8, 79.5], [9.9, 82.0]]; // Sri Lanka Bounds

const map = L.map('map', { 
    zoomControl: false,
    maxBounds: slBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 7,
    maxZoom: 12
}).setView([7.8731, 80.7718], 8);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

let idwLayer = null;
let markersLayer = L.layerGroup().addTo(map);
let globalData = [];
let groupedData = {}; // Object to hold dates and their times: { "2025-12-27": ["1730", "2330"] }

// --- 2. STATION DB ---
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

// --- 3. RENDER FUNCTION (The Core) ---
function renderMap(dateStr, timeStr) {
    const fullSearchString = `${dateStr} ${timeStr}`; // e.g., "2025-12-28 0830"
    console.log(`Rendering: ${fullSearchString}`);
    
    markersLayer.clearLayers();
    if (idwLayer) map.removeLayer(idwLayer);

    // Filter by Exact Date & Time
    const filteredData = globalData.filter(row => {
        const reportTime = row['Report_Time']; 
        return reportTime && reportTime.toString().trim() === fullSearchString;
    });

    if (filteredData.length === 0) {
        console.warn("No data for this timestamp.");
        document.getElementById('station-count').innerText = "0";
        document.getElementById('avg-temp').innerText = "--";
        return;
    }

    const points = [];
    let dailyMax = -100;
    let dailyMin = 100;
    let totalTemp = 0;
    
    // 1. Scan for Min/Max
    filteredData.forEach(row => {
        const rawTemp = row['Temperature ( C )'];
        const temp = parseFloat(rawTemp);
        if (!isNaN(temp)) {
            if (temp > dailyMax) dailyMax = temp;
            if (temp < dailyMin) dailyMin = temp;
        }
    });

    const safeMax = dailyMax + 2.0; 
    const minPct = dailyMin / safeMax;
    const maxPct = dailyMax / safeMax;
    const range = maxPct - minPct;

    // 2. Build Gradient
    const dynamicGradient = {};
    dynamicGradient[0.0] = '#0000ff';         
    dynamicGradient[minPct] = '#0000ff';      
    dynamicGradient[minPct + (range * 0.33)] = '#00ff00'; // Green
    dynamicGradient[minPct + (range * 0.66)] = '#ffff00'; // Yellow
    dynamicGradient[0.98] = '#ff0000';        // Red

    // 3. Create Points
    filteredData.forEach(row => {
        let stationName = row['Station_Name'] ? row['Station_Name'].trim().toUpperCase() : "";
        if(stationName === "POTUVIL") stationName = "POTTUVIL"; 
        
        const temp = parseFloat(row['Temperature ( C )']);

        if (stationDb[stationName] && !isNaN(temp)) {
            const { lat, lng } = stationDb[stationName];
            points.push([lat, lng, temp]);
            
            // Marker
            const marker = L.circleMarker([lat, lng], {
                radius: 4, fillColor: "#fff", color: "rgba(0,0,0,0.5)", weight: 1, opacity: 1, fillOpacity: 1
            });

            // Fancy Popup
            const weatherType = row['weathertype'] || 'Unknown';
            const popupContent = `
                <div class="station-card">
                    <div class="station-name">${stationName}</div>
                    <div class="station-temp">${temp.toFixed(1)}°C</div>
                    <div class="station-meta">${weatherType}</div>
                </div>
            `;
            
            marker.bindTooltip(popupContent, { 
                permanent: false, direction: "top", className: "modern-tooltip", offset: [0, -10]
            });

            markersLayer.addLayer(marker);
            totalTemp += temp;
        }
    });

    // Update UI Stats
    document.getElementById('station-count').innerText = points.length;
    document.getElementById('avg-temp').innerText = points.length > 0 ? (totalTemp / points.length).toFixed(1) + "°C" : "--";

    // 4. Draw IDW
    if (points.length > 0) {
        idwLayer = L.idwLayer(points, {
            opacity: 0.5,
            maxZoom: 18,
            cellSize: 30, // Optimized
            exp: 3,
            max: safeMax,
            radius: 150, // Global
            gradient: dynamicGradient
        }).addTo(map);
        markersLayer.bringToFront();
    }
}

// --- 4. DATA PARSING & UI LOGIC ---

function processData(buffer) {
    const workbook = XLSX.read(buffer);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    globalData = XLSX.utils.sheet_to_json(worksheet);
    
    // Group Data by Date
    groupedData = {};
    globalData.forEach(row => {
        const rawTime = row['Report_Time']; // "2025-12-28 0830"
        if(rawTime) {
            const parts = rawTime.trim().split(' ');
            if(parts.length === 2) {
                const date = parts[0]; // "2025-12-28"
                const time = parts[1]; // "0830"
                
                if(!groupedData[date]) groupedData[date] = new Set();
                groupedData[date].add(time);
            }
        }
    });

    // Extract sorted unique dates
    const uniqueDates = Object.keys(groupedData).sort();
    
    if (uniqueDates.length > 0) {
        setupSlider(uniqueDates);
        const status = document.getElementById('status-indicator');
        status.innerHTML = '✔'; // Success checkmark
        status.className = 'text-green-500 font-bold';
    }
}

function setupSlider(dates) {
    const slider = document.getElementById('dateSlider');
    const display = document.getElementById('selected-date-display');
    
    slider.min = 0;
    slider.max = dates.length - 1;
    slider.value = 0;
    slider.disabled = false;

    // Initial Load
    updateTimeGrid(dates[0]);

    // Listener
    slider.addEventListener('input', (e) => {
        const idx = e.target.value;
        const selectedDate = dates[idx];
        updateTimeGrid(selectedDate);
    });
}

function updateTimeGrid(dateStr) {
    document.getElementById('selected-date-display').innerText = dateStr;
    const container = document.getElementById('time-grid');
    container.innerHTML = ''; // Clear old buttons

    // Get times for this date and sort them
    const times = Array.from(groupedData[dateStr]).sort();

    times.forEach((time, index) => {
        const btn = document.createElement('button');
        btn.className = `time-chip border border-white/20 rounded-lg py-2 text-xs font-semibold text-gray-300 hover:text-white`;
        btn.innerText = time;
        
        btn.onclick = () => {
            // Remove active class from all
            document.querySelectorAll('.time-chip').forEach(b => b.classList.remove('active', 'border-blue-500'));
            // Add active to this
            btn.classList.add('active', 'border-blue-500');
            renderMap(dateStr, time);
        };

        container.appendChild(btn);

        // Auto-select the first time
        if(index === 0) btn.click();
    });
}

// File Loader Logic
window.onload = function() {
    if (window.location.protocol === 'file:') {
        createManualUploader();
    } else {
        fetchData();
    }
};

async function fetchData() {
    try {
        const response = await fetch('data.xlsx');
        if (!response.ok) throw new Error("Net");
        const arrayBuffer = await response.arrayBuffer();
        processData(arrayBuffer);
    } catch (e) {
        console.log("Auto-load failed, switching to manual.");
        createManualUploader();
    }
}

function createManualUploader() {
    const status = document.getElementById('status-indicator');
    status.className = 'bg-red-500 text-white text-[10px] p-2 rounded cursor-pointer';
    status.innerHTML = `📂 Load`;
    status.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx, .xls';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => processData(e.target.result);
            reader.readAsArrayBuffer(file);
        };
        input.click();
    };
}