import React from 'react';
import './App.css';
import { Route, Routes } from 'react-router-dom';

import ProtectedRoute from '../Auth/ProtectedRoute';
import { AuthProvider } from '../../context/AuthContext';
import LogIn from '../Login/LogIn';
import NavBar from '../NavBar/navbar';
import Footer from '../Footer/Footer';
import Home from '../Pages/Home';
import Help from '../Pages/Help';
import Contact from '../Pages/Contact';
import Trial from '../Pages/Trial';
import Results from '../Pages/Results';
import IoTesting from '../Pages/IoTesting';
import PresetManager from '../PresetManager/preset_manager';
import NotFoundPage from '../404Page/404';
import Register from '../Register/Register';
import Admin from '../Pages/Admin';
import { useEffect } from 'react';
import {
  connectPresenceSocket,
  disconnectPresenceSocket,
} from '../../utilities/presenceClient';



function App() {
  useEffect(() => {
    connectPresenceSocket();
    return () => {
      disconnectPresenceSocket();
    };
  }, []);
  
  return (
    <AuthProvider>
      <div className="app-shell">
        <NavBar />
        <main className="app-route-surface">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/Home" element={<Home />} />
            <Route path="/Help" element={<Help />} />
            <Route path="/About" element={<Contact />} />
            <Route path="/Contact" element={<Contact />} />
            <Route path="/LogIn" element={<LogIn />} />
            <Route path="/Register" element={<Register />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/IoTesting" element={<IoTesting />} />
              <Route path="/Trial" element={<Trial />} />
              <Route path="/Results" element={<Results />} />
              <Route path="/PresetManager" element={<PresetManager />} />
            </Route>

            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/Admin" element={<Admin />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default App;
