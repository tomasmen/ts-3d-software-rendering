const BACKGROUND = "#000000"
const FOREGROUND = "rgba(60, 255, 0, 1)"
const FPS = 60;
const POINT_DIAMETER = 6;

const ctx = canvasEl.getContext("2d");

fileEl.addEventListener("change", loadModelFile);

window.addEventListener("resize", resizeCanvas);

function rotateAroundX({ x, y, z }, theta) {
    return {
        x: x,
        y: (y*Math.cos(theta)) - (z*Math.sin(theta)),
        z: (y*Math.sin(theta)) + (z*Math.cos(theta)),
    }
}

function rotateAroundY({ x, y, z }, theta) {
    return {
        x: (x * Math.cos(theta)) + (z * Math.sin(theta)),
        y: y,
        z: (-1 * x * Math.sin(theta)) + (z * Math.cos(theta)),
    }
}

function rotateAroundZ({ x, y, z }, theta) {
    return {
        x: (x * Math.cos(theta)) - (y * Math.sin(theta)),
        y: (x * Math.sin(theta)) + (y * Math.cos(theta)),
        z: z,
    }
}

function rotate({x, y, z}, {x: rx, y: ry, z: rz}) {
    return rotateAroundZ(rotateAroundY(rotateAroundX({ x, y, z}, rx), ry), rz);
}

function translateZ({x, y, z}, displacement) {
    return {
        x,
        y,
        z: z + displacement
    }
}

function project({ x, y, z }, f = 1.0) {
    if (z <= 0.0001) return null;
    return { x: (x/z) * f, y: (y/z) * f, z}
}

// From Normalized Device Coordinates [-1, +1] to Canvas coordinates
function mapToCanvas(point) {
    if (point === null) return null;
    return {
        x: ((point.x + 1) / 2) * canvasEl.width,
        y: ((1 - (point.y + 1) / 2)) * canvasEl.height,
        z: point.z
    }
}

function clear() {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
}

function drawPoint(point) {
    if (point === null) return;
    const { x, y } = point;
    ctx.fillStyle = FOREGROUND;
    ctx.fillRect(x - (POINT_DIAMETER/2), y - (POINT_DIAMETER/2), POINT_DIAMETER, POINT_DIAMETER);
}

function depthToAlpha(z) {
  const nearZ = 5;
  const farZ = 150;
  const t = Math.max(0, Math.min(1, (z - nearZ) / (farZ - nearZ)));
  return 1 - t; // 1 near, 0 far
}

function drawLine(p1, p2) {
    if (!p1 || !p2) return;

    const z = (p1.z + p2.z) / 2;

    const nearZ = 5;    // distance where width is max
    const farZ = 50;    // ''       ''    ''    '' min
    const maxW = 6;
    const minW = 0.5;

    // Normalize
    const tRaw = (z - nearZ) / (farZ - nearZ);
    // Clamp
    const t = Math.max(0, Math.min(1, tRaw));

    // Linear interpol
    ctx.lineWidth = maxW + (minW - maxW) * t;

    const a = depthToAlpha(z);
    ctx.strokeStyle = `rgba(60, 255, 0, ${0.15 + 0.85 * a})`;
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function resizeCanvas() {
    const canvasSize = Math.min(window.innerWidth, window.innerHeight)*0.9;
    const size = canvasSize - Math.max(50, canvasSize * 0.1);

    canvasEl.width = size;
    canvasEl.height = size;
    canvasEl.style.width = `${size}px`;
    canvasEl.style.height = `${size}px`;

    clear();
    drawModels();
}

var objects = [];
var globalVertices = [];

async function loadModelFile(event) {
    objects = [];
    globalVertices = [];

    const file = event.target.files?.[0];
    if (!file) {
        updateFileStatus("No files found.");
        return;
    }
    
    if (!file.name.endsWith(".obj")) {
        updateFileStatus("Only .obj files are supported.");
        return;
    }
    
    const text = await file.text();

    
    const lines = text.split(/\r?\n/);

    let currentObj = null;

    function ensureObject() {
        if (currentObj !== null) return true;

        currentObj = new { name: "default", lines: [], faces: [], rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 0, z: 0} }
        objects.push(currentObj);
        return true;
    }

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        
        const hashIndex = line.indexOf("#");
        if (hashIndex !== -1) line = line.slice(0, hashIndex).trim();
        
        const parts = line.split(/\s+/); // Split on one or more spaces
        const tag = parts[0];

        if (tag === "o") {
            const name = parts.slice(1).join((" ")) || `object_${objects.length}`;
            currentObj = { name, lines: [], faces: [], rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 0, z: 0} };
            objects.push(currentObj);

            continue;
        }

        if (tag === "v") {
            if (!ensureObject()) continue;
            
            const x = Number(parts[1]);
            const y = Number(parts[2]);
            const z = Number(parts[3]);

            if (![x, y, z].every(Number.isFinite)) {
                console.log("Unexpected error while loading file, one of the coordinates of a vertex wasnt a valid number.");
                continue;
            }

            globalVertices.push({ x, y, z });
            continue;
        }

        if (tag === "l" || tag === "f") {
            if (!currentObj) continue;

            const indexes = [];
            for (let i = 1; i < parts.length; i++) {
                const idx = Number(parts[i].split("/")[0]);
                if (!Number.isInteger(idx) || idx === 0) {
                    console.log("Unexpected error while loading file, one of the vertex indexes in a face/line wasn't an integer.");
                    continue;
                };

                // See Vertex Indices section
                // https://en.wikipedia.org/wiki/Wavefront_.obj_file 
                if (idx > 0) indexes.push(idx - 1);
                if (idx < 0) indexes.push(globalVertices.length + idx);
            }
            if (tag == "l") currentObj.lines.push(indexes);
            if (tag == "f") currentObj.faces.push(indexes);
        }
    }

    // TODO: Make this not shift the page
    updateFileStatus("Loaded successfully!");

    clear();
    drawModels();

    setTimeout(clearFileStatus, 5*1000)
}

