'use strict';

const fmt = d3.format('.2f');
const scenariosAll = ["SSP1-2.6", "SSP2-4.5", "SSP3-7.0", "SSP5-8.5"];
let activeScenarios = new Set(scenariosAll);
let activeMetric = 'tas';

const tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);
function showTip(html, x, y) { tooltip.html(html).style('left', (x + 16) + 'px').style('top', (y + 16) + 'px').transition().duration(120).style('opacity', 1); }
function hideTip() { tooltip.transition().duration(150).style('opacity', 0); }

const color = d3.scaleOrdinal().domain(scenariosAll).range(["#74a7ff","#7ef0c5","#ffd166","#ff7b7b"]);
let brushExtentYears = null;

const PATHS = {
  timeseries: 'data/global_timeseries.csv',
  latecentury: 'data/region_precip_change.csv',
  coverage: 'data/coverage.csv'
};

Promise.all([
  d3.csv(PATHS.timeseries, d3.autoType),
  d3.csv(PATHS.latecentury, d3.autoType),
  d3.csv(PATHS.coverage, d3.autoType)
]).then(([ts, late, cov]) => {
  ts.forEach(d => d.scenario = String(d.scenario));
  late.forEach(d => d.scenario = String(d.scenario));
  cov.forEach(d => { d.scenario = String(d.scenario); d.variable = String(d.variable); });

  buildTimeseries(ts);
  buildLateCentury(late);
  buildCoverage(cov);
  wireControls(ts, late, cov);
}).catch(err => console.error('Data load error:', err));

function wireControls(ts, late, cov) {
  d3.selectAll('#scenario-pills .pill').on('click', function() {
    const scn = this.dataset.scn;
    if (activeScenarios.has(scn)) { activeScenarios.delete(scn); d3.select(this).classed('active', false); }
    else { activeScenarios.add(scn); d3.select(this).classed('active', true); }
    updateTimeseries(ts);
    buildLateCentury(late);
  });
  d3.selectAll('input[name="metric"]').on('change', (e) => { activeMetric = e.target.value; updateTimeseries(ts); });
}

let tsState = { svg: null, x: null, y: null, line: null, width: 0, height: 0 };
function buildTimeseries(data) {
  const container = d3.select('#timeseries');
  container.selectAll('*').remove();
  const margin = { top: 20, right: 20, bottom: 40, left: 56 };
  const width = container.node().clientWidth - margin.left - margin.right;
  const height = container.node().clientHeight - margin.top - margin.bottom;

  const svg = container.append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain(d3.extent(data, d => +d.year)).range([0, width]);
  const y = d3.scaleLinear().domain([d3.min(data, d => d[activeMetric]), d3.max(data, d => d[activeMetric])]).nice().range([height, 0]);

  const xAxis = d3.axisBottom(x).tickFormat(d3.format('d'));
  const yAxis = d3.axisLeft(y).ticks(6);

  g.append('g').attr('class', 'gridline').call(d3.axisLeft(y).tickSize(-width).tickFormat(''));
  g.append('g').attr('class', 'axis x').attr('transform', `translate(0,${height})`).call(xAxis);
  g.append('g').attr('class', 'axis y').call(yAxis);
  g.append('text').attr('x', -40).attr('y', -8).attr('fill', '#a7b2c3').text(activeMetric === 'tas' ? 'Δ Temp (°C)' : 'Δ Precip (%)');

  const line = d3.line().defined(d => Number.isFinite(d[activeMetric])).x(d => x(+d.year)).y(d => y(d[activeMetric]));
  const grouped = d3.group(data.filter(d => activeScenarios.has(d.scenario)), d => d.scenario);
  for (const [scn, arr] of grouped) {
    g.append('path').datum(arr.sort((a,b)=>a.year-b.year)).attr('fill', 'none').attr('stroke', color(scn)).attr('stroke-width', 2).attr('d', line)
      .on('mousemove', (ev) => showTip(`<b>${scn}</b>`, ev.clientX, ev.clientY))
      .on('mouseleave', hideTip);
  }
  const legend = g.append('g').attr('class', 'legend').attr('transform', `translate(${width-120},0)`);
  Array.from(grouped.keys()).forEach((scn, i) => {
    const gL = legend.append('g').attr('transform', `translate(0, ${i*18})`);
    gL.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(scn));
    gL.append('text').attr('x', 18).attr('y', 10).attr('fill', '#dbe7ff').text(scn);
  });

  const gBrush = g.append('g');
  const brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', ({selection}) => {
    if (!selection) { brushExtentYears = null; return; }
    const [x0, x1] = selection.map(x.invert);
    brushExtentYears = [Math.round(x0), Math.round(x1)];
  });
  gBrush.call(brush);

  tsState = { svg, x, y, line, width, height };
}

