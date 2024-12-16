// References:
// Checkbox list logic:
// https://www.sitelint.com/blog/how-to-implement-multiple-selection-with-check-boxes-in-an-html-without-external-libraries
// Treemap logic:
// https://dev.to/hajarnasr/treemaps-with-d3-js-55p7
// Legend logic: 
// https://d3-graph-gallery.com/graph/custom_legend.html
// Tooltip logic: (event logic adjusted to updated d3)
// https://stackoverflow.com/questions/64851125/add-mouse-hover-containing-specific-data-to-d3-js-tree-map
// -----------------------------------------------------

// ---Goal: ---
// Pull & analyze subsectors for various years of recent electricity generation data for the US
// with EIA API + pre-processed NREL capacity data + fast loading times and good interactivity/data cross-processing due to D3

// ---Assumptions: ---
// - Any year of the US-wide electricity generation will also exist in its states (misprocessed subparts
// will default to zero, which is correct behavior for ones truly 0 or null; but this will need to be 
// error-checked if suspected to be erroring)
// - The units will remain consistent (this can be checked by inspecting the units field of the
// response if something seems off)
// - There are no significant electricity subsets other than those listed (if this changes, this is easy to 
// change by following where all of these are referenced and adding in another variable and its processing 
// everywhere that they are, like the map, for the relevant emerging technology)
// - Wind, solar, geothermal will remain non-controversial in terms of being defined clean (if this changes, add the
// controversial tag to them in the html document & possibly rearrange color mapping to be gradient again)
// - Acronyms/ids used to access API will stay the same (tweak the id in the code if it is changed)
// - User input ability starts out locked
// - Capacities will be manually updated to latest uploaded sheets, as they don't have an API to pull via
// (capacities are pre-processed from NREL using Python Pandas to total state values inc. capacity & capacity factor, 
// rename Rhode Island, and convert MW -> GWh for consistency)

// ---These should be changed to someone else's EIA API key & directory root (for local files) once I'm not involved with the project: ---
// (key obtainable on EIA site):
let eiaKey = ""; // NOTE: key redacted for Github posting
let directoryRoot = ""; // if this is blank, doesn't seem to trigger CORS due to same origin: 
// if using full root name, may need to update server CORS policy to allow

// ---These are the variables (year & file names) that need changing whenever the capacity sheets are updated:
let capacityYear = "2021, 2023"; // years the capacities are pulled from, for display
let solarOpenName = "solar_open_capacity_2023_NREL_condensed";
let solarReferenceName = "solar_reference_capacity_2023_NREL_condensed";
let solarLimitedName = "solar_limited_capacity_2023_NREL_condensed";
let windOpenName = "wind_open_capacity_2023_NREL_condensed";
let windReferenceName = "wind_reference_capacity_2023_NREL_condensed";
let windLimitedName = "wind_limited_capacity_2023_NREL_condensed";

let offshoreWindName = "offshore_wind_capacity_2021_NREL_condensed";

// -----------------------------------------------------
// ---Helper Objects: ---
// -----------------------------------------------------

// To store subsets of our electricity generation data in separate objects
// Its own mapping key is stored inside again since the object needs to be independently functional (like for treemap display)
// (They need to be kept separate for user to be able to adjust what they define to be clean energy without us needing to refetch)
// null for any generation means not present in EIA data (assumed 0)
class ElecGenSubset {
  key;
  ids;
  generationState; //GWh
  generationUS; //GWh

  constructor(key, ids, generationState, generationUS) {
    this.key = key;
    this.ids = ids;
    this.generationState = generationState;
    this.generationUS = generationUS;
  }
}

// To store capacities for each state
// The mapping key (state id) is stored inside for self-completeness
// null for any capacity means not present in NREL data (displayed as not present)
class CapacityState {
  state;
  capacitiesMap; // maps open, reference, and limited to their wind & solar pieces, to use the keys from the HTML dropdown
  // all capacities in GWh to make easy elec gen calculations

  constructor(state, solarOpen, solarReference, solarLimited, windOpen, windReference, windLimited) {
    this.state = state;

    this.capacitiesMap = new Map();
    this.capacitiesMap.set("open", {"solar": solarOpen, "wind": windOpen});
    this.capacitiesMap.set("reference", {"solar": solarReference, "wind": windReference});
    this.capacitiesMap.set("limited", {"solar": solarLimited, "wind": windLimited});
  }

  // for the US CapacityState only, this map also contains an offshore wind section inside the categories
  // (as that is the only spot it is given to us in the data)
  addOffshore(offshoreWindOpen, offshoreWindReference, offshoreWindLimited) {
    this.capacitiesMap.get("open")["offshoreWind"] = offshoreWindOpen;
    this.capacitiesMap.get("reference")["offshoreWind"] = offshoreWindReference;
    this.capacitiesMap.get("limited")["offshoreWind"] = offshoreWindLimited;
  }
}

// -----------------------------------------------------
// ---Inner Variables: ---
// -----------------------------------------------------

// Selected state or entire US, default to US (used to initialize some US-wide data at start) and changed by user with dropdown menu
let state = "US";

// Year of data 
// Initialized to latest year, changed by user with dropdown
let year = null;

// All below electricity generation is stored in GWh, as given initially by EIA dataset

// Electricity generation total & subsets (to be pulled from data per state & US)
let allElecGenState = null;
let allElecGenUS = null;

// (subset key -> ElecGenSubset object)
let elecGen = new Map();

elecGen.set("windElecGen", new ElecGenSubset("windElecGen", ["WND"], null, null));
elecGen.set("solarsElecGen", new ElecGenSubset("solarsElecGen", ["SUN"], null, null)); // PV & thermal
elecGen.set("geothermElecGen", new ElecGenSubset("geothermElecGen", ["GEO"], null, null));
elecGen.set("nuclearElecGen", new ElecGenSubset("nuclearElecGen", ["NUC"], null, null));
elecGen.set("hydroElecGen", new ElecGenSubset("hydroElecGen", ["HYC", "HPS"], null, null)); // Conventional and pumped storage
elecGen.set("bmassElecGen", new ElecGenSubset("bmassElecGen", ["BIO"], null, null));

