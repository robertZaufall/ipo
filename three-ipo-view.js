import * as THREE from './vendor/three.module.min.js';

const X_SPAN = 46;
const ROW_GAP = 0.92;
const GAP_SLOT_WIDTH = 2.5;
const INTERVAL_MINUTES = 5;
const LONG_GAP_MINUTES = 15;
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const AFTER_HOURS_END_MINUTES = 20 * 60;
const DAY_MINUTES = 24 * 60;
const PREMARKET_START_MINUTES = DAY_MINUTES + 4 * 60;
const SECOND_DAY_OPEN_MINUTES = DAY_MINUTES + MARKET_OPEN_MINUTES;
const SESSION_GAP_WIDTH = 5;
const LOW_MARKER_MIN_GAP_MINUTES = 60;
const PATH_CAMERA_YAW = -0.72;
const PATH_CAMERA_PITCH = 0.52;
const FLAT_CAMERA_YAW = -0.72;
const FLAT_CAMERA_PITCH = 0.82;
const DEFAULT_CAMERA_ZOOM_OUT = 1.45;
const FLAT_SCALE_MAJOR_TEXT = '#a1a1aa';
const FLAT_SCALE_MINOR_TEXT = '#71717a';

const colors = {
    bg: 0x09090b,
    grid: 0x27272a,
    gridStrong: 0x3f3f46,
    zero: 0x60a5fa,
    median: 0x38bdf8,
    buyWindow: 0x22c55e,
    low: 0xf59e0b,
    start: 0xd4d4d8,
    positive: 0x22c55e,
    negative: 0xf97316,
    neutral: 0x94a3b8,
    highlight: 0xffffff
};

const lowMarkerStyles = {
    regular: {
        color: colors.low,
        text: '#fbbf24',
        border: 'rgba(245, 158, 11, 0.6)',
        shortLabel: 'R',
        label: 'Regular low'
    },
    afterHours: {
        color: colors.median,
        text: '#7dd3fc',
        border: 'rgba(56, 189, 248, 0.58)',
        shortLabel: 'AH',
        label: 'After-hours low'
    },
    premarket: {
        color: 0x2dd4bf,
        text: '#99f6e4',
        border: 'rgba(45, 212, 191, 0.58)',
        shortLabel: 'PM',
        label: 'Premarket low'
    },
    secondOpen: {
        color: colors.highlight,
        text: '#f8fafc',
        border: 'rgba(255, 255, 255, 0.58)',
        shortLabel: 'D2',
        label: 'D2 open low'
    },
    secondDay: {
        color: 0xbfdbfe,
        text: '#bfdbfe',
        border: 'rgba(147, 197, 253, 0.58)',
        shortLabel: 'D2',
        label: 'Day 2 low'
    }
};

const state = {
    open: false,
    view: 'paths',
    mode: 'day1',
    renderer: null,
    scene: null,
    camera: null,
    world: null,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    pickables: [],
    recordObjects: new Map(),
    pathLines: [],
    lowMarkers: [],
    lowLabels: [],
    selectedCandleGroup: null,
    flatSelectionArrow: null,
    sceneTweens: [],
    hoveredRecord: null,
    dragging: false,
    dragX: 0,
    dragY: 0,
    yaw: -0.72,
    pitch: 0.52,
    distance: 58,
    target: new THREE.Vector3(0, 0, 0),
    frameId: null,
    lastFrameTime: 0,
    interacted: false,
    resizeObserver: null,
    dataset: null,
    entryCompact: false,
    symbolListVisible: true,
    quickReadVisible: true,
    scalePanelVisible: true,
    selectedPanelVisible: true,
    flatLowActive: false,
    flatLowAlignment: 'open',
    flatPinnedTicker: '',
    isolatedTicker: '',
    alignmentBeforeIsolation: '',
    selectedTicker: ''
};

function pageApi() {
    return window.ipoThreeSceneApi || null;
}

