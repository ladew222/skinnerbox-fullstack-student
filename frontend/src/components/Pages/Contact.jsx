import React from 'react';

import './Pages.css'; // Import custom CSS for styling the NavBar component
import VuLogo from './RGB_Vertical_Viterbo_Logo.png';

function Contact() {
    return (
        <div className="container text-center" align-items="center">
            <div className="center">
            <img className='VuLogo' src={VuLogo} alt='VuLogo'/>
                <br></br>
                <br></br>

                <h1>Contact Us</h1>
                <p>
                    For any questions or concerns, please email us at the address below.
                    <br></br>
                    Contact email: egweinberg@viterbo.edu
                </p>
            </div>
        </div>
    );
}

export default Contact;