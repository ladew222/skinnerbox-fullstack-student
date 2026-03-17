import React from 'react';
import { Link } from 'react-router-dom';

import './Pages.css';

function Help() {
    return (
        <div className="help-page">
            <section className="help-hero-band">
                <div className="home-shell help-hero-layout">
                    <div className="help-hero-copy">
                        <p className="home-eyebrow">Operator Help</p>
                        <h1>Using SkinnerBox</h1>
                        <p className="help-lead">
                            This page is the in-app quick guide for running trials, checking hardware,
                            reviewing results, and knowing when an administrator is needed.
                        </p>
                        <div className="home-cta-row">
                            <Link className="home-primary-link" to="/Trial">
                                Run a Trial
                            </Link>
                            <Link className="home-secondary-link" to="/IoTesting">
                                I/O Config
                            </Link>
                            <Link className="home-tertiary-link" to="/Results">
                                Results
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="help-content-band">
                <div className="home-shell help-content-layout">
                    <article className="help-card">
                        <h2>Normal Workflow</h2>
                        <ol className="help-step-list">
                            <li>Sign in with an approved account.</li>
                            <li>Open <strong>I/O Config</strong> to check lever, nose poke, pump, light, and buzzer behavior.</li>
                            <li>Open <strong>Run a Trial</strong> and load a preset or enter trial settings manually.</li>
                            <li>Start the trial and monitor the live status during the run.</li>
                            <li>If that box has an optional USB camera, use <strong>Show Camera</strong> for a quick visual check.</li>
                            <li>Open <strong>Results</strong> to review saved trials, notes, charts, and exports.</li>
                        </ol>
                    </article>

                    <article className="help-card">
                        <h2>I/O Config</h2>
                        <ul className="help-list">
                            <li>Use this page before a trial to confirm that the hardware is responding correctly.</li>
                            <li><strong>Reset Lever Baseline</strong> and <strong>Reset Nose Poke Baseline</strong> only reset the page’s “since baseline” counters.</li>
                            <li><strong>Manual Run Pump</strong> is for a one-time live check and does not change the saved trial default.</li>
                            <li><strong>Pump Calibration</strong> is the saved default pulse used for water rewards during trials.</li>
                            <li><strong>Lever Debounce</strong> and <strong>Require Lever Release</strong> help prevent false or repeated lever counts.</li>
                        </ul>
                    </article>

                    <article className="help-card">
                        <h2>Run a Trial</h2>
                        <ul className="help-list">
                            <li>Use a clear <strong>Test Name</strong> so the run is easy to find later in Results.</li>
                            <li><strong>Subject ID</strong> is optional and can be left blank when subject tracking is not needed.</li>
                            <li><strong>Responses Needed For Each Reward</strong> controls each reward cycle.</li>
                            <li><strong>Total Valid Responses Before Finish</strong> controls when the overall session can end.</li>
                            <li>During a run, the backend controls timing, counts, rewards, and stop conditions.</li>
                        </ul>
                    </article>

                    <article className="help-card">
                        <h2>Optional Camera</h2>
                        <ul className="help-list">
                            <li>The camera feature only appears on boxes with a supported USB camera attached.</li>
                            <li>The preview uses still images instead of full video to keep network traffic lower.</li>
                            <li>When available, one small snapshot can be attached to the saved result near the end of the run.</li>
                            <li>If no camera is attached, trials still run normally and no camera controls are shown.</li>
                        </ul>
                    </article>

                    <article className="help-card">
                        <h2>Results</h2>
                        <ul className="help-list">
                            <li>Open one saved trial to review counts, timing, notes, and the event timeline.</li>
                            <li>Use <strong>Download Data</strong> for summary CSV export.</li>
                            <li>Use <strong>Download Timeline</strong> when event timeline data is available.</li>
                            <li>Use <strong>Show Timeline Trends</strong> to see cumulative response and reward patterns over time.</li>
                            <li>If a trial includes an attached snapshot, it appears in the detail panel.</li>
                        </ul>
                    </article>

                    <article className="help-card">
                        <h2>Administrator Help</h2>
                        <ul className="help-list">
                            <li>Only administrators can approve users, reset passwords, disable users, delete non-admin users, and delete saved trial results.</li>
                            <li>Ask an administrator for help if your account is still pending or you cannot sign in.</li>
                            <li>Ask an administrator if saved trial cleanup is needed.</li>
                        </ul>
                    </article>
                </div>
            </section>
        </div>
    );
}

export default Help;