function byId(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lerp(start, end, progress) {
    return start + (end - start) * progress;
}

function easeOutCubic(progress) {
    const t = clamp(progress, 0, 1);
    return 1 - ((1 - t) ** 3);
}

function fmtPct(value) {
    if (!Number.isFinite(value)) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function fmtUsd(value) {
    if (!Number.isFinite(value)) return '-';
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtVolume(value) {
    if (!Number.isFinite(value) || value <= 0) return '-';
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    return String(Math.round(value));
}

function formatElapsed(minutes) {
    if (!Number.isFinite(minutes)) return '-';
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours}h ${String(mins).padStart(2, '0')}m`;
    return hours ? `${hours}h` : `${mins}m`;
}

function formatElapsedCompact(minutes) {
    if (!Number.isFinite(minutes)) return '-';
    const total = Math.max(0, Math.round(minutes));
    if (total === 0) return '0m';
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return hours ? (mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`) : `${mins}m`;
}

function formatClockFromMinute(minute) {
    if (!Number.isFinite(minute)) return '-';
    const dayMinute = ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(dayMinute / 60);
    const mins = dayMinute % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function ipoYear(record) {
    const year = String(record?.ipo?.date || '').slice(0, 4);
    return /^\d{4}$/.test(year) ? year : '';
}

function formatCountdownToClose(minute) {
    const dayMinute = minuteOfDay(minute);
    if (!Number.isFinite(dayMinute)) return '-';
    const remaining = Math.max(0, MARKET_CLOSE_MINUTES - dayMinute);
    if (remaining <= 0) return 'Close';
    const hours = Math.floor(remaining / 60);
    const mins = remaining % 60;
    return `T-${hours}h${String(mins).padStart(2, '0')}m`;
}

function minuteOfDay(minute) {
    if (!Number.isFinite(minute)) return null;
    return ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function sessionMinuteForPoint(point, ipoDate) {
    const dayMinute = minuteOfDay(point.minute);
    if (!Number.isFinite(dayMinute)) return null;
    if (point.date && ipoDate && point.date !== ipoDate) {
        return DAY_MINUTES + dayMinute;
    }
    return dayMinute;
}

function formatLowTiming(record) {
    const point = record?.lowPoint3d;
    const sessionMinute = asNumber(point?.sessionMinute);
    if (Number.isFinite(sessionMinute)) {
        const clock = formatClockFromMinute(sessionMinute);
        if (sessionMinute >= SECOND_DAY_OPEN_MINUTES) return `D2 ${clock}`;
        if (sessionMinute >= PREMARKET_START_MINUTES) return `premarket ${clock}`;
        if (sessionMinute >= MARKET_CLOSE_MINUTES) return `after-hours ${clock}`;
    }
    return formatElapsed(record?.lowDelta);
}

function formatSessionMoment(sessionMinute) {
    if (!Number.isFinite(sessionMinute)) return '';
    const clock = formatClockFromMinute(sessionMinute);
    if (sessionMinute >= SECOND_DAY_OPEN_MINUTES) return `D2 ${clock}`;
    if (sessionMinute >= PREMARKET_START_MINUTES) return `Pre D2 ${clock}`;
    if (sessionMinute >= MARKET_CLOSE_MINUTES) return `D1 Ext ${clock}`;
    return `D1 ${clock}`;
}

function mapModeConfig(value = state.mode) {
    if (value === 'd1ExtD2') {
        return {
            id: 'd1ExtD2',
            chartMode: 'd1ExtD2',
            analysisMode: 'd1ExtD2',
            label: 'Day 1 + Ext + Day 2',
            shortLabel: 'D1 Ext D2',
            includeExtended: true,
            includeSecondDay: true
        };
    }
    if (value === 'd1D2') {
        return {
            id: 'd1D2',
            chartMode: 'd1D2',
            analysisMode: 'd1D2',
            label: 'Day 1 + Day 2',
            shortLabel: 'D1 D2',
            includeExtended: false,
            includeSecondDay: true
        };
    }
    if (value === 'extended') {
        return {
            id: 'extended',
            chartMode: 'd1Ext',
            analysisMode: 'd1Ext',
            label: 'Day 1 + extended',
            shortLabel: 'Ext',
            includeExtended: true,
            includeSecondDay: false
        };
    }
    return {
        id: 'day1',
        chartMode: 'day1',
        analysisMode: 'day1',
        label: 'Day 1',
        shortLabel: 'Day 1',
        includeExtended: false,
        includeSecondDay: false
    };
}

function hasMultiSession(config = mapModeConfig()) {
    return Boolean(config.includeExtended || config.includeSecondDay);
}

function pathSessionWidths(config = mapModeConfig()) {
    if (config.includeExtended && config.includeSecondDay) {
        const bridgeWidth = 28;
        const gapWidth = 2.35;
        const regularWidth = 44;
        const secondRegularWidth = Math.max(1, 100 - regularWidth - bridgeWidth - gapWidth);
        return { regularWidth, bridgeWidth, gapWidth, secondRegularWidth };
    }
    if (config.includeExtended) {
        const regularWidth = 55;
        const gapWidth = 2.35;
        const bridgeWidth = Math.max(1, 100 - regularWidth - gapWidth);
        return { regularWidth, bridgeWidth, gapWidth, secondRegularWidth: 0 };
    }
    if (config.includeSecondDay) {
        const regularWidth = 52;
        const gapWidth = 3.2;
        const secondRegularWidth = Math.max(1, 100 - regularWidth - gapWidth);
        return { regularWidth, bridgeWidth: 0, gapWidth, secondRegularWidth };
    }
    return { regularWidth: 100, bridgeWidth: 0, gapWidth: 0, secondRegularWidth: 0 };
}

function averageNumber(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function medianNumber(values) {
    const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!valid.length) return null;
    const middle = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function modeValue(values) {
    const counts = new Map();
    values.filter(Boolean).forEach(value => {
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || '';
}

function extremeRecord(records, score, direction = 'max') {
    return records.reduce((best, record) => {
        const value = score(record);
        if (!Number.isFinite(value)) return best;
        if (!best) return { record, value };
        return direction === 'min'
            ? (value < best.value ? { record, value } : best)
            : (value > best.value ? { record, value } : best);
    }, null);
}

function pctToneClass(value) {
    if (!Number.isFinite(value)) return 'text-zinc-300';
    if (value >= 0) return 'text-emerald-400';
    return 'text-orange-400';
}

function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function makeLabelSprite(text, options = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = options.fontSize || 28;
    const paddingX = options.paddingX ?? 16;
    const paddingY = options.paddingY ?? 9;
    const fontWeight = options.fontWeight || 700;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`;
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width + paddingX * 2);
    const height = Math.ceil(fontSize + paddingY * 2);
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    ctx.scale(dpr, dpr);
    ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    if (options.background !== 'transparent') {
        roundedRectPath(ctx, 0.5, 0.5, width - 1, height - 1, options.radius || 10);
        ctx.fillStyle = options.background || 'rgba(9, 9, 11, 0.82)';
        ctx.fill();
        ctx.strokeStyle = options.border || 'rgba(63, 63, 70, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    if (options.textStroke) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = options.textStrokeWidth || 3;
        ctx.strokeStyle = options.textStroke;
        ctx.strokeText(text, paddingX, height / 2 + 0.5);
    }
    ctx.fillStyle = options.color || '#d4d4d8';
    ctx.fillText(text, paddingX, height / 2 + 0.5);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: options.depthTest ?? false,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const worldWidth = options.worldWidth || Math.min(options.maxWidth || 5, Math.max(options.minWidth || 1.4, text.length * (options.widthFactor || 0.11)));
    sprite.scale.set(worldWidth, worldWidth * (height / width), 1);
    sprite.renderOrder = options.renderOrder || 10;
    return sprite;
}

function cleanBars(rows) {
    return rows
        .map(row => ({
            date: row.date || '',
            time: row.time || '',
            minute: asNumber(row.minute),
            open: asNumber(row.open),
            high: asNumber(row.high),
            low: asNumber(row.low),
            close: asNumber(row.close),
            volume: asNumber(row.volume),
            session: row.session || 'regular'
        }))
        .filter(row => Number.isFinite(row.minute)
            && Number.isFinite(row.open)
            && Number.isFinite(row.high)
            && Number.isFinite(row.low)
            && Number.isFinite(row.close)
            && row.open > 0
            && row.high > 0
            && row.low > 0
            && row.close > 0)
        .sort((a, b) => a.minute - b.minute);
}

function compressedPoints(bars, basePrice) {
    let plot = 0;
    return bars.map((bar, index) => {
        if (index > 0) {
            const previous = bars[index - 1];
            const delta = Math.max(0, bar.minute - previous.minute);
            plot += delta > INTERVAL_MINUTES * 1.5
                ? (delta - INTERVAL_MINUTES >= LONG_GAP_MINUTES ? GAP_SLOT_WIDTH : Math.max(delta / INTERVAL_MINUTES, 1))
                : 1;
        }
        const pctClose = (bar.close / basePrice - 1) * 100;
        const pctHigh = (bar.high / basePrice - 1) * 100;
        const pctLow = (bar.low / basePrice - 1) * 100;
        return {
            ...bar,
            plot,
            deltaMinutes: bar.minute - bars[0].minute,
            pctClose,
            pctHigh,
            pctLow
        };
    });
}

function buildRecord(ipo, bars, index) {
    const cleaned = cleanBars(bars);
    if (cleaned.length < 2) return null;
    const basePrice = cleaned[0].open || cleaned[0].close;
    if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
    const points = compressedPoints(cleaned, basePrice);
    points.forEach(point => {
        point.sessionMinute = sessionMinuteForPoint(point, ipo.date);
    });
    const firstSessionMinute = points[0].sessionMinute;
    points.forEach(point => {
        point.sessionDeltaMinutes = Number.isFinite(point.sessionMinute) && Number.isFinite(firstSessionMinute)
            ? point.sessionMinute - firstSessionMinute
            : point.deltaMinutes;
    });
    const startAnchor = {
        ...points[0],
        plot: 0,
        deltaMinutes: 0,
        sessionDeltaMinutes: 0,
        pctClose: 0,
        pctHigh: 0,
        pctLow: 0,
        isStartAnchor: true
    };
    const last = points[points.length - 1];
    const lowPoint = points.reduce((best, point) => point.pctLow < best.pctLow ? point : best, points[0]);
    const highPoint = points.reduce((best, point) => point.pctHigh > best.pctHigh ? point : best, points[0]);
    const regularLast = [...points].reverse().find(point => point.minute <= MARKET_CLOSE_MINUTES) || last;
    const ticker = String(ipo.ticker || '').toUpperCase();
    return {
        ipo,
        ticker,
        name: ipo.name || ticker,
        index,
        points,
        visualPoints: [startAnchor, ...points],
        basePrice,
        startTime: points[0].time,
        endTime: last.time,
        dayEndPct: (regularLast.close / basePrice - 1) * 100,
        endPct: last.pctClose,
        lowPct: lowPoint.pctLow,
        lowPrice: lowPoint.low,
        lowDelta: lowPoint.sessionDeltaMinutes,
        lowSessionMinute: lowPoint.sessionMinute,
        highPct: highPoint.pctHigh,
        firstBarPct: points[0].pctClose,
        rangePct: highPoint.pctHigh - lowPoint.pctLow,
        reboundFromLowPct: (regularLast.close / basePrice - 1) * 100 - lowPoint.pctLow,
        dayEndDelta: regularLast.deltaMinutes,
        dayEndPlot: regularLast.plot,
        dayEndTime: regularLast.time,
        dayEndPrice: regularLast.close,
        barsCount: points.length,
        plotEnd: last.plot,
        color: returnColor((regularLast.close / basePrice - 1) * 100)
    };
}

function returnColor(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.25) return new THREE.Color(colors.neutral);
    const intensity = Math.min(Math.abs(value) / 18, 1);
    const base = new THREE.Color(value >= 0 ? colors.positive : colors.negative);
    const dim = new THREE.Color(colors.neutral);
    return dim.lerp(base, 0.45 + intensity * 0.55);
}

function niceReturnLevels(min, max) {
    const span = Math.max(1, max - min);
    const rawStep = span / 5;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const start = Math.ceil(min / step) * step;
    const levels = [];
    for (let value = start; value <= max + step * 0.5; value += step) {
        levels.push(Number(value.toFixed(6)));
    }
    if (!levels.some(value => Math.abs(value) < step * 0.2) && min <= 0 && max >= 0) {
        levels.push(0);
        levels.sort((a, b) => a - b);
    }
    return levels.slice(0, 8);
}

function buildInsights(records) {
    const winners = records.filter(record => record.dayEndPct >= 0).length;
    const lateLows = records.filter(record => record.lowDelta >= 120).length;
    const firstHourLows = records.filter(record => record.lowDelta <= 60).length;
    const belowMinus10 = records.filter(record => record.lowPct <= -10).length;
    const avgDayEnd = averageNumber(records.map(record => record.dayEndPct));
    const medianDayEnd = medianNumber(records.map(record => record.dayEndPct));
    const basePrices = records.map(record => record.basePrice).filter(Number.isFinite);
    const closeDeltas = records.map(record => record.dayEndDelta).filter(Number.isFinite);
    const closeTimes = records.map(record => record.dayEndTime).filter(Boolean);
    return {
        winners,
        losers: records.length - winners,
        lateLows,
        firstHourLows,
        belowMinus10,
        avgDayEnd,
        medianDayEnd,
        avgCloseDelta: averageNumber(closeDeltas),
        medianCloseDelta: medianNumber(closeDeltas),
        commonCloseTime: modeValue(closeTimes),
        basePriceMin: basePrices.length ? Math.min(...basePrices) : null,
        basePriceMax: basePrices.length ? Math.max(...basePrices) : null,
        bestClose: extremeRecord(records, record => record.dayEndPct, 'max'),
        worstClose: extremeRecord(records, record => record.dayEndPct, 'min'),
        deepestLow: extremeRecord(records, record => record.lowPct, 'min'),
        latestLow: extremeRecord(records, record => record.lowDelta, 'max'),
        widestRange: extremeRecord(records, record => record.rangePct, 'max'),
        bestRecovery: extremeRecord(records, record => record.reboundFromLowPct, 'max'),
        biggestFirstBar: extremeRecord(records, record => Math.abs(record.firstBarPct), 'max')
    };
}

function entryPointAtOrAfter(record, targetDelta) {
    if (!Number.isFinite(targetDelta)) return null;
    return record.points
        .filter(point => Number.isFinite(point.deltaMinutes) && Number.isFinite(point.open) && point.deltaMinutes >= targetDelta)
        .sort((a, b) => a.deltaMinutes - b.deltaMinutes)[0] || null;
}

function buildEntryScenarios(records, medianMinutes) {
    const definitions = [
        { id: 'open', label: 'Open', targetDelta: 0 },
        { id: 'median', label: 'Median', targetDelta: medianMinutes },
        { id: 'thirty', label: '30m', targetDelta: 30 },
        { id: 'sixty', label: '1h', targetDelta: 60 },
        { id: 'twoHour', label: '2h', targetDelta: 120 }
    ].filter(definition => Number.isFinite(definition.targetDelta));
    const scenarios = definitions.map(definition => {
        const rows = records.map(record => {
            const entry = entryPointAtOrAfter(record, definition.targetDelta);
            const dayEndPrice = record.dayEndPrice;
            if (!entry || !Number.isFinite(dayEndPrice) || !Number.isFinite(entry.open) || entry.open <= 0 || !Number.isFinite(record.lowPrice) || record.lowPrice <= 0) return null;
            return {
                dayEndReturn: (dayEndPrice / entry.open - 1) * 100,
                gapToLow: (entry.open / record.lowPrice - 1) * 100,
                lowStillAhead: record.lowDelta >= entry.deltaMinutes - 0.1
            };
        }).filter(Boolean);
        const returns = rows.map(row => row.dayEndReturn);
        const gaps = rows.map(row => row.gapToLow);
        const contained5 = rows.length ? rows.filter(row => row.dayEndReturn > -5).length / rows.length * 100 : null;
        const contained10 = rows.length ? rows.filter(row => row.dayEndReturn > -10).length / rows.length * 100 : null;
        const lowStillAheadPct = rows.length ? rows.filter(row => row.lowStillAhead).length / rows.length * 100 : null;
        return {
            ...definition,
            sampleSize: rows.length,
            avgReturn: averageNumber(returns),
            medianReturn: medianNumber(returns),
            avgGapToLow: averageNumber(gaps),
            medianGapToLow: medianNumber(gaps),
            contained5,
            contained10,
            lowStillAheadPct
        };
    }).filter(scenario => scenario.sampleSize >= Math.max(3, records.length * 0.5) && Number.isFinite(scenario.avgReturn));
    const best = extremeRecord(scenarios, scenario => scenario.avgReturn, 'max');
    const balanced = extremeRecord(scenarios, scenario => (
        scenario.avgReturn
        - Math.max(0, scenario.avgGapToLow || 0) * 0.18
        + (scenario.contained5 || 0) * 0.025
        + (scenario.lowStillAheadPct || 0) * 0.012
    ), 'max');
    return {
        scenarios,
        best: best ? best.record : null,
        balanced: balanced ? balanced.record : null
    };
}

function lowestPoint(points) {
    return points.reduce((best, point) => {
        if (!point || !Number.isFinite(point.pctLow)) return best;
        if (!best || point.pctLow < best.pctLow) return point;
        return best;
    }, null);
}

function chartNearLowPoints(points) {
    const valid = points
        .filter(point => Number.isFinite(point?.low)
            && Number.isFinite(point?.high)
            && Number.isFinite(point?.pctLow)
            && Number.isFinite(point?.sessionMinute)
            && !(point.session === 'extended' && point.sessionMinute === MARKET_CLOSE_MINUTES));
    const lowPoint = lowestPoint(valid);
    if (!lowPoint) return [];
    const high = Math.max(...valid.map(point => point.high).filter(Number.isFinite));
    const lowBand = Math.max(Math.abs(lowPoint.low) * 0.01, (high - lowPoint.low) * 0.015);
    const lowCandidates = valid
        .filter(point => point.low <= lowPoint.low + lowBand)
        .sort((a, b) => a.low - b.low || a.sessionMinute - b.sessionMinute);
    const markers = [];
    for (const point of lowCandidates) {
        if (markers.every(marker => Math.abs(point.sessionMinute - marker.sessionMinute) >= LOW_MARKER_MIN_GAP_MINUTES)) {
            markers.push(point);
        }
    }
    return markers.sort((a, b) => a.sessionMinute - b.sessionMinute);
}

function lowMarkerIdForPoint(point) {
    if (!Number.isFinite(point?.sessionMinute)) return 'regular';
    if (point.session === 'secondDay') return 'secondDay';
    if (point.session !== 'extended') return 'regular';
    if (point.sessionMinute > MARKET_CLOSE_MINUTES && point.sessionMinute <= AFTER_HOURS_END_MINUTES) return 'afterHours';
    if (point.sessionMinute >= PREMARKET_START_MINUTES && point.sessionMinute < SECOND_DAY_OPEN_MINUTES) return 'premarket';
    if (point.sessionMinute >= SECOND_DAY_OPEN_MINUTES) return 'secondOpen';
    return 'regular';
}

function lowMarkerSpec(id, point) {
    if (!point) return null;
    const style = lowMarkerStyles[id] || lowMarkerStyles.regular;
    return {
        id,
        point,
        color: style.color,
        text: style.text,
        border: style.border,
        shortLabel: style.shortLabel,
        label: style.label
    };
}

function labelRepeatedLowSpecs(specs) {
    const counts = specs.reduce((map, spec) => {
        map.set(spec.id, (map.get(spec.id) || 0) + 1);
        return map;
    }, new Map());
    const seen = new Map();
    return specs.map(spec => {
        const count = counts.get(spec.id) || 0;
        if (count <= 1) return spec;
        const next = (seen.get(spec.id) || 0) + 1;
        seen.set(spec.id, next);
        return {
            ...spec,
            shortLabel: `${spec.shortLabel}${/\d$/.test(spec.shortLabel) ? ' ' : ''}${next}`
        };
    });
}

function recordLowMarkerSpecs(record, config = mapModeConfig()) {
    const regularPoints = record.points.filter(point => point.session !== 'extended' && point.session !== 'secondDay');
    const regularSpecs = chartNearLowPoints(regularPoints)
        .map(point => lowMarkerSpec('regular', point))
        .filter(Boolean);
    const extendedSpecs = config.includeExtended
        ? chartNearLowPoints(record.points)
            .filter(point => point.session === 'extended')
            .map(point => lowMarkerSpec(lowMarkerIdForPoint(point), point))
            .filter(Boolean)
        : [];
    const secondDaySpecs = config.includeSecondDay
        ? chartNearLowPoints(record.points)
            .filter(point => point.session === 'secondDay')
            .map(point => lowMarkerSpec(lowMarkerIdForPoint(point), point))
            .filter(Boolean)
        : [];
    const candidates = [...regularSpecs, ...extendedSpecs, ...secondDaySpecs];

    const seen = new Set();
    const unique = candidates.filter(spec => {
        const key = `${spec.point.date || ''}:${spec.point.time || ''}:${spec.point.minute}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const fallbackPoint = lowestPoint(record.points.filter(point => point.session !== 'extended' && point.session !== 'secondDay')) || record.lowPoint3d;
    const fallback = [lowMarkerSpec(lowMarkerIdForPoint(fallbackPoint), fallbackPoint)].filter(Boolean);
    return labelRepeatedLowSpecs(unique.length ? unique : fallback);
}

function flatLowMarkerSpecs(record) {
    const specs = record?.lowMarkerSpecs3d?.length
        ? record.lowMarkerSpecs3d
        : [lowMarkerSpec('regular', record?.lowPoint3d)].filter(Boolean);
    return specs.filter(spec => spec.id !== 'secondOpen');
}

function flatLowMarkerCount(dataset) {
    return (dataset?.records || []).reduce((total, record) => total + flatLowMarkerSpecs(record).length, 0);
}

function buildSessionTimeline(records, config = mapModeConfig()) {
    const includeExtended = Boolean(config.includeExtended);
    const includeSecondDay = Boolean(config.includeSecondDay);
    const includeShared = includeExtended || includeSecondDay;
    const regularMinutes = records
        .flatMap(record => record.points)
        .filter(point => point.session !== 'extended' && point.session !== 'secondDay' && Number.isFinite(point.sessionMinute))
        .map(point => point.sessionMinute);
    const firstRegularMinute = regularMinutes.length
        ? Math.min(...regularMinutes)
        : MARKET_OPEN_MINUTES;
    const regularStart = Math.max(MARKET_OPEN_MINUTES, Math.min(firstRegularMinute, MARKET_CLOSE_MINUTES - INTERVAL_MINUTES));
    const regularSpan = Math.max(INTERVAL_MINUTES, MARKET_CLOSE_MINUTES - regularStart);
    const afterSpan = includeExtended ? AFTER_HOURS_END_MINUTES - MARKET_CLOSE_MINUTES : 0;
    const preSpan = includeExtended ? SECOND_DAY_OPEN_MINUTES - PREMARKET_START_MINUTES : 0;
    const secondDayMinutes = includeSecondDay
        ? records.flatMap(record => record.points)
            .filter(point => point.session === 'secondDay' && Number.isFinite(point.sessionMinute))
            .map(point => point.sessionMinute)
        : [];
    const secondMaxMinute = secondDayMinutes.length ? Math.max(...secondDayMinutes) : SECOND_DAY_OPEN_MINUTES;
    const secondRegularSpan = includeSecondDay ? Math.max(0, secondMaxMinute - SECOND_DAY_OPEN_MINUTES) : 0;
    const gapStart = regularSpan + afterSpan;
    const preStart = gapStart + (includeShared ? SESSION_GAP_WIDTH : 0);
    const secondOpen = includeExtended ? preStart + preSpan : preStart;
    const domainEnd = includeShared ? secondOpen + secondRegularSpan : regularSpan;

    const minuteToPlot = minute => {
        if (!Number.isFinite(minute)) return 0;
        if (minute <= MARKET_CLOSE_MINUTES) {
            return Math.max(0, Math.min(regularSpan, minute - regularStart));
        }
        if (!includeShared) return regularSpan;
        if (includeExtended && minute <= AFTER_HOURS_END_MINUTES) {
            return regularSpan + Math.max(0, minute - MARKET_CLOSE_MINUTES);
        }
        if (includeExtended && minute < PREMARKET_START_MINUTES) {
            return gapStart + SESSION_GAP_WIDTH / 2;
        }
        if (includeExtended && minute <= SECOND_DAY_OPEN_MINUTES) {
            return preStart + Math.max(0, minute - PREMARKET_START_MINUTES);
        }
        if (includeSecondDay && minute >= SECOND_DAY_OPEN_MINUTES) {
            return secondOpen + Math.max(0, minute - SECOND_DAY_OPEN_MINUTES);
        }
        return secondOpen;
    };

    return {
        includeExtended,
        includeSecondDay,
        includeShared,
        regularStart,
        regularEnd: regularSpan,
        marketClose: regularSpan,
        afterStart: regularSpan,
        afterEnd: regularSpan + afterSpan,
        gapStart,
        gapEnd: preStart,
        preStart,
        preEnd: secondOpen,
        secondOpen,
        end: Math.max(domainEnd, regularSpan),
        minuteToPlot
    };
}

function maxRegularDurationForRecords(records) {
    const durations = records.map(record => record.dayEndDelta).filter(Number.isFinite);
    return Math.max(120, Math.min(390, Math.ceil(Math.max(...durations, 300) / 30) * 30));
}

function alignmentMode(value = state.flatLowAlignment) {
    if (value === 'close') return 'close';
    if (value === 'openClose') return 'openClose';
    return 'open';
}

function enterIsolatedRender(ticker) {
    if (!ticker) return;
    if (!state.isolatedTicker) {
        state.alignmentBeforeIsolation = alignmentMode();
    }
    state.isolatedTicker = ticker;
    state.flatLowAlignment = 'close';
}

function leaveIsolatedRender() {
    if (state.alignmentBeforeIsolation) {
        state.flatLowAlignment = state.alignmentBeforeIsolation;
    }
    state.alignmentBeforeIsolation = '';
    state.isolatedTicker = '';
}

function regularPhaseProgress(record, point) {
    const duration = Number.isFinite(record?.dayEndDelta) && record.dayEndDelta > 0
        ? record.dayEndDelta
        : null;
    const elapsed = Number.isFinite(point?.sessionDeltaMinutes)
        ? point.sessionDeltaMinutes
        : (Number.isFinite(point?.deltaMinutes) ? point.deltaMinutes : null);
    if (!Number.isFinite(duration) || !Number.isFinite(elapsed)) return 0;
    return clamp(elapsed / Math.max(duration, INTERVAL_MINUTES), 0, 1);
}

function buildPathTimeline(records, config = mapModeConfig(), sessionTimeline) {
    const includeExtended = Boolean(config.includeExtended);
    const includeSecondDay = Boolean(config.includeSecondDay);
    const includeShared = includeExtended || includeSecondDay;
    const alignment = alignmentMode();
    const maxRegularDuration = maxRegularDurationForRecords(records);
    const { regularWidth, bridgeWidth, gapWidth, secondRegularWidth } = pathSessionWidths(config);
    const afterSpan = AFTER_HOURS_END_MINUTES - MARKET_CLOSE_MINUTES;
    const preSpan = SECOND_DAY_OPEN_MINUTES - PREMARKET_START_MINUTES;
    const afterWidth = includeExtended ? bridgeWidth * (afterSpan / Math.max(afterSpan + preSpan, 1)) : 0;
    const preStart = regularWidth + afterWidth + gapWidth;
    const preWidth = includeExtended ? bridgeWidth - afterWidth : 0;
    const secondOpen = includeExtended ? preStart + preWidth : preStart;
    const domainEnd = includeSecondDay
        ? secondOpen + secondRegularWidth
        : (includeExtended ? secondOpen : regularWidth);
    const regularClockSpan = MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES;
    const elapsedToPlot = minutes => {
        const progress = clamp((Number(minutes) || 0) / maxRegularDuration, 0, 1);
        return progress * regularWidth;
    };
    const progressToPlot = progress => clamp(Number(progress) || 0, 0, 1) * regularWidth;
    const stretchedPointToPlot = (record, point) => progressToPlot(regularPhaseProgress(record, point));
    const regularClockToPlot = minute => {
        const dayMinute = minuteOfDay(minute);
        const progress = Number.isFinite(dayMinute)
            ? clamp((dayMinute - MARKET_OPEN_MINUTES) / Math.max(regularClockSpan, 1), 0, 1)
            : 0;
        return progress * regularWidth;
    };
    const sharedMinuteToPlot = minute => {
        if (!includeShared) return regularWidth;
        if (!Number.isFinite(minute)) return regularWidth;
        if (includeExtended && minute <= AFTER_HOURS_END_MINUTES) {
            const progress = clamp((minute - MARKET_CLOSE_MINUTES) / Math.max(afterSpan, 1), 0, 1);
            return regularWidth + progress * afterWidth;
        }
        if (includeExtended && minute < PREMARKET_START_MINUTES) {
            return regularWidth + afterWidth + gapWidth / 2;
        }
        if (includeExtended && minute <= SECOND_DAY_OPEN_MINUTES) {
            const progress = clamp((minute - PREMARKET_START_MINUTES) / Math.max(preSpan, 1), 0, 1);
            return preStart + progress * preWidth;
        }
        if (includeSecondDay && minute >= SECOND_DAY_OPEN_MINUTES) {
            const progress = clamp((minute - SECOND_DAY_OPEN_MINUTES) / Math.max(MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES, 1), 0, 1);
            return secondOpen + progress * secondRegularWidth;
        }
        return domainEnd;
    };
    const minuteToPlot = minute => {
        if (!Number.isFinite(minute)) return 0;
        if (minute <= MARKET_CLOSE_MINUTES) return regularClockToPlot(minute);
        return sharedMinuteToPlot(minute);
    };

    return {
        alignment,
        includeExtended,
        includeSecondDay,
        includeShared,
        maxRegularDuration,
        regularStart: alignment === 'close' ? MARKET_OPEN_MINUTES : 0,
        regularEnd: regularWidth,
        marketClose: regularWidth,
        afterStart: regularWidth,
        afterEnd: regularWidth + afterWidth,
        gapStart: regularWidth + afterWidth,
        gapEnd: preStart,
        preStart,
        preEnd: includeExtended ? secondOpen : preStart,
        secondOpen,
        end: domainEnd,
        elapsedToPlot,
        progressToPlot,
        minuteToPlot,
        pointToPlot: (record, point) => {
            const isShared = includeShared
                && (point?.session === 'extended' || point?.session === 'secondDay' || point?.sessionMinute >= SECOND_DAY_OPEN_MINUTES)
                && Number.isFinite(point.sessionMinute)
                && point.sessionMinute > MARKET_CLOSE_MINUTES;
            if (isShared) return sharedMinuteToPlot(point.sessionMinute);
            if (alignment === 'close') return regularClockToPlot(point?.sessionMinute);
            if (alignment === 'openClose') return stretchedPointToPlot(record, point);
            return elapsedToPlot(Number.isFinite(point?.sessionDeltaMinutes) ? point.sessionDeltaMinutes : point?.deltaMinutes);
        }
    };
}

function buildDataset() {
    const api = pageApi();
    if (!api) return null;

    const visible = api.getVisibleIpos?.() || [];
    const hasExtendedData = visible.some(ipo => api.hasExtendedChartData?.(ipo.ticker));
    const hasSecondDayData = visible.some(ipo => api.hasSecondDayChartData?.(ipo.ticker));
    if (state.mode === 'd1ExtD2' && !(hasExtendedData && hasSecondDayData)) {
        state.mode = hasSecondDayData ? 'd1D2' : (hasExtendedData ? 'extended' : 'day1');
    }
    if (!hasSecondDayData && state.mode === 'd1D2') {
        state.mode = hasExtendedData ? 'extended' : 'day1';
    }
    if (!hasExtendedData && state.mode === 'extended') {
        state.mode = 'day1';
    }
    const config = mapModeConfig();
    const label = api.getAnalysisLabelForRange?.(config.analysisMode)
        || api.getCurrentAnalysisLabel?.()
        || '$5B+ IPOs';
    const records = visible
        .map((ipo, index) => buildRecord(ipo, api.getChartData?.(ipo.ticker, config.chartMode) || [], index))
        .filter(Boolean)
        .sort((a, b) => String(a.ipo.date || '').localeCompare(String(b.ipo.date || ''))
            || (a.ipo.marketCap || 0) - (b.ipo.marketCap || 0)
            || a.ticker.localeCompare(b.ticker));

    if (!records.length) {
        return {
            records: [],
            hasExtended: hasExtendedData,
            hasSecondDay: hasSecondDayData,
            mode: config.id,
            modeConfig: config,
            label
        };
    }

    const sessionTimeline = buildSessionTimeline(records, config);
    const timeline = buildPathTimeline(records, config, sessionTimeline);
    const maxPlot = Math.max(timeline.end, 1);
    const allReturns = records.flatMap(record => record.points.flatMap(point => [point.pctLow, point.pctHigh]));
    let minReturn = Math.min(...allReturns);
    let maxReturn = Math.max(...allReturns);
    if (!Number.isFinite(minReturn) || !Number.isFinite(maxReturn)) {
        minReturn = -10;
        maxReturn = 10;
    }
    if (maxReturn - minReturn < 8) {
        const mid = (maxReturn + minReturn) / 2;
        minReturn = mid - 4;
        maxReturn = mid + 4;
    }
    const pad = Math.max(2.5, (maxReturn - minReturn) * 0.1);
    minReturn -= pad;
    maxReturn += pad;

    const yRange = Math.max(1, maxReturn - minReturn);
    const ySpan = Math.min(30, Math.max(18, records.length > 38 ? 28 : 24));
    const zSpan = Math.max((records.length - 1) * ROW_GAP, 1);
    const toX = plot => (plot / maxPlot) * X_SPAN - X_SPAN / 2;
    const toY = pct => ((pct - minReturn) / yRange - 0.5) * ySpan;
    const toZ = row => zSpan / 2 - row * ROW_GAP;

    records.forEach((record, rowIndex) => {
        record.rowIndex = rowIndex;
        record.z = toZ(rowIndex);
        record.points.forEach(point => {
            point.sessionPlot = sessionTimeline.minuteToPlot(point.sessionMinute);
            point.pathPlot = timeline.pointToPlot(record, point);
            point.x = toX(point.pathPlot);
            point.y = toY(point.pctClose);
            point.yHigh = toY(point.pctHigh);
            point.yLow = toY(point.pctLow);
            point.z = record.z;
        });
        record.visualPoints.forEach(point => {
            point.sessionPlot = sessionTimeline.minuteToPlot(point.sessionMinute);
            point.pathPlot = timeline.pointToPlot(record, point);
            point.x = toX(point.pathPlot);
            point.y = toY(point.pctClose);
            point.yHigh = toY(point.pctHigh);
            point.yLow = toY(point.pctLow);
            point.z = record.z;
        });
        record.lowPoint3d = record.points.reduce((best, point) => point.pctLow < best.pctLow ? point : best, record.points[0]);
        record.lowMarkerSpecs3d = recordLowMarkerSpecs(record, config);
        record.dayEndX = toX(timeline.marketClose);
    });

    const analysis = api.getAnalysisForRange?.(config.analysisMode) || api.getCurrentAnalysis?.() || {};
    const medianMinutes = asNumber(analysis.medianDeltaMinutes) ?? medianNumber(records.map(record => record.lowDelta).filter(Number.isFinite));
    const medianClockMinute = asNumber(analysis.medianLowMinute);
    const medianRegularLowFraction = medianNumber(records
        .map(record => regularPhaseProgress(record, record.lowPoint3d))
        .filter(Number.isFinite));
    const lowPointsByPlot = records
        .map(record => record.lowPoint3d)
        .filter(point => Number.isFinite(point?.pathPlot));
    const medianLowPathPlot = medianNumber(lowPointsByPlot.map(point => point.pathPlot));
    const medianLowPoint = Number.isFinite(medianLowPathPlot)
        ? [...lowPointsByPlot].sort((a, b) => Math.abs(a.pathPlot - medianLowPathPlot) - Math.abs(b.pathPlot - medianLowPathPlot))[0]
        : null;
    const medianPlot = hasMultiSession(config)
        ? medianLowPathPlot
        : (timeline.alignment === 'close'
            ? (Number.isFinite(medianClockMinute) ? timeline.minuteToPlot(medianClockMinute) : null)
            : (timeline.alignment === 'openClose'
                ? (Number.isFinite(medianRegularLowFraction) ? timeline.progressToPlot(medianRegularLowFraction) : null)
                : (Number.isFinite(medianMinutes) ? timeline.elapsedToPlot(medianMinutes) : null)));
    const medianSessionMinute = hasMultiSession(config)
        ? asNumber(medianLowPoint?.sessionMinute)
        : medianClockMinute;
    const medianLabel = hasMultiSession(config) && Number.isFinite(medianSessionMinute)
        ? `Median low ${formatSessionMoment(medianSessionMinute)}`
        : '';
    const insights = buildInsights(records);
    const marketCloseX = toX(timeline.marketClose);
    const entryScenarios = buildEntryScenarios(records, medianMinutes);
    const topBucket = analysis.topBucket || null;
    const topBucketStart = asNumber(topBucket?.minMinutes);
    const topBucketEnd = asNumber(topBucket?.maxMinutes);
    const topBucketSafeEnd = Number.isFinite(topBucketEnd)
        ? topBucketEnd
        : Math.min(Math.max(topBucketStart || 0, medianMinutes || 240) + 60, 390);
    const deltaToX = minutes => toX(Math.min(Math.max(0, timeline.elapsedToPlot(minutes)), maxPlot));

    return {
        records,
        label,
        mode: config.id,
        modeConfig: config,
        hasExtended: hasExtendedData,
        hasSecondDay: hasSecondDayData,
        maxPlot,
        timeline,
        sessionTimeline,
        minReturn,
        maxReturn,
        ySpan,
        zSpan,
        levels: niceReturnLevels(minReturn, maxReturn),
        zeroY: toY(0),
        medianX: Number.isFinite(medianPlot) ? toX(Math.min(medianPlot, maxPlot)) : null,
        medianClockMinute: medianSessionMinute,
        medianClockTime: analysis.medianLowTime || (Number.isFinite(medianSessionMinute) ? formatClockFromMinute(medianSessionMinute) : ''),
        medianMinutes,
        medianLabel,
        medianRegularLowFraction,
        insights,
        entryScenarios,
        marketCloseX,
        marketCloseMinutes: insights.medianCloseDelta,
        marketCloseTime: '16:00',
        lowWindow: !hasMultiSession(config) && topBucket && Number.isFinite(topBucketStart) ? {
            label: topBucket.label || `${formatElapsedCompact(topBucketStart)}-${formatElapsedCompact(topBucketSafeEnd)}`,
            pct: asNumber(topBucket.pct),
            startMinutes: topBucketStart,
            endMinutes: topBucketSafeEnd,
            startX: deltaToX(topBucketStart),
            endX: deltaToX(topBucketSafeEnd)
        } : null,
        bestEntryX: entryScenarios.best ? deltaToX(entryScenarios.best.targetDelta) : null,
        xMin: -X_SPAN / 2,
        xMax: X_SPAN / 2,
        zMin: -zSpan / 2,
        zMax: zSpan / 2,
        toX,
        toY,
        deltaToX
    };
}

function isolatedRenderDataset(dataset) {
    if (!dataset?.records?.length || state.view !== 'paths' || state.flatLowActive || !state.isolatedTicker) {
        return dataset;
    }
    const isolatedRecord = dataset.records.find(record => record.ticker === state.isolatedTicker);
    if (!isolatedRecord) {
        state.isolatedTicker = '';
        return dataset;
    }
    const firstRegularMinute = isolatedRecord.points
        .filter(point => point.session !== 'extended' && Number.isFinite(point.sessionMinute))
        .map(point => point.sessionMinute)
        .sort((a, b) => a - b)[0];
    const isolatedRegularStart = Number.isFinite(firstRegularMinute)
        ? Math.min(Math.max(firstRegularMinute, MARKET_OPEN_MINUTES), MARKET_CLOSE_MINUTES - INTERVAL_MINUTES)
        : MARKET_OPEN_MINUTES;
    const isolatedRegularSpan = Math.max(INTERVAL_MINUTES, MARKET_CLOSE_MINUTES - isolatedRegularStart);
    const isolatedTimeline = {
        ...dataset.timeline,
        regularStart: isolatedRegularStart,
        minuteToPlot: minute => {
            if (!Number.isFinite(minute)) return 0;
            if (minute <= MARKET_CLOSE_MINUTES) {
                const dayMinute = minuteOfDay(minute);
                const progress = Number.isFinite(dayMinute)
                    ? clamp((dayMinute - isolatedRegularStart) / isolatedRegularSpan, 0, 1)
                    : 0;
                return progress * dataset.timeline.marketClose;
            }
            return dataset.timeline.minuteToPlot(minute);
        }
    };
    isolatedTimeline.pointToPlot = (record, point) => isolatedTimeline.minuteToPlot(point?.sessionMinute);

    isolatedRecord.rowIndex = 0;
    isolatedRecord.z = 0;
    isolatedRecord.points.forEach(point => {
        point.z = 0;
    });
    isolatedRecord.visualPoints.forEach(point => {
        point.z = 0;
    });
    let minReturn = Math.min(0, ...isolatedRecord.points.map(point => point.pctLow).filter(Number.isFinite));
    let maxReturn = Math.max(0, ...isolatedRecord.points.map(point => point.pctHigh).filter(Number.isFinite));
    if (!Number.isFinite(minReturn) || !Number.isFinite(maxReturn)) {
        minReturn = dataset.minReturn;
        maxReturn = dataset.maxReturn;
    }
    if (maxReturn - minReturn < 3) {
        const mid = (maxReturn + minReturn) / 2;
        minReturn = mid - 1.5;
        maxReturn = mid + 1.5;
    }
    const pad = Math.max(0.75, (maxReturn - minReturn) * 0.12);
    minReturn -= pad;
    maxReturn += pad;
    const yRange = Math.max(1, maxReturn - minReturn);
    const ySpan = 31;
    const toY = pct => ((pct - minReturn) / yRange - 0.5) * ySpan;
    isolatedRecord.points.forEach(point => {
        point.pathPlot = isolatedTimeline.pointToPlot(isolatedRecord, point);
        point.x = dataset.toX(point.pathPlot);
        point.y = toY(point.pctClose);
        point.yHigh = toY(point.pctHigh);
        point.yLow = toY(point.pctLow);
    });
    isolatedRecord.visualPoints.forEach(point => {
        point.pathPlot = isolatedTimeline.pointToPlot(isolatedRecord, point);
        point.x = dataset.toX(point.pathPlot);
        point.y = toY(point.pctClose);
        point.yHigh = toY(point.pctHigh);
        point.yLow = toY(point.pctLow);
    });
    isolatedRecord.dayEndX = dataset.toX(isolatedTimeline.marketClose);
    const medianPlot = Number.isFinite(dataset.medianClockMinute)
        ? isolatedTimeline.minuteToPlot(dataset.medianClockMinute)
        : null;
    return {
        ...dataset,
        isolated: true,
        allRecords: dataset.records,
        records: [isolatedRecord],
        timeline: isolatedTimeline,
        minReturn,
        maxReturn,
        ySpan,
        zSpan: 1,
        zMin: -0.5,
        zMax: 0.5,
        levels: niceReturnLevels(minReturn, maxReturn),
        zeroY: toY(0),
        medianX: Number.isFinite(medianPlot) ? dataset.toX(Math.min(medianPlot, dataset.maxPlot)) : dataset.medianX,
        marketCloseX: dataset.toX(isolatedTimeline.marketClose),
        toY
    };
}

function ensureScene() {
    const stage = byId('three-map-stage');
    if (!stage) return false;
    if (state.renderer) return true;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(colors.bg);
    state.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 520);
    state.world = new THREE.Group();
    state.scene.add(state.world);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    state.renderer.setClearColor(colors.bg, 1);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.domElement.setAttribute('data-three-ipo-map-canvas', 'true');
    state.renderer.domElement.className = 'h-full w-full block';
    stage.appendChild(state.renderer.domElement);

    state.raycaster.params.Line.threshold = 0.85;
    state.raycaster.params.Points.threshold = 0.85;

    attachStageEvents(stage);
    state.resizeObserver = new ResizeObserver(resizeRenderer);
    state.resizeObserver.observe(stage);
    resizeRenderer();
    return true;
}

function attachStageEvents(stage) {
    const isCanvasEvent = event => event.target === state.renderer?.domElement;
    stage.addEventListener('pointerdown', event => {
        if (!isCanvasEvent(event)) return;
        state.dragging = true;
        state.interacted = true;
        state.dragX = event.clientX;
        state.dragY = event.clientY;
        stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
        if (state.dragging) {
            const dx = event.clientX - state.dragX;
            const dy = event.clientY - state.dragY;
            state.dragX = event.clientX;
            state.dragY = event.clientY;
            state.yaw -= dx * 0.006;
            state.pitch = Math.max(-0.72, Math.min(1.18, state.pitch + dy * 0.004));
            updateCamera();
            return;
        }
        if (!isCanvasEvent(event)) return;
        updateHover(event);
    });
    stage.addEventListener('pointerup', event => {
        state.dragging = false;
        stage.releasePointerCapture?.(event.pointerId);
    });
    stage.addEventListener('pointerleave', () => {
        state.dragging = false;
        const selected = state.dataset?.records?.find(record => record.ticker === state.selectedTicker) || null;
        setHoveredRecord(selected);
    });
    stage.addEventListener('wheel', event => {
        if (!isCanvasEvent(event)) return;
        event.preventDefault();
        state.interacted = true;
        state.distance = Math.max(24, Math.min(130, state.distance + event.deltaY * 0.035));
        updateCamera();
    }, { passive: false });
}

function resizeRenderer() {
    if (!state.renderer || !state.camera) return;
    const stage = byId('three-map-stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(width, height, false);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    if (state.open && state.view === 'entry' && !state.interacted) {
        const compact = isCompactEntryViewport();
        if (state.world?.children?.length && compact !== state.entryCompact) {
            buildScene();
            return;
        }
        setEntryCameraForStage(compact);
    }
    updateCamera();
    renderFrame();
}

function disposeObject(object) {
    object.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            child.material.forEach(material => {
                material.map?.dispose?.();
                material.dispose?.();
            });
        } else {
            child.material?.map?.dispose?.();
            child.material?.dispose?.();
        }
    });
}

function clearWorld() {
    state.pickables = [];
    state.recordObjects = new Map();
    state.pathLines = [];
    state.lowMarkers = [];
    state.lowLabels = [];
    state.selectedCandleGroup = null;
    state.flatSelectionArrow = null;
    state.sceneTweens = [];
    state.hoveredRecord = null;
    if (!state.world) return;
    while (state.world.children.length) {
        const child = state.world.children[0];
        state.world.remove(child);
        disposeObject(child);
    }
}

function trackRecordObject(record, object) {
    if (!record || !object) return object;
    const ticker = record.ticker || record.ipo?.ticker || '';
    if (!ticker) return object;
    if (!state.recordObjects.has(ticker)) {
        state.recordObjects.set(ticker, []);
    }
    state.recordObjects.get(ticker).push(object);
    return object;
}

function updateRecordVisibility() {
    const isolatedTicker = state.view === 'paths' && !state.flatLowActive ? state.isolatedTicker : '';
    state.recordObjects.forEach((objects, ticker) => {
        const visible = !isolatedTicker || ticker === isolatedTicker;
        objects.forEach(object => {
            object.visible = visible;
        });
    });
    if (state.selectedCandleGroup) {
        const ticker = state.selectedCandleGroup.userData.record?.ticker || '';
        state.selectedCandleGroup.visible = !isolatedTicker || ticker === isolatedTicker;
    }
}

function lineSegments(points, color, opacity = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 0.75
    });
    return new THREE.LineSegments(geometry, material);
}

