import React from 'react';

import './Pages.css'; // Import custom CSS for styling the NavBar component
import VuLogo from './RGB_Vertical_Viterbo_Logo.png';

function Home() {
    return (
        <div className="container text-center" align-items="center">
            <div className="center">
                <img className='VuLogo' src={VuLogo} alt='VuLogo'/>
                <br></br>
                <br></br>
                <h1>Welcome to the Skinner Box User Application</h1>
                <p>
                    <br></br>
                    To get started, go to the 'Trial' page by clicking 'Run a Trial'. Here, you can choose from existing tests or create a new one by setting your desired parameters.
                    <br></br>
                    <br></br>
                    To verify the functionality of the Skinner Box, go to the 'Test I/O' page. This section allows you to check all components and ensure everything is operational before running a trial.
                    <br></br>
                    <br></br>
                    To view and download test results, visit the 'Results' page. Here, you can review past trials by selecting a test card, which will display detailed results and let you download the data.
                </p>
            </div>
        </div>
    );
}

export default Home;