function updateTimeseries(data) {
  const { svg, x, height } = tsState; if (!svg) return buildTimeseries(data);
  const g = svg.select('g');
  const y = d3.scaleLinear().domain([d3.min(data, d => d[activeMetric]), d3.max(data, d => d[activeMetric])]).nice().range([height, 0]);
  g.select('.axis.y').transition().duration(350).call(d3.axisLeft(y).ticks(6));
  g.select('text').text(activeMetric === 'tas' ? 'Δ Temp (°C)' : 'Δ Precip (%)');
  const line = d3.line().defined(d => Number.isFinite(d[activeMetric])).x(d => x(+d.year)).y(d => y(d[activeMetric]));
  const grouped = d3.group(data.filter(d => activeScenarios.has(d.scenario)), d => d.scenario);
  g.selectAll('path').remove(); g.selectAll('.legend').remove(); g.selectAll('.gridline').remove(); g.append('g').attr('class', 'gridline').call(d3.axisLeft(y).tickSize(-tsState.width).tickFormat(''));
  for (const [scn, arr] of grouped) {
    g.append('path').datum(arr.sort((a,b)=>a.year-b.year)).attr('fill', 'none').attr('stroke', color(scn)).attr('stroke-width', 2).attr('d', line)
      .on('mousemove', (ev) => showTip(`<b>${scn}</b>`, ev.clientX, ev.clientY))
      .on('mouseleave', hideTip);
  }
  const legend = g.append('g').attr('class', 'legend').attr('transform', `translate(${tsState.width-120},0)`);
  Array.from(grouped.keys()).forEach((scn, i) => {
    const gL = legend.append('g').attr('transform', `translate(0, ${i*18})`);
    gL.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(scn));
    gL.append('text').attr('x', 18).attr('y', 10).attr('fill', '#dbe7ff').text(scn);
  });
}

let lcState = { svg: null };
function buildLateCentury(data) {
  const container = d3.select('#latecentury'); container.selectAll('*').remove();
  const margin = { top: 20, right: 10, bottom: 44, left: 80 };
  const width = container.node().clientWidth - margin.left - margin.right;
  const height = container.node().clientHeight - margin.top - margin.bottom;
  const svg = container.append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const filtered = data.filter(d => activeScenarios.has(d.scenario));
  const regions = Array.from(new Set(filtered.map(d => d.region)));
  const x = d3.scaleLinear().domain([d3.min(filtered, d => d.change_pct), d3.max(filtered, d => d.change_pct)]).nice().range([0, width]);
  const y = d3.scaleBand().domain(regions).range([0, height]).padding(0.2);

  g.append('g').attr('class', 'axis x').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d + '%'));
  g.append('g').attr('class', 'axis y').call(d3.axisLeft(y));

  const groups = d3.group(filtered, d => d.region);
  for (const [region, arr] of groups) {
    const bandY = y(region);
    const inner = d3.scaleBand().domain(arr.map(d => d.scenario)).range([0, y.bandwidth()]).padding(0.1);
    g.append('g').selectAll('rect').data(arr).join('rect')
      .attr('x', d => x(Math.min(0, d.change_pct)))
      .attr('y', d => bandY + inner(d.scenario))
      .attr('width', d => Math.abs(x(d.change_pct) - x(0)))
      .attr('height', inner.bandwidth())
      .attr('fill', d => color(d.scenario))
      .on('mousemove', (ev, d) => showTip(`<b>${region}</b><br>${d.scenario}<br>ΔPr: ${fmt(d.change_pct)}%`, ev.clientX, ev.clientY))
      .on('mouseleave', hideTip);
  }
  lcState = { svg };
}

function buildCoverage(data) {
  const container = d3.select('#coverage'); container.selectAll('*').remove();
  const margin = { top: 26, right: 10, bottom: 40, left: 100 };
  const width = container.node().clientWidth - margin.left - margin.right;
  const height = container.node().clientHeight - margin.top - margin.bottom;
  const svg = container.append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const variables = Array.from(new Set(data.map(d => d.variable)));
  const scenarios = scenariosAll;
  const x = d3.scaleBand().domain(scenarios).range([0, width]).padding(0.08);
  const y = d3.scaleBand().domain(variables).range([0, height]).padding(0.08);
  const maxVal = d3.max(data, d => +d.models || +d.count || 0) || 1;
  const z = d3.scaleSequential(d3.interpolateTurbo).domain([0, maxVal]);

  g.append('g').attr('class', 'axis x').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
  g.append('g').attr('class', 'axis y').call(d3.axisLeft(y));

  g.selectAll('rect').data(data).join('rect')
    .attr('x', d => x(d.scenario))
    .attr('y', d => y(d.variable))
    .attr('width', x.bandwidth())
    .attr('height', y.bandwidth())
    .attr('fill', d => z(+d.models || +d.count || 0))
    .on('mousemove', (ev, d) => showTip(`<b>${d.variable}</b> × ${d.scenario}<br>Models: ${d.models ?? d.count ?? 'n/a'}`, ev.clientX, ev.clientY))
    .on('mouseleave', hideTip);

  const legendW = 140, legendH = 10;
  const legend = g.append('g').attr('transform', `translate(${width-legendW-10}, -14)`);
  const gradId = 'grad-coverage';
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
  d3.range(0, 101, 5).forEach(p => { grad.append('stop').attr('offset', p + '%').attr('stop-color', d3.interpolateTurbo(p/100)); });
  legend.append('rect').attr('width', legendW).attr('height', legendH).attr('fill', `url(#${gradId})`);
  legend.append('text').attr('x', 0).attr('y', -2).attr('fill', '#a7b2c3').text('Fewer');
  legend.append('text').attr('x', legendW).attr('y', -2).attr('text-anchor', 'end').attr('fill', '#a7b2c3').text('More models');
}

window.addEventListener('resize', () => location.reload());