function addLabel(text, x, y, z, options = {}) {
    const sprite = makeLabelSprite(text, options);
    sprite.position.set(x, y, z);
    state.world.add(sprite);
    return sprite;
}

function addTween(duration, update, complete) {
    state.sceneTweens.push({
        duration: Math.max(1, duration),
        start: null,
        update,
        complete
    });
}

function updateTweens(time = performance.now()) {
    if (!state.sceneTweens.length) return false;
    const active = [];
    state.sceneTweens.forEach(tween => {
        if (!Number.isFinite(tween.start)) tween.start = time;
        const rawProgress = (time - tween.start) / tween.duration;
        const progress = clamp(rawProgress, 0, 1);
        tween.update?.(easeOutCubic(progress), progress);
        if (progress < 1) {
            active.push(tween);
        } else {
            tween.complete?.();
        }
    });
    state.sceneTweens = active;
    return active.length > 0;
}

function tweenCameraTo(next, duration = 620) {
    if (!state.camera) return;
    const startTarget = state.target.clone();
    const endTarget = next.target.clone ? next.target.clone() : new THREE.Vector3(next.target.x, next.target.y, next.target.z);
    const startYaw = state.yaw;
    const startPitch = state.pitch;
    const startDistance = state.distance;
    addTween(duration, eased => {
        state.target.lerpVectors(startTarget, endTarget, eased);
        state.yaw = lerp(startYaw, next.yaw, eased);
        state.pitch = lerp(startPitch, next.pitch, eased);
        state.distance = lerp(startDistance, next.distance, eased);
        updateCamera();
    }, () => {
        state.target.copy(endTarget);
        state.yaw = next.yaw;
        state.pitch = next.pitch;
        state.distance = next.distance;
        updateCamera();
    });
}

function isCompactEntryViewport() {
    const stage = byId('three-map-stage');
    const rect = stage?.getBoundingClientRect?.();
    return Boolean(rect && rect.width < 640);
}

function pathCameraConfig(dataset) {
    const baseDistance = 44 + (dataset?.zSpan || 0) * 0.45;
    return {
        target: new THREE.Vector3(0, 0, 0),
        yaw: PATH_CAMERA_YAW,
        pitch: PATH_CAMERA_PITCH,
        distance: Math.max(36 * DEFAULT_CAMERA_ZOOM_OUT, Math.min(118 * DEFAULT_CAMERA_ZOOM_OUT, baseDistance * DEFAULT_CAMERA_ZOOM_OUT))
    };
}

function setPathCameraForDataset(dataset, resetOrientation = false) {
    const config = pathCameraConfig(dataset);
    state.target.copy(config.target);
    state.distance = config.distance;
    if (resetOrientation) {
        state.yaw = config.yaw;
        state.pitch = config.pitch;
    }
}

function flatLowY(dataset) {
    return -dataset.ySpan / 2 - 2.35;
}

function flatLowCameraConfig(dataset) {
    const y = flatLowY(dataset);
    const baseDistance = 39 + dataset.zSpan * 0.52;
    return {
        target: new THREE.Vector3(0, y + 0.9, 0),
        yaw: FLAT_CAMERA_YAW,
        pitch: FLAT_CAMERA_PITCH,
        distance: Math.max(42 * DEFAULT_CAMERA_ZOOM_OUT, Math.min(112 * DEFAULT_CAMERA_ZOOM_OUT, baseDistance * DEFAULT_CAMERA_ZOOM_OUT))
    };
}

function setEntryCameraForStage(compact = isCompactEntryViewport()) {
    state.target.set(compact ? -0.15 : -1.2, compact ? -0.35 : -0.15, -0.3);
    state.distance = compact ? 66 : 43;
    state.yaw = 0;
    state.pitch = compact ? 0.28 : 0.24;
}

function addGrid(dataset) {
    const group = new THREE.Group();
    const gridPoints = [];
    const zLines = Math.min(dataset.records.length, 40);
    const zStep = zLines > 1 ? dataset.zSpan / (zLines - 1) : dataset.zSpan;

    for (let i = 0; i < zLines; i += 1) {
        const z = dataset.zMin + zStep * i;
        gridPoints.push(dataset.xMin, dataset.zeroY, z, dataset.xMax, dataset.zeroY, z);
    }

    for (let i = 0; i <= 8; i += 1) {
        const x = dataset.xMin + (X_SPAN / 8) * i;
        gridPoints.push(x, dataset.zeroY, dataset.zMin, x, dataset.zeroY, dataset.zMax);
    }

    group.add(lineSegments(gridPoints, colors.grid, 0.76));

    const levelPoints = [];
    dataset.levels.forEach(level => {
        const y = dataset.toY(level);
        levelPoints.push(dataset.xMin, y, dataset.zMin, dataset.xMax, y, dataset.zMin);
        levelPoints.push(dataset.xMax, y, dataset.zMin, dataset.xMax, y, dataset.zMax);
    });
    group.add(lineSegments(levelPoints, colors.gridStrong, 0.34));

    const zeroPoints = [
        dataset.xMin, dataset.zeroY, dataset.zMin,
        dataset.xMax, dataset.zeroY, dataset.zMin,
        dataset.xMax, dataset.zeroY, dataset.zMax,
        dataset.xMin, dataset.zeroY, dataset.zMax,
        dataset.xMin, dataset.zeroY, dataset.zMin
    ];
    group.add(lineSegments(zeroPoints, colors.zero, 0.74));
    state.world.add(group);
}