elecGen.set("coalElecGen", new ElecGenSubset("coalElecGen", ["COW"], null, null));
elecGen.set("natgasElecGen", new ElecGenSubset("natgasElecGen", ["NG"], null, null));
elecGen.set("otherElecGen", new ElecGenSubset("otherElecGen", ["PEL", "PC", "OOG", "OTH"], null, null));

// Electricity import/export data state & US (positive is imports, negative is exports, null is no data for this year)
// US deals only with out-of-country import/export; state includes both out of country and interstate, summed
let importElecState = null;
let importElecUS = null;

// Solar & wind electricity capacities data
// (state id -> CapacityState object)
let elecCapacityUS = null;
let elecCapacities = new Map();

// State name to ID mapping (for HTML dropdown & for state capacity generation)
let stateNameToID = new Map();

// -----------------------------------------------------
// ---Display Variables: ---
// -----------------------------------------------------

// Mapping inner variable keys to display names (can't just use the names as keys, some of them have spaces, odd structuring, etc)
let elecGenNames = new Map();

elecGenNames.set("windElecGen", "wind");
elecGenNames.set("solarsElecGen", "solar (PV & thermal)");
elecGenNames.set("geothermElecGen", "geothermal");
elecGenNames.set("nuclearElecGen", "nuclear");
elecGenNames.set("hydroElecGen", "hydroelectric (conventional & pumped storage)");
elecGenNames.set("bmassElecGen", "biomass");

elecGenNames.set("coalElecGen", "coal");
elecGenNames.set("natgasElecGen", "natural gas");
elecGenNames.set("otherElecGen", "other");

// Whether to display electricity generation in GW or GWh (one is more intuitive to renewable energy formats, the other to
// consumable energy formats; adjusted with user's selection)
let GWhorGW = "GWh";

// Which type of capacity to display (starts open, out of the three types in NREL; adjusted with user's selections)
let capacityRestrictions = "limited";

// Which subparts to consider clean in calculation & display (starts out as listed, adjusted with user's checkbox click/unclick)
let elecGenIsClean = new Set(["windElecGen", "solarsElecGen", "geothermElecGen", "nuclearElecGen", "hydroElecGen", "bmassElecGen"]);

// Total clean in accordance to above subparts, to avoid constant recalculation (updated when the subparts or sortings are)
let cleanElecGenState = null;
let cleanElecGenUS = null;

// Can't make a permanent color scale sleekly by using the map keys iterator, so need to have these in an array.
// Want the amount of lightness to stay the same when a subset switches from the clean to nclean (green to brown) side or vice versa, so 
// new scale can't be made dynamically each time either.
let subsetsArr = ["windElecGen", "solarsElecGen", "geothermElecGen", "nuclearElecGen", "hydroElecGen", "bmassElecGen", "coalElecGen", "natgasElecGen", "otherElecGen"];

// Greens
let cleanColorScale = d3.scaleOrdinal().domain(subsetsArr).range(["rgb(230, 260, 240)", "rgb(210, 240, 220)", "rgb(190, 220, 200)", "rgb(170, 200, 180)",
                                                                 "rgb(150, 180, 160)", "rgb(130, 160, 140)", "rgb(110, 140, 120)", "rgb(90, 120, 100)",
                                                                 "rgb(70, 100, 80)"]);
// Browns
let ncleanColorScale = d3.scaleOrdinal().domain(subsetsArr).range(["rgb(200, 195, 190)", "rgb(180, 175, 170)", "rgb(160, 155, 150)", "rgb(140, 135, 130)",
                                                                  "rgb(120, 115, 110)", "rgb(100, 95, 90)", "rgb(80, 75, 70)", "rgb(60, 55, 50)",
                                                                  "rgb(40, 35, 30)"]);

// To add commas to delimit 000 in numbers
let formatCommas = d3.format(",");

// -----------------------------------------------------
// ---HTML Element Adjustments: ---
// -----------------------------------------------------

// Elements start out locked & are unlocked after initialization (relocked with each data fetch)

d3.select("#state-select-drop")
  .on("change", updateState);

d3.select("#year-select-drop")
  .on("change", updateYear);

d3.select("#GWh-or-GW-drop")
  .on("change", updateGWhorGW);

d3.select("#capacity-restrictions-drop")
  .on("change", updateCapacityRestrictions);

d3.select("#select-clean-elec")
  .selectAll("input")
  .on("change", updateElecGenIsClean);

// -----------------------------------------------------
// ---On-Change Functions: ---
// -----------------------------------------------------

// Called on user change of state selection, changes state variable then 
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateState() {
  state = d3.select("#state-select-drop").property("value");

  disableUserInput();

  await pullStoreStateData();

  printUSData();
  printStateData();
  visualizeStateData();
  
  enableUserInput();
}

// Called on user change of year selection, changes year variable then
// locks user input, updates inner data & its text & vis output, unlocks user input
async function updateYear() {
  year = parseInt(d3.select("#year-select-drop").property("value"));

  disableUserInput();

  await pullStoreStateData();
  if(state != "US") {
    await pullStoreUSData();
  } else {
    copyStateToUSData();
  }

  printYear();
  printUSData();
  printStateData();
  visualizeStateData();
  
  enableUserInput();
}

// Called on user change of GW vs GWh display selection, changes GWhorGW and updates text output
function updateGWhorGW() {
  GWhorGW = d3.select("#GWh-or-GW-drop").property("value");

  printUSData();
  printStateData();
}

