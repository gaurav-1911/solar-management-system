import { useMapEvents } from "react-leaflet";

const MapClickHandler = ({ onLocationSelected }) => {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;

      console.log("Selected:", lat, lng);

      onLocationSelected({
        latitude: lat,
        longitude: lng,
      });
    },
  });

  return null;
};

export default MapClickHandler;