function addBuyApproachGuides(dataset) {
    const depth = Math.max(dataset.zSpan + 1.4, 4);
    const floorY = dataset.zeroY + 0.02;
    if (dataset.lowWindow && Number.isFinite(dataset.lowWindow.startX) && Number.isFinite(dataset.lowWindow.endX)) {
        const startX = Math.min(dataset.lowWindow.startX, dataset.lowWindow.endX);
        const endX = Math.max(dataset.lowWindow.startX, dataset.lowWindow.endX);
        const width = Math.max(0.18, endX - startX);
        const geometry = new THREE.PlaneGeometry(width, depth);
        const material = new THREE.MeshBasicMaterial({
            color: colors.low,
            transparent: true,
            opacity: 0.13,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const band = new THREE.Mesh(geometry, material);
        band.rotation.x = -Math.PI / 2;
        band.position.set((startX + endX) / 2, floorY, 0);
        state.world.add(band);
        const edgePoints = [
            startX, floorY + 0.04, dataset.zMin,
            startX, floorY + 0.04, dataset.zMax,
            endX, floorY + 0.04, dataset.zMin,
            endX, floorY + 0.04, dataset.zMax
        ];
        state.world.add(lineSegments(edgePoints, colors.low, 0.65));
        const pct = Number.isFinite(dataset.lowWindow.pct) ? ` ${Math.round(dataset.lowWindow.pct)}%` : '';
        addLabel(`Low cluster ${dataset.lowWindow.label}${pct}`, (startX + endX) / 2, floorY + 1.25, dataset.zMin - 1.4, {
            color: '#fbbf24',
            border: 'rgba(245, 158, 11, 0.8)',
            background: 'rgba(24, 16, 4, 0.82)',
            worldWidth: 3.7,
            fontSize: 21
        });
    }

    const best = dataset.entryScenarios?.best;
    if (best && Number.isFinite(dataset.bestEntryX)) {
        const geometry = new THREE.BoxGeometry(0.14, 0.08, depth);
        const material = new THREE.MeshBasicMaterial({
            color: colors.buyWindow,
            transparent: true,
            opacity: 0.78,
            depthWrite: false
        });
        const guide = new THREE.Mesh(geometry, material);
        guide.position.set(dataset.bestEntryX, floorY + 0.08, 0);
        state.world.add(guide);
        state.world.add(lineSegments([
            dataset.bestEntryX, floorY + 0.14, dataset.zMin,
            dataset.bestEntryX, floorY + 0.14, dataset.zMax
        ], colors.buyWindow, 0.92));
        addLabel(`Best avg entry ${best.label} ${fmtPct(best.avgReturn)}`, dataset.bestEntryX, floorY + 2.15, dataset.zMin - 1.7, {
            color: '#86efac',
            border: 'rgba(34, 197, 94, 0.78)',
            background: 'rgba(5, 25, 15, 0.86)',
            worldWidth: 4.2,
            fontSize: 21
        });
        addLabel('historical day-end avg', dataset.bestEntryX, floorY + 1.25, dataset.zMin - 1.7, {
            color: '#a7f3d0',
            border: 'rgba(34, 197, 94, 0.36)',
            background: 'rgba(5, 25, 15, 0.68)',
            worldWidth: 3.1,
            fontSize: 18
        });
    }
}

function addMedianWall(dataset) {
    if (!Number.isFinite(dataset.medianX)) return;
    const depth = Math.max(dataset.zSpan + 1.4, 4);
    const height = dataset.ySpan + 5;
    const edgePoints = [
        dataset.medianX, -height / 2, dataset.zMin,
        dataset.medianX, height / 2, dataset.zMin,
        dataset.medianX, -height / 2, dataset.zMax,
        dataset.medianX, height / 2, dataset.zMax,
        dataset.medianX, dataset.zeroY, dataset.zMin,
        dataset.medianX, dataset.zeroY, dataset.zMax
    ];
    state.world.add(lineSegments(edgePoints, colors.median, 0.92));
    const medianLabel = dataset.medianLabel
        || (dataset.timeline?.alignment === 'openClose' && Number.isFinite(dataset.medianRegularLowFraction)
            ? `Median low ${Math.round(dataset.medianRegularLowFraction * 100)}% to close`
            : `Median low ${formatElapsedCompact(dataset.medianMinutes)}`);
    addLabel(medianLabel, dataset.medianX, dataset.ySpan / 2 + 1.1, dataset.zMin - 1.4, {
        color: '#7dd3fc',
        border: 'rgba(56, 189, 248, 0.76)',
        background: 'rgba(8, 30, 45, 0.82)',
        worldWidth: 3.2,
        fontSize: 21
    });
    if (dataset.timeline?.alignment === 'close' && dataset.medianClockTime) {
        addLabel(`${dataset.medianClockTime} ET`, dataset.medianX, dataset.ySpan / 2 + 0.1, dataset.zMin - 1.4, {
            color: '#bae6fd',
            border: 'rgba(56, 189, 248, 0.5)',
            background: 'rgba(8, 30, 45, 0.68)',
            worldWidth: 2.1,
            fontSize: 17
        });
    }
}

function addMarketCloseWall(dataset) {
    if (!Number.isFinite(dataset.marketCloseX) || !dataset.timeline || !dataset.toX) return;
    const depth = Math.max(dataset.zSpan + 1.4, 4);
    const floorY = dataset.zeroY - 0.08;
    const height = dataset.ySpan + 5;
    const addFloorBand = (startPlot, endPlot, color, opacity) => {
        if (!Number.isFinite(startPlot) || !Number.isFinite(endPlot) || endPlot <= startPlot) return;
        const startX = dataset.toX(startPlot);
        const endX = dataset.toX(endPlot);
        const width = Math.max(0.08, endX - startX);
        const ribbon = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        ribbon.rotation.x = -Math.PI / 2;
        ribbon.position.set((startX + endX) / 2, floorY, 0);
        state.world.add(ribbon);
    };
    const addVerticalSessionGuide = (plot, color, opacity, label, timeLabel, options = {}) => {
        if (!Number.isFinite(plot)) return null;
        const x = dataset.toX(plot);
        if (!Number.isFinite(x)) return null;
        const points = [
            x, -height / 2, dataset.zMin,
            x, height / 2, dataset.zMin,
            x, -height / 2, dataset.zMax,
            x, height / 2, dataset.zMax,
            x, floorY + 0.06, dataset.zMin,
            x, floorY + 0.06, dataset.zMax
        ];
        state.world.add(lineSegments(points, color, opacity));
        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.075, 0.075, depth),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: Math.min(0.55, opacity * 0.62),
                depthWrite: false
            })
        );
        rail.position.set(x, floorY + 0.05, 0);
        state.world.add(rail);
        if (label) {
            const z = options.z ?? dataset.zMin - 1.4;
            const y = options.y ?? dataset.ySpan / 2 + 1.4;
            addLabel(label, x, y, z, {
                color: options.color || '#e4e4e7',
                border: options.border || 'rgba(161, 161, 170, 0.62)',
                background: options.background || 'rgba(24, 24, 27, 0.82)',
                worldWidth: options.worldWidth || 2.6,
                fontSize: options.fontSize || 19
            });
            if (timeLabel) {
                addLabel(timeLabel, x, y - 0.92, z, {
                    color: options.timeColor || '#a1a1aa',
                    border: options.timeBorder || 'rgba(113, 113, 122, 0.48)',
                    background: options.timeBackground || 'rgba(9, 9, 11, 0.68)',
                    worldWidth: options.timeWorldWidth || 1.9,
                    fontSize: options.timeFontSize || 16
                });
            }
        }
        return x;
    };

    addFloorBand(dataset.timeline.afterStart, dataset.timeline.afterEnd, 0x475569, dataset.timeline.includeExtended ? 0.13 : 0);
    addFloorBand(dataset.timeline.preStart, dataset.timeline.preEnd, 0x0f766e, dataset.timeline.includeExtended ? 0.12 : 0);
    addFloorBand(dataset.timeline.secondOpen, dataset.timeline.end, 0x1d4ed8, dataset.timeline.includeSecondDay ? 0.095 : 0);

    const marketClosePoints = [
        dataset.marketCloseX, -height / 2, dataset.zMin,
        dataset.marketCloseX, height / 2, dataset.zMin,
        dataset.marketCloseX, -height / 2, dataset.zMax,
        dataset.marketCloseX, height / 2, dataset.zMax,
        dataset.marketCloseX, floorY + 0.04, dataset.zMin,
        dataset.marketCloseX, floorY + 0.04, dataset.zMax
    ];
    state.world.add(lineSegments(marketClosePoints, colors.neutral, 0.86));

    const closeRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, depth),
        new THREE.MeshBasicMaterial({
            color: colors.neutral,
            transparent: true,
            opacity: 0.48,
            depthWrite: false
        })
    );
    closeRail.position.set(dataset.marketCloseX, floorY + 0.04, 0);
    state.world.add(closeRail);

    if (dataset.timeline.includeShared) {
        const gapX = dataset.toX(dataset.timeline.gapStart);
        const preX = dataset.toX(dataset.timeline.preStart);
        const gapPoints = [
            gapX, floorY + 0.1, dataset.zMin,
            gapX, floorY + 0.1, dataset.zMax,
            preX, floorY + 0.1, dataset.zMin,
            preX, floorY + 0.1, dataset.zMax
        ];
        state.world.add(lineSegments(gapPoints, 0xffffff, 0.92));
        addLabel('Overnight gap', (gapX + preX) / 2, floorY + 0.76, dataset.zMin - 1.4, {
            color: '#f8fafc',
            border: 'rgba(255, 255, 255, 0.52)',
            background: 'rgba(9, 9, 11, 0.74)',
            worldWidth: 2.6,
            fontSize: 17
        });
        if (dataset.timeline.includeExtended) {
            addLabel('After-hours', (dataset.toX(dataset.timeline.afterStart) + dataset.toX(dataset.timeline.afterEnd)) / 2, floorY + 0.72, dataset.zMin - 1.4, {
                color: '#cbd5e1',
                border: 'rgba(148, 163, 184, 0.5)',
                background: 'rgba(15, 23, 42, 0.74)',
                worldWidth: 2.4,
                fontSize: 17
            });
            addLabel('Premarket', (dataset.toX(dataset.timeline.preStart) + dataset.toX(dataset.timeline.preEnd)) / 2, floorY + 0.72, dataset.zMin - 1.4, {
                color: '#99f6e4',
                border: 'rgba(20, 184, 166, 0.5)',
                background: 'rgba(4, 47, 46, 0.72)',
                worldWidth: 2.2,
                fontSize: 17
            });
            addVerticalSessionGuide(dataset.timeline.preStart, 0x2dd4bf, 0.9, 'Premarket start', 'D2 04:00 ET', {
                color: '#99f6e4',
                border: 'rgba(20, 184, 166, 0.62)',
                background: 'rgba(4, 47, 46, 0.76)',
                worldWidth: 3.1,
                timeWorldWidth: 2.25,
                y: dataset.ySpan / 2 + 1.15
            });
        }
        addVerticalSessionGuide(dataset.timeline.secondOpen, 0xffffff, 0.88, 'D2 market open', '09:30 ET', {
            color: '#f8fafc',
            border: 'rgba(255, 255, 255, 0.58)',
            background: 'rgba(24, 24, 27, 0.78)',
            worldWidth: 3.05,
            y: dataset.ySpan / 2 + 1.15
        });
        if (dataset.timeline.includeSecondDay) {
            addLabel('Day 2 regular', (dataset.toX(dataset.timeline.secondOpen) + dataset.toX(dataset.timeline.end)) / 2, floorY + 0.72, dataset.zMin - 1.4, {
                color: '#bfdbfe',
                border: 'rgba(147, 197, 253, 0.5)',
                background: 'rgba(15, 23, 42, 0.74)',
                worldWidth: 2.65,
                fontSize: 17
            });
            addVerticalSessionGuide(dataset.timeline.end, 0x93c5fd, 0.62, 'D2 close', '16:00 ET', {
                color: '#bfdbfe',
                border: 'rgba(147, 197, 253, 0.48)',
                background: 'rgba(15, 23, 42, 0.68)',
                worldWidth: 2.2,
                timeWorldWidth: 2.1,
                y: dataset.ySpan / 2 - 1.0
            });
        }
    }

    addLabel('Market close', dataset.marketCloseX, dataset.ySpan / 2 + 1.65, dataset.zMin - 1.4, {
        color: '#d4d4d8',
        border: 'rgba(161, 161, 170, 0.62)',
        background: 'rgba(24, 24, 27, 0.82)',
        worldWidth: 2.8,
        fontSize: 20
    });
    if (dataset.marketCloseTime) {
        addLabel(`${dataset.marketCloseTime} ET`, dataset.marketCloseX, dataset.ySpan / 2 + 0.65, dataset.zMin - 1.4, {
            color: '#a1a1aa',
            border: 'rgba(113, 113, 122, 0.5)',
            background: 'rgba(9, 9, 11, 0.7)',
            worldWidth: 2.1,
            fontSize: 17
        });
    }
}

function addSceneLabels(dataset) {
    const timeline = dataset.timeline || {};
    const openAligned = timeline.alignment !== 'close';
    const axisTitle = timeline.alignment === 'openClose'
        ? 'Open-to-close phase'
        : (openAligned ? 'Open-aligned time' : 'Market session time');
    addLabel(axisTitle, dataset.xMax - 4.7, dataset.zeroY - 2.1, dataset.zMin - 1.5, {
        color: '#bfdbfe',
        border: 'rgba(96, 165, 250, 0.6)',
        background: 'rgba(9, 9, 11, 0.7)',
        worldWidth: 3.6,
        fontSize: 20
    });
    addLabel('Filtered IPO rows', dataset.xMin - 2.1, dataset.zeroY + 1.1, dataset.zMax + 0.9, {
        color: '#a1a1aa',
        border: 'rgba(113, 113, 122, 0.48)',
        background: 'rgba(9, 9, 11, 0.72)',
        worldWidth: 3,
        fontSize: 19
    });
    addLabel('0% first open', dataset.xMin + 5, dataset.zeroY + 0.8, dataset.zMin - 1.1, {
        color: '#93c5fd',
        border: 'rgba(96, 165, 250, 0.7)',
        background: 'rgba(8, 20, 38, 0.82)',
        worldWidth: 2.8,
        fontSize: 19
    });

    let tickSpecs = [];
    if (timeline.alignment === 'openClose') {
        tickSpecs = [
            { plot: timeline.progressToPlot(0), label: 'Open' },
            { plot: timeline.progressToPlot(0.25), label: '25%' },
            { plot: timeline.progressToPlot(0.5), label: '50%' },
            { plot: timeline.progressToPlot(0.75), label: '75%' },
            { plot: timeline.progressToPlot(1), label: 'Close' }
        ];
        if (timeline.includeExtended) {
            tickSpecs.push(
                { plot: timeline.afterEnd, label: '20:00' },
                { plot: timeline.preStart, label: 'D2 04:00' },
                ...(!timeline.includeSecondDay ? [{ plot: timeline.secondOpen, label: 'D2 09:30' }] : [])
            );
        }
        if (timeline.includeSecondDay) {
            tickSpecs.push(
                { plot: timeline.secondOpen, label: 'D2 09:30' },
                { minute: DAY_MINUTES + 12 * 60, label: 'D2 12:00' },
                { minute: DAY_MINUTES + 14 * 60, label: 'D2 14:00' },
                { plot: timeline.end, label: 'D2 16:00' }
            );
        }
    } else if (openAligned) {
        const maxDuration = timeline.maxRegularDuration || 390;
        const elapsedTicks = [0, 30, 60, 120, 180, 240, 300, 360]
            .filter(minute => minute <= maxDuration + 0.1 && (!timeline.includeShared || minute === 0 || maxDuration - minute >= 35));
        tickSpecs = elapsedTicks.map(minute => ({
            plot: timeline.elapsedToPlot(minute),
            label: formatElapsedCompact(minute)
        }));
        if (timeline.includeExtended) {
            tickSpecs.push(
                { plot: timeline.marketClose, label: '16:00' },
                { plot: timeline.afterEnd, label: '20:00' },
                { plot: timeline.preStart, label: 'D2 04:00' },
                ...(!timeline.includeSecondDay ? [{ plot: timeline.secondOpen, label: 'D2 09:30' }] : [])
            );
        }
        if (timeline.includeSecondDay) {
            tickSpecs.push(
                { plot: timeline.marketClose, label: '16:00' },
                { plot: timeline.secondOpen, label: 'D2 09:30' },
                { minute: DAY_MINUTES + 12 * 60, label: 'D2 12:00' },
                { minute: DAY_MINUTES + 14 * 60, label: 'D2 14:00' },
                { plot: timeline.end, label: 'D2 16:00' }
            );
        }
    } else {
        tickSpecs = [
            { plot: 0, label: formatClockFromMinute(timeline.regularStart) },
            { minute: 12 * 60, label: '12:00' },
            { minute: 14 * 60, label: '14:00' },
            { plot: timeline.marketClose, label: '16:00' }
        ];
        if (timeline.includeExtended) {
            tickSpecs.push(
                { plot: timeline.afterEnd, label: '20:00' },
                { plot: timeline.preStart, label: 'D2 04:00' },
                ...(!timeline.includeSecondDay ? [{ plot: timeline.secondOpen, label: 'D2 09:30' }] : [])
            );
        }
        if (timeline.includeSecondDay) {
            tickSpecs.push(
                { plot: timeline.secondOpen, label: 'D2 09:30' },
                { minute: DAY_MINUTES + 12 * 60, label: 'D2 12:00' },
                { minute: DAY_MINUTES + 14 * 60, label: 'D2 14:00' },
                { plot: timeline.end, label: 'D2 16:00' }
            );
        }
    }
    const usedTicks = [];
    tickSpecs.forEach(tick => {
        const plot = Number.isFinite(tick.plot)
            ? tick.plot
            : (Number.isFinite(tick.minute) && tick.minute >= timeline.regularStart && tick.minute <= MARKET_CLOSE_MINUTES
                ? timeline.minuteToPlot(tick.minute)
                : (Number.isFinite(tick.minute) && timeline.includeSecondDay && tick.minute >= SECOND_DAY_OPEN_MINUTES
                    ? timeline.minuteToPlot(tick.minute)
                    : null));
        const x = Number.isFinite(plot) ? dataset.toX(plot) : null;
        if (!Number.isFinite(x) || x < dataset.xMin - 0.1 || x > dataset.xMax + 0.1) return;
        if (usedTicks.some(previous => Math.abs(previous - x) < 1.35)) return;
        usedTicks.push(x);
        const points = [
            x, dataset.zeroY - 0.25, dataset.zMin,
            x, dataset.zeroY + 0.25, dataset.zMin
        ];
        state.world.add(lineSegments(points, colors.gridStrong, 0.75));
        addLabel(tick.label, x, dataset.zeroY - 1.15, dataset.zMin - 1.15, {
            color: '#a1a1aa',
            background: 'rgba(9, 9, 11, 0.62)',
            border: 'rgba(63, 63, 70, 0.54)',
            worldWidth: tick.label.length > 5 ? 1.65 : 1.25,
            fontSize: 17
        });
    });

}

function addRangeSticks(dataset) {
    dataset.records.forEach(record => {
        const positions = [];
        const vertexColors = [];
        const color = record.color.clone().multiplyScalar(0.82);
        record.points.forEach((point, index) => {
            if (index % 2 && dataset.records.length > 44) return;
            positions.push(point.x, point.yLow, point.z, point.x, point.yHigh, point.z);
            vertexColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        });
        if (!positions.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: dataset.records.length > 44 ? 0.16 : 0.23,
            depthWrite: false
        });
        const sticks = new THREE.LineSegments(geometry, material);
        sticks.userData.record = record;
        trackRecordObject(record, sticks);
        state.world.add(sticks);
    });
}

