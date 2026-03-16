import React from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import './Pages.css';
import InfoSKBox from '../../assets/InfoSKBox.png';
import InfoSkbox3 from '../../assets/InfoSkbox3.png';
import Mouse1 from '../../assets/Mouse1.png';
import Researchers from '../../assets/Researchers.png';
import VuLogo from './RGB_Vertical_Viterbo_Logo.png';

function Home() {
    const { isAuthenticated } = useAuth();

    return (
        <div className="home-page">
            <section className="home-hero-band">
                <div className="home-shell home-hero-layout">
                    <div className="home-hero-content">
                        <p className="home-eyebrow">Behavioral Trial Control</p>
                        <h1>SkinnerBox Trial Control</h1>
                        <p className="home-lead">
                            Run authenticated behavioral experiments from one place. The backend handles timing,
                            valid-response counting, reward delivery, and automatic stop conditions while the frontend
                            gives operators a clear workflow for setup, live monitoring, and saved results.
                        </p>
                        <div className="home-cta-row">
                            {isAuthenticated ? (
                                <>
                                    <Link className="home-primary-link" to="/Trial">
                                        Run a Trial
                                    </Link>
                                    <Link className="home-secondary-link" to="/IoTesting">
                                        I/O Config
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link className="home-primary-link" to="/LogIn">
                                        Log In
                                    </Link>
                                    <Link className="home-secondary-link" to="/Register">
                                        Request Access
                                    </Link>
                                </>
                            )}
                            <Link className="home-tertiary-link" to="/About">
                                About Us
                            </Link>
                        </div>
                    </div>

                    <div className="home-hero-media">
                        <div className="home-hero-photo-frame">
                            <img className="home-hero-photo" src={Researchers} alt="Researchers reviewing behavioral data" />
                        </div>
                    </div>
                </div>
            </section>

            <section className="home-directions-band">
                <div className="home-shell home-directions-layout">
                    <div className="home-directions-copy">
                        <p className="home-eyebrow">How To Use The System</p>
                        <h2>One workflow from setup to saved results</h2>
                        <p className="home-directions-lead">
                            Start by signing in with an approved account. Use <strong>I/O Config</strong> to confirm sensors, lights,
                            buzzer, and pump behavior before a live trial. Then move to <strong>Trial</strong> to load a preset or enter
                            the settings for the run you want to perform.
                        </p>
                        <p className="home-directions-lead">
                            Once a trial starts, the backend controls the timer, counts valid responses, delivers rewards, and decides when the run should stop.
                            Afterward, open <strong>Results</strong> to review saved trials, see who conducted them, and export CSV data.
                        </p>
                        <div className="home-direction-list">
                            <div className="home-direction-item">
                                <span className="home-direction-number">1</span>
                                <p>Sign in and confirm you have the access level you need.</p>
                            </div>
                            <div className="home-direction-item">
                                <span className="home-direction-number">2</span>
                                <p>Check the box hardware in real time and prime the pump if needed.</p>
                            </div>
                            <div className="home-direction-item">
                                <span className="home-direction-number">3</span>
                                <p>Configure the trial and let the backend run the experiment logic.</p>
                            </div>
                            <div className="home-direction-item">
                                <span className="home-direction-number">4</span>
                                <p>Review, compare, and export the saved run data.</p>
                            </div>
                        </div>
                    </div>

                    <div className="home-directions-note">
                        <img className="home-brand-mark" src={VuLogo} alt="Viterbo University logo" />
                        <p>
                            Designed to support repeatable behavioral experiments, operator accountability,
                            and easier review of outcomes after each run.
                        </p>
                    </div>
                </div>
            </section>

            <section className="home-highlights-band">
                <div className="home-shell">
                    <div className="home-highlights-header">
                        <p className="home-eyebrow">Highlights</p>
                        <h2>Research-facing views of the system</h2>
                    </div>
                    <div className="home-panel-grid">
                        <article className="home-panel-card">
                            <img
                                className="home-panel-image"
                                src={InfoSKBox}
                                alt="Illustration of a Skinner box with experimental data graphics"
                            />
                            <div className="home-panel-body">
                                <p className="home-panel-kicker">Controlled Setup</p>
                                <h3>Repeatable trial conditions</h3>
                                <p>
                                    The system supports clearly defined settings so researchers can run structured trials under consistent conditions.
                                </p>
                            </div>
                        </article>

                        <article className="home-panel-card">
                            <img
                                className="home-panel-image"
                                src={Mouse1}
                                alt="Rodent interacting with the Skinner box control hardware"
                            />
                            <div className="home-panel-body">
                                <p className="home-panel-kicker">Live Tracking</p>
                                <h3>Behavior data as it happens</h3>
                                <p>
                                    Lever presses, nose pokes, rewards, elapsed time, and time remaining can be followed while the experiment is running.
                                </p>
                            </div>
                        </article>

                        <article className="home-panel-card">
                            <img
                                className="home-panel-image"
                                src={InfoSkbox3}
                                alt="Illustration of behavioral results and analysis around a Skinner box"
                            />
                            <div className="home-panel-body">
                                <p className="home-panel-kicker">Result Review</p>
                                <h3>Saved runs ready for export</h3>
                                <p>
                                    Results include trial settings, outcome data, and operator information so runs are easier to review and share later.
                                </p>
                            </div>
                        </article>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Home;
