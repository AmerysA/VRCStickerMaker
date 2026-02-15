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
let avatarImage;

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
            if (opacityInput) opacityInput.value = (e.selected[0].opacity || 1) * 100;
            if (e.selected[0] === currentBubbleGroup && bubbleScaleInput) {
                bubbleScaleInput.value = currentBubbleGroup.scaleX.toFixed(2);
            }
        }
        updateLayerList();
    });
    canvas.on('selection:updated', (e) => {
        if (e.selected && e.selected[0]) {
            if (opacityInput) opacityInput.value = (e.selected[0].opacity || 1) * 100;
            if (e.selected[0] === currentBubbleGroup && bubbleScaleInput) {
                bubbleScaleInput.value = currentBubbleGroup.scaleX.toFixed(2);
            }
        }
        updateLayerList();
    });
    canvas.on('selection:cleared', updateLayerList);

    // Save
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveCanvas);

    // Clear
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            canvas.clear();
            avatarImage = null;
            if (bubbleScaleInput) bubbleScaleInput.value = 1.0;
            initCanvas(); // Re-initialize shroud and guide
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
            if (avatarImage) canvas.remove(avatarImage);
            avatarImage = img;

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
        });
    };
    reader.readAsDataURL(file);
}

function addSpeechBubble() {
    const textElem = document.getElementById('bubble-text');
    const defaultText = textElem ? textElem.value : "Hello VRChat!";
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

        let name = "オブジェクト";
        if (obj.type === 'image') name = "アバター画像";
        if (obj.type === 'group' || obj.type === 'textbox') {
            const textSource = obj.type === 'group' ? obj.item(1).text : obj.text;
            name = "吹き出し: " + (textSource.substring(0, 10) + (textSource.length > 10 ? "..." : ""));
        }

        item.innerHTML = `
            <span>${name}</span>
            <div class="layer-controls">
                <button onclick="moveLayer(${actualIndex}, 'up')">↑</button>
                <button onclick="moveLayer(${actualIndex}, 'down')">↓</button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.layer-controls')) return;
            canvas.setActiveObject(obj);
            canvas.renderAll();
        });
        listContainer.appendChild(item);
    });
}

window.moveLayer = function (index, direction) {
    const objects = canvas.getObjects();
    const obj = objects[index];
    if (!obj) return;

    if (direction === 'up' && index < objects.length - 1) {
        canvas.moveTo(obj, index + 1);
    } else if (direction === 'down' && index > 0) {
        // Don't move below artboard_bg
        const artboardBG = canvas.getObjects().find(o => o.name === 'artboard_bg');
        const minIndex = artboardBG ? canvas.getObjects().indexOf(artboardBG) + 1 : 0;
        if (index > minIndex) {
            canvas.moveTo(obj, index - 1);
        }
    }
    keepUIOnTop();
    canvas.renderAll();
    updateLayerList();
};

function updateBubbleColors() {
    if (!currentBubbleGroup) return;
    const bgColor = document.getElementById('bg-color-picker').value;
    const borderColor = document.getElementById('border-color-picker').value;

    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const rgbaBg = `rgba(${r}, ${g}, ${b}, 0.9)`;

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
    link.download = `vrc_plus_sticker_${targetSize}px.png`;
    link.href = dataURL;
    link.click();
}
