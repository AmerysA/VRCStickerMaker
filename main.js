// Constants
const CANVAS_SIZE = 512;
const WORK_WIDTH = 1440;  // Wide workspace for landscape images
const WORK_HEIGHT = 800;   // Height managed for 1080p
const OFFSET_X = (WORK_WIDTH - CANVAS_SIZE) / 2;
const OFFSET_Y = (WORK_HEIGHT - CANVAS_SIZE) / 2;
const BUBBLE_PADDING = 16;
const CORNER_RADIUS = 12;

// State
let canvas;
let currentBubbleGroup;

// Configure Fabric globals
if (typeof fabric !== 'undefined') {
    fabric.Object.prototype.perPixelTargetFind = true; // Click through transparent pixels
    fabric.Object.prototype.targetFindTolerance = 4;
    fabric.Object.prototype.lockUniScaling = true;    // Force proportional scaling
    fabric.Object.prototype.lockScalingFlip = true;   // Prevent inversion/flipping

    // Hide middle-side controls to prevent confusion
    fabric.Object.prototype.setControlsVisibility({
        mt: false, mb: false, ml: false, mr: false
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing...');
    if (typeof fabric === 'undefined') {
        console.error('Fabric.js not found! Ensure you have an internet connection for the CDN.');
        alert('Fabric.jsの読み込みに失敗しました。インターネット接続を確認してください。');
        return;
    }
    initCanvas();
    setupEventListeners();
    addSpeechBubble();
});

function initCanvas() {
    canvas = new fabric.Canvas('canvas', {
        width: WORK_WIDTH,
        height: WORK_HEIGHT,
        backgroundColor: '#1a1b1e',
        preserveObjectStacking: true
    });
    setupBasics();
}

function setupBasics() {
    // Clear old ones if they exist (for safety during reset)
    const existing = canvas.getObjects().filter(o => ['artboard_bg', 'shroud_group', 'guide_border'].includes(o.name));
    existing.forEach(o => canvas.remove(o));

    // Artboard background (Checkerboard for transparency visualization)
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
        left: OFFSET_X,
        top: OFFSET_Y,
        fill: new fabric.Pattern({ source: checkerCanvas, repeat: 'repeat' }),
        selectable: false,
        evented: false,
        name: 'artboard_bg'
    });
    canvas.add(artboardBG);

    // Create Shroud (4 rectangles to dim the out-of-bounds area)
    const shroudStyle = {
        fill: 'rgba(0, 0, 0, 0.6)',
        selectable: false,
        evented: false
    };

    const topShroud = new fabric.Rect({ ...shroudStyle, left: 0, top: 0, width: WORK_WIDTH, height: OFFSET_Y });
    const bottomShroud = new fabric.Rect({ ...shroudStyle, left: 0, top: OFFSET_Y + CANVAS_SIZE, width: WORK_WIDTH, height: OFFSET_Y });
    const leftShroud = new fabric.Rect({ ...shroudStyle, left: 0, top: OFFSET_Y, width: OFFSET_X, height: CANVAS_SIZE });
    const rightShroud = new fabric.Rect({ ...shroudStyle, left: OFFSET_X + CANVAS_SIZE, top: OFFSET_Y, width: OFFSET_X, height: CANVAS_SIZE });

    const shroudGroup = new fabric.Group([topShroud, bottomShroud, leftShroud, rightShroud], {
        selectable: false,
        evented: false,
        name: 'shroud_group'
    });
    canvas.add(shroudGroup);

    // Dotted border
    const guide = new fabric.Rect({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        left: OFFSET_X,
        top: OFFSET_Y,
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

function setupEventListeners() {
    // Upload
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('image-upload');
    if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleUpload);

    // Text Input
    const textInput = document.getElementById('bubble-text');
    if (textInput) {
        textInput.addEventListener('input', (e) => {
            updateBubbleText(e.target.value);
        });
    }

    // Opacity control
    const opacityInput = document.getElementById('layer-opacity');
    if (opacityInput) {
        opacityInput.addEventListener('input', (e) => {
            const activeObject = canvas.getActiveObject();
            if (activeObject) {
                activeObject.set('opacity', e.target.value / 100);
                canvas.renderAll();
            }
        });
    }

    // Color Pickers
    const bgColorPicker = document.getElementById('bg-color-picker');
    const borderOutlinePicker = document.getElementById('border-color-picker');
    if (bgColorPicker) bgColorPicker.addEventListener('input', updateBubbleColors);
    if (borderOutlinePicker) borderOutlinePicker.addEventListener('input', updateBubbleColors);

    // Bubble Scale
    const bubbleScaleInput = document.getElementById('bubble-scale');
    const resetBubbleScaleBtn = document.getElementById('reset-bubble-scale');

    if (bubbleScaleInput) {
        bubbleScaleInput.addEventListener('input', (e) => {
            if (currentBubbleGroup) {
                currentBubbleGroup.set({
                    scaleX: parseFloat(e.target.value),
                    scaleY: parseFloat(e.target.value)
                });
                canvas.renderAll();
            }
        });
    }

    if (resetBubbleScaleBtn) {
        resetBubbleScaleBtn.addEventListener('click', () => {
            if (currentBubbleGroup) {
                currentBubbleGroup.set({
                    scaleX: 1.0,
                    scaleY: 1.0
                });
                if (bubbleScaleInput) bubbleScaleInput.value = 1.0;
                canvas.renderAll();
            }
        });
    }

    // Layer list update events
    canvas.on('object:added', updateLayerList);
    canvas.on('object:removed', updateLayerList);
    canvas.on('object:moved', updateLayerList);
    canvas.on('object:scaling', (e) => {
        const obj = e.target;
        if (obj === currentBubbleGroup && bubbleScaleInput) {
            bubbleScaleInput.value = obj.scaleX.toFixed(2);
        }
    });

    canvas.on('selection:created', (e) => {
        if (e.selected && e.selected[0]) {
            const obj = e.selected[0];
            if (opacityInput) opacityInput.value = (obj.opacity || 1) * 100;
            if (obj === currentBubbleGroup && bubbleScaleInput) {
                bubbleScaleInput.value = currentBubbleGroup.scaleX.toFixed(2);
            }
            // Update currentBubbleGroup if a bubble is selected
            if (obj.type === 'group' && obj.item(1) instanceof fabric.Textbox) {
                currentBubbleGroup = obj;
            }
        }
        updateLayerList();
    });
    canvas.on('selection:updated', (e) => {
        if (e.selected && e.selected[0]) {
            const obj = e.selected[0];
            if (opacityInput) opacityInput.value = (obj.opacity || 1) * 100;
            if (obj === currentBubbleGroup && bubbleScaleInput) {
                bubbleScaleInput.value = currentBubbleGroup.scaleX.toFixed(2);
            }
            // Update currentBubbleGroup if a bubble is selected
            if (obj.type === 'group' && obj.item(1) instanceof fabric.Textbox) {
                currentBubbleGroup = obj;
            }
        }
        updateLayerList();
    });
    canvas.on('selection:cleared', updateLayerList);

    // Save
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveCanvas);

    // Add Bubble button
    const addBubbleBtn = document.getElementById('add-bubble-btn');
    if (addBubbleBtn) addBubbleBtn.addEventListener('click', () => addSpeechBubble());

    // Clear
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm('全てのレイヤーを削除してリセットしますか？')) return;

            canvas.clear();
            canvas.setBackgroundColor('#1a1b1e', canvas.renderAll.bind(canvas));

            // Reset state
            currentBubbleGroup = null;

            // Reset DOM
            if (textInput) textInput.value = "Hello!";
            if (bubbleScaleInput) bubbleScaleInput.value = 1.0;
            if (opacityInput) opacityInput.value = 100;

            const bgPick = document.getElementById('bg-color-picker');
            const borderPick = document.getElementById('border-color-picker');
            if (bgPick) bgPick.value = "#3a4454";
            if (borderPick) borderPick.value = "#3a4454";

            setupBasics(); // Re-add workspace UI
            addSpeechBubble();
            updateLayerList();
        });
    }
}

