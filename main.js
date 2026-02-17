// Constants
const CANVAS_SIZE = 512;
const BUBBLE_PADDING = 16;
const CORNER_RADIUS = 12;

// State
let canvas;
let currentBubbleGroup;
let currentZoom = 1.0;

// Configure Fabric globals
if (typeof fabric !== 'undefined') {
    fabric.Object.prototype.perPixelTargetFind = true;
    fabric.Object.prototype.targetFindTolerance = 4;
    fabric.Object.prototype.lockUniScaling = true;
    fabric.Object.prototype.lockScalingFlip = true;

    // Premium Green Circle Controls
    fabric.Object.prototype.cornerColor = '#4ade80';
    fabric.Object.prototype.cornerStrokeColor = '#1a1b1e';
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerSize = 10;
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.borderColor = '#4ade80';
    fabric.Object.prototype.borderScaleFactor = 1.5;

    fabric.Object.prototype.setControlsVisibility({
        mt: false, mb: false, ml: false, mr: false
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing...');
    if (typeof fabric === 'undefined') {
        alert('Fabric.jsの読み込みに失敗しました。');
        return;
    }
    initCanvas();
    setupEventListeners();
    setupSidebarToggle();
    setupZoomControls();
    initEmojiPicker();

    // Initial content
    addSpeechBubble();

    // Initial centering
    centerArtboard();
});

function initCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    canvas = new fabric.Canvas('canvas', {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
        backgroundColor: '#1a1b1e',
        preserveObjectStacking: true,
        selection: true
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
        const wrapper = document.getElementById('canvas-wrapper');
        canvas.setDimensions({
            width: wrapper.clientWidth,
            height: wrapper.clientHeight
        });
        // Optional: Re-center if desired, or just let the user pan
        // centerArtboard(); 
    });

    setupBasics();
}

function setupBasics() {
    // Clear old UI elements
    const existing = canvas.getObjects().filter(o => ['artboard_bg', 'shroud_group', 'guide_border'].includes(o.name));
    existing.forEach(o => canvas.remove(o));

    // Artboard background at (0,0)
    const checkerSize = 20;
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = checkerCanvas.height = checkerSize * 2;
    const ctx = checkerCanvas.getContext('2d');
    ctx.fillStyle = '#2b3035';
    ctx.fillRect(0, 0, checkerSize, checkerSize);
    ctx.fillRect(checkerSize, checkerSize, checkerSize, checkerSize);
    ctx.fillStyle = '#373a40';
    ctx.fillRect(checkerSize, 0, checkerSize, checkerSize);
    ctx.fillRect(0, checkerSize, checkerSize, checkerSize);

    const artboardBG = new fabric.Rect({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        left: 0,
        top: 0,
        fill: new fabric.Pattern({ source: checkerCanvas, repeat: 'repeat' }),
        selectable: false,
        evented: false,
        name: 'artboard_bg'
    });
    canvas.add(artboardBG);

    // Shroud (4 rectangles to dim the out-of-bounds area)
    const shroudStyle = {
        fill: 'rgba(0, 0, 0, 0.8)',
        selectable: false,
        evented: false,
        objectCaching: false,
        name: 'shroud_item'
    };
    const EXTENT = 50000;

    const topShroud = new fabric.Rect({ ...shroudStyle, left: -EXTENT, top: -EXTENT, width: EXTENT * 2 + CANVAS_SIZE, height: EXTENT });
    const bottomShroud = new fabric.Rect({ ...shroudStyle, left: -EXTENT, top: CANVAS_SIZE, width: EXTENT * 2 + CANVAS_SIZE, height: EXTENT });
    const leftShroud = new fabric.Rect({ ...shroudStyle, left: -EXTENT, top: 0, width: EXTENT, height: CANVAS_SIZE });
    const rightShroud = new fabric.Rect({ ...shroudStyle, left: CANVAS_SIZE, top: 0, width: EXTENT, height: CANVAS_SIZE });

    canvas.add(topShroud, bottomShroud, leftShroud, rightShroud);

    // Dotted border
    const guide = new fabric.Rect({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        left: 0,
        top: 0,
        fill: 'transparent',
        stroke: '#4ade80',
        strokeWidth: 2,
        strokeDashArray: [10, 5],
        selectable: false,
        evented: false,
        name: 'guide_border'
    });
    canvas.add(guide);
}

