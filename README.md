# ResourceWise

ResourceWise is a lightweight regenerative land-opportunity guide for African cities, beginning with a Cape Town pilot. African urban communities face underused land, degraded soil, food insecurity, unemployment and organic waste that could instead nourish the soil. The app helps people explore City-mapped public green spaces, shape a community idea and prepare a municipal enquiry before taking action.

## Ubuntu and regeneration

ResourceWise is inspired by Ubuntu: care for land and people is reciprocal, and knowledge and benefits grow through community. A regenerative circular economy returns organic waste to soil, supports local food and livelihoods, and shares stewardship. Cape Town is the first pilot; the approach could expand to other African cities with their own verified public-land datasets and local partners.

## Technology and data

The app is static HTML, CSS and JavaScript with Leaflet (CDN), OpenStreetMap tiles and the City of Cape Town ArcGIS FeatureServer Parks layer. The browser requests GeoJSON for a bounded Cape Town area and a limited set of mapped public-open-space/park types. No account, backend, paid service, API key or analytics is used.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static file server (for example, `python -m http.server 8000`) and visit `http://localhost:8000`. A local server is recommended for consistent clipboard behavior. An internet connection is required for Leaflet, map tiles, fonts and municipal data.

## Deploy

Deploy this folder as a static site on GitHub Pages or Cloudflare Pages; no build step is required. Keep `index.html`, `style.css`, `app.js` and `README.md` together at the published site root.

## Use the application

1. Explore the Cape Town map and select one of the returned official sites using its polygon or the site list.
2. Choose a regenerative opportunity and describe its purpose, participants, benefits, water, soil and maintenance approach.
3. Generate an editable municipal enquiry, review it, then copy it to contact the appropriate City team yourself. The app never sends email.
4. Track research and preparation steps on this device, and use the learning links to explore composting, soil regeneration and seed saving.

The readiness tracker is client-side only and stored in this browser. It records preparation, not municipal approval.

## Limitations and permissions

The map displays only records returned by the City's Parks layer; the query is limited to 1,000 features in the Cape Town bounding area. A listed or mapped site is not evidence that land is available, publicly accessible, approved or suitable for cultivation. Confirm current ownership, permitted use, approvals, water access and maintenance responsibilities with the City before any activity. Data availability depends on the City service and browser connectivity. ResourceWise does not replace municipal advice or site assessment.

## AI token minimization methods
Used one focused implementation pass and avoided repeated repository exploration.
Queried only the official layer metadata needed to build the map integration.
Kept dependencies to existing static files and CDN libraries; did not spawn agents.