function keepUIOnTop() {
    const shroudGroup = canvas.getObjects().find(o => o.name === 'shroud_group');
    const guideBorder = canvas.getObjects().find(o => o.name === 'guide_border');
    if (shroudGroup) canvas.bringToFront(shroudGroup);
    if (guideBorder) canvas.bringToFront(guideBorder);
}

function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
        fabric.Image.fromURL(f.target.result, (img) => {
            const scale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height) * 0.8;
            img.scale(scale);
            img.set({
                left: OFFSET_X + (CANVAS_SIZE - img.getScaledWidth()) / 2,
                top: OFFSET_Y + (CANVAS_SIZE - img.getScaledHeight()) / 2,
                cornerColor: '#4ade80',
                cornerStrokeColor: '#1a1b1e',
                transparentCorners: false,
                cornerStyle: 'circle'
            });

            canvas.add(img);
            canvas.sendToBack(img);

            const artboardBG = canvas.getObjects().find(o => o.name === 'artboard_bg');
            if (artboardBG) canvas.sendToBack(artboardBG);

            keepUIOnTop();
            canvas.setActiveObject(img);
            canvas.renderAll();
            updateLayerList();
        });
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Allow re-uploading same file
}

function addSpeechBubble() {
    const textElem = document.getElementById('bubble-text');
    const defaultText = textElem ? textElem.value : "Hello!";
    const bgColor = document.getElementById('bg-color-picker').value;
    const borderColor = document.getElementById('border-color-picker').value;
    const maxWidth = 380; // Standard max width

    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const rgbaBg = `rgba(${r}, ${g}, ${b}, 0.9)`;

    const text = new fabric.Textbox(defaultText, {
        fontSize: 24,
        fill: '#ffffff',
        fontFamily: 'Noto Sans JP',
        selectable: false,
        width: maxWidth,
        textAlign: 'center',
        splitByGrapheme: true
    });

    const rect = new fabric.Rect({
        fill: rgbaBg,
        stroke: borderColor === bgColor ? null : borderColor,
        strokeWidth: 1.5,
        rx: CORNER_RADIUS,
        ry: CORNER_RADIUS,
        selectable: false
    });

    const group = new fabric.Group([rect, text], {
        left: OFFSET_X + CANVAS_SIZE / 2,
        top: OFFSET_Y + 100,
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: true
    });

    // Disable rotation for bubble as we want it upright usually
    group.setControlsVisibility({ mtr: false });

    currentBubbleGroup = group;
    updateBubbleDesign();
    canvas.add(group);
    keepUIOnTop();
    canvas.setActiveObject(group);
    canvas.renderAll();
    updateLayerList();
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

    let actualMaxLineWidth = 0;
    const lineCount = text._textLines.length;
    for (let i = 0; i < lineCount; i++) {
        const lineWidth = text.getLineWidth(i);
        if (lineWidth > actualMaxLineWidth) {
            actualMaxLineWidth = lineWidth;
        }
    }

    const textWidth = actualMaxLineWidth;
    const textHeight = text.getScaledHeight();
    const bgWidth = textWidth + BUBBLE_PADDING * 2;
    const bgHeight = textHeight + BUBBLE_PADDING * 2;

    rect.set({
        width: bgWidth,
        height: bgHeight,
        left: -bgWidth / 2,
        top: -bgHeight / 2
    });

    text.set({
        left: -text.getScaledWidth() / 2,
        top: -textHeight / 2
    });

    currentBubbleGroup.set({
        width: bgWidth,
        height: bgHeight
    });

    currentBubbleGroup.setCoords();
    canvas.renderAll();
}

