const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const helpers = html.slice(html.indexOf('        let buyToleranceBps'), html.indexOf('        function chartSourceLabel'));
const c = { ipoBuySignalMeta: {buyThresholdBps: 100}, ipoBuySignalSeries: {TEST: [
    {time:'2026-05-15 10:06', predictedDownsideBps:80, session:'day1'},
    {time:'2026-05-15 10:15', predictedDownsideBps:120, session:'day1'},
]}, CHART_INTERVAL_MINUTES:5,
splitChartDateTime: time => ({date:time.slice(0,10),time:time.slice(11)}),
timeToMinutes: time => Number(time.slice(0,2))*60+Number(time.slice(3)),
dateOffsetMinutes: (a,b) => (Date.parse(b)-Date.parse(a))/60000 };
vm.createContext(c);vm.runInContext(helpers,c);
const points=[605,610,615,620].map((minute,plot)=>({date:'2026-05-15',minute,plot}));
let result=c.chartBuySignalSeries({ticker:'TEST',date:'2026-05-15'},points);
assert.deepEqual(Array.from(result,r=>r.chartMinute),[610,615]); // no future or stale predictions
assert.deepEqual(Array.from(result,r=>r.state),['buy','watch']);
vm.runInContext('buyToleranceBps = 45',c);
assert.equal(c.rawBuySignalSeries({ticker:'TEST'})[0].state,'watch');
vm.runInContext('buyToleranceBps = 150',c);
assert.equal(c.rawBuySignalSeries({ticker:'TEST'})[1].state,'buy');
assert.equal(c.buySignalStateForEstimate(226),'wait');
assert.equal(c.chartBuySignalSeries({ticker:'TEST',date:'2026-05-15'},[{date:'2026-05-16',minute:610,plot:0}]).length,0);
const artifact={window:{}};vm.runInNewContext(fs.readFileSync('ipo-buy-signals.js','utf8'),artifact);
const {ipoBuySignalMeta:meta,ipoBuySignalSeries:series,ipoBuySignals:pins}=artifact.window;
assert.equal(meta.forcedEntries,false);
for(const fold of meta.folds) assert.ok(fold.trainingLastDate<fold.testStartDate);
for(const ticker of meta.warmupSymbols) assert.equal(series[ticker],undefined);
let buys=0;
for(const rows of Object.values(series)) for(const row of rows) {
    assert.ok(Number.isFinite(row.predictedDownsideBps));
    assert.equal(Number(row.time.slice(-2))%5,0);
    assert.equal(row.state,row.predictedDownsideBps<=100?'buy':row.predictedDownsideBps<=150?'watch':'wait');
    if(row.state==='buy') buys++;
}
for(const [ticker,rows] of Object.entries(pins)) for(const row of rows) {
    assert.equal(row.rule,'buy');assert.equal(row.confidence,undefined);
    assert.ok(series[ticker].some(s=>s.time===row.time && s.state==='buy'));
}
assert.ok(buys>0);
console.log(`Buy-signal regression checks passed: ${buys} Buy states, chronological folds, causal chart alignment, tolerance controls and pins.`);
