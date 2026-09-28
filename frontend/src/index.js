import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/ActionButtons.css";
import "./styles/CloseButtons.css";
import "./styles/Modal.css";
import "./styles/ViewModal.css";
import App from "./App";
import { initDateFieldClick } from "./utils/dateFieldClick";
import "leaflet/dist/leaflet.css";

// Let users open any date field's picker by clicking anywhere in it,
// not just on the small calendar icon.
initDateFieldClick();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
