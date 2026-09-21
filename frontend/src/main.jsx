import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { Web3Provider } from "./context/Web3Context.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Web3Provider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Web3Provider>
    </BrowserRouter>
  </React.StrictMode>
);