function centerArtboard() {
    const wrapper = document.getElementById('canvas-wrapper');
    const zoom = 1; // Default zoom
    currentZoom = zoom;

    // Center point of artboard
    const artboardCenter = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };

    // Center point of canvas view
    const viewCenter = { x: wrapper.clientWidth / 2, y: wrapper.clientHeight / 2 };

    // Calculate viewport transform
    // We want artboardCenter to be at viewCenter
    const vpt = [zoom, 0, 0, zoom, viewCenter.x - artboardCenter.x * zoom, viewCenter.y - artboardCenter.y * zoom];

    canvas.setViewportTransform(vpt);
    updateZoomDisplay();
}

function setupZoomControls() {
    // Buttons
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(currentZoom + 0.1));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(currentZoom - 0.1));
    document.getElementById('reset-view').addEventListener('click', centerArtboard);

    // Mouse Wheel
    canvas.on('mouse:wheel', function (opt) {
        if (opt.e.ctrlKey || opt.e.metaKey) {
            // System zoom fallback
            return;
        }

        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 5) zoom = 5;
        if (zoom < 0.1) zoom = 0.1;

        // Zoom to point
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        currentZoom = zoom;
        updateZoomDisplay();
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });

    // Panning State
    let isDragging = false;
    let isSpaceDown = false;
    let lastPosX, lastPosY;

    const wrapper = document.getElementById('canvas-wrapper');
    // Native listener for middle-click (to reliably block autoscroll)
    wrapper.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            isDragging = true;
            canvas.selection = false;
            lastPosX = e.clientX;
            lastPosY = e.clientY;
            canvas.setCursor('grabbing');
        }
    }, { passive: false });

    // Global Mouse Up to clear panning state even if released outside
    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            canvas.selection = true;
            canvas.setCursor(isSpaceDown ? 'grab' : 'default');
            canvas.setViewportTransform(canvas.viewportTransform);
        }
    });

    // Global Key Listeners for Space
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            isSpaceDown = true;
            canvas.defaultCursor = 'grab';
            canvas.setCursor('grab');
            if (e.target === document.body) e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpaceDown = false;
            canvas.defaultCursor = 'default';
            canvas.setCursor('default');
        }
    });

    canvas.on('mouse:down', function (opt) {
        const e = opt.e;
        // Pan conditions: Space held OR Shift+Left Click
        // Note: Middle click is started by the native wrapper listener
        if (isSpaceDown || (e.button === 0 && e.shiftKey)) {
            isDragging = true;
            canvas.selection = false;
            lastPosX = e.clientX;
            lastPosY = e.clientY;
            canvas.setCursor('grabbing');
        }
    });

    canvas.on('mouse:move', function (opt) {
        if (isDragging) {
            const e = opt.e;
            const vpt = canvas.viewportTransform;
            vpt[4] += e.clientX - lastPosX;
            vpt[5] += e.clientY - lastPosY;
            canvas.requestRenderAll();
            lastPosX = e.clientX;
            lastPosY = e.clientY;
            canvas.setCursor('grabbing');
        } else if (isSpaceDown) {
            canvas.setCursor('grab');
        }
    });

    // mouse:up is redundant but safe to keep for Fabric events
    canvas.on('mouse:up', function () {
        if (isDragging) {
            isDragging = false;
            canvas.selection = true;
            canvas.setCursor(isSpaceDown ? 'grab' : 'default');
        }
    });
}

function setZoom(val) {
    if (val < 0.1) val = 0.1;
    if (val > 5) val = 5;
    currentZoom = val;
    canvas.setZoom(val);
    updateZoomDisplay();
}

function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = Math.round(currentZoom * 100) + '%';
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggle-layer-panel');
    const closeBtn = document.getElementById('close-layer-panel');
    const panel = document.getElementById('layer-panel');

    const openPanel = () => {
        panel.classList.add('open');
        toggleBtn.classList.add('hidden');
    };

    const closePanel = () => {
        panel.classList.remove('open');
        toggleBtn.classList.remove('hidden');
    };

    if (toggleBtn) toggleBtn.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    // Initially open?
    openPanel();
}