// Called on user change of capacity restrictions display selection, changes capacityRestrictions and updates text output
function updateCapacityRestrictions() {
  capacityRestrictions = d3.select("#capacity-restrictions-drop").property("value");

  printUSData();
  printStateData();
}

// Called on user change of set of electricity generation subsets considered to be clean, changes
// elecGenIsClean and updates text & vis output
function updateElecGenIsClean() {
  // "this" being the sub-element of the list (one of the checkboxes) that the function was called on change of
  currSubsetElem = d3.select(this);
  if(currSubsetElem.property("checked")) {
    elecGenIsClean.add(currSubsetElem.property("value"));
  } else {
    elecGenIsClean.delete(currSubsetElem.property("value"));
  }

  // Get clean generation data according to current display vars
  cleanElecGenState = 0;
  cleanElecGenUS = 0;
  elecGenIsClean.forEach(e => {
    cleanElecGenState += elecGen.get(e).generationState;
    cleanElecGenUS += elecGen.get(e).generationUS;
  });

  printUSData();
  printStateData();
  visualizeStateData();
}

// -----------------------------------------------------
// ---Main Functions: ---
// -----------------------------------------------------

// Sets up year dropdown + state-specific and US-wide variables & text through initial data pull & unlocks the user input
// NOTE: assumes user input is locked in the process
async function initialize() {
  // Pull everything for US to initialize
  initializeStateNameToID();
  initializeStateSelect();
  await initializeYears();
  await initializeCapacities();

  await pullStoreStateData();
  copyStateToUSData();

  // Print
  printYear();
  printCapacityYear();
  printUSData();
  printStateData();
  visualizeStateData();
 
  enableUserInput();
}

// Generate user input dropdown for state selection based on our state name -> state ID mapping
function initializeStateSelect() {
  let stateSelectDrop = d3.select("#state-select-drop");
  
  let stateNames = [];
  stateNames.push("Entire US");
  let stateNamesIterator = stateNameToID.keys();
  for(let currStateNameI = stateNamesIterator.next(); !currStateNameI.done; currStateNameI = stateNamesIterator.next()) {
    let currStateName = currStateNameI.value;
    stateNames.push(currStateName);
  }

  stateSelectDrop.selectAll("option")
  .data(stateNames)
  .join("option")
  .property("value", (d) => {
    if(d == "Entire US") {
      return "US";
    } else {
      return stateNameToID.get(d);
    }
  })
  .text(d=>d);
}

// Acquire info about all years available in electricity generation data & generate user input dropdown based on it
// + set initial year
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function initializeYears() {
  let allElecGenPromiseUSAllYears = pullElecGenPromiseUSAllYears();
  let allElecGenUSAllYears = await allElecGenPromiseUSAllYears;
  let years = isolateYears(allElecGenUSAllYears);

  let yearSelectDrop = d3.select("#year-select-drop");
  
  yearSelectDrop.selectAll("option")
  .data(years)
  .join("option")
  .property("value", d=>d)
  .text(d=>d);

  year = years[0]; // already sorted descending
}

// Acquire capacities of solar & wind from stored local file (accessed still via link due to JavaScript peculiarities)
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function initializeCapacities() {
  let currPromises = [];

  // using text -> parseRows instead of just CSV to avoid unsafe eval used by d3 (conflicts with HTML CSP header)
  currPromises.push(d3.text(directoryRoot + solarOpenName));
  currPromises.push(d3.text(directoryRoot + solarReferenceName));
  currPromises.push(d3.text(directoryRoot + solarLimitedName));
  currPromises.push(d3.text(directoryRoot + windOpenName));
  currPromises.push(d3.text(directoryRoot + windReferenceName));
  currPromises.push(d3.text(directoryRoot + windLimitedName));

  currPromises.push(d3.text(directoryRoot + offshoreWindName));

  let fullsText = await Promise.all(currPromises);

  let fullsCSV = [];
  for(let fullText of fullsText) {
    fullsCSV.push(d3.csvParseRows(fullText));
  }

  // Probably a similar time to pull all states at once as to pull one, as the parser needs to scan all columns of the table to find it anyway;
  // so going to pre-pull it all at start
  let capacitiesReturn = createCapacityStates(fullsCSV);
  elecCapacityUS = capacitiesReturn.elecCapacityUSReturn;
  elecCapacities = capacitiesReturn.elecCapacitiesReturn;
}

// Acquire electricity generation data (total and subparts) for US for current-set year and store in the US total & subpart variables
// Acquire import/export electricity data for US for current-set year and store in US variable
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function pullStoreUSData() {
  // Pull data for US, year, clean definitions
  let pulledElecGenData = await pullElecGenData("US");
  importElecUS = await pullImportElecData("US");

  // Store data
  allElecGenUS = pulledElecGenData.allElecGen;
   
  let subsetIterator = elecGen.keys();
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    let currSubset = currSubsetI.value;
    elecGen.get(currSubset).generationUS = pulledElecGenData.subpartsElecGen.get(currSubset);
  }
 
  cleanElecGenUS = pulledElecGenData.cleanElecGen;
}

// Acquire electricity generation data (total and subparts) for current-set year & state and store in the state total & subpart variables
// Acquire import/export electricity data for state for current-set year and store in state variable
// NOTE: assumes user input is locked in the process; and does not unlock it (needs an outer layer function to do so)
async function pullStoreStateData() {
  // Pull data for this state, year, clean definitions
  let pulledElecGenData = await pullElecGenData(state);
  importElecState = await pullImportElecData(state);

  // Store data
  allElecGenState = pulledElecGenData.allElecGen;
  
  let subsetIterator = elecGen.keys();
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    let currSubset = currSubsetI.value;
    elecGen.get(currSubset).generationState = pulledElecGenData.subpartsElecGen.get(currSubset);
  }

  cleanElecGenState = pulledElecGenData.cleanElecGen;
}

