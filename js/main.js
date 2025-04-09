// Initialize the map
const map = L.map('map').setView([0.5070677, 101.4477793], 12); // Pekanbaru coordinates

// Layer groups
const baseLayers = {};
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialize base layers
baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
});

baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri'
});

// Set default base layer
baseLayers.osm.addTo(map);

let currentMetadata = null;
let drawingEnabled = false;

// Initialize drawing controls
const drawControl = new L.Control.Draw({
    draw: {
        marker: false,
        circlemarker: false,
        circle: false,
        rectangle: {
            shapeOptions: {
                color: '#2196F3'
            }
        },
        polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
                color: '#2196F3'
            },
            drawError: {
                color: '#e1e100',
                timeout: 1000
            },
            guidelineDistance: 20,
            minPoints: 4,
            metric: true,
            feet: false,
            nautic: false,
            precision: {
                km: 2,
                m: 1
            }
        },
        polyline: false
    },
    edit: {
        featureGroup: drawnItems,
        remove: true,
        poly: {
            allowIntersection: false
        }
    }
});

// Custom draw control button
L.Control.DrawButton = L.Control.extend({
    onAdd: function(map) {
        const button = L.DomUtil.create('button', 'draw-button');
        button.innerHTML = 'Create Polygon';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.margin = '10px';

        L.DomEvent.on(button, 'click', function() {
            showMetadataModal();
        });

        return button;
    }
});

map.addControl(new L.Control.DrawButton({ position: 'topleft' }));

// Handle base layer changes
document.getElementById('baseLayer').addEventListener('change', function(e) {
    Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
    baseLayers[e.target.value].addTo(map);
});

// Handle drawing events
map.on('draw:created', function(e) {
    const layer = e.layer;
    
    // Apply metadata and styling
    layer.setStyle({
        color: currentMetadata.color,
        fillColor: currentMetadata.color
    });
    layer.metadata = currentMetadata;
    
    // Add to feature group
    drawnItems.addLayer(layer);
    
    // Add interactions to the new polygon
    addPolygonInteractions(layer);
    
    // Reset drawing state
    currentMetadata = null;
    drawingEnabled = false;
    map.removeControl(drawControl);
});

// Modal handling
const modal = document.getElementById('metadataModal');
const form = document.getElementById('polygonMetadataForm');

function showMetadataModal() {
    modal.style.display = 'block';
}

function hideMetadataModal() {
    modal.style.display = 'none';
    form.reset();
}

function cancelPolygonCreation() {
    hideMetadataModal();
    if (drawingEnabled) {
        map.removeControl(drawControl);
        drawingEnabled = false;
    }
    currentMetadata = null;
}

form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Store metadata
    currentMetadata = {
        name: document.getElementById('polygonName').value,
        type: document.getElementById('polygonType').value,
        color: document.getElementById('polygonColor').value,
        description: document.getElementById('polygonDescription').value
    };
    
    // Hide modal and enable drawing
    hideMetadataModal();
    
    // Update drawing control colors
    const options = drawControl.options.draw;
    options.polygon.shapeOptions.color = currentMetadata.color;
    options.rectangle.shapeOptions.color = currentMetadata.color;
    
    // Add drawing control and enable drawing
    map.addControl(drawControl);
    drawingEnabled = true;
    
    // Automatically start polygon drawing
    new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
});

// Save polygons to GeoJSON file
function savePolygons() {
    const features = [];
    drawnItems.eachLayer(layer => {
        if (layer instanceof L.Polygon) {
            const coords = layer.getLatLngs()[0].map(latLng => [latLng.lng, latLng.lat]); // GeoJSON uses [lng, lat]
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords]
                },
                properties: layer.metadata || {}
            });
        }
    });

    if (features.length === 0) {
        alert('No polygons to save!');
        return;
    }

    const geojson = {
        type: 'FeatureCollection',
        features: features
    };

    // Create GeoJSON file
    const jsonStr = JSON.stringify(geojson, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = 'polygons.geojson';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Load polygons from GeoJSON file
function loadPolygons(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const geojson = JSON.parse(e.target.result);
            
            if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
                throw new Error('Invalid GeoJSON format');
            }

            // Clear existing polygons if any exist
            drawnItems.clearLayers();

            geojson.features.forEach(feature => {
                if (feature.geometry.type !== 'Polygon') {
                    console.warn('Skipping non-polygon feature:', feature);
                    return;
                }

                // Convert GeoJSON coordinates to Leaflet format
                const coords = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                
                const polygon = L.polygon(coords, {
                    color: feature.properties.color || '#2196F3',
                    fillColor: feature.properties.color || '#2196F3'
                });
                
                polygon.metadata = feature.properties;
                drawnItems.addLayer(polygon);
                
                // Add hover and click events
                addPolygonInteractions(polygon);
            });

            // Fit map to show all polygons
            if (geojson.features.length > 0) {
                map.fitBounds(drawnItems.getBounds());
            }
        } catch (error) {
            alert('Error loading polygons: ' + error.message);
        }
    };

    reader.onerror = function() {
        alert('Error reading file');
    };

    reader.readAsText(file);
    
    // Reset file input so the same file can be loaded again
    event.target.value = '';
}

