import React from 'react';
import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import LogIn from '../Login/LogIn'
import NavBar from '../NavBar/navbar';
import Footer from '../Footer/Footer';
import Home from '../Pages/Home';
import Contact from '../Pages/Contact';
import Trial from '../Pages/Trial';
import Results from '../Pages/Results';
import IoTesting from '../Pages/IoTesting';
import PresetManager from '../PresetManager/preset_manager';
import NotFoundPage from '../404Page/404';
import Register from "../Register/Register"

function App() {
  return (
    <div>
      <NavBar />
      <div className="container">
        <Routes>
          <Route path= '/' element= {<Home />} />
          <Route path= '/Home' element={<Home />} />
          <Route path= "IoTesting" element= {<IoTesting />} />
          <Route path= "Trial" element= {<Trial />} />
          <Route path= "Results" element= {<Results />} />
          <Route path= "Contact" element= {<Contact />} />
          <Route path= "LogIn" element= {<LogIn />} />
          <Route path = "Register" element = {<Register />} />
          {/* TODO: Finish Creating the Preset Manager Component */}
          <Route path="PresetManager" element={<PresetManager />} />
          {/* TODO: Finish Creating the 404*/}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

export default App;