// Set on-screen text that states the current selected year
function printYear() {
  d3.select("#year-label")
    .text("In " + year + "...");
}

// Set on-screen text that states the capacity data's report year (in linking to its origin)
function printCapacityYear() {
  d3.select("#nrel-link")
    .text("NREL " + capacityYear + " Electricity Capacity Data");
}

// Set on-screen text pertaining to US-wide data & display variables
function printUSData() {

  // Pieces that depend on GW vs GWh or on which subparts are defined as clean, to be spliced into full text
  let outputAllGenUS = null;
  let outputCleanGenUS = null;
  let outputCleanPercentUS = null;
  let outputImportOrExportUS = null;
  let outputImportExportUS = null;
  let outputSolarCapacityUS = null;
  let outputWindCapacityUS = null;
  let outputOffshoreWindCapacityUS = null;
  let outputCapacityPercentUS = null; // >100%

  // table 1 data
  if(GWhorGW == "GWh") {
    outputAllGenUS = formatCommas(allElecGenUS.toFixed(0)) + " GWh";
    outputCleanGenUS = formatCommas(cleanElecGenUS.toFixed(0)) + " GWh";
  } else {
    outputAllGenUS = formatCommas((allElecGenUS/(365*24)).toFixed(2)) + " GW";
    outputCleanGenUS = formatCommas((cleanElecGenUS/(365*24)).toFixed(2)) + " GW";
  }
  outputCleanPercentUS = (100*(cleanElecGenUS/allElecGenUS)).toFixed(2) + "%";

  // under table 1 data
  if(importElecUS === null) {
    outputImportOrExportUS = "imported";
    outputImportExportUS = "N/A";
  } else {
    let currInvert = importElecUS;
    if(currInvert < 0) {
      outputImportOrExportUS = "exported";
      currInvert = -currInvert;
    } else {
      outputImportOrExportUS = "imported";
    }
    if(GWhorGW == "GWh") {
      outputImportExportUS = formatCommas(currInvert.toFixed(0)) + " GWh";
    } else {
      outputImportExportUS = formatCommas((currInvert/(365*24)).toFixed(2)) + " GW";
    }
  }

  // table 3 data
  let capacitySolarUS = elecCapacityUS.capacitiesMap.get(capacityRestrictions).solar;
  let capacityWindUS = elecCapacityUS.capacitiesMap.get(capacityRestrictions).wind;
  let capacityOffshoreWindUS = elecCapacityUS.capacitiesMap.get(capacityRestrictions).offshoreWind;
  if(GWhorGW == "GWh") {
    outputSolarCapacityUS = formatCommas(capacitySolarUS.toFixed(0)) + " GWh";
    outputWindCapacityUS = formatCommas(capacityWindUS.toFixed(0)) + " GWh";
  } else {
    outputSolarCapacityUS = formatCommas((capacitySolarUS/(365*24)).toFixed(2)) + " GW";
    outputWindCapacityUS = formatCommas((capacityWindUS/(365*24)).toFixed(2)) + " GW";
  }
  if(capacityOffshoreWindUS !== null) {
    if(GWhorGW == "GWh") {
      outputOffshoreWindCapacityUS = formatCommas(capacityOffshoreWindUS.toFixed(0)) + " GWh";
    } else {
      outputOffshoreWindCapacityUS = formatCommas((capacityOffshoreWindUS/(365*24)).toFixed(2)) + " GW";
    }
  } else {
    outputOffshoreWindCapacityUS = "N/A";
  }
  outputCapacityPercentUS = formatCommas((100*((capacitySolarUS + capacityWindUS) / allElecGenUS)).toFixed(2)) + "%";

  // Print US-wide stats
  if(state == "US") {
    d3.select("#title-text")
      .text("Electricity Generation in US in " + year + ":");
  }
    
  d3.select("#total-elec-gen-us")
    .text(outputAllGenUS);

  d3.select("#clean-elec-gen-us")
    .text(outputCleanGenUS);

  d3.select("#clean-elec-percent-us")
    .text(outputCleanPercentUS);
  
  d3.select("#import-us")
    .text("(US " + outputImportOrExportUS + ": " + outputImportExportUS + ")");

  d3.select("#capacity-solar-us")
    .text(outputSolarCapacityUS);

  d3.select("#capacity-wind-us")
    .text(outputWindCapacityUS);

  d3.select("#capacity-percent-us")
    .text(outputCapacityPercentUS);

  d3.select("#capacity-offshore-wind-us")
    .text("(US offshore wind capacity: " + outputOffshoreWindCapacityUS + ")")
}

