import React from 'react';
import { Link } from 'react-router-dom';

import './Footer.css'; // Import the CSS styles for the footer component

/**
 * Footer Component
 * 
 * A reusable footer component that displays copyright information and key navigation.
 */
function Footer() {
    return (
        <div>
            <footer className="footer">
                <div className='footer-container'>
                    <p>© {new Date().getFullYear()} Viterbo University. All rights reserved.</p>

                    <ul className="footer-links">
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/Help">Help</Link></li>
                        <li><Link to="/LogIn">Log In</Link></li>
                        <li><Link to="/About">About Us</Link></li>
                    </ul>
                </div>
            </footer>
        </div>
    );
}

export default Footer;