function setupEventListeners() {
    // Upload - same logic but different positioning
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('image-upload');
    if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleUpload);

    // Text Input
    const textInput = document.getElementById('bubble-text');
    if (textInput) {
        textInput.addEventListener('input', (e) => updateBubbleText(e.target.value));
    }

    // Colors
    const bgPick = document.getElementById('bg-color-picker');
    const borderPick = document.getElementById('border-color-picker');
    if (bgPick) bgPick.addEventListener('input', updateBubbleColors);
    if (borderPick) borderPick.addEventListener('input', updateBubbleColors);

    // Scale
    const scaleInput = document.getElementById('bubble-scale');
    const resetScale = document.getElementById('reset-bubble-scale');
    if (scaleInput) {
        scaleInput.addEventListener('input', (e) => {
            if (currentBubbleGroup) {
                currentBubbleGroup.scale(parseFloat(e.target.value));
                canvas.renderAll();
            }
        });
    }
    if (resetScale) {
        resetScale.addEventListener('click', () => {
            if (currentBubbleGroup) {
                currentBubbleGroup.scale(1.0);
                if (scaleInput) scaleInput.value = 1.0;
                canvas.renderAll();
            }
        });
    }

    // Opacity
    const opacityInput = document.getElementById('layer-opacity');
    if (opacityInput) {
        opacityInput.addEventListener('input', (e) => {
            const active = canvas.getActiveObject();
            if (active) {
                active.set('opacity', e.target.value / 100);
                canvas.renderAll();
            }
        });
    }

    // Selection Events
    canvas.on('selection:created', onSelectionChanged);
    canvas.on('selection:updated', onSelectionChanged);
    canvas.on('selection:cleared', onSelectionChanged);

    // Objects Events
    canvas.on('object:added', updateLayerList);
    canvas.on('object:removed', updateLayerList);
    canvas.on('object:moved', updateLayerList);

    // Save/Clear
    document.getElementById('save-btn').addEventListener('click', saveCanvas);
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);

    // Modify Add Bubble
    const addBubble = document.getElementById('add-bubble-btn');
    if (addBubble) addBubble.addEventListener('click', () => addSpeechBubble());

    // Rotation Reset
    const resetRotationBtn = document.getElementById('reset-rotation-btn');
    if (resetRotationBtn) {
        resetRotationBtn.addEventListener('click', resetRotation);
    }
}

function onSelectionChanged() {
    const active = canvas.getActiveObject();
    const opacityInput = document.getElementById('layer-opacity');
    const scaleInput = document.getElementById('bubble-scale');

    if (active) {
        if (opacityInput) opacityInput.value = (active.opacity || 1) * 100;

        // Identify bubble
        let bubble = null;
        if (active.type === 'group' && active.item(1) instanceof fabric.Textbox) {
            bubble = active;
        }

        currentBubbleGroup = bubble;

        if (bubble && scaleInput) {
            scaleInput.value = bubble.scaleX.toFixed(2);
        }
    } else {
        currentBubbleGroup = null;
    }
    updateLayerList();
}

function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
        fabric.Image.fromURL(f.target.result, (img) => {
            // Fit to 400x400 max initially
            const scale = Math.min(400 / img.width, 400 / img.height);
            img.scale(scale);

            // Center in 512x512 with center origin
            img.set({
                left: CANVAS_SIZE / 2,
                top: CANVAS_SIZE / 2,
                originX: 'center',
                originY: 'center'
            });

            canvas.add(img);
            keepUIOnTop();
            canvas.setActiveObject(img);
            canvas.renderAll();
        });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
}

function addSpeechBubble() {
    const textElem = document.getElementById('bubble-text');
    const defaultText = textElem ? textElem.value : "Hello!";
    const bgColor = document.getElementById('bg-color-picker').value;
    const borderColor = document.getElementById('border-color-picker').value;

    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const rgbaBg = `rgba(${r}, ${g}, ${b}, 0.9)`;

    const text = new fabric.Textbox(defaultText, {
        fontSize: 24,
        fill: '#ffffff',
        fontFamily: 'Noto Sans JP',
        selectable: false,
        width: 380,
        textAlign: 'center',
        splitByGrapheme: true,
        originX: 'center',
        originY: 'center'
    });

    const rect = new fabric.Rect({
        fill: rgbaBg,
        stroke: borderColor === bgColor ? null : borderColor,
        strokeWidth: 1.5,
        rx: CORNER_RADIUS,
        ry: CORNER_RADIUS,
        selectable: false,
        originX: 'center',
        originY: 'center'
    });

    // Initial grouping - center of Artboard
    const group = new fabric.Group([rect, text], {
        left: CANVAS_SIZE / 2,
        top: CANVAS_SIZE / 2 + 50,
        originX: 'center',
        originY: 'center',
        selectable: true,
    });

    currentBubbleGroup = group;
    // Trick: we need to add to canvas to calculate bounds correctly for updateBubbleDesign
    canvas.add(group);

    updateBubbleDesign(); // Correct sizes
    keepUIOnTop();
    canvas.setActiveObject(group);
    canvas.renderAll();
}