// Set on-screen text pertaining to this state's data & display variables
function printStateData() {

  // If the current state is US, don't double calculate & double print
  if(state == "US") {
    d3.selectAll(".elec-gen-output-state")
    .style("display", "none");

    return;
  }

  // Else show state data again in case prior state was US
  d3.selectAll(".elec-gen-output-state")
  .style("display", null);

  // Pieces that depend on GW vs GWh or on which subparts are defined as clean, to be spliced into full text
  let outputAllGenState = null;
  let outputCleanGenState = null;
  let outputCleanPercentState = null;
  let outputImportOrExportState = null;
  let outputImportExportState = null;
  let outputSolarCapacityState = null;
  let outputWindCapacityState = null;
  let outputCapacityPercentState = null; // >100%

  // table 1 data
  if(GWhorGW == "GWh") {
    outputAllGenState = formatCommas(allElecGenState.toFixed(0)) + " GWh";
    outputCleanGenState = formatCommas(cleanElecGenState.toFixed(0)) + " GWh";
  } else {
    outputAllGenState = formatCommas((allElecGenState/(365*24)).toFixed(2)) + " GW";
    outputCleanGenState = formatCommas((cleanElecGenState/(365*24)).toFixed(2)) + " GW";
  }
  outputCleanPercentState = (100*(cleanElecGenState/allElecGenState)).toFixed(2) + "%";

  // under table 1 data
  if(importElecState === null) {
    outputImportOrExportState = "imported";
    outputImportExportState = "N/A";
  } else {
    let currInvert = importElecState;
    if(currInvert < 0) {
      outputImportOrExportState = "exported";
      currInvert = -currInvert;
    } else {
      outputImportOrExportState = "imported";
    }
    if(GWhorGW == "GWh") {
      outputImportExportState = formatCommas(currInvert.toFixed(0)) + " GWh";
    } else {
      outputImportExportState = formatCommas((currInvert/(365*24)).toFixed(2)) + " GW";
    }
  }

  // table 3 data
  let capacitySolarState = elecCapacities.get(state).capacitiesMap.get(capacityRestrictions).solar;
  let capacityWindState = elecCapacities.get(state).capacitiesMap.get(capacityRestrictions).wind;
  if(capacitySolarState !== null) {
    if(GWhorGW == "GWh") {
      outputSolarCapacityState = formatCommas(capacitySolarState.toFixed(0)) + " GWh";
    } else {
      outputSolarCapacityState = formatCommas((capacitySolarState/(365*24)).toFixed(2)) + " GW";     
    }
  } else {
    outputSolarCapacityState = "N/A";
  }
  if(capacityWindState !== null) {
    if(GWhorGW == "GWh") {
      outputWindCapacityState = formatCommas(capacityWindState.toFixed(0)) + " GWh";
    } else {
      outputWindCapacityState = formatCommas((capacityWindState/(365*24)).toFixed(2)) + " GW";
    }
  } else {
    outputWindCapacityState = "N/A";
  }
  if(capacitySolarState !== null && capacityWindState !== null) {
    outputCapacityPercentState = formatCommas((100*((capacitySolarState + capacityWindState)/allElecGenState)).toFixed(2)) + "%";   
  } else {
    outputCapacityPercentState = "N/A";
  }

  // Print state-wide stats
  d3.select("#title-text")
    .text("Electricity Generation in " + state + " in " + year + ":");

  d3.selectAll(".state-label")
    .text(state);
      
  d3.select("#total-elec-gen-state")
    .text(outputAllGenState);

  d3.select("#clean-elec-gen-state")
    .text(outputCleanGenState);

  d3.select("#clean-elec-percent-state")
    .text(outputCleanPercentState);
  
  d3.select("#import-state")
    .text("(" + state + " " + outputImportOrExportState + ": " + outputImportExportState + ")");

  d3.select("#capacity-solar-state")
    .text(outputSolarCapacityState);

  d3.select("#capacity-wind-state")
    .text(outputWindCapacityState);

  d3.select("#capacity-percent-state")
    .text(outputCapacityPercentState);
}

// Set on-screen visualization pertaining to state data & display variables' subpart percentages of whole state electricity gen
function visualizeStateData() {
  // Make an object we can pass to D3's treemap function (making an object in JSON-esque format, then formatting it for treemap)
  // Skeleton: whole structure + the 2 large subparts of clean and non-clean
  var currJson = {
    name: "Electricity Generation In " + state + " By Subparts",
    children: [
      {
        name: "Clean Electricity",
        children: [] 
      },
      {
        name: "Non-Clean Electricity",
        children: []
      }
    ]
  }

  let subsetIterator = elecGen.keys();
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    var currSubset = currSubsetI.value;
    var currSubsetObject = elecGen.get(currSubset);

    // Don't add the 0-gen pieces to the vis, they only make it rearrange when not necessary
    // Also don't add the negatives (there aren't any big ones & negatives can't be visualized here)
    if(currSubsetObject.generationState <= 0) {
      continue;
    }

    // Copy object so if formatting functions modify it, it won't mess with our stored data
    var newSubsetKey = currSubsetObject.key;
    var newSubsetIDs = [...currSubsetObject.ids]; // copies array
    var newSubsetGenerationState = currSubsetObject.generationState;
    var newSubsetGenerationUS = currSubsetObject.generationUS;
    if(elecGenIsClean.has(currSubset)) {
      currJson.children[0].children.push(new ElecGenSubset(newSubsetKey, newSubsetIDs, newSubsetGenerationState, newSubsetGenerationUS));
    } else {
      currJson.children[1].children.push(new ElecGenSubset(newSubsetKey, newSubsetIDs, newSubsetGenerationState, newSubsetGenerationUS));
    }
  }

  var currHierarchy = d3.hierarchy(currJson) // adds depth, height, parent to the data
                        .sum(d=>d.generationState) // access/sum childrens' values
                        .sort((a,b) => b.generationState - a.generationState); // sort in descending order

  // Set up the dimensions of a treemap, then pass the data to it
  var currTreemap = d3.treemap()
                      .tile(d3.treemapSliceDice) // make the subsections in logs rather than jumbled
                      .size([500,650])
                      .padding(1);
  var currRoot = currTreemap(currHierarchy); // determines & assigns x0, x1, y0, & y1 attrs for the data

  // Now we can make rect elements of these nodes & append them to an svg element on the screen
  var svgVis = d3.select("#elec-gen-vis-state-tree");
  
  svgVis.selectAll("rect") // by the D3 update pattern it creates new rects upon the "join()" call
     .data(currRoot.leaves().filter(d=>d.depth == 2))
     .join("rect")
     .attr("x", d=>d.x0)
     .attr("y", d=>d.y0)
     .attr("width", d=>d.x1-d.x0)
     .attr("height", d=>d.y1-d.y0)
     .attr("fill", (d) => determineColorCode(d))
     .on("mouseover", (event, d) => {
       let outputSubpartElecGenState = null;
       let outputPercentCleanNClean = null;
 
       if(GWhorGW == "GWh") {
         outputSubpartElecGenState = formatCommas(d.data.generationState.toFixed(0));
       } else {
         outputSubpartElecGenState = formatCommas((d.data.generationState/(365*24)).toFixed(2));
       }

       if(elecGenIsClean.has(d.data.key)) {
         outputPercentCleanNClean = (100*(d.data.generationState/cleanElecGenState)).toFixed(2) + "% of clean";
       } else {
         outputPercentCleanNClean = (100*(d.data.generationState/(allElecGenState - cleanElecGenState))).toFixed(2) + "% of non-clean";
       }

       d3.select("#tooltip")
         .style("visibility", "visible")

       d3.select("#tooltip-subpart-name")
         .text(elecGenNames.get(d.data.key));
         
       d3.select("#tooltip-total")
         .text(outputSubpartElecGenState + " " + GWhorGW);

       d3.select("#tooltip-percent")
         .text((100*(d.data.generationState/allElecGenState)).toFixed(2) + "% of total");

       d3.select("#tooltip-percent-clean-nclean")
         .text(outputPercentCleanNClean);

       if(state == "US") {
         d3.select("#tooltip-percent-of-us")
           .text("");
       } else {
         d3.select("#tooltip-percent-of-us")
           .text((100*(d.data.generationState/d.data.generationUS)).toFixed(2) + "% of US " + elecGenNames.get(d.data.key));
       }
     })
     .on("mousemove", (event, d) => {
       let setXTo = event.pageX + 10 + "px";
       let setYTo = event.pageY - 10;

       if(event.pageY/window.innerHeight > 0.5) {
         // "Flip" tooltip if it's over halfway down the page
         let tooltipSize = d3.select("#tooltip").property("clientHeight");
         setYTo -= tooltipSize;
       }
       setYTo += "px";

       d3.select("#tooltip")
         .style("top", setYTo)
         .style("left", setXTo);
     })
     .on("mouseout", (event, d) => {
       d3.select("#tooltip")
         .style("visibility", "hidden");
     }); 
	
  // Manual legend
  var svgLeg = d3.select("#elec-gen-vis-state-legend");

  var size = 15; // of each color square for legend
  // Squares
  svgLeg.selectAll("rect")
        .data(currRoot.leaves().filter(d=>d.depth == 2))
        .join("rect")
        .attr("x", 20)
        .attr("y", function(d,i){ return 20 + i*(size + 2)})
        .attr("width", size)
        .attr("height", size)
        .style("fill", (d) => determineColorCode(d));

  // Text
  svgLeg.selectAll("text")
        .data(currRoot.leaves().filter(d=>d.depth == 2))
        .join("text")
        .attr("x", 50 + size*1.2)
        .attr("y", function(d,i){ return 20 + i*(size + 2) + size/2 })
        .text((d) => { return elecGenNames.get(d.data.key) + ", " + (100*(d.data.generationState/allElecGenState)).toFixed(2) + "%" });
}

