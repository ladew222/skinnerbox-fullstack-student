import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import './NavBar.css';
import logo from '../../assets/hawkworks-logo.png';


function NavBar() {
  const { isAdmin, isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/LogIn');
  };

  return (
    <div>
      <nav className="navbar navbar-expand-lg bg-body-tertiary" style={{ backgroundColor: '#e3f2fd' }}>
        <div className="container-fluid d-flex justify-content-between">
          <Link className="navbar-brand d-flex align-items-center" to="/">
            <img className="NavBarLogo" src={logo} alt="Logo" />
          </Link>

          <div className="collapse navbar-collapse" id="navbarTogglerDemo02">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0 d-flex align-items-center">
              <li className="nav-item">
                <Link className="nav-link" aria-current="page" to="/Home">
                  Home
                </Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" aria-current="page" to="/Help">
                  Help
                </Link>
              </li>
              {isAuthenticated && (
                <>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/IoTesting">
                      I/O Config
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/Trial">
                      Run a Trial
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/Results">
                      Results
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/PresetManager">
                      Preset Manager
                    </Link>
                  </li>
                  {isAdmin && (
                    <li className="nav-item">
                      <Link className="nav-link" aria-current="page" to="/Admin">
                        Admin
                      </Link>
                    </li>
                  )}
                </>
              )}
            </ul>

            <ul className="navbar-nav ms-auto mb-2 mb-lg-0 d-flex align-items-center">
              <li className="nav-item">
                <Link className="nav-link" aria-current="page" to="/About">
                  About Us
                </Link>
              </li>
              {isAuthenticated ? (
                <>
                  <li className="nav-item">
                    <span className="nav-link">{user?.displayName || user?.email}</span>
                  </li>
                  <li className="nav-item">
                    <button className="nav-link btn btn-link" onClick={handleLogout} type="button">
                      Log Out
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/Register">
                      Register
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link className="nav-link" aria-current="page" to="/LogIn">
                      Log In
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarTogglerDemo02"
            aria-controls="navbarTogglerDemo02"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
        </div>
      </nav>
    </div>
  );
}


export default NavBar;
