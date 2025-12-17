import React from 'react'; // Import the React library to use JSX and component features
import { Link } from 'react-router-dom'; // Import Link component for client-side routing (currently unused)

import './Footer.css'; // Import the CSS styles for the footer component

/**
 * Footer Component
 * 
 * A reusable footer component that displays copyright information and navigation links.
 * This component appears at the bottom of pages and provides essential site navigation
 * and legal information.
 * 
 * @returns {JSX.Element} The rendered footer component
 */
function Footer() {
    return (
        <div>
            {/* Main footer element with semantic HTML */}
            <footer className="footer">
                {/* Container div for organizing footer content */}
                <div className='footer-container'>
                    {/* Copyright notice with dynamic year calculation */}
                    <p>© {new Date().getFullYear()} Viterbo University. All rights reserved.</p>
                    
                    {/* Navigation links list */}
                    <ul className="footer-links">
                        {/* Home page link */}
                        <li><a href="/">Home</a></li>
                        {/* Login page link */}
                        <li><a href="/LogIn">Log In</a></li>
                        {/* Contact page link */}
                        <li><a href="/Contact">Contact Us</a></li>
                    </ul>
                </div>
            </footer>
        </div>
    );
}

export default Footer;