// -----------------------------------------------------
// ---Helper Functions: ---
// -----------------------------------------------------
// (functions used for pieces of larger-function tasks, or repeated tasks, for clarity of reading)

// For initialize()
// Make the state to ID mappings
function initializeStateNameToID() {
  stateNameToID.set("Alabama", "AL").set("Alaska", "AK").set("Arizona", "AZ").set("Arkansas", "AR").set("California", "CA").set("Colorado", "CO")
  .set("Connecticut", "CT").set("D.C.", "DC").set("Delaware", "DE").set("Florida", "FL").set("Georgia", "GA").set("Hawaii", "HI").set("Idaho", "ID").set("Illinois", "IL")
  .set("Indiana", "IN").set("Iowa", "IA").set("Kansas", "KS").set("Kentucky", "KY").set("Louisiana", "LA").set("Maine", "ME").set("Maryland", "MD")
  .set("Massachusetts", "MA").set("Michigan", "MI").set("Minnesota", "MN").set("Mississippi", "MS").set("Missouri", "MO").set("Montana", "MT").set("Nebraska", "NE")
  .set("Nevada", "NV").set("New Hampshire", "NH").set("New Jersey", "NJ").set("New Mexico", "NM").set("New York", "NY").set("North Carolina", "NC")
  .set("North Dakota", "ND").set("Ohio", "OH").set("Oklahoma", "OK").set("Oregon", "OR").set("Pennsylvania", "PA").set("Rhode Island", "RI")
  .set("South Carolina", "SC").set("South Dakota", "SD").set("Tennessee", "TN").set("Texas", "TX").set("Utah", "UT").set("Vermont", "VT").set("Virginia", "VA")
  .set("Washington", "WA").set("West Virginia", "WV").set("Wisconsin", "WI").set("Wyoming", "WY");
}

// For updateState(), updateYear()
// Disables all user input elements
function disableUserInput() {
  d3.select("#state-select-drop")
    .property("disabled", true);
  d3.select("#year-select-drop")
    .property("disabled", true);
  d3.select("#GWh-or-GW-drop")
    .property("disabled", true);
  d3.select("#capacity-restrictions-drop")
    .property("disabled", true);
  d3.select("#select-clean-elec")
    .selectAll(".controversial")
    .property("disabled", true);
}

// For updateState(), updateYear(), initialize()
// Enables all user input elements
function enableUserInput() {
  d3.select("#state-select-drop")
    .attr("disabled", null);
  d3.select("#year-select-drop")
    .attr("disabled", null);
  d3.select("#GWh-or-GW-drop")
    .attr("disabled", null);
  d3.select("#capacity-restrictions-drop")
    .attr("disabled", null);
  d3.select("#select-clean-elec")
    .selectAll(".controversial")
    .attr("disabled", null);
}

