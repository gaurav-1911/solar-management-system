import { useCallback, useEffect, useRef, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import CurrentLocation from "./CurrentLocation";
import { getAddressFromCoordinates, getCoordinatesFromAddress, getAddressSuggestions } from "../../utils/geocoding";
import MapClickHandler from "./MapClickHandler";
import "./SolarMap.css";

// Recenter the map whenever a new position arrives (GPS, map click, or
// address search).
const MapViewUpdater = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position && position.latitude != null && position.longitude != null) {
      map.setView([position.latitude, position.longitude], 16);
    }
  }, [map, position]);
  return null;
};

const SolarMap = ({
  onLocationFound,
  height = 300,
  showCoords = true,
  initialPosition,
}) => {
  // When a saved location exists (editing an existing record) the map starts
  // there instead of auto-requesting GPS and overwriting the stored values.
  const hasInitial = Boolean(
    initialPosition &&
      initialPosition.latitude != null &&
      initialPosition.longitude != null
  );

  const [location, setLocation] = useState(
    hasInitial
      ? {
          latitude: initialPosition.latitude,
          longitude: initialPosition.longitude,
        }
      : {
          latitude: null,
          longitude: null,
        }
  );

  const [address, setAddress] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Once the user searches for an address manually, ignore a still-pending
  // GPS result so it can't overwrite the chosen location.
  const searchLockRef = useRef(false);

  const [addressQuery, setAddressQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsWarning, setGpsWarning] = useState("");

  // Address autocomplete suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const suggestionTimerRef = useRef(null);
  // Nominatim allows ~1 request/second, so suggestion requests are serialized
  // (one in flight at a time, latest query queued) and stale responses are
  // ignored via a sequence counter.
  const suggestionFetchingRef = useRef(false);
  const suggestionPendingRef = useRef(null);
  const suggestionSeqRef = useRef(0);

  // Clear any pending suggestion request when the map unmounts
  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  const describeGpsError = useCallback((error) => {
    const code = error && error.code;
    if (code === 1) {
      return "Location access was denied. Please allow location permission in your browser, then try again.";
    }
    if (code === 2) {
      return "Your device location is turned off. Please enable Location/GPS, then try again.";
    }
    if (code === 3) {
      return "Location request timed out. Please check your connection and try again.";
    }
    return "Could not get your location. Please enable Location/GPS on your device and try again.";
  }, []);

  const handleGpsError = useCallback(
    (error) => {
      setGpsWarning(describeGpsError(error));
    },
    [describeGpsError]
  );

  // Stable check used by CurrentLocation to drop late GPS results after a
  // manual address search.
  const ignoreGpsResult = useCallback(() => searchLockRef.current, []);

  const handleLocationFound = useCallback(
    async (coordinates) => {
      console.log("Received coordinates:", coordinates);

      setGpsWarning("");

      const { latitude, longitude, accuracy } = coordinates;

      // Store coordinates (keep the GPS accuracy so the UI can warn when the
      // fix is too imprecise to trust).
      setLocation({
        latitude,
        longitude,
        accuracy,
      });

      // Start address lookup
      setLoadingAddress(true);

      try {
        const data = await getAddressFromCoordinates(
          latitude,
          longitude
        );

        console.log("Address response:", data);

        const addressData = data?.address || {};

        const formattedLocation = {
          latitude,
          longitude,
          accuracy,

          address: data?.display_name || "",

          houseNumber:
            addressData.house_number || "",

          street:
            addressData.road || "",

          area:
            addressData.suburb ||
            addressData.neighbourhood ||
            addressData.village ||
            "",

          city:
            addressData.city ||
            addressData.town ||
            addressData.village ||
            "",

          state:
            addressData.state || "",

          pincode:
            addressData.postcode || "",

          country:
            addressData.country || "",
        };

        // Store address information
        setAddress(formattedLocation);

        // Send complete location to parent
        onLocationFound?.(formattedLocation);
      } catch (error) {
        console.error(
          "Failed to fetch address:",
          error
        );

        // Still send coordinates even if address lookup fails
        onLocationFound?.({
          latitude,
          longitude,
          accuracy,
          address: "",
          houseNumber: "",
          street: "",
          area: "",
          city: "",
          state: "",
          pincode: "",
          country: "",
        });
      } finally {
        setLoadingAddress(false);
      }
    },
    [onLocationFound]
  );

  // Request the browser's current position on demand ("Locate me") — used when
  // an existing saved location is shown instead of auto-detecting GPS.
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsWarning("This browser doesn't support location access. Please use the address search or click the map to set a location.");
      return;
    }
    if (locating) return;
    setLocating(true);
    setGpsWarning("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Latitude:", position.coords.latitude);
        console.log("Longitude:", position.coords.longitude);
        console.log("Accuracy:", position.coords.accuracy, "meters");
        setLocating(false);
        handleLocationFound({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error("GPS ERROR");
        console.error("Code:", error.code);
        console.error("Message:", error.message);
        setLocating(false);
        handleGpsError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [handleLocationFound, locating, handleGpsError]);

  // Fetch address suggestions as the user types (debounced to avoid spamming
  // the Nominatim API on every keystroke).
  const fetchSuggestions = useCallback(async (query) => {
    const q = query.trim();
    // Only look up once the user has typed enough to be meaningful — very short
    // prefixes usually return nothing and just burn Nominatim's rate limit.
    if (q.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionIndex(-1);
      return;
    }
    // Never run two suggestion requests at once; remember the latest query and
    // run it when the in-flight request finishes.
    if (suggestionFetchingRef.current) {
      suggestionPendingRef.current = q;
      return;
    }
    suggestionFetchingRef.current = true;
    const seq = ++suggestionSeqRef.current;
    setSearching(true);
    try {
      const results = await getAddressSuggestions(q, 8);
      if (seq !== suggestionSeqRef.current) return; // a newer query superseded this one
      if (!results || results.length === 0) {
        setSuggestions([]);
        setSuggestionIndex(-1);
        setSuggestionMessage("No matching places found. Try a more specific address.");
        setShowSuggestions(true);
      } else {
        setSuggestions(
          results.map((r) => ({
            label: r.display_name,
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lon),
          }))
        );
        setSuggestionIndex(-1);
        setSuggestionMessage("");
        setShowSuggestions(true);
      }
    } catch (err) {
      console.warn("Address suggestions failed:", err?.message);
      if (seq !== suggestionSeqRef.current) return;
      setSuggestions([]);
      setSuggestionIndex(-1);
      setSuggestionMessage("Couldn't load suggestions right now. Keep typing or press Search.");
      setShowSuggestions(true);
    } finally {
      suggestionFetchingRef.current = false;
      if (seq === suggestionSeqRef.current) setSearching(false);
      const pending = suggestionPendingRef.current;
      suggestionPendingRef.current = null;
      if (pending) fetchSuggestions(pending);
    }
  }, []);

  // Pin the map + fill the parent form for a chosen suggestion.
  const selectSuggestion = (suggestion) => {
    setAddressQuery(suggestion.label);
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggestionIndex(-1);
    searchLockRef.current = true;
    handleLocationFound({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
  };

  const handleAddressSearch = async () => {
    const query = addressQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError("");
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const result = await getCoordinatesFromAddress(query);
      if (!result) {
        setSearchError("No location found for that address. Please try a different one.");
        return;
      }
      searchLockRef.current = true;
      // Reuse the normal flow: it stores the coordinates, reverse-geocodes
      // them, and notifies the parent form.
      await handleLocationFound({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
      });
    } catch (err) {
      console.error("Address search failed:", err?.message);
      setSearchError("Could not find that address. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowSuggestions(true);
      setSuggestionIndex((i) => (suggestions.length ? (i + 1) % suggestions.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionIndex((i) => (suggestions.length ? (i - 1 + suggestions.length) % suggestions.length : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (showSuggestions && suggestionIndex >= 0 && suggestions[suggestionIndex]) {
        selectSuggestion(suggestions[suggestionIndex]);
      } else {
        handleAddressSearch();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSuggestionIndex(-1);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* A plain div (not a <form>) so this never triggers the outer page
          form's submit and reloads the whole website when searching. */}
      <div className="solar-map-search" role="search">
        <div className="solar-map-search-input-wrap">
          <input
            type="text"
            value={addressQuery}
            onChange={(e) => {
              const value = e.target.value;
              setAddressQuery(value);
              setSearchError("");
              if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
              suggestionTimerRef.current = setTimeout(() => fetchSuggestions(value), 400);
            }}
            onKeyDown={handleSearchKeyDown}
            onBlur={() => {
              // Small delay so a suggestion click (mousedown) wins over blur.
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder="Search address or place to get location"
            aria-label="Search address or place"
            autoComplete="off"
          />
          {showSuggestions &&
            (suggestions.length > 0 ? (
              <ul className="solar-map-suggestions">
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.latitude},${s.longitude}-${i}`}
                    className={`solar-map-suggestion ${i === suggestionIndex ? "active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    onMouseEnter={() => setSuggestionIndex(i)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>{s.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              addressQuery.trim().length >= 3 && (
                <ul className="solar-map-suggestions">
                  <li className="solar-map-suggestion-empty">{suggestionMessage}</li>
                </ul>
              )
            ))}
        </div>
        <button type="button" onClick={handleAddressSearch} disabled={searching || !addressQuery.trim()}>
          {searching ? (
            <span className="solar-map-search-spinner" aria-hidden="true" />
          ) : (
            "Search"
          )}
        </button>
        <button
          type="button"
          className="solar-map-locate"
          onClick={requestGps}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? (
            <span className="solar-map-search-spinner" aria-hidden="true" />
          ) : (
            "Locate me"
          )}
        </button>
      </div>
      {searchError && <p className="solar-map-search-error">{searchError}</p>}
      {gpsWarning && <p className="solar-map-location-warning">⚠️ {gpsWarning}</p>}

      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{
          height: `${height}px`,
          width: "100%",
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CurrentLocation
          onLocationFound={handleLocationFound}
          ignoreResult={ignoreGpsResult}
          enabled={!hasInitial}
        />
        <MapClickHandler
          onLocationSelected={handleLocationFound}
        />
        <MapViewUpdater position={location} />
        {location.latitude !== null &&
          location.longitude !== null && (
            <Marker
              position={[
                location.latitude,
                location.longitude,
              ]}
            >
              <Popup>
                Current Location
              </Popup>
            </Marker>
          )}
      </MapContainer>

      {showCoords && (
        <div>
          <p>
            Latitude:{" "}
            {location.latitude ?? "Detecting..."}
          </p>

          <p>
            Longitude:{" "}
            {location.longitude ?? "Detecting..."}
          </p>

          <p>
            Accuracy:{" "}
            {location.accuracy != null
              ? `± ${Math.round(location.accuracy)} m`
              : "—"}
          </p>

          <p>
            Address:{" "}
            {loadingAddress
              ? "Finding address..."
              : address?.address || "Address not found"}
          </p>
        </div>
      )}
      {location.accuracy != null && location.accuracy > 100 && (
        <p className="solar-map-accuracy-warning">
          ⚠️ GPS accuracy is ±{Math.round(location.accuracy)} m — the pin may not
          be exactly where you are. Use the address search or click the map to
          set it precisely.
        </p>
      )}
    </div>
  );
};

export default SolarMap;