function updateBubbleText(val) {
    if (!currentBubbleGroup) return;
    const text = currentBubbleGroup.item(1);
    text.set('text', val);
    updateBubbleDesign();
}

function updateBubbleDesign() {
    if (!currentBubbleGroup) return;
    const rect = currentBubbleGroup.item(0);
    const text = currentBubbleGroup.item(1);

    // We used origin center, so calculations are relative to center
    // However, text layout needs width check
    let maxW = 0;
    const lines = text._textLines.length;
    for (let i = 0; i < lines; i++) {
        const w = text.getLineWidth(i);
        if (w > maxW) maxW = w;
    }

    const w = maxW + BUBBLE_PADDING * 2;
    const h = text.getScaledHeight() + BUBBLE_PADDING * 2;

    rect.set({ width: w, height: h });
    // Text is already centered in group

    // Force Group update
    currentBubbleGroup.addWithUpdate();
    canvas.renderAll();
}

function updateBubbleColors() {
    if (!currentBubbleGroup) return;
    const bgColor = document.getElementById('bg-color-picker').value;
    const borderColor = document.getElementById('border-color-picker').value;

    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const rgbaBg = `rgba(${r}, ${g}, ${b}, 0.9)`;

    currentBubbleGroup.item(0).set({
        fill: rgbaBg,
        stroke: borderColor === bgColor ? null : borderColor
    });
    canvas.renderAll();
}

function addShape(type) {
    let shape;
    // Map of specific default colors for each decoration type
    const defaultColors = {
        'star': '#fcc419',   // Gold/Yellow
        'heart': '#ff8787',  // Pink
        'sparkle': '#a5d8ff' // Sky Blue
    };
    const color = defaultColors[type] || '#ffffff';

    if (type === 'star') {
        // 5-point star construction
        const points = [];
        const num = 5;
        for (let i = 0; i < num * 2; i++) {
            const r = (i % 2 === 0) ? 30 : 15;
            const a = (i * Math.PI) / num;
            points.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
        }
        shape = new fabric.Polygon(points, { fill: color, name: 'deco_star' });
    } else if (type === 'heart') {
        const path = "M 272 238 C 206 238 152 292 152 358 C 152 493 288 528 381 662 C 468 524 609 490 609 358 C 609 292 556 238 489 238 C 441 238 400 267 381 307 C 362 267 320 238 272 238 z";
        shape = new fabric.Path(path, { fill: color, scaleX: 0.15, scaleY: 0.15, name: 'deco_heart' });
    } else if (type === 'sparkle') {
        const points = [];
        const num = 4;
        for (let i = 0; i < num * 2; i++) {
            const r = (i % 2 === 0) ? 30 : 6;
            const a = (i * Math.PI) / num;
            points.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
        }
        shape = new fabric.Polygon(points, { fill: color, name: 'deco_sparkle' });
    }

    if (shape) {
        shape.set({
            left: CANVAS_SIZE / 2,
            top: CANVAS_SIZE / 2,
            originX: 'center',
            originY: 'center',
            cornerColor: '#4ade80',
            transparentCorners: false,
            cornerStyle: 'circle'
        });
        canvas.add(shape);
        keepUIOnTop();
        canvas.setActiveObject(shape);
    }
}

function keepUIOnTop() {
    const ui = canvas.getObjects().filter(o => ['shroud_item', 'guide_border'].includes(o.name));
    ui.forEach(o => o.bringToFront());
}

