import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const CurrentLocation = ({
  onLocationFound,
  onError,
  ignoreResult,
  enabled = true,
}) => {
  const map = useMap();
  const requestedRef = useRef(false);

  useEffect(() => {
    // Don't request location when disabled
    if (!enabled) {
      return;
    }

    // Prevent repeated location requests
    if (requestedRef.current) {
      return;
    }

    requestedRef.current = true;

    console.log("Requesting browser location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const {
          latitude,
          longitude,
          accuracy,
        } = position.coords;

        console.log("GPS SUCCESS");
        console.log("Latitude:", latitude);
        console.log("Longitude:", longitude);
        console.log(
          "Accuracy:",
          accuracy,
          "meters"
        );

        // If the user has already searched for
        // an address manually, don't overwrite it
        // with the GPS result.
        if (ignoreResult && ignoreResult()) {
          console.log(
            "GPS result ignored - manual location is already selected"
          );
          return;
        }

        // Move map to current location
        map.setView(
          [latitude, longitude],
          16
        );

        // Send location data to SolarMap
        onLocationFound?.({
          latitude,
          longitude,
          accuracy,
        });
      },

      (error) => {
        // Permission denial (code 1) is a normal user choice — log as info,
        // not error.  Actual failures (timeout, position unavailable) stay
        // as warnings so developers can still diagnose issues.
        if (error.code === 1) {
          console.info("GPS: User denied location access");
        } else {
          console.warn("GPS Error — Code:", error.code, "Message:", error.message);
        }

        // Surface the failure so the parent component can warn the user
        // (e.g. when location services are turned off on their device).
        onError?.(error);
      },

      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );
  }, [
    map,
    onLocationFound,
    onError,
    ignoreResult,
    enabled,
  ]);

  return null;
};

export default CurrentLocation;