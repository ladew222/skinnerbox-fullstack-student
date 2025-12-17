import React, { useState, useEffect } from "react";
import "./ResultsList.css";

const ResultsList = () => {
  const [selectedTest, setSelectedTest] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [testData, setTestData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch("/api/results"); // Update this URL based on your backend setup
        if (!response.ok) {
          throw new Error("Failed to fetch results");
        }
        const data = await response.json();
        setTestData(data);
      } catch (error) {
        setErrorMessage("Unable to fetch results. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, []);

  const filteredTests = testData.filter((test) =>
    test.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownload = () => {
    setErrorMessage("Unable to connect to the database. Please try again later.");
    setTimeout(() => setErrorMessage(""), 3000);
  };

  return (
    <div className="results-container">
      <div className="test-list">
        <h2>Available Trials</h2>
        <input
          type="text"
          placeholder="Search tests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-bar"
        />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {filteredTests.map((test) => (
              <li key={test.id} onClick={() => setSelectedTest(test)} className="test-item">
                {test.name}
              </li>
            ))}
          </ul>
        )}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>

      {selectedTest && (
        <div className="test-details">
          <button className="close-button" onClick={() => setSelectedTest(null)}>X</button>
          <h2>{selectedTest.name} Summary</h2>
          <div className="test-summary">
            <p><strong>Status:</strong> {selectedTest.complete ? "Complete" : "Incomplete"}</p>
            <p><strong>Presses Needed:</strong> {selectedTest.pressesNeeded}</p>
            <p><strong>Total Presses:</strong> {selectedTest.totalPresses}</p>
            <p><strong>Duration:</strong> {selectedTest.duration}</p>
            <p><strong>Successful Attempts:</strong> {selectedTest.successfulAttempts}</p>
            <p><strong>Unsuccessful Attempts:</strong> {selectedTest.unsuccessfulAttempts}</p>
          </div>
          <button className="download-button" onClick={handleDownload}>Download Data</button>
        </div>
      )}
    </div>
  );
};

export default ResultsList;
