(function () {
  "use strict";

  const layerUrl = "https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_2/FeatureServer/3/query";
  const mapElement = document.getElementById("map");
  const statusElement = document.getElementById("data-status");
  const siteSelect = document.getElementById("site-select");
  const siteDetails = document.getElementById("site-details");
  const proposalForm = document.getElementById("proposal-form");
  const proposalOutput = document.getElementById("proposal-output");
  const copyButton = document.getElementById("copy-button");
  const areaSearchForm = document.getElementById("area-search-form");
  const areaSearchStatus = document.getElementById("area-search-status");
  const areaResultsWrap = document.getElementById("area-results-wrap");
  const areaResults = document.getElementById("area-results");
  const siteTypeFilters = Array.from(document.querySelectorAll("[data-site-type]"));
  const capeBounds = { south: -34.5, west: 18.2, north: -33.5, east: 18.9 };
  const mappedTypeIds = [1, 9, 10, 11, 12, 15];
  let featuresById = new Map();
  let allFeatures = [];
  let areaPlaces = [];
  let selectedFeature = null;
  let selectedLayer = null;
  let parksLayer = null;
  let map = null;
  let lastGeocodeRequest = 0;
  let activeAreaName = "";

  if (typeof L === "undefined" || !mapElement) {
    showDataError("The map library could not be loaded. Check your connection and reload to try again.");
    return;
  }

  map = L.map(mapElement, { scrollWheelZoom: false }).setView([-33.925, 18.424], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  parksLayer = L.geoJSON(null, {
    style: { color: "#456c4b", weight: 1.4, opacity: 0.9, fillColor: "#b6d59d", fillOpacity: 0.48 },
    onEachFeature: function (feature, layer) {
      const id = String(feature.properties.OBJECTID);
      const name = displayName(feature.properties);
      layer.bindPopup(escapeHtml(name) + "<br><span>Official City of Cape Town mapped site</span>");
      layer.on("click", function () { selectSite(id); });
    }
  }).addTo(map);

  loadParks(capeBounds, false);
  proposalForm.addEventListener("submit", generateEnquiry);
  copyButton.addEventListener("click", copyEnquiry);
  siteSelect.addEventListener("change", function () {
    if (siteSelect.value) selectSite(siteSelect.value);
  });
  areaSearchForm.addEventListener("submit", searchAreas);
  areaResults.addEventListener("change", function () {
    if (!areaResults.value) return;
    const place = areaPlaces[Number(areaResults.value)];
    if (place) loadAreaSites(place);
  });
  siteTypeFilters.forEach(function (filter) {
    filter.addEventListener("change", applySiteFilters);
  });

  async function loadParks(bounds, paginate) {
    const isAreaSearch = Boolean(paginate);
    siteSelect.disabled = true;
    statusElement.classList.remove("error");
    statusElement.textContent = isAreaSearch
      ? "Loading official mapped sites in and near the selected area…"
      : "Loading official Cape Town park classifications…";
    try {
      allFeatures = await queryParks(bounds, paginate);
      featuresById = new Map(allFeatures.map(function (feature) {
        return [String(feature.properties.OBJECTID), feature];
      }));
      if (selectedLayer) selectedLayer = null;
      selectedFeature = null;
      siteDetails.hidden = true;
      activeAreaName = isAreaSearch ? areaResults.options[areaResults.selectedIndex].text : "";
      applySiteFilters();
    } catch (error) {
      siteSelect.disabled = true;
      siteSelect.innerHTML = '<option value="">Official sites unavailable</option>';
      showDataError("City of Cape Town park data is temporarily unavailable. The base map remains available; try again later.");
      console.error("Could not load official park data:", error);
    }
  }

  async function queryParks(bounds, paginate) {
    const collected = [];
    const seenIds = new Set();
    let offset = 0;
    const maxPages = paginate ? 20 : 1;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        where: "LU_PARK_TYPE IN (" + mappedTypeIds.join(",") + ")",
        outFields: "OBJECTID,PARK_NAME,LU_PARK_TYPE,ACS_ADR,PLAY_EQPM,SUB_AREA",
        returnGeometry: "true",
        outSR: "4326",
        resultRecordCount: "1000",
        geometry: JSON.stringify({
          xmin: bounds.west, ymin: bounds.south, xmax: bounds.east, ymax: bounds.north,
          spatialReference: { wkid: 4326 }
        }),
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        f: "geojson"
      });
      if (paginate) {
        params.set("resultOffset", String(offset));
        params.set("orderByFields", "OBJECTID");
      }

      const response = await fetch(layerUrl + "?" + params.toString());
      if (!response.ok) throw new Error("City map service responded with " + response.status);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "City map service returned an error.");
      if (!Array.isArray(data.features)) throw new Error("The City map service returned an unexpected response.");

      data.features.forEach(function (feature) {
        if (!feature || !feature.geometry || !feature.properties || feature.properties.OBJECTID == null) return;
        const id = String(feature.properties.OBJECTID);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          collected.push(feature);
        }
      });

      if (!paginate || !data.exceededTransferLimit || !data.features.length) break;
      offset += data.features.length;
      if (page === maxPages - 1) {
        throw new Error("The selected area contains too many records to load at once. Choose a smaller suburb or area.");
      }
    }
    return collected;
  }

  async function searchAreas(event) {
    event.preventDefault();
    const query = document.getElementById("area-search").value.trim();
    if (!query) return;
    const button = areaSearchForm.querySelector('button[type="submit"]');
    button.disabled = true;
    areaSearchStatus.classList.remove("error");
    areaSearchStatus.textContent = "Searching Cape Town areas…";

    try {
      const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeRequest));
      if (wait) await new Promise(function (resolve) { window.setTimeout(resolve, wait); });
      lastGeocodeRequest = Date.now();
      const params = new URLSearchParams({
        q: query + ", Cape Town, South Africa",
        format: "jsonv2",
        countrycodes: "za",
        limit: "5"
      });
      const response = await fetch("https://nominatim.openstreetmap.org/search?" + params.toString(), {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Place search responded with " + response.status);
      const places = await response.json();
      areaPlaces = places.filter(isCapeTownPlace);
      areaResults.replaceChildren(new Option("Select a matching Cape Town area…", ""));
      areaPlaces.forEach(function (place, index) {
        areaResults.appendChild(new Option(place.display_name, String(index)));
      });
      areaResultsWrap.hidden = false;
      areaSearchStatus.textContent = areaPlaces.length
        ? areaPlaces.length + " matching Cape Town area" + (areaPlaces.length === 1 ? "" : "s") + " found. Choose one to view nearby sites."
        : "No matching Cape Town suburb or area found. Try a nearby suburb name.";
    } catch (error) {
      areaResultsWrap.hidden = true;
      areaSearchStatus.textContent = "Area search is temporarily unavailable. You can still explore the Cape Town map.";
      areaSearchStatus.classList.add("error");
      console.error("Could not search Cape Town areas:", error);
    } finally {
      button.disabled = false;
    }
  }

  function isCapeTownPlace(place) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= capeBounds.south && lat <= capeBounds.north &&
      lon >= capeBounds.west && lon <= capeBounds.east;
  }

  function loadAreaSites(place) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    let bounds = {
      south: lat - 0.02,
      west: lon - 0.02,
      north: lat + 0.02,
      east: lon + 0.02
    };
    if (Array.isArray(place.boundingbox) && place.boundingbox.length === 4) {
      const [south, north, west, east] = place.boundingbox.map(Number);
      if ([south, north, west, east].every(Number.isFinite) &&
          north - south <= 0.12 && east - west <= 0.12) {
        bounds = { south: south - 0.015, west: west - 0.015, north: north + 0.015, east: east + 0.015 };
      }
    }
    bounds = {
      south: Math.max(capeBounds.south, bounds.south),
      west: Math.max(capeBounds.west, bounds.west),
      north: Math.min(capeBounds.north, bounds.north),
      east: Math.min(capeBounds.east, bounds.east)
    };
    const nearbyBounds = L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]);
    map.fitBounds(nearbyBounds, { maxZoom: 14 });
    loadParks(bounds, true);
  }

  function populateSiteOptions(features) {
    siteSelect.innerHTML = '<option value="">Choose an official mapped site…</option>';
    features.forEach(function (feature) {
      const id = String(feature.properties.OBJECTID);
      const option = document.createElement("option");
      option.value = id;
      option.textContent = displayName(feature.properties);
      siteSelect.appendChild(option);
    });
    siteSelect.disabled = features.length === 0;
    if (!features.length) siteSelect.innerHTML = '<option value="">No sites match these filters</option>';
  }

  function applySiteFilters() {
    const activeTypes = new Set();
    siteTypeFilters.forEach(function (filter) {
      if (!filter.checked) return;
      filter.dataset.siteType.split(",").forEach(function (type) { activeTypes.add(Number(type)); });
    });
    const visibleFeatures = allFeatures.filter(function (feature) {
      return activeTypes.has(Number(feature.properties.LU_PARK_TYPE));
    });
    parksLayer.clearLayers();
    if (visibleFeatures.length) parksLayer.addData({ type: "FeatureCollection", features: visibleFeatures });
    populateSiteOptions(visibleFeatures);

    if (selectedFeature && !visibleFeatures.some(function (feature) {
      return String(feature.properties.OBJECTID) === String(selectedFeature.properties.OBJECTID);
    })) {
      selectedFeature = null;
      selectedLayer = null;
      siteDetails.hidden = true;
    }

    const location = activeAreaName ? " near " + activeAreaName : " in the Cape Town area";
    statusElement.classList.remove("error");
    statusElement.textContent = visibleFeatures.length
      ? visibleFeatures.length + " mapped site" + (visibleFeatures.length === 1 ? "" : "s") + " shown" + location +
        (activeAreaName ? "." : ". The citywide view is limited to the first 1,000 results; search a suburb for nearby sites.")
      : "No mapped sites match these type filters" + location + ".";
  }

  function selectSite(id) {
    const feature = featuresById.get(String(id));
    if (!feature) return;
    selectedFeature = feature;
    siteSelect.value = String(feature.properties.OBJECTID);
    if (selectedLayer) parksLayer.resetStyle(selectedLayer);
    selectedLayer = null;
    parksLayer.eachLayer(function (layer) {
      if (String(layer.feature.properties.OBJECTID) === String(id)) selectedLayer = layer;
    });
    if (selectedLayer) {
      selectedLayer.setStyle({ color: "#263f2e", weight: 3, fillColor: "#d7e78f", fillOpacity: 0.75 });
      map.fitBounds(selectedLayer.getBounds(), { padding: [24, 24], maxZoom: 15 });
      selectedLayer.openPopup();
    }
    renderSiteDetails(feature.properties);
  }

  function renderSiteDetails(properties) {
    document.getElementById("selected-name").textContent = displayName(properties);
    const attributes = [
      ["Park type", parkTypeName(properties.LU_PARK_TYPE)],
      ["Access address", properties.ACS_ADR],
      ["Play equipment", properties.PLAY_EQPM],
      ["Sub area", properties.SUB_AREA]
    ];
    const list = document.getElementById("selected-attributes");
    list.replaceChildren();
    attributes.forEach(function (item) {
      if (item[1] == null || item[1] === "") return;
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = item[0];
      value.textContent = String(item[1]);
      list.append(term, value);
    });
    siteDetails.hidden = false;
    updateSiteGuidance(properties);
  }

  function updateSiteGuidance(properties) {
    const container = document.getElementById("site-start-guidance");
    const type = Number(properties.LU_PARK_TYPE);
    container.replaceChildren();

    const heading = document.createElement("h5");
    heading.textContent = "How could I start a project here?";
    container.appendChild(heading);

    const classification = document.createElement("p");
    classification.className = "mapped-classification";
    classification.textContent = type === 12
      ? "Mapped as UNDEVELOPED. This classification does not mean the site is available for community use or approved."
      : type === 15
        ? "Mapped as COMMUNITY GARDEN. This does not confirm current access, availability or permission for another project."
        : "Mapped as " + parkTypeName(type).toUpperCase() + ". This does not confirm availability, access or permission for your proposed activity.";
    container.appendChild(classification);

    const steps = document.createElement("ol");
    [
      "Ask the City to confirm who owns and manages this land.",
      "Ask whether your idea can be considered here, including zoning and site restrictions.",
      "Request the applicable written permission and application process before doing any work.",
      "Talk with nearby residents and potential partners about shared roles and long-term care.",
      "Confirm whether water can be accessed and what conditions apply."
    ].forEach(function (text) {
      const step = document.createElement("li");
      step.textContent = text;
      steps.appendChild(step);
    });
    container.appendChild(steps);
  }

  function generateEnquiry(event) {
    event.preventDefault();
    if (!selectedFeature) {
      statusElement.textContent = "Select an official mapped site before drafting an enquiry.";
      statusElement.classList.add("error");
      document.getElementById("site-select").focus();
      return;
    }
    const p = selectedFeature.properties;
    const activity = value("opportunity");
    const answers = {
      purpose: value("purpose") || "We are at an early idea stage and would welcome guidance on whether this could be considered.",
      participants: value("participants") || "We are still exploring who might take part.",
      benefits: value("benefits") || "We are still exploring potential community benefits.",
      water: value("water") || "We would like to understand whether water access is possible and what conditions apply.",
      soil: value("soil") || "We would like to discuss suitable soil restoration approaches if the site could be considered.",
      maintenance: value("maintenance") || "We would like guidance on the stewardship responsibilities expected."
    };
    proposalOutput.value = [
      "Subject: Preliminary enquiry about " + activity.toLowerCase() + " at " + displayName(p),
      "",
      "Dear City of Cape Town team,",
      "",
      "We are exploring a " + activity.toLowerCase() + " at " + displayName(p) + ". The City of Cape Town Parks layer maps this site as " + parkTypeName(p.LU_PARK_TYPE).toUpperCase() + (p.OBJECTID != null ? " (OBJECTID " + p.OBJECTID + ")" : "") + (p.ACS_ADR ? ", with mapped access address " + p.ACS_ADR : "") + ". This mapped classification does not confirm land availability, ownership, access, suitability or permission.",
      "",
      "Project purpose: " + answers.purpose,
      "Intended participants: " + answers.participants,
      "Community benefits: " + answers.benefits,
      "Water approach / questions: " + answers.water,
      "Soil restoration approach: " + answers.soil,
      "Ongoing maintenance approach: " + answers.maintenance,
      "",
      "Could you please advise:",
      "1. Could this mapped site be considered for a " + activity.toLowerCase() + " at all?",
      "2. Who currently owns and manages this site, and which City department is responsible?",
      "3. What zoning or other site restrictions should we understand?",
      "4. What permission, application process and approvals would apply before any activity?",
      "5. Could water be accessed for this purpose, and what conditions would apply?",
      "6. What community participation and ongoing stewardship responsibilities would be expected?",
      "",
      "We will not access, plant or begin work unless the City confirms that the activity may be considered and the required permission is in place. Please direct us to the appropriate department or published process.",
      "",
      "Kind regards,",
      "[Your name / group]",
      "[Contact details]"
    ].join("\n");
    copyButton.disabled = false;
    statusElement.classList.remove("error");
    document.getElementById("copy-status").textContent = "";
  }

  async function copyEnquiry() {
    if (!proposalOutput.value.trim()) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(proposalOutput.value);
        } catch (clipboardError) {
          if (!copyFromTextarea()) throw clipboardError;
        }
      } else if (!copyFromTextarea()) {
        throw new Error("Copy command was not available.");
      }
      document.getElementById("copy-status").textContent = "Copied to clipboard.";
    } catch (error) {
      document.getElementById("copy-status").textContent = "Copy was blocked. Select and copy the enquiry text manually.";
      console.error("Could not copy enquiry:", error);
    }
  }

  function copyFromTextarea() {
    proposalOutput.focus();
    proposalOutput.select();
    const copied = document.execCommand("copy");
    proposalOutput.setSelectionRange(0, 0);
    return copied;
  }

  function showDataError(message) {
    statusElement.textContent = message;
    statusElement.classList.add("error");
  }

  function value(id) {
    return document.getElementById(id).value.trim();
  }

  function displayName(properties) {
    return properties.PARK_NAME && String(properties.PARK_NAME).trim()
      ? String(properties.PARK_NAME).trim()
      : "Unnamed mapped site (OBJECTID " + properties.OBJECTID + ")";
  }

  function parkTypeName(code) {
    const types = {
      1: "Public open space",
      9: "District park",
      10: "Community park",
      11: "Greenbelt",
      12: "Undeveloped",
      15: "Community garden"
    };
    return types[code] || "City mapped park type " + code;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
})();
