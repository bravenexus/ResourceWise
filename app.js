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
  const readinessInputs = Array.from(document.querySelectorAll("[data-readiness]"));
  const readinessCount = document.getElementById("readiness-count");
  let featuresById = new Map();
  let selectedFeature = null;
  let selectedLayer = null;
  let parksLayer = null;
  let map = null;
  let enquiryPrepared = false;

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

  loadParks();
  loadReadiness();
  proposalForm.addEventListener("submit", generateEnquiry);
  copyButton.addEventListener("click", copyEnquiry);
  siteSelect.addEventListener("change", function () {
    if (siteSelect.value) selectSite(siteSelect.value);
  });

  async function loadParks() {
    const params = new URLSearchParams({
      where: "LU_PARK_TYPE IN (1,9,10,11)",
      outFields: "OBJECTID,PARK_NAME,LU_PARK_TYPE,ACS_ADR,PLAY_EQPM,SUB_AREA",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "1000",
      geometry: JSON.stringify({
        xmin: 18.2, ymin: -34.5, xmax: 18.9, ymax: -33.5,
        spatialReference: { wkid: 4326 }
      }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      f: "geojson"
    });

    try {
      const response = await fetch(layerUrl + "?" + params.toString());
      if (!response.ok) throw new Error("City map service responded with " + response.status);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "City map service returned an error.");
      if (!Array.isArray(data.features)) throw new Error("The City map service returned an unexpected response.");

      const features = data.features.filter(function (feature) {
        return feature && feature.geometry && feature.properties && feature.properties.OBJECTID != null;
      });
      if (!features.length) {
        siteSelect.innerHTML = '<option value="">No sites found in this area</option>';
        statusElement.textContent = "No matching public-open-space features were returned for the Cape Town map area.";
        return;
      }

      featuresById = new Map(features.map(function (feature) {
        return [String(feature.properties.OBJECTID), feature];
      }));
      parksLayer.addData({ type: "FeatureCollection", features: features });
      populateSiteOptions(features);
      statusElement.textContent = features.length === 1000
        ? "Showing the first 1,000 mapped public parks and open spaces in the Cape Town area."
        : features.length + " mapped public parks and open spaces available in this area.";
    } catch (error) {
      siteSelect.disabled = true;
      siteSelect.innerHTML = '<option value="">Official sites unavailable</option>';
      showDataError("City of Cape Town park data is temporarily unavailable. The base map remains available; try reloading later.");
      console.error("Could not load official park data:", error);
    }
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
    siteSelect.disabled = false;
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
    updateReadiness();
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
  }

  function generateEnquiry(event) {
    event.preventDefault();
    if (!selectedFeature) {
      statusElement.textContent = "Select an official mapped site before drafting an enquiry.";
      statusElement.classList.add("error");
      document.getElementById("site-select").focus();
      return;
    }
    if (!proposalForm.reportValidity()) return;

    const p = selectedFeature.properties;
    const answers = {
      purpose: value("purpose"),
      participants: value("participants"),
      benefits: value("benefits"),
      water: value("water") || "To be explored with the municipality and community.",
      soil: value("soil") || "To be developed with local ecological and soil knowledge.",
      maintenance: value("maintenance") || "To be discussed with potential community partners."
    };
    proposalOutput.value = [
      "Subject: Enquiry about a regenerative community project at " + displayName(p),
      "",
      "Dear City of Cape Town team,",
      "",
      "Our community is exploring a " + value("opportunity").toLowerCase() + " at " + displayName(p) + ". The site is identified in the City of Cape Town Parks map layer" + (p.OBJECTID != null ? " (OBJECTID " + p.OBJECTID + ")" : "") + (p.ACS_ADR ? ", with mapped access address " + p.ACS_ADR : "") + ". We understand this map record does not confirm ownership, public access, suitability or permission for our proposed activity.",
      "",
      "Project purpose: " + answers.purpose,
      "Intended participants: " + answers.participants,
      "Community benefits: " + answers.benefits,
      "Water approach / questions: " + answers.water,
      "Soil restoration approach: " + answers.soil,
      "Ongoing maintenance approach: " + answers.maintenance,
      "",
      "Could you please confirm:",
      "1. The current ownership and responsible managing department for this site;",
      "2. Whether the proposed land use is permitted and what approvals or application steps are required;",
      "3. Whether water access is possible and what conditions apply;",
      "4. The maintenance and stewardship responsibilities expected of a community group; and",
      "5. The correct municipal contact and process for taking this enquiry forward.",
      "",
      "We will not begin work until ownership, permissions and responsibilities are confirmed. We would welcome guidance on the appropriate next step.",
      "",
      "Kind regards,",
      "[Your name / group]",
      "[Contact details]"
    ].join("\n");
    copyButton.disabled = false;
    enquiryPrepared = true;
    statusElement.classList.remove("error");
    document.getElementById("copy-status").textContent = "";
    updateReadiness();
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

  function loadReadiness() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("resourcewise-readiness") || "{}");
    } catch (error) {
      console.warn("Could not read the local readiness tracker:", error);
    }
    readinessInputs.forEach(function (input) {
      if (input.dataset.readiness === "site" || input.dataset.readiness === "enquiry") return;
      input.checked = Boolean(saved[input.dataset.readiness]);
      input.addEventListener("change", saveReadiness);
    });
    updateReadiness();
  }

  function saveReadiness() {
    const saved = {};
    readinessInputs.forEach(function (input) {
      if (input.dataset.readiness !== "site" && input.dataset.readiness !== "enquiry") {
        saved[input.dataset.readiness] = input.checked;
      }
    });
    try {
      localStorage.setItem("resourcewise-readiness", JSON.stringify(saved));
    } catch (error) {
      console.warn("Could not save the local readiness tracker:", error);
    }
    updateReadiness();
  }

  function updateReadiness() {
    const siteInput = document.querySelector('[data-readiness="site"]');
    const enquiryInput = document.querySelector('[data-readiness="enquiry"]');
    siteInput.checked = Boolean(selectedFeature);
    siteInput.disabled = true;
    enquiryInput.checked = enquiryPrepared;
    enquiryInput.disabled = true;
    const complete = readinessInputs.filter(function (input) { return input.checked; }).length;
    readinessCount.textContent = complete + " / " + readinessInputs.length;
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
      1: "Public open space", 9: "District park",
      10: "Community park", 11: "Greenbelt"
    };
    return types[code] || "City mapped park type " + code;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
})();