function updateLayerList() {
    const listContainer = document.getElementById('layer-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const objects = canvas.getObjects().filter(o =>
        !['shroud_group', 'guide_border', 'artboard_bg'].includes(o.name)
    ).reverse();

    const activeObject = canvas.getActiveObject();

    objects.forEach((obj) => {
        const actualIndex = canvas.getObjects().indexOf(obj);
        const item = document.createElement('div');
        item.className = 'layer-item' + (activeObject === obj ? ' active' : '');

        let name = obj.name || "オブジェクト";
        let isDeco = false;

        // Determine display name and deco status
        if (obj.type === 'image' && !obj.name) name = "画像";

        if (obj.name && obj.name.includes('deco_')) {
            isDeco = true;
            name = obj.name
                .replace('deco_star', 'デコ: 星')
                .replace('deco_heart', 'デコ: ハート')
                .replace('deco_sparkle', 'デコ: キラキラ');
        }

        if (obj.type === 'group' || obj.type === 'textbox') {
            const textItem = obj.type === 'group' ? obj.item(1) : obj;
            const textSource = textItem ? textItem.text : "";
            const bubbleLabel = "吹き出し: " + (textSource.substring(0, 10) + (textSource.length > 10 ? "..." : ""));
            // For bubbles, we always show text content, but can append copy number if it exists in obj.name
            const match = obj.name ? obj.name.match(/ \((\d+)\)$/) : null;
            name = bubbleLabel + (match ? match[0] : "");
        }

        const colorPickerHTML = isDeco ? `
            <input type="color" value="${obj.fill}" class="layer-color-picker" title="色を変更">
        ` : '';

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                ${colorPickerHTML}
                <span>${name}</span>
            </div>
            <div class="layer-controls">
                <button onclick="cloneLayerByObjIndex(${actualIndex})" title="複製" style="background-color: #228be6;">📄</button>
                <button onclick="deleteLayerByObjIndex(${actualIndex})" title="削除" style="background-color: #fa5252;">✕</button>
            </div>
        `;

        if (isDeco) {
            const picker = item.querySelector('.layer-color-picker');
            picker.addEventListener('input', (e) => {
                obj.set('fill', e.target.value);
                canvas.renderAll();
            });
            picker.addEventListener('click', (e) => e.stopPropagation());
        }

        // Drag and Drop implementation
        item.setAttribute('draggable', true);
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', actualIndex);
            item.classList.add('dragging');
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            const allItems = listContainer.querySelectorAll('.layer-item');
            allItems.forEach(i => i.classList.remove('drag-over'));
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const targetIndex = actualIndex;
            if (sourceIndex !== targetIndex) {
                const sourceObj = canvas.getObjects()[sourceIndex];
                if (sourceObj) {
                    canvas.moveTo(sourceObj, targetIndex);
                    keepUIOnTop();
                    canvas.renderAll();
                    updateLayerList();
                }
            }
        });

        item.addEventListener('click', (e) => {
            if (e.target.closest('.layer-controls') || e.target.closest('.layer-color-picker')) return;
            canvas.setActiveObject(obj);
            canvas.renderAll();
        });
        listContainer.appendChild(item);
    });
}

window.cloneLayerByObjIndex = function (index) {
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (!obj) return;

    // Prevent cloning UI elements
    if (['shroud_group', 'guide_border', 'artboard_bg'].includes(obj.name)) {
        console.warn("UI elements cannot be cloned.");
        return;
    }

    obj.clone((cloned) => {
        canvas.discardActiveObject();

        // Handle naming
        let baseName = obj.name || (obj.type === 'image' ? "画像" : (obj.type === 'group' ? "吹き出し" : "オブジェクト"));
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
            canvas.insertAt(cloned, index + 1);
        }

        canvas.setActiveObject(cloned);
        keepUIOnTop();
        canvas.renderAll();
        updateLayerList();
    });
};

window.deleteLayerByObjIndex = function (index) {
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (!obj) return;

    canvas.remove(obj);
    if (obj === currentBubbleGroup) currentBubbleGroup = null;

    canvas.renderAll();
    updateLayerList();
};


window.addShape = function (type) {
    let shape;
    const color = document.getElementById('bg-color-picker').value;

    if (type === 'star') {
        // 5-point star
        const points = [];
        const numPoints = 5;
        const outRadius = 30;
        const innerRadius = 15;
        for (let i = 0; i < numPoints * 2; i++) {
            const r = (i % 2 === 0) ? outRadius : innerRadius;
            const a = (i * Math.PI) / numPoints;
            points.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
        }
        shape = new fabric.Polygon(points, {
            fill: color,
            name: 'deco_star'
        });
    } else if (type === 'heart') {
        const path = "M 272.70141,238.71731 C 206.46141,238.71731 152.70141,292.47731 152.70141,358.71731 C 152.70141,493.47282 288.63461,528.80461 381.26381,662.02535 C 468.83811,524.97599 609.82611,490.11135 609.82611,358.71731 C 609.82611,292.47731 556.06611,238.71731 489.82611,238.71731 C 441.77851,238.71731 400.42481,267.08774 381.26381,307.90481 C 362.10281,267.08774 320.74911,238.71731 272.70141,238.71731 z ";
        shape = new fabric.Path(path, {
            fill: color,
            scaleX: 0.15,
            scaleY: 0.15,
            name: 'deco_heart'
        });
    } else if (type === 'sparkle') {
        const points = [];
        const numPoints = 4;
        const outRadius = 30;
        const innerRadius = 6;
        for (let i = 0; i < numPoints * 2; i++) {
            const r = (i % 2 === 0) ? outRadius : innerRadius;
            const a = (i * Math.PI) / numPoints;
            points.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
        }
        shape = new fabric.Polygon(points, {
            fill: color,
            name: 'deco_sparkle'
        });
    }

    if (shape) {
        shape.set({
            left: OFFSET_X + CANVAS_SIZE / 2,
            top: OFFSET_Y + CANVAS_SIZE / 2,
            originX: 'center',
            originY: 'center',
            cornerColor: '#4ade80',
            cornerStyle: 'circle',
            transparentCorners: false,
            hasControls: true
        });
        // Explicitly ensure rotation is visible (mtr)
        shape.setControlsVisibility({ mtr: true });

        canvas.add(shape);
        canvas.setActiveObject(shape);
        keepUIOnTop();
        canvas.renderAll();
        updateLayerList();
    }
};

function updateBubbleColors() {
    const bgColor = document.getElementById('bg-color-picker').value;
    const borderColor = document.getElementById('border-color-picker').value;

    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const rgbaBg = `rgba(${r}, ${g}, ${b}, 0.9)`;

    if (!currentBubbleGroup) return;

    const rect = currentBubbleGroup.item(0);
    rect.set({
        fill: rgbaBg,
        stroke: borderColor === bgColor ? null : borderColor,
    });
    canvas.renderAll();
}

function saveCanvas() {
    canvas.discardActiveObject();
    const uiElements = canvas.getObjects().filter(o => ['shroud_group', 'guide_border', 'artboard_bg'].includes(o.name));
    uiElements.forEach(el => el.set('visible', false));
    canvas.renderAll();

    // Calculate multiplier based on selected export size
    const exportSizeSelect = document.getElementById('export-size');
    const targetSize = exportSizeSelect ? parseInt(exportSizeSelect.value) : 512;
    const exportMultiplier = targetSize / CANVAS_SIZE;

    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1.0,
        left: OFFSET_X,
        top: OFFSET_Y,
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        multiplier: exportMultiplier
    });

    uiElements.forEach(el => el.set('visible', true));
    canvas.renderAll();

    const link = document.createElement('a');
    link.download = `vrc_sticker_${targetSize}px.png`;
    link.href = dataURL;
    link.click();
}
