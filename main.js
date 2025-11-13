'use strict';

// ------------------------------------
// SETUP
// ------------------------------------
const width = 850;
const height = 420;
const margin = { top: 40, right: 40, bottom: 50, left: 70 };

const color = d3.scaleOrdinal()
  .domain(["ssp126", "ssp245", "ssp370", "ssp585"])
  .range(["#47a7ff", "#7ef0c5", "#ffd166", "#ff7b7b"]);

let activeMetric = 'tas'; // 'tas' = temperature, 'pr' = precipitation

// ------------------------------------
// SVG
// ------------------------------------
const svg = d3.select("#timeseries")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const chart = svg.append("g")
  .attr("transform", `translate(${margin.left}, ${margin.top})`);

const xScale = d3.scaleTime().range([0, width - margin.left - margin.right]);
const yScale = d3.scaleLinear().range([height - margin.top - margin.bottom, 0]);

const line = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.value));

// Map button labels (HTML) → dataset scenario names
const scenarioMap = {
  "SSP1-2.6": "ssp126",
  "SSP2-4.5": "ssp245",
  "SSP3-7.0": "ssp370",
  "SSP5-8.5": "ssp585"
};

// ------------------------------------
// LOAD DATA
// ------------------------------------
Promise.all([
  d3.csv("data/temp_df.csv", d3.autoType),
  d3.csv("data/precip_df.csv", d3.autoType)
]).then(([tempData, precipData]) => {
  // Filter to global rows
  const temp = tempData.filter(d => d.region === "Global");
  const precip = precipData.filter(d => d.region === "Global");

  // Parse time to Date
  temp.forEach(d => d.time = new Date(d.time));
  precip.forEach(d => d.time = new Date(d.time));

  // Group by scenario
  const datasets = {
    tas: d3.groups(temp, d => d.scenario.toLowerCase()),
    pr: d3.groups(precip, d => d.scenario.toLowerCase())
  };

  // Draw initial chart
  updateChart(datasets[activeMetric]);

  // ------------------------------------
  // INTERACTIVITY
  // ------------------------------------
  d3.selectAll("input[name='metric']").on("change", e => {
    activeMetric = e.target.value;
    updateChart(datasets[activeMetric]);
  });

  d3.selectAll(".pill").on("click", function() {
    const btn = d3.select(this);
    btn.classed("active", !btn.classed("active"));
    updateChart(datasets[activeMetric]);
  });

  // ------------------------------------
  // UPDATE FUNCTION
  // ------------------------------------
  function updateChart(groups) {
    const activeButtons = d3.selectAll(".pill.active")
      .nodes()
      .map(d => scenarioMap[d.getAttribute("data-scn")]); // map SSP→ssp

    const filtered = groups.filter(([scn]) => activeButtons.includes(scn));

    const allPoints = filtered.flatMap(([_, arr]) =>
      arr.map(d => ({
        time: d.time,
        value: activeMetric === "tas" ? d.tas_C : d.pr_day
      }))
    );

    // Handle empty case
    chart.selectAll("*").remove();
    if (allPoints.length === 0) {
      chart.append("text")
        .attr("x", (width - margin.left - margin.right) / 2)
        .attr("y", (height - margin.top - margin.bottom) / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#aaa")
        .text("No scenarios selected");
      return;
    }

    // Update scales
    xScale.domain(d3.extent(allPoints, d => d.time));
    yScale.domain(d3.extent(allPoints, d => d.value)).nice();

    // Axes
    chart.append("g")
      .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat("%Y")));

    chart.append("g").call(d3.axisLeft(yScale));

    // Lines
    chart.selectAll(".line")
      .data(filtered)
      .join("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke-width", 2.5)
      .attr("stroke", d => color(d[0]))
      .attr("d", d => line(d[1].map(p => ({
        time: p.time,
        value: activeMetric === "tas" ? p.tas_C : p.pr_day
      }))));

    // Labels
    chart.selectAll(".label")
      .data(filtered)
      .join("text")
      .attr("class", "label")
      .attr("x", d => xScale(d3.max(d[1], dd => dd.time)) + 5)
      .attr("y", d => yScale(d[1][d[1].length - 1][activeMetric === "tas" ? "tas_C" : "pr_day"]))
      .text(d => d[0].toUpperCase())
      .attr("alignment-baseline", "middle")
      .style("fill", d => color(d[0]))
      .style("font-size", "0.85rem");
  }
}).catch(err => console.error("Data load error:", err));