// For initializeYears()
// Pulls & returns a Promise of all all-fuel annual electricity generation data for US, sorted by years descending (with current-set 
// API key)
function pullElecGenPromiseUSAllYears() {
  // Sorted by period in "desc" (descending) direction
  return d3.json("https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=" + eiaKey + 
    "&frequency=annual&data[0]=generation&facets[fueltypeid][]=" + "ALL" + "&facets[location][]=" + "US" + 
    "&facets[sectorid][]=98&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=" + "5000");
}

// For initializeYears()
// Sifts through some electricity generation data response to isolate all available years & return them in an array
// in the same order as given
// NOTE: assumes no year appears >1 time (else will return duplicates)
function isolateYears(elecGenMultiple) {
  let years = [];

  for (let i = 0; i < elecGenMultiple.response.total; i++) {
    years.push(parseInt(elecGenMultiple.response.data[i].period));
  }
  
  return years;
}

// For pullStoreUSData(), pullStoreStateData()
// Acquire & return electricity generation data (total & subsets) for some location (state or US) with current-set year, returned in 
// order of subpart keys in map to be parsed by the calling function
async function pullElecGenData(location) {
  let allElecGenPromise = pullElecGenPromise("ALL", location); // Pull the whole electricity Promise generated for this location
  let elecGenPromises = [];

  let subsetIterator = elecGen.keys();
  // For each fuel ids subset we need for this location, pull it & store their Promise(s) to await in the array in order
  // (Some subsets are made up of multiple ids to add together, hence the array-based implementation)
  // (Unlike some other languages, JS goes over map keys in insertion order, not random)
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    let currSubset = currSubsetI.value;
    let currFuelIDs = elecGen.get(currSubset).ids;
    let currToPush = [];
    currFuelIDs.forEach(fuelID => {
      currToPush.push(pullElecGenPromise(fuelID, location));
    });

    elecGenPromises.push(Promise.all(currToPush));
  }

  // Await all promises (asynchronous network fetch feature)
  let allElecGenFull = await allElecGenPromise;
  let fulls = await Promise.all(elecGenPromises);

  // All electricity generated for this location/year
  let allElecGenReturn = isolateElecGenOrZero(allElecGenFull);

  // Map each subset key to the generation it produced for this location/year (summing for those that correspond to multiple fuelIDs)
  let subpartsElecGenReturn = new Map();
  let i = 0;
  subsetIterator = elecGen.keys();
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    let currSubset = currSubsetI.value;
    let currFulls = fulls[i];
    let currTotal = 0;
    currFulls.forEach(currFull => { // some subsets have multiple fuelIDs to sum generations of
      currTotal += isolateElecGenOrZero(currFull);
    });

    subpartsElecGenReturn.set(currSubset, currTotal);

    i++;
  }

  // Display variable of clean electricities for this location/year, to return
  let cleanElecGenReturn = 0;
  // For each generation user-defined to be clean, add it to clean total
  elecGenIsClean.forEach(currSubset => {
    cleanElecGenReturn += subpartsElecGenReturn.get(currSubset);
  });

  // Return the 3 values: all electricity generated, map of electricity generated by subparts, and clean electricity generated;
  // for this location/year/clean definition
  return {"allElecGen": allElecGenReturn, "subpartsElecGen": subpartsElecGenReturn, "cleanElecGen": cleanElecGenReturn};
}

// For pullElecGenData()
// Pulls & returns a Promise of annual electricity generation data for the given fuel type ID & location
// NOTE: pulls several years surrounding current year (due to inconsistencies in API functionality) - user still needs to isolate year
function pullElecGenPromise(fuelID, location) {
  return d3.json("https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=" + eiaKey + 
    "&frequency=annual&data[0]=generation&facets[fueltypeid][]=" + fuelID + "&facets[location][]=" + location + 
    "&facets[sectorid][]=98&offset=0&start=" + (year - 1) + "&end=" + (year + 1));
}

// For pullElecGenData()
// For some energy subset's full response data for some state, returns, for this year, either its generation value in GWh 
// or 0 in case of absent value
function isolateElecGenOrZero(subsetFull) {

  // Find the right indices in the returned data to access current year, or ensure its absence
  let subsetResponse = subsetFull.response.data;
  let foundYearIndex = null;
  for(let i = 0; i<subsetResponse.length; i++) {
    if(subsetResponse[i] !== undefined && subsetResponse[i].period == year) {
      foundYearIndex = i;
      break;
    }
  }

  if(foundYearIndex !== null && subsetResponse[foundYearIndex].generation !== undefined) {
    return parseFloat(subsetResponse[foundYearIndex].generation);
  } else {
    return 0;
  }
}

// For pullStoreUSData(), pullStoreStateData()
// Acquire & return import/export data integer (positive is import, negative is export) for all-fuel & the given location, in GWh
// (with current-set year and API key)
// If location is US, import/exports are for intercountry only; if it's a state, intercountry + interstate
async function pullImportElecData(location) {
  // Pull intercountry & interstate data (for several years surrounding current year)
  let importElecCountryPromise = d3.json("https://api.eia.gov/v2/seds/data/?api_key=" + eiaKey + 
    "&frequency=annual&data[0]=value&facets[seriesId][]=ELNIP&facets[stateId][]=" + location +
    "&offset=0&start=" + (year - 1) + "&end=" + (year + 1));
  let importElecStatePromise = d3.json("https://api.eia.gov/v2/seds/data/?api_key=" + eiaKey + 
    "&frequency=annual&data[0]=value&facets[seriesId][]=ELISP&facets[stateId][]=" + location +
    "&offset=0&start=" + (year - 1) + "&end=" + (year + 1));

  let importElecCountryFull = await importElecCountryPromise;
  let importElecStateFull = await importElecStatePromise;

  // Find the right indices in the returned data to access current year, or ensure its absence
  let importElecCountryResponse = importElecCountryFull.response.data;
  let foundCountryYearIndex = null;

  for(let i = 0; i<importElecCountryResponse.length; i++) {
    if(importElecCountryResponse[i] !== undefined && importElecCountryResponse[i].period == year) {
      foundCountryYearIndex = i;
      break;
    }
  }

  let importElecStateResponse = importElecStateFull.response.data;
  let foundStateYearIndex = null;
  for(let i = 0; i<importElecStateResponse.length; i++) {
    if(importElecStateResponse[i] !== undefined && importElecStateResponse[i].period == year) {
      foundStateYearIndex = i;
      break;
    }
  }

  let importElecReturn = null;
  if(foundCountryYearIndex !== null && foundStateYearIndex !== null) { 
    // Import/export data will be unavailable for some years, store as null itc
    importElecReturn = parseFloat(importElecCountryFull.response.data[foundCountryYearIndex].value) + 
                         parseFloat(importElecStateFull.response.data[foundStateYearIndex].value); // if US, the state one will be 0
  }

  return importElecReturn;
}

