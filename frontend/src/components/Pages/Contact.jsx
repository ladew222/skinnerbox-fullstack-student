import React from 'react';

import './Pages.css'; // Import custom CSS for styling the NavBar component
import HawkWorksLogo from '../../assets/hawkworks-logo.png';

const HAWK_WORKS_URL = 'https://www.viterbo.edu/engineering/hawk-works';


function Contact() {
    return (
        <div className="container about-page">
            <div className="about-card">
                <img className='about-logo' src={HawkWorksLogo} alt='HAWK WORKS logo'/>

                <h1>About Us</h1>

                <p className="about-lead">
                    This Skinner Box application was created through{' '}
                    <a href={HAWK_WORKS_URL} target="_blank" rel="noreferrer">
                        HAWK WORKS at Viterbo University
                    </a>.
                </p>

                <div className="about-section">
                    <p>
                        HAWK WORKS stands for <strong>Holistic Alliances Whose Knowledge Will Offer Resources for Kickstarting Success</strong>.
                        It brings together students and faculty from different disciplines to identify needs, design solutions,
                        and grow strong ideas into practical projects with broader community impact.
                    </p>
                </div>

                <div className="about-section">
                    <p>
                        This project reflects that mission by combining technical development with real-world problem solving at
                        Viterbo University.
                    </p>
                </div>

                <div className="about-section">
                    <p>
                        Learn more about the program on the official HAWK WORKS page.
                    </p>
                    <a className="about-link-button" href={HAWK_WORKS_URL} target="_blank" rel="noreferrer">
                        Visit the Official HAWK WORKS Page
                    </a>
                </div>
            </div>
        </div>
    );
}

export default Contact;