function addIsolatedVolumeBars(dataset) {
    if (!dataset?.isolated || !dataset.records?.length) return;
    const record = dataset.records[0];
    const volumePoints = record.points
        .map(point => ({ point, volume: asNumber(point.volume) || 0 }))
        .filter(item => item.volume > 0 && Number.isFinite(item.point.x));
    if (!volumePoints.length) return;

    const maxVolume = Math.max(...volumePoints.map(item => item.volume));
    const baseY = -dataset.ySpan / 2 - 2.2;
    const maxHeight = 4.15;
    const z = record.z + 0.74;
    const width = Math.max(0.05, selectedCandleWidth(record.points) * 0.7);
    const geometry = new THREE.BoxGeometry(width, 1, 0.16);
    const material = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(geometry, material, volumePoints.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    volumePoints.forEach((item, index) => {
        const height = Math.max(0.06, (item.volume / Math.max(maxVolume, 1)) * maxHeight);
        position.set(item.point.x, baseY + height / 2, z);
        scale.set(1, height, 1);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 8;
    mesh.userData.record = record;
    trackRecordObject(record, mesh);
    state.world.add(mesh);

    state.world.add(lineSegments([
        dataset.xMin, baseY, z,
        dataset.xMax, baseY, z,
        dataset.xMin, baseY + maxHeight, z,
        dataset.xMax, baseY + maxHeight, z
    ], 0x0ea5e9, 0.34));
    addLabel(`5m vol max ${fmtVolume(maxVolume)}`, dataset.xMin + 3.7, baseY + maxHeight + 0.8, z + 0.2, {
        color: '#7dd3fc',
        border: 'rgba(14, 165, 233, 0.45)',
        background: 'rgba(8, 20, 38, 0.72)',
        worldWidth: 3.2,
        fontSize: 17
    });
}

function addPathLines(dataset) {
    dataset.records.forEach(record => {
        const positions = [];
        record.visualPoints.forEach(point => {
            positions.push(point.x, point.y, point.z);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color: record.color,
            transparent: true,
            opacity: 0.84,
            depthWrite: true
        });
        const line = new THREE.Line(geometry, material);
        line.userData.record = record;
        line.userData.originalColor = record.color.clone();
        state.pathLines.push(line);
        state.pickables.push(line);
        trackRecordObject(record, line);
        state.world.add(line);
    });
}

function removeSelectedCandleOverlay() {
    if (!state.selectedCandleGroup) return;
    if (state.selectedCandleGroup.parent) {
        state.selectedCandleGroup.parent.remove(state.selectedCandleGroup);
    }
    disposeObject(state.selectedCandleGroup);
    state.selectedCandleGroup = null;
}

function selectedCandleWidth(points) {
    const gaps = [];
    for (let index = 1; index < points.length; index += 1) {
        const gap = Math.abs(points[index].x - points[index - 1].x);
        if (gap > 0.001) gaps.push(gap);
    }
    const typical = medianNumber(gaps);
    return clamp((typical || 0.32) * 0.58, 0.08, 0.26);
}

function makeCandleBodyMesh(items, geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    items.forEach((item, index) => {
        position.set(item.x, item.y, item.z);
        scale.set(1, item.height, 1);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 16;
    return mesh;
}

function candleWickSegments(points, color) {
    if (!points.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 17;
    return lines;
}

function addSelectedCandleOverlay(record, dataset = state.dataset) {
    if (!record || !dataset?.toY || !state.world) return;
    const candleWidth = selectedCandleWidth(record.points);
    const candleDepth = 0.09;
    const zOffset = 0.09;
    const upBodies = [];
    const downBodies = [];
    const flatBodies = [];
    const upWicks = [];
    const downWicks = [];
    const flatWicks = [];

    record.points.forEach(point => {
        const openPct = (point.open / record.basePrice - 1) * 100;
        const closePct = (point.close / record.basePrice - 1) * 100;
        const yOpen = dataset.toY(openPct);
        const yClose = dataset.toY(closePct);
        const yHigh = point.yHigh;
        const yLow = point.yLow;
        if (![point.x, yOpen, yClose, yHigh, yLow, point.z].every(Number.isFinite)) return;

        const up = yClose > yOpen + 0.01;
        const down = yClose < yOpen - 0.01;
        const wickTarget = up ? upWicks : (down ? downWicks : flatWicks);
        const bodyTarget = up ? upBodies : (down ? downBodies : flatBodies);
        const z = point.z + zOffset;
        wickTarget.push(point.x, yLow, z, point.x, yHigh, z);
        bodyTarget.push({
            x: point.x,
            y: (yOpen + yClose) / 2,
            z,
            height: Math.max(Math.abs(yClose - yOpen), 0.055)
        });
    });

    const group = new THREE.Group();
    group.userData.record = record;
    group.name = `selected-candles-${record.ticker}`;

    const makeBodyGeometry = () => new THREE.BoxGeometry(candleWidth, 1, candleDepth);
    const upMaterial = new THREE.MeshBasicMaterial({
        color: colors.positive,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
    });
    const downMaterial = new THREE.MeshBasicMaterial({
        color: colors.negative,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
    });
    const flatMaterial = new THREE.MeshBasicMaterial({
        color: colors.highlight,
        transparent: true,
        opacity: 0.76,
        depthTest: false,
        depthWrite: false
    });

    const upWickMesh = candleWickSegments(upWicks, colors.positive);
    const downWickMesh = candleWickSegments(downWicks, colors.negative);
    const flatWickMesh = candleWickSegments(flatWicks, colors.highlight);
    if (upWickMesh) group.add(upWickMesh);
    if (downWickMesh) group.add(downWickMesh);
    if (flatWickMesh) group.add(flatWickMesh);
    if (upBodies.length) group.add(makeCandleBodyMesh(upBodies, makeBodyGeometry(), upMaterial));
    if (downBodies.length) group.add(makeCandleBodyMesh(downBodies, makeBodyGeometry(), downMaterial));
    if (flatBodies.length) group.add(makeCandleBodyMesh(flatBodies, makeBodyGeometry(), flatMaterial));

    state.selectedCandleGroup = group;
    state.world.add(group);
}

function updateSelectedCandleOverlay() {
    removeSelectedCandleOverlay();
    if (state.view !== 'paths' || state.flatLowActive || !state.selectedTicker) return;
    const record = state.dataset?.records?.find(item => item.ticker === state.selectedTicker);
    if (!record) return;
    addSelectedCandleOverlay(record);
}

function addEntryScene(dataset) {
    const scenarios = [...(dataset.entryScenarios?.scenarios || [])]
        .sort((a, b) => (a.targetDelta - b.targetDelta) || a.label.localeCompare(b.label));
    if (!scenarios.length) {
        addLabel('Not enough entry-scenario data', 0, 2, 0, {
            color: '#d4d4d8',
            worldWidth: 5,
            fontSize: 24
        });
        return;
    }

    const compact = isCompactEntryViewport();
    state.entryCompact = compact;
    const spacing = compact ? 3.75 : 5.2;
    const xStart = -((scenarios.length - 1) * spacing) / 2;
    const xFor = index => xStart + index * spacing;
    const xMin = xStart - (compact ? 2.8 : 3.8);
    const xMax = xStart + (scenarios.length - 1) * spacing + (compact ? 2.8 : 3.8);
    const maxReturn = Math.max(2.5, ...scenarios.map(scenario => Math.abs(scenario.avgReturn || 0))) * 1.2;
    const maxGap = Math.max(4, ...scenarios.map(scenario => Math.abs(scenario.avgGapToLow || 0))) * 1.08;
    const yForReturn = value => (value / maxReturn) * 5.9;
    const yForGap = value => -(Math.max(0, value || 0) / maxGap) * 5.2;
    const returnZ = -1.3;
    const gapZ = 1.35;
    const riskZ = -3.05;
    const balanced = dataset.entryScenarios?.balanced || dataset.entryScenarios?.best || null;
    const best = dataset.entryScenarios?.best || null;
    const openScenario = scenarios.find(scenario => scenario.id === 'open');

    const addBar = (x, y, z, width, depth, color, opacity = 0.82) => {
        const height = Math.max(0.08, Math.abs(y));
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: opacity < 1,
            opacity,
            depthWrite: opacity >= 0.78
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y >= 0 ? height / 2 : -height / 2, z);
        state.world.add(mesh);
        return mesh;
    };

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(xMax - xMin, 7.7),
        new THREE.MeshBasicMaterial({
            color: 0x18181b,
            transparent: true,
            opacity: 0.32,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((xMin + xMax) / 2, -6.18, -0.35);
    state.world.add(floor);

    const grid = [];
    grid.push(xMin, 0, returnZ, xMax, 0, returnZ);
    grid.push(xMin, 0, gapZ, xMax, 0, gapZ);
    for (let y = -6; y <= 6; y += 3) {
        grid.push(xMin, y, returnZ, xMax, y, returnZ);
    }
    for (let i = 0; i < scenarios.length; i += 1) {
        const x = xFor(i);
        grid.push(x, -6.3, returnZ, x, 6.3, returnZ);
        grid.push(x, -5.7, gapZ, x, 0.3, gapZ);
    }
    state.world.add(lineSegments(grid, colors.gridStrong, 0.44));
    state.world.add(lineSegments([xMin, 0, returnZ, xMax, 0, returnZ], colors.zero, 0.92));

    scenarios.forEach((scenario, index) => {
        const x = xFor(index);
        const returnY = yForReturn(scenario.avgReturn || 0);
        const gapY = yForGap(scenario.avgGapToLow || 0);
        const isBalanced = balanced && scenario.id === balanced.id;

        const tile = new THREE.Mesh(
            new THREE.BoxGeometry(3.9, 0.08, 4.9),
            new THREE.MeshBasicMaterial({
                color: isBalanced ? colors.buyWindow : 0x27272a,
                transparent: true,
                opacity: isBalanced ? 0.21 : 0.18,
                depthWrite: false
            })
        );
        tile.position.set(x, -6.08, -0.32);
        state.world.add(tile);

        if (isBalanced) {
            const column = new THREE.Mesh(
                new THREE.BoxGeometry(4.25, 12.9, 5.15),
                new THREE.MeshBasicMaterial({
                    color: colors.buyWindow,
                    transparent: true,
                    opacity: 0.052,
                    depthWrite: false
                })
            );
            column.position.set(x, 0.25, -0.28);
            state.world.add(column);
        }

        addBar(x - 0.52, returnY, returnZ, 0.92, 1.16, scenario.avgReturn >= 0 ? colors.positive : colors.negative, isBalanced ? 0.96 : 0.78);
        addBar(x + 0.52, gapY, gapZ, 0.82, 1.12, colors.low, isBalanced ? 0.9 : 0.68);

        const contained = Math.max(0, Math.min(100, scenario.contained5 || 0));
        const riskWidth = 0.54 + (contained / 100) * 2.25;
        const riskRail = new THREE.Mesh(
            new THREE.BoxGeometry(riskWidth, 0.16, 0.42),
            new THREE.MeshBasicMaterial({
                color: colors.median,
                transparent: true,
                opacity: isBalanced ? 0.86 : 0.68
            })
        );
        riskRail.position.set(x, -5.32, riskZ);
        state.world.add(riskRail);
        state.world.add(lineSegments([
            x - 1.42, -5.32, riskZ,
            x + 1.42, -5.32, riskZ
        ], colors.gridStrong, 0.5));

        if (isBalanced) {
            addLabel(`Best balance: ${scenario.label}`, x, compact ? 6.45 : 6.9, -0.2, {
                color: '#86efac',
                border: 'rgba(34, 197, 94, 0.8)',
                background: 'rgba(5, 25, 15, 0.86)',
                worldWidth: compact ? 3.1 : 3.5,
                fontSize: compact ? 19 : 21
            });
        }

        addLabel(scenario.label, x, -7.18, -0.1, {
            color: '#e4e4e7',
            background: 'rgba(9, 9, 11, 0.78)',
            border: 'rgba(82, 82, 91, 0.7)',
            worldWidth: compact ? 1.38 : 1.55,
            fontSize: compact ? 17 : 19
        });
        if (!compact) {
            addLabel(formatElapsedCompact(scenario.targetDelta), x, -7.85, -0.1, {
                color: '#a1a1aa',
                background: 'rgba(9, 9, 11, 0.58)',
                border: 'rgba(63, 63, 70, 0.48)',
                worldWidth: 1.25,
                fontSize: 16
            });
        }
        addLabel(fmtPct(scenario.avgReturn), x - 0.52, returnY + (returnY >= 0 ? 0.72 : -0.72), returnZ, {
            color: scenario.avgReturn >= 0 ? '#86efac' : '#fdba74',
            background: 'rgba(9, 9, 11, 0.74)',
            border: 'rgba(82, 82, 91, 0.62)',
            worldWidth: compact ? 1.42 : 1.65,
            fontSize: compact ? 16 : 18
        });
        if (!compact) {
            addLabel(`${(scenario.avgGapToLow || 0).toFixed(1)}%`, x + 0.52, gapY - 0.66, gapZ, {
                color: '#fbbf24',
                background: 'rgba(24, 16, 4, 0.8)',
                border: 'rgba(245, 158, 11, 0.58)',
                worldWidth: 1.22,
                fontSize: 16
            });
            addLabel(`${Math.round(contained)}% ok`, x, -4.74, riskZ, {
                color: '#bfdbfe',
                background: 'rgba(8, 20, 38, 0.76)',
                border: 'rgba(96, 165, 250, 0.52)',
                worldWidth: 1.6,
                fontSize: 16
            });
        }
    });

    addLabel('Best-buy strategy runway', 0, compact ? 7.35 : 7.92, -0.35, {
        color: '#dbeafe',
        background: 'rgba(8, 20, 38, 0.84)',
        border: 'rgba(96, 165, 250, 0.62)',
        worldWidth: compact ? 4 : 4.5,
        fontSize: compact ? 20 : 23
    });
    if (!compact) {
        addLabel('green/orange height = avg day-end result', xMin + 6.25, 6.72, returnZ, {
            color: '#86efac',
            background: 'rgba(5, 25, 15, 0.72)',
            border: 'rgba(34, 197, 94, 0.5)',
            worldWidth: 5.15,
            fontSize: 20
        });
        addLabel('amber drop = avg missed gap to first-day low', xMax - 6.6, 6.72, gapZ, {
            color: '#fbbf24',
            background: 'rgba(24, 16, 4, 0.72)',
            border: 'rgba(245, 158, 11, 0.52)',
            worldWidth: 5.2,
            fontSize: 20
        });
        addLabel('blue rail = day-end loss contained under 5%', xMax - 6.15, -4.25, riskZ, {
            color: '#bfdbfe',
            background: 'rgba(8, 20, 38, 0.72)',
            border: 'rgba(96, 165, 250, 0.5)',
            worldWidth: 5.2,
            fontSize: 20
        });
    }
    addLabel('0% break-even', xMin + 1.9, 0.58, returnZ, {
        color: '#93c5fd',
        background: 'rgba(8, 20, 38, 0.74)',
        border: 'rgba(96, 165, 250, 0.58)',
        worldWidth: compact ? 1.9 : 2.2,
        fontSize: compact ? 15 : 17
    });
    if (!compact) {
        addLabel(`+${maxReturn.toFixed(1)}%`, xMin + 0.8, 5.9, returnZ, {
            color: '#86efac',
            background: 'rgba(9, 9, 11, 0.62)',
            border: 'rgba(63, 63, 70, 0.48)',
            worldWidth: 1.45,
            fontSize: 16
        });
        addLabel(`-${maxReturn.toFixed(1)}%`, xMin + 0.8, -5.9, returnZ, {
            color: '#fdba74',
            background: 'rgba(9, 9, 11, 0.62)',
            border: 'rgba(63, 63, 70, 0.48)',
            worldWidth: 1.45,
            fontSize: 16
        });
    }
    if (best && openScenario && best.id !== openScenario.id && Number.isFinite(best.avgReturn) && Number.isFinite(openScenario.avgReturn)) {
        const delta = best.avgReturn - openScenario.avgReturn;
        if (!compact) {
            addLabel(`vs open: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts`, xMax - 3.35, 5.64, -0.25, {
                color: delta >= 0 ? '#86efac' : '#fdba74',
                background: 'rgba(9, 9, 11, 0.78)',
                border: 'rgba(82, 82, 91, 0.62)',
                worldWidth: 3,
                fontSize: 18
            });
        }
    }
    if (dataset.lowWindow && !compact) {
        addLabel(`Low cluster ${dataset.lowWindow.label}`, xMin + 3.35, -4.25, 1.9, {
            color: '#fbbf24',
            background: 'rgba(24, 16, 4, 0.74)',
            border: 'rgba(245, 158, 11, 0.5)',
            worldWidth: 3.2,
            fontSize: 18
        });
    }
    if (Number.isFinite(dataset.medianMinutes) && !compact) {
        addLabel(`Median low ${formatElapsedCompact(dataset.medianMinutes)}`, xMin + 3.55, -5.05, 1.9, {
            color: '#7dd3fc',
            background: 'rgba(8, 30, 45, 0.74)',
            border: 'rgba(56, 189, 248, 0.5)',
            worldWidth: 3.1,
            fontSize: 18
        });
    }
}

function entryScenarioRow(scenario) {
    return `<div class="grid grid-cols-[3.5rem,1fr,1fr,1fr] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-2">
        <div>
            <div class="font-semibold text-zinc-100">${escapeHtml(scenario.label)}</div>
            <div class="text-[10px] text-zinc-500">${escapeHtml(formatElapsedCompact(scenario.targetDelta))}</div>
        </div>
        <div>
            <div class="${pctToneClass(scenario.avgReturn)} font-semibold">${escapeHtml(fmtPct(scenario.avgReturn))}</div>
            <div class="text-[10px] text-zinc-500">avg end</div>
        </div>
        <div>
            <div class="font-semibold text-amber-300">${escapeHtml((scenario.avgGapToLow || 0).toFixed(1))}%</div>
            <div class="text-[10px] text-zinc-500">gap low</div>
        </div>
        <div>
            <div class="font-semibold text-blue-300">${Math.round(scenario.contained5 || 0)}%</div>
            <div class="text-[10px] text-zinc-500">loss ok</div>
        </div>
    </div>`;
}

function entryInsightPanel(dataset) {
    const scenarios = [...(dataset.entryScenarios?.scenarios || [])]
        .sort((a, b) => (a.targetDelta - b.targetDelta) || a.label.localeCompare(b.label));
    const balanced = dataset.entryScenarios?.balanced || dataset.entryScenarios?.best || null;
    const rawBest = dataset.entryScenarios?.best || null;
    const openScenario = scenarios.find(scenario => scenario.id === 'open') || null;
    const bestVsOpen = rawBest && openScenario && rawBest.id !== openScenario.id && Number.isFinite(rawBest.avgReturn) && Number.isFinite(openScenario.avgReturn)
        ? rawBest.avgReturn - openScenario.avgReturn
        : null;
    const balancedMetrics = balanced
        ? [
            insightMetric('Best balance', `${balanced.label} ${fmtPct(balanced.avgReturn)}`, 'text-emerald-300'),
            insightMetric('Gap to low', `${(balanced.avgGapToLow || 0).toFixed(1)}%`, 'text-amber-300'),
            insightMetric('Loss <5%', `${Math.round(balanced.contained5 || 0)}%`, 'text-blue-300'),
            insightMetric('Low ahead', `${Math.round(balanced.lowStillAheadPct || 0)}%`, 'text-zinc-100')
        ].join('')
        : '';
    return `
        <div class="section-header text-blue-400">Strategy read</div>
        <div class="mt-2 grid grid-cols-2 gap-2">${balancedMetrics}</div>
        <div class="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
            ${balanced ? `<div><span class="font-semibold text-emerald-300">${escapeHtml(balanced.label)}</span> has the best balance of average day-end result, loss containment, and distance from the first-day low.</div>` : ''}
            ${rawBest ? `<div><span class="font-semibold text-emerald-300">${escapeHtml(rawBest.label)} ${escapeHtml(fmtPct(rawBest.avgReturn))}</span> is the highest raw average day-end return.</div>` : ''}
            ${Number.isFinite(bestVsOpen) ? `<div>Compared with buying the first print, the best raw entry improves the average result by <span class="font-semibold ${bestVsOpen >= 0 ? 'text-emerald-300' : 'text-orange-300'}">${bestVsOpen >= 0 ? '+' : ''}${bestVsOpen.toFixed(1)} points</span>.</div>` : ''}
            ${dataset.lowWindow ? `<div>The first-day low clusters around <span class="font-semibold text-amber-300">${escapeHtml(dataset.lowWindow.label)}</span> for this filter.</div>` : ''}
        </div>
        <div class="mt-3 space-y-2 text-xs">${scenarios.map(entryScenarioRow).join('')}</div>`;
}

function entryMobileMetrics(dataset) {
    const balanced = dataset.entryScenarios?.balanced || dataset.entryScenarios?.best || null;
    const rawBest = dataset.entryScenarios?.best || null;
    const medianLowText = dataset.medianLabel ? dataset.medianLabel.replace(/^Median low\s+/i, '') : (Number.isFinite(dataset.medianMinutes) ? formatElapsed(dataset.medianMinutes) : '-');
    return [
        insightMetric('Best balance', balanced ? `${balanced.label} ${fmtPct(balanced.avgReturn)}` : '-', 'text-emerald-300'),
        insightMetric('Best avg', rawBest ? `${rawBest.label} ${fmtPct(rawBest.avgReturn)}` : '-', 'text-emerald-300'),
        insightMetric('Gap to low', balanced ? `${(balanced.avgGapToLow || 0).toFixed(1)}%` : '-', 'text-amber-300'),
        insightMetric('Loss <5%', balanced ? `${Math.round(balanced.contained5 || 0)}%` : '-', 'text-blue-300'),
        insightMetric('Low cluster', dataset.lowWindow ? `${dataset.lowWindow.label} ${Math.round(dataset.lowWindow.pct || 0)}%` : '-', 'text-yellow-300'),
        insightMetric('Median low', medianLowText, 'text-cyan-300')
    ].join('');
}

function entryLegendHtml() {
    return `
        <div class="section-header text-zinc-500">Strategy legend</div>
        <div class="mt-3 space-y-2 text-zinc-400">
            <div class="flex items-center gap-2"><span class="h-3 w-3 rounded-sm bg-emerald-500"></span><span>Green/orange bar: avg result at day end</span></div>
            <div class="flex items-center gap-2"><span class="h-3 w-3 rounded-sm bg-amber-500"></span><span>Amber bar: average missed gap to first-day low</span></div>
            <div class="flex items-center gap-2"><span class="h-2 w-5 rounded-full bg-sky-500"></span><span>Blue rail: loss stayed under 5%</span></div>
        </div>
        <div class="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-[11px] leading-4 text-emerald-200">The highlighted lane is the balanced historical entry, not a prediction.</div>`;
}

function pathLegendHtml(dataset) {
    const isolatedRecord = dataset?.isolated ? dataset.records?.[0] : null;
    const maxVolume = isolatedRecord
        ? Math.max(...isolatedRecord.points.map(point => asNumber(point.volume) || 0), 0)
        : null;
    return `
        <div class="section-header text-zinc-500">Return scale</div>
        <div class="mt-2 space-y-1.5 text-zinc-400">
            <div class="flex items-center justify-between gap-3"><span>High</span><span class="font-semibold text-emerald-400">${escapeHtml(Number.isFinite(dataset?.maxReturn) ? fmtPct(dataset.maxReturn) : '-')}</span></div>
            <div class="flex items-center justify-between gap-3"><span>Open</span><span class="font-semibold text-blue-300">0%</span></div>
            <div class="flex items-center justify-between gap-3"><span>Low</span><span class="font-semibold text-orange-400">${escapeHtml(Number.isFinite(dataset?.minReturn) ? fmtPct(dataset.minReturn) : '-')}</span></div>
            ${Number.isFinite(maxVolume) && maxVolume > 0 ? `<div class="flex items-center justify-between gap-3"><span>5m vol max</span><span class="font-semibold text-sky-300">${escapeHtml(fmtVolume(maxVolume))}</span></div>` : ''}
        </div>`;
}

function flatLowLegendHtml(dataset) {
    const alignment = alignmentMode();
    const scaleLabel = alignment === 'close'
        ? 'countdown to close'
        : (alignment === 'openClose' ? 'open-close' : 'open aligned');
    const rangeLines = [
        dataset?.timeline?.includeExtended ? '<div class="flex items-center justify-between gap-3"><span>Ext</span><span class="font-semibold text-teal-300">after/pre</span></div>' : '',
        dataset?.timeline?.includeSecondDay ? '<div class="flex items-center justify-between gap-3"><span>D2</span><span class="font-semibold text-sky-300">regular</span></div>' : ''
    ].filter(Boolean).join('');
    return `
        <div class="section-header text-zinc-500">Flat scale</div>
        <div class="mt-2 space-y-1.5 text-zinc-400">
            <div class="flex items-center justify-between gap-3"><span>Dot</span><span class="font-semibold text-amber-300">low</span></div>
            <div class="flex items-center justify-between gap-3"><span>X</span><span class="font-semibold text-blue-300">${scaleLabel}</span></div>
            ${rangeLines}
        </div>`;
}

function buildFlatLowLayout(dataset) {
    const alignment = alignmentMode();
    const timeline = dataset?.timeline || {};
    const includeExtended = Boolean(timeline.includeExtended);
    const includeSecondDay = Boolean(timeline.includeSecondDay);
    const includeShared = Boolean(timeline.includeShared || includeExtended || includeSecondDay);
    const plotToX = plot => dataset.toX(Math.min(Math.max(Number(plot) || 0, 0), dataset.maxPlot || timeline.end || 1));
    const regularStartX = plotToX(0);
    const regularEndX = plotToX(timeline.marketClose ?? timeline.regularEnd ?? 0);
    const sharedStartX = plotToX(includeExtended ? timeline.afterStart : timeline.gapStart);
    const sharedEndX = plotToX(timeline.end ?? timeline.marketClose ?? 0);
    const maxDuration = Math.max(
        120,
        Math.min(390, Math.ceil(Math.max(...dataset.records.map(record => record.dayEndDelta || 0), 300) / 30) * 30)
    );
    const elapsedToX = minutes => plotToX(timeline.elapsedToPlot ? timeline.elapsedToPlot(minutes) : 0);
    const progressToX = progress => plotToX(timeline.progressToPlot ? timeline.progressToPlot(progress) : 0);
    const clockMinuteToX = minute => plotToX(timeline.minuteToPlot ? timeline.minuteToPlot(minute) : 0);
    const sharedMinuteToX = minute => plotToX(timeline.minuteToPlot ? timeline.minuteToPlot(minute) : timeline.end);
    const lowPointToX = (record, point) => plotToX(timeline.pointToPlot ? timeline.pointToPlot(record, point) : 0);
    const medianGuideX = includeShared
        ? dataset.medianX
        : (alignment === 'close'
            ? (Number.isFinite(dataset.medianClockMinute) ? clockMinuteToX(dataset.medianClockMinute) : null)
            : (alignment === 'openClose'
                ? (Number.isFinite(dataset.medianRegularLowFraction) ? progressToX(dataset.medianRegularLowFraction) : null)
                : (Number.isFinite(dataset.medianMinutes) ? elapsedToX(dataset.medianMinutes) : null)));
    return {
        alignment,
        includeShared,
        includeExtended,
        includeSecondDay,
        regularStartX,
        regularEndX,
        sharedStartX,
        sharedEndX,
        afterStartX: plotToX(timeline.afterStart ?? timeline.marketClose ?? 0),
        afterEndX: plotToX(timeline.afterEnd ?? timeline.marketClose ?? 0),
        gapStartX: plotToX(timeline.gapStart ?? timeline.marketClose ?? 0),
        gapEndX: plotToX(timeline.gapEnd ?? timeline.marketClose ?? 0),
        preStartX: plotToX(timeline.preStart ?? timeline.marketClose ?? 0),
        preEndX: plotToX(timeline.preEnd ?? timeline.marketClose ?? 0),
        secondOpenX: plotToX(timeline.secondOpen ?? timeline.end ?? 0),
        secondEndX: plotToX(timeline.end ?? timeline.secondOpen ?? 0),
        gapWidth: Math.max(0, plotToX(timeline.gapEnd ?? 0) - plotToX(timeline.gapStart ?? 0)),
        maxDuration,
        regularClockStart: MARKET_OPEN_MINUTES,
        regularClockEnd: MARKET_CLOSE_MINUTES,
        regularClockSpan: MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES,
        elapsedToX,
        progressToX,
        clockMinuteToX,
        sharedMinuteToX,
        lowPointToX,
        medianGuideX,
        marketCloseX: regularEndX
    };
}

function flatAxisTickCandidates(layout) {
    const ticks = [];
    if (layout.alignment === 'close') {
        const regularTicks = [MARKET_OPEN_MINUTES, 11 * 60, 12 * 60 + 30, 14 * 60, 15 * 60 + 30, MARKET_CLOSE_MINUTES];
        regularTicks.forEach(minute => {
            const countdown = minute === MARKET_CLOSE_MINUTES ? 'T-0h00m' : formatCountdownToClose(minute);
            ticks.push({
                x: layout.clockMinuteToX(minute),
                label: minute === MARKET_CLOSE_MINUTES ? `D1 Close ${countdown}` : `D1 ${formatClockFromMinute(minute)} ${countdown}`,
                color: minute === MARKET_CLOSE_MINUTES ? '#e4e4e7' : '#a1a1aa',
                priority: minute === MARKET_CLOSE_MINUTES ? 7 : (minute === MARKET_OPEN_MINUTES ? 5 : 3),
                hourTick: true
            });
        });
    } else if (layout.alignment === 'openClose') {
        [
            { progress: 0, label: 'Open', priority: 7 },
            { progress: 0.25, label: '25%', priority: 3 },
            { progress: 0.5, label: '50%', priority: 5 },
            { progress: 0.75, label: '75%', priority: 3 },
            { progress: 1, label: 'Close', priority: 7 }
        ].forEach(tick => {
            ticks.push({
                x: layout.progressToX(tick.progress),
                label: tick.label,
                color: tick.progress === 0 || tick.progress === 1 ? '#e4e4e7' : '#a1a1aa',
                priority: tick.priority,
                hourTick: tick.priority >= 5
            });
        });
    } else {
        const elapsedTicks = [0, 30, 60, 120, 180, 240, 300, 360].filter(minute => minute <= layout.maxDuration + 0.1);
        elapsedTicks.forEach(minute => {
            ticks.push({
                x: layout.elapsedToX(minute),
                label: formatElapsedCompact(minute),
                color: minute === 0 ? '#e4e4e7' : '#a1a1aa',
                priority: minute === 0 ? 6 : (minute % 60 === 0 ? 3 : 1),
                hourTick: minute === 0 || minute % 60 === 0
            });
        });
    }
    if (layout.includeExtended) {
        const dayPrefix = layout.alignment === 'close';
        const sharedTicks = [
            { minute: MARKET_CLOSE_MINUTES, label: dayPrefix ? 'D1 16:00' : '16:00', priority: 6, color: '#e4e4e7' },
            { minute: 17 * 60, label: dayPrefix ? 'D1 17:00' : '17:00', priority: 3, color: '#cbd5e1' },
            { minute: 18 * 60, label: dayPrefix ? 'D1 18:00' : '18:00', priority: 3, color: '#cbd5e1' },
            { minute: 19 * 60, label: dayPrefix ? 'D1 19:00' : '19:00', priority: 3, color: '#cbd5e1' },
            { minute: AFTER_HOURS_END_MINUTES, label: dayPrefix ? 'D1 20:00' : '20:00', priority: 5, color: '#cbd5e1' },
            { minute: PREMARKET_START_MINUTES, label: 'D2 04:00', priority: 6, color: '#99f6e4' },
            { minute: PREMARKET_START_MINUTES + 2 * 60, label: dayPrefix ? 'D2 06:00' : '06:00', priority: 2, color: '#99f6e4' },
            { minute: PREMARKET_START_MINUTES + 4 * 60, label: dayPrefix ? 'D2 08:00' : '08:00', priority: 2, color: '#99f6e4' },
            ...(!layout.includeSecondDay ? [{ minute: SECOND_DAY_OPEN_MINUTES, label: dayPrefix ? 'D2 09:30' : '09:30', priority: 6, color: '#f8fafc' }] : [])
        ];
        sharedTicks.forEach(tick => ticks.push({
            ...tick,
            x: layout.sharedMinuteToX(tick.minute),
            hourTick: tick.priority >= 5
        }));
    }
    if (layout.includeSecondDay) {
        const secondTicks = [
            { minute: SECOND_DAY_OPEN_MINUTES, label: 'D2 09:30', priority: 7, color: '#f8fafc' },
            { minute: DAY_MINUTES + 12 * 60, label: '12:00', priority: 3, color: '#bfdbfe' },
            { minute: DAY_MINUTES + 14 * 60, label: '14:00', priority: 3, color: '#bfdbfe' },
            { minute: DAY_MINUTES + MARKET_CLOSE_MINUTES, label: 'D2 16:00', priority: 6, color: '#bfdbfe' }
        ];
        secondTicks.forEach(tick => ticks.push({
            ...tick,
            x: layout.sharedMinuteToX(tick.minute),
            hourTick: tick.priority >= 5
        }));
    }
    const filtered = [];
    [...ticks].sort((a, b) => a.x - b.x).forEach(tick => {
        const previous = filtered[filtered.length - 1];
        const longLabel = tick.label.length > 13 || previous?.label?.length > 13;
        const minGap = longLabel ? 3.35 : (tick.label.length > 5 || previous?.label?.length > 5 ? 2.35 : 1.65);
        if (!previous || tick.x - previous.x >= minGap) {
            filtered.push(tick);
        } else if ((tick.priority || 0) > (previous.priority || 0)) {
            filtered[filtered.length - 1] = tick;
        }
    });
    return filtered;
}

function addFlatLowTimeAxis(dataset, y, zMax, layout) {
    const ticks = flatAxisTickCandidates(layout);
    if (!ticks.length) return;
    const axisZ = zMax + 0.58;
    const labelZ = zMax + 1.22;
    const axisY = y + 0.16;
    state.world.add(lineSegments([
        dataset.xMin - 0.8, axisY, axisZ,
        dataset.xMax + 0.8, axisY, axisZ
    ], colors.gridStrong, 0.72));

    ticks.forEach(tick => {
        const major = tick.hourTick || tick.priority >= 5;
        const tickDepth = major ? 0.62 : 0.44;
        state.world.add(lineSegments([
            tick.x, axisY, axisZ - 0.18,
            tick.x, axisY, axisZ + tickDepth
        ], major ? colors.gridStrong : colors.grid, major ? 0.82 : 0.58));
        addLabel(tick.label, tick.x, y + (major ? 0.6 : 0.48), labelZ, {
            color: major ? FLAT_SCALE_MAJOR_TEXT : FLAT_SCALE_MINOR_TEXT,
            background: 'transparent',
            textStroke: 'rgba(2, 6, 23, 0.88)',
            textStrokeWidth: major ? 4 : 3,
            worldWidth: tick.label.length > 13 ? 2.9 : (tick.label.length > 7 ? 1.72 : (tick.label.length > 5 ? 1.35 : 1.08)),
            fontSize: major ? 13 : 12,
            paddingX: 5,
            paddingY: 3,
            renderOrder: 12
        });
        if (tick.subLabel) {
            addLabel(tick.subLabel, tick.x, y + 0.23, labelZ, {
                color: FLAT_SCALE_MINOR_TEXT,
                background: 'transparent',
                textStroke: 'rgba(2, 6, 23, 0.84)',
                textStrokeWidth: 3,
                worldWidth: tick.subLabel.length > 6 ? 1.38 : 1.12,
                fontSize: 11,
                paddingX: 5,
                paddingY: 3,
                renderOrder: 12
            });
        }
    });
}

function addFlatLowYearAxis(dataset, y) {
    const records = dataset?.records || [];
    if (!records.length) return;
    const yearRows = [];
    records.forEach(record => {
        const year = ipoYear(record);
        if (!year) return;
        let group = yearRows.find(item => item.year === year);
        if (!group) {
            group = { year, zValues: [] };
            yearRows.push(group);
        }
        group.zValues.push(record.z);
    });
    if (!yearRows.length) return;
    const axisX = dataset.xMin - 1.08;
    const labelX = dataset.xMin - 1.82;
    const axisY = y + 0.16;
    const axisZMin = dataset.zMin - 0.9;
    const axisZMax = dataset.zMax + 0.9;
    state.world.add(lineSegments([
        axisX, axisY, axisZMin,
        axisX, axisY, axisZMax
    ], colors.gridStrong, 0.58));
    yearRows.forEach(group => {
        const z = averageNumber(group.zValues);
        if (!Number.isFinite(z)) return;
        state.world.add(lineSegments([
            axisX - 0.42, axisY, z,
            axisX + 0.42, axisY, z
        ], colors.gridStrong, 0.62));
        addLabel(group.year, labelX, y + 0.52, z, {
            color: FLAT_SCALE_MAJOR_TEXT,
            background: 'transparent',
            textStroke: 'rgba(2, 6, 23, 0.88)',
            textStrokeWidth: 3,
            worldWidth: 1.0,
            fontSize: 12,
            paddingX: 5,
            paddingY: 3,
            renderOrder: 12
        });
    });
}

function addFlatLowMesh(dataset, y, layout) {
    const width = X_SPAN + 2.8;
    const depth = dataset.zSpan + 2.4;
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial({
            color: 0x111827,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, y, 0);
    state.world.add(floor);

    const grid = [];
    const zMin = dataset.zMin - 0.9;
    const zMax = dataset.zMax + 0.9;
    flatAxisTickCandidates(layout).forEach(tick => {
        const x = tick.x;
        grid.push(x, y + 0.045, zMin, x, y + 0.045, zMax);
    });
    const zLines = Math.min(dataset.records.length, 36);
    const zStep = zLines > 1 ? dataset.zSpan / (zLines - 1) : dataset.zSpan;
    for (let i = 0; i < zLines; i += 1) {
        const z = dataset.zMin + zStep * i;
        grid.push(dataset.xMin - 0.8, y + 0.045, z, dataset.xMax + 0.8, y + 0.045, z);
    }
    state.world.add(lineSegments(grid, 0x475569, 0.48));
    addFlatLowTimeAxis(dataset, y, zMax, layout);
    addFlatLowYearAxis(dataset, y);

    const addProjectedGuide = (x, color, opacity) => {
        if (!Number.isFinite(x)) return;
        state.world.add(lineSegments([
            x, y + 0.12, zMin,
            x, y + 0.12, zMax
        ], color, opacity));
    };
    addProjectedGuide(layout.medianGuideX, colors.median, 0.88);
    if (layout.alignment === 'close' || layout.alignment === 'openClose') {
        addProjectedGuide(layout.marketCloseX, colors.highlight, 0.72);
    }
    if (layout.includeShared) {
        addProjectedGuide(layout.gapStartX, colors.neutral, 0.82);
    }
    if (layout.includeExtended) {
        addProjectedGuide(layout.sharedMinuteToX(PREMARKET_START_MINUTES), 0x2dd4bf, 0.76);
        addProjectedGuide(layout.sharedMinuteToX(SECOND_DAY_OPEN_MINUTES), 0xffffff, 0.7);
    }
    if (layout.includeSecondDay) {
        addProjectedGuide(layout.secondOpenX, 0xffffff, 0.72);
        addProjectedGuide(layout.secondEndX, 0x93c5fd, 0.54);
    }

    if (layout.alignment === 'open' && dataset.lowWindow && Number.isFinite(dataset.lowWindow.startMinutes) && Number.isFinite(dataset.lowWindow.endMinutes)) {
        const startX = Math.min(layout.elapsedToX(dataset.lowWindow.startMinutes), layout.elapsedToX(dataset.lowWindow.endMinutes));
        const endX = Math.max(layout.elapsedToX(dataset.lowWindow.startMinutes), layout.elapsedToX(dataset.lowWindow.endMinutes));
        const band = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.max(0.18, endX - startX), depth),
            new THREE.MeshBasicMaterial({
                color: colors.low,
                transparent: true,
                opacity: 0.14,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        band.rotation.x = -Math.PI / 2;
        band.position.set((startX + endX) / 2, y + 0.025, 0);
        state.world.add(band);
    }

    if (layout.includeShared) {
        const seam = new THREE.Mesh(
            new THREE.BoxGeometry(0.09, 0.09, depth),
            new THREE.MeshBasicMaterial({
                color: colors.neutral,
                transparent: true,
                opacity: 0.55,
                depthWrite: false
            })
        );
        seam.position.set(layout.sharedStartX, y + 0.12, 0);
        state.world.add(seam);
    }

}

function addFlattenLowScene(dataset, animateDrop = false) {
    const y = flatLowY(dataset);
    const layout = buildFlatLowLayout(dataset);
    addFlatLowMesh(dataset, y, layout);

    const openGeometry = new THREE.SphereGeometry(0.12, 12, 8);
    const openMaterial = new THREE.MeshBasicMaterial({
        color: colors.start,
        transparent: true,
        opacity: 0.95
    });
    const lowGeometry = new THREE.SphereGeometry(0.2, 16, 10);
    const secondaryLowGeometry = new THREE.SphereGeometry(0.16, 14, 9);
    const items = [];
    dataset.records.forEach((record, index) => {
        const openPoint = record.visualPoints[0] || record.points[0];
        if (openPoint) {
            const openX = layout.alignment === 'close'
                ? layout.clockMinuteToX(openPoint.sessionMinute)
                : layout.elapsedToX(0);
            const openY = y + 0.3;
            const openMarker = new THREE.Mesh(openGeometry, openMaterial.clone());
            openMarker.position.set(animateDrop ? openPoint.x : openX, animateDrop ? openPoint.y : openY, record.z);
            openMarker.userData.record = record;
            openMarker.userData.openMarker = true;
            state.pickables.push(openMarker);
            state.world.add(openMarker);
            items.push({
                marker: openMarker,
                label: null,
                startX: animateDrop ? openPoint.x : openX,
                endX: openX,
                startY: animateDrop ? openPoint.y : openY,
                endY: openY
            });
        }

        const lowSpecs = flatLowMarkerSpecs(record);
        lowSpecs.forEach((lowSpec, specIndex) => {
            const low = lowSpec.point;
            const flatX = layout.lowPointToX(record, low);
            const endY = y + 0.26;
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: lowSpec.color,
                transparent: true,
                opacity: 0.95
            });
            const marker = new THREE.Mesh(lowSpec.id === 'regular' ? lowGeometry : secondaryLowGeometry, markerMaterial);
            marker.position.set(animateDrop ? low.x : flatX, animateDrop ? low.yLow : endY, low.z);
            marker.userData.record = record;
            marker.userData.lowMarkerSpec = lowSpec;
            marker.userData.flatBaseScale = 1;
            state.lowMarkers.push(marker);
            state.pickables.push(marker);
            state.world.add(marker);

            let label = null;
            const labelText = lowSpecs.length > 1
                ? `${record.ticker} ${lowSpec.shortLabel}`
                : record.ticker;
            const baseOpacity = lowSpec.id === 'regular' || lowSpecs.length === 1 ? 0.92 : 0;
            const labelY = y + 0.86 + (index % 3) * 0.18 + (specIndex % 3) * 0.16;
            const labelZ = low.z + (index % 2 ? 0.16 : -0.16) + (specIndex - (lowSpecs.length - 1) / 2) * 0.12;
            label = makeLabelSprite(labelText, {
                color: lowSpec.text,
                border: lowSpec.border,
                background: lowSpec.id === 'regular' ? 'rgba(9, 9, 11, 0.76)' : 'rgba(9, 9, 11, 0.66)',
                worldWidth: lowSpecs.length > 1 ? 1.42 : 1.08,
                fontSize: 18,
                paddingX: 12,
                paddingY: 7
            });
            label.position.set(animateDrop ? low.x : flatX, animateDrop ? low.yLow + 0.74 : labelY, labelZ);
            label.material.opacity = animateDrop ? 0 : baseOpacity;
            label.userData.record = record;
            label.userData.lowMarkerSpec = lowSpec;
            label.userData.baseOpacity = baseOpacity;
            label.userData.basePosition = new THREE.Vector3(flatX, labelY, labelZ);
            state.lowLabels.push(label);
            state.pickables.push(label);
            state.world.add(label);

            items.push({
                marker,
                label,
                startX: animateDrop ? low.x : flatX,
                endX: flatX,
                startY: animateDrop ? low.yLow : endY,
                endY,
                labelStartX: animateDrop ? low.x : flatX,
                labelEndX: flatX,
                labelStartY: animateDrop ? low.yLow + 0.74 : labelY,
                labelEndY: labelY
            });
        });
    });

    if (!animateDrop) return;
    addTween(980, (eased, raw) => {
        const labelFade = clamp((raw - 0.22) / 0.58, 0, 1);
        items.forEach(item => {
            item.marker.position.x = lerp(item.startX, item.endX, eased);
            item.marker.position.y = lerp(item.startY, item.endY, eased);
            if (item.label) {
                item.label.position.x = lerp(item.labelStartX, item.labelEndX, eased);
                item.label.position.y = lerp(item.labelStartY, item.labelEndY, eased);
                item.label.material.opacity = labelFade * 0.92;
            }
        });
    }, () => {
        items.forEach(item => {
            item.marker.position.x = item.endX;
            item.marker.position.y = item.endY;
            if (!item.label) return;
            if (item.label.userData.basePosition) {
                item.label.position.copy(item.label.userData.basePosition);
            } else {
                item.label.position.y = item.labelEndY;
            }
            item.label.material.opacity = item.label.userData.baseOpacity ?? 0.92;
        });
    });
}

function restoreFlatLowLabelPositions() {
    state.lowLabels.forEach(label => {
        if (label.userData.basePosition) {
            label.position.copy(label.userData.basePosition);
        }
        if (label.material?.opacity !== undefined) {
            label.material.opacity = label.userData.baseOpacity ?? 0.92;
        }
        label.renderOrder = 10;
    });
}

function removeFlatSelectionArrow() {
    if (!state.flatSelectionArrow) return;
    if (state.flatSelectionArrow.parent) {
        state.flatSelectionArrow.parent.remove(state.flatSelectionArrow);
    }
    disposeObject(state.flatSelectionArrow);
    state.flatSelectionArrow = null;
}

function updateFlatSelectionArrow() {
    removeFlatSelectionArrow();
    restoreFlatLowLabelPositions();
    const ticker = state.flatPinnedTicker;
    if (!state.flatLowActive || state.view !== 'paths' || !state.world || !ticker) return;
    const record = state.dataset?.records?.find(item => item.ticker === ticker);
    if (!record) return;
    const markers = state.lowMarkers.filter(marker => marker.userData.record === record);
    if (!markers.length) return;

    const group = new THREE.Group();
    markers.forEach((marker, markerIndex) => {
        const arrowMaterial = new THREE.MeshBasicMaterial({
            color: colors.highlight,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false
        });
        const tipY = marker.position.y + 0.46;
        const headLength = 0.72;
        const shaftLength = 3.95;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, headLength, 18), arrowMaterial.clone());
        cone.rotation.z = Math.PI;
        cone.position.set(marker.position.x, tipY + headLength / 2, marker.position.z);
        cone.renderOrder = 24;
        group.add(cone);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, shaftLength, 12), arrowMaterial.clone());
        shaft.position.set(marker.position.x, tipY + headLength + shaftLength / 2, marker.position.z);
        shaft.renderOrder = 23;
        group.add(shaft);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.035, 8, 36),
            new THREE.MeshBasicMaterial({
                color: colors.highlight,
                transparent: true,
                opacity: 0.92,
                depthTest: false,
                depthWrite: false
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(marker.position.x, marker.position.y + 0.05, marker.position.z);
        ring.renderOrder = 22;
        group.add(ring);

        const side = marker.position.x > (state.dataset?.xMax || 0) - 2 ? -1 : 1;
        const lowSpec = marker.userData.lowMarkerSpec;
        const stackOffset = markerIndex - (markers.length - 1) / 2;
        const callout = makeLabelSprite(`${record.ticker} ${lowSpec?.shortLabel || ''}`.trim(), {
            color: lowSpec?.text || '#f8fafc',
            border: lowSpec?.border || 'rgba(255, 255, 255, 0.58)',
            background: 'rgba(9, 9, 11, 0.82)',
            worldWidth: 1.52,
            fontSize: 18,
            paddingX: 12,
            paddingY: 7,
            renderOrder: 44
        });
        callout.position.set(
            marker.position.x + side * (1.28 + (markerIndex % 2) * 0.34),
            tipY + headLength + shaftLength + 0.48 + markerIndex * 0.22,
            marker.position.z + stackOffset * 0.42
        );
        group.add(callout);

        state.lowLabels
            .filter(label => {
                if (label.userData.record !== record) return false;
                const labelSpec = label.userData.lowMarkerSpec;
                const markerSpec = marker.userData.lowMarkerSpec;
                if (labelSpec === markerSpec) return true;
                return labelSpec?.id === markerSpec?.id
                    && labelSpec?.point?.date === markerSpec?.point?.date
                    && labelSpec?.point?.time === markerSpec?.point?.time;
            })
            .forEach(label => {
                const base = label.userData.basePosition || label.position;
                label.position.set(
                    base.x + side * (0.82 + (markerIndex % 2) * 0.22),
                    base.y + 0.2 + markerIndex * 0.34,
                    base.z + 0.12 + stackOffset * 0.28
                );
                if (label.material?.opacity !== undefined) {
                    label.material.opacity = 1;
                }
                label.renderOrder = 40;
            });
    });
    state.flatSelectionArrow = group;
    state.world.add(group);
}

function addMarkers(dataset) {
    const startGeometry = new THREE.SphereGeometry(0.11, 10, 8);
    const startMaterial = new THREE.MeshBasicMaterial({ color: colors.start });
    const lowGeometry = new THREE.SphereGeometry(0.16, 12, 8);
    const secondaryLowGeometry = new THREE.SphereGeometry(0.13, 12, 8);
    const endGeometry = new THREE.SphereGeometry(0.12, 10, 8);

    dataset.records.forEach(record => {
        const start = record.visualPoints[0];
        const startMesh = new THREE.Mesh(startGeometry, startMaterial);
        startMesh.position.set(start.x, start.y, start.z);
        startMesh.userData.record = record;
        state.pickables.push(startMesh);
        trackRecordObject(record, startMesh);
        state.world.add(startMesh);

        const lowSpecs = record.lowMarkerSpecs3d?.length
            ? record.lowMarkerSpecs3d
            : [lowMarkerSpec('regular', record.lowPoint3d)].filter(Boolean);
        lowSpecs.forEach(lowSpec => {
            const low = lowSpec.point;
            const lowMesh = new THREE.Mesh(
                lowSpec.id === 'regular' ? lowGeometry : secondaryLowGeometry,
                new THREE.MeshBasicMaterial({ color: lowSpec.color, transparent: true, opacity: 0.95 })
            );
            lowMesh.position.set(low.x, low.yLow, low.z);
            lowMesh.userData.record = record;
            lowMesh.userData.lowMarkerSpec = lowSpec;
            lowMesh.userData.flatBaseScale = 1;
            state.lowMarkers.push(lowMesh);
            state.pickables.push(lowMesh);
            trackRecordObject(record, lowMesh);
            state.world.add(lowMesh);
        });

        const endPoint = record.points[record.points.length - 1];
        const endMaterial = new THREE.MeshBasicMaterial({ color: record.color });
        const endMesh = new THREE.Mesh(endGeometry, endMaterial);
        endMesh.position.set(endPoint.x, endPoint.y, endPoint.z);
        endMesh.userData.record = record;
        state.pickables.push(endMesh);
        trackRecordObject(record, endMesh);
        state.world.add(endMesh);
    });
}

function buildScene(options = {}) {
    if (!ensureScene()) return;
    clearWorld();
    const dataset = isolatedRenderDataset(buildDataset());
    state.dataset = dataset;
    updateModeControls(dataset);

    if (!dataset || !dataset.records.length) {
        updateSummary(dataset);
        updateSymbolPills(dataset);
        byId('three-map-empty')?.classList.remove('hidden');
        renderFrame();
        return;
    }

    byId('three-map-empty')?.classList.add('hidden');
    byId('three-map-hover')?.classList.toggle('hidden', state.view === 'entry');
    if (state.view === 'entry') {
        setEntryCameraForStage();
        addEntryScene(dataset);
    } else if (state.flatLowActive) {
        addFlattenLowScene(dataset, Boolean(options.animateFlatten));
        const config = flatLowCameraConfig(dataset);
        if (options.animateFlatten) {
            tweenCameraTo(config, 760);
        } else if (!options.preserveCamera) {
            state.target.copy(config.target);
            state.yaw = config.yaw;
            state.pitch = config.pitch;
            state.distance = config.distance;
        }
    } else {
        setPathCameraForDataset(dataset, Boolean(options.resetCamera || !state.interacted));
        addGrid(dataset);
        addMedianWall(dataset);
        addMarketCloseWall(dataset);
        addSceneLabels(dataset);
        addRangeSticks(dataset);
        addIsolatedVolumeBars(dataset);
        addPathLines(dataset);
        addMarkers(dataset);
    }
    updateSummary(dataset);
    updateSymbolPills(dataset);
    if (state.view === 'entry') {
        setSelectedRecord(null);
    } else {
        const pinnedTicker = state.flatLowActive && state.flatPinnedTicker
            ? state.flatPinnedTicker
            : state.selectedTicker;
        const selected = pinnedTicker
            ? dataset.records.find(record => record.ticker === pinnedTicker)
            : null;
        if (selected) {
            setSelectedRecord(selected);
        } else {
            state.selectedTicker = '';
            state.isolatedTicker = '';
            setHoveredRecord(null);
            updateSelectedCandleOverlay();
            updateRecordVisibility();
        }
    }
    updateCamera();
    renderFrame();
}

function updateModeControls(dataset = state.dataset) {
    const day = byId('three-map-mode-day1');
    const extended = byId('three-map-mode-extended');
    const d1d2 = byId('three-map-mode-d1d2');
    const d1extd2 = byId('three-map-mode-d1extd2');
    const entry = byId('three-map-view-entry');
    const paths = byId('three-map-view-paths');
    const hasExtended = Boolean(dataset?.hasExtended);
    const hasSecondDay = Boolean(dataset?.hasSecondDay);
    if (state.mode === 'd1ExtD2' && !(hasExtended && hasSecondDay)) {
        state.mode = hasSecondDay ? 'd1D2' : (hasExtended ? 'extended' : 'day1');
    }
    if (!hasSecondDay && state.mode === 'd1D2') {
        state.mode = hasExtended ? 'extended' : 'day1';
    }
    if (!hasExtended && state.mode === 'extended') {
        state.mode = 'day1';
    }
    setSegmentState(entry, state.view === 'entry', false);
    setSegmentState(paths, state.view === 'paths', false);
    setSegmentState(day, state.mode === 'day1', false);
    setSegmentState(extended, state.mode === 'extended', !hasExtended);
    setSegmentState(d1d2, state.mode === 'd1D2', !hasSecondDay);
    setSegmentState(d1extd2, state.mode === 'd1ExtD2', !(hasExtended && hasSecondDay));
    applyFlatLowControlState(dataset);
    applyFlatLowAlignmentControlState(dataset);
}

function setSegmentState(button, selected, disabled) {
    if (!button) return;
    button.disabled = disabled;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.classList.toggle('bg-blue-600', selected);
    button.classList.toggle('text-white', selected);
    button.classList.toggle('text-zinc-400', !selected && !disabled);
    button.classList.toggle('hover:text-zinc-200', !selected && !disabled);
    button.classList.toggle('text-zinc-600', disabled);
    button.classList.toggle('cursor-not-allowed', disabled);
}

function applyFlatLowControlState(dataset = state.dataset) {
    const button = byId('three-map-flatten-low');
    const disabled = !dataset?.records?.length || state.view === 'entry';
    const active = state.flatLowActive && !disabled;
    if (button) {
        button.disabled = disabled;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('border-amber-400/70', active);
        button.classList.toggle('bg-amber-500/15', active);
        button.classList.toggle('text-amber-100', active);
        button.classList.toggle('shadow-[0_0_0_1px_rgba(251,191,36,0.28)]', active);
        button.classList.toggle('border-zinc-700', !active);
        button.classList.toggle('bg-zinc-900', !active);
        button.classList.toggle('text-zinc-300', !active && !disabled);
        button.classList.toggle('text-zinc-600', disabled);
        button.classList.toggle('cursor-not-allowed', disabled);
    }
}

function setFlatAlignmentButtonState(button, selected) {
    if (!button) return;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.classList.toggle('bg-blue-600', selected);
    button.classList.toggle('text-white', selected);
    button.classList.toggle('text-zinc-400', !selected);
    button.classList.toggle('hover:text-zinc-200', !selected);
}

function applyFlatLowAlignmentControlState(dataset = state.dataset) {
    const group = byId('three-map-flat-align-toggle');
    const open = byId('three-map-flat-align-open');
    const both = byId('three-map-flat-align-both');
    const close = byId('three-map-flat-align-close');
    const visible = Boolean(dataset?.records?.length && state.view === 'paths');
    const alignment = alignmentMode();
    if (group) {
        group.classList.toggle('hidden', !visible);
        group.classList.toggle('inline-grid', visible);
        group.classList.toggle('grid-cols-3', visible);
    }
    setFlatAlignmentButtonState(open, alignment === 'open');
    setFlatAlignmentButtonState(both, alignment === 'openClose');
    setFlatAlignmentButtonState(close, alignment === 'close');
}

function setInfoPanelToggleState(button, visible, label, activeIcon) {
    if (!button) return;
    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${label}`);
    button.setAttribute('title', `${visible ? 'Hide' : 'Show'} ${label}`);
    button.classList.toggle('border-blue-500/40', visible);
    button.classList.toggle('bg-blue-500/10', visible);
    button.classList.toggle('text-blue-200', visible);
    button.classList.toggle('hover:border-blue-300', visible);
    button.classList.toggle('hover:text-white', visible);
    button.classList.toggle('border-zinc-700', !visible);
    button.classList.toggle('bg-zinc-900', !visible);
    button.classList.toggle('text-zinc-400', !visible);
    button.classList.toggle('hover:border-zinc-500', !visible);
    button.classList.toggle('hover:text-zinc-100', !visible);
    const icon = button.querySelector('i');
    if (icon) {
        icon.className = visible ? `fa-solid ${activeIcon} text-xs` : 'fa-solid fa-eye-slash text-xs';
    }
}

function applyInfoPanelVisibility() {
    const symbols = byId('three-map-symbol-strip');
    const insights = byId('three-map-insights');
    const mobileInsights = byId('three-map-mobile-insights');
    const scale = byId('three-map-scale');
    const selected = byId('three-map-hover');
    const symbolListVisible = state.symbolListVisible && state.view !== 'entry';
    const selectedVisible = state.selectedPanelVisible && state.view !== 'entry';
    if (symbols) symbols.style.display = symbolListVisible ? '' : 'none';
    if (insights) insights.style.display = state.quickReadVisible ? '' : 'none';
    if (mobileInsights) mobileInsights.style.display = state.quickReadVisible ? '' : 'none';
    if (scale) scale.style.display = state.scalePanelVisible ? 'block' : 'none';
    if (selected) selected.style.display = selectedVisible ? '' : 'none';
    setInfoPanelToggleState(byId('three-map-symbols-toggle'), symbolListVisible, 'Symbols', 'fa-list-ul');
    setInfoPanelToggleState(byId('three-map-insights-toggle'), state.quickReadVisible, 'Quick Read', 'fa-chart-simple');
    setInfoPanelToggleState(byId('three-map-scale-toggle'), state.scalePanelVisible, 'Scale', 'fa-ruler-combined');
    setInfoPanelToggleState(byId('three-map-selected-toggle'), selectedVisible, 'Selected IPO', 'fa-circle-info');
}

function applyQuickReadVisibility() {
    applyInfoPanelVisibility();
}

function updateSymbolPillState(record = state.hoveredRecord) {
    const strip = byId('three-map-symbol-strip');
    if (!strip) return;
    strip.querySelectorAll('button[data-three-map-symbol]').forEach(button => {
        const ticker = button.dataset.threeMapSymbol;
        const highlightedTicker = state.selectedTicker || record?.ticker || '';
        const active = Boolean(highlightedTicker && ticker === highlightedTicker);
        const hiddenByIsolation = Boolean(state.isolatedTicker && ticker !== state.isolatedTicker);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('border-blue-300', active);
        button.classList.toggle('bg-blue-500/15', active);
        button.classList.toggle('shadow-[0_0_0_1px_rgba(147,197,253,0.35)]', active);
        button.classList.toggle('border-zinc-700', !active);
        button.classList.toggle('bg-zinc-950/80', !active);
        button.classList.toggle('hover:border-blue-500/70', !active);
        button.classList.toggle('opacity-35', hiddenByIsolation);
    });
}

function updateSymbolPills(dataset = state.dataset) {
    const strip = byId('three-map-symbol-strip');
    if (!strip) return;
    const records = dataset?.allRecords || dataset?.records || [];
    if (state.view === 'entry' || !records.length) {
        strip.classList.add('hidden');
        strip.classList.remove('block');
        strip.innerHTML = '';
        applyInfoPanelVisibility();
        return;
    }
    strip.classList.remove('hidden');
    strip.classList.add('block');
    const grouped = [...records]
        .sort((a, b) => ipoYear(b).localeCompare(ipoYear(a)) || a.ticker.localeCompare(b.ticker))
        .reduce((groups, record) => {
            const year = ipoYear(record) || 'Year n/a';
            if (!groups.has(year)) groups.set(year, []);
            groups.get(year).push(record);
            return groups;
        }, new Map());
    const symbolButtonHtml = (record, spanFull = false) => {
        const tone = record.dayEndPct >= 0
            ? 'text-emerald-300 hover:text-emerald-200'
            : 'text-orange-300 hover:text-orange-200';
        const name = record.name || record.ticker;
        return `<button type="button" data-three-map-symbol="${escapeHtml(record.ticker)}" aria-pressed="false" aria-label="Select ${escapeHtml(record.ticker)} line" title="${escapeHtml(name)}" class="${spanFull ? 'col-span-2 ' : ''}inline-flex h-4 min-w-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/80 px-0.5 text-[9px] font-semibold leading-none ${tone} transition-colors hover:border-blue-500/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <span>${escapeHtml(record.ticker)}</span>
        </button>`;
    };
    strip.innerHTML = `<div class="grid w-full items-start gap-1" style="grid-template-columns:repeat(${grouped.size},minmax(0,1fr));">
        ${[...grouped.entries()].map(([year, yearRecords]) => `
            <div data-year-group="${escapeHtml(year)}" class="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-zinc-800/60 bg-zinc-950/45 px-0.5 py-1">
                <div class="w-full whitespace-nowrap text-center text-[9px] font-semibold leading-none text-zinc-500">${escapeHtml(year)}</div>
                <div class="grid w-full min-w-0 grid-cols-2 gap-0.5">${yearRecords.map(record => symbolButtonHtml(record, yearRecords.length === 1)).join('')}</div>
            </div>
        `).join('')}
    </div>`;
    updateSymbolPillState();
    applyInfoPanelVisibility();
}

function setSelectedRecord(record) {
    state.selectedTicker = record?.ticker || '';
    if (!record) {
        leaveIsolatedRender();
    }
    setHoveredRecord(record);
    updateSelectedCandleOverlay();
    updateRecordVisibility();
}

function insightValue(item, formatter = fmtPct) {
    if (!item?.record) return '-';
    return `${item.record.ticker} ${formatter(item.value)}`;
}

function insightMetric(label, value, toneClass = 'text-zinc-100') {
    return `<div class="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase leading-none text-zinc-500">${escapeHtml(label)}</div>
        <div class="mt-1 truncate text-xs font-semibold ${toneClass}">${escapeHtml(value)}</div>
    </div>`;
}

function marketCloseLabel(dataset) {
    return dataset?.records?.length ? '16:00 ET' : '-';
}

function selectedLowMarkersHtml(record) {
    const specs = flatLowMarkerSpecs(record);
    if (!state.flatLowActive || specs.length <= 1) return '';
    const pills = specs.map(spec => {
        const point = spec.point;
        const clock = Number.isFinite(point?.sessionMinute)
            ? (spec.id === 'regular' ? formatClockFromMinute(point.sessionMinute) : formatSessionMoment(point.sessionMinute))
            : (point?.time || '-');
        const pct = Number.isFinite(point?.pctLow) ? fmtPct(point.pctLow) : '-';
        return `<span class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold" style="border-color:${escapeHtml(spec.border)};color:${escapeHtml(spec.text)};background:rgba(9,9,11,0.58)">
            <span>${escapeHtml(spec.shortLabel)}</span>
            <span class="text-zinc-400">${escapeHtml(clock)}</span>
            <span>${escapeHtml(pct)}</span>
        </span>`;
    }).join('');
    return `<div class="mt-2 flex flex-wrap gap-1 text-[10px]">
        ${pills}
    </div>`;
}

function updateInsightPanels(dataset) {
    const panel = byId('three-map-insights');
    const mobile = byId('three-map-mobile-insights');
    const scale = byId('three-map-scale');
    if (scale) {
        scale.innerHTML = state.view === 'entry'
            ? entryLegendHtml()
            : (state.flatLowActive ? flatLowLegendHtml(dataset) : pathLegendHtml(dataset));
    }
    if (!dataset?.records?.length || !dataset.insights) {
        if (panel) panel.innerHTML = '';
        if (mobile) mobile.innerHTML = '';
        applyQuickReadVisibility();
        return;
    }
    if (state.view === 'entry') {
        if (mobile) mobile.innerHTML = entryMobileMetrics(dataset);
        if (panel) panel.innerHTML = entryInsightPanel(dataset);
        applyQuickReadVisibility();
        return;
    }
    const { insights } = dataset;
    const total = (dataset.allRecords || dataset.records).length;
    const gainPct = total ? Math.round((insights.winners / total) * 100) : 0;
    const latePct = total ? Math.round((insights.lateLows / total) * 100) : 0;
    const deepPct = total ? Math.round((insights.belowMinus10 / total) * 100) : 0;
    const bestEntry = dataset.entryScenarios?.best;
    const medianLowText = dataset.medianLabel ? dataset.medianLabel.replace(/^Median low\s+/i, '') : (Number.isFinite(dataset.medianMinutes) ? formatElapsed(dataset.medianMinutes) : '-');
    const quickMetrics = [
        insightMetric('Median low', medianLowText, 'text-cyan-300'),
        insightMetric('Avg close', fmtPct(insights.avgDayEnd), pctToneClass(insights.avgDayEnd)),
        insightMetric('Green', `${gainPct}%`, 'text-emerald-300'),
        insightMetric('Dips -10%', `${deepPct}%`, 'text-amber-300')
    ];
    if (mobile) {
        mobile.innerHTML = [
            quickMetrics[0],
            insightMetric('Median close', fmtPct(insights.medianDayEnd), pctToneClass(insights.medianDayEnd)),
            quickMetrics[2],
            insightMetric('Low cluster', dataset.lowWindow ? `${dataset.lowWindow.label} ${Math.round(dataset.lowWindow.pct || 0)}%` : '-', 'text-yellow-300')
        ].join('');
    }
    if (!panel) return;
    const bestLine = bestEntry
        ? `<span class="text-emerald-300">${escapeHtml(bestEntry.label)} ${escapeHtml(fmtPct(bestEntry.avgReturn))}</span>`
        : '';
    const lowLine = dataset.lowWindow
        ? `<span class="text-amber-300">${escapeHtml(dataset.lowWindow.label)}</span> ${Math.round(dataset.lowWindow.pct || 0)}%`
        : '';
    panel.innerHTML = `
        <div class="section-header text-blue-400">Quick read</div>
        <div class="mt-2 grid grid-cols-2 gap-1.5">${quickMetrics.join('')}</div>
        <div class="mt-2 space-y-1 text-[11px] leading-4 text-zinc-400">
            ${bestLine ? `<div>Best ${bestLine}</div>` : ''}
            ${lowLine ? `<div>Low cluster ${lowLine}</div>` : ''}
        </div>`;
    applyQuickReadVisibility();
}

function updateSummary(dataset) {
    const panel = byId('three-map-summary-panel');
    const summary = byId('three-map-summary');
    const subtitle = byId('three-map-subtitle');
    if (!summary || !subtitle) return;
    const hidePanel = Boolean(dataset?.records?.length && state.view === 'paths');
    panel?.classList.toggle('hidden', hidePanel);
    if (!dataset || !dataset.records.length) {
        summary.textContent = 'No exact 5-minute charts in this view';
        subtitle.textContent = '3D map unavailable';
        updateInsightPanels(dataset);
        return;
    }
    const winners = dataset.insights?.winners ?? dataset.records.filter(record => record.dayEndPct >= 0).length;
    const medianText = dataset.medianLabel || (Number.isFinite(dataset.medianMinutes) ? `Median low ${formatElapsed(dataset.medianMinutes)}` : 'Median low -');
    const modeLabel = mapModeConfig(state.mode).label;
    const alignment = alignmentMode();
    const sharedClockText = dataset.timeline?.includeExtended && dataset.timeline?.includeSecondDay
        ? ', then use shared after-hours, premarket, and Day 2 clock time'
        : (dataset.timeline?.includeExtended
            ? ', then use shared after-hours and premarket clock time'
            : (dataset.timeline?.includeSecondDay ? ', then use shared Day 2 clock time' : ''));
    if (state.view === 'entry') {
        const best = dataset.entryScenarios?.balanced || dataset.entryScenarios?.best;
        const bestText = best ? `Best balanced entry ${best.label} (${fmtPct(best.avgReturn)} avg)` : 'Entry frontier';
        const lowText = dataset.lowWindow ? `low cluster ${dataset.lowWindow.label}` : medianText;
        summary.textContent = `${dataset.records.length} IPOs | ${bestText} | ${lowText}`;
        subtitle.textContent = `${dataset.label} | ${modeLabel} strategy runway: return, loss containment, and gap to low`;
    } else if (state.flatLowActive) {
        summary.textContent = `${flatLowMarkerCount(dataset)} lows flattened | ${medianText}`;
        subtitle.textContent = alignment === 'close'
            ? `${dataset.label} | ${modeLabel} lows use market-clock time with a countdown to the 16:00 ET close`
            : (alignment === 'openClose'
                ? `${dataset.label} | ${modeLabel} lows stretch each IPO from first print to D1 close${sharedClockText}`
                : (dataset.timeline?.includeShared
                ? `${dataset.label} | ${modeLabel} lows use open-aligned elapsed time${sharedClockText}`
                : `${dataset.label} | ${modeLabel} lows use open-aligned elapsed time from each IPO open`));
    } else {
        summary.textContent = `${dataset.records.length} IPOs | 0% = each first public open | ${winners} ended above first print | ${medianText}`;
        subtitle.textContent = alignment === 'close'
            ? `${dataset.label} | ${modeLabel} paths aligned by market session time, shown as % from each IPO's first opening print`
            : (alignment === 'openClose'
                ? `${dataset.label} | ${modeLabel} paths stretch each IPO from first print to D1 close${sharedClockText}`
                : (dataset.timeline?.includeShared
                ? `${dataset.label} | ${modeLabel} paths aligned by each IPO open${sharedClockText}`
                : `${dataset.label} | ${modeLabel} paths aligned by each IPO open, shown as elapsed time from first print`));
    }
    updateInsightPanels(dataset);
}

function updateCamera() {
    if (!state.camera) return;
    const cosPitch = Math.cos(state.pitch);
    state.camera.position.set(
        state.target.x + state.distance * cosPitch * Math.sin(state.yaw),
        state.target.y + state.distance * Math.sin(state.pitch),
        state.target.z + state.distance * cosPitch * Math.cos(state.yaw)
    );
    state.camera.lookAt(state.target);
}

function setHoveredRecord(record) {
    if (state.hoveredRecord === record) {
        updateSymbolPillState(record);
        updateFlatSelectionArrow();
        return;
    }
    state.pathLines.forEach(line => {
        const active = record && line.userData.record === record;
        line.material.color.copy(active ? new THREE.Color(colors.highlight) : line.userData.originalColor);
        line.material.opacity = active ? 1 : 0.84;
    });
    state.lowMarkers.forEach(marker => {
        const active = record && marker.userData.record === record;
        marker.scale.setScalar(active ? 1.72 : (marker.userData.flatBaseScale || 1));
        if (marker.material?.opacity !== undefined) {
            marker.material.opacity = active ? 1 : 0.95;
        }
    });
    state.lowLabels.forEach(label => {
        const active = record && label.userData.record === record;
        label.scale.setScalar(active ? 1.18 : 1);
        if (label.material?.opacity !== undefined) {
            label.material.opacity = active ? 1 : (label.userData.baseOpacity ?? 0.92);
        }
    });
    state.hoveredRecord = record;
    updateFlatSelectionArrow();
    updateSymbolPillState(record);
    const hover = byId('three-map-hover');
    if (!hover) return;
    if (!record) {
        hover.innerHTML = '<div class="section-header text-zinc-500">Selected IPO</div><div class="mt-1 text-sm text-zinc-400">-</div>';
        return;
    }
    hover.innerHTML = `
        <div class="flex min-w-0 items-baseline gap-2">
            <div class="section-header text-blue-400">${escapeHtml(record.ticker)}</div>
            <div class="truncate text-sm font-semibold text-zinc-100">${escapeHtml(record.name)}</div>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-[11px]">
            <div><span class="block text-zinc-500">Open</span><span class="text-zinc-200 font-semibold">${escapeHtml(fmtUsd(record.basePrice))}</span></div>
            <div><span class="block text-zinc-500">End</span><span class="${record.dayEndPct >= 0 ? 'text-emerald-400' : 'text-orange-400'} font-semibold">${fmtPct(record.dayEndPct)}</span></div>
            <div><span class="block text-zinc-500">Low</span><span class="text-amber-300 font-semibold">${fmtPct(record.lowPct)}</span></div>
            <div><span class="block text-zinc-500">Low time</span><span class="text-zinc-200 font-semibold">${escapeHtml(formatLowTiming(record))}</span></div>
            <div><span class="block text-zinc-500">High</span><span class="text-emerald-300 font-semibold">${escapeHtml(fmtPct(record.highPct))}</span></div>
            <div><span class="block text-zinc-500">Bars</span><span class="text-zinc-200 font-semibold">${record.barsCount}</span></div>
        </div>
        ${selectedLowMarkersHtml(record)}`;
}

function updateHover(event) {
    if (!state.renderer || !state.camera || !state.pickables.length) return;
    const rect = state.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hits = state.raycaster.intersectObjects(state.pickables, false);
    const hitRecord = hits[0]?.object?.userData?.record || null;
    if (hitRecord) setHoveredRecord(hitRecord);
}

function renderFrame(time = 0) {
    if (!state.renderer || !state.scene || !state.camera) return;
    updateTweens(time || performance.now());
    state.lastFrameTime = time || state.lastFrameTime;
    state.renderer.render(state.scene, state.camera);
}

function animate(time) {
    renderFrame(time);
    if (state.open) {
        state.frameId = requestAnimationFrame(animate);
    }
}

function openModal() {
    const modal = byId('three-map-modal');
    if (!modal || !pageApi()) return;
    state.open = true;
    state.view = 'paths';
    state.flatLowActive = false;
    state.flatPinnedTicker = '';
    leaveIsolatedRender();
    state.selectedTicker = '';
    state.interacted = false;
    state.lastFrameTime = 0;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    byId('three-map-close')?.focus();
    buildScene();
    cancelAnimationFrame(state.frameId);
    state.frameId = requestAnimationFrame(animate);
}

function closeModal() {
    const modal = byId('three-map-modal');
    if (!modal) return;
    state.open = false;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    cancelAnimationFrame(state.frameId);
    state.frameId = null;
}

function activateFlattenLow() {
    if (!state.dataset?.records?.length) return;
    leaveIsolatedRender();
    state.view = 'paths';
    state.flatLowActive = true;
    state.flatPinnedTicker = '';
    state.interacted = true;
    buildScene({ animateFlatten: true });
}

function resetView() {
    if (state.isolatedTicker) {
        leaveIsolatedRender();
        setSelectedRecord(null);
        state.interacted = false;
        buildScene({ resetCamera: true });
        return;
    }
    if (state.view !== 'paths' || state.flatLowActive) {
        state.view = 'paths';
        state.flatLowActive = false;
        state.flatPinnedTicker = '';
        state.interacted = false;
        buildScene({ resetCamera: true });
        return;
    }
    if (!state.dataset?.records?.length) return;
    state.interacted = false;
    tweenCameraTo(pathCameraConfig(state.dataset), 520);
}

document.addEventListener('click', event => {
    const openTrigger = event.target.closest?.('[data-three-map-open]');
    if (openTrigger) {
        openModal();
        return;
    }

    const symbolButton = event.target.closest?.('button[data-three-map-symbol]');
    if (symbolButton && !symbolButton.disabled) {
        const ticker = symbolButton.dataset.threeMapSymbol;
        const records = state.dataset?.allRecords || state.dataset?.records || [];
        const record = records.find(item => item.ticker === ticker);
        if (record) {
            state.interacted = true;
            if (state.flatLowActive) {
                const active = state.selectedTicker === ticker || state.flatPinnedTicker === ticker;
                if (active) {
                    state.flatPinnedTicker = '';
                    setSelectedRecord(null);
                    renderFrame();
                    return;
                }
                state.isolatedTicker = '';
                state.flatPinnedTicker = ticker;
                setSelectedRecord(record);
                renderFrame();
                return;
            }

            if (state.selectedTicker !== ticker) {
                const wasIsolated = Boolean(state.isolatedTicker);
                if (wasIsolated) {
                    leaveIsolatedRender();
                } else {
                    state.isolatedTicker = '';
                }
                setSelectedRecord(record);
                if (wasIsolated) {
                    buildScene();
                    return;
                }
            } else if (state.isolatedTicker !== ticker) {
                enterIsolatedRender(ticker);
                buildScene();
                return;
            } else {
                leaveIsolatedRender();
                setSelectedRecord(null);
                buildScene();
                return;
            }
            renderFrame();
        }
        return;
    }

    const viewButton = event.target.closest?.('button[data-three-map-view]');
    if (viewButton && !viewButton.disabled) {
        const nextView = viewButton.dataset.threeMapView;
        if (nextView === 'entry' || nextView === 'paths') {
            if (nextView !== 'paths') leaveIsolatedRender();
            state.view = nextView;
            if (nextView !== 'paths') state.flatLowActive = false;
            state.interacted = false;
            buildScene();
            return;
        }
    }

    const flatAlignButton = event.target.closest?.('button[data-three-map-flat-align]');
    if (flatAlignButton && !flatAlignButton.disabled) {
        const nextAlignment = flatAlignButton.dataset.threeMapFlatAlign;
        if (nextAlignment === 'open' || nextAlignment === 'openClose' || nextAlignment === 'close') {
            if (state.isolatedTicker) {
                if (nextAlignment !== 'close') {
                    state.alignmentBeforeIsolation = nextAlignment;
                }
                state.flatLowAlignment = 'close';
                updateModeControls(state.dataset);
                return;
            }
            if (state.flatLowAlignment === nextAlignment) return;
            state.flatLowAlignment = nextAlignment;
            state.interacted = true;
            buildScene({ preserveCamera: state.flatLowActive });
        }
        return;
    }

    const modeButton = event.target.closest?.('button[data-three-map-mode]');
    if (modeButton && !modeButton.disabled) {
        const nextMode = modeButton.dataset.threeMapMode;
        if (nextMode === 'day1' || nextMode === 'extended' || nextMode === 'd1D2' || nextMode === 'd1ExtD2') {
            const preserveCamera = state.flatLowActive;
            state.mode = nextMode;
            state.interacted = preserveCamera;
            buildScene({ preserveCamera });
        }
    }
});

byId('three-map-close')?.addEventListener('click', closeModal);
byId('three-map-flatten-low')?.addEventListener('click', activateFlattenLow);
byId('three-map-reset-view')?.addEventListener('click', resetView);
byId('three-map-symbols-toggle')?.addEventListener('click', () => {
    state.symbolListVisible = !state.symbolListVisible;
    applyInfoPanelVisibility();
});
byId('three-map-insights-toggle')?.addEventListener('click', () => {
    state.quickReadVisible = !state.quickReadVisible;
    applyInfoPanelVisibility();
});
byId('three-map-scale-toggle')?.addEventListener('click', () => {
    state.scalePanelVisible = !state.scalePanelVisible;
    applyInfoPanelVisibility();
});
byId('three-map-selected-toggle')?.addEventListener('click', () => {
    state.selectedPanelVisible = !state.selectedPanelVisible;
    applyInfoPanelVisibility();
});
byId('three-map-modal')?.addEventListener('click', event => {
    if (event.target.id === 'three-map-modal') closeModal();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.open) closeModal();
});
