import React, { useState, useEffect } from "react";
import "./ResultsList.css";
import { getResults } from "../../utilities/api";
import { buildStimulusSummary, buildTraditionalCsv, formatSecondsForDisplay } from "../../utilities/resultsCsv";

const ResultsList = () => {
  const [selectedTest, setSelectedTest] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [testData, setTestData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const data = await getResults();
        setTestData(Array.isArray(data) ? data : []);
      } catch (error) {
        setErrorMessage(error?.message || "Unable to fetch results. Please try again later.");
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
    if (!selectedTest) {
      return;
    }

    const blob = new Blob([buildTraditionalCsv({
      exportedAt: new Date().toISOString(),
      testName: selectedTest.name,
      subjectId: selectedTest.subjectId ?? "",
      status: selectedTest.status,
      complete: selectedTest.complete,
      preset: "",
      configuredDurationMinutes: selectedTest.configuredDurationMinutes,
      configuredDurationSeconds: selectedTest.configuredDurationSeconds,
      elapsedTimeSeconds: selectedTest.elapsedTimeSeconds,
      remainingTimeSeconds: selectedTest.remainingTimeSeconds,
      goalForTrial: selectedTest.goalForTrial,
      goalForTest: selectedTest.goalForTest,
      rewardDelaySeconds: selectedTest.rewardDelaySeconds,
      stimulusDurationSeconds: selectedTest.stimulusDurationSeconds,
      cooldownSeconds: selectedTest.cooldownSeconds,
      rewardType: selectedTest.rewardType,
      interactionType: selectedTest.interactionType,
      stimulusType: selectedTest.stimulusType,
      stimulusDescription: selectedTest.stimulusDescription,
      lightColor: selectedTest.lightColor,
      endChimeEnabled: selectedTest.endChimeEnabled,
      endChimePattern: selectedTest.endChimePattern,
      leverPressCount: selectedTest.leverPressCount,
      nosePokeCount: selectedTest.nosePokeCount,
      totalInteractions: selectedTest.totalPresses,
      rewardCount: selectedTest.rewardCount,
      createdAt: selectedTest.createdAt ?? "",
      updatedAt: selectedTest.updatedAt ?? "",
    })], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTest.name.replace(/\s+/g, "_")}_saved_result.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
            <p><strong>Status:</strong> {selectedTest.complete ? "Complete" : selectedTest.status}</p>
            <p><strong>Goal For Trial:</strong> {selectedTest.goalForTrial}</p>
            <p><strong>Goal For Test:</strong> {selectedTest.goalForTest}</p>
            <p><strong>Lever Presses:</strong> {selectedTest.leverPressCount}</p>
            <p><strong>Nose Pokes:</strong> {selectedTest.nosePokeCount}</p>
            <p><strong>Total Interactions:</strong> {selectedTest.totalPresses}</p>
            <p><strong>Rewards Given:</strong> {selectedTest.rewardCount}</p>
            <p><strong>Configured Duration:</strong> {formatSecondsForDisplay(selectedTest.configuredDurationSeconds)}</p>
            <p><strong>Elapsed Time:</strong> {formatSecondsForDisplay(selectedTest.elapsedTimeSeconds)}</p>
            <p><strong>Time Remaining:</strong> {formatSecondsForDisplay(selectedTest.remainingTimeSeconds)}</p>
            <p><strong>Reward Type:</strong> {selectedTest.rewardType}</p>
            <p><strong>Stimulus:</strong> {selectedTest.stimulusDescription || buildStimulusSummary(selectedTest.stimulusType, selectedTest.lightColor)}</p>
            <p><strong>Interaction Type:</strong> {selectedTest.interactionType}</p>
            <p><strong>End Chime:</strong> {selectedTest.endChimeEnabled ? 'Enabled' : 'Disabled'}</p>
            {selectedTest.endChimeEnabled && (
              <p><strong>End Chime Pattern:</strong> {selectedTest.endChimePattern}</p>
            )}
          </div>
          <button className="download-button" onClick={handleDownload}>Download Data</button>
        </div>
      )}
    </div>
  );
};

export default ResultsList;