function updateFileStatus(message) {
    fileStatus.innerHTML = message;
}

function clearFileStatus() {
    fileStatus.innerHTML = "";
}

function playAnimation() {
    renderFrame();
    setTimeout(playAnimation, 1000/FPS);
}

function drawModelLine(vertices, rotation, translation) {
    for (let i = 0; i < vertices.length-1; i++) {
        var p1 = rotate(globalVertices[vertices[i]], rotation);
        var p2 = rotate(globalVertices[vertices[i+1]], rotation);

        p1Copy = { x: p1.x + translation.x, y: p1.y+ translation.y, z: p1.z + translation.z };
        p2Copy = { x: p2.x + translation.x, y: p2.y + translation.y, z: p2.z + translation.z };

        const point = mapToCanvas(project(p1Copy));
        const nextPoint = mapToCanvas(project(p2Copy));

        drawLine(point, nextPoint);
    }
}

function drawModelFace(vertices, rotation, translation) {
    for (let i = 0; i < vertices.length; i++) {
        var p1 = rotate(globalVertices[vertices[i]], rotation);
        var p2 = rotate(globalVertices[vertices[(i+1)%vertices.length]], rotation);

        p1Copy = { x: p1.x + translation.x, y: p1.y+ translation.y, z: p1.z + translation.z };
        p2Copy = { x: p2.x + translation.x, y: p2.y + translation.y, z: p2.z + translation.z };

        const point = mapToCanvas(project(p1Copy));
        const nextPoint = mapToCanvas(project(p2Copy));

        drawLine(point, nextPoint);
    }
}

function drawModels() {
    for (let object of objects) {
        for(let face of object.faces) {
            drawModelFace(face, object.rotation, object.translation);
        }

        for(let line of object.lines) {
            drawModelLine(line, object.rotation, object.translation);
        }
    }
}

resizeCanvas();

var draggingTranslation = false;
var draggingRotation = false;
var last = { x: 0, y: 0 }

function getCanvasPos(e) {
  const r = canvasEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvasEl.addEventListener("mousedown", (e) => { 
    if (e.button == 0) draggingTranslation = true;
    if (e.button == 1) draggingRotation = true;
    last = getCanvasPos(e);
});

const ROTATION_SENS = Math.PI / canvasEl.width;

canvasEl.addEventListener("mousemove", (e) => { 
    if (!draggingTranslation && !draggingRotation) return;
    
    var cur = getCanvasPos(e);
    const dx = cur.x - last.x;
    const dy = cur.y - last.y;
    last = cur; 

    if (draggingTranslation) {
        for (var object of objects) {
            object.translation.x += dx/7; 
            object.translation.y -= dy/7; 
        }
    }

    if (draggingRotation) {
        for (var object of objects) {
            object.rotation.x -= dy * ROTATION_SENS;
            object.rotation.y -= dx * ROTATION_SENS;
        }
    }

    clear();
    drawModels();
});

canvasEl.addEventListener("mouseup", (e) => { 
    if (e.button == 0) draggingTranslation = false;
    if (e.button == 1) draggingRotation = false;
});

const SCROLL_SENS = 0.05;
canvasEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dy = e.deltaY;

    for (var object of objects) {
        object.translation.z -= dy*SCROLL_SENS;
    }
    
    clear();
    drawModels();
});



