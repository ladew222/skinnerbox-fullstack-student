import React, { useContext } from 'react'; // Import the React library to use JSX and component features
import { Link } from 'react-router-dom';

import './NavBar.css'; // Import custom CSS for styling the NavBar component
import logo from './RGB_Horizontal_A_Logo.png'; // Import the logo image to be used in the navbar

function NavBar() { {/* Defining the NavBar component */}
    
    return (
        <div> {/* Wrapper div for the entire navbar */}
            <nav className="navbar navbar-expand-lg bg-body-tertiary" style={{ backgroundColor: '#e3f2fd' }}> 
                {/* Bootstrap navbar with background color defined inline */}
                <div className="container-fluid d-flex justify-content-between"> 
                    {/* Container to hold all navbar content, with 'd-flex' to align items horizontally */}
                    <a className="navbar-brand d-flex align-items-center" href="/">
                        {/* Navbar brand containing the logo, with 'd-flex' and 'align-items-center' to vertically center the content */}
                        <img className='NavBarLogo' src={logo} alt='Logo' /> 
                        {/* Image element to display the logo with alt text for accessibility */}
                    </a>

                    <div className="collapse navbar-collapse" id="navbarTogglerDemo02">
                        {/* Collapsible navbar content that will toggle on smaller screens */}
                        <ul className="navbar-nav me-auto mb-2 mb-lg-0 d-flex align-items-center">
                            {/* Unordered list for navigation items, using Bootstrap classes to align items horizontally */}
                            <li className="nav-item"> {/* List item for the first navigation link */}
                                <Link className="nav-link" aria-current="page" to="/IoTesting">Test I/O</Link>
                                {/* 'Home' link, marked as active to indicate it's the current page */}
                            </li>
                            <li className="nav-item"> {/* List item for the second navigation link */}
                                <Link className="nav-link" aria-current="page" to="/Trial">Run a Trial</Link>
                                {/* 'Link' text for another navigation option */}
                            </li>
                            <li className="nav-item"> {/* List item for the second navigation link */}
                                <Link className="nav-link" aria-current="page" to="/Results">Results</Link>
                                {/* 'Link' text for another navigation option */}
                            </li>

                            <li className="nav-item"> {/* List item for the second navigation link */}
                                <Link className="nav-link" aria-current="page" to="/PresetManager">Preset Manager</Link>
                                {/* 'Link' text for another navigation option */}
                            </li>
                        </ul>
                        
                        <ul className="navbar-nav ms-auto mb-2 mb-lg-0 d-flex align-items-center">
                            <li className="nav-item">
                                <Link className="nav-link" aria-current="page" to="/Contact">Contact Us</Link>
                            </li>
                            <li className="nav-item">
                                <Link className="nav-link" aria-current="page" to="/LogIn">Log In</Link>
                            </li>
                        </ul>
                    </div>

                    <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarTogglerDemo02" aria-controls="navbarTogglerDemo02" aria-expanded="false" aria-label="Toggle navigation">
                        {/* Toggler button for collapsing and expanding the navbar on small screens */}
                        <span className="navbar-toggler-icon"></span> {/* Icon displayed for the toggle button */}
                    </button>

                    {/* Centering "Skinner Box" with absolute positioning */}
                    <a className="navbar-brand position-absolute start-50 translate-middle" href="/" style={{ top: '50%' }}>
                        Skinner Box
                    </a>
                    {/* 'position-absolute' positions the link absolutely inside the parent, 'start-50' centers horizontally, 'translate-middle-x' shifts the element to center exactly */}
                </div>
            </nav>
        </div>
    );
}

export default NavBar; // Export the NavBar component so it can be used in other parts of the app