// For updateYear(), initialize()
// Copy currently stored state elec gen data to US (for cases when the state set is US and we don't want to double-pull the same data)
// NOTE: modifies inner variables
function copyStateToUSData() { 
  allElecGenUS = allElecGenState;
  importElecUS = importElecState;

  let subsetIterator = elecGen.keys();
  for(let currSubsetI = subsetIterator.next(); !currSubsetI.done; currSubsetI = subsetIterator.next()) {
    let currSubset = currSubsetI.value;
    elecGen.get(currSubset).generationUS = elecGen.get(currSubset).generationState;
  }

  // Display var
  cleanElecGenUS = cleanElecGenState;
}

// For initializeCapacities()
// Given year and csv files, find the states' various available capacities, create & return map of all CapacityState objects + US CapacityState
// fulls contains the 6 full capacity csv files in the same order as the capacities are in a CapacityState (solar open, solar reference, ...)
// plus an extra full of offshore wind for US CapacityState use only
function createCapacityStates(fulls) {
  let elecCapacitiesReturn = new Map();

  // Initialize elecCapacitiesReturn with the state IDs and nulls to switch out if value found in next step
  let stateIterator = stateNameToID.keys();
  for(let currStateI = stateIterator.next(); !currStateI.done; currStateI = stateIterator.next()) {
    let currState = currStateI.value;
    let currStateID = stateNameToID.get(currState);
    let currCapacityState = new CapacityState(currStateID, null, null, null, null, null, null);
    elecCapacitiesReturn.set(currStateID, currCapacityState);
  }

  // We start the US at 0, not null, b/c it cannot have a "not found" error for any of the spreadsheet types, by the nature of them existing
  // (unlike some states missing from them); and we will add to it iteratively
  let elecCapacityUSReturn = new CapacityState("US", 0, 0, 0, 0, 0, 0);

  // For each spreadsheet except last, for each row, get the state name & put its capacity in the correct spot of the correct CapacityState,
  // as well as adding to the US capacity state as we go
  for(let i = 0; i<fulls.length - 1; i++) {
    let currFull = fulls[i];
    for(let j = 1; j<currFull.length; j++) { // skip first row, it's the header
      let currState = currFull[j][1]; // state is at idx 1 of array
      let currStateID = stateNameToID.get(currState);
      let currCapacityState = elecCapacitiesReturn.get(currStateID);
      
      if(currCapacityState !== undefined) {
        addCapacityToCapacityStates(currCapacityState, elecCapacityUSReturn, i, parseFloat(currFull[j][2])); // capacity_gwh is at idx 2
      }
    }
  }

  // Add the offshore data to the US CapacityState only
  elecCapacityUSReturn.addOffshore(null, null, null);

  lastFull = fulls[fulls.length-1];
  for(let j = 1; j<lastFull.length; j++) {
    let currType = lastFull[j][1]; // type is at idx 1
    elecCapacityUSReturn.capacitiesMap.get(currType).offshoreWind = parseFloat(lastFull[j][2]); // capacity_gwh_us is at idx 2
  }

  return {"elecCapacityUSReturn": elecCapacityUSReturn, "elecCapacitiesReturn": elecCapacitiesReturn};
}

// For createCapacityStates()
// Put the curr capacity in the correct spot of currCapacityState, and add to correct spot of elecCapacityUS, based on i
// (the index of the current spreadsheet, 0-5, in the same order as the spreadsheet-derived fields are in a CapacityState)
function addCapacityToCapacityStates(currCapacityState, elecCapacityUSReturn, i, currCapacityGWh) {
  if(i == 0) {
    currCapacityState.capacitiesMap.get("open").solar = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("open").solar += currCapacityGWh;
  } else if(i == 1) {
    currCapacityState.capacitiesMap.get("reference").solar = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("reference").solar += currCapacityGWh;
  } else if(i == 2) {
    currCapacityState.capacitiesMap.get("limited").solar = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("limited").solar += currCapacityGWh;
  } else if(i == 3) {
    currCapacityState.capacitiesMap.get("open").wind = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("open").wind += currCapacityGWh;
  } else if(i == 4) {
    currCapacityState.capacitiesMap.get("reference").wind = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("reference").wind += currCapacityGWh;
  } else if(i == 5) {
    currCapacityState.capacitiesMap.get("limited").wind = currCapacityGWh;
    elecCapacityUSReturn.capacitiesMap.get("limited").wind += currCapacityGWh;
  }
}

// For visualizeStateData()
// For some leaf d of the treemap structure, find out what color to code it based on if it's classed as clean or not & its id
// (with display vars)
function determineColorCode(leaf) {
  let currClean;
  if(leaf.parent.data.name == "Clean Electricity") {
    currClean = true;
  } else {
    currClean = false;
  }
 
  if(currClean) {
    return cleanColorScale(leaf.data.key);
  } else {
    return ncleanColorScale(leaf.data.key);
  }
}

// -----------------------------------------------------
// ---Initial: ---
// -----------------------------------------------------

initialize();