function updateLayerList() {
    const container = document.getElementById('layer-list');
    if (!container) return;
    container.innerHTML = '';

    // Reverse order for UI (Top layer first)
    // Filter out UI elements
    const layers = canvas.getObjects().filter(o =>
        !['shroud_item', 'guide_border', 'artboard_bg'].includes(o.name)
    ).reverse();

    const active = canvas.getActiveObject();

    layers.forEach(obj => {
        const idx = canvas.getObjects().indexOf(obj); // Real index
        const div = document.createElement('div');
        div.className = 'layer-item' + (active === obj ? ' active' : '');

        // Extract counter if exists in obj.name (e.g. "Name (2)")
        let counter = "";
        if (obj.name) {
            const match = obj.name.match(/ \((\d+)\)$/);
            if (match) counter = ` (${match[1]})`;
        }

        // Name generation & Decoration check
        let name = "Object";
        let isDeco = false;

        if (obj.name && obj.name.includes('deco_')) {
            isDeco = true;
            const typeLabel = obj.name.includes('star') ? '★ Star' : obj.name.includes('heart') ? '♥ Heart' : '✨ Sparkle';
            name = typeLabel + counter;
        } else if (obj.name && obj.name.includes('emoji_')) {
            isDeco = false; // No color picker for emojis
            name = `😀 ${obj.text}` + counter;
        } else if (obj.type === 'image') {
            name = '🖼 Image' + counter;
        } else if (obj.type === 'group' && obj.item(1)) {
            const text = obj.item(1).text;
            name = `💬 ${text.substring(0, 8)}${text.length > 8 ? '...' : ''}` + counter;
        } else {
            // Fallback for generic objects
            name = (obj.name || "Object") + (obj.name && obj.name.includes('(') ? "" : counter);
        }

        const colorPickerHTML = isDeco ? `
            <input type="color" value="${obj.fill}" class="layer-color-picker" title="色を変更" style="width:20px; height:20px; border:none; padding:0; background:none; cursor:pointer;">
        ` : '';

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                ${colorPickerHTML}
                <span>${name}</span>
            </div>
            <div class="layer-controls">
                <button onclick="cloneLayer(${idx})">📄</button>
                <button onclick="deleteLayer(${idx})" style="background-color: #fa5252;">✕</button>
            </div>
        `;

        // Event Listeners for Color Picker
        if (isDeco) {
            const picker = div.querySelector('.layer-color-picker');
            picker.addEventListener('input', (e) => {
                obj.set('fill', e.target.value);
                canvas.renderAll();
            });
            picker.addEventListener('click', (e) => e.stopPropagation());
        }

        div.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.classList.contains('layer-color-picker')) {
                canvas.setActiveObject(obj);
                canvas.renderAll();
            }
        });

        // Setup Drag & Drop (simplified for brevity)
        div.draggable = true;
        div.addEventListener('dragstart', (e) => { e.dataTransfer.setData('idx', idx); div.classList.add('dragging'); });
        div.addEventListener('dragend', () => div.classList.remove('dragging'));
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            const srcIdx = parseInt(e.dataTransfer.getData('idx'));
            if (srcIdx !== idx) {
                canvas.moveTo(canvas.getObjects()[srcIdx], idx);
                keepUIOnTop();
                updateLayerList();
            }
        });
        div.addEventListener('dragover', e => e.preventDefault());

        container.appendChild(div);
    });
}

function clearCanvas() {
    if (!confirm('リセットしますか？')) return;
    canvas.clear();
    canvas.setBackgroundColor('#1a1b1e');
    setupBasics();
    addSpeechBubble();
    updateLayerList();
}

function saveCanvas() {
    canvas.discardActiveObject();

    // Backup current viewport state
    const originalVpt = [...canvas.viewportTransform];

    // Hide UI elements
    const ui = canvas.getObjects().filter(o => ['shroud_item', 'guide_border', 'artboard_bg'].includes(o.name));
    ui.forEach(o => o.visible = false);

    // Reset zoom/pan for export to ensure (0,0, 512,512) is the artboard
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.renderAll();

    const sizeSelect = document.getElementById('export-size');
    const size = sizeSelect ? parseInt(sizeSelect.value) : 512;
    const mult = size / CANVAS_SIZE;

    // Export 0,0, 512,512 (Artboard area)
    const data = canvas.toDataURL({
        left: 0,
        top: 0,
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        format: 'png',
        multiplier: mult
    });

    // Restore UI and Viewport
    ui.forEach(o => o.visible = true);
    canvas.setViewportTransform(originalVpt);
    canvas.renderAll();

    // Trigger download
    const a = document.createElement('a');
    a.href = data;
    a.download = `vrc_sticker_${size}.png`;
    a.click();
}

// Global exposure for HTML inline clicks
window.addShape = addShape;
window.cloneLayer = function (idx) {
    const objects = canvas.getObjects();
    const obj = objects[idx];
    if (!obj) return;

    // Prevent cloning UI elements
    if (['shroud_item', 'guide_border', 'artboard_bg'].includes(obj.name)) {
        return;
    }

    obj.clone((cloned) => {
        canvas.discardActiveObject();

        // Handle naming
        let baseName = obj.name || (obj.type === 'image' ? "画像" : (obj.type === 'group' ? "吹き出し" : "オブジェクト"));

        // Simple heuristic for unnamed bubbles
        if (!obj.name && obj.type === 'group' && obj.item(1)) {
            baseName = "吹き出し";
        }

        const match = baseName.match(/(.+) \((\d+)\)$/);
        let newName;
        if (match) {
            newName = `${match[1]} (${parseInt(match[2]) + 1})`;
        } else {
            newName = `${baseName} (2)`;
        }

        cloned.set({
            left: cloned.left + 20,
            top: cloned.top + 20,
            evented: true,
            name: newName
        });

        if (cloned.type === 'activeSelection') {
            cloned.canvas = canvas;
            cloned.forEachObject((o) => canvas.add(o));
            cloned.setCoords();
        } else {
            // Insert exactly above the original
            canvas.insertAt(cloned, idx + 1);
        }

        canvas.setActiveObject(cloned);
        keepUIOnTop();
        canvas.renderAll();
        // Force update to reflect new order
        updateLayerList();
    });
};

function initEmojiPicker() {
    const emojis = [
        // Faces
        "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
        // Hearts & Symbols
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨", "🌟", "⭐", "💫", "🔥", "💥", "💢", "💦", "💨", "❗", "❓", "❕", "❔", "⚠️", "🚩", "🏁", "🎯", "🎵", "🎶", "💬", "💭", "🗯", "💤", "🔔", "⭐", "💮", "💯",
        // Hands & Objects
        "🙏", "🤲", "👐", "🙌", "👏", "🤝", "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "👈", "👉", "👆", "👇", "✋", "🤚", "🖐", "🖖", "👋", "🤙", "💪", "🤳", "💅", "💎", "💍", "🎁", "🎈", "🎉", "🎊", "🎀", "🧧", "🧿", "🩹", "🩺", "🎨", "🎭", "🎮", "🕹", "📱", "💻", "📷", "📸", "💡", "🔦", "🕯", "🧹", "🧺", "🧼", "🪒", "🧴",
        // Nature & Animals
        "🌸", "🏵️", "🌹", "🌺", "🌻", "🌼", "🌷", "🌱", "🌲", "🌳", "🌴", "🌵", "🌿", "🍀", "☘️", "🍂", "🍁", "🍄", "🐚", "🌑", "🌒", "🌓", "🌔", "🌕", "🌙", "🌍", "🌈", "☀️", "☁️", "⛈️", "❄️", "⛄", "🌊", "🐱", "🐶", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐒", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦗", "🕷", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈",
        // Food & Drink
        "🍔", "🍟", "🍕", "🥗", "🥪", "🌮", "🌯", "🍜", "🍣", "🍱", "🥟", "🍤", "🍙", "🍚", "🍛", "🍢", "🍳", "🥖", "🥐", "🥨", "🥞", "🧇", "🧀", "🥩", "🍗", "🍖", "🥦", "🌽", "🥕", "🍓", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🥝", "🫐", "🍒", "🍑", "🥭", "🍍", "🥥", "🍿", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍦", "🍧", "🍨", "🍵", "☕", "🥛", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹"
    ];

    const picker = document.getElementById('emoji-picker');
    const list = document.getElementById('emoji-list');
    const openBtn = document.getElementById('add-emoji-btn');
    const closeBtn = document.getElementById('close-emoji-picker');

    if (!list || !openBtn || !closeBtn) return;

    emojis.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.innerText = char;
        btn.onclick = () => {
            addEmoji(char);
            picker.classList.add('hidden');
        };
        list.appendChild(btn);
    });

    openBtn.onclick = () => picker.classList.toggle('hidden');
    closeBtn.onclick = () => picker.classList.add('hidden');
}

async function addEmoji(char) {
    // Ensure font is loaded
    try {
        await document.fonts.load('1em Noto Color Emoji');
    } catch (e) {
        console.warn('Emoji font load failed, falling back to OS.', e);
    }

    const emoji = new fabric.Text(char, {
        left: CANVAS_SIZE / 2,
        top: CANVAS_SIZE / 2,
        fontSize: 100,
        fontFamily: "'Noto Color Emoji', sans-serif",
        originX: 'center',
        originY: 'center',
        name: 'emoji_' + char
    });

    canvas.add(emoji);
    canvas.setActiveObject(emoji);
    keepUIOnTop();
    canvas.renderAll();
    updateLayerList();
}

function resetRotation() {
    const active = canvas.getActiveObject();
    if (active) {
        active.set('angle', 0);
        active.setCoords();
        canvas.renderAll();
    }
}

window.deleteLayer = function (idx) {
    const obj = canvas.getObjects()[idx];
    if (obj) {
        canvas.remove(obj);
        keepUIOnTop();
        updateLayerList();
    }
};
