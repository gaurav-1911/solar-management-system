// ==========================================
// Reverse Geocoding
// Latitude + Longitude → Address
// ==========================================
export const getAddressFromCoordinates = async (
  latitude,
  longitude
) => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${latitude}` +
      `&lon=${longitude}` +
      `&format=jsonv2` +
      `&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Reverse geocoding failed: ${response.status}`
      );
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      "Reverse geocoding error:",
      error
    );

    throw error;
  }
};


// ==========================================
// Forward Geocoding
// Address → Latitude + Longitude
// ==========================================
export const getCoordinatesFromAddress = async (
  address
) => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(address)}` +
      `&format=jsonv2` +
      `&addressdetails=1` +
      `&limit=1`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Forward geocoding failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  } catch (error) {
    console.error(
      "Forward geocoding error:",
      error
    );

    throw error;
  }
};


// ==========================================
// Address Suggestions (Autocomplete)
// Address fragment → list of matching places
// ==========================================
export const getAddressSuggestions = async (
  address,
  limit = 5
) => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(address)}` +
      `&format=jsonv2` +
      `&addressdetails=1` +
      `&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Address suggestions failed: ${response.status}`
      );
    }

    const data = await response.json();

    return data || [];
  } catch (error) {
    console.error(
      "Address suggestions error:",
      error
    );

    throw error;
  }
};