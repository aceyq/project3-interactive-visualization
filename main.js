'use strict';

// ------------------------------------
// SETUP
// ------------------------------------
const width = 850;
const height = 420;
const margin = { top: 40, right: 40, bottom: 60, left: 70 };

const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

const color = d3.scaleOrdinal()
  .domain(["ssp126", "ssp245", "ssp370", "ssp585"])
  .range(["#47a7ff", "#7ef0c5", "#ffd166", "#ff7b7b"]);

let activeMetric = 'tas'; // 'tas' = temperature, 'pr' = precipitation

// Map button labels (HTML) → dataset scenario names
const scenarioMap = {
  "SSP1-2.6": "ssp126",
  "SSP2-4.5": "ssp245",
  "SSP3-7.0": "ssp370",
  "SSP5-8.5": "ssp585"
};

// ------------------------------------
// SVG & GROUPS
// ------------------------------------
const svg = d3.select("#timeseries")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const chart = svg.append("g")
  .attr("transform", `translate(${margin.left}, ${margin.top})`);

// Separate groups so we can re-draw content without nuking the brush
const gAxes = chart.append("g").attr("class", "axes");
const gLines = chart.append("g").attr("class", "lines");
const gPoints = chart.append("g").attr("class", "points");
const gBrush = chart.append("g").attr("class", "brush-layer");

// Scales
const xScale = d3.scaleTime().range([0, innerWidth]);
const yScale = d3.scaleLinear().range([innerHeight - 30, 0]); // leave a little space for brush

const line = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.value));

// Tooltip selection
const tooltip = d3.select("#tooltip");

// We'll keep this around so brush + reset can use it
let currentFullDomain = null;

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

  // Parse time to Date if not already
  temp.forEach(d => { d.time = new Date(d.time); });
  precip.forEach(d => { d.time = new Date(d.time); });

  // Group by scenario (lowercase)
  const datasets = {
    tas: d3.groups(temp, d => d.scenario.toLowerCase()),
    pr: d3.groups(precip, d => d.scenario.toLowerCase())
  };

  // Initial draw
  updateChart(datasets[activeMetric]);

  // ------------------------------------
  // INTERACTIVITY: metric toggle
  // ------------------------------------
  d3.selectAll("input[name='metric']").on("change", e => {
    const val = e.target.value;   // "tas" or "pr"
    activeMetric = val;
    updateChart(datasets[activeMetric]);
  });

  // ------------------------------------
  // INTERACTIVITY: scenario pills
  // ------------------------------------
  d3.selectAll(".pill").on("click", function () {
    const btn = d3.select(this);
    btn.classed("active", !btn.classed("active"));
    updateChart(datasets[activeMetric]);
  });

  // Optional: double-click anywhere on svg to reset full x domain
  svg.on("dblclick", () => {
    if (!currentFullDomain) return;
    xScale.domain(currentFullDomain);
    redraw(datasets[activeMetric]);
  });

  // ------------------------------------
  // UPDATE FUNCTION
  // ------------------------------------
  function updateChart(groups) {
    const activeButtons = d3.selectAll(".pill.active")
      .nodes()
      .map(d => scenarioMap[d.getAttribute("data-scn")]); // map "SSP1-2.6" → "ssp126"

    const filtered = groups.filter(([scn]) => activeButtons.includes(scn));

    // Flatten all points for scale domains
    const allPoints = filtered.flatMap(([_, arr]) =>
      arr.map(d => ({
        time: d.time,
        value: activeMetric === "tas" ? d.tas_C : d.pr_day
      }))
    );

    // Clear groups
    gAxes.selectAll("*").remove();
    gLines.selectAll("*").remove();
    gPoints.selectAll("*").remove();
    gBrush.selectAll("*").remove();

    // Handle empty selection
    if (allPoints.length === 0) {
      gAxes.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#aaa")
        .text("No scenarios selected");
      return;
    }

    // Set scales
    const xDomain = d3.extent(allPoints, d => d.time);
    currentFullDomain = xDomain; // save for reset
    xScale.domain(xDomain);

    const yDomain = d3.extent(allPoints, d => d.value);
    yScale.domain(yDomain).nice();

    // Draw everything once with full domain
    redraw(filtered);

    // -------------------------------
    // BRUSH: for zooming into years
    // -------------------------------
    const brushHeightStart = innerHeight - 70; // start brush near bottom
    const brush = d3.brushX()
      .extent([[0, brushHeightStart], [innerWidth, innerHeight]])
      .on("end", ({ selection }) => {
        if (!selection) return; // if cleared, keep current domain
        const [x0, x1] = selection.map(xScale.invert);
        xScale.domain([x0, x1]);
        redraw(filtered);
        gBrush.select(".brush").call(brush.move, null); // clear brush
      });

    gBrush.append("g")
      .attr("class", "brush")
      .call(brush);
  }

  // ------------------------------------
  // REDRAW (axes, lines, points, tooltips)
  // ------------------------------------
  function redraw(filteredGroups) {
    // Clear axes/lines/points
    gAxes.selectAll("*").remove();
    gLines.selectAll("*").remove();
    gPoints.selectAll("*").remove();

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat(d3.timeFormat("%Y"));

    const yAxis = d3.axisLeft(yScale).ticks(6);

    gAxes.append("g")
      .attr("transform", `translate(0, ${innerHeight - 30})`)
      .attr("class", "axis x-axis")
      .call(xAxis);

    gAxes.append("g")
      .attr("class", "axis y-axis")
      .call(yAxis);

    // Axis labels
    const yLabel = activeMetric === "tas"
      ? "Temperature Δ (°C, vs 1850–1900)"
      : "Precipitation (mm/day)";

    gAxes.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(innerHeight / 2))
      .attr("y", -50)
      .attr("fill", "#cbd5f5")
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .text(yLabel);

    gAxes.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 5)
      .attr("fill", "#cbd5f5")
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .text("Year");

    // -----------------
    // Lines by scenario
    // -----------------
    gLines.selectAll(".line")
      .data(filteredGroups)
      .join("path")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke-width", 2.5)
      .attr("stroke", d => color(d[0]))
      .attr("d", d => line(
        d[1].map(p => ({
          time: p.time,
          value: activeMetric === "tas" ? p.tas_C : p.pr_day
        }))
      ));

    // Scenario labels at line ends
    gLines.selectAll(".label")
      .data(filteredGroups)
      .join("text")
      .attr("class", "label")
      .attr("x", d => xScale(d3.max(d[1], dd => dd.time)) + 5)
      .attr("y", d => {
        const last = d[1][d[1].length - 1];
        const v = activeMetric === "tas" ? last.tas_C : last.pr_day;
        return yScale(v);
      })
      .text(d => d[0].toUpperCase())
      .attr("alignment-baseline", "middle")
      .style("fill", d => color(d[0]))
      .style("font-size", "0.85rem");

    // -----------------
    // Points + Tooltips
    // -----------------
    const flattenedPoints = filteredGroups.flatMap(([scn, arr]) =>
      arr.map(d => ({
        ...d,
        scenario: scn,
        value: activeMetric === "tas" ? d.tas_C : d.pr_day
      }))
    );

    gPoints.selectAll(".point")
      .data(flattenedPoints)
      .join("circle")
      .attr("class", "point")
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(d.value))
      .attr("r", 3)
      .attr("fill", d => color(d.scenario))
      .attr("stroke", "#020617")
      .on("mouseenter", (event, d) => {
        const dateStr = d3.timeFormat("%Y")(d.time);
        let metricLabel, metricValue;

        if (activeMetric === "tas") {
          metricLabel = "Temperature Δ";
          metricValue = `${d.tas_C.toFixed(2)} °C`;
        } else {
          metricLabel = "Precipitation";
          metricValue = `${d.pr_day.toFixed(2)} mm/day`;
        }

        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.scenario.toUpperCase()}</strong><br/>
            Year: ${dateStr}<br/>
            ${metricLabel}: <strong>${metricValue}</strong>
          `)
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
      });
  }
}).catch(err => console.error("Data load error:", err));