// Add interactions to a polygon
function addPolygonInteractions(polygon) {
    let tooltip = null;
    
    // Show tooltip on hover
    polygon.on('mouseover', function(e) {
        const metadata = polygon.metadata || {};
        tooltip = L.tooltip({
            direction: 'top',
            permanent: false
        })
        .setContent(`
            <strong>${metadata.name || 'Unnamed Polygon'}</strong><br>
            Type: ${metadata.type || 'N/A'}<br>
            Click to edit
        `)
        .setLatLng(e.latlng)
        .openOn(map);
    });

    // Remove tooltip on mouseout
    polygon.on('mouseout', function() {
        if (tooltip) {
            map.closeTooltip(tooltip);
            tooltip = null;
        }
    });

    // Show details panel on click
    polygon.on('click', function() {
        showPolygonDetails(polygon);
    });
}

// Show polygon details in the side panel
function showPolygonDetails(polygon) {
    const metadata = polygon.metadata || {};
    document.getElementById('detailsName').value = metadata.name || '';
    document.getElementById('detailsType').value = metadata.type || 'residential';
    document.getElementById('detailsColor').value = metadata.color || '#2196F3';
    document.getElementById('detailsDescription').value = metadata.description || '';
    
    // Store reference to the selected polygon
    window.selectedPolygon = polygon;
    
    // Show the details panel
    document.getElementById('detailsPanel').classList.add('visible');
}

// Hide the details panel
function hideDetailsPanel() {
    document.getElementById('detailsPanel').classList.remove('visible');
    window.selectedPolygon = null;
}

// Delete the selected polygon
function deleteSelectedPolygon() {
    if (window.selectedPolygon) {
        drawnItems.removeLayer(window.selectedPolygon);
        hideDetailsPanel();
    }
}

// Handle details form submission
document.getElementById('polygonDetailsForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (window.selectedPolygon) {
        const metadata = {
            name: document.getElementById('detailsName').value,
            type: document.getElementById('detailsType').value,
            color: document.getElementById('detailsColor').value,
            description: document.getElementById('detailsDescription').value
        };
        
        // Update polygon metadata and style
        window.selectedPolygon.metadata = metadata;
        window.selectedPolygon.setStyle({
            color: metadata.color,
            fillColor: metadata.color
        });
        
        hideDetailsPanel();
    }
});

// Clear all polygons
function clearPolygons() {
    drawnItems.clearLayers();
}

// Add custom tile layer
function addCustomTileLayer() {
    const tileUrl = document.getElementById('tileUrl').value;
    if (!tileUrl) {
        alert('Please enter a tile server URL');
        return;
    }

    try {
        // Remove existing custom layer if any
        if (baseLayers.custom) {
            map.removeLayer(baseLayers.custom);
        }

        // Add new custom layer
        baseLayers.custom = L.tileLayer(tileUrl, {
            attribution: 'Custom Layer'
        });
        
        // Update base layer selector
        const baseLayerSelect = document.getElementById('baseLayer');
        if (!baseLayerSelect.querySelector('option[value="custom"]')) {
            const option = document.createElement('option');
            option.value = 'custom';
            option.text = 'Custom Layer';
            baseLayerSelect.add(option);
        }
        
        // Switch to custom layer
        Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
        baseLayers.custom.addTo(map);
        baseLayerSelect.value = 'custom';
    } catch (error) {
        alert('Error adding custom tile layer. Please check the URL format.');
